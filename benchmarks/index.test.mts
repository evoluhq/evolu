import { describe, expect, test } from "vitest";
import { parseBenchmarkMode } from "./index.mts";

describe("parseBenchmarkMode", () => {
  test("parseBenchmarkMode defaults to default", () => {
    expect(
      parseBenchmarkMode({
        args: [],
        benchmarkName: "Storage",
      }),
    ).toBe("default");
  });

  test.each(["default", "update-baseline", "force-update-baseline"] as const)(
    "parseBenchmarkMode parses %s",
    (mode) => {
      expect(
        parseBenchmarkMode({
          args: [`--mode=${mode}`],
          benchmarkName: "Storage",
        }),
      ).toBe(mode);
    },
  );

  test("parseBenchmarkMode rejects unknown mode", () => {
    expect(() =>
      parseBenchmarkMode({
        args: ["--mode=check"],
        benchmarkName: "Storage",
      }),
    ).toThrow("Unknown Storage benchmark mode: check");
  });

  test("parseBenchmarkMode rejects removed quick mode", () => {
    expect(() =>
      parseBenchmarkMode({
        args: ["--mode=quick"],
        benchmarkName: "Storage",
      }),
    ).toThrow("Unknown Storage benchmark mode: quick");
  });

  test("parseBenchmarkMode rejects renamed full mode", () => {
    expect(() =>
      parseBenchmarkMode({
        args: ["--mode=full"],
        benchmarkName: "Storage",
      }),
    ).toThrow("Unknown Storage benchmark mode: full");
  });

  test("parseBenchmarkMode rejects duplicate modes", () => {
    expect(() =>
      parseBenchmarkMode({
        args: ["--mode=default", "--mode=update-baseline"],
        benchmarkName: "Storage",
      }),
    ).toThrow("The Storage benchmark accepts only one mode.");
  });
});
