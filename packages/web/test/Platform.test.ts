import { PositiveInt } from "@evolu/common";
import { afterEach, expect, expectTypeOf, test, vi } from "vitest";
import { availableParallelism, isApplePlatform } from "../src/index.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each(["macOS", "MacIntel", "iPhone", "iPad", "iPod"])(
  "isApplePlatform recognizes %s",
  (platform) => {
    vi.stubGlobal("navigator", {
      platform: "Win32",
      userAgentData: { platform },
    });

    expect(isApplePlatform()).toBe(true);
  },
);

test("isApplePlatform recognizes a non-Apple platform", () => {
  vi.stubGlobal("navigator", {
    platform: "MacIntel",
    userAgentData: { platform: "Windows" },
  });

  expect(isApplePlatform()).toBe(false);
});

test("isApplePlatform falls back to navigator.platform", () => {
  vi.stubGlobal("navigator", { platform: "MacIntel" });

  expect(isApplePlatform()).toBe(true);
});

test("availableParallelism returns the validated browser value", () => {
  vi.spyOn(globalThis.navigator, "hardwareConcurrency", "get").mockReturnValue(
    128,
  );

  const parallelism = availableParallelism();

  expectTypeOf(parallelism).toEqualTypeOf<PositiveInt>();
  expect(parallelism).toBe(128);
});
