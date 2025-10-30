/**
 * ⏳
 *
 * @module
 */

import { assert } from "./Assert.js";
import { DateIso, NonNegativeInt } from "./Type.js";

/** Retrieves the current time in milliseconds, similar to `Date.now()`. */
export interface Time {
  readonly now: () => number;
  readonly nowIso: () => DateIso;
}

export interface TimeDep {
  readonly time: Time;
}

/** Creates a {@link Time} using Date.now(). */
export const createTime = (): Time => {
  const time: Time = {
    now: () => {
      const iso = time.nowIso();
      return new globalThis.Date(iso).getTime();
    },
    nowIso: () => DateIso.orThrow(new globalThis.Date().toISOString()),
  };
  return time;
};

/**
 * Creates a {@link Time} that returns a monotonically increasing number based on
 * a queueMicrotask.
 */
export const createTestTime = (): Time => {
  let now = 0;
  const time: Time = {
    now: () => {
      const current = now;
      queueMicrotask(() => {
        now++;
      });
      return current;
    },
    nowIso: () =>
      DateIso.orThrow(new globalThis.Date(time.now()).toISOString()),
  };
  return time;
};

/** Single digit 0-9. Used internally for {@link DurationString} validation. */
export type D = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/**
 * Minutes and seconds 1-59. Used internally for {@link DurationString}
 * validation. Uses single digits for 1-9, full numbers for 10-59.
 */
export type MmSs =
  | Exclude<D, "0"> // 1..9 (single digit)
  | `1${D}` // 10..19
  | `2${D}` // 20..29
  | `3${D}` // 30..39
  | `4${D}` // 40..49
  | `5${D}`; // 50..59

/** Hours 1-23. Used internally for {@link DurationString} validation. */
export type Hours =
  | Exclude<D, "0"> // 1-9
  | `1${D}` // 10-19
  | `2${"0" | "1" | "2" | "3"}`; // 20-23

/** Days 1-99. Used internally for {@link DurationString} validation. */
export type Days = Exclude<D, "0"> | `${Exclude<D, "0">}${D}`;

/**
 * Template literal type for compile-time validated duration strings.
 *
 * Allowed patterns: basic units (ms, s, m, h, d) and logical combinations
 * (s+ms, m+s, h+m, d+h).
 *
 * Supported formats:
 *
 * - Milliseconds: `0ms`, `1ms`, `500ms`, `999ms`
 * - Seconds: `5s`, `30s` (1-59, single digit for 1-9)
 * - Minutes: `5m`, `30m` (1-59, single digit for 1-9)
 * - Hours: `1h`, `12h`, `23h` (1-23)
 * - Days: `1d`, `30d`, `99d` (1-99)
 * - Combinations: `1s 250ms`, `30m 15s`, `2h 45m`, `7d 12h`
 *
 * Note: Duration strings are for developer experience only - they provide
 * readable, compile-time validated expressions but should never be persisted or
 * parsed from users as they are not localized. Always convert to NonNegativeInt
 * (milliseconds) for storage and APIs.
 */
export type DurationString =
  | `${D}ms`
  | `${D}${D}ms`
  | `${D}${D}${D}ms`
  | `${MmSs}s`
  | `${MmSs}m`
  | `${Hours}h`
  | `${Days}d`
  | `${MmSs}s ${D}ms`
  | `${MmSs}s ${D}${D}ms`
  | `${MmSs}s ${D}${D}${D}ms`
  | `${MmSs}m ${MmSs}s`
  | `${Hours}h ${MmSs}m`
  | `${Days}d ${Hours}h`;

/**
 * Duration can be either a {@link DurationString} or milliseconds as
 * {@link NonNegativeInt}.
 */
export type Duration = DurationString | NonNegativeInt;

/**
 * Converts a duration to milliseconds.
 *
 * Accepts either a {@link DurationString} (e.g., "5m", "1h 30m") or milliseconds
 * as {@link NonNegativeInt}.
 *
 * ### Example
 *
 * ```ts
 * durationToNonNegativeInt("0ms"); // 0 ✅
 * durationToNonNegativeInt("500ms"); // 500 ✅
 * durationToNonNegativeInt("30s"); // 30000 ✅
 * durationToNonNegativeInt("5m"); // 300000 ✅
 * durationToNonNegativeInt("12h"); // 43200000 ✅
 * durationToNonNegativeInt("7d"); // 604800000 ✅
 * durationToNonNegativeInt("2h 45m"); // 9900000 ✅
 * durationToNonNegativeInt(5000); // 5000 ✅ (already milliseconds)
 * ```
 */
export const durationToNonNegativeInt = (
  duration: Duration,
): NonNegativeInt => {
  // If it's already a NonNegativeInt (milliseconds), return as-is
  if (typeof duration === "number") {
    return duration;
  }

  // Limit input length to prevent ReDoS attacks
  // Valid DurationString max: "99d 23h" = 7 chars, "59s 999ms" = 9 chars
  // Allow generous limit of 100 characters
  assert(
    duration.length <= 100,
    `Duration string too long (${duration.length} chars). This should never happen with DurationString type.`,
  );

  // Parse duration string
  const units = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000, // 24 * 60 * 60 * 1000
  } as const;

  let total = 0;
  // Match ms first to avoid ambiguity, then single-char units
  const matches = duration.match(/(\d+)(ms|[smhd])/g);

  if (!matches) {
    return 0 as NonNegativeInt;
  }

  const unitRegex = /(\d+)(ms|[smhd])/;
  for (const match of matches) {
    const result = unitRegex.exec(match);
    if (result) {
      const [, value, unit] = result;
      total += parseInt(value) * units[unit as keyof typeof units];
    }
  }

  return total as NonNegativeInt;
};
