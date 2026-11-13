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
  eqUint8Array,
  id,
  Name,
  NonEmptyTrimmedString100,
  sql,
  trySync,
  UrlFromString,
  WebSocketUrl,
  type DisposableRun,
  type NativeSqlite,
  type SqliteDriver,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createEvoluApp,
  createOwnerSecret,
  createQueryBuilder,
  mnemonicToOwnerSecret,
  testAppOwner,
  type AppOwnerEvolu,
  type EvoluApp,
  type EvoluDeps,
} from "@evolu/common/local-first";
// A type only: the Node.js driver imports this module, and the loader the
// function imports needs React Native.
import type {
  forgetDeviceSecret,
  loadDeviceSecret,
} from "../../src/DeviceSecret.ts";
import { nativeSqliteAbiVersion } from "../../src/sqlite/Binding.ts";
import { createReactNativeSqliteDriver } from "../../src/sqlite/Driver.ts";
import { createWaitForDatabaseRelease } from "../../src/sqlite/WaitForDatabaseRelease.ts";
import { describeBindingConformance } from "../bindingConformance.ts";
import { urlCases } from "./urlCases.ts";

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
  readonly loadDeviceSecret: typeof loadDeviceSecret;
  readonly forgetDeviceSecret: typeof forgetDeviceSecret;
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

/**
 * The app name of the DeviceSecret record that `scripts/device-tests.mts` seeds
 * on Android, which no Keystore key can read, and which the runner forgets, so
 * the driver finds a new record after the run.
 */
export const deviceUnreadableSecretAppName =
  "native-tests-device-secret-unreadable";

/**
 * The DeviceSecrets the runner stores on Android before the reload, whose
 * records `scripts/device-tests.mts` then cuts to these lengths, shorter than
 * an IV and a tag, so the relaunched app finds them unreadable while their
 * Keystore keys exist.
 */
export const deviceTruncatedSecrets = [
  { appName: "native-tests-device-secret-truncated-10", length: 10 },
  { appName: "native-tests-device-secret-truncated-20", length: 20 },
] as const;

/**
 * The app name of a DeviceSecret the runner stores on Android before the
 * reload, whose record `scripts/device-tests.mts` then changes in the byte
 * after its IV, so the relaunched app finds a record of full length whose
 * decryption fails authentication while its Keystore key exists.
 */
export const deviceTamperedSecretAppName =
  "native-tests-device-secret-tampered";

/**
 * The app name whose DeviceSecret a test keeps while it forgets the one of
 * {@link deviceForgottenSecretAppName}. On Android, `scripts/device-tests.mts`
 * checks that the Keystore then holds a key of this name and none of the
 * other.
 */
export const deviceKeptSecretAppName = "native-tests-device-secret-kept";

/** The app name whose DeviceSecret that test forgets. */
export const deviceForgottenSecretAppName =
  "native-tests-device-secret-forgotten";

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
 * The name of the database the runner keeps open across the reload, and which
 * then marks that the driver restarts the app, so its file is
 * `evolu1-native-tests-reload.db`, which the driver removes before a run, in
 * case an earlier one ended before it.
 */
export const deviceTestsMarker = "native-tests-reload";

/**
 * The app name of the DeviceSecret the runner checks across the app's restart,
 * which a test loads too.
 */
export const deviceSecretAppName = "native-tests-device-secret";

/**
 * The name of the database the runner encrypts with that DeviceSecret before
 * the reload and opens with the one it loads after the restart, so its file is
 * `evolu1-native-tests-device-secret.db`, which the driver removes before a
 * run.
 */
export const deviceSecretCheck = "native-tests-device-secret";

/**
 * The app name of the EvoluApp the runner creates before the reload and opens
 * again after the restart, which fails unless the device database opens with
 * the same DeviceSecret and still lists its AppOwners.
 */
export const deviceEvoluAppRelaunchName = "native-tests-evolu-app-relaunch";

/** What the createEvoluApp cases need. */
export type DeviceEvoluAppDeps = Pick<
  DeviceSuitesDeps,
  | "nativeSqlite"
  | "databaseDirectory"
  | "createEvoluDeps"
  | "loadDeviceSecret"
  | "forgetDeviceSecret"
>;

/**
 * Creates the EvoluApp {@link deviceEvoluAppRelaunchName} for the runner before
 * the reload: a new DeviceSecret, so a new device database, with its first
 * AppOwner and `testAppOwner` restored from its mnemonic.
 */
export const prepareDeviceEvoluAppRelaunch = async (
  deps: DeviceEvoluAppDeps,
): Promise<void> => {
  const appName = AppName.orThrow(deviceEvoluAppRelaunchName);
  await forgetDeviceSecretOf(deps, appName);
  await withDeviceEvoluApp(deps, appName, async ({ app, race }) => {
    assert(
      app.appOwners.get().length === 1,
      "The new device database has no first AppOwner.",
    );
    const restored = await race(
      app.add(mnemonicToOwnerSecret(testAppOwner.mnemonic)),
    );
    assert(restored.ok, JSON.stringify(restored));
  });
};

/**
 * Opens the EvoluApp {@link deviceEvoluAppRelaunchName} after the restart. With
 * the DeviceSecret the platform's secure storage kept, its device database
 * still lists the first AppOwner and `testAppOwner`, and opens `testAppOwner`,
 * added last. Another DeviceSecret would open a new device database with a new
 * AppOwner alone. It then removes what it created.
 */
export const checkDeviceEvoluAppRelaunch = async (
  deps: DeviceEvoluAppDeps,
): Promise<void> => {
  const appName = AppName.orThrow(deviceEvoluAppRelaunchName);
  const deviceName = await withDeviceEvoluApp(
    deps,
    appName,
    async ({ app, race }) => {
      const ids = app.appOwners.get().map(({ id }) => id);
      assert(
        ids.length === 2 && ids.includes(testAppOwner.id),
        `The device database lists ${JSON.stringify(ids)} after the restart.`,
      );
      assert(
        app.current.get()?.appOwner.id === testAppOwner.id,
        "The restart didn't open the AppOwner opened last.",
      );
      await removeAppOwners(app, race);
    },
  );
  await deleteDeviceDatabase(deps, deviceName);
  await forgetDeviceSecretOf(deps, appName);
};

/**
 * Runs `fn` with a Run of its own, which it disposes. A failure rejects, so the
 * Run reports no defect, which an app would show as a crash.
 */
const withRun = async <T>(
  fn: (run: DisposableRun) => Promise<T>,
): Promise<T> => {
  const run = createRun({ reportDefect: () => undefined });
  try {
    return await fn(run);
  } finally {
    await run[Symbol.asyncDispose]();
  }
};

/**
 * Loads the DeviceSecret of `appName`, whose `record` it can't read, twice, so
 * the first attempt replaced nothing, then forgets it and checks that the new
 * one it stores loads again.
 */
const assertUnreadableUntilForgotten = async (
  run: DisposableRun,
  deps: Pick<DeviceSuitesDeps, "loadDeviceSecret" | "forgetDeviceSecret">,
  appName: AppName,
  record: string,
): Promise<void> => {
  for (const attempt of [1, 2]) {
    const loaded = await run(deps.loadDeviceSecret(appName));
    assert(
      !loaded.ok && loaded.error.type === "DeviceSecretUnreadable",
      `Attempt ${attempt} at ${record} ${loaded.ok ? "loaded a DeviceSecret" : `failed with ${loaded.error.type}`}.`,
    );
  }
  await run.orThrow(deps.forgetDeviceSecret(appName));
  const created = await run.orThrow(deps.loadDeviceSecret(appName));
  assert(
    eqUint8Array(await run.orThrow(deps.loadDeviceSecret(appName)), created),
    `The DeviceSecret stored after forgetting ${record} didn't load again.`,
  );
};

/** The records the driver damages before the relaunch, with what it did. */
const relaunchUnreadableSecrets = [
  ...deviceTruncatedSecrets.map(({ appName, length }) => ({
    appName,
    record: `the record of ${length} bytes`,
  })),
  {
    appName: deviceTamperedSecretAppName,
    record: "the record changed in one byte",
  },
];

/**
 * Stores new DeviceSecrets of {@link deviceTruncatedSecrets} and
 * {@link deviceTamperedSecretAppName} for the runner on Android before the
 * reload, so their names have Keystore keys once the driver damages their
 * records. It forgets them first, as a run that ended before its check left
 * them damaged.
 */
export const prepareDeviceSecretRelaunch = async (
  deps: Pick<DeviceSuitesDeps, "loadDeviceSecret" | "forgetDeviceSecret">,
): Promise<void> =>
  withRun(async (run) => {
    for (const secret of relaunchUnreadableSecrets) {
      const appName = AppName.orThrow(secret.appName);
      await run.orThrow(deps.forgetDeviceSecret(appName));
      await run.orThrow(deps.loadDeviceSecret(appName));
    }
  });

/**
 * Loads the DeviceSecrets of {@link deviceTruncatedSecrets} and
 * {@link deviceTamperedSecretAppName} after the restart. The driver damaged
 * their records meanwhile, so each is unreadable, also on a second attempt,
 * until forgetDeviceSecret starts over with a new one.
 */
export const checkDeviceSecretRelaunch = async (
  deps: Pick<DeviceSuitesDeps, "loadDeviceSecret" | "forgetDeviceSecret">,
): Promise<void> =>
  withRun(async (run) => {
    for (const secret of relaunchUnreadableSecrets)
      await assertUnreadableUntilForgotten(
        run,
        deps,
        AppName.orThrow(secret.appName),
        secret.record,
      );
  });

/** Registers every suite of the device runs. */
export const registerDeviceSuites = (deps: DeviceSuitesDeps): void => {
  const { platform, nativeSqlite, databaseDirectory, test, assertEqual } = deps;
  const sqliteDeps = { nativeSqlite, databaseDirectory };
  const createSqliteDriver = createReactNativeSqliteDriver(sqliteDeps);
  const key = EncryptionKey.orThrow(new Uint8Array(32).fill(7));

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
    // JSI's isArray sees the array a Proxy wraps.
    acceptsProxyArrays: true,
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

  test("loadDeviceSecret stores a DeviceSecret in the platform's secure storage and loads the same one", () =>
    withRun(async (run) => {
      // The runner checks that the app loads it after a restart too, and the
      // driver checks how the platform's storage holds it.
      const appName = AppName.orThrow(deviceSecretAppName);
      const first = await run.orThrow(deps.loadDeviceSecret(appName));
      const second = await run.orThrow(deps.loadDeviceSecret(appName));
      assertEqual(first.length, 32);
      assertEqual(second, first);
      // Each app name has its own.
      const other = await run.orThrow(
        deps.loadDeviceSecret(
          AppName.orThrow("native-tests-device-secret-other"),
        ),
      );
      assert(
        other.some((byte, index) => byte !== first[index]),
        "Two app names loaded one DeviceSecret.",
      );
    }));

  test("forgetDeviceSecret deletes the stored DeviceSecret, so the next load creates another", () =>
    withRun(async (run) => {
      const appName = AppName.orThrow("native-tests-device-secret-forget");
      const first = await run.orThrow(deps.loadDeviceSecret(appName));
      await run.orThrow(deps.forgetDeviceSecret(appName));
      const created = await run.orThrow(deps.loadDeviceSecret(appName));
      assertEqual(created.length, 32);
      assert(
        created.some((byte, index) => byte !== first[index]),
        "The load after forgetDeviceSecret returned the forgotten DeviceSecret.",
      );
    }));

  test("forgetDeviceSecret forgets only its app name's DeviceSecret", () =>
    withRun(async (run) => {
      const kept = AppName.orThrow(deviceKeptSecretAppName);
      const forgotten = AppName.orThrow(deviceForgottenSecretAppName);
      const keptSecret = await run.orThrow(deps.loadDeviceSecret(kept));
      await run.orThrow(deps.loadDeviceSecret(forgotten));
      await run.orThrow(deps.forgetDeviceSecret(forgotten));
      // The forgotten one isn't loaded again, so the driver finds no Keystore
      // key of its name.
      assertEqual(await run.orThrow(deps.loadDeviceSecret(kept)), keptSecret);
    }));

  test("two first loadDeviceSecret calls at once get the same DeviceSecret", () =>
    withRun(async (run) => {
      const appName = AppName.orThrow("native-tests-device-secret-concurrent");
      // Nothing is stored, so both calls are first loads, and the native
      // get-or-add stores only one.
      await run.orThrow(deps.forgetDeviceSecret(appName));
      const [first, second] = await Promise.all([
        run.orThrow(deps.loadDeviceSecret(appName)),
        run.orThrow(deps.loadDeviceSecret(appName)),
      ]);
      assertEqual(second, first);
      assertEqual(await run.orThrow(deps.loadDeviceSecret(appName)), first);
    }));

  test("createEvoluApp opens the first AppOwner it creates in a device database the platform's DeviceSecret encrypts", () =>
    withNewDeviceEvoluApp(
      deps,
      "native-tests-evolu-app-first",
      async ({ app, race }) => {
        const entries = app.appOwners.get();
        assertEqual(entries.length, 1);
        const current = app.current.get();
        assert(current, "No AppOwner is open.");
        assertEqual(current.appOwner.id, entries[0].id);
        await insertTodo(await race(current.evolu), "first", race);
      },
      // Read without its key, the device database is no SQLite database.
      async (deviceName) => {
        const opened = await withRun(async (run) => {
          await withDriver(run, deviceName, undefined, (driver) => {
            driver.exec(sql`select count(*) from sqlite_schema;`);
          });
        }).then(
          () => true,
          () => false,
        );
        assertEqual(opened, false);
      },
    ));

  test("createEvoluApp's add opens a new AppOwner, and one restored from its mnemonic", () =>
    withNewDeviceEvoluApp(
      deps,
      "native-tests-evolu-app-add",
      async ({ app, run, race }) => {
        const [first] = app.appOwners.get();
        const added = await race(app.add(createOwnerSecret(run.deps)));
        assert(added.ok, JSON.stringify(added));
        assertEqual(app.current.get()?.appOwner.id, added.value);
        const restored = await race(
          app.add(mnemonicToOwnerSecret(testAppOwner.mnemonic)),
        );
        assert(restored.ok, JSON.stringify(restored));
        assertEqual(restored.value, testAppOwner.id);
        const current = app.current.get();
        assertEqual(current?.appOwner.id, testAppOwner.id);
        assertEqual(
          app.appOwners
            .get()
            .map(({ id }) => id)
            .toSorted(),
          [first.id, added.value, testAppOwner.id].toSorted(),
        );
        assert(current, "No AppOwner is open.");
        await insertTodo(await race(current.evolu), "restored", race);
      },
    ));

  test("createEvoluApp's remove deletes an AppOwner's data from this device and removes it from the list", () =>
    withNewDeviceEvoluApp(
      deps,
      "native-tests-evolu-app-remove",
      async ({ app, run, race }) => {
        const current = app.current.get();
        assert(current, "No AppOwner is open.");
        const removedId = current.appOwner.id;
        const removedSecret = mnemonicToOwnerSecret(current.appOwner.mnemonic);
        await insertTodo(await race(current.evolu), "removed", race);
        const kept = await race(app.add(createOwnerSecret(run.deps)));
        assert(kept.ok, JSON.stringify(kept));

        const removed = await race(app.remove(removedId));
        assert(removed.ok, JSON.stringify(removed));
        assertEqual(
          app.appOwners.get().map(({ id }) => id),
          [kept.value],
        );
        // Added again, it opens an empty database: no relay has its data.
        const readded = await race(app.add(removedSecret));
        assert(readded.ok, JSON.stringify(readded));
        const reopened = app.current.get();
        assert(reopened?.appOwner.id === removedId, "The AppOwner isn't open.");
        assertEqual(await race(titlesOf(await race(reopened.evolu))), []);

        // Removing the open one leaves the app with none open.
        const removedOpen = await race(app.remove(removedId));
        assert(removedOpen.ok, JSON.stringify(removedOpen));
        assertEqual(app.current.get(), null);
      },
    ));

  if (platform === "android")
    test("loadDeviceSecret rejects a stored DeviceSecret it can't read as unreadable and keeps it, until forgetDeviceSecret starts over", () =>
      withRun((run) =>
        assertUnreadableUntilForgotten(
          run,
          deps,
          AppName.orThrow(deviceUnreadableSecretAppName),
          "the record the runner wrote",
        ),
      ));

  test("crypto.getRandomValues fills an array, which needs the polyfills on React Native", () => {
    const filled = crypto.getRandomValues(new Uint8Array(64));
    assert(
      filled.some((byte) => byte !== 0),
      "Expected random bytes.",
    );
  });

  test("Url follows the WHATWG URL Standard, which needs Expo's URL or the example's polyfill on React Native", () => {
    // Only the cases that differ, which a failure's message then names.
    const differences = urlCases.flatMap(([value, expected]) => {
      const url = UrlFromString.fromUnknown(value);
      const actual = url.ok ? url.value : null;
      return actual === expected ? [] : [{ value, expected, actual }];
    });
    assert(differences.length === 0, JSON.stringify(differences));
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
    const name = await withEvoluDeps(deps, async ({ run, race }) => {
      await using evolu = await race(
        run.ok(
          createEvolu(schema, {
            appName: AppName.orThrow(`native-tests-${String(Date.now())}`),
            appOwner: testAppOwner,
            // Unreachable, there only to make Evolu register the owner for
            // sync, which the transports' code runs.
            transports: [
              {
                type: "WebSocket",
                url: WebSocketUrl.orThrow("ws://127.0.0.1:9/"),
              },
            ],
          }),
        ),
      );
      const inserted = Promise.withResolvers<void>();
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("stored") },
        { onSuccess: inserted.resolve },
      );
      await race(inserted.promise);
      assertEqual(await race(evolu.loadQuery(titlesQuery)), [
        { title: "stored" },
      ]);
      return evolu.name;
    });
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

const evoluAppSchema = {
  todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
};

type DeviceEvoluApp = EvoluApp<typeof evoluAppSchema>;

/** Settles with a promise, or rejects once Evolu's workers fail. */
type RaceEvoluError = <T>(promise: Promise<T>) => Promise<T>;

/**
 * Runs `fn` with Evolu's deps of `createEvoluDeps` and a Run of them, and
 * disposes both. A failure in Evolu's workers sets evoluError and completes
 * nothing, so each step races it with `race`, which rejects once it's set.
 */
const withEvoluDeps = async <T>(
  deps: Pick<DeviceSuitesDeps, "createEvoluDeps">,
  fn: (context: {
    readonly run: DisposableRun<EvoluDeps>;
    readonly race: RaceEvoluError;
  }) => Promise<T>,
): Promise<T> => {
  const evoluDeps = deps.createEvoluDeps();
  // A failure rejects, so the Run reports no defect, which an app would show as
  // a crash.
  const run = createRun({ ...evoluDeps, reportDefect: () => undefined });
  let unsubscribe = (): void => undefined;
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
        new Error(`evoluError: ${text.ok ? text.value : String(error?.type)}`),
      );
    });
  });
  // Raced at every step, so a late failure rejects nothing unhandled.
  failed.catch(() => undefined);
  try {
    return await fn({
      run,
      race: (promise) => Promise.race([promise, failed]),
    });
  } finally {
    unsubscribe();
    await run[Symbol.asyncDispose]();
    evoluDeps[Symbol.dispose]();
  }
};

/**
 * Opens the EvoluApp `appName` with the DeviceSecret of the platform's secure
 * storage, as an app does, runs `fn` with it, disposes it, and returns its
 * device database's name.
 */
const withDeviceEvoluApp = (
  deps: DeviceEvoluAppDeps,
  appName: AppName,
  fn: (context: {
    readonly app: DeviceEvoluApp;
    readonly run: DisposableRun<EvoluDeps>;
    readonly race: RaceEvoluError;
  }) => Promise<void>,
): Promise<Name> =>
  withEvoluDeps(deps, async ({ run, race }) => {
    const secret = await race(run.orThrow(deps.loadDeviceSecret(appName)));
    await using app = await race(
      run.orThrow(
        createEvoluApp(evoluAppSchema, {
          appName,
          auth: { type: "DeviceSecret", secret },
          createFirstAppOwner: true,
          transports: [],
        }),
      ),
    );
    await fn({ app, run, race });
    return app.device.name;
  });

/**
 * Runs `fn` with the EvoluApp `appName` on a new DeviceSecret, so a new device
 * database, also after an earlier run that ended halfway, then `afterDispose`
 * with its device database's name. Then it removes what it created: the
 * AppOwners, the device database, and the DeviceSecret.
 */
const withNewDeviceEvoluApp = async (
  deps: DeviceEvoluAppDeps,
  name: string,
  fn: Parameters<typeof withDeviceEvoluApp>[2],
  afterDispose?: (deviceName: Name) => Promise<void>,
): Promise<void> => {
  const appName = AppName.orThrow(name);
  await forgetDeviceSecretOf(deps, appName);
  const deviceName = await withDeviceEvoluApp(
    deps,
    appName,
    async (context) => {
      await fn(context);
      await removeAppOwners(context.app, context.race);
    },
  );
  await afterDispose?.(deviceName);
  await deleteDeviceDatabase(deps, deviceName);
  await forgetDeviceSecretOf(deps, appName);
};

const forgetDeviceSecretOf = (
  deps: DeviceEvoluAppDeps,
  appName: AppName,
): Promise<void> =>
  withRun((run) => run.orThrow(deps.forgetDeviceSecret(appName)));

/** Removes every AppOwner of the app, which deletes their databases. */
const removeAppOwners = async (
  app: DeviceEvoluApp,
  race: RaceEvoluError,
): Promise<void> => {
  for (const { id } of app.appOwners.get()) {
    const removed = await race(app.remove(id));
    assert(removed.ok, JSON.stringify(removed));
  }
};

/** Deletes a disposed app's device database once its files are released. */
const deleteDeviceDatabase = async (
  { nativeSqlite, databaseDirectory }: DeviceEvoluAppDeps,
  deviceName: Name,
): Promise<void> => {
  await withRun((run) =>
    run.orThrow(
      createWaitForDatabaseRelease({ nativeSqlite, databaseDirectory })(
        deviceName,
      ),
    ),
  );
  nativeSqlite.deleteFile(`${databaseDirectory}/evolu1-${deviceName}.db`);
};

const titlesQuery = /*#__PURE__*/ createQueryBuilder(evoluAppSchema)((db) =>
  db.selectFrom("todo").select("title"),
);

const titlesOf = (
  evolu: AppOwnerEvolu<typeof evoluAppSchema>,
): Promise<ReadonlyArray<{ readonly title: string | null }>> =>
  evolu.loadQuery(titlesQuery);

/** Inserts a todo and checks that the AppOwner's database returns it. */
const insertTodo = async (
  evolu: AppOwnerEvolu<typeof evoluAppSchema>,
  title: string,
  race: RaceEvoluError,
): Promise<void> => {
  const inserted = Promise.withResolvers<void>();
  evolu.insert(
    "todo",
    { title: NonEmptyTrimmedString100.orThrow(title) },
    { onSuccess: inserted.resolve },
  );
  await race(inserted.promise);
  const titles = await race(titlesOf(evolu));
  assert(
    titles.some((row) => row.title === title),
    `The AppOwner's database returned ${JSON.stringify(titles)}.`,
  );
};
