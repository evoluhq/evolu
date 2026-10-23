/**
 * `react-native.config.js` as React Native CLI loads it: synchronously, with
 * `require`, which for an ES module returns its `module.exports` export, else
 * its namespace, whose fields the CLI would then read as missing.
 */
import { assertEqual } from "@evolu/common";
import { createRequire } from "node:module";
import { test } from "node:test";

test("require gives the config itself, with the C++ module's autolinking fields", () => {
  const config = createRequire(import.meta.url)(
    "../../react-native.config.js",
  ) as {
    readonly dependency?: {
      readonly platforms: { readonly android: Record<string, string> };
    };
  };

  assertEqual(config.dependency?.platforms.android, {
    cxxModuleCMakeListsModuleName: "evolu_sqlite",
    cxxModuleCMakeListsPath: "../cpp/CMakeLists.txt",
    cxxModuleHeaderName: "EvoluSqlite",
  });
});
