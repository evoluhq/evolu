import { testJSDocExamples } from "@evolu/vitest/TestJSDoc";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { assert, expect, test } from "vitest";

const repositoryDirectory = resolve(import.meta.dirname, "../../../..");
const temporaryRoot = join(repositoryDirectory, "tmp");

test("testJSDocExamples injects Vitest assertions", async () => {
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
        ' * const value: unknown = "Evolu";',
        ' * assert(typeof value === "string");',
        " * const upperCaseValue = value.toUpperCase();",
        ' * expect(upperCaseValue).toBe("EVOLU");',
        " * expectTypeOf(upperCaseValue).toEqualTypeOf<",
        " *   ReturnType<() => string>",
        " * >();",
        ' * assert(upperCaseValue === "EVOLU");',
        ' * expectOk({ ok: true as const, value: upperCaseValue }, "EVOLU");',
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
        " * const values = new Map<string, number>();",
        ' * const value = values.getOrInsertComputed("answer", () => 42);',
        " * expect(value).toBe(42);",
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
    const examplePath = join(temporaryDirectory, "Example.ts");
    writeFileSync(rootPath, 'export const root = "root";\n');
    writeFileSync(featurePath, 'export const feature = "feature";\n');
    writeFileSync(
      examplePath,
      [
        "/**",
        " * ```ts",
        ' * import { root } from "@example/package";',
        ' * import { feature } from "@example/package/feature";',
        " *",
        ' * assert(root === "root");',
        ' * assert(feature === "feature");',
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    await testJSDocExamples({
      aliases: {
        "@example/package": rootPath,
        "@example/package/feature": featurePath,
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
        'const value = "Evolu";',
        "expectTypeOf(value).toEqualTypeOf<string>();",
        'assert(value === "Evolu");',
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
        'expectOk({ ok: true as const, value: "Evolu" }, "Evolu");',
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

test.skipIf(availableParallelism() < 2)(
  "testJSDocExamples runs examples concurrently",
  async () => {
    mkdirSync(temporaryRoot, { recursive: true });
    const temporaryDirectory = mkdtempSync(
      join(temporaryRoot, "evolu-test-jsdoc-"),
    );

    try {
      const firstReadyPath = join(temporaryDirectory, "first-ready");
      const secondReadyPath = join(temporaryDirectory, "second-ready");
      const sourcePath = join(temporaryDirectory, "ConcurrentExamples.ts");
      const createExample = (ownReadyPath: string, peerReadyPath: string) => [
        "/**",
        " * ```ts",
        ' * import { existsSync, writeFileSync } from "node:fs";',
        ' * import { setTimeout } from "node:timers/promises";',
        " *",
        ` * const ownReadyPath = ${JSON.stringify(ownReadyPath)};`,
        ` * const peerReadyPath = ${JSON.stringify(peerReadyPath)};`,
        ' * writeFileSync(ownReadyPath, "");',
        " * for (",
        " *   let attempt = 0;",
        " *   attempt < 100 && !existsSync(peerReadyPath);",
        " *   attempt++",
        " * ) {",
        " *   await setTimeout(10);",
        " * }",
        " * assert(existsSync(peerReadyPath));",
        " * ```",
        " */",
      ];
      writeFileSync(
        sourcePath,
        [
          ...createExample(firstReadyPath, secondReadyPath),
          "export const firstExample = true;",
          ...createExample(secondReadyPath, firstReadyPath),
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
  },
);

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
        ' * assert.equal("first", "expected");',
        " * ```",
        " */",
        "export const firstExample = true;",
        "/**",
        " * ```ts",
        ' * assert.equal("second", "expected");',
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

    assert(error instanceof AggregateError);
    expect(error.errors).toHaveLength(2);
    const [firstError, secondError] = error.errors as ReadonlyArray<unknown>;
    assert(firstError instanceof Error);
    assert(secondError instanceof Error);
    expect(firstError.message).toMatch(/RuntimeFailures\.ts:2:/);
    expect(secondError.message).toMatch(/RuntimeFailures\.ts:8:/);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("testJSDocExamples runs examples without compilation errors", async () => {
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
        ' * assert.equal("actual", "expected");',
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

    assert(error instanceof AggregateError);
    expect(error.message).toMatch(/TypeScript compilation failed/);
    expect(error.message).toMatch(/JSDoc example execution failed/);
    expect(error.errors).toHaveLength(2);
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
        ' * assert.equal("actual", "expected");',
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

    assert(error instanceof AggregateError);
    expect(error.message).toMatch(/TypeScript compilation failed/);
    expect(error.message).toMatch(/JSDoc example execution failed/);
    expect(error.errors).toHaveLength(2);
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
        ' * const value = "Evolu" as any;',
        " * expectTypeOf(value).toEqualTypeOf<string>();",
        " * ```",
        " */",
        "export const example = true;",
      ].join("\n"),
    );

    await expect(
      testJSDocExamples({
        cwd: repositoryDirectory,
        include: [sourcePath],
        typescriptPackage: "@typescript/native",
      }),
    ).rejects.toThrow(/TypeScript compilation failed/);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});
