import { testJSDocExamples } from "@evolu/nodejs/TestJSDoc";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { buildNativeSqlite } from "../../packages/nodejs/scripts/build-native.mts";

const repositoryDirectory = resolve(import.meta.dirname, "../..");

// Svelte is excluded because its examples use runes, which need the Svelte
// compiler and a component.
export const jsdocSourcePattern = "packages/!(svelte)/src/**/*.{ts,tsx}";
export const changesetSourcePattern = ".changeset/*.md";
// Every handwritten documentation page and blog post. The API reference pages
// are generated from the JSDoc above.
export const pageSourcePatterns = [
  "apps/web/src/app/(docs)/docs/page.mdx",
  "apps/web/src/app/(docs)/docs/!(api-reference)/**/page.mdx",
  "apps/web/src/app/(landing)/**/page.mdx",
] as const;
export const documentationSourcePatterns = [
  jsdocSourcePattern,
  changesetSourcePattern,
  ...pageSourcePatterns,
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
  // Examples that open SQLite on Node.js load @evolu/nodejs's addon.
  await buildNativeSqlite();
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
      "@evolu/nodejs": join(
        repositoryDirectory,
        "packages/nodejs/src/index.ts",
      ),
      "@evolu/nodejs/TestBundle": join(
        repositoryDirectory,
        "packages/nodejs/src/TestBundle.ts",
      ),
      "@evolu/nodejs/TestJSDoc": join(
        repositoryDirectory,
        "packages/nodejs/src/TestJSDoc.ts",
      ),
      "@evolu/common/polyfills": join(
        repositoryDirectory,
        "packages/common/src/Polyfills.ts",
      ),
      "@evolu/common/local-first": join(
        repositoryDirectory,
        "packages/common/src/local-first/index.ts",
      ),
      "@evolu/react": join(repositoryDirectory, "packages/react/src/index.ts"),
      "@evolu/react-native": join(
        repositoryDirectory,
        "test/jsdoc/test-jsdoc-react-native.mts",
      ),
      "@evolu/react-native/identicon": join(
        repositoryDirectory,
        "packages/react-native/src/identicon.ts",
      ),
      "@evolu/react-web": join(
        repositoryDirectory,
        "test/jsdoc/test-jsdoc-react-web.mts",
      ),
      "@evolu/sqlite-wasm": join(
        repositoryDirectory,
        "packages/sqlite-wasm/src/index.ts",
      ),
      "@evolu/svelte": join(
        repositoryDirectory,
        "test/jsdoc/test-jsdoc-svelte.mts",
      ),
      "@evolu/vue": join(repositoryDirectory, "packages/vue/src/index.ts"),
      "@evolu/web": join(repositoryDirectory, "test/jsdoc/test-jsdoc-web.mts"),
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
