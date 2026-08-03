import { testJSDocExamples } from "@evolu/vitest/TestJSDoc";
import { join, resolve } from "node:path";
import { test } from "vitest";

const repositoryDirectory = resolve(import.meta.dirname, "../../../..");

test("packages/common JSDoc examples compile and run", async () => {
  await testJSDocExamples({
    aliases: {
      "@evolu/common": join(
        import.meta.dirname,
        "Type2JSDocFacade.mts",
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
    include: [
      "packages/common/src/Type2.ts",
      "packages/common/src/intl/cs.ts",
    ],
    typescriptPackage: "@typescript/native",
  });
}, 30000);
