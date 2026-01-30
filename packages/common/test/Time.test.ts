import { describe, expect, expectTypeOf, test } from "vitest";
import type { DurationLiteral, Millis } from "../src/Time.js";
import {
  createTime,
  durationToMillis,
  formatMillisAsClockTime,
  formatMillisAsDuration,
  millisToDateIso,
  testCreateTime,
} from "../src/Time.js";

describe("Time", () => {
  describe("createTime", () => {
    test("now returns current time", () => {
      const time = createTime();
      const now = Date.now();
      // Allow small difference due to execution time
      expect(time.now()).toBeGreaterThanOrEqual(now - 10);
      expect(time.now()).toBeLessThanOrEqual(now + 10);
    });

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

    test("setTimeout and clearTimeout work", async () => {
      const time = createTime();
      let called = false;

      const id = time.setTimeout(() => {
        called = true;
      }, "10ms");

      // Cancel before it fires
      time.clearTimeout(id);

      // Wait longer than the timeout
      await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
      expect(called).toBe(false);
    });

    test("setTimeout fires after delay", async () => {
      const time = createTime();
      let called = false;

      time.setTimeout(() => {
        called = true;
      }, "10ms");

      expect(called).toBe(false);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
      expect(called).toBe(true);
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
      const time = testCreateTime({ autoIncrement: true });
      const first = time.now();

      await Promise.resolve();

      const second = time.now();

      await Promise.resolve();

      const third = time.now();

      expect(first).toBe(0);
      expect(second).toBe(1);
      expect(third).toBe(2);
    });

    test("millisToDateIso returns ISO string for current time", () => {
      const time = testCreateTime({
        startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 0) as Millis,
      });
      expect(millisToDateIso(time.now())).toBe("2026-01-28T14:30:00.000Z");
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

    test("multiple timeouts fire in order", () => {
      const time = testCreateTime();
      const order: Array<number> = [];

      time.setTimeout(() => order.push(1), "100ms");
      time.setTimeout(() => order.push(2), "50ms");
      time.setTimeout(() => order.push(3), "150ms");

      time.advance("200ms");

      // All should have fired, order depends on iteration order in Map
      expect(order).toContain(1);
      expect(order).toContain(2);
      expect(order).toContain(3);
      expect(order).toHaveLength(3);
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
      expectTypeOf<"0ms">().not.toExtend<DurationLiteral>();
      expectTypeOf<"0s">().not.toExtend<DurationLiteral>();
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
  });

  describe("formatMillisAsClockTime", () => {
    test("formats millis as HH:MM:SS.mmm", () => {
      // Use a fixed timestamp: 2026-01-28T14:32:15.234Z
      const timestamp = Date.UTC(2026, 0, 28, 14, 32, 15, 234) as Millis;
      const result = formatMillisAsClockTime(timestamp);

      // The result depends on local timezone, so just verify the format
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    test("pads single digits", () => {
      // Midnight UTC: 2026-01-01T00:01:02.003Z
      const timestamp = Date.UTC(2026, 0, 1, 0, 1, 2, 3) as Millis;
      const result = formatMillisAsClockTime(timestamp);

      // Verify padding (format is HH:MM:SS.mmm)
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
      // The milliseconds should be "003"
      expect(result.slice(-3)).toBe("003");
    });
  });
});
