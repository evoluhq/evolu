import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
import { describe, it } from "node:test";
import { parseBenchmarkMode, parseComparisonArgs } from "./index.mts";

describe("parseBenchmarkMode", () => {
  it("parseBenchmarkMode defaults to default", () => {
    assertEqual(
      parseBenchmarkMode({
        args: [],
        benchmarkName: "Storage",
      }),
      "default",
    );
  });

  for (const mode of [
    "default",
    "update-baseline",
    "force-update-baseline",
  ] as const) {
    it(`parseBenchmarkMode parses ${mode}`, () => {
      assertEqual(
        parseBenchmarkMode({
          args: [`--mode=${mode}`],
          benchmarkName: "Storage",
        }),
        mode,
      );
    });
  }

  it("parseBenchmarkMode rejects unknown mode", () => {
    assertEqual(
      assertThrowsInstanceOf(
        () =>
          parseBenchmarkMode({
            args: ["--mode=check"],
            benchmarkName: "Storage",
          }),
        Error,
      ).message,
      "Unknown Storage benchmark mode: check",
    );
  });

  it("parseBenchmarkMode rejects removed quick mode", () => {
    assertEqual(
      assertThrowsInstanceOf(
        () =>
          parseBenchmarkMode({
            args: ["--mode=quick"],
            benchmarkName: "Storage",
          }),
        Error,
      ).message,
      "Unknown Storage benchmark mode: quick",
    );
  });

  it("parseBenchmarkMode rejects renamed full mode", () => {
    assertEqual(
      assertThrowsInstanceOf(
        () =>
          parseBenchmarkMode({
            args: ["--mode=full"],
            benchmarkName: "Storage",
          }),
        Error,
      ).message,
      "Unknown Storage benchmark mode: full",
    );
  });

  it("parseBenchmarkMode rejects duplicate modes", () => {
    assertEqual(
      assertThrowsInstanceOf(
        () =>
          parseBenchmarkMode({
            args: ["--mode=default", "--mode=update-baseline"],
            benchmarkName: "Storage",
          }),
        Error,
      ).message,
      "The Storage benchmark accepts only one mode.",
    );
  });
});

describe("parseComparisonArgs", () => {
  const errorMessage = (args: ReadonlyArray<string>): string =>
    assertThrowsInstanceOf(() => parseComparisonArgs(args, "Storage"), Error)
      .message;

  it("removes the comparison options and returns their values", () => {
    assertEqual(
      parseComparisonArgs(
        ["--base-checkout=../other", "--mode=default", "--max-regression=20"],
        "Storage",
      ),
      {
        baseCheckout: "../other",
        maxRegressionPercent: 20,
        otherArgs: ["--mode=default"],
      },
    );
  });

  it("returns null for options that are not passed", () => {
    assertEqual(parseComparisonArgs(["--mode=default"], "Storage"), {
      baseCheckout: null,
      maxRegressionPercent: null,
      otherArgs: ["--mode=default"],
    });
  });

  it("rejects an option without a value", () => {
    assertEqual(
      errorMessage(["--base-checkout"]),
      "Pass a value as --base-checkout=<value>.",
    );
    assertEqual(
      errorMessage(["--max-regression="]),
      "Pass a value as --max-regression=<value>.",
    );
  });

  it("rejects a repeated option", () => {
    assertEqual(
      errorMessage(["--base-checkout=a", "--base-checkout=b"]),
      "The Storage benchmark accepts only one --base-checkout.",
    );
  });

  it("rejects a threshold that is not a positive whole percentage", () => {
    for (const value of [
      "0",
      "-5",
      "12.5",
      "20%",
      "1e1",
      "0x14",
      "+20",
      "20.0",
      " 20",
      "020",
    ]) {
      assertEqual(
        errorMessage([`--max-regression=${value}`]),
        `Pass --max-regression as a whole percentage, such as --max-regression=20, not ${value}.`,
      );
    }
  });
});
