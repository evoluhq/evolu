import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { Millis } from "@evolu/common";
import type { HrDuration, HrTime, NodejsTime } from "../src/index.ts";
import {
  createNodejsTime,
  hrDurationBetween,
  hrDurationToMillis,
  millisToHrDuration,
} from "../src/index.ts";

describe("NodejsTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("createNodejsTime exposes the native high-resolution clock", () => {
    vi.spyOn(process.hrtime, "bigint").mockReturnValue(123n);

    const time: NodejsTime = createNodejsTime();
    const now: HrTime = time.hrtime();

    expect(now).toBe(123n);
  });
});

describe("hrDurationBetween", () => {
  test("returns elapsed nanoseconds", () => {
    const result = hrDurationBetween(100n as HrTime, 125n as HrTime);

    expectTypeOf(result).toEqualTypeOf<HrDuration>();
    expect(result).toBe(25n);
  });

  test("rejects an end time before the start time", () => {
    expect(() => hrDurationBetween(125n as HrTime, 100n as HrTime)).toThrow(
      "High-resolution end time must not precede start time",
    );
  });
});

describe("hrDurationToMillis", () => {
  test("rounds to the nearest millisecond", () => {
    const result = hrDurationToMillis(1_499_999n as HrDuration);

    expectTypeOf(result).toEqualTypeOf<Millis>();
    expect(result).toBe(1);
    expect(hrDurationToMillis(1_500_000n as HrDuration)).toBe(2);
  });
});

describe("millisToHrDuration", () => {
  test("converts milliseconds to nanoseconds", () => {
    const result = millisToHrDuration(Millis.orThrow(2));

    expectTypeOf(result).toEqualTypeOf<HrDuration>();
    expect(result).toBe(2_000_000n);
  });
});
