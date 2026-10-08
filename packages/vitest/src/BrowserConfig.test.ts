import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
import { describe, it } from "node:test";
import { createBrowserInstances } from "./BrowserConfig.ts";

describe("createBrowserInstances", () => {
  it("runs Chromium, Firefox and WebKit in the mode Vitest uses without --mode", () => {
    assertEqual(createBrowserInstances({ coverage: false, mode: "test" }), [
      { browser: "chromium" },
      { browser: "firefox" },
      { browser: "webkit" },
    ]);
  });

  it("selects browsers by mode", () => {
    assertEqual(createBrowserInstances({ coverage: false, mode: "chromium" }), [
      { browser: "chromium" },
    ]);
    assertEqual(createBrowserInstances({ coverage: false, mode: "firefox" }), [
      { browser: "firefox" },
    ]);
    assertEqual(createBrowserInstances({ coverage: false, mode: "webkit" }), [
      { browser: "webkit" },
    ]);
    assertEqual(
      createBrowserInstances({ coverage: false, mode: "firefox-webkit" }),
      [{ browser: "firefox" }, { browser: "webkit" }],
    );
  });

  it("uses only Chromium for coverage in every accepted mode", () => {
    for (const mode of [
      "test",
      "chromium",
      "firefox",
      "webkit",
      "firefox-webkit",
    ])
      assertEqual(createBrowserInstances({ coverage: true, mode }), [
        { browser: "chromium" },
      ]);
  });

  describe("throws an error naming an unknown mode and the accepted ones", () => {
    for (const coverage of [false, true])
      for (const mode of ["", "chromiun", "constructor"])
        it(`for mode "${mode}" with coverage ${coverage}`, () => {
          const error = assertThrowsInstanceOf(
            () => createBrowserInstances({ coverage, mode }),
            Error,
          );
          assertEqual(
            error.message,
            `Unknown Vitest mode "${mode}" for browser projects. Expected one of: test, chromium, firefox, webkit, firefox-webkit. Without --mode, vitest and vitest run use "test".`,
          );
        });
  });
});
