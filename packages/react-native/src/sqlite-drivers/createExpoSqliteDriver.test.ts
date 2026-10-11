import {
  AbortError,
  assert,
  assertEqual,
  assertInstanceOf,
  assertType,
  EncryptionKey,
  Name,
  testCreateRun,
  type Result,
} from "@evolu/common";
import type { SQLiteOpenOptions } from "expo-sqlite";
import { describe, it, mock } from "node:test";

/**
 * A fake of `expo-sqlite` that records what the driver does with it, in order,
 * in `events`. Each test resets it and sets the SQLCipher version it needs.
 */
const fake = {
  events: [] as Array<string>,
  cipherVersion: null as string | null,
  reset: () => {
    fake.events = [];
    fake.cipherVersion = null;
  },
};

mock.module("expo-sqlite", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
  exports: {
    openDatabaseSync: (databaseName: string, options?: SQLiteOpenOptions) => {
      fake.events.push(
        `open ${databaseName}${options ? ` ${JSON.stringify(options)}` : ""}`,
      );
      return {
        getFirstSync: (source: string) => {
          fake.events.push(source);
          return fake.cipherVersion === null
            ? null
            : { cipher_version: fake.cipherVersion };
        },
        execSync: (source: string) => {
          fake.events.push(source);
        },
        closeSync: () => {
          fake.events.push("close");
        },
      };
    },
    deleteDatabaseSync: (databaseName: string) => {
      fake.events.push(`delete ${databaseName}`);
    },
  },
});

const { createExpoSqliteDriver } = await import("./createExpoSqliteDriver.ts");

const testName = Name.orThrow("Test");
const testKey = EncryptionKey.orThrow(new Uint8Array(32).fill(42));

/** The Error the driver threw, which the Run reports as its panic's defect. */
const getDefect = (result: Result<unknown, unknown>): Error => {
  assert(!result.ok, "Expected the driver to fail.");
  assertType(AbortError, result.error);
  assert(result.error.reason.type === "PanicAbortReason", "Expected a panic.");
  assertInstanceOf(result.error.reason.defect, Error);
  return result.error.reason.defect;
};

describe("createExpoSqliteDriver", () => {
  it("throws before keying the database when expo-sqlite was built without SQLCipher", async () => {
    fake.reset();
    await using run = testCreateRun();

    const defect = getDefect(
      await run.abortable(
        createExpoSqliteDriver(testName, {
          mode: "encrypted",
          encryptionKey: testKey,
        }),
      ),
    );

    assertEqual(
      defect.message,
      `Evolu can't encrypt the database because expo-sqlite was built without SQLCipher. Add ["expo-sqlite", { "useSQLCipher": true }] to the plugins in your app config and run npx expo prebuild --clean, or, in an app that doesn't run Expo's prebuild, set expo.sqlite.useSQLCipher=true in android/gradle.properties and "expo.sqlite.useSQLCipher": "true" in ios/Podfile.properties.json and run pod install in the ios directory, then rebuild the native app.`,
    );
    assertEqual(fake.events, [
      "open evolu1-Test.db",
      "PRAGMA cipher_version",
      "close",
    ]);
  });

  it("keys the database with the encryption key when expo-sqlite has SQLCipher", async () => {
    fake.reset();
    fake.cipherVersion = "4.7.0 community";
    await using run = testCreateRun();

    const driver = await run.ok(
      createExpoSqliteDriver(testName, {
        mode: "encrypted",
        encryptionKey: testKey,
      }),
    );
    driver[Symbol.dispose]();

    assertEqual(fake.events, [
      "open evolu1-Test.db",
      "PRAGMA cipher_version",
      `PRAGMA key = "x'${"2a".repeat(32)}'"`,
      "close",
    ]);
  });

  it("opens each memory database on a new connection without requiring SQLCipher", async () => {
    fake.reset();
    await using run = testCreateRun();

    const driver = await run.ok(
      createExpoSqliteDriver(testName, { mode: "memory" }),
    );
    driver[Symbol.dispose]();

    assertEqual(fake.events, [
      'open :memory: {"useNewConnection":true}',
      "close",
    ]);
  });

  it("opens an unencrypted database without requiring SQLCipher", async () => {
    fake.reset();
    await using run = testCreateRun();

    const driver = await run.ok(createExpoSqliteDriver(testName));
    driver[Symbol.dispose]();

    assertEqual(fake.events, ["open evolu1-Test.db", "close"]);
  });
});
