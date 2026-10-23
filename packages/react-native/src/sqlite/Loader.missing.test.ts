import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
import { mock, test } from "node:test";

// A native build without Evolu's modules, where TurboModuleRegistry.get
// returns null.
mock.module(new URL("../specs/NativeEvoluSqlite.ts", import.meta.url).href, {
  exports: { default: null },
});
mock.module(new URL("../specs/NativeEvoluApp.ts", import.meta.url).href, {
  exports: { default: null },
});

const { loadEvoluApp, loadNativeSqlite } = await import("./Loader.ts");

for (const [name, load] of [
  ["EvoluSqlite", loadNativeSqlite],
  ["EvoluApp", loadEvoluApp],
] as const)
  test(`refuses a native build without ${name} with a message that names both causes`, () => {
    const error = assertThrowsInstanceOf(load, Error);

    assertEqual(
      error.message,
      `Evolu's native module ${name} isn't in this native build. Expo Go can't load Evolu's native code, and an over-the-air update can't add it to a build made without it. Rebuild the native app, in Expo as a development build, and bump the version that over-the-air updates target, such as Expo's runtime version.`,
    );
  });
