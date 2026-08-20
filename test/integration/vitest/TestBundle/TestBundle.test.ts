import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, expectTypeOf, test, vi } from "vitest";
import { availableParallelism } from "../../../../packages/nodejs/src/Platform.ts";
import {
  testBundle,
  type TestBundle,
  type TestBundleResult,
} from "../../../../packages/nodejs/src/TestBundle.ts";

vi.mock(
  "../../../../packages/nodejs/src/Platform.ts",
  async (importOriginal) => {
    const platform =
      await importOriginal<
        typeof import("../../../../packages/nodejs/src/Platform.ts")
      >();
    return {
      ...platform,
      availableParallelism: vi.fn(platform.availableParallelism),
    };
  },
);

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
  beforeAll(async () => {
    await rm(outputDirectory, { recursive: true, force: true });
  });

  test("bundles, executes, verifies, measures, and identifies bundlers", async () => {
    vi.mocked(availableParallelism).mockClear();
    const verificationMarker = "verification-code-must-not-be-bundled";
    const verify = (value: unknown, bundle: TestBundle): void => {
      expect(value).toEqual({ answer: 42, bigint: 1n });
      expect(verificationMarker).toBeTypeOf("string");
      expect(bundle.code).not.toContain(verificationMarker);
      if (!bundle.outputPath) throw new Error("Expected a persisted bundle.");
      expect(existsSync(bundle.outputPath)).toBe(true);
    };
    const result = await testBundle({
      cases: {
        fixture: { entryPath: fixturePath, verify },
        "fixture-copy": { entryPath: fixturePath, verify },
      },
      aliases,
      outputDirectory,
    });
    expectTypeOf(result).toEqualTypeOf<TestBundleResult>();
    expect(availableParallelism).toHaveBeenCalledTimes(1);

    expect(result).toMatchInlineSnapshot(`
      {
        "fixture": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 65,
            "rawSizeInBytes": 70,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 68,
            "rawSizeInBytes": 72,
          },
        },
        "fixture-copy": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 65,
            "rawSizeInBytes": 70,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 68,
            "rawSizeInBytes": 72,
          },
        },
      }
    `);
  });

  test("rejects a relative alias target", async () => {
    await expect(
      testBundle({
        cases: {
          fixture: { entryPath: fixturePath, verify: () => undefined },
        },
        aliases: { "test.package+": "./TestBundleAlias.ts" },
      }),
    ).rejects.toThrow(
      'Bundle alias "test.package+" target must be an absolute path.',
    );
  });

  test("rejects an empty case record", async () => {
    await expect(testBundle({ cases: {} })).rejects.toThrow(
      "Bundle tests require at least one case.",
    );
  });

  test("rejects a bundle without a default export", async () => {
    await expectTestBundleFailure(
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

  test.each([
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
  ])("rejects a bundle with an %s", async (_, scenario, message) => {
    using _scenario = setupTestBundleScenario(scenario);

    await expectTestBundleFailure(
      testBundle({
        cases: {
          fixture: { entryPath: errorFixturePath, verify: () => undefined },
        },
      }),
      message,
    );
  });

  test("rejects a bundle that does not finish", async () => {
    using _scenario = setupTestBundleScenario("timeout");

    await expectTestBundleFailure(
      testBundle({
        cases: {
          fixture: { entryPath: errorFixturePath, verify: () => undefined },
        },
        timeout: "10ms",
      }),
      "Bundle execution timed out after 10 ms.",
    );
  });

  test("rejects a bundle that does not finish production", async () => {
    await expectTestBundleFailure(
      testBundle({
        cases: {
          fixture: { entryPath: fixturePath, verify: () => undefined },
        },
        bundlingTimeout: "1ms",
      }),
      "Bundle production timed out after 1 ms.",
    );
  });

  test("rejects a failing external verification", async () => {
    await expectTestBundleFailure(
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

  test("reports only the bundler whose external verification fails", async () => {
    await expectTestBundleFailure(
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

  test("reports a non-Error external verification failure", async () => {
    await expectTestBundleFailure(
      testBundle({
        cases: {
          fixture: {
            entryPath: fixturePath,
            verify: () => {
              // eslint-disable-next-line @typescript-eslint/only-throw-error -- Unknown failures from user verification code must remain reportable.
              throw "non-Error verification failure";
            },
          },
        },
        aliases,
      }),
      '"non-Error verification failure"',
    );
  });

  test("rejects an invalid build", async () => {
    await expectTestBundleFailure(
      testBundle({
        cases: {
          fixture: { entryPath: invalidFixturePath, verify: () => undefined },
        },
      }),
      "package-that-does-not-exist",
    );
  });
});

const expectTestBundleFailure = async (
  promise: Promise<unknown>,
  expectedMessage: string,
  expectedBundlers: ReadonlyArray<"webpack" | "vite"> = ["webpack", "vite"],
): Promise<void> => {
  let error: unknown;
  try {
    await promise;
  } catch (caughtError) {
    error = caughtError;
  }

  if (!(error instanceof AggregateError)) {
    throw new Error("Expected every bundler failure to be aggregated.", {
      cause: error,
    });
  }
  expect(error.errors).toEqual(
    expectedBundlers.map((bundler) =>
      expect.objectContaining({
        caseName: "fixture",
        bundler,
        message: expect.stringContaining(expectedMessage),
      }),
    ),
  );
  for (const bundler of ["webpack", "vite"] as const) {
    const expectation = expect(error.message);
    if (expectedBundlers.includes(bundler)) {
      expectation.toContain(`- fixture / ${bundler}:`);
    } else {
      expectation.not.toContain(`- fixture / ${bundler}:`);
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
