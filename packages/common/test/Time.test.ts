import { describe, expect, expectTypeOf, test } from "vitest";
import { createTestTime, createTime, durationToMillis } from "../src/Time.js";
import type { DurationLiteral, Millis } from "../src/Time.js";

describe("Time", () => {
  test("createTime returns current time", () => {
    const time = createTime();
    const now = Date.now();
    // Allow small difference due to execution time
    expect(time.now()).toBeGreaterThanOrEqual(now - 10);
    expect(time.now()).toBeLessThanOrEqual(now + 10);
  });

  test("createTestTime advances time only when advance() is called", () => {
    const time = createTestTime();

    expect(time.now()).toBe(0);
    expect(time.now()).toBe(0); // Still 0, no auto-increment

    time.advance("1ms");
    expect(time.now()).toBe(1);

    time.advance("100ms");
    expect(time.now()).toBe(101);

    time.advance("1s");
    expect(time.now()).toBe(1101);
  });

  test("createTestTime with autoIncrement returns monotonically increasing values", async () => {
    const time = createTestTime({ autoIncrement: true });
    const first = time.now();

    await Promise.resolve();

    const second = time.now();

    await Promise.resolve();

    const third = time.now();

    expect(first).toBe(0);
    expect(second).toBe(1);
    expect(third).toBe(2);
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
});
