import { assertEqual, assertSame, assertThrowsInstanceOf } from "@evolu/common";
import { mock, test } from "node:test";

/** What the fake EvoluSqlite module's createBinding returns, per test. */
let binding: unknown = { abiVersion: 1 };
let createdBindings = 0;

const evoluApp = {
  getDatabaseDirectory: () => "/data/SQLite",
  reloadApp: () => undefined,
};

// The specs import React Native, which Node.js can't load.
mock.module(new URL("../specs/NativeEvoluSqlite.ts", import.meta.url).href, {
  exports: {
    default: {
      createBinding: () => {
        createdBindings++;
        return binding;
      },
    },
  },
});
mock.module(new URL("../specs/NativeEvoluApp.ts", import.meta.url).href, {
  exports: { default: evoluApp },
});

const { loadEvoluApp, loadNativeSqlite } = await import("./Loader.ts");
const createdBindingsAtImport = createdBindings;

test("creates no binding at import, and one each time it loads", () => {
  assertSame(createdBindingsAtImport, 0);
  const created = createdBindings;
  binding = { abiVersion: 1 };

  assertSame(loadNativeSqlite(), binding);
  assertSame(loadNativeSqlite(), binding);
  assertSame(createdBindings, created + 2);
});

test("refuses a binding of another version with a message that says to rebuild the native app", () => {
  binding = { abiVersion: 2 };

  const error = assertThrowsInstanceOf(() => loadNativeSqlite(), Error);

  assertEqual(
    error.message,
    "Evolu's native module implements version 2 of its binding, but this JavaScript needs version 1. Rebuild the native app and bump the version that over-the-air updates target, such as Expo's runtime version, so no update runs on an older native build.",
  );
});

test("returns the EvoluApp module", () => {
  assertSame(loadEvoluApp(), evoluApp);
});
