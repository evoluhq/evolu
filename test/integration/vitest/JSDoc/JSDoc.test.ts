import { testJSDocExamples } from "@evolu/vitest/TestJSDoc";
import { join, resolve } from "node:path";
import { test } from "vitest";

const repositoryDirectory = resolve(import.meta.dirname, "../../../..");

const sourceFiles = ["packages/common/src/Object.ts"];

test("Evolu JSDoc examples compile and run", async () => {
  await testJSDocExamples({
    aliases: {
      "@evolu/common": join(
        repositoryDirectory,
        "packages/common/src/index.ts",
      ),
      "@evolu/vitest": join(
        repositoryDirectory,
        "packages/vitest/src/index.ts",
      ),
    },
    cwd: repositoryDirectory,
    include: sourceFiles,
    typescriptPackage: "@typescript/native",
  });
}, 30000);
