/**
 * Utilities for testing TypeScript examples embedded in JSDoc and Markdown.
 *
 * These utilities use the dedicated `@evolu/nodejs/TestJSDoc` entry point so
 * normal `@evolu/nodejs` imports do not evaluate TypeScript and JSDoc tooling.
 *
 * @module
 */

import { mapArray, type ReadonlyRecord } from "@evolu/common";
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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

/**
 * Options for linting, compiling, and executing TypeScript documentation
 * examples.
 */
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
  readonly sourceLine: number;
}

interface GeneratedJSDocExample extends JSDocExample {
  readonly generatedPath: string;
}

interface JSDocExampleRunnerResult {
  readonly failures: ReadonlyArray<{
    readonly index: number;
    readonly message: string;
  }>;
}

interface PackageWithBinary {
  readonly bin?: string | Readonly<Record<string, string>>;
}

interface OxlintOutput {
  readonly diagnostics: ReadonlyArray<{
    readonly code?: string;
    readonly filename: string;
    readonly help?: string;
    readonly labels: ReadonlyArray<{
      readonly span: {
        readonly line: number;
      };
    }>;
    readonly message: string;
  }>;
}

const jsdocPattern = /\/\*\*[\s\S]*?\*\//gu;
const fencePattern = /(?:```|~~~)([^\n]*)\n([\s\S]*?)(?:(```|~~~)|$)/gu;
const markdownFilePattern = /\.mdx?$/iu;
const packageNamePattern = /^(?:@[a-z\d][a-z\d._~-]*\/)?[a-z\d][a-z\d._~-]*$/iu;
const packageSubpathSegmentPattern = /^[a-z\d][a-z\d._~-]*$/iu;
const polyfillsPath = fileURLToPath(
  import.meta.resolve("@evolu/common/polyfills"),
);

/**
 * Lints, compiles, and executes every TypeScript example in the included JSDoc
 * comments and Markdown files.
 *
 * Examples are compiled together as isolated TypeScript modules. Examples
 * without compilation errors are then imported in source order by one Node.js
 * process. Lint, compilation, and execution failures are reported together.
 * Examples are linted with `@evolu/oxlint-config`. Evolu's required polyfills
 * are installed before each example runs.
 *
 * Install `@evolu/oxlint-config`, `@evolu/typescript-config`, `oxlint`,
 * `oxlint-tsgolint`, and TypeScript as development dependencies in the project
 * that calls this helper.
 *
 * Write every TypeScript fence as a standalone, deterministic example and
 * explicitly import its dependencies and assertions. Use `assertType` to prove
 * static contracts, `assertEqual` for Data comparisons, `assert` with a
 * descriptive message for invariants and narrowing, and `assertOk` or
 * `assertErr` for Results. Prefix intentionally unused declarations with `_`;
 * an underscore-prefixed declaration must remain unused. Package aliases are
 * useful for examples documenting an entry point that is not exported yet.
 * Package subpaths can be aliased independently. Each alias target must be an
 * absolute TypeScript module path exposing the named exports used by the
 * example.
 *
 * ### Example
 *
 * ```ts
 * import { testJSDocExamples } from "@evolu/nodejs/TestJSDoc";
 * import { mkdtemp, rm, writeFile } from "node:fs/promises";
 * import { tmpdir } from "node:os";
 * import { join } from "node:path";
 *
 * const directory = await mkdtemp(join(tmpdir(), "evolu-jsdoc-example-"));
 * try {
 *   const sourcePath = join(directory, "Example.ts");
 *   await writeFile(
 *     sourcePath,
 *     [
 *       "/**",
 *       " * ``" + "`ts",
 *       ' * import { assertEqual } from "@evolu/common";',
 *       " *",
 *       " * assertEqual(1 + 1, 2);",
 *       " * ``" + "`",
 *       " *" + "/",
 *       "export {};",
 *     ].join("\n"),
 *   );
 *   await testJSDocExamples({
 *     cwd: process.cwd(),
 *     include: sourcePath,
 *   });
 * } finally {
 *   await rm(directory, { force: true, recursive: true });
 * }
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
  ).toSorted();
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
  const typescriptConfigPath = resolve(
    dirname(resolvePackageJSON(workingDirectory, "@evolu/typescript-config")),
    "base.json",
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
      writeFileSync(
        generatedPath,
        transformJSDocExample(example, generatedPath),
      );
      return { ...example, generatedPath } satisfies GeneratedJSDocExample;
    });
    const compilerConfigPath = join(temporaryDirectory, "tsconfig.json");
    writeFileSync(
      compilerConfigPath,
      JSON.stringify({
        extends: typescriptConfigPath,
        compilerOptions: {
          allowImportingTsExtensions: true,
          composite: false,
          declaration: false,
          declarationMap: false,
          incremental: false,
          lib: ["dom", "esnext"],
          module: "NodeNext",
          noEmit: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
          target: "es2022",
          types: ["node"],
        },
        files: generatedExamples.map(({ generatedPath }) => generatedPath),
      }),
    );

    let lintError: Error | undefined;
    try {
      await lintJSDocExamples(
        generatedExamples,
        compilerConfigPath,
        workingDirectory,
      );
    } catch (error) {
      assert(error instanceof Error, "Expected Oxlint to fail with an Error.");
      lintError = error;
    }

    let compilationError: Error | undefined;
    try {
      await runProcess(
        process.execPath,
        [compilerPath, "--project", compilerConfigPath],
        workingDirectory,
        "Documentation example TypeScript compilation",
        {
          details: generatedExamplesToDetails(
            generatedExamples,
            temporaryDirectory,
            workingDirectory,
          ),
        },
      );
    } catch (error) {
      assert(
        error instanceof Error,
        "Expected TypeScript compilation to fail with an Error.",
      );
      compilationError = error;
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
      await runJSDocExamples(
        runnableExamples,
        temporaryDirectory,
        workingDirectory,
      );
    } catch (error) {
      assert(
        error instanceof Error,
        "Expected example execution to fail with an Error.",
      );
      executionError = error;
    }

    const failures: Array<Error> = [];
    if (lintError !== undefined) failures.push(lintError);
    if (compilationError !== undefined) failures.push(compilationError);
    if (executionError !== undefined) failures.push(executionError);

    const firstFailure = failures[0];
    if (failures.length === 1 && firstFailure !== undefined) {
      throw firstFailure;
    }
    if (failures.length > 1) {
      throw new AggregateError(
        failures.flatMap((failure) =>
          failure instanceof AggregateError
            ? (failure.errors as ReadonlyArray<unknown>)
            : [failure],
        ),
        mapArray(failures, ({ message }) => message).join("\n"),
      );
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
};

const lintJSDocExamples = async (
  examples: ReadonlyArray<GeneratedJSDocExample>,
  compilerConfigPath: string,
  workingDirectory: string,
): Promise<void> => {
  const oxlintPath = resolvePackageBinary(workingDirectory, "oxlint", "oxlint");
  const tsgolintPath = resolvePackageBinary(
    workingDirectory,
    "oxlint-tsgolint",
    "tsgolint",
  );
  const sharedOxlintConfigPath = resolve(
    dirname(resolvePackageJSON(workingDirectory, "@evolu/oxlint-config")),
    "config.jsonc",
  );
  const oxlintConfigPath = join(dirname(compilerConfigPath), "oxlint.json");
  writeFileSync(
    oxlintConfigPath,
    JSON.stringify({
      extends: [sharedOxlintConfigPath],
      overrides: [
        {
          files: ["**/*.{ts,tsx,mts}"],
          rules: {
            "eslint/no-unused-vars": [
              "error",
              {
                args: "all",
                argsIgnorePattern: "^_",
                caughtErrors: "all",
                caughtErrorsIgnorePattern: "^_",
                destructuredArrayIgnorePattern: "^_",
                reportUsedIgnorePattern: true,
                varsIgnorePattern: "^_",
              },
            ],
          },
        },
      ],
    }),
  );

  await runProcess(
    process.execPath,
    [
      oxlintPath,
      "--config",
      oxlintConfigPath,
      "--deny-warnings",
      "--format",
      "json",
      "--tsconfig",
      compilerConfigPath,
      "--report-unused-disable-directives-severity=error",
      ...mapArray(examples, ({ generatedPath }) => generatedPath),
    ],
    workingDirectory,
    "Documentation example Oxlint",
    {
      environment: { OXLINT_TSGOLINT_PATH: tsgolintPath },
      exitErrorFromOutput: (stdout, stderr) =>
        oxlintOutputToError(stdout, stderr, examples, workingDirectory),
    },
  );
};

const oxlintOutputToError = (
  stdout: string,
  stderr: string,
  examples: ReadonlyArray<GeneratedJSDocExample>,
  workingDirectory: string,
): Error => {
  const { diagnostics } = JSON.parse(stdout) as OxlintOutput;
  if (diagnostics.length === 0) {
    return new Error(
      ["Documentation example Oxlint failed.", stdout, stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const examplesByGeneratedPath = new Map(
    mapArray(examples, (example) => [example.generatedPath, example] as const),
  );
  const errors = diagnostics
    .map((diagnostic) => {
      const example = examplesByGeneratedPath.get(
        resolve(workingDirectory, diagnostic.filename),
      );
      assert(
        example !== undefined,
        `Oxlint reported an unknown generated example: ${diagnostic.filename}.`,
      );
      const label = diagnostic.labels[0];
      assert(
        label !== undefined,
        `Oxlint did not report a source location for ${diagnostic.filename}.`,
      );
      const line = example.sourceLine + label.span.line - 5;
      const filePath = relative(workingDirectory, example.filePath);
      const code = diagnostic.code ?? "";
      return {
        code,
        filePath,
        line,
        message: `${filePath}:${line}: ${code === "" ? "" : `${code}: `}${diagnostic.message}${diagnostic.help === undefined ? "" : ` ${diagnostic.help}`}`,
      };
    })
    .toSorted(
      (first, second) =>
        first.filePath.localeCompare(second.filePath) ||
        first.line - second.line ||
        first.code.localeCompare(second.code),
    )
    .map(({ message }) => new Error(message));

  return new AggregateError(
    errors,
    [
      "Documentation example Oxlint failed.",
      ...mapArray(errors, ({ message }) => `- ${message}`),
    ].join("\n"),
  );
};

const generatedExamplesToDetails = (
  examples: ReadonlyArray<GeneratedJSDocExample>,
  temporaryDirectory: string,
  workingDirectory: string,
): string =>
  [
    "Generated example sources:",
    ...mapArray(
      examples,
      ({ filePath, generatedPath, line }) =>
        `- ${relative(temporaryDirectory, generatedPath)}: ${relative(workingDirectory, filePath)}:${line}`,
    ),
  ].join("\n");

const getExamplesWithoutCompilationErrors = (
  examples: ReadonlyArray<GeneratedJSDocExample>,
  compilationError: Error,
  workingDirectory: string,
): ReadonlyArray<GeneratedJSDocExample> => {
  const compilationErrorMessage = stripVTControlCharacters(
    compilationError.message,
  );
  const examplesWithErrors = examples.filter(({ generatedPath }) =>
    [generatedPath, relative(workingDirectory, generatedPath)].some((path) =>
      [`${path}(`, `${path}:`].some((segment) =>
        compilationErrorMessage.includes(segment),
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
    const metadata = fence[1].trim().toLowerCase().split(/\s+/u);
    if (!["ts", "typescript"].includes(metadata[0])) {
      continue;
    }
    const line = getLineNumber(source, offset + fence.index);
    const closingFence = fence[3] as string | undefined;
    assert(
      closingFence !== undefined,
      `${filePath}:${line} has an unclosed TypeScript example fence.`,
    );
    const untrimmedExampleSource = stripJSDocPrefixes
      ? fence[2].replaceAll(/^[ \t]*\* ?/gmu, "")
      : fence[2];
    const exampleSource = untrimmedExampleSource.trim();
    assert(
      exampleSource.length > 0,
      `${filePath}:${line} has an empty TypeScript example.`,
    );
    const sourceLine =
      line +
      getLineNumber(
        untrimmedExampleSource,
        untrimmedExampleSource.indexOf(exampleSource),
      );
    examples.push({ filePath, line, source: exampleSource, sourceLine });
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

const transformJSDocExample = (
  example: JSDocExample,
  generatedPath: string,
): string =>
  [
    `import { installPolyfills } from ${JSON.stringify(pathToImportSpecifier(generatedPath, polyfillsPath))};`,
    "installPolyfills();",
    example.source,
  ].join("\n\n");

const resolveTypeScriptCompiler = (
  workingDirectory: string,
  typescriptPackage: string,
): string => resolvePackageBinary(workingDirectory, typescriptPackage, "tsc");

const resolvePackageBinary = (
  workingDirectory: string,
  packageName: string,
  binaryName: string,
): string => {
  const packagePath = resolvePackageJSON(workingDirectory, packageName);
  const packageJson = JSON.parse(
    readFileSync(packagePath, "utf8"),
  ) as PackageWithBinary;
  const namedBinaries =
    typeof packageJson.bin === "object" ? Object.values(packageJson.bin) : [];
  const binary =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : (packageJson.bin?.[binaryName] ??
        (namedBinaries.length === 1 ? namedBinaries[0] : undefined));
  assert(
    binary !== undefined,
    `${packageName} does not expose a ${binaryName} executable.`,
  );
  return resolve(dirname(packagePath), binary);
};

const resolvePackageJSON = (
  workingDirectory: string,
  packageName: string,
): string => {
  const packagePath = findPackageJSON(
    packageName,
    pathToFileURL(join(workingDirectory, "package.json")),
  );
  assert(
    packagePath !== undefined,
    `Cannot resolve ${packageName} from ${workingDirectory}.`,
  );
  return packagePath;
};

const runJSDocExamples = async (
  examples: ReadonlyArray<GeneratedJSDocExample>,
  temporaryDirectory: string,
  workingDirectory: string,
): Promise<void> => {
  if (examples.length === 0) return;

  const runnerPath = join(temporaryDirectory, "run-examples.mjs");
  const resultPath = join(temporaryDirectory, "run-examples-result.json");
  writeFileSync(
    runnerPath,
    [
      'import { writeFileSync } from "node:fs";',
      "",
      `const examples = ${JSON.stringify(
        mapArray(
          examples,
          ({ generatedPath }) => pathToFileURL(generatedPath).href,
        ),
      )};`,
      "const failures = [];",
      "for (const [index, example] of examples.entries()) {",
      "  try {",
      "    await import(example);",
      "  } catch (error) {",
      "    failures.push({",
      "      index,",
      "      message: error instanceof Error ? error.message : String(error),",
      "    });",
      "  }",
      "}",
      `writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ failures }));`,
      "",
    ].join("\n"),
  );

  await runProcess(
    process.execPath,
    [runnerPath],
    workingDirectory,
    "Node.js execution",
  );

  const { failures } = JSON.parse(
    readFileSync(resultPath, "utf8"),
  ) as JSDocExampleRunnerResult;
  if (failures.length === 0) return;

  const errors = mapArray(failures, ({ index, message }) => {
    const example = examples[index];
    assert(
      example !== undefined,
      `Expected generated example at index ${index}.`,
    );
    return new Error(
      `${relative(workingDirectory, example.filePath)}:${example.line}: ${message}`,
    );
  });
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
  return `./${path}`;
};

const runProcess = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  operation: string,
  {
    details,
    environment,
    exitErrorFromOutput,
  }: {
    readonly details?: string;
    readonly environment?: ReadonlyRecord<string, string>;
    readonly exitErrorFromOutput?: (stdout: string, stderr: string) => Error;
  } = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env:
        environment === undefined
          ? process.env
          : { ...process.env, ...environment },
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
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");
      if (exitErrorFromOutput !== undefined) {
        try {
          reject(exitErrorFromOutput(stdoutText, stderrText));
        } catch (error) {
          reject(
            new Error(
              [
                `${operation} failed while reading its output.`,
                stdoutText,
                stderrText,
              ]
                .filter(Boolean)
                .join("\n"),
              { cause: error },
            ),
          );
        }
        return;
      }
      reject(
        new Error(
          [
            `${operation} failed${signal === null ? ` with exit code ${String(code)}` : ` from signal ${signal}`}.`,
            details,
            stdoutText,
            stderrText,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
