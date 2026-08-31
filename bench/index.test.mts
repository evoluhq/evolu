import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
import { describe, it } from "node:test";
import { parseBenchmarkMode } from "./index.mts";

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
