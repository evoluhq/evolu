/**
 * Node.js-specific time utilities.
 *
 * @module
 */

import {
  assert,
  createTime,
  type Brand,
  Millis,
  type Time,
} from "@evolu/common";

/** {@link Time} with Node.js high-resolution nanosecond readings. */
export interface NodejsTime extends Time {
  /** Returns a monotonic high-resolution timestamp in nanoseconds. */
  readonly hrtime: () => HrTime;
}

/** Monotonic high-resolution timestamp in nanoseconds. */
export type HrTime = bigint & Brand<"HrTime">;

/** Elapsed nanoseconds measured using {@link HrTime}. */
export type HrDuration = bigint & Brand<"HrDuration">;

/** Creates a {@link NodejsTime} using `process.hrtime.bigint()`. */
export const createNodejsTime = (): NodejsTime => ({
  ...createTime(),
  hrtime: () => process.hrtime.bigint() as HrTime,
});

/**
 * Returns the elapsed nanoseconds between two high-resolution timestamps.
 *
 * Throws if `end` precedes `start`.
 */
export const hrDurationBetween = (start: HrTime, end: HrTime): HrDuration => {
  assert(end >= start, "High-resolution end time must not precede start time");
  return (end - start) as HrDuration;
};

/** Converts a high-resolution duration to the nearest millisecond. */
export const hrDurationToMillis = (duration: HrDuration): Millis =>
  Millis.orThrow(
    Number(
      (duration + nanosecondsPerMillisecond / 2n) / nanosecondsPerMillisecond,
    ),
  );

/** Converts milliseconds to an exact high-resolution duration. */
export const millisToHrDuration = (millis: Millis): HrDuration =>
  (BigInt(millis) * nanosecondsPerMillisecond) as HrDuration;

const nanosecondsPerMillisecond = 1_000_000n;
