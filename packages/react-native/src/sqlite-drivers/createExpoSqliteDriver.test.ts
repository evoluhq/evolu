import {
  AbortError,
  assert,
  assertEqual,
  assertInstanceOf,
  assertSame,
  assertThrows,
  assertType,
  EncryptionKey,
  Name,
  sql,
  testCreateRun,
  type Result,
  type SqliteRow,
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
  rows: [] as Array<SqliteRow>,
  columnNames: ["a"] as Array<string>,
  reset: () => {
    fake.events = [];
    fake.cipherVersion = null;
    fake.rows = [];
    fake.columnNames = ["a"];
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
        prepareSync: (source: string) => {
          fake.events.push(`prepare ${source}`);
          return {
            getColumnNamesSync: () => fake.columnNames,
            // Steps a row each time the result is iterated further, as
            // expo-sqlite's executeSync result does.
            executeSync: (parameters: ReadonlyArray<unknown>) => {
              fake.events.push(`execute ${JSON.stringify(parameters)}`);
              return (function* () {
                for (const row of fake.rows) {
                  fake.events.push(`step ${JSON.stringify(row)}`);
                  yield row;
                }
              })();
            },
            finalizeSync: () => {
              fake.events.push("finalize");
            },
          };
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

  it("iterates rows on a statement of its own, steps none past the one onRow stops at, and finalizes it, also when onRow throws", async () => {
    fake.reset();
    fake.rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
    await using run = testCreateRun();
    using driver = await run.ok(
      createExpoSqliteDriver(testName, { mode: "memory" }),
    );
    // Even a query whose statement exec would cache gets a statement of its own.
    const query = sql.prepared`select a from t where a > ${0};`;

    const rows: Array<SqliteRow> = [];
    driver.iterate(query, (row) => {
      rows.push(row);
      return rows.length < 2;
    });
    assertEqual(rows, [{ a: 1 }, { a: 2 }]);

    const thrown = new Error("onRow failed");
    assertThrows(
      () => {
        driver.iterate(query, () => {
          throw thrown;
        });
      },
      (error) => {
        assertSame(error, thrown);
      },
    );

    assertEqual(fake.events, [
      'open :memory: {"useNewConnection":true}',
      `prepare ${query.sql}`,
      "execute [0]",
      'step {"a":1}',
      'step {"a":2}',
      "finalize",
      `prepare ${query.sql}`,
      "execute [0]",
      'step {"a":1}',
      "finalize",
    ]);
  });

  it("rejects a query without result columns before it runs, which would run it twice, and finalizes its statement", async () => {
    fake.reset();
    fake.columnNames = [];
    await using run = testCreateRun();
    using driver = await run.ok(
      createExpoSqliteDriver(testName, { mode: "memory" }),
    );
    const query = sql`insert into t values (${1});`;

    assertThrows(
      () => {
        driver.iterate(query, () => true);
      },
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(
          error.message,
          "SqliteDriver.iterate needs a query that returns rows.",
        );
      },
    );

    assertEqual(fake.events, [
      'open :memory: {"useNewConnection":true}',
      `prepare ${query.sql}`,
      "finalize",
    ]);
  });
});
