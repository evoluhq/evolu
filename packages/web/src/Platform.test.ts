import {
  assertEqual,
  assertFalse,
  assertTrue,
  assertType,
  PositiveInt,
  testStubGlobal,
} from "@evolu/common";
import { test } from "node:test";
import { availableParallelism, isApplePlatform } from "./index.ts";

for (const platform of ["macOS", "MacIntel", "iPhone", "iPad", "iPod"]) {
  test(`isApplePlatform recognizes ${platform}`, () => {
    using _navigator = testStubGlobal("navigator", {
      platform: "Win32",
      userAgentData: { platform },
    });

    assertTrue(isApplePlatform());
  });
}

test("isApplePlatform recognizes a non-Apple platform", () => {
  using _navigator = testStubGlobal("navigator", {
    platform: "MacIntel",
    userAgentData: { platform: "Windows" },
  });

  assertFalse(isApplePlatform());
});

test("isApplePlatform falls back to navigator.platform", () => {
  using _navigator = testStubGlobal("navigator", { platform: "MacIntel" });

  assertTrue(isApplePlatform());
});

test("availableParallelism returns the validated browser value", () => {
  using _navigator = testStubGlobal("navigator", { hardwareConcurrency: 128 });

  const parallelism = availableParallelism();

  assertType<typeof parallelism, PositiveInt>();
  assertEqual(parallelism, 128);
});
