import {
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertRejectsInstanceOf,
  assertTrue,
} from "@evolu/common";
import { testJSDocExamples } from "@evolu/nodejs/TestJSDoc";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repositoryDirectory = resolve(import.meta.dirname, "../../../..");
const temporaryRoot = join(repositoryDirectory, "tmp");

const setupOxlintPackage = (
  temporaryDirectory: string,
  source: string,
): void => {
  const packagePath = join(temporaryDirectory, "node_modules", "oxlint");
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(
    join(packagePath, "package.json"),
    JSON.stringify({ name: "oxlint", type: "module", bin: "./oxlint.js" }),
  );
  writeFileSync(join(packagePath, "oxlint.js"), source);
};

test("testJSDocExamples supports explicit Evolu assertions", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { assert, assertEqual, assertOk, assertType } from "@evolu/common";',
        " *",
        ' * const value: unknown = "Evolu";',
        ' * assert(typeof value === "string", "Expected a string.");',
        " * const upperCaseValue = value.toUpperCase();",
        " * assertType<typeof upperCaseValue, ReturnType<() => string>>();",
        ' * assertEqual(upperCaseValue, "EVOLU");',
        ' * assertOk({ ok: true as const, value: upperCaseValue }, "EVOLU");',
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    await testJSDocExamples({
      cwd: repositoryDirectory,
      include: sourcePath,
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples lints examples with Evolu's Oxlint config", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * console.log("Not allowed in Evolu examples.");',
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: repositoryDirectory,
      include: sourcePath,
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertTrue(/Documentation example Oxlint failed/u.test(error.message));
    assertTrue(/Example\.ts:3: eslint\(no-console\)/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports unused declarations with Oxlint", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * const unused = true;",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: repositoryDirectory,
      include: sourcePath,
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertTrue(/Documentation example Oxlint failed/u.test(error.message));
    assertTrue(/Example\.ts:3: eslint\(no-unused-vars\)/u.test(error.message));
    assertFalse(/TypeScript compilation failed/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples allows underscore-prefixed unused declarations", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { assertTrue } from "@evolu/common";',
        " *",
        " * const _unused = true;",
        " * type _Unused = string;",
        " * const callback = (_value: string): boolean => true;",
        ' * assertTrue(callback("value"));',
        " * // @ts-expect-error Type 'number' is not assignable to type 'string'.",
        " * const _invalid: string = 1;",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    await testJSDocExamples({
      cwd: repositoryDirectory,
      include: sourcePath,
      typescriptPackage: "@typescript/native",
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples rejects used underscore-prefixed declarations", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { assertTrue } from "@evolu/common";',
        " *",
        " * const _value = true;",
        " * assertTrue(_value);",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: repositoryDirectory,
      include: sourcePath,
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertTrue(/Documentation example Oxlint failed/u.test(error.message));
    assertTrue(/eslint\(no-unused-vars\)/u.test(error.message));
    assertTrue(/_value/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples maps lint failures after leading blank lines", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const jsdocPath = join(temporaryDirectory, "JSDoc.ts");
    const markdownPath = join(temporaryDirectory, "Markdown.md");
    writeFileSync(
      jsdocPath,
      [
        "/**",
        " * ```ts",
        " *",
        ' * console.log("JSDoc.");',
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );
    writeFileSync(
      markdownPath,
      ["# Example", "", "```ts", "", 'console.log("Markdown.");', "```"].join(
        "\n",
      ),
    );

    const error = await testJSDocExamples({
      cwd: repositoryDirectory,
      include: [jsdocPath, markdownPath],
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertTrue(/JSDoc\.ts:4: eslint\(no-console\)/u.test(error.message));
    assertTrue(/Markdown\.md:5: eslint\(no-console\)/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports multiple unused Oxlint directives", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * // oxlint-disable-next-line eslint/no-console -- Intentionally unused.",
        " * export const first = true;",
        " * // oxlint-disable-next-line eslint/no-alert -- Intentionally unused.",
        " * export const second = true;",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: repositoryDirectory,
      include: sourcePath,
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertLength(error.errors, 2);
    assertFalse(error.message.includes("undefined"));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports Oxlint failures without diagnostics", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * export {};",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );
    setupOxlintPackage(
      temporaryDirectory,
      [
        "process.stdout.write(JSON.stringify({ diagnostics: [] }));",
        'process.stderr.write("Invalid Oxlint configuration.\\n");',
        "process.exit(1);",
      ].join("\n"),
    );

    const error = await assertRejectsInstanceOf(
      testJSDocExamples({
        cwd: temporaryDirectory,
        include: sourcePath,
        typescriptPackage: "@typescript/native",
      }),
      Error,
    );
    assertTrue(/Invalid Oxlint configuration/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports malformed Oxlint output", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * export {};",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );
    setupOxlintPackage(
      temporaryDirectory,
      [
        'process.stdout.write("Not JSON.");',
        'process.stderr.write("Oxlint configuration failed.\\n");',
        "process.exit(1);",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: temporaryDirectory,
      include: sourcePath,
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, Error);
    assertTrue(
      /Documentation example Oxlint failed while reading its output/u.test(
        error.message,
      ),
    );
    assertTrue(/Not JSON/u.test(error.message));
    assertTrue(/Oxlint configuration failed/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports child process startup failures", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );
  const execPath = process.execPath;

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * export {};",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );
    process.execPath = join(temporaryDirectory, "missing-node");

    const error = await assertRejectsInstanceOf(
      testJSDocExamples({
        cwd: repositoryDirectory,
        include: sourcePath,
        typescriptPackage: "@typescript/native",
      }),
      Error,
    );
    assertTrue(/Documentation example Oxlint failed/u.test(error.message));
  } finally {
    process.execPath = execPath;
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples does not provide assertion globals", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * expect(true).toBe(true);",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    const error = await assertRejectsInstanceOf(
      testJSDocExamples({
        cwd: repositoryDirectory,
        include: [sourcePath],
        typescriptPackage: "@typescript/native",
      }),
      Error,
    );
    assertTrue(/TypeScript compilation failed/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples installs Evolu polyfills", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { assertEqual } from "@evolu/common";',
        " *",
        " * const values = new Map<string, number>();",
        ' * const value = values.getOrInsertComputed("answer", () => 42);',
        " * assertEqual(value, 42);",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    await testJSDocExamples({
      cwd: repositoryDirectory,
      include: [sourcePath],
      typescriptPackage: "@typescript/native",
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples supports package subpath aliases", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const rootPath = join(temporaryDirectory, "Root.mts");
    const featurePath = join(temporaryDirectory, "Feature.mts");
    const unscopedPath = join(temporaryDirectory, "Unscoped.mts");
    const examplePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(rootPath, 'export const root = "root";\n');
    writeFileSync(featurePath, 'export const feature = "feature";\n');
    writeFileSync(unscopedPath, 'export const unscoped = "unscoped";\n');
    writeFileSync(
      examplePath,
      [
        "/**",
        " * ```ts",
        ' * import { assertEqual } from "@evolu/common";',
        ' * import { root } from "@example/package";',
        ' * import { feature } from "@example/package/feature";',
        ' * import { unscoped } from "example-package";',
        " *",
        ' * assertEqual(root, "root");',
        ' * assertEqual(feature, "feature");',
        ' * assertEqual(unscoped, "unscoped");',
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    await testJSDocExamples({
      aliases: {
        "@example/package": rootPath,
        "@example/package/feature": featurePath,
        "example-package": unscopedPath,
      },
      cwd: repositoryDirectory,
      include: [examplePath],
      typescriptPackage: "@typescript/native",
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples extracts Markdown examples", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const markdownPath = join(temporaryDirectory, "Example.md");
    const mdxPath = join(temporaryDirectory, "Example.mdx");
    writeFileSync(
      markdownPath,
      [
        "# Markdown example",
        "",
        "```ts",
        'import { assertEqual, assertType } from "@evolu/common";',
        "",
        'const value: string = "Evolu";',
        "assertType<typeof value, string>();",
        'assertEqual(value, "Evolu");',
        "```",
        "",
        "```js",
        'throw new Error("JavaScript fences are ignored.");',
        "```",
      ].join("\n"),
    );
    writeFileSync(
      mdxPath,
      [
        "# MDX example",
        "",
        "~~~typescript",
        'import { assertOk } from "@evolu/common";',
        "",
        'assertOk({ ok: true as const, value: "Evolu" }, "Evolu");',
        "~~~",
      ].join("\n"),
    );

    await testJSDocExamples({
      cwd: repositoryDirectory,
      include: [markdownPath, mdxPath],
      typescriptPackage: "@typescript/native",
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples requires a compiler executable", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * export {};",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );
    const compilerPackagePath = join(
      temporaryDirectory,
      "node_modules",
      "compiler-without-tsc",
    );
    mkdirSync(compilerPackagePath, { recursive: true });
    writeFileSync(
      join(compilerPackagePath, "package.json"),
      JSON.stringify({
        name: "compiler-without-tsc",
        bin: { first: "./first.js", second: "./second.js" },
      }),
    );

    const error = await assertRejectsInstanceOf(
      testJSDocExamples({
        cwd: temporaryDirectory,
        include: sourcePath,
        typescriptPackage: "compiler-without-tsc",
      }),
      Error,
    );
    assertTrue(
      /compiler-without-tsc does not expose a tsc executable/u.test(
        error.message,
      ),
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples runs isolated modules in source order in one process", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const processPath = join(temporaryDirectory, "process");
    const sourcePath = join(temporaryDirectory, "Examples.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { writeFileSync } from "node:fs";',
        " *",
        ' * const value = "first";',
        ` * writeFileSync(${JSON.stringify(processPath)}, String(process.pid) + ":" + value);`,
        " * ```",
        " */",
        "export const firstExample = true;",
        "/**",
        " * ```ts",
        ' * import { assertEqual } from "@evolu/common";',
        ' * import { readFileSync } from "node:fs";',
        " *",
        ' * const value = "second";',
        ' * assertEqual(value, "second");',
        ` * assertEqual(readFileSync(${JSON.stringify(processPath)}, "utf8"), String(process.pid) + ":first");`,
        " * ```",
        " */",
        "export const secondExample = true;",
      ].join("\n"),
    );

    await testJSDocExamples({
      cwd: repositoryDirectory,
      include: [sourcePath],
      typescriptPackage: "@typescript/native",
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports execution failures in source order", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "RuntimeFailures.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { assert } from "@evolu/common";',
        " *",
        ' * assert(false, "first failure");',
        " * ```",
        " */",
        "export const firstExample = true;",
        "/**",
        " * ```ts",
        ' * import { assert } from "@evolu/common";',
        " *",
        ' * assert(false, "second failure");',
        " * ```",
        " */",
        "export const secondExample = true;",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: repositoryDirectory,
      include: [sourcePath],
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertLength(error.errors, 2);
    const [firstError, secondError] = error.errors as ReadonlyArray<unknown>;
    assertInstanceOf(firstError, Error);
    assertInstanceOf(secondError, Error);
    assertTrue(/RuntimeFailures\.ts:2:/u.test(firstError.message));
    assertTrue(/RuntimeFailures\.ts:10:/u.test(secondError.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports examples terminated by a signal", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * process.kill(process.pid, "SIGTERM");',
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    const error = await assertRejectsInstanceOf(
      testJSDocExamples({
        cwd: repositoryDirectory,
        include: sourcePath,
        typescriptPackage: "@typescript/native",
      }),
      Error,
    );
    assertTrue(
      /Node\.js execution failed from signal SIGTERM/u.test(error.message),
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples reports lint, compilation, and execution failures together", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "MixedFailures.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * missingFunction();",
        " * ```",
        " */",
        "export const compilationFailure = true;",
        "/**",
        " * ```ts",
        ' * import { assert } from "@evolu/common";',
        " *",
        ' * assert(false, "execution failure");',
        " * ```",
        " */",
        "export const executionFailure = true;",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: repositoryDirectory,
      include: [sourcePath],
      typescriptPackage: "@typescript/native",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertTrue(/Documentation example Oxlint failed/u.test(error.message));
    assertTrue(/TypeScript compilation failed/u.test(error.message));
    assertTrue(/JSDoc example execution failed/u.test(error.message));
    assertLength(error.errors, 3);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples supports colored colon-formatted TypeScript diagnostics", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "MixedFailures.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        " * missingFunction();",
        " * ```",
        " */",
        "export const compilationFailure = true;",
        "/**",
        " * ```ts",
        ' * import { assert } from "@evolu/common";',
        " *",
        ' * assert(false, "execution failure");',
        " * ```",
        " */",
        "export const executionFailure = true;",
      ].join("\n"),
    );
    const compilerPackagePath = join(
      temporaryDirectory,
      "node_modules",
      "typescript-colon-diagnostics",
    );
    mkdirSync(compilerPackagePath, { recursive: true });
    writeFileSync(
      join(temporaryDirectory, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    writeFileSync(
      join(compilerPackagePath, "package.json"),
      JSON.stringify({
        name: "typescript-colon-diagnostics",
        type: "module",
        bin: "./tsc.js",
      }),
    );
    writeFileSync(
      join(compilerPackagePath, "tsc.js"),
      [
        'import { readFileSync } from "node:fs";',
        "",
        'const projectIndex = process.argv.indexOf("--project");',
        "const projectPath =",
        "  projectIndex === -1 ? undefined : process.argv[projectIndex + 1];",
        'if (projectPath === undefined) throw new Error("Missing --project.");',
        'const { files } = JSON.parse(readFileSync(projectPath, "utf8"));',
        "const [firstFile] = files;",
        'if (firstFile === undefined) throw new Error("No files provided.");',
        "process.stderr.write(",
        "  `\\u001b[96m${firstFile}\\u001b[0m:\\u001b[93m5\\u001b[0m:\\u001b[93m1\\u001b[0m - error TS2304: Cannot find name 'missingFunction'.\\n`,",
        ");",
        "process.exit(1);",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: temporaryDirectory,
      include: [sourcePath],
      typescriptPackage: "typescript-colon-diagnostics",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, AggregateError);
    assertTrue(/TypeScript compilation failed/u.test(error.message));
    assertTrue(/JSDoc example execution failed/u.test(error.message));
    assertLength(error.errors, 3);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples skips execution when compiler diagnostics have no file", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { assert } from "@evolu/common";',
        " *",
        ' * assert(false, "This example must not run.");',
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );
    const compilerPackagePath = join(
      temporaryDirectory,
      "node_modules",
      "typescript-without-file-diagnostics",
    );
    mkdirSync(compilerPackagePath, { recursive: true });
    writeFileSync(
      join(compilerPackagePath, "package.json"),
      JSON.stringify({
        name: "typescript-without-file-diagnostics",
        type: "module",
        bin: "./tsc.js",
      }),
    );
    writeFileSync(
      join(compilerPackagePath, "tsc.js"),
      [
        'process.stderr.write("error TS9999: Unattributed failure.\\n");',
        "process.exit(1);",
      ].join("\n"),
    );

    const error = await testJSDocExamples({
      cwd: temporaryDirectory,
      include: sourcePath,
      typescriptPackage: "typescript-without-file-diagnostics",
    }).catch((error: unknown) => error);

    assertInstanceOf(error, Error);
    assertTrue(/TypeScript compilation failed/u.test(error.message));
    assertFalse(/JSDoc example execution failed/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples rejects an incorrect inferred type", async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(temporaryRoot, "evolu-test-jsdoc-"),
  );

  try {
    const sourcePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(
      sourcePath,
      [
        "/**",
        " * ```ts",
        ' * import { assertType } from "@evolu/common";',
        " *",
        ' * const value = "Evolu" as any;',
        " * assertType<typeof value, string>();",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    const error = await assertRejectsInstanceOf(
      testJSDocExamples({
        cwd: repositoryDirectory,
        include: [sourcePath],
        typescriptPackage: "@typescript/native",
      }),
      Error,
    );
    assertTrue(/TypeScript compilation failed/u.test(error.message));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});
