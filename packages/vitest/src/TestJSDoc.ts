/**
 * Vitest utilities for testing TypeScript examples embedded in JSDoc and
 * Markdown.
 *
 * These utilities use the dedicated `@evolu/vitest/TestJSDoc` entry point so
 * normal `@evolu/vitest` imports do not evaluate Node.js test tooling.
 *
 * @module
 */

import {
  concurrently,
  createRun,
  filterArray,
  isErr,
  mapArray,
  mapSettled,
  PositiveInt,
  type ReadonlyRecord,
  safelyStringifyUnknownValue,
  tryAsync,
} from "@evolu/common";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { findPackageJSON } from "node:module";
import { availableParallelism } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** Options for compiling and executing TypeScript documentation examples. */
export interface TestJSDocExamplesOptions {
  /** Source files or glob patterns resolved from `cwd`. */
  readonly include: string | ReadonlyArray<string>;
  /** Package imports redirected to absolute TypeScript entry paths. */
  readonly aliases?: ReadonlyRecord<string, string>;
  /** Directory used for globbing and package resolution. */
  readonly cwd?: string;
  /** TypeScript compiler package. Defaults to `"typescript"`. */
  readonly typescriptPackage?: string;
}

interface JSDocExample {
  readonly filePath: string;
  readonly line: number;
  readonly source: string;
}

interface GeneratedJSDocExample extends JSDocExample {
  readonly generatedPath: string;
}

interface JSDocExampleFailure {
  readonly error: unknown;
  readonly example: GeneratedJSDocExample;
}

interface TypeScriptPackage {
  readonly bin: string | { readonly tsc?: string };
}

const jsdocPattern = /\/\*\*[\s\S]*?\*\//g;
const fencePattern = /(?:```|~~~)([^\n]*)\n([\s\S]*?)(?:(```|~~~)|$)/g;
const markdownFilePattern = /\.mdx?$/i;
const packageNamePattern = /^(?:@[a-z\d][a-z\d._~-]*\/)?[a-z\d][a-z\d._~-]*$/i;
const packageSubpathSegmentPattern = /^[a-z\d][a-z\d._~-]*$/i;

/**
 * Compiles and executes every TypeScript example in the included JSDoc comments
 * and Markdown files.
 *
 * Examples are compiled together as isolated TypeScript modules. Examples
 * without compilation errors are then run concurrently, bounded by the CPU
 * parallelism available to the process. Compilation and execution failures are
 * reported together. Vitest's `assert`, `expect`, and `expectTypeOf`, along with
 * Evolu's `expectOk` and `expectErr`, are injected into each module.
 *
 * Package aliases are useful for examples documenting an entry point that is
 * not exported yet. Package subpaths can be aliased independently. Each alias
 * target must be an absolute TypeScript module path exposing the named exports
 * used by the example.
 *
 * ### Example
 *
 * ```ts
 * import { testJSDocExamples } from "@evolu/vitest/TestJSDoc";
 *
 * await testJSDocExamples({
 *   include: ["packages/common/src/*.ts", "docs/*.md"],
 * });
 * ```
 */
export const testJSDocExamples = async ({
  include,
  aliases = {},
  cwd = process.cwd(),
  typescriptPackage = "typescript",
}: TestJSDocExamplesOptions): Promise<void> => {
  const workingDirectory = realpathSync(resolve(cwd));
  const patterns = typeof include === "string" ? [include] : include;
  assert(
    patterns.length > 0,
    "Documentation example tests require included files.",
  );

  const filePaths = Array.from(
    new Set(
      globSync(patterns, { cwd: workingDirectory }).map((filePath) =>
        resolve(workingDirectory, filePath),
      ),
    ),
  ).sort();
  assert(
    filePaths.length > 0,
    "No files matched the documentation example patterns.",
  );

  const examples = filePaths.flatMap((filePath) =>
    extractDocumentationExamples(readFileSync(filePath, "utf8"), filePath),
  );
  assert(
    examples.length > 0,
    "No TypeScript documentation examples were found.",
  );

  const compilerPath = resolveTypeScriptCompiler(
    workingDirectory,
    typescriptPackage,
  );
  const temporaryRoot = join(workingDirectory, "tmp");
  mkdirSync(temporaryRoot, { recursive: true });

  const temporaryDirectory = mkdtempSync(join(temporaryRoot, "evolu-jsdoc-"));

  try {
    writeFileSync(
      join(temporaryDirectory, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    createPackageAliases(temporaryDirectory, aliases);

    const generatedExamples = examples.map((example, index) => {
      const generatedPath = join(temporaryDirectory, `example-${index}.ts`);
      writeFileSync(generatedPath, transformJSDocExample(example));
      return { ...example, generatedPath } satisfies GeneratedJSDocExample;
    });
    const compilerConfigPath = join(temporaryDirectory, "tsconfig.json");
    writeFileSync(
      compilerConfigPath,
      JSON.stringify({
        compilerOptions: {
          allowImportingTsExtensions: true,
          erasableSyntaxOnly: true,
          esModuleInterop: true,
          exactOptionalPropertyTypes: true,
          lib: ["DOM", "ESNext"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
          types: ["node"],
          verbatimModuleSyntax: true,
        },
        files: generatedExamples.map(({ generatedPath }) => generatedPath),
      }),
    );

    let compilationError: Error | undefined;
    try {
      await runProcess(
        process.execPath,
        [compilerPath, "--project", compilerConfigPath],
        workingDirectory,
        "Documentation example TypeScript compilation",
        [
          "Generated example sources:",
          ...generatedExamples.map(
            ({ filePath, generatedPath, line }) =>
              `- ${relative(temporaryDirectory, generatedPath)}: ${relative(workingDirectory, filePath)}:${line}`,
          ),
        ].join("\n"),
      );
    } catch (error) {
      compilationError =
        error instanceof Error
          ? error
          : new Error(safelyStringifyUnknownValue(error));
    }

    const runnableExamples =
      compilationError === undefined
        ? generatedExamples
        : getExamplesWithoutCompilationErrors(
            generatedExamples,
            compilationError,
            workingDirectory,
          );

    let executionError: Error | undefined;
    try {
      await runJSDocExamples(runnableExamples, workingDirectory);
    } catch (error) {
      executionError =
        error instanceof Error
          ? error
          : new Error(safelyStringifyUnknownValue(error));
    }

    if (compilationError !== undefined && executionError !== undefined) {
      const executionErrors: ReadonlyArray<unknown> =
        executionError instanceof AggregateError
          ? (executionError.errors as ReadonlyArray<unknown>)
          : [executionError];
      throw new AggregateError(
        [compilationError, ...executionErrors],
        `${compilationError.message}\n${executionError.message}`,
      );
    }
    if (compilationError !== undefined) throw compilationError;
    if (executionError !== undefined) throw executionError;
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
};

const getExamplesWithoutCompilationErrors = (
  examples: ReadonlyArray<GeneratedJSDocExample>,
  compilationError: Error,
  workingDirectory: string,
): ReadonlyArray<GeneratedJSDocExample> => {
  const examplesWithErrors = examples.filter(({ generatedPath }) =>
    [generatedPath, relative(workingDirectory, generatedPath)].some((path) =>
      [`${path}(`, `${path}:`].some((segment) =>
        compilationError.message.includes(segment),
      ),
    ),
  );

  if (examplesWithErrors.length === 0) return [];

  return examples.filter((example) => !examplesWithErrors.includes(example));
};

const extractDocumentationExamples = (
  source: string,
  filePath: string,
): ReadonlyArray<JSDocExample> => {
  if (markdownFilePattern.test(filePath)) {
    return extractFencedExamples(source, source, filePath, 0, false);
  }

  const examples: Array<JSDocExample> = [];
  for (const jsdoc of source.matchAll(jsdocPattern)) {
    examples.push(
      ...extractFencedExamples(source, jsdoc[0], filePath, jsdoc.index, true),
    );
  }

  return examples;
};

const extractFencedExamples = (
  source: string,
  fencedSource: string,
  filePath: string,
  offset: number,
  stripJSDocPrefixes: boolean,
): ReadonlyArray<JSDocExample> => {
  const examples: Array<JSDocExample> = [];

  for (const fence of fencedSource.matchAll(fencePattern)) {
    const metadata = fence[1].trim().toLowerCase().split(/\s+/);
    if (!["ts", "typescript"].includes(metadata[0])) {
      continue;
    }

    const line = getLineNumber(source, offset + fence.index);
    const closingFence = fence[3] as string | undefined;
    assert(
      closingFence !== undefined,
      `${filePath}:${line} has an unclosed TypeScript example fence.`,
    );
    const exampleSource = (
      stripJSDocPrefixes ? fence[2].replace(/^[ \t]*\* ?/gm, "") : fence[2]
    ).trim();
    assert(
      exampleSource.length > 0,
      `${filePath}:${line} has an empty TypeScript example.`,
    );
    examples.push({ filePath, line, source: exampleSource });
  }

  return examples;
};

const getLineNumber = (source: string, offset: number): number => {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (source.charCodeAt(index) === 10) line++;
  }
  return line;
};

const transformJSDocExample = (example: JSDocExample): string =>
  [
    'import { expectErr, expectOk } from "@evolu/vitest";',
    'import { assert, expect, expectTypeOf } from "vitest";',
    example.source,
  ].join("\n\n");

const resolveTypeScriptCompiler = (
  workingDirectory: string,
  typescriptPackage: string,
): string => {
  const packagePath = findPackageJSON(
    typescriptPackage,
    pathToFileURL(join(workingDirectory, "package.json")),
  );
  assert(
    packagePath !== undefined,
    `Cannot resolve ${typescriptPackage} from ${workingDirectory}.`,
  );
  const packageJson = JSON.parse(
    readFileSync(packagePath, "utf8"),
  ) as TypeScriptPackage;
  const compiler =
    typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin.tsc;
  assert(
    compiler !== undefined,
    `${typescriptPackage} does not expose a tsc executable.`,
  );
  return resolve(dirname(packagePath), compiler);
};

const runJSDocExamples = async (
  examples: ReadonlyArray<GeneratedJSDocExample>,
  workingDirectory: string,
): Promise<void> => {
  await using run = createRun();
  const results = await run.ok(
    concurrently(
      PositiveInt.orThrow(availableParallelism()),
      mapSettled(
        examples,
        (example) => async (run) =>
          tryAsync(
            () =>
              runProcess(
                process.execPath,
                [example.generatedPath],
                workingDirectory,
                "Node.js execution",
              ),
            (error) => {
              run.signal.throwIfAborted();
              return { error, example } satisfies JSDocExampleFailure;
            },
          ),
      ),
    ),
  );

  const failures = filterArray(results, isErr);
  if (failures.length === 0) return;

  const errors = mapArray(
    failures,
    ({
      error: {
        error,
        example: { filePath, line },
      },
    }) => {
      const message =
        error instanceof Error
          ? error.message
          : safelyStringifyUnknownValue(error);
      return new Error(
        `${relative(workingDirectory, filePath)}:${line}: ${message}`,
        { cause: error },
      );
    },
  );
  throw new AggregateError(
    errors,
    [
      "JSDoc example execution failed.",
      ...mapArray(errors, (error) => `- ${error.message}`),
    ].join("\n"),
  );
};

const createPackageAliases = (
  temporaryDirectory: string,
  aliases: ReadonlyRecord<string, string>,
): void => {
  const aliasesByPackageName = new Map<
    string,
    Array<{
      readonly subpath: string;
      readonly targetPath: string;
    }>
  >();

  for (const [name, target] of Object.entries(aliases)) {
    assert(isAbsolute(target), `Package alias ${name} must be absolute.`);
    const segments = name.split("/");
    const packageSegmentCount = name.startsWith("@") ? 2 : 1;
    const packageName = segments.slice(0, packageSegmentCount).join("/");
    const subpathSegments = segments.slice(packageSegmentCount);
    assert(
      packageNamePattern.test(packageName) &&
        subpathSegments.every((segment) =>
          packageSubpathSegmentPattern.test(segment),
        ),
      `Invalid package alias: ${name}.`,
    );
    const subpath = subpathSegments.join("/");
    const packageAliases = aliasesByPackageName.get(packageName) ?? [];
    packageAliases.push({ subpath, targetPath: realpathSync(target) });
    aliasesByPackageName.set(packageName, packageAliases);
  }

  for (const [packageName, packageAliases] of aliasesByPackageName) {
    const packageSegments = packageName.split("/");
    const packageDirectory = join(
      temporaryDirectory,
      "node_modules",
      ...packageSegments,
    );
    mkdirSync(packageDirectory, { recursive: true });
    const exportsBySubpath: Record<
      string,
      { readonly types: string; readonly default: string }
    > = {};

    for (const { subpath, targetPath } of packageAliases) {
      const entryPathWithoutExtension = subpath || "index";
      const exportName = subpath ? `./${subpath}` : ".";
      exportsBySubpath[exportName] = {
        types: `./${entryPathWithoutExtension}.ts`,
        default: `./${entryPathWithoutExtension}.js`,
      };

      for (const extension of ["ts", "js"]) {
        const entryPath = join(
          packageDirectory,
          `${entryPathWithoutExtension}.${extension}`,
        );
        mkdirSync(dirname(entryPath), { recursive: true });
        writeFileSync(
          entryPath,
          `export * from ${JSON.stringify(pathToImportSpecifier(entryPath, targetPath))};\n`,
        );
      }
    }

    writeFileSync(
      join(packageDirectory, "package.json"),
      JSON.stringify({
        name: packageName,
        type: "module",
        exports: exportsBySubpath,
      }),
    );
  }
};

const pathToImportSpecifier = (from: string, to: string): string => {
  const path = relative(dirname(from), to).split(sep).join("/");
  return path.startsWith(".") ? path : `./${path}`;
};

const runProcess = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  operation: string,
  details?: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Array<Buffer> = [];
    const stderr: Array<Buffer> = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.once("error", (error) => {
      reject(
        new Error(
          [`${operation} failed.`, details].filter(Boolean).join("\n"),
          {
            cause: error,
          },
        ),
      );
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          [
            `${operation} failed${signal === null ? ` with exit code ${String(code)}` : ` from signal ${signal}`}.`,
            details,
            Buffer.concat(stdout).toString("utf8"),
            Buffer.concat(stderr).toString("utf8"),
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
