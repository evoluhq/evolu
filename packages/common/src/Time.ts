/**
 * Time representations, durations, and scheduling utilities.
 *
 * @module
 */

import { assert } from "./Assert.js";
import type { Brand } from "./Brand.js";
import type { yieldNow } from "./Task.js";
import {
  brand,
  type DateIso,
  lessThan,
  type NonNaNNumber,
  NonNegativeInt,
  positive,
} from "./Type.js";
import type {
  Digit,
  Digit1To23,
  Digit1To51,
  Digit1To59,
  Digit1To6,
  Digit1To9,
  Digit1To99,
} from "./Types.js";

/** Time and timer operations. */
export interface Time {
  readonly now: {
    /** Returns current time as Unix epoch milliseconds. */
    (): Millis;

    /** Returns current time as an ISO 8601 UTC string. */
    (type: "DateIso"): DateIso;
  };

  readonly performance: {
    /** Unix epoch timestamp used as the origin for `performance.now()`. */
    readonly timeOrigin: PerformanceTimeOrigin;

    /**
     * Returns a high-resolution timestamp in milliseconds relative to
     * `performance.timeOrigin`.
     *
     * Unlike {@link Time.now}, this value is not Unix epoch time and is
     * unaffected by system clock adjustments. Like Node.js
     * `process.hrtime.bigint()`, it is suitable for measuring elapsed time, but
     * it uses the Web Performance API's number representation rather than
     * nanoseconds as a bigint.
     */
    readonly now: () => PerformanceTime;
  };

  /** Schedules a callback after the specified positive delay. */
  readonly setTimeout: (fn: () => void, delay: PositiveDuration) => TimeoutId;

  /**
   * Cancels a timeout scheduled with this instance's {@link Time.setTimeout}.
   *
   * Throws if the timeout was scheduled by another {@link Time} instance.
   */
  readonly clearTimeout: (id: TimeoutId) => void;
}

export interface TimeDep {
  readonly time: Time;
}

/**
 * Opaque type for timeout handles.
 *
 * Use with {@link Time.clearTimeout} to cancel a pending timeout.
 */
export type TimeoutId = Brand<"TimeoutId">;

interface TimeoutIdInternal {
  readonly owner: symbol;
  readonly clear: () => void;
}

/**
 * Creates a {@link Time} using `Date.now()`, `performance`, and
 * `globalThis.setTimeout`.
 *
 * Long timeouts are split into native timer chunks and tracked against an
 * absolute wall-clock deadline so late callback execution and system suspension
 * do not extend the requested delay. System clock adjustments can therefore
 * shorten or lengthen long timeouts.
 *
 * Throws if the system clock returns an out-of-range value. This is intentional
 * — there's no reasonable fallback for a misconfigured clock.
 */
export const createTime = (): Time => {
  const timeoutOwner = Symbol("Time");
  function now(): Millis;
  function now(type: "DateIso"): DateIso;
  function now(type?: "DateIso"): Millis | DateIso {
    const millis = getSystemNowMillis();
    return type === "DateIso" ? millisToDateIso(millis) : millis;
  }

  return {
    now,

    performance: {
      timeOrigin: globalThis.performance.timeOrigin as PerformanceTimeOrigin,
      now: () => globalThis.performance.now() as PerformanceTime,
    },

    setTimeout: (callback, duration) =>
      scheduleNativeTimeout(timeoutOwner, callback, duration),

    clearTimeout: (id) => {
      clearTimeoutId(timeoutOwner, id);
    },
  };
};

const scheduleNativeTimeout = (
  owner: symbol,
  callback: () => void,
  duration: PositiveDuration,
): TimeoutId => {
  const delay = durationToMillis(duration);
  let cancelled = false;
  let nativeId: ReturnType<typeof globalThis.setTimeout>;

  if (delay <= maxNativeTimeoutMillis) {
    nativeId = globalThis.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      callback();
    }, delay);
  } else {
    // Recompute each chunk from one absolute deadline so time elapsed while the
    // event loop is suspended, for example during system sleep, is not added again.
    const deadline = getSystemNowMillis() + delay;

    const onTimeout = (): void => {
      if (cancelled) return;

      const remaining = deadline - getSystemNowMillis();
      if (remaining > 0) {
        nativeId = globalThis.setTimeout(
          onTimeout,
          Math.min(remaining, maxNativeTimeoutMillis),
        );
        return;
      }

      cancelled = true;
      callback();
    };

    nativeId = globalThis.setTimeout(onTimeout, maxNativeTimeoutMillis);
  }

  return {
    owner,
    clear: () => {
      cancelled = true;
      globalThis.clearTimeout(nativeId);
    },
  } as unknown as TimeoutId;
};

/**
 * Maximum delay supported reliably by native timers: the largest positive
 * signed 32-bit integer, approximately 24.9 days in milliseconds. Longer
 * logical delays are scheduled in chunks to avoid native timer overflow.
 */
const maxNativeTimeoutMillis = 2 ** 31 - 1;

const getSystemNowMillis = (): Millis => Millis.orThrow(globalThis.Date.now());

const clearTimeoutId = (owner: symbol, id: TimeoutId): void => {
  const internal = id as unknown as TimeoutIdInternal;
  assert(
    internal.owner === owner,
    "TimeoutId was created by another Time instance",
  );
  internal.clear();
};

/**
 * Test {@link Time} with controllable timers.
 *
 * Call `advance(ms)` to move time forward and trigger any pending timeouts.
 */
export interface TestTime extends Time {
  /**
   * Advances time by the specified duration, triggering pending timeouts.
   *
   * Timeout callback errors propagate and leave time at the callback's
   * deadline. Throws if called while another advance is in progress.
   */
  readonly advance: (duration: Duration) => void;
}

export interface TestTimeDep {
  readonly time: TestTime;
}

/**
 * Creates a {@link TestTime} with controllable timers for testing.
 *
 * Time starts at `startAt` (default 0) and only advances when `advance()` is
 * called. Timeouts scheduled via `setTimeout` fire when time is advanced past
 * their deadline.
 *
 * Set `autoIncrement` to automatically increment time by 1ms after each
 * wall-clock or performance `now()` call. `"microtask"` increments after the
 * current turn, while `"sync"` increments immediately after each read. Omit it
 * to keep time fixed until `advance()` is called.
 */
export const testCreateTime = (options?: {
  readonly startAt?: Millis;
  readonly autoIncrement?: "microtask" | "sync";
}): TestTime => {
  const startAt = options?.startAt ?? minMillis;
  const autoIncrement = options?.autoIncrement;
  const timeoutOwner = Symbol("TestTime");
  let now = startAt;
  let nextId = 1;
  let advancing = false;

  const pending = new Map<number, { callback: () => void; runAt: Millis }>();
  const incrementNow = (): void => {
    now = Millis.orThrow(now + 1);
  };

  const getNowMillis = (): Millis => {
    const result = now;
    switch (autoIncrement) {
      case "sync":
        incrementNow();
        break;
      case "microtask":
        queueMicrotask(incrementNow);
        break;
    }
    return result;
  };
  function getNow(): Millis;
  function getNow(type: "DateIso"): DateIso;
  function getNow(type?: "DateIso"): Millis | DateIso {
    const millis = getNowMillis();
    return type === "DateIso" ? millisToDateIso(millis) : millis;
  }

  return {
    now: getNow,

    performance: {
      timeOrigin: Number(startAt) as PerformanceTimeOrigin,
      now: () => (getNowMillis() - startAt) as PerformanceTime,
    },

    setTimeout: (callback, delay) => {
      const runAt = Millis.orThrow(now + durationToMillis(delay));
      const id = nextId++;
      pending.set(id, { callback, runAt });
      return {
        owner: timeoutOwner,
        clear: () => {
          pending.delete(id);
        },
      } as unknown as TimeoutId;
    },

    clearTimeout: (id) => {
      clearTimeoutId(timeoutOwner, id);
    },

    advance: (duration) => {
      assert(!advancing, "TestTime.advance cannot be called while advancing");
      const target = Millis.orThrow(now + durationToMillis(duration));
      advancing = true;

      try {
        while (pending.size > 0) {
          let earliestId: number | null = null;
          let nextRunAt = Number.POSITIVE_INFINITY;

          for (const [id, timeout] of pending) {
            if (timeout.runAt <= target && timeout.runAt < nextRunAt) {
              earliestId = id;
              nextRunAt = timeout.runAt;
            }
          }

          if (earliestId === null) break;

          const timeout = pending.get(earliestId)!;
          pending.delete(earliestId);
          now = Millis.orThrow(Math.max(now, nextRunAt));
          timeout.callback();
        }

        now = Millis.orThrow(Math.max(now, target));
      } finally {
        advancing = false;
      }
    },
  };
};

// Literal (not expression like 1 + 2) to preserve type for Brand<"LessThan...">
const maxMillisWithInfinity = 281474976710655;

/**
 * Non-negative integer milliseconds used for timestamps and durations.
 *
 * The maximum value is 281474976710654 (281474976710655 - 1, reserved for
 * infinity). This enables efficient binary serialization, saving 2 bytes
 * compared to typical 8-byte (64-bit) timestamps.
 *
 * `new Date(281474976710654).toString()` = Tue Aug 02 10889 07:31:49
 *
 * If a system clock exceeds this range, operations will throw. This is
 * intentional — there's no reasonable fallback for a misconfigured clock.
 */
export const Millis = /*#__PURE__*/ brand(
  "Millis",
  /*#__PURE__*/ lessThan(maxMillisWithInfinity)(NonNegativeInt),
);
export type Millis = typeof Millis.Type;

/** Positive {@link Millis} value. */
export const PositiveMillis = /*#__PURE__*/ positive(Millis);
export type PositiveMillis = typeof PositiveMillis.Type;

/** Minimum {@link Millis} value. */
export const minMillis = 0 as Millis;

/** Maximum {@link Millis} value. */
export const maxMillis = (maxMillisWithInfinity - 1) as Millis;

/**
 * Converts a number to {@link Millis}, rounding to the nearest millisecond and
 * saturating overflow at {@link maxMillis}.
 */
export const saturateMillis = (value: NonNaNNumber): Millis =>
  Millis.orNull(Math.max(0, Math.round(value))) ?? maxMillis;

/**
 * Converts {@link Millis} to {@link DateIso}.
 *
 * This is a safe cast because {@link Millis} guarantees a valid timestamp range
 * that always produces a valid ISO string.
 */
export const millisToDateIso = (value: Millis): DateIso =>
  new globalThis.Date(value).toISOString() as DateIso;

/** Unix epoch milliseconds used as the origin for {@link PerformanceTime}. */
export type PerformanceTimeOrigin = number & Brand<"PerformanceTimeOrigin">;

/** High-resolution milliseconds elapsed since {@link PerformanceTimeOrigin}. */
export type PerformanceTime = number & Brand<"PerformanceTime">;

/** Elapsed fractional milliseconds measured using {@link PerformanceTime}. */
export type PerformanceDuration = number & Brand<"PerformanceDuration">;

/**
 * Returns the elapsed fractional milliseconds between two performance times.
 *
 * Throws if `end` precedes `start`.
 */
export const performanceDurationBetween = (
  start: PerformanceTime,
  end: PerformanceTime,
): PerformanceDuration => {
  assert(end >= start, "Performance end time must not precede start time");
  return (end - start) as PerformanceDuration;
};

/**
 * Duration can be either a {@link DurationLiteral} or milliseconds as
 * {@link Millis}.
 */
export type Duration = DurationLiteral | Millis;

/** Positive duration accepted by timer-based APIs. */
export type PositiveDuration = DurationLiteral | PositiveMillis;

/**
 * Duration literal with compile-time validation.
 *
 * Supported formats:
 *
 * - Milliseconds: `1ms`, `500ms`, `999ms` (1-999)
 * - Seconds: `1s`, `59s`, `12.5s` (1-59, 1.1-59.9)
 * - Minutes: `1m`, `59m`, `12.5m` (1-59, 1.1-59.9)
 * - Hours: `1h`, `23h`, `12.5h` (1-23, 1.1-23.9)
 * - Days: `1d`, `6d`, `1.5d` (1-6, 1.1-6.9)
 * - Weeks: `1w`, `51w`, `1.5w` (1-51, 1.1-51.9)
 * - Months: not supported (variable length)
 * - Years: `1y`, `99y`, `1.5y` (1-99, 1.1-99.9)
 *
 * Each unit uses a bounded range. Where units convert exactly, this avoids
 * equivalent representations (e.g., 1000ms must be written as `"1s"`, not
 * `"1000ms"`).
 *
 * Decimal values cover cases like 1.5s (1500ms) or 1.5h (90 minutes) without
 * allowing redundant forms. For precise values that don't fit (e.g., 1050ms),
 * use {@link Millis} directly.
 *
 * Zero duration (0ms) is not supported. For yielding without delay, use `await
 * Promise.resolve()` for microtasks or the {@link yieldNow} for macrotasks.
 *
 * See {@link Duration} for a type that also accepts {@link Millis}. Use
 * {@link durationToMillis} to convert to milliseconds.
 */
export type DurationLiteral =
  | DurationLiteralMilliseconds
  | DurationLiteralSeconds
  | DurationLiteralMinutes
  | DurationLiteralHours
  | DurationLiteralDays
  | DurationLiteralWeeks
  | DurationLiteralYears;

/** Milliseconds duration: `"1ms"` to `"999ms"`. See {@link DurationLiteral}. */
export type DurationLiteralMilliseconds =
  | `${Digit1To9}ms` // 1-9
  | `${Digit1To9}${Digit}ms` // 10-99
  | `${Digit1To9}${Digit}${Digit}ms`; // 100-999

/**
 * Seconds duration: `"1s"` to `"59s"` or `"1.1s"` to `"59.9s"`. See
 * {@link DurationLiteral}.
 */
export type DurationLiteralSeconds =
  | `${Digit1To59}s` // 1-59
  | `${Digit1To59}.${Digit1To9}s`; // 1.1-59.9

/**
 * Minutes duration: `"1m"` to `"59m"` or `"1.1m"` to `"59.9m"`. See
 * {@link DurationLiteral}.
 */
export type DurationLiteralMinutes =
  | `${Digit1To59}m` // 1-59
  | `${Digit1To59}.${Digit1To9}m`; // 1.1-59.9

/**
 * Hours duration: `"1h"` to `"23h"` or `"1.1h"` to `"23.9h"`. See
 * {@link DurationLiteral}.
 */
export type DurationLiteralHours =
  | `${Digit1To23}h` // 1-23
  | `${Digit1To23}.${Digit1To9}h`; // 1.1-23.9

/**
 * Days duration: `"1d"` to `"6d"` or `"1.1d"` to `"6.9d"`. See
 * {@link DurationLiteral}.
 */
export type DurationLiteralDays =
  | `${Digit1To6}d` // 1-6
  | `${Digit1To6}.${Digit1To9}d`; // 1.1-6.9

/**
 * Weeks duration: `"1w"` to `"51w"` or `"1.1w"` to `"51.9w"`. See
 * {@link DurationLiteral}.
 */
export type DurationLiteralWeeks =
  | `${Digit1To51}w` // 1-51
  | `${Digit1To51}.${Digit1To9}w`; // 1.1-51.9

/**
 * Years duration: `"1y"` to `"99y"` or `"1.1y"` to `"99.9y"`. See
 * {@link DurationLiteral}.
 */
export type DurationLiteralYears =
  | `${Digit1To99}y` // 1-99
  | `${Digit1To99}.${Digit1To9}y`; // 1.1-99.9

/**
 * Converts a duration to milliseconds.
 *
 * Accepts either a {@link DurationLiteral} (e.g., "5m", "1.5s") or
 * {@link Millis}.
 *
 * ### Example
 *
 * ```ts
 * durationToMillis("1ms"); // 1
 * durationToMillis("500ms"); // 500
 * durationToMillis("1.5s"); // 1500
 * durationToMillis("30s"); // 30000
 * durationToMillis("5m"); // 300000
 * durationToMillis("12h"); // 43200000
 * durationToMillis("1w"); // 604800000
 * durationToMillis(Millis.orThrow(5000)); // 5000 (already Millis)
 * ```
 */
export function durationToMillis(
  duration: DurationLiteral | PositiveMillis,
): PositiveMillis;
export function durationToMillis(duration: Duration): Millis;
export function durationToMillis(duration: Duration): Millis {
  if (typeof duration === "number") return duration;

  const num = parseFloat(duration);
  const unit = duration.endsWith("ms") ? "ms" : duration.at(-1)!;

  assert(unit in durationUnits, `Unknown duration unit: ${unit}`);

  return Millis.orThrow(
    Math.round(num * durationUnits[unit as keyof typeof durationUnits]),
  );
}

const durationUnits = {
  ms: 1,
  s: 1000,
  m: 60000,
  h: 3600000,
  d: 86400000,
  w: 604800000, // 7 days
  y: 31536000000, // 365 days
} as const;

/**
 * Frame budget at 60fps (16ms).
 *
 * Work exceeding this blocks a frame, causing visible jank in animations.
 */
export const ms60fps = 16 as Millis;

/**
 * Frame budget at 120fps (8ms).
 *
 * For high refresh rate displays. Work exceeding this blocks a frame.
 */
export const ms120fps = 8 as Millis;

/**
 * Long task threshold (50ms).
 *
 * Tasks exceeding this are "long tasks" per web standards. Use with
 * {@link yieldNow} to yield periodically and keep UI responsive.
 *
 * @see https://web.dev/articles/optimize-long-tasks
 */
export const msLongTask = 50 as Millis;

/**
 * Formats {@link Millis} as a human-readable duration string.
 *
 * - Under 1 minute: `1.234s`
 * - Under 1 hour: `1m30.000s`
 * - Under 1 day: `1h30m45.000s`
 * - Under 1 week: `1d2h30m45.000s`
 * - Under 1 year: `1w2d3h30m45.000s`
 * - 1 year or more: `1y2w3d4h30m45.000s`
 *
 * Weeks are 7 days and years are 365 days.
 *
 * ### Example
 *
 * ```ts
 * formatMillisAsDuration(1234 as Millis); // "1.234s"
 * formatMillisAsDuration(90000 as Millis); // "1m30.000s"
 * formatMillisAsDuration(3661000 as Millis); // "1h1m1.000s"
 * formatMillisAsDuration(90061000 as Millis); // "1d1h1m1.000s"
 * ```
 */
export const formatMillisAsDuration = (millis: Millis): string => {
  const seconds = ((millis % durationUnits.m) / durationUnits.s).toFixed(3);
  if (millis < durationUnits.m) return `${seconds}s`;

  const minutes = Math.floor(millis / durationUnits.m) % 60;
  if (millis < durationUnits.h) return `${minutes}m${seconds}s`;

  const hours = Math.floor(millis / durationUnits.h) % 24;
  if (millis < durationUnits.d) return `${hours}h${minutes}m${seconds}s`;

  const daysAfterYears = Math.floor(
    (millis % durationUnits.y) / durationUnits.d,
  );
  const days = daysAfterYears % 7;
  if (millis < durationUnits.w)
    return `${days}d${hours}h${minutes}m${seconds}s`;

  const weeks = Math.floor(daysAfterYears / 7);
  if (millis < durationUnits.y)
    return `${weeks}w${days}d${hours}h${minutes}m${seconds}s`;

  const years = Math.floor(millis / durationUnits.y);
  return `${years}y${weeks}w${days}d${hours}h${minutes}m${seconds}s`;
};

/**
 * Formats {@link Millis} as local time in `HH:MM:SS.mmm` format.
 *
 * ### Example
 *
 * ```ts
 * formatMillisAsClockTime(Millis.orThrow(Date.now())); // "14:32:15.234"
 * ```
 */
export const formatMillisAsClockTime = (millis: Millis): string => {
  const date = new globalThis.Date(millis);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
};
