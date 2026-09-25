import {
  assertEqual,
  assertFalse,
  assertTrue,
  assertType,
  PositiveInt,
  testStubGlobal,
} from "@evolu/common";
import { mock, test } from "node:test";
import { availableParallelism, isApplePlatform } from "./index.ts";
import { reloadApp } from "./Platform.ts";

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

test("reloadApp reloads the current page", () => {
  const reload = mock.fn<() => void>();
  const replace = mock.fn<(url: string) => void>();
  using _document = testStubGlobal("document", {});
  using _location = testStubGlobal("location", { reload, replace });

  reloadApp();

  assertEqual(reload.mock.callCount(), 1);
  assertEqual(replace.mock.callCount(), 0);
});

test("reloadApp loads a given URL instead", () => {
  const reload = mock.fn<() => void>();
  const replace = mock.fn<(url: string) => void>();
  using _document = testStubGlobal("document", {});
  using _location = testStubGlobal("location", { reload, replace });

  reloadApp("/signed-out");

  assertEqual(
    replace.mock.calls.map((call) => call.arguments),
    [["/signed-out"]],
  );
  assertEqual(reload.mock.callCount(), 0);
});
