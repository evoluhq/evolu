/**
 * Time representations, durations, and scheduling utilities.
 *
 * @module
 */

import { assert } from "./Assert.js";
import type { Brand } from "./Brand.js";
import type { yieldNow } from "./Task.js";
import { brand, DateIso, lessThan, NonNegativeInt } from "./Type.js";
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
  /** Returns current time in milliseconds. */
  readonly now: () => Millis;

  /** Returns current time as ISO string. */
  readonly nowIso: () => DateIso;

  /** Schedules a callback after the specified delay. */
  readonly setTimeout: (fn: () => void, delay: Duration) => TimeoutId;

  /** Cancels a timeout scheduled with {@link Time.setTimeout}. */
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

/**
 * Creates a {@link Time} using `Date.now()` and `globalThis.setTimeout`.
 *
 * Throws if the system clock returns an out-of-range value. This is intentional
 * — there's no reasonable fallback for a misconfigured clock.
 */
export const createTime = (): Time => ({
  now: () => Millis.orThrow(globalThis.Date.now()),

  nowIso: () => DateIso.orThrow(new globalThis.Date().toISOString()),

  setTimeout: (callback, delay) =>
    globalThis.setTimeout(
      callback,
      durationToMillis(delay),
    ) as unknown as TimeoutId,

  clearTimeout: (id) => {
    globalThis.clearTimeout(id as unknown as number);
  },
});

/**
 * Test {@link Time} with controllable timers.
 *
 * Call `advance(ms)` to move time forward and trigger any pending timeouts.
 */
export interface TestTime extends Time {
  /** Advances time by the specified duration, triggering pending timeouts. */
  readonly advance: (duration: Duration) => void;
}

/**
 * Creates a {@link TestTime} with controllable timers for testing.
 *
 * Time starts at `startAt` (default 0) and only advances when `advance()` is
 * called. Timeouts scheduled via `setTimeout` fire when time is advanced past
 * their deadline.
 *
 * Set `autoIncrement` to automatically increment time by 1ms after each `now()`
 * call via microtask (useful for tests that need monotonically increasing
 * values without explicit `advance()` calls).
 */
export const testCreateTime = (options?: {
  readonly startAt?: Millis;
  readonly autoIncrement?: boolean;
}): TestTime => {
  let now = options?.startAt ?? minMillis;
  const autoIncrement = options?.autoIncrement ?? false;
  let nextId = 1;

  const pending = new Map<number, { callback: () => void; runAt: number }>();

  return {
    now: () => {
      const result = now;
      if (autoIncrement) {
        queueMicrotask(() => {
          now = Millis.orThrow(now + 1);
        });
      }
      return result;
    },
    nowIso: () => DateIso.orThrow(new globalThis.Date(now).toISOString()),

    setTimeout: (callback, delay) => {
      const id = nextId++;
      pending.set(id, { callback, runAt: now + durationToMillis(delay) });
      return id as unknown as TimeoutId;
    },

    clearTimeout: (id) => {
      pending.delete(id as unknown as number);
    },

    advance: (duration) => {
      now = Millis.orThrow(now + durationToMillis(duration));

      for (const [id, timeout] of pending) {
        if (timeout.runAt <= now) {
          pending.delete(id);
          timeout.callback();
        }
      }
    },
  };
};

// Literal (not expression like 1 + 2) to preserve type for Brand<"LessThan...">
const maxMillisWithInfinity = 281474976710655;

/**
 * Milliseconds timestamp, like `Date.now()`.
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
export const Millis = brand(
  "Millis",
  lessThan(maxMillisWithInfinity)(NonNegativeInt),
);
export type Millis = typeof Millis.Type;

/** Minimum {@link Millis} value. */
export const minMillis = 0 as Millis;

/** Maximum {@link Millis} value. */
export const maxMillis = (maxMillisWithInfinity - 1) as Millis;

/**
 * Duration can be either a {@link DurationLiteral} or milliseconds as
 * {@link Millis}.
 */
export type Duration = DurationLiteral | Millis;

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
 * Each unit is limited to values that can't be expressed in the next larger
 * unit, ensuring every duration has exactly one canonical representation (e.g.,
 * 1000ms must be written as `"1s"`, not `"1000ms"`).
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
 * durationToMillis("7d"); // 604800000
 * durationToMillis(Millis.orThrow(5000)); // 5000 (already Millis)
 * ```
 */
export const durationToMillis = (duration: Duration): Millis => {
  if (typeof duration === "number") return duration;

  const num = parseFloat(duration);
  const unit = duration.endsWith("ms") ? "ms" : duration.at(-1)!;

  assert(unit in durationUnits, `Unknown duration unit: ${unit}`);

  return Millis.orThrow(
    Math.round(num * durationUnits[unit as keyof typeof durationUnits]),
  );
};

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
