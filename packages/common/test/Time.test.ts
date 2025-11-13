import { expect, test, expectTypeOf, describe } from "vitest";
import {
  createTestTime,
  createTime,
  type DurationString,
  durationToNonNegativeInt,
} from "../src/Time.js";
import { NonNegativeInt } from "../src/Type.js";

describe("Time", () => {
  test("createTime returns current time", () => {
    const time = createTime();
    const now = Date.now();
    // Allow small difference due to execution time
    expect(time.now()).toBeGreaterThanOrEqual(now - 10);
    expect(time.now()).toBeLessThanOrEqual(now + 10);
  });

  test("createTestTime returns monotonically increasing values", async () => {
    const time = createTestTime();
    const first = time.now();

    // Need to await microtask queue to let the increment happen
    await new Promise((resolve) => {
      queueMicrotask(() => {
        resolve(undefined);
      });
    });

    const second = time.now();

    await new Promise((resolve) => {
      queueMicrotask(() => {
        resolve(undefined);
      });
    });

    const third = time.now();

    // First call should be 0
    expect(first).toBe(0);
    // Second call should be 1 after microtask queue has processed
    expect(second).toBe(1);
    // Third call should be 2 after another microtask queue cycle
    expect(third).toBe(2);
  });

  describe("DurationString", () => {
    test("validates correct types", () => {
      // Valid milliseconds
      expectTypeOf<"0ms">().toExtend<DurationString>();
      expectTypeOf<"1ms">().toExtend<DurationString>();
      expectTypeOf<"500ms">().toExtend<DurationString>();
      expectTypeOf<"999ms">().toExtend<DurationString>();

      // Valid single digit seconds (1-9)
      expectTypeOf<"1s">().toExtend<DurationString>();
      expectTypeOf<"9s">().toExtend<DurationString>();

      // Valid two digit seconds (10-59)
      expectTypeOf<"10s">().toExtend<DurationString>();
      expectTypeOf<"30s">().toExtend<DurationString>();
      expectTypeOf<"59s">().toExtend<DurationString>();

      // Valid single digit minutes (1-9)
      expectTypeOf<"1m">().toExtend<DurationString>();
      expectTypeOf<"5m">().toExtend<DurationString>();

      // Valid two digit minutes (10-59)
      expectTypeOf<"10m">().toExtend<DurationString>();
      expectTypeOf<"30m">().toExtend<DurationString>();

      // Valid hours (1-23)
      expectTypeOf<"1h">().toExtend<DurationString>();
      expectTypeOf<"12h">().toExtend<DurationString>();
      expectTypeOf<"23h">().toExtend<DurationString>();

      // Valid days (1-99)
      expectTypeOf<"1d">().toExtend<DurationString>();
      expectTypeOf<"7d">().toExtend<DurationString>();
      expectTypeOf<"30d">().toExtend<DurationString>();
      expectTypeOf<"99d">().toExtend<DurationString>();

      // Valid combinations (sorted by time unit)
      expectTypeOf<"1s 250ms">().toExtend<DurationString>();
      expectTypeOf<"30m 15s">().toExtend<DurationString>();
      expectTypeOf<"2h 45m">().toExtend<DurationString>();
      expectTypeOf<"7d 12h">().toExtend<DurationString>();
    });

    test("rejects invalid types", () => {
      // Invalid formats should not be assignable
      expectTypeOf<"invalid">().not.toExtend<DurationString>();
      expectTypeOf<"0s">().not.toExtend<DurationString>(); // No zero values
      expectTypeOf<"0m">().not.toExtend<DurationString>(); // No zero values
      expectTypeOf<"0d">().not.toExtend<DurationString>(); // No zero values
      expectTypeOf<"01d">().not.toExtend<DurationString>(); // No leading zeros
      expectTypeOf<"60s">().not.toExtend<DurationString>(); // Exceeds 59
      expectTypeOf<"60m">().not.toExtend<DurationString>(); // Exceeds 59
      expectTypeOf<"24h">().not.toExtend<DurationString>(); // Exceeds 23
      expectTypeOf<"100d">().not.toExtend<DurationString>(); // Exceeds 99
      expectTypeOf<"05m">().not.toExtend<DurationString>(); // No leading zeros
      expectTypeOf<"1000ms">().not.toExtend<DurationString>(); // Exceeds 999ms
      expectTypeOf<"1h 30s">().not.toExtend<DurationString>(); // Invalid combination (skips minutes)
    });
  });

  describe("durationToNonNegativeInt", () => {
    test("converts all millisecond formats correctly", () => {
      expect(durationToNonNegativeInt("0ms")).toBe(0);
      expect(durationToNonNegativeInt("1ms")).toBe(1);
      expect(durationToNonNegativeInt("9ms")).toBe(9);
      expect(durationToNonNegativeInt("10ms")).toBe(10);
      expect(durationToNonNegativeInt("99ms")).toBe(99);
      expect(durationToNonNegativeInt("100ms")).toBe(100);
      expect(durationToNonNegativeInt("500ms")).toBe(500);
      expect(durationToNonNegativeInt("999ms")).toBe(999);
    });

    test("converts all second formats correctly", () => {
      // Single digit seconds (1-9)
      expect(durationToNonNegativeInt("1s")).toBe(1000);
      expect(durationToNonNegativeInt("5s")).toBe(5000);
      expect(durationToNonNegativeInt("9s")).toBe(9000);

      // Two digit seconds (10-59)
      expect(durationToNonNegativeInt("10s")).toBe(10000);
      expect(durationToNonNegativeInt("30s")).toBe(30000);
      expect(durationToNonNegativeInt("45s")).toBe(45000);
      expect(durationToNonNegativeInt("59s")).toBe(59000);
    });

    test("converts all minute formats correctly", () => {
      // Single digit minutes (1-9)
      expect(durationToNonNegativeInt("1m")).toBe(60000);
      expect(durationToNonNegativeInt("5m")).toBe(5 * 60000);
      expect(durationToNonNegativeInt("9m")).toBe(9 * 60000);

      // Two digit minutes (10-59)
      expect(durationToNonNegativeInt("10m")).toBe(10 * 60000);
      expect(durationToNonNegativeInt("30m")).toBe(30 * 60000);
      expect(durationToNonNegativeInt("59m")).toBe(59 * 60000);
    });

    test("converts all hour formats correctly", () => {
      expect(durationToNonNegativeInt("1h")).toBe(3600000);
      expect(durationToNonNegativeInt("9h")).toBe(9 * 3600000);
      expect(durationToNonNegativeInt("10h")).toBe(10 * 3600000);
      expect(durationToNonNegativeInt("12h")).toBe(12 * 3600000);
      expect(durationToNonNegativeInt("23h")).toBe(23 * 3600000);
    });

    test("converts all day formats correctly", () => {
      expect(durationToNonNegativeInt("1d")).toBe(86400000);
      expect(durationToNonNegativeInt("7d")).toBe(7 * 86400000);
      expect(durationToNonNegativeInt("10d")).toBe(10 * 86400000);
      expect(durationToNonNegativeInt("30d")).toBe(30 * 86400000);
      expect(durationToNonNegativeInt("99d")).toBe(99 * 86400000);
    });

    test("converts all combination formats correctly", () => {
      // seconds + milliseconds
      expect(durationToNonNegativeInt("1s 1ms")).toBe(1001);
      expect(durationToNonNegativeInt("1s 99ms")).toBe(1099);
      expect(durationToNonNegativeInt("1s 250ms")).toBe(1250);
      expect(durationToNonNegativeInt("59s 999ms")).toBe(59999);

      // minutes + seconds
      expect(durationToNonNegativeInt("1m 1s")).toBe(61000);
      expect(durationToNonNegativeInt("30m 15s")).toBe(30 * 60000 + 15000);
      expect(durationToNonNegativeInt("59m 59s")).toBe(59 * 60000 + 59000);

      // hours + minutes
      expect(durationToNonNegativeInt("1h 1m")).toBe(3600000 + 60000);
      expect(durationToNonNegativeInt("2h 45m")).toBe(2 * 3600000 + 45 * 60000);
      expect(durationToNonNegativeInt("23h 59m")).toBe(
        23 * 3600000 + 59 * 60000,
      );

      // days + hours
      expect(durationToNonNegativeInt("1d 1h")).toBe(86400000 + 3600000);
      expect(durationToNonNegativeInt("7d 12h")).toBe(
        7 * 86400000 + 12 * 3600000,
      );
      expect(durationToNonNegativeInt("99d 23h")).toBe(
        99 * 86400000 + 23 * 3600000,
      );
    });

    test("handles edge cases", () => {
      // Already milliseconds (NonNegativeInt)
      expect(durationToNonNegativeInt(0 as NonNegativeInt)).toBe(0);
      expect(durationToNonNegativeInt(5000 as NonNegativeInt)).toBe(5000);

      // Maximum values for each unit
      expect(durationToNonNegativeInt("999ms")).toBe(999);
      expect(durationToNonNegativeInt("59s")).toBe(59000);
      expect(durationToNonNegativeInt("59m")).toBe(59 * 60000);
      expect(durationToNonNegativeInt("23h")).toBe(23 * 3600000);
      expect(durationToNonNegativeInt("99d")).toBe(99 * 86400000);

      // Maximum combination values
      expect(durationToNonNegativeInt("59s 999ms")).toBe(59999);
      expect(durationToNonNegativeInt("59m 59s")).toBe(59 * 60000 + 59000);
      expect(durationToNonNegativeInt("23h 59m")).toBe(
        23 * 3600000 + 59 * 60000,
      );
      expect(durationToNonNegativeInt("99d 23h")).toBe(
        99 * 86400000 + 23 * 3600000,
      );
    });
  });
});
