import { assertEqual, assertFalse, assertTrue } from "@evolu/common";
import { relative, resolve } from "node:path";
import { describe, it } from "node:test";
import type { TestEvent } from "node:test/reporters";
import { stripVTControlCharacters } from "node:util";

import testOverviewReporter from "./TestOverviewReporter.ts";

const createFileSummaryEvent = ({
  durationMs,
  file,
  success,
  tests,
}: {
  readonly durationMs: number;
  readonly file: string;
  readonly success: boolean;
  readonly tests: number;
}): TestEvent => ({
  type: "test:summary",
  data: {
    counts: {
      cancelled: 0,
      passed: success ? tests : tests - 1,
      skipped: 0,
      suites: 0,
      tests,
      todo: 0,
      topLevel: tests,
    },
    duration_ms: durationMs,
    file,
    success,
  },
});

const collectReporterOutput = async (
  events: ReadonlyArray<TestEvent>,
): Promise<string> => {
  let output = "";
  for await (const chunk of testOverviewReporter(events)) {
    output +=
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
  }
  return stripVTControlCharacters(output);
};

describe("testOverviewReporter", () => {
  it("reports test files slowest-first", async () => {
    const fastFile = resolve("packages/common/src/Fast.test.ts");
    const slowFile = resolve("packages/common/src/Slow.test.ts");
    const output = await collectReporterOutput([
      createFileSummaryEvent({
        durationMs: 2.4,
        file: fastFile,
        success: true,
        tests: 1,
      }),
      createFileSummaryEvent({
        durationMs: 312.6,
        file: slowFile,
        success: true,
        tests: 2,
      }),
      {
        type: "test:summary",
        data: {
          counts: {
            cancelled: 0,
            passed: 3,
            skipped: 0,
            suites: 0,
            tests: 3,
            todo: 0,
            topLevel: 3,
          },
          duration_ms: 15,
          file: undefined,
          success: true,
        },
      },
    ]);

    assertEqual(
      output,
      `Test files:

✔ ${relative(process.cwd(), slowFile)} (2 tests) 313ms
✔ ${relative(process.cwd(), fastFile)} (1 test) 2ms

`,
    );
  });

  it("preserves Node.js failure diagnostics", async () => {
    const cause = new Error("Expected Ada.");
    const error = Object.assign(new Error("Test failed.", { cause }), {
      cause,
    });
    const file = resolve("packages/common/src/Failing.test.ts");
    const output = await collectReporterOutput([
      {
        type: "test:fail",
        data: {
          details: { duration_ms: 1, error, type: "test" },
          file,
          name: "fails",
          nesting: 0,
          testNumber: 1,
        },
      },
      createFileSummaryEvent({
        durationMs: 1,
        file,
        success: false,
        tests: 1,
      }),
    ]);

    assertTrue(output.includes("Failed tests:"));
    assertTrue(output.includes("Test failed."));
    assertTrue(output.includes(`✖ ${relative(process.cwd(), file)}`));
  });

  it("preserves failures without file summaries", async () => {
    const cause = new Error("Module failed to load.");
    const error = Object.assign(new Error("Test failed.", { cause }), {
      cause,
    });
    const details: Extract<
      TestEvent,
      { readonly type: "test:fail" }
    >["data"]["details"] = {
      duration_ms: 1,
      error,
      type: "test",
    };
    const failure: TestEvent = {
      type: "test:fail",
      data: {
        details,
        file: resolve("packages/common/src/Failing.test.ts"),
        name: "fails to load",
        nesting: 0,
        testNumber: 1,
      },
    };
    const output = await collectReporterOutput([failure]);

    assertTrue(output.includes("Failed tests:"));
    assertTrue(output.includes("Module failed to load."));
    assertFalse(output.includes("Test files:"));
  });

  it("uses Node.js summary and coverage formatting", async () => {
    const output = await collectReporterOutput([
      {
        type: "test:diagnostic",
        data: {
          level: "info",
          message: "skipped 1",
          nesting: 0,
        },
      },
      {
        type: "test:diagnostic",
        data: {
          level: "error",
          message: "Coverage threshold was not met.",
          nesting: 0,
        },
      },
      {
        type: "test:coverage",
        data: {
          nesting: 0,
          summary: {
            files: [
              {
                branches: [],
                coveredBranchCount: 1,
                coveredFunctionCount: 1,
                coveredLineCount: 1,
                coveredBranchPercent: 100,
                coveredFunctionPercent: 100,
                coveredLinePercent: 100,
                functions: [],
                lines: [{ count: 1, line: 1 }],
                path: resolve("packages/common/src/Foo.ts"),
                totalBranchCount: 1,
                totalFunctionCount: 1,
                totalLineCount: 1,
              },
            ],
            thresholds: { branch: 1, function: 1, line: 1 },
            totals: {
              coveredBranchCount: 1,
              coveredFunctionCount: 1,
              coveredLineCount: 1,
              coveredBranchPercent: 100,
              coveredFunctionPercent: 100,
              coveredLinePercent: 100,
              totalBranchCount: 1,
              totalFunctionCount: 1,
              totalLineCount: 1,
            },
            workingDirectory: process.cwd(),
          },
        },
      },
    ]);

    assertTrue(output.includes("Coverage threshold was not met."));
    assertTrue(output.includes("skipped 1"));
    assertTrue(output.includes("start of coverage report"));
    assertTrue(output.includes("Foo.ts"));
    assertFalse(output.includes("Test files:"));
  });
});
