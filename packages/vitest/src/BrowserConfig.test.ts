import { assertEqual } from "@evolu/common";
import { describe, it } from "node:test";
import { createBrowserInstances } from "./BrowserConfig.ts";

describe("createBrowserInstances", () => {
  it("uses Chromium for coverage", () => {
    assertEqual(createBrowserInstances({ coverage: true, mode: "" }), [
      { browser: "chromium" },
    ]);
  });

  it("defaults to Firefox and WebKit without coverage", () => {
    assertEqual(createBrowserInstances({ coverage: false, mode: "" }), [
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
});
