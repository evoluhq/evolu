/**
 * Node.js utilities for testing production bundles.
 *
 * These utilities use the dedicated `@evolu/nodejs/TestBundle` entry point so
 * normal `@evolu/nodejs` imports do not evaluate the test toolchain, while
 * bundle tests do not evaluate unrelated Evolu Node.js adapters.
 *
 * The {@link testBundle} function loads its optional Webpack and Vite peer
 * dependencies only when called.
 *
 * @module
 */

import {
  assert,
  assertType,
  concurrently,
  instanceOf,
  createRun,
  durationToMillis,
  escapeRegExp,
  filterArray,
  isErr,
  mapArray,
  mapSettled,
  type NonEmptyReadonlyArray,
  type PositiveDuration,
  type ReadonlyRecord,
  type Result,
  safelyStringifyUnknownValue,
  String as StringType,
  type Task,
  timeout,
  TimeoutError,
  tryAsync,
} from "@evolu/common";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from "node:worker_threads";
import { gzipSync } from "node:zlib";
import { availableParallelism } from "./Platform.ts";

/** The input shared by every test bundler adapter. */
interface TestBundlerOptions {
  /** The original JavaScript or TypeScript fixture. */
  readonly entryPath: string;
  /** A temporary directory owned by the current bundler invocation. */
  readonly outputDirectory: string;
  /** Exact package import aliases shared across bundlers. */
  readonly aliases: ReadonlyRecord<string, string>;
}

/** The production code emitted by a test bundler adapter. */
interface TestBundlerOutput {
  readonly code: string;
  readonly version: string;
}

/** A production bundler adapter used by {@link testBundle}. */
interface TestBundler {
  readonly name: string;
  readonly bundle: (options: TestBundlerOptions) => Promise<TestBundlerOutput>;
}

/** A failure correlated with the bundler that produced it. */
interface TestBundlerFailure {
  readonly caseName: string;
  readonly bundler: string;
  readonly error: unknown;
}

/** The measured sizes of one bundle. */
export interface TestBundleSize {
  readonly rawSizeInBytes: number;
  readonly gzipSizeInBytes: number;
}

/** Bundle sizes keyed by bundler name and version. */
export type TestBundleCaseResult = ReadonlyRecord<string, TestBundleSize>;

/** Case results keyed by case name for size snapshots. */
export type TestBundleResult = ReadonlyRecord<string, TestBundleCaseResult>;

/** The measured output supplied to {@link TestBundleCase.verify}. */
export interface TestBundle extends TestBundleSize {
  /** The bundler name and version, for example `"vite@8.1.5"`. */
  readonly bundler: string;
  readonly code: string;
  /** The copied artifact, or `null` when no output directory was requested. */
  readonly outputPath: string | null;
}

/** One named bundle test case. */
export interface TestBundleCase {
  /**
   * A JavaScript or erasable-TypeScript entry.
   *
   * TypeScript dependencies are supported. TSX and TypeScript syntax that
   * requires JavaScript generation are not supported by Webpack.
   */
  readonly entryPath: string;
  /** Verifies the default export returned by each emitted bundle. */
  readonly verify: (value: unknown, bundle: TestBundle) => void | Promise<void>;
}

/** Options for producing and verifying equivalent bundles. */
export interface TestBundleOptions {
  /** Named cases bundled with every supported bundler. */
  readonly cases: ReadonlyRecord<string, TestBundleCase>;
  /**
   * Package aliases resolved for every case and bundler. Targets must be
   * absolute paths to modules using JavaScript syntax.
   */
  readonly aliases?: ReadonlyRecord<string, string>;
  /**
   * Copies emitted bundles into this directory for later inspection. Relative
   * paths are resolved from the current working directory.
   */
  readonly outputDirectory?: string;
  /** Maximum duration for producing each bundle. Defaults to `"30s"`. */
  readonly bundlingTimeout?: PositiveDuration;
  /** Maximum duration for executing each emitted bundle. Defaults to `"5s"`. */
  readonly timeout?: PositiveDuration;
}

interface TestBundleJobOutput {
  readonly caseName: string;
  readonly bundle: TestBundle;
}

/**
 * Bundles, executes, measures, and verifies named cases with every supported
 * bundler.
 *
 * The fixture must default-export either a value, a promise, or a function that
 * returns one. The resolved value must be structured-cloneable so it can cross
 * the worker boundary. All asynchronous work started by the fixture must be
 * awaited by that returned promise; detached work scheduled after it settles is
 * outside the execution contract. Verification runs outside the measured
 * bundle. Each emitted bundle runs in an isolated worker so evaluation errors,
 * rejected promises, uncaught errors and unhandled rejections observed before
 * completion, and timeouts fail the test without affecting the test process.
 * Cases and bundlers form one flattened job list that runs concurrently,
 * bounded by the CPU parallelism available to the process. If multiple jobs
 * fail, all failures are reported together with their case and bundler names.
 * The returned record contains only raw and gzip byte counts grouped by case
 * and versioned bundler name, so it can be compared directly with an inline
 * snapshot.
 *
 * ### Example
 *
 * ```ts
 * import assert from "node:assert/strict";
 * import { fileURLToPath } from "node:url";
 * import { testBundle } from "@evolu/nodejs/TestBundle";
 *
 * const result = await testBundle({
 *   cases: {
 *     example: {
 *       entryPath: fileURLToPath(
 *         new URL("./bundle-fixture.ts", import.meta.url),
 *       ),
 *       verify: (value) => {
 *         assert.deepStrictEqual(value, { answer: 42 });
 *       },
 *     },
 *   },
 * });
 * ```
 */
export const testBundle = async ({
  cases,
  aliases = {},
  outputDirectory,
  bundlingTimeout = "30s",
  timeout: executionTimeout = "5s",
}: TestBundleOptions): Promise<TestBundleResult> => {
  const caseEntries = Object.entries(cases);
  assert(caseEntries.length > 0, "Bundle tests require at least one case.");

  for (const [name, path] of Object.entries(aliases)) {
    assert(
      isAbsolute(path),
      `Bundle alias "${name}" target must be an absolute path.`,
    );
  }

  await using disposer = new AsyncDisposableStack();
  const temporaryDirectory = disposer.adopt(
    await mkdtemp(join(tmpdir(), "evolu-bundle-")),
    async (temporaryDirectory) => {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  );

  const jobs = caseEntries.flatMap(([caseName, testCase]) =>
    testBundlers.map((bundler) => ({ caseName, testCase, bundler })),
  );
  await using run = createRun();

  const results = await run.ok(
    concurrently(
      availableParallelism(),
      mapSettled(
        jobs,
        ({ caseName, testCase, bundler }, jobIndex) =>
          async (run) =>
            tryAsync(
              async () => {
                const sourceEntryPath = resolve(testCase.entryPath);
                const bundlerDirectory = join(
                  temporaryDirectory,
                  `${jobIndex}-${bundler.name}`,
                );
                await mkdir(bundlerDirectory, { recursive: true });

                const bundlingResult = await run(
                  timeout(
                    runTestBundler(bundler.name, {
                      entryPath: sourceEntryPath,
                      outputDirectory: bundlerDirectory,
                      aliases,
                    }),
                    bundlingTimeout,
                  ),
                );
                if (!bundlingResult.ok) {
                  if (TimeoutError.is(bundlingResult.error)) {
                    throw new Error(
                      `Bundle production timed out after ${durationToMillis(bundlingTimeout)} ms.`,
                    );
                  }
                  throw bundlingResult.error;
                }

                const output = bundlingResult.value;
                const executablePath = join(bundlerDirectory, "bundle.mjs");
                await writeFile(executablePath, output.code);

                let persistedOutputPath: string | null = null;
                if (outputDirectory) {
                  persistedOutputPath = join(
                    outputDirectory,
                    `${encodeURIComponent(caseName)}.${bundler.name}.mjs`,
                  );
                  await mkdir(outputDirectory, { recursive: true });
                  await writeFile(persistedOutputPath, output.code);
                }

                const bundle: TestBundle = {
                  bundler: `${bundler.name}@${output.version}`,
                  code: output.code,
                  outputPath: persistedOutputPath,
                  rawSizeInBytes: Buffer.byteLength(output.code),
                  gzipSizeInBytes: gzipSync(output.code, { level: 9 })
                    .byteLength,
                };
                const executionResult = await run(
                  timeout(runTestBundle(executablePath), executionTimeout),
                );
                if (!executionResult.ok) {
                  if (TimeoutError.is(executionResult.error)) {
                    throw new Error(
                      `Bundle execution timed out after ${durationToMillis(executionTimeout)} ms.`,
                    );
                  }
                  throw executionResult.error;
                }

                await testCase.verify(executionResult.value, bundle);
                return { caseName, bundle } satisfies TestBundleJobOutput;
              },
              (error) => {
                run.signal.throwIfAborted();
                return {
                  caseName,
                  bundler: bundler.name,
                  error,
                } satisfies TestBundlerFailure;
              },
            ),
      ),
    ),
  );

  const failures = filterArray(results, isErr);
  if (failures.length > 0) {
    const errors = mapArray(
      failures,
      ({ error: { caseName, bundler, error } }) => {
        const message =
          error instanceof Error
            ? error.message
            : safelyStringifyUnknownValue(error);
        return Object.assign(
          new Error(`${caseName} / ${bundler}: ${message}`, { cause: error }),
          { caseName, bundler },
        );
      },
    );
    throw new AggregateError(
      errors,
      [
        "Bundle tests failed.",
        ...mapArray(errors, (error) => `- ${error.message}`),
      ].join("\n"),
    );
  }

  const bundleEntriesByCase = new Map<
    string,
    Array<readonly [string, TestBundleSize]>
  >();
  for (const [caseName] of caseEntries) bundleEntriesByCase.set(caseName, []);

  for (const result of results) {
    assert(result.ok, "Expected every bundle test to succeed.");
    const { caseName, bundle } = result.value;
    const entries = bundleEntriesByCase.get(caseName);
    assert(entries, `Missing bundle test case "${caseName}".`);
    entries.push([
      bundle.bundler,
      {
        rawSizeInBytes: bundle.rawSizeInBytes,
        gzipSizeInBytes: bundle.gzipSizeInBytes,
      },
    ]);
  }

  return Object.fromEntries(
    Array.from(bundleEntriesByCase, ([caseName, entries]) => [
      caseName,
      Object.fromEntries(entries),
    ]),
  );
};

/** A Webpack production adapter for {@link testBundle}. */
const testWebpackBundler: TestBundler = {
  name: "webpack",
  bundle: async ({ entryPath, outputDirectory, aliases }) => {
    const { default: webpack } = await import("webpack");
    const filename = "webpack.js";
    await using disposer = new AsyncDisposableStack();
    const compiler = disposer.adopt(
      webpack({
        mode: "production",
        target: ["web", "es2020"],
        entry: entryPath,
        experiments: { outputModule: true, typescript: true },
        output: {
          path: outputDirectory,
          filename,
          module: true,
          library: { type: "module" },
        },
        resolve: {
          alias: Object.fromEntries(
            Object.entries(aliases).map(([name, path]) => [`${name}$`, path]),
          ),
        },
        optimization: {
          usedExports: true,
          sideEffects: true,
          minimize: true,
        },
        stats: "errors-only",
      }),
      async (compiler) => {
        await promisify(compiler.close.bind(compiler))();
      },
    );

    const stats = await promisify(compiler.run.bind(compiler))();

    if (stats?.hasErrors()) throw new Error(stats.toString("errors-only"));

    return {
      code: await readFile(join(outputDirectory, filename), "utf8"),
      version: webpack.version,
    };
  },
};

/** A Vite production adapter for {@link testBundle}. */
const testViteBundler: TestBundler = {
  name: "vite",
  bundle: async ({ entryPath, aliases }) => {
    const vite = await import("vite");
    const output = await vite.build({
      root: dirname(entryPath),
      configFile: false,
      envFile: false,
      logLevel: "silent",
      resolve: {
        alias: Object.entries(aliases).map(([name, replacement]) => ({
          find: new RegExp(`^${escapeRegExp(name)}$`),
          replacement,
        })),
      },
      build: {
        write: false,
        minify: true,
        target: "es2020",
        lib: {
          entry: entryPath,
          formats: ["es"],
          fileName: () => "vite.js",
        },
        rolldownOptions: {
          cwd: dirname(entryPath),
          output: { codeSplitting: false, comments: false, minify: true },
        },
      },
    });

    type ViteOutput = Extract<
      Awaited<ReturnType<typeof vite.build>>,
      { readonly output: unknown }
    >;
    assert(Array.isArray(output), "Vite did not return build outputs.");
    const outputs: ReadonlyArray<ViteOutput> = output;
    assert(outputs.length === 1, "Vite did not return one build output.");
    const viteOutput = outputs[0];
    assert(viteOutput, "Vite did not return a build output.");
    assert(
      viteOutput.output.length === 1,
      "Vite did not emit one JavaScript chunk.",
    );
    const chunk = viteOutput.output[0];
    assert(chunk, "Vite did not emit a JavaScript chunk.");
    assertType(StringType, chunk.code);

    return {
      code: chunk.code,
      version: vite.version,
    };
  },
};

const testBundlers: NonEmptyReadonlyArray<TestBundler> = [
  testWebpackBundler,
  testViteBundler,
];

type TestBundlerWorkerMessage = Result<
  TestBundlerOutput,
  TestBundleWorkerError
>;

interface TestBundlerWorkerData {
  readonly type: typeof testBundlerWorkerType;
  readonly bundlerName: string;
  readonly options: TestBundlerOptions;
}

const testBundlerWorkerType = "evolu.test-bundler";

const isTestBundlerWorkerData = (
  value: unknown,
): value is TestBundlerWorkerData =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  value.type === testBundlerWorkerType;

const runTestBundlerWorker = async ({
  bundlerName,
  options,
}: TestBundlerWorkerData): Promise<void> => {
  try {
    const bundler = testBundlers.find(({ name }) => name === bundlerName);
    assert(bundler, `Unknown test bundler "${bundlerName}".`);
    const value = await bundler.bundle(options);
    parentPort?.postMessage({
      ok: true,
      value,
    } satisfies TestBundlerWorkerMessage);
  } catch (error) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    parentPort?.postMessage({
      ok: false,
      error: {
        name: normalized.name,
        message: normalized.message,
        stack: normalized.stack ?? `${normalized.name}: ${normalized.message}`,
      },
    } satisfies TestBundlerWorkerMessage);
  }
};

if (!isMainThread && isTestBundlerWorkerData(workerData)) {
  void runTestBundlerWorker(workerData);
}

const runTestBundler =
  (
    bundlerName: string,
    options: TestBundlerOptions,
  ): Task<TestBundlerOutput, Error> =>
  async (run) =>
    tryAsync(
      async () => {
        await using worker = new Worker(new URL(import.meta.url), {
          execArgv: process.execArgv.filter(
            (argument, index, execArgv) =>
              argument !== "--input-type" &&
              argument !== "--eval" &&
              argument !== "-e" &&
              argument !== "--print" &&
              argument !== "-p" &&
              !argument.startsWith("--input-type=") &&
              !argument.startsWith("--eval=") &&
              !argument.startsWith("--print=") &&
              !["--input-type", "--eval", "-e", "--print", "-p"].includes(
                execArgv[index - 1] ?? "",
              ),
          ),
          workerData: {
            type: testBundlerWorkerType,
            bundlerName,
            options,
          } satisfies TestBundlerWorkerData,
        });
        using _ = run.onAbort(() => {
          void worker.terminate();
        });

        return await new Promise<TestBundlerOutput>((resolve, reject) => {
          worker.once("message", (message: TestBundlerWorkerMessage) => {
            if (message.ok) {
              resolve(message.value);
              return;
            }
            reject(testBundleWorkerErrorToError(message.error));
          });
          worker.once("error", (error) => {
            assertType(ErrorType, error);
            reject(error);
          });
          worker.once("exit", (code) => {
            reject(
              new Error(
                `Test bundler worker exited with code ${code} before returning a value.`,
              ),
            );
          });
        });
      },
      (error) => {
        run.signal.throwIfAborted();
        assertType(ErrorType, error);
        return error;
      },
    );

type TestBundleWorkerMessage = Result<unknown, TestBundleWorkerError>;

interface TestBundleWorkerError {
  readonly name: string;
  readonly message: string;
  readonly stack: string;
}

const ErrorType = /*#__PURE__*/ instanceOf(globalThis.Error);

// TODO: Replace the evaluated CommonJS worker with an ESM module worker.
const testBundleWorkerSource = String.raw`
const { parentPort, workerData } = require("node:worker_threads");

let completed = false;

const fail = (error) => {
  if (completed) return;
  completed = true;
  const normalized = error instanceof Error ? error : new Error(String(error));
  parentPort.postMessage({
    ok: false,
    error: {
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack ?? normalized.name + ": " + normalized.message,
    },
  });
};

process.on("unhandledRejection", fail);

(async () => {
  const module = await import(workerData);
  if (!("default" in module)) {
    throw new Error("A bundle test fixture must have a default export.");
  }

  const exported = module.default;
  const value = await (typeof exported === "function" ? exported() : exported);

  // Give unhandledRejection one event-loop turn to report detached rejections.
  await new Promise((resolve) => setImmediate(resolve));
  if (completed) return;
  // Keep completed false until cloning succeeds so DataCloneError reaches fail.
  parentPort.postMessage({ ok: true, value });
  completed = true;
})().catch(fail);
`;

const testBundleWorkerErrorToError = (
  workerError: TestBundleWorkerError,
): Error => {
  const error = new Error(workerError.message);
  error.name = workerError.name;
  error.stack = workerError.stack;
  return error;
};

const runTestBundle =
  (bundlePath: string): Task<unknown, Error> =>
  async (run) =>
    tryAsync(
      async () => {
        await using worker = new Worker(testBundleWorkerSource, {
          eval: true,
          workerData: pathToFileURL(bundlePath).href,
        });
        using _ = run.onAbort(() => {
          void worker.terminate();
        });

        return await new Promise<unknown>((resolve, reject) => {
          worker.once("message", (workerMessage: TestBundleWorkerMessage) => {
            if (workerMessage.ok) {
              resolve(workerMessage.value);
              return;
            }
            reject(testBundleWorkerErrorToError(workerMessage.error));
          });
          worker.once("error", (error) => {
            assertType(ErrorType, error);
            reject(error);
          });
          worker.once("exit", (code) => {
            reject(
              new Error(
                `Bundle worker exited with code ${code} before returning a value.`,
              ),
            );
          });
        });
      },
      (error) => {
        run.signal.throwIfAborted();
        assertType(ErrorType, error);
        return error;
      },
    );
