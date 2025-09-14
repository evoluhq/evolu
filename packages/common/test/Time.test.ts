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
    expect(time.now()).toBeGreaterThanOrEqual(now - 5);
    expect(time.now()).toBeLessThanOrEqual(now + 5);
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
    test("converts duration strings correctly", () => {
      // Milliseconds
      expect(durationToNonNegativeInt("0ms")).toBe(0);
      expect(durationToNonNegativeInt("500ms")).toBe(500);

      // Single digit seconds
      expect(durationToNonNegativeInt("9s")).toBe(9 * 1000); // 9 seconds

      // Two digit seconds
      expect(durationToNonNegativeInt("45s")).toBe(45 * 1000); // 45 seconds

      // Single digit minutes
      expect(durationToNonNegativeInt("5m")).toBe(5 * 60 * 1000); // 5 minutes

      // Two digit minutes
      expect(durationToNonNegativeInt("30m")).toBe(30 * 60 * 1000); // 30 minutes

      // Hours
      expect(durationToNonNegativeInt("2h")).toBe(2 * 60 * 60 * 1000); // 2 hours
      expect(durationToNonNegativeInt("23h")).toBe(23 * 60 * 60 * 1000); // 23 hours

      // Days
      expect(durationToNonNegativeInt("1d")).toBe(1 * 24 * 60 * 60 * 1000); // 1 day
      expect(durationToNonNegativeInt("7d")).toBe(7 * 24 * 60 * 60 * 1000); // 7 days

      // Combinations (sorted by time unit)
      expect(durationToNonNegativeInt("1s 250ms")).toBe(1 * 1000 + 250); // 1 second 250 milliseconds
      expect(durationToNonNegativeInt("30m 15s")).toBe(
        30 * 60 * 1000 + 15 * 1000,
      ); // 30 minutes 15 seconds
      expect(durationToNonNegativeInt("2h 45m")).toBe(
        2 * 60 * 60 * 1000 + 45 * 60 * 1000,
      ); // 2 hours 45 minutes
      expect(durationToNonNegativeInt("7d 12h")).toBe(
        7 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000,
      ); // 7 days 12 hours

      // Already milliseconds (NonNegativeInt)
      expect(durationToNonNegativeInt(5000 as NonNegativeInt)).toBe(5000);
    });
  });
});
