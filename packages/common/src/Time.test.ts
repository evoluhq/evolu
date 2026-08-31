import { afterEach, describe, it, mock } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertLength,
  assertSame,
  assertThrowsInstanceOf,
  assertThrowsSame,
  assertTrue,
} from "./Assert.ts";

import type {
  Duration,
  PerformanceDuration,
  PerformanceTime,
  PerformanceTimeOrigin,
  PositiveDuration,
} from "./Time.ts";
import {
  createTime,
  DurationLiteral,
  DurationLiteralDays,
  DurationLiteralHours,
  DurationLiteralMilliseconds,
  DurationLiteralMinutes,
  DurationLiteralSeconds,
  DurationLiteralWeeks,
  DurationLiteralYears,
  durationToMillis,
  formatMillisAsClockTime,
  formatMillisAsDuration,
  maxMillis,
  Millis,
  millisToDateIso,
  performanceDurationBetween,
  PositiveMillis,
  saturateMillis,
  testCreateTime,
} from "./Time.ts";
import { assertType, type DateIso, NonNaNNumber } from "./Type.ts";

const negativeMillisCause = {
  type: "NonNegative",
  value: -1,
};

const assertThrowsWithCause = (run: () => unknown, cause: unknown): void => {
  const error = assertThrowsInstanceOf(run, Error);
  assertEqual(error.message, "getOrThrow");
  assertEqual(error.cause, cause);
};

describe("Time", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe("createTime", () => {
    it("now returns current time", () => {
      mock.method(Date, "now", () => 123);

      assertEqual(createTime().now(), 123);
    });

    it('now with "DateIso" returns current time as ISO string', () => {
      const time = createTime();
      const result: DateIso = time.now("DateIso");
      assertTrue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result));
      const parsed = Date.parse(result);
      assertTrue(parsed >= Date.now() - 100);
      assertTrue(parsed <= Date.now() + 100);
    });

    it("performance exposes the native clock", () => {
      mock.method(performance, "now", () => 123.456);

      const time = createTime();
      const now: PerformanceTime = time.performance.now();
      const timeOrigin: PerformanceTimeOrigin = time.performance.timeOrigin;

      assertEqual(now, 123.456);
      assertEqual(timeOrigin, performance.timeOrigin);
    });

    describe("setTimeout", () => {
      it("fires after the delay", () => {
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const setTimeout = mock.method(
          globalThis,
          "setTimeout",
          (callback: () => void) => {
            callbacks.push(callback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          },
        );
        mock.method(Date, "now", () => now);
        const callback = mock.fn<() => void>();

        createTime().setTimeout(callback, "10ms");

        assertLength(setTimeout.mock.calls, 1);
        assertSame(setTimeout.mock.calls[0].arguments[0], callbacks[0]);
        assertEqual(setTimeout.mock.calls[0].arguments[1], 10);
        assertEqual(callback.mock.callCount(), 0);

        now += 10;
        callbacks[0]();

        assertEqual(callback.mock.callCount(), 1);
      });

      it("native-range timeout ignores wall-clock changes", () => {
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const setTimeout = mock.method(
          globalThis,
          "setTimeout",
          (scheduledCallback: () => void) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          },
        );
        mock.method(Date, "now", () => now);
        const callback = mock.fn<() => void>();

        createTime().setTimeout(callback, "10ms");
        now -= 1000;
        callbacks[0]();

        assertEqual(setTimeout.mock.callCount(), 1);
        assertEqual(callback.mock.callCount(), 1);
      });

      it("maximum native delay uses one native timer", () => {
        const maxNativeTimeoutMillis = 2 ** 31 - 1;
        const callbacks: Array<() => void> = [];
        const setTimeout = mock.method(
          globalThis,
          "setTimeout",
          (scheduledCallback: () => void) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          },
        );
        const dateNow = mock.method(Date, "now");
        const callback = mock.fn<() => void>();

        createTime().setTimeout(
          callback,
          PositiveMillis.orThrow(maxNativeTimeoutMillis),
        );

        assertLength(setTimeout.mock.calls, 1);
        assertSame(setTimeout.mock.calls[0].arguments[0], callbacks[0]);
        assertEqual(
          setTimeout.mock.calls[0].arguments[1],
          maxNativeTimeoutMillis,
        );
        assertEqual(dateNow.mock.callCount(), 0);

        callbacks[0]();

        assertEqual(setTimeout.mock.callCount(), 1);
        assertEqual(callback.mock.callCount(), 1);
      });

      it("accounts for elapsed time while a long timeout is suspended", () => {
        const maxNativeTimeoutMillis = 2 ** 31 - 1;
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const delays: Array<number | undefined> = [];
        const callback = mock.fn<() => void>();

        mock.method(Date, "now", () => now);
        mock.method(
          globalThis,
          "setTimeout",
          (scheduledCallback: () => void, delay?: number) => {
            callbacks.push(scheduledCallback);
            delays.push(delay);
            return callbacks.length as unknown as ReturnType<typeof setTimeout>;
          },
        );

        createTime().setTimeout(
          callback,
          PositiveMillis.orThrow(maxNativeTimeoutMillis + 100),
        );

        assertEqual(delays, [maxNativeTimeoutMillis]);

        // Simulate the native timer firing 50ms late after event-loop suspension.
        now += maxNativeTimeoutMillis + 50;
        callbacks[0]();

        // Only 50ms remains; do not add the elapsed 50ms again.
        assertEqual(delays, [maxNativeTimeoutMillis, 50]);
        assertEqual(callback.mock.callCount(), 0);

        now += 50;
        callbacks[1]();

        assertEqual(callback.mock.callCount(), 1);
      });

      it("rejects an invalid clock when scheduling a long timeout", () => {
        const setTimeout = mock.method(
          globalThis,
          "setTimeout",
          () => 1 as unknown as ReturnType<typeof globalThis.setTimeout>,
        );
        mock.method(Date, "now", () => -1);

        assertThrowsWithCause(
          () =>
            createTime().setTimeout(
              () => undefined,
              PositiveMillis.orThrow(2 ** 31),
            ),
          negativeMillisCause,
        );
        assertEqual(setTimeout.mock.callCount(), 0);
      });

      it("rejects an invalid clock while processing a long timeout", () => {
        const callbacks: Array<() => void> = [];
        let now = 1000;
        mock.method(Date, "now", () => now);
        mock.method(
          globalThis,
          "setTimeout",
          (scheduledCallback: () => void) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<typeof setTimeout>;
          },
        );
        createTime().setTimeout(
          () => undefined,
          PositiveMillis.orThrow(2 ** 31),
        );
        now = -1;

        assertThrowsWithCause(() => callbacks[0](), negativeMillisCause);
        assertLength(callbacks, 1);
      });

      it("clearTimeout cancels the active chunk of a long delay", () => {
        const maxNativeTimeoutMillis = 2 ** 31 - 1;
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const callback = mock.fn<() => void>();
        const clearTimeout = mock.method(
          globalThis,
          "clearTimeout",
          () => undefined,
        );

        mock.method(Date, "now", () => now);
        mock.method(
          globalThis,
          "setTimeout",
          (scheduledCallback: () => void) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<typeof setTimeout>;
          },
        );

        const time = createTime();
        const id = time.setTimeout(
          callback,
          PositiveMillis.orThrow(maxNativeTimeoutMillis + 100),
        );

        now += maxNativeTimeoutMillis;
        callbacks[0]();
        time.clearTimeout(id);
        callbacks[1]();

        assertLength(clearTimeout.mock.calls, 1);
        assertEqual(clearTimeout.mock.calls[0].arguments[0], 2);
        assertEqual(callback.mock.callCount(), 0);
      });

      it("clearTimeout cancels a single native timeout", () => {
        const callbacks: Array<() => void> = [];
        const callback = mock.fn<() => void>();
        const clearTimeout = mock.method(
          globalThis,
          "clearTimeout",
          () => undefined,
        );

        mock.method(
          globalThis,
          "setTimeout",
          (scheduledCallback: () => void) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<typeof setTimeout>;
          },
        );

        const time = createTime();
        const id = time.setTimeout(callback, "10ms");

        time.clearTimeout(id);
        callbacks[0]();

        assertLength(clearTimeout.mock.calls, 1);
        assertEqual(clearTimeout.mock.calls[0].arguments[0], 1);
        assertEqual(callback.mock.callCount(), 0);
      });

      it("clearTimeout rejects an id created by another Time instance", () => {
        mock.method(
          globalThis,
          "setTimeout",
          () => 1 as unknown as ReturnType<typeof setTimeout>,
        );
        const firstTime = createTime();
        const secondTime = createTime();
        const id = firstTime.setTimeout(() => undefined, "10ms");

        const error = assertThrowsInstanceOf(
          () => secondTime.clearTimeout(id),
          Error,
        );
        assertTrue(
          error.message.includes(
            "TimeoutId was created by another Time instance",
          ),
        );
      });
    });
  });

  describe("testCreateTime", () => {
    it("advances time only when advance() is called", () => {
      const time = testCreateTime();

      assertEqual(time.now(), 0);
      // Still 0, no auto-increment
      assertEqual(time.now(), 0);

      time.advance("1ms");
      assertEqual(time.now(), 1);

      time.advance("100ms");
      assertEqual(time.now(), 101);

      time.advance("1s");
      assertEqual(time.now(), 1101);
    });

    it("with autoIncrement returns monotonically increasing values", async () => {
      const time = testCreateTime({ autoIncrement: "microtask" });
      const first = time.now();

      await Promise.resolve();

      const second = time.now();

      await Promise.resolve();

      const third = time.now();

      assertEqual(first, 0);
      assertEqual(second, 1);
      assertEqual(third, 2);
    });

    it("with sync autoIncrement increments within the same turn", () => {
      const time = testCreateTime({ autoIncrement: "sync" });

      assertEqual(time.now(), 0);
      assertEqual(time.now(), 1);
      assertEqual(time.now("DateIso"), "1970-01-01T00:00:00.002Z");
      assertEqual(time.now(), 3);
    });

    it('now with "DateIso" respects autoIncrement', async () => {
      const time = testCreateTime({
        autoIncrement: "microtask",
        startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 0) as Millis,
      });

      const first = time.now("DateIso");

      await Promise.resolve();

      const second = time.now("DateIso");

      assertEqual(first, "2026-01-28T14:30:00.000Z");
      assertEqual(second, "2026-01-28T14:30:00.001Z");
    });

    it('now with "DateIso" returns ISO string for current time', () => {
      const time = testCreateTime({
        startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 0) as Millis,
      });
      assertEqual(time.now("DateIso"), "2026-01-28T14:30:00.000Z");
    });

    it("performance starts at its time origin and advances with time", () => {
      const time = testCreateTime({ startAt: Millis.orThrow(1000) });

      assertEqual(time.performance.timeOrigin, 1000);
      assertEqual(time.performance.now(), 0);

      time.advance("100ms");

      assertEqual(time.performance.now(), 100);
    });

    it("performance respects sync autoIncrement", () => {
      const time = testCreateTime({ autoIncrement: "sync" });

      assertEqual(time.performance.now(), 0);
      assertEqual(time.now(), 1);
    });

    it("setTimeout fires callback when time is advanced past deadline", () => {
      const time = testCreateTime();
      let called = false;

      time.setTimeout(() => {
        called = true;
      }, "100ms");

      assertFalse(called);

      time.advance("50ms");
      assertFalse(called);

      time.advance("50ms");
      assertTrue(called);
    });

    it("setTimeout rejects a deadline after maxMillis", () => {
      const time = testCreateTime({ startAt: maxMillis });

      assertThrowsWithCause(() => time.setTimeout(() => undefined, "1ms"), {
        type: "LessThan281474976710655",
        value: maxMillis + 1,
        max: maxMillis + 1,
      });
    });

    it("clearTimeout cancels pending timeout", () => {
      const time = testCreateTime();
      let called = false;

      const id = time.setTimeout(() => {
        called = true;
      }, "100ms");

      time.clearTimeout(id);
      time.advance("200ms");

      assertFalse(called);
    });

    it("clearTimeout rejects an id created by another Time instance", () => {
      const firstTime = testCreateTime();
      const secondTime = testCreateTime();
      const secondCallback = mock.fn<() => void>();
      const id = firstTime.setTimeout(() => undefined, "100ms");
      secondTime.setTimeout(secondCallback, "100ms");

      const error = assertThrowsInstanceOf(
        () => secondTime.clearTimeout(id),
        Error,
      );
      assertTrue(
        error.message.includes(
          "TimeoutId was created by another Time instance",
        ),
      );

      secondTime.advance("100ms");
      assertEqual(secondCallback.mock.callCount(), 1);
    });

    it("multiple timeouts fire in deadline order", () => {
      const time = testCreateTime();
      const order: Array<number> = [];

      time.setTimeout(() => {
        order.push(1);
      }, "100ms");
      time.setTimeout(() => {
        order.push(2);
      }, "50ms");
      time.setTimeout(() => {
        order.push(3);
      }, "150ms");

      time.advance("200ms");

      assertEqual(order, [2, 1, 3]);
    });

    it("timeouts with identical deadlines fire in scheduling order", () => {
      const time = testCreateTime();
      const order: Array<number> = [];

      time.setTimeout(() => {
        order.push(1);
      }, "50ms");
      time.setTimeout(() => {
        order.push(2);
      }, "50ms");
      time.setTimeout(() => {
        order.push(3);
      }, "50ms");

      time.advance("50ms");

      assertEqual(order, [1, 2, 3]);
    });

    it("timeout callbacks observe their deadlines", () => {
      const time = testCreateTime();
      const observedTimes: Array<Millis> = [];

      time.setTimeout(() => {
        observedTimes.push(time.now());
      }, "100ms");
      time.setTimeout(() => {
        observedTimes.push(time.now());
      }, "50ms");

      time.advance("200ms");

      assertEqual(observedTimes, [50, 100]);
      assertEqual(time.now(), 200);
    });

    it("advance fires timeouts scheduled by callbacks within its target", () => {
      const time = testCreateTime();
      const observedTimes: Array<Millis> = [];

      time.setTimeout(() => {
        observedTimes.push(time.now());
        time.setTimeout(() => {
          observedTimes.push(time.now());
        }, "50ms");
      }, "50ms");

      time.advance("200ms");

      assertEqual(observedTimes, [50, 100]);
      assertEqual(time.now(), 200);
    });

    it("an earlier timeout can cancel a later timeout", () => {
      const time = testCreateTime();
      const callback = mock.fn<() => void>();
      const laterId = time.setTimeout(callback, "100ms");
      time.setTimeout(() => time.clearTimeout(laterId), "50ms");

      time.advance("200ms");

      assertEqual(callback.mock.callCount(), 0);
    });

    it("a throwing callback aborts advance at its deadline", () => {
      const time = testCreateTime();
      const error = new Error("callback failed");
      const laterCallback = mock.fn<() => void>();

      time.setTimeout(() => {
        throw error;
      }, "50ms");
      time.setTimeout(laterCallback, "100ms");

      assertThrowsSame(() => time.advance("200ms"), error);
      assertEqual(time.now(), 50);
      assertEqual(laterCallback.mock.callCount(), 0);

      time.advance("150ms");

      assertEqual(laterCallback.mock.callCount(), 1);
      assertEqual(time.now(), 200);
    });

    it("advance rejects reentrant calls", () => {
      const time = testCreateTime();

      time.setTimeout(() => {
        const error = assertThrowsInstanceOf(() => time.advance("1ms"), Error);
        assertTrue(
          error.message.includes(
            "TestTime.advance cannot be called while advancing",
          ),
        );
      }, "50ms");

      time.advance("100ms");

      assertEqual(time.now(), 100);
    });

    it("advance preserves auto-incremented time", () => {
      const time = testCreateTime({ autoIncrement: "sync" });
      const observedTimes: Array<Millis> = [];

      time.setTimeout(() => {
        observedTimes.push(time.now());
      }, "50ms");
      time.setTimeout(() => {
        observedTimes.push(time.now());
      }, "50ms");

      time.advance("50ms");

      assertEqual(observedTimes, [50, 51]);
      assertEqual(time.now(), 52);
    });
  });

  describe("PositiveMillis", () => {
    it("accepts only positive millis", () => {
      const millis: Millis = PositiveMillis.orThrow(1);
      assertType<typeof millis, Millis>();
      assertTrue(PositiveMillis.is(1));
      assertTrue(PositiveMillis.is(maxMillis));
      assertFalse(PositiveMillis.is(0));
    });
  });

  describe("saturateMillis", () => {
    it("requires NonNaNNumber", () => {
      saturateMillis(NonNaNNumber.orThrow(1));
      // @ts-expect-error - Numbers require validation.
      saturateMillis(1);
    });

    it("rounds to the nearest millisecond", () => {
      assertEqual(saturateMillis(NonNaNNumber.orThrow(1.4)), 1);
      assertEqual(saturateMillis(NonNaNNumber.orThrow(1.5)), 2);
    });

    it("saturates negative values at min millis", () => {
      assertEqual(saturateMillis(NonNaNNumber.orThrow(-1)), 0);
      assertEqual(
        saturateMillis(NonNaNNumber.orThrow(Number.NEGATIVE_INFINITY)),
        0,
      );
    });

    it("saturates overflow at maxMillis", () => {
      assertEqual(
        saturateMillis(NonNaNNumber.orThrow(maxMillis + 1)),
        maxMillis,
      );
      assertEqual(
        saturateMillis(NonNaNNumber.orThrow(Number.POSITIVE_INFINITY)),
        maxMillis,
      );
    });
  });

  describe("millisToDateIso", () => {
    it("millisToDateIso returns current time as ISO string", () => {
      const time = createTime();
      const result = millisToDateIso(time.now());
      // Verify it's a valid ISO string
      assertTrue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result));
      // And it's close to now
      const parsed = Date.parse(result);
      assertTrue(parsed >= Date.now() - 100);
      assertTrue(parsed <= Date.now() + 100);
    });

    it("millisToDateIso returns ISO string for current time", () => {
      const time = testCreateTime({
        startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 0) as Millis,
      });
      assertEqual(millisToDateIso(time.now()), "2026-01-28T14:30:00.000Z");
    });
  });

  describe("performanceDurationBetween", () => {
    it("preserves fractional milliseconds", () => {
      const result = performanceDurationBetween(
        100.125 as PerformanceTime,
        100.375 as PerformanceTime,
      );

      assertType<typeof result, PerformanceDuration>();
      assertEqual(result, 0.25);
    });

    it("rejects an end time before the start time", () => {
      const error = assertThrowsInstanceOf(
        () =>
          performanceDurationBetween(
            100.375 as PerformanceTime,
            100.125 as PerformanceTime,
          ),
        Error,
      );
      assertTrue(
        error.message.includes(
          "Performance end time must not precede start time",
        ),
      );
    });
  });

  describe("PositiveDuration", () => {
    it("accepts only positive durations", () => {
      const time = testCreateTime();
      const duration: PositiveDuration = PositiveMillis.orThrow(1);

      time.setTimeout(() => undefined, duration);
      // @ts-expect-error - Zero Millis is not a positive duration.
      time.setTimeout(() => undefined, 0 as Millis);
    });
  });

  describe("DurationLiteral", () => {
    it("valid durations", () => {
      // Milliseconds
      assertType<"1ms" extends DurationLiteral ? true : false, true>();
      assertType<"500ms" extends DurationLiteral ? true : false, true>();
      assertType<"999ms" extends DurationLiteral ? true : false, true>();
      // Seconds (integer and decimal)
      assertType<"1s" extends DurationLiteral ? true : false, true>();
      assertType<"59s" extends DurationLiteral ? true : false, true>();
      assertType<"1.5s" extends DurationLiteral ? true : false, true>();
      assertType<"59.9s" extends DurationLiteral ? true : false, true>();
      // Minutes (integer and decimal)
      assertType<"1m" extends DurationLiteral ? true : false, true>();
      assertType<"59m" extends DurationLiteral ? true : false, true>();
      assertType<"1.5m" extends DurationLiteral ? true : false, true>();
      // Hours (integer and decimal)
      assertType<"1h" extends DurationLiteral ? true : false, true>();
      assertType<"23h" extends DurationLiteral ? true : false, true>();
      assertType<"1.5h" extends DurationLiteral ? true : false, true>();
      // Days (integer and decimal, max 6)
      assertType<"1d" extends DurationLiteral ? true : false, true>();
      assertType<"6d" extends DurationLiteral ? true : false, true>();
      assertType<"1.5d" extends DurationLiteral ? true : false, true>();
      // Weeks (integer and decimal)
      assertType<"1w" extends DurationLiteral ? true : false, true>();
      assertType<"51w" extends DurationLiteral ? true : false, true>();
      assertType<"1.5w" extends DurationLiteral ? true : false, true>();
      // Years (integer and decimal)
      assertType<"1y" extends DurationLiteral ? true : false, true>();
      assertType<"99y" extends DurationLiteral ? true : false, true>();
      assertType<"1.5y" extends DurationLiteral ? true : false, true>();
    });

    it("invalid durations", () => {
      assertType<"invalid" extends DurationLiteral ? true : false, false>();
      assertType<"-1s" extends DurationLiteral ? true : false, false>();
      assertType<"0ms" extends DurationLiteral ? true : false, false>();
      assertType<"0s" extends DurationLiteral ? true : false, false>();
      assertType<"0.5s" extends DurationLiteral ? true : false, false>();
      assertType<"01d" extends DurationLiteral ? true : false, false>();
      assertType<"60s" extends DurationLiteral ? true : false, false>();
      assertType<"60m" extends DurationLiteral ? true : false, false>();
      assertType<"24h" extends DurationLiteral ? true : false, false>();
      assertType<"7d" extends DurationLiteral ? true : false, false>();
      assertType<"52w" extends DurationLiteral ? true : false, false>();
      assertType<"100y" extends DurationLiteral ? true : false, false>();
      assertType<"1000ms" extends DurationLiteral ? true : false, false>();
      assertType<"1.0s" extends DurationLiteral ? true : false, false>();
    });

    it("validates durations at runtime", () => {
      assertTrue(DurationLiteralMilliseconds.is("999ms"));
      assertFalse(DurationLiteralMilliseconds.is("1000ms"));
      assertTrue(DurationLiteralSeconds.is("59.9s"));
      assertFalse(DurationLiteralSeconds.is("60s"));
      assertTrue(DurationLiteralMinutes.is("59.9m"));
      assertFalse(DurationLiteralMinutes.is("60m"));
      assertTrue(DurationLiteralHours.is("23.9h"));
      assertFalse(DurationLiteralHours.is("24h"));
      assertTrue(DurationLiteralDays.is("6.9d"));
      assertFalse(DurationLiteralDays.is("7d"));
      assertTrue(DurationLiteralWeeks.is("51.9w"));
      assertFalse(DurationLiteralWeeks.is("52w"));
      assertTrue(DurationLiteralYears.is("99.9y"));
      assertFalse(DurationLiteralYears.is("100y"));
      assertTrue(DurationLiteral.is("1.5s"));
      assertFalse(DurationLiteral.is("0.5s"));
    });
  });

  describe("durationToMillis", () => {
    it("preserves positive duration type", () => {
      {
        const actual = durationToMillis("1ms");
        assertType<typeof actual, PositiveMillis>();
      }
      {
        const actual = durationToMillis(PositiveMillis.orThrow(1));
        assertType<typeof actual, PositiveMillis>();
      }

      const duration: Duration = 0 as Millis;
      {
        const actual = durationToMillis(duration);
        assertType<typeof actual, Millis>();
      }
    });

    it("converts DurationLiteral to milliseconds", () => {
      // Milliseconds
      assertEqual(durationToMillis("1ms"), 1);
      assertEqual(durationToMillis("500ms"), 500);
      assertEqual(durationToMillis("999ms"), 999);
      // Seconds (integer and decimal)
      assertEqual(durationToMillis("1s"), 1000);
      assertEqual(durationToMillis("30s"), 30000);
      assertEqual(durationToMillis("59s"), 59000);
      assertEqual(durationToMillis("1.5s"), 1500);
      // Minutes (integer and decimal)
      assertEqual(durationToMillis("1m"), 60000);
      assertEqual(durationToMillis("30m"), 30 * 60000);
      assertEqual(durationToMillis("1.5m"), 90000);
      // Hours (integer and decimal)
      assertEqual(durationToMillis("1h"), 3600000);
      assertEqual(durationToMillis("23h"), 23 * 3600000);
      assertEqual(durationToMillis("1.5h"), 5400000);
      // Days (integer and decimal, max 6)
      assertEqual(durationToMillis("1d"), 86400000);
      assertEqual(durationToMillis("6d"), 6 * 86400000);
      assertEqual(durationToMillis("1.5d"), 129600000);
      // Weeks (integer and decimal)
      assertEqual(durationToMillis("1w"), 604800000);
      assertEqual(durationToMillis("51w"), 51 * 604800000);
      assertEqual(durationToMillis("1.5w"), 907200000);
      // Years (integer and decimal)
      assertEqual(durationToMillis("1y"), 31536000000);
      assertEqual(durationToMillis("99y"), 99 * 31536000000);
      assertEqual(durationToMillis("1.5y"), 47304000000);
    });

    it("passes through Millis unchanged", () => {
      assertEqual(durationToMillis(0 as Millis), 0);
      assertEqual(durationToMillis(5000 as Millis), 5000);
    });
  });

  describe("formatMillisAsDuration", () => {
    it("formats sub-minute durations", () => {
      assertEqual(formatMillisAsDuration(0 as Millis), "0.000s");
      assertEqual(formatMillisAsDuration(1 as Millis), "0.001s");
      assertEqual(formatMillisAsDuration(1234 as Millis), "1.234s");
      assertEqual(formatMillisAsDuration(59999 as Millis), "59.999s");
    });

    it("formats minute-range durations", () => {
      assertEqual(formatMillisAsDuration(60000 as Millis), "1m0.000s");
      assertEqual(formatMillisAsDuration(90000 as Millis), "1m30.000s");
      assertEqual(formatMillisAsDuration(3599999 as Millis), "59m59.999s");
    });

    it("formats hour-range durations", () => {
      assertEqual(formatMillisAsDuration(3600000 as Millis), "1h0m0.000s");
      assertEqual(formatMillisAsDuration(3661000 as Millis), "1h1m1.000s");
      assertEqual(formatMillisAsDuration(5400000 as Millis), "1h30m0.000s");
      assertEqual(formatMillisAsDuration(86399999 as Millis), "23h59m59.999s");
    });

    it("formats day, week, and year durations", () => {
      assertEqual(
        formatMillisAsDuration(durationToMillis("1d")),
        "1d0h0m0.000s",
      );
      assertEqual(
        formatMillisAsDuration(durationToMillis("1w")),
        "1w0d0h0m0.000s",
      );
      assertEqual(
        formatMillisAsDuration(durationToMillis("1y")),
        "1y0w0d0h0m0.000s",
      );
      assertEqual(
        formatMillisAsDuration(
          Millis.orThrow(
            durationToMillis("1y") +
              2 * durationToMillis("1w") +
              3 * durationToMillis("1d") +
              durationToMillis("4h") +
              durationToMillis("5m") +
              durationToMillis("6s"),
          ),
        ),
        "1y2w3d4h5m6.000s",
      );
    });
  });

  describe("formatMillisAsClockTime", () => {
    it("formats local time as HH:MM:SS.mmm", () => {
      const timestamp = new Date(
        2026,
        0,
        28,
        14,
        32,
        15,
        234,
      ).getTime() as Millis;

      assertEqual(formatMillisAsClockTime(timestamp), "14:32:15.234");
    });

    it("pads single digits", () => {
      const timestamp = new Date(2026, 0, 1, 0, 1, 2, 3).getTime() as Millis;

      assertEqual(formatMillisAsClockTime(timestamp), "00:01:02.003");
    });
  });
});
