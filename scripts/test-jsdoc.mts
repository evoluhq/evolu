import { testJSDocExamples } from "@evolu/vitest/TestJSDoc";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";

const repositoryDirectory = resolve(import.meta.dirname, "..");

export const jsdocSourceFiles = [
  "packages/common/src/Object.ts",
  "packages/common/src/Result.ts",
  "packages/common/src/Task.ts",
  "packages/common/src/Type.ts",
] as const;

export const selectJSDocIncludes = (
  args: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (args.length === 0) return jsdocSourceFiles;

  for (const arg of args) {
    assert(!arg.startsWith("-"), `Unknown option: ${arg}`);
  }
  return args;
};

export const testEvoluJSDocExamples = async (
  include: string | ReadonlyArray<string> = jsdocSourceFiles,
): Promise<void> => {
  await testJSDocExamples({
    aliases: {
      "@evolu/common": join(
        repositoryDirectory,
        "packages/common/src/index.ts",
      ),
      "@evolu/common/intl": join(
        repositoryDirectory,
        "packages/common/src/intl/index.ts",
      ),
      "@evolu/vitest": join(
        repositoryDirectory,
        "packages/vitest/src/index.ts",
      ),
    },
    cwd: repositoryDirectory,
    include,
    typescriptPackage: "@typescript/native",
  });
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const include = selectJSDocIncludes(args);
  await testEvoluJSDocExamples(include);
  process.stdout.write(
    `JSDoc examples passed for ${String(include.length)} source file${include.length === 1 ? "" : "s"}.\n`,
  );
}
