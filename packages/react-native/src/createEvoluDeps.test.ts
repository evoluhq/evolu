import {
  assertEqual,
  assertOk,
  assertSame,
  createConsole,
  EncryptionKey,
  Name,
  testCreateRun,
  type ConsoleDep,
  type CreateSqliteDriverDep,
  type ReloadAppDep,
} from "@evolu/common";
import type { WaitForDatabaseReleaseDep } from "@evolu/common/local-first";
import { mock, test } from "node:test";

/** What the fakes were asked, in order. */
const calls: Array<string> = [];

// The specs import React Native, which Node.js can't load.
mock.module(new URL("./specs/NativeEvoluSqlite.ts", import.meta.url).href, {
  exports: {
    default: {
      createBinding: () => {
        calls.push("createBinding");
        return {
          abiVersion: 1,
          openEncryptedFile: (path: string) => {
            calls.push(`openEncryptedFile ${path}`);
            return {
              close: () => {
                calls.push("close");
              },
            };
          },
          isFileOpen: (path: string) => {
            calls.push(`isFileOpen ${path}`);
            return false;
          },
        };
      },
    },
  },
});
mock.module(new URL("./specs/NativeEvoluApp.ts", import.meta.url).href, {
  exports: {
    default: {
      getDatabaseDirectory: () => {
        calls.push("getDatabaseDirectory");
        return "/data/SQLite";
      },
      reloadApp: () => {
        calls.push("reloadApp");
      },
    },
  },
});

type SharedDeps = ConsoleDep &
  CreateSqliteDriverDep &
  ReloadAppDep &
  WaitForDatabaseReleaseDep;

/** What createEvoluDeps passed to the shared wiring, which Node.js runs too. */
const sharedDeps: Array<SharedDeps> = [];
const evoluDeps = {};
mock.module(new URL("./shared.ts", import.meta.url).href, {
  exports: {
    createEvoluDeps: (deps: SharedDeps) => {
      sharedDeps.push(deps);
      return evoluDeps;
    },
  },
});

const { createEvoluDeps } = await import("./createEvoluDeps.ts");
const callsAtImport = [...calls];

const testName = Name.orThrow("Test");

test("wires the native driver, waitForDatabaseRelease and EvoluApp's reloadApp into the shared wiring, in EvoluApp's directory", async () => {
  const console = createConsole();

  assertSame(createEvoluDeps({ console }), evoluDeps);
  assertEqual(callsAtImport, []);
  assertEqual(calls, ["createBinding", "getDatabaseDirectory"]);
  const [deps] = sharedDeps;
  assertSame(deps.console, console);

  await using run = testCreateRun();
  {
    using _driver = await run.ok(
      deps.createSqliteDriver(testName, {
        mode: "encrypted",
        encryptionKey: EncryptionKey.orThrow(new Uint8Array(32)),
      }),
    );
  }
  assertOk(await run(deps.waitForDatabaseRelease(testName)));
  deps.reloadApp();

  assertEqual(calls.slice(2), [
    "openEncryptedFile /data/SQLite/evolu1-Test.db",
    "close",
    "isFileOpen /data/SQLite/evolu1-Test.db",
    "reloadApp",
  ]);
});
