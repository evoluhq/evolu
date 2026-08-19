import { testJSDocExamples } from "@evolu/vitest/TestJSDoc";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";

const repositoryDirectory = resolve(import.meta.dirname, "..");

export const jsdocSourcePattern = "packages/common/src/**/*.ts";
export const changesetSourcePattern = ".changeset/*.md";
export const documentationSourcePatterns = [
  jsdocSourcePattern,
  changesetSourcePattern,
] as const;

export const selectJSDocIncludes = (
  args: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (args.length === 0) return documentationSourcePatterns;

  for (const arg of args) {
    assert(!arg.startsWith("-"), `Unknown option: ${arg}`);
  }
  return args;
};

export const testEvoluJSDocExamples = async (
  include: string | ReadonlyArray<string> = documentationSourcePatterns,
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
      "@evolu/common/local-first": join(
        repositoryDirectory,
        "packages/common/src/local-first/index.ts",
      ),
      "@evolu/react-native": join(
        repositoryDirectory,
        "scripts/test-jsdoc-react-native.mts",
      ),
      "@evolu/web": join(
        repositoryDirectory,
        "packages/web/src/Task.ts",
      ),
      "@evolu/vitest": join(
        repositoryDirectory,
        "packages/vitest/src/index.ts",
      ),
      "@evolu/vitest/TestJSDoc": join(
        repositoryDirectory,
        "packages/vitest/src/TestJSDoc.ts",
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
  process.stdout.write("Documentation examples passed.\n");
}
