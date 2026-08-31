import {
  assertEqual,
  assertThrowsInstanceOf,
  assertType,
  Millis,
} from "@evolu/common";
import { afterEach, describe, it, mock } from "node:test";
import type { HrDuration, HrTime, NodejsTime } from "./Time.ts";
import {
  createNodejsTime,
  hrDurationBetween,
  hrDurationToMillis,
  millisToHrDuration,
} from "./Time.ts";

describe("NodejsTime", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("createNodejsTime exposes the native high-resolution clock", () => {
    mock.method(process.hrtime, "bigint", () => 123n);

    const time: NodejsTime = createNodejsTime();
    const now: HrTime = time.hrtime();

    assertEqual(now, 123n);
  });
});

describe("hrDurationBetween", () => {
  it("returns elapsed nanoseconds", () => {
    const result = hrDurationBetween(100n as HrTime, 125n as HrTime);

    assertType<typeof result, HrDuration>();
    assertEqual(result, 25n);
  });

  it("rejects an end time before the start time", () => {
    assertEqual(
      assertThrowsInstanceOf(
        () => hrDurationBetween(125n as HrTime, 100n as HrTime),
        Error,
      ).message,
      "High-resolution end time must not precede start time",
    );
  });
});

describe("hrDurationToMillis", () => {
  it("rounds to the nearest millisecond", () => {
    const result = hrDurationToMillis(1_499_999n as HrDuration);

    assertType<typeof result, Millis>();
    assertEqual(result, 1);
    assertEqual(hrDurationToMillis(1_500_000n as HrDuration), 2);
  });
});

describe("millisToHrDuration", () => {
  it("converts milliseconds to nanoseconds", () => {
    const result = millisToHrDuration(Millis.orThrow(2));

    assertType<typeof result, HrDuration>();
    assertEqual(result, 2_000_000n);
  });
});
