/**
 * The suites the example apps run on a simulator, an emulator or a phone, as
 * `runner.ts` runs them: the binding's conformance suite, the driver, the
 * databases expo-sqlite's SQLCipher wrote, which `scripts/device-tests.mts`
 * seeds into expo-sqlite's directory, and what only a device shows, such as
 * Evolu itself on the app's JavaScript engine, Hermes.
 *
 * `scripts/device-tests.mts` registers them in Node.js too, with a test
 * function that only counts, so it knows how many tests the app must run.
 * Registering runs no test and touches no binding.
 *
 * It runs only inside the repository, which the examples import it from by a
 * relative path, and uses no `using` declarations, which an app's Babel may not
 * transform.
 *
 * @module
 */
import {
  assert,
  createRun,
  EncryptionKey,
  id,
  Name,
  NonEmptyTrimmedString100,
  sql,
  trySync,
  type DisposableRun,
  type NativeSqlite,
  type SqliteDriver,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createQueryBuilder,
  testAppOwner,
  type Evolu,
  type EvoluDeps,
} from "@evolu/common/local-first";
import { nativeSqliteAbiVersion } from "../../src/sqlite/Binding.ts";
import { createReactNativeSqliteDriver } from "../../src/sqlite/Driver.ts";
import { createWaitForDatabaseRelease } from "../../src/sqlite/WaitForDatabaseRelease.ts";
import { describeBindingConformance } from "../bindingConformance.ts";

/** A platform the example apps run on. */
export type DevicePlatform = "ios" | "android";

/** A test the suites register, which fails when it throws or rejects. */
export type DeviceTest = (
  name: string,
  fn: () => void | Promise<void>,
) => unknown;

/** What {@link registerDeviceSuites} takes. */
export interface DeviceSuitesDeps {
  readonly platform: DevicePlatform;
  readonly nativeSqlite: NativeSqlite;
  /** The directory of the database files, which `EvoluApp` gives. */
  readonly databaseDirectory: string;
  /**
   * An absolute path, without a trailing slash, of an empty directory for the
   * conformance suite's files, inside {@link databaseDirectory}.
   */
  readonly directory: string;
  readonly test: DeviceTest;
  readonly assertEqual: (actual: unknown, expected: unknown) => void;
  /** The main entry's `createEvoluDeps`, which the app imports as any app does. */
  readonly createEvoluDeps: () => EvoluDeps;
}

/**
 * The databases expo-sqlite's SQLCipher wrote, one per expo-sqlite release
 * whose SQLCipher Evolu supported, as `scripts/device-tests.mts` writes them
 * with `@evolu/sqlite-core`'s host build of that SQLCipher: one the fixture
 * created, and one whose transaction crashed after the write that leaves its
 * hot journal at its fullest.
 */
export const deviceFixtures: ReadonlyArray<{
  /** The database's name, so its file is `evolu1-<name>.db`. */
  readonly name: string;
  readonly expoSqlite: string;
  readonly crashed: boolean;
}> = /*#__PURE__*/ ["57.0.4", "58.0.13"].flatMap((expoSqlite) => {
  const name = `expo-sqlite-${expoSqlite.replaceAll(".", "-")}`;
  return [
    { name, expoSqlite, crashed: false },
    { name: `${name}-crashed`, expoSqlite, crashed: true },
  ];
});

/**
 * The name of the database of the conformance suite's ill-formed names, so its
 * file is `evolu1-ill-formed-names.db`, which `scripts/device-tests.mts` writes
 * with the other fixtures.
 */
export const deviceIllFormedNames = "ill-formed-names";

/** The key the fixtures were keyed with, as SQLCipher's raw key. */
export const deviceFixtureKey = /*#__PURE__*/ Uint8Array.from(
  { length: 32 },
  (_, index) => index * 5 + 3,
);

/** The rows of each fixture's table `t`. */
export const deviceFixtureRows = 30;

/**
 * What starts each line the runner logs for `scripts/device-tests.mts`: a
 * failed test's, the result's and the reload's.
 */
export const deviceTestsTag = "EvoluNativeTests";

/**
 * The name of the database the runner keeps open across the reload, so its file
 * is `evolu1-native-tests-reload.db`, which the driver removes before a run, in
 * case an earlier one ended before its reload.
 */
export const deviceTestsMarker = "native-tests-reload";

/** Registers every suite of the device runs. */
export const registerDeviceSuites = (deps: DeviceSuitesDeps): void => {
  const { platform, nativeSqlite, databaseDirectory, test, assertEqual } = deps;
  const sqliteDeps = { nativeSqlite, databaseDirectory };
  const createSqliteDriver = createReactNativeSqliteDriver(sqliteDeps);
  const key = EncryptionKey.orThrow(new Uint8Array(32).fill(7));

  /**
   * Runs `fn` with a Run of its own, which it disposes. A failure rejects, so
   * the Run reports no defect, which an app would show as a crash.
   */
  const withRun = async (
    fn: (run: DisposableRun) => Promise<void>,
  ): Promise<void> => {
    const run = createRun({ reportDefect: () => undefined });
    try {
      await fn(run);
    } finally {
      await run[Symbol.asyncDispose]();
    }
  };

  /** Opens `name` with `options`, runs `fn` with it, and disposes it. */
  const withDriver = (
    run: DisposableRun,
    name: string,
    options: Parameters<typeof createSqliteDriver>[1],
    fn: (driver: SqliteDriver) => void,
  ): Promise<void> =>
    run.ok(createSqliteDriver(Name.orThrow(name), options)).then((driver) => {
      try {
        fn(driver);
      } finally {
        driver[Symbol.dispose]();
      }
    });

  describeBindingConformance({
    binding: nativeSqlite,
    abiVersion: nativeSqliteAbiVersion,
    directory: deps.directory,
    illFormedNames: `${databaseDirectory}/evolu1-${deviceIllFormedNames}.db`,
    test,
    assertEqual,
  });

  test("the database directory is expo-sqlite's", () => {
    assert(
      databaseDirectory.endsWith(
        platform === "ios" ? "/Documents/SQLite" : "/files/SQLite",
      ),
      `The directory is ${databaseDirectory}.`,
    );
  });

  test("crypto.getRandomValues fills an array, which needs the polyfills on React Native", () => {
    const filled = crypto.getRandomValues(new Uint8Array(64));
    assert(
      filled.some((byte) => byte !== 0),
      "Expected random bytes.",
    );
  });

  test("the driver creates evolu1-<name>.db, which reopens with its rows", () =>
    withRun(async (run) => {
      const name = `driver-plain-${String(Date.now())}`;
      const path = `${databaseDirectory}/evolu1-${name}.db`;
      await withDriver(run, name, undefined, (driver) => {
        assertEqual(nativeSqlite.isFileOpen(path), true);
        driver.exec(sql`create table t (a);`);
        driver.exec(sql`
          insert into t
          values
            (1),
            (2);
        `);
      });
      assertEqual(nativeSqlite.isFileOpen(path), false);
      await withDriver(run, name, undefined, (driver) => {
        assertEqual(driver.exec(sql`select a from t;`).rows, [
          { a: 1 },
          { a: 2 },
        ]);
        driver.deleteDatabase();
      });
    }));

  test("an encrypted database reopens with its key, iterates, and exports a plaintext file", () =>
    withRun(async (run) => {
      const name = `driver-encrypted-${String(Date.now())}`;
      const options = { mode: "encrypted", encryptionKey: key } as const;
      await withDriver(run, name, options, (driver) => {
        driver.exec(sql`create table t (a);`);
        driver.exec(sql`
          insert into t
          values
            (1),
            (2),
            (3);
        `);
      });
      await withDriver(run, name, options, (driver) => {
        const rows: Array<unknown> = [];
        driver.iterate(sql`select a from t;`, (row) => {
          rows.push(row);
          return rows.length < 2;
        });
        assertEqual(rows, [{ a: 1 }, { a: 2 }]);
        const exported = driver.export();
        assertEqual(
          String.fromCharCode(...exported.subarray(0, 15)),
          "SQLite format 3",
        );
        driver.deleteDatabase();
      });
    }));

  test("an open of a file another connection holds tries again and succeeds once that connection closes", () =>
    withRun(async (run) => {
      const name = `driver-held-${String(Date.now())}`;
      const holder = nativeSqlite.openFile(
        `${databaseDirectory}/evolu1-${name}.db`,
      );
      let closed = false;
      setTimeout(() => {
        holder.close();
        closed = true;
      }, 300);
      await withDriver(run, name, undefined, (driver) => {
        assertEqual(closed, true);
        driver.deleteDatabase();
      });
    }));

  test("waitForDatabaseRelease waits until another connection closes the file", () =>
    withRun(async (run) => {
      const name = `driver-wait-${String(Date.now())}`;
      const path = `${databaseDirectory}/evolu1-${name}.db`;
      const holder = nativeSqlite.openFile(path);
      setTimeout(() => {
        holder.close();
      }, 300);
      await run.orThrow(
        createWaitForDatabaseRelease(sqliteDeps)(Name.orThrow(name)),
      );
      assertEqual(nativeSqlite.isFileOpen(path), false);
      nativeSqlite.deleteFile(path);
    }));

  test("Evolu, created by createEvoluDeps with a transport, stores and queries a row", async () => {
    const schema = {
      todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
    };
    const titlesQuery = createQueryBuilder(schema)((db) =>
      db.selectFrom("todo").select("title"),
    );
    const evoluDeps = deps.createEvoluDeps();
    // A failure rejects, so the Run reports no defect, which an app would show
    // as a crash.
    const run = createRun({ ...evoluDeps, reportDefect: () => undefined });
    let evolu: Evolu<typeof schema> | undefined;
    let unsubscribe = (): void => undefined;
    // A failure in Evolu's workers sets evoluError and completes nothing, so
    // each step races it.
    const failed = new Promise<never>((_, reject) => {
      unsubscribe = evoluDeps.evoluError.subscribe(() => {
        const error = evoluDeps.evoluError.get();
        // An UnknownError may hold what JSON can't encode, such as a cycle.
        const text = trySync(() =>
          JSON.stringify(error, (_key, value: unknown) =>
            value instanceof Error
              ? value.message
              : typeof value === "bigint"
                ? `${value}n`
                : value,
          ),
        );
        reject(
          new Error(
            `evoluError: ${text.ok ? text.value : String(error?.type)}`,
          ),
        );
      });
    });
    try {
      evolu = await Promise.race([
        run.ok(
          createEvolu(schema, {
            appName: AppName.orThrow(`native-tests-${String(Date.now())}`),
            appOwner: testAppOwner,
            // Unreachable, there only to make Evolu register the owner for
            // sync, which the transports' code runs.
            transports: [{ type: "WebSocket", url: "ws://127.0.0.1:9" }],
          }),
        ),
        failed,
      ]);
      const inserted = Promise.withResolvers<void>();
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("stored") },
        { onComplete: inserted.resolve },
      );
      await Promise.race([inserted.promise, failed]);
      assertEqual(await Promise.race([evolu.loadQuery(titlesQuery), failed]), [
        { title: "stored" },
      ]);
    } finally {
      unsubscribe();
      await evolu?.[Symbol.asyncDispose]();
      await run[Symbol.asyncDispose]();
      evoluDeps[Symbol.dispose]();
    }
    const { name } = evolu;
    await withRun((waitRun) =>
      waitRun.orThrow(createWaitForDatabaseRelease(sqliteDeps)(name)),
    );
    nativeSqlite.deleteFile(`${databaseDirectory}/evolu1-${name}.db`);
  });

  for (const fixture of deviceFixtures)
    test(`opens ${fixture.crashed ? "with its hot journal rolled back " : ""}the database expo-sqlite ${fixture.expoSqlite}'s SQLCipher wrote, in place`, () =>
      withRun((run) =>
        withDriver(
          run,
          fixture.name,
          {
            mode: "encrypted",
            encryptionKey: EncryptionKey.orThrow(deviceFixtureKey),
          },
          (driver) => {
            const [counted] = driver.exec(sql`
              select
                (
                  select count(*) from t where v like 'evolu-secret-row%'
                ) as original,
                (select count(*) from t where v like 'updated%') as updated,
                (
                  select integrity_check from pragma_integrity_check limit 1
                ) as integrity;
            `).rows;
            // The crash happened before SQLCipher committed, so its rollback
            // restores every row.
            assertEqual(counted, {
              original: deviceFixtureRows,
              updated: 0,
              integrity: "ok",
            });
          },
        ),
      ));
};
