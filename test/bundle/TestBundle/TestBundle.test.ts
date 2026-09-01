import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { before, describe, it } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertRejectsInstanceOf,
  assertTrue,
} from "../../../packages/common/src/Assert.ts";
import { installPolyfills } from "../../../packages/common/src/Polyfills.ts";
import { assertType } from "../../../packages/common/src/Type.ts";
import {
  testBundle,
  type TestBundle,
  type TestBundleResult,
} from "../../../packages/nodejs/src/TestBundle.ts";

installPolyfills();

const fixturePath = resolve(import.meta.dirname, "__fixtures__/TestBundle.ts");
const aliasFixturePath = resolve(
  import.meta.dirname,
  "__fixtures__/TestBundleAlias.ts",
);
const aliases = { "test.package+": aliasFixturePath };
const errorFixturePath = resolve(
  import.meta.dirname,
  "__fixtures__/TestBundleErrors.ts",
);
const missingDefaultFixturePath = resolve(
  import.meta.dirname,
  "__fixtures__/TestBundleMissingDefault.ts",
);
const invalidFixturePath = resolve(
  import.meta.dirname,
  "__fixtures__/InvalidTestBundle.ts",
);
const outputDirectory = resolve(import.meta.dirname, "tmp");

describe("testBundle", { timeout: 30_000 }, () => {
  before(async () => {
    await rm(outputDirectory, { recursive: true, force: true });
  });

  it("bundles, executes, verifies, measures, and identifies bundlers", async () => {
    const verificationMarker = "verification-code-must-not-be-bundled";
    const verify = (value: unknown, bundle: TestBundle): void => {
      assertEqual(value, { answer: 42, bigint: 1n });
      assertEqual(typeof verificationMarker, "string");
      assertFalse(bundle.code.includes(verificationMarker));
      assertNonNullable(bundle.outputPath);
      assertTrue(existsSync(bundle.outputPath));
    };
    const result = await testBundle({
      cases: {
        fixture: { entryPath: fixturePath, verify },
        "fixture-copy": { entryPath: fixturePath, verify },
      },
      aliases,
      outputDirectory,
    });
    assertType<typeof result, TestBundleResult>();

    assertEqual(result, {
      fixture: {
        "vite@8.2.2": {
          brotliSizeInBytes: 65,
          rawSizeInBytes: 70,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 68,
          rawSizeInBytes: 72,
        },
      },
      "fixture-copy": {
        "vite@8.2.2": {
          brotliSizeInBytes: 65,
          rawSizeInBytes: 70,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 68,
          rawSizeInBytes: 72,
        },
      },
    });
  });

  it("rejects a relative alias target", async () => {
    const error = await assertRejectsInstanceOf(
      testBundle({
        cases: {
          fixture: { entryPath: fixturePath, verify: () => undefined },
        },
        aliases: { "test.package+": "./TestBundleAlias.ts" },
      }),
      Error,
    );
    assertEqual(
      error.message,
      'Bundle alias "test.package+" target must be an absolute path.',
    );
  });

  it("rejects an empty case record", async () => {
    const error = await assertRejectsInstanceOf(
      testBundle({ cases: {} }),
      Error,
    );
    assertEqual(error.message, "Bundle tests require at least one case.");
  });

  it("rejects a bundle without a default export", async () => {
    await assertTestBundleFailure(
      testBundle({
        cases: {
          fixture: {
            entryPath: missingDefaultFixturePath,
            verify: () => undefined,
          },
        },
      }),
      "A bundle test fixture must have a default export.",
    );
  });

  for (const [failure, scenario, message] of [
    ["evaluation error", "evaluation-error", "evaluation failed"],
    ["rejected return value", "rejected-return-value", "return rejected"],
    ["unhandled rejection", "unhandled-rejection", "unhandled rejection"],
    [
      "uncaught asynchronous error",
      "uncaught-asynchronous-error",
      "uncaught error",
    ],
    [
      "non-cloneable return value",
      "non-cloneable-return-value",
      "could not be cloned",
    ],
    [
      "early worker exit",
      "early-worker-exit",
      "Bundle worker exited with code 0 before returning a value.",
    ],
  ] as const) {
    it(`rejects a bundle with an ${failure}`, async () => {
      using _scenario = setupTestBundleScenario(scenario);

      await assertTestBundleFailure(
        testBundle({
          cases: {
            fixture: { entryPath: errorFixturePath, verify: () => undefined },
          },
        }),
        message,
      );
    });
  }

  it("rejects a bundle that does not finish", async () => {
    using _scenario = setupTestBundleScenario("timeout");

    await assertTestBundleFailure(
      testBundle({
        cases: {
          fixture: { entryPath: errorFixturePath, verify: () => undefined },
        },
        timeout: "10ms",
      }),
      "Bundle execution timed out after 10 ms.",
    );
  });

  it("rejects a bundle that does not finish production", async () => {
    await assertTestBundleFailure(
      testBundle({
        cases: {
          fixture: { entryPath: fixturePath, verify: () => undefined },
        },
        bundlingTimeout: "1ms",
      }),
      "Bundle production timed out after 1 ms.",
    );
  });

  it("rejects a failing external verification", async () => {
    await assertTestBundleFailure(
      testBundle({
        cases: {
          fixture: {
            entryPath: fixturePath,
            verify: () => {
              throw new Error("verification failed");
            },
          },
        },
        aliases,
      }),
      "verification failed",
    );
  });

  it("reports only the bundler whose external verification fails", async () => {
    await assertTestBundleFailure(
      testBundle({
        cases: {
          fixture: {
            entryPath: fixturePath,
            verify: (_, bundle) => {
              if (bundle.bundler.startsWith("vite@")) {
                throw new Error("vite verification failed");
              }
            },
          },
        },
        aliases,
      }),
      "vite verification failed",
      ["vite"],
    );
  });

  it("reports a non-Error external verification failure", async () => {
    await assertTestBundleFailure(
      testBundle({
        cases: {
          fixture: {
            entryPath: fixturePath,
            verify: () => {
              throw "non-Error verification failure"; // oxlint-disable-line eslint/no-throw-literal, typescript/only-throw-error -- Unknown failures from user verification code must remain reportable.
            },
          },
        },
        aliases,
      }),
      '"non-Error verification failure"',
    );
  });

  it("rejects an invalid build", async () => {
    await assertTestBundleFailure(
      testBundle({
        cases: {
          fixture: { entryPath: invalidFixturePath, verify: () => undefined },
        },
      }),
      "package-that-does-not-exist",
    );
  });
});

const assertTestBundleFailure = async (
  promise: Promise<unknown>,
  expectedMessage: string,
  expectedBundlers: ReadonlyArray<"webpack" | "vite"> = ["webpack", "vite"],
): Promise<void> => {
  const error = await assertRejectsInstanceOf(promise, AggregateError);
  const failures = error.errors.map((failure) => {
    assertInstanceOf(failure, Error);
    assertTrue("caseName" in failure);
    assertTrue("bundler" in failure);
    assertTrue(failure.bundler === "webpack" || failure.bundler === "vite");
    return {
      caseName: failure.caseName,
      bundler: failure.bundler,
      containsExpectedMessage: failure.message.includes(expectedMessage),
    };
  });
  assertEqual(
    failures.toSorted((a, b) => a.bundler.localeCompare(b.bundler)),
    expectedBundlers
      .map((bundler) => ({
        caseName: "fixture",
        bundler,
        containsExpectedMessage: true,
      }))
      .toSorted((a, b) => a.bundler.localeCompare(b.bundler)),
  );

  for (const bundler of ["webpack", "vite"] as const) {
    if (expectedBundlers.includes(bundler)) {
      assertTrue(error.message.includes(`- fixture / ${bundler}:`));
    } else {
      assertFalse(error.message.includes(`- fixture / ${bundler}:`));
    }
  }
};

const setupTestBundleScenario = (scenario: string): Disposable => {
  const envName = "EVOLU_TEST_BUNDLE_SCENARIO";
  const previousScenario = process.env[envName];
  process.env[envName] = scenario;

  return {
    [Symbol.dispose]: () => {
      if (previousScenario == null) {
        Reflect.deleteProperty(process.env, envName);
      } else {
        process.env[envName] = previousScenario;
      }
    },
  };
};
