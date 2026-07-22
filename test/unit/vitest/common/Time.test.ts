import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import type {
  Duration,
  DurationLiteral,
  PerformanceDuration,
  PerformanceTime,
  PerformanceTimeOrigin,
  PositiveDuration,
} from "../../../../packages/common/src/Time.ts";
import {
  createTime,
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
} from "../../../../packages/common/src/Time.ts";
import {
  type DateIso,
  NonNaNNumber,
} from "../../../../packages/common/src/Type.ts";

const negativeMillisCause = {
  type: "Millis",
  value: -1,
  parentError: { type: "NonNegative", value: -1 },
};

describe("Time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createTime", () => {
    test("now returns current time", () => {
      vi.spyOn(globalThis.Date, "now").mockReturnValue(123);

      expect(createTime().now()).toBe(123);
    });

    test('now with "DateIso" returns current time as ISO string', () => {
      const time = createTime();
      const result: DateIso = time.now("DateIso");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      const parsed = Date.parse(result);
      expect(parsed).toBeGreaterThanOrEqual(Date.now() - 100);
      expect(parsed).toBeLessThanOrEqual(Date.now() + 100);
    });

    test("performance exposes the native clock", () => {
      vi.spyOn(globalThis.performance, "now").mockReturnValue(123.456);

      const time = createTime();
      const now: PerformanceTime = time.performance.now();
      const timeOrigin: PerformanceTimeOrigin = time.performance.timeOrigin;

      expect(now).toBe(123.456);
      expect(timeOrigin).toBe(globalThis.performance.timeOrigin);
    });

    describe("setTimeout", () => {
      test("fires after the delay", () => {
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const setTimeout = vi
          .spyOn(globalThis, "setTimeout")
          .mockImplementation((callback) => {
            callbacks.push(callback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          });
        vi.spyOn(globalThis.Date, "now").mockImplementation(() => now);
        const callback = vi.fn();

        createTime().setTimeout(callback, "10ms");

        expect(setTimeout).toHaveBeenCalledWith(callbacks[0], 10);
        expect(callback).not.toHaveBeenCalled();

        now += 10;
        callbacks[0]();

        expect(callback).toHaveBeenCalledOnce();
      });

      test("native-range timeout ignores wall-clock changes", () => {
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const setTimeout = vi
          .spyOn(globalThis, "setTimeout")
          .mockImplementation((scheduledCallback) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          });
        vi.spyOn(globalThis.Date, "now").mockImplementation(() => now);
        const callback = vi.fn();

        createTime().setTimeout(callback, "10ms");
        now -= 1000;
        callbacks[0]();

        expect(setTimeout).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledOnce();
      });

      test("maximum native delay uses one native timer", () => {
        const maxNativeTimeoutMillis = 2 ** 31 - 1;
        const callbacks: Array<() => void> = [];
        const setTimeout = vi
          .spyOn(globalThis, "setTimeout")
          .mockImplementation((scheduledCallback) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          });
        const dateNow = vi.spyOn(globalThis.Date, "now");
        const callback = vi.fn();

        createTime().setTimeout(
          callback,
          PositiveMillis.orThrow(maxNativeTimeoutMillis),
        );

        expect(setTimeout).toHaveBeenCalledWith(
          callbacks[0],
          maxNativeTimeoutMillis,
        );
        expect(dateNow).not.toHaveBeenCalled();

        callbacks[0]();

        expect(setTimeout).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledOnce();
      });

      test("accounts for elapsed time while a long timeout is suspended", () => {
        const maxNativeTimeoutMillis = 2 ** 31 - 1;
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const delays: Array<number | undefined> = [];
        const callback = vi.fn();

        vi.spyOn(globalThis.Date, "now").mockImplementation(() => now);
        vi.spyOn(globalThis, "setTimeout").mockImplementation(
          (scheduledCallback, delay) => {
            callbacks.push(scheduledCallback);
            delays.push(delay);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          },
        );

        createTime().setTimeout(
          callback,
          PositiveMillis.orThrow(maxNativeTimeoutMillis + 100),
        );

        expect(delays).toEqual([maxNativeTimeoutMillis]);

        // Simulate the native timer firing 50ms late after event-loop suspension.
        now += maxNativeTimeoutMillis + 50;
        callbacks[0]();

        // Only 50ms remains; do not add the elapsed 50ms again.
        expect(delays).toEqual([maxNativeTimeoutMillis, 50]);
        expect(callback).not.toHaveBeenCalled();

        now += 50;
        callbacks[1]();

        expect(callback).toHaveBeenCalledOnce();
      });

      test("rejects an invalid clock when scheduling a long timeout", () => {
        const setTimeout = vi
          .spyOn(globalThis, "setTimeout")
          .mockReturnValue(
            1 as unknown as ReturnType<typeof globalThis.setTimeout>,
          );
        vi.spyOn(globalThis.Date, "now").mockReturnValue(-1);

        expect(() =>
          createTime().setTimeout(
            () => undefined,
            PositiveMillis.orThrow(2 ** 31),
          ),
        ).toThrow(
          expect.objectContaining({
            message: "getOrThrow",
            cause: negativeMillisCause,
          }),
        );
        expect(setTimeout).not.toHaveBeenCalled();
      });

      test("rejects an invalid clock while processing a long timeout", () => {
        const callbacks: Array<() => void> = [];
        let now = 1000;
        vi.spyOn(globalThis.Date, "now").mockImplementation(() => now);
        vi.spyOn(globalThis, "setTimeout").mockImplementation(
          (scheduledCallback) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          },
        );
        createTime().setTimeout(
          () => undefined,
          PositiveMillis.orThrow(2 ** 31),
        );
        now = -1;

        expect(() => callbacks[0]()).toThrow(
          expect.objectContaining({
            message: "getOrThrow",
            cause: negativeMillisCause,
          }),
        );
        expect(callbacks).toHaveLength(1);
      });

      test("clearTimeout cancels the active chunk of a long delay", () => {
        const maxNativeTimeoutMillis = 2 ** 31 - 1;
        let now = 1000;
        const callbacks: Array<() => void> = [];
        const callback = vi.fn();
        const clearTimeout = vi
          .spyOn(globalThis, "clearTimeout")
          .mockImplementation(() => undefined);

        vi.spyOn(globalThis.Date, "now").mockImplementation(() => now);
        vi.spyOn(globalThis, "setTimeout").mockImplementation(
          (scheduledCallback) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
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

        expect(clearTimeout).toHaveBeenCalledWith(2);
        expect(callback).not.toHaveBeenCalled();
      });

      test("clearTimeout cancels a single native timeout", () => {
        const callbacks: Array<() => void> = [];
        const callback = vi.fn();
        const clearTimeout = vi
          .spyOn(globalThis, "clearTimeout")
          .mockImplementation(() => undefined);

        vi.spyOn(globalThis, "setTimeout").mockImplementation(
          (scheduledCallback) => {
            callbacks.push(scheduledCallback);
            return callbacks.length as unknown as ReturnType<
              typeof globalThis.setTimeout
            >;
          },
        );

        const time = createTime();
        const id = time.setTimeout(callback, "10ms");

        time.clearTimeout(id);
        callbacks[0]();

        expect(clearTimeout).toHaveBeenCalledWith(1);
        expect(callback).not.toHaveBeenCalled();
      });

      test("clearTimeout rejects an id created by another Time instance", () => {
        vi.spyOn(globalThis, "setTimeout").mockReturnValue(
          1 as unknown as ReturnType<typeof globalThis.setTimeout>,
        );
        const firstTime = createTime();
        const secondTime = createTime();
        const id = firstTime.setTimeout(() => undefined, "10ms");

        expect(() => secondTime.clearTimeout(id)).toThrow(
          "TimeoutId was created by another Time instance",
        );
      });
    });
  });

  describe("testCreateTime", () => {
    test("advances time only when advance() is called", () => {
      const time = testCreateTime();

      expect(time.now()).toBe(0);
      expect(time.now()).toBe(0); // Still 0, no auto-increment

      time.advance("1ms");
      expect(time.now()).toBe(1);

      time.advance("100ms");
      expect(time.now()).toBe(101);

      time.advance("1s");
      expect(time.now()).toBe(1101);
    });

    test("with autoIncrement returns monotonically increasing values", async () => {
      const time = testCreateTime({ autoIncrement: "microtask" });
      const first = time.now();

      await Promise.resolve();

      const second = time.now();

      await Promise.resolve();

      const third = time.now();

      expect(first).toBe(0);
      expect(second).toBe(1);
      expect(third).toBe(2);
    });

    test("with sync autoIncrement increments within the same turn", () => {
      const time = testCreateTime({ autoIncrement: "sync" });

      expect(time.now()).toBe(0);
      expect(time.now()).toBe(1);
      expect(time.now("DateIso")).toBe("1970-01-01T00:00:00.002Z");
      expect(time.now()).toBe(3);
    });

    test('now with "DateIso" respects autoIncrement', async () => {
      const time = testCreateTime({
        autoIncrement: "microtask",
        startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 0) as Millis,
      });

      const first = time.now("DateIso");

      await Promise.resolve();

      const second = time.now("DateIso");

      expect(first).toBe("2026-01-28T14:30:00.000Z");
      expect(second).toBe("2026-01-28T14:30:00.001Z");
    });

    test('now with "DateIso" returns ISO string for current time', () => {
      const time = testCreateTime({
        startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 0) as Millis,
      });
      expect(time.now("DateIso")).toBe("2026-01-28T14:30:00.000Z");
    });

    test("performance starts at its time origin and advances with time", () => {
      const time = testCreateTime({ startAt: Millis.orThrow(1000) });

      expect(time.performance.timeOrigin).toBe(1000);
      expect(time.performance.now()).toBe(0);

      time.advance("100ms");

      expect(time.performance.now()).toBe(100);
    });

    test("performance respects sync autoIncrement", () => {
      const time = testCreateTime({ autoIncrement: "sync" });

      expect(time.performance.now()).toBe(0);
      expect(time.now()).toBe(1);
    });

    test("setTimeout fires callback when time is advanced past deadline", () => {
      const time = testCreateTime();
      let called = false;

      time.setTimeout(() => {
        called = true;
      }, "100ms");

      expect(called).toBe(false);

      time.advance("50ms");
      expect(called).toBe(false);

      time.advance("50ms");
      expect(called).toBe(true);
    });

    test("setTimeout rejects a deadline after maxMillis", () => {
      const time = testCreateTime({ startAt: maxMillis });

      expect(() => time.setTimeout(() => undefined, "1ms")).toThrow(
        expect.objectContaining({
          message: "getOrThrow",
          cause: {
            type: "Millis",
            value: maxMillis + 1,
            parentError: {
              type: "LessThan",
              value: maxMillis + 1,
              max: maxMillis + 1,
            },
          },
        }),
      );
    });

    test("clearTimeout cancels pending timeout", () => {
      const time = testCreateTime();
      let called = false;

      const id = time.setTimeout(() => {
        called = true;
      }, "100ms");

      time.clearTimeout(id);
      time.advance("200ms");

      expect(called).toBe(false);
    });

    test("clearTimeout rejects an id created by another Time instance", () => {
      const firstTime = testCreateTime();
      const secondTime = testCreateTime();
      const secondCallback = vi.fn();
      const id = firstTime.setTimeout(() => undefined, "100ms");
      secondTime.setTimeout(secondCallback, "100ms");

      expect(() => secondTime.clearTimeout(id)).toThrow(
        "TimeoutId was created by another Time instance",
      );

      secondTime.advance("100ms");
      expect(secondCallback).toHaveBeenCalledOnce();
    });

    test("multiple timeouts fire in deadline order", () => {
      const time = testCreateTime();
      const order: Array<number> = [];

      time.setTimeout(() => order.push(1), "100ms");
      time.setTimeout(() => order.push(2), "50ms");
      time.setTimeout(() => order.push(3), "150ms");

      time.advance("200ms");

      expect(order).toEqual([2, 1, 3]);
    });

    test("timeouts with identical deadlines fire in scheduling order", () => {
      const time = testCreateTime();
      const order: Array<number> = [];

      time.setTimeout(() => order.push(1), "50ms");
      time.setTimeout(() => order.push(2), "50ms");
      time.setTimeout(() => order.push(3), "50ms");

      time.advance("50ms");

      expect(order).toEqual([1, 2, 3]);
    });

    test("timeout callbacks observe their deadlines", () => {
      const time = testCreateTime();
      const observedTimes: Array<Millis> = [];

      time.setTimeout(() => observedTimes.push(time.now()), "100ms");
      time.setTimeout(() => observedTimes.push(time.now()), "50ms");

      time.advance("200ms");

      expect(observedTimes).toEqual([50, 100]);
      expect(time.now()).toBe(200);
    });

    test("advance fires timeouts scheduled by callbacks within its target", () => {
      const time = testCreateTime();
      const observedTimes: Array<Millis> = [];

      time.setTimeout(() => {
        observedTimes.push(time.now());
        time.setTimeout(() => observedTimes.push(time.now()), "50ms");
      }, "50ms");

      time.advance("200ms");

      expect(observedTimes).toEqual([50, 100]);
      expect(time.now()).toBe(200);
    });

    test("an earlier timeout can cancel a later timeout", () => {
      const time = testCreateTime();
      const callback = vi.fn();
      const laterId = time.setTimeout(callback, "100ms");
      time.setTimeout(() => time.clearTimeout(laterId), "50ms");

      time.advance("200ms");

      expect(callback).not.toHaveBeenCalled();
    });

    test("a throwing callback aborts advance at its deadline", () => {
      const time = testCreateTime();
      const error = new Error("callback failed");
      const laterCallback = vi.fn();

      time.setTimeout(() => {
        throw error;
      }, "50ms");
      time.setTimeout(laterCallback, "100ms");

      expect(() => time.advance("200ms")).toThrow(error);
      expect(time.now()).toBe(50);
      expect(laterCallback).not.toHaveBeenCalled();

      time.advance("150ms");

      expect(laterCallback).toHaveBeenCalledOnce();
      expect(time.now()).toBe(200);
    });

    test("advance rejects reentrant calls", () => {
      const time = testCreateTime();

      time.setTimeout(() => {
        expect(() => time.advance("1ms")).toThrow(
          "TestTime.advance cannot be called while advancing",
        );
      }, "50ms");

      time.advance("100ms");

      expect(time.now()).toBe(100);
    });

    test("advance preserves auto-incremented time", () => {
      const time = testCreateTime({ autoIncrement: "sync" });
      const observedTimes: Array<Millis> = [];

      time.setTimeout(() => observedTimes.push(time.now()), "50ms");
      time.setTimeout(() => observedTimes.push(time.now()), "50ms");

      time.advance("50ms");

      expect(observedTimes).toEqual([50, 51]);
      expect(time.now()).toBe(52);
    });
  });

  describe("PositiveMillis", () => {
    test("accepts only positive millis", () => {
      const _millis: Millis = PositiveMillis.orThrow(1);
      expect(PositiveMillis.is(1)).toBe(true);
      expect(PositiveMillis.is(maxMillis)).toBe(true);
      expect(PositiveMillis.is(0)).toBe(false);
    });
  });

  describe("saturateMillis", () => {
    test("requires NonNaNNumber", () => {
      saturateMillis(NonNaNNumber.orThrow(1));
      // @ts-expect-error - Numbers require validation.
      saturateMillis(1);
    });

    test("rounds to the nearest millisecond", () => {
      expect(saturateMillis(NonNaNNumber.orThrow(1.4))).toBe(1);
      expect(saturateMillis(NonNaNNumber.orThrow(1.5))).toBe(2);
    });

    test("saturates negative values at min millis", () => {
      expect(saturateMillis(NonNaNNumber.orThrow(-1))).toBe(0);
      expect(
        saturateMillis(NonNaNNumber.orThrow(Number.NEGATIVE_INFINITY)),
      ).toBe(0);
    });

    test("saturates overflow at maxMillis", () => {
      expect(saturateMillis(NonNaNNumber.orThrow(maxMillis + 1))).toBe(
        maxMillis,
      );
      expect(
        saturateMillis(NonNaNNumber.orThrow(Number.POSITIVE_INFINITY)),
      ).toBe(maxMillis);
    });
  });

  describe("millisToDateIso", () => {
    test("millisToDateIso returns current time as ISO string", () => {
      const time = createTime();
      const result = millisToDateIso(time.now());
      // Verify it's a valid ISO string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      // And it's close to now
      const parsed = Date.parse(result);
      expect(parsed).toBeGreaterThanOrEqual(Date.now() - 100);
      expect(parsed).toBeLessThanOrEqual(Date.now() + 100);
    });

    test("millisToDateIso returns ISO string for current time", () => {
      const time = testCreateTime({
        startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 0) as Millis,
      });
      expect(millisToDateIso(time.now())).toBe("2026-01-28T14:30:00.000Z");
    });
  });

  describe("performanceDurationBetween", () => {
    test("preserves fractional milliseconds", () => {
      const result = performanceDurationBetween(
        100.125 as PerformanceTime,
        100.375 as PerformanceTime,
      );

      expectTypeOf(result).toEqualTypeOf<PerformanceDuration>();
      expect(result).toBe(0.25);
    });

    test("rejects an end time before the start time", () => {
      expect(() =>
        performanceDurationBetween(
          100.375 as PerformanceTime,
          100.125 as PerformanceTime,
        ),
      ).toThrow("Performance end time must not precede start time");
    });
  });

  describe("PositiveDuration", () => {
    test("accepts only positive durations", () => {
      const time = testCreateTime();
      const duration: PositiveDuration = PositiveMillis.orThrow(1);

      time.setTimeout(() => undefined, duration);
      // @ts-expect-error - Zero Millis is not a positive duration.
      time.setTimeout(() => undefined, 0 as Millis);
    });
  });

  describe("DurationLiteral", () => {
    test("valid durations", () => {
      // Milliseconds
      expectTypeOf<"1ms">().toExtend<DurationLiteral>();
      expectTypeOf<"500ms">().toExtend<DurationLiteral>();
      expectTypeOf<"999ms">().toExtend<DurationLiteral>();
      // Seconds (integer and decimal)
      expectTypeOf<"1s">().toExtend<DurationLiteral>();
      expectTypeOf<"59s">().toExtend<DurationLiteral>();
      expectTypeOf<"1.5s">().toExtend<DurationLiteral>();
      expectTypeOf<"59.9s">().toExtend<DurationLiteral>();
      // Minutes (integer and decimal)
      expectTypeOf<"1m">().toExtend<DurationLiteral>();
      expectTypeOf<"59m">().toExtend<DurationLiteral>();
      expectTypeOf<"1.5m">().toExtend<DurationLiteral>();
      // Hours (integer and decimal)
      expectTypeOf<"1h">().toExtend<DurationLiteral>();
      expectTypeOf<"23h">().toExtend<DurationLiteral>();
      expectTypeOf<"1.5h">().toExtend<DurationLiteral>();
      // Days (integer and decimal, max 6)
      expectTypeOf<"1d">().toExtend<DurationLiteral>();
      expectTypeOf<"6d">().toExtend<DurationLiteral>();
      expectTypeOf<"1.5d">().toExtend<DurationLiteral>();
      // Weeks (integer and decimal)
      expectTypeOf<"1w">().toExtend<DurationLiteral>();
      expectTypeOf<"51w">().toExtend<DurationLiteral>();
      expectTypeOf<"1.5w">().toExtend<DurationLiteral>();
      // Years (integer and decimal)
      expectTypeOf<"1y">().toExtend<DurationLiteral>();
      expectTypeOf<"99y">().toExtend<DurationLiteral>();
      expectTypeOf<"1.5y">().toExtend<DurationLiteral>();
    });

    test("invalid durations", () => {
      expectTypeOf<"invalid">().not.toExtend<DurationLiteral>();
      expectTypeOf<"-1s">().not.toExtend<DurationLiteral>();
      expectTypeOf<"0ms">().not.toExtend<DurationLiteral>();
      expectTypeOf<"0s">().not.toExtend<DurationLiteral>();
      expectTypeOf<"0.5s">().not.toExtend<DurationLiteral>();
      expectTypeOf<"01d">().not.toExtend<DurationLiteral>();
      expectTypeOf<"60s">().not.toExtend<DurationLiteral>();
      expectTypeOf<"60m">().not.toExtend<DurationLiteral>();
      expectTypeOf<"24h">().not.toExtend<DurationLiteral>();
      expectTypeOf<"7d">().not.toExtend<DurationLiteral>();
      expectTypeOf<"52w">().not.toExtend<DurationLiteral>();
      expectTypeOf<"100y">().not.toExtend<DurationLiteral>();
      expectTypeOf<"1000ms">().not.toExtend<DurationLiteral>();
      expectTypeOf<"1.0s">().not.toExtend<DurationLiteral>();
    });
  });

  describe("durationToMillis", () => {
    test("preserves positive duration type", () => {
      const _literalMillis: PositiveMillis = durationToMillis("1ms");
      const _positiveMillis: PositiveMillis = durationToMillis(
        PositiveMillis.orThrow(1),
      );

      const duration: Duration = 0 as Millis;
      const _millis: Millis = durationToMillis(duration);
    });

    test("converts DurationLiteral to milliseconds", () => {
      // Milliseconds
      expect(durationToMillis("1ms")).toBe(1);
      expect(durationToMillis("500ms")).toBe(500);
      expect(durationToMillis("999ms")).toBe(999);
      // Seconds (integer and decimal)
      expect(durationToMillis("1s")).toBe(1000);
      expect(durationToMillis("30s")).toBe(30000);
      expect(durationToMillis("59s")).toBe(59000);
      expect(durationToMillis("1.5s")).toBe(1500);
      // Minutes (integer and decimal)
      expect(durationToMillis("1m")).toBe(60000);
      expect(durationToMillis("30m")).toBe(30 * 60000);
      expect(durationToMillis("1.5m")).toBe(90000);
      // Hours (integer and decimal)
      expect(durationToMillis("1h")).toBe(3600000);
      expect(durationToMillis("23h")).toBe(23 * 3600000);
      expect(durationToMillis("1.5h")).toBe(5400000);
      // Days (integer and decimal, max 6)
      expect(durationToMillis("1d")).toBe(86400000);
      expect(durationToMillis("6d")).toBe(6 * 86400000);
      expect(durationToMillis("1.5d")).toBe(129600000);
      // Weeks (integer and decimal)
      expect(durationToMillis("1w")).toBe(604800000);
      expect(durationToMillis("51w")).toBe(51 * 604800000);
      expect(durationToMillis("1.5w")).toBe(907200000);
      // Years (integer and decimal)
      expect(durationToMillis("1y")).toBe(31536000000);
      expect(durationToMillis("99y")).toBe(99 * 31536000000);
      expect(durationToMillis("1.5y")).toBe(47304000000);
    });

    test("passes through Millis unchanged", () => {
      expect(durationToMillis(0 as Millis)).toBe(0);
      expect(durationToMillis(5000 as Millis)).toBe(5000);
    });
  });

  describe("formatMillisAsDuration", () => {
    test("formats sub-minute durations", () => {
      expect(formatMillisAsDuration(0 as Millis)).toBe("0.000s");
      expect(formatMillisAsDuration(1 as Millis)).toBe("0.001s");
      expect(formatMillisAsDuration(1234 as Millis)).toBe("1.234s");
      expect(formatMillisAsDuration(59999 as Millis)).toBe("59.999s");
    });

    test("formats minute-range durations", () => {
      expect(formatMillisAsDuration(60000 as Millis)).toBe("1m0.000s");
      expect(formatMillisAsDuration(90000 as Millis)).toBe("1m30.000s");
      expect(formatMillisAsDuration(3599999 as Millis)).toBe("59m59.999s");
    });

    test("formats hour-range durations", () => {
      expect(formatMillisAsDuration(3600000 as Millis)).toBe("1h0m0.000s");
      expect(formatMillisAsDuration(3661000 as Millis)).toBe("1h1m1.000s");
      expect(formatMillisAsDuration(5400000 as Millis)).toBe("1h30m0.000s");
      expect(formatMillisAsDuration(86399999 as Millis)).toBe("23h59m59.999s");
    });

    test("formats day, week, and year durations", () => {
      expect(formatMillisAsDuration(durationToMillis("1d"))).toBe(
        "1d0h0m0.000s",
      );
      expect(formatMillisAsDuration(durationToMillis("1w"))).toBe(
        "1w0d0h0m0.000s",
      );
      expect(formatMillisAsDuration(durationToMillis("1y"))).toBe(
        "1y0w0d0h0m0.000s",
      );
      expect(
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
      ).toBe("1y2w3d4h5m6.000s");
    });
  });

  describe("formatMillisAsClockTime", () => {
    test("formats local time as HH:MM:SS.mmm", () => {
      const timestamp = new Date(
        2026,
        0,
        28,
        14,
        32,
        15,
        234,
      ).getTime() as Millis;

      expect(formatMillisAsClockTime(timestamp)).toBe("14:32:15.234");
    });

    test("pads single digits", () => {
      const timestamp = new Date(2026, 0, 1, 0, 1, 2, 3).getTime() as Millis;

      expect(formatMillisAsClockTime(timestamp)).toBe("00:01:02.003");
    });
  });
});
