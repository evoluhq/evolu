/**
 * `createEvoluDeps` end to end on the N-API mirror of the binding, with both
 * specs mocked, since Node.js can't load React Native: Evolu creates its
 * database in `EvoluApp`'s directory, stores and queries rows, and its workers
 * encrypt and decrypt changes with the binding.
 */
import {
  assertEqual,
  assertFalse,
  assertNonNullable,
  assertTrue,
  createRandomBytes,
  createRun,
  id,
  Name,
  NonEmptyTrimmedString100,
  ok,
  type NativeSqlite,
  WebSocketUrl,
} from "@evolu/common";
import {
  AppName,
  createAppOwner,
  createEvolu,
  createEvoluApp,
  createOwnerSecret,
  createQueryBuilder,
  testAppOwner,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
import { setupEvolu7 } from "../../../../test/integration/nodejs/local-first/_evolu7.ts";

installPolyfills();

const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-deps-"));
after(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** The binding's XChaCha20-Poly1305 calls, in order. */
const xChaChaCalls: Array<string> = [];
const nativeBinding = (await setupAddon()).createBinding() as NativeSqlite;
const binding: NativeSqlite = {
  ...nativeBinding,
  encryptXChaCha20Poly1305: (...args) => {
    xChaChaCalls.push("encryptXChaCha20Poly1305");
    return nativeBinding.encryptXChaCha20Poly1305(...args);
  },
  decryptXChaCha20Poly1305: (...args) => {
    xChaChaCalls.push("decryptXChaCha20Poly1305");
    return nativeBinding.decryptXChaCha20Poly1305(...args);
  },
};

mock.module(
  new URL("../../src/specs/NativeEvoluSqlite.ts", import.meta.url).href,
  { exports: { default: { createBinding: () => binding } } },
);
mock.module(
  new URL("../../src/specs/NativeEvoluApp.ts", import.meta.url).href,
  {
    exports: {
      default: {
        getDatabaseDirectory: () => directory,
        reloadApp: () => undefined,
      },
    },
  },
);

const { createEvoluDeps } = await import("../../src/createEvoluDeps.ts");
const { createReactNativeSqliteDriver } =
  await import("../../src/sqlite/Driver.ts");
const { createBenchRelay } = await import("../device/bench.ts");

test("Evolu stores and queries rows in an encrypted database in EvoluApp's directory", async () => {
  const schema = {
    todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
  };
  const titlesQuery = createQueryBuilder(schema)((db) =>
    db.selectFrom("todo").select("title"),
  );
  using deps = createEvoluDeps();
  await using run = createRun(deps);
  await using evolu = await run.ok(
    createEvolu(schema, {
      appName: AppName.orThrow("deps"),
      appOwner: testAppOwner,
      transports: [],
    }),
  );

  const inserted = Promise.withResolvers<void>();
  evolu.insert(
    "todo",
    { title: NonEmptyTrimmedString100.orThrow("stored") },
    { onSuccess: inserted.resolve },
  );
  await inserted.promise;

  assertEqual(await evolu.loadQuery(titlesQuery), [{ title: "stored" }]);
  const path = join(directory, `evolu1-${evolu.name}.db`);
  assertTrue(existsSync(path));
  // Evolu encrypts every database, so no SQLite header starts the file.
  assertFalse(
    readFileSync(path).toString("latin1", 0, 15) === "SQLite format 3",
  );
});

test("Evolu deletes its database's file from EvoluApp's directory", async () => {
  const schema = {
    todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
  };
  using deps = createEvoluDeps();
  await using run = createRun(deps);
  await using evolu = await run.ok(
    createEvolu(schema, {
      appName: AppName.orThrow("deleted"),
      appOwner: testAppOwner,
      transports: [],
    }),
  );
  const inserted = Promise.withResolvers<void>();
  evolu.insert(
    "todo",
    { title: NonEmptyTrimmedString100.orThrow("deleted") },
    { onSuccess: inserted.resolve },
  );
  await inserted.promise;
  const path = join(directory, `evolu1-${evolu.name}.db`);
  assertTrue(existsSync(path));

  // The DbWorker closes its connection first, or the binding would find the
  // file held.
  assertEqual(await evolu.deleteDatabase(), ok());

  assertFalse(existsSync(path));
  assertFalse(existsSync(`${path}-journal`));
});

test("createEvoluApp starts with the owner and the data of the Evolu 7 database in EvoluApp's directory, and deletes its file", async () => {
  const schema = {
    todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
  };
  const titlesQuery = createQueryBuilder(schema)((db) =>
    db.selectFrom("todo").select("title"),
  );
  const appName = AppName.orThrow("Evolu7ReactNative");
  // Evolu 7 kept its database with expo-sqlite, in the file the driver opens
  // for the app's name, without a key.
  const path = join(directory, `evolu1-${appName}.db`);
  await using evolu7Run = createRun({
    createSqliteDriver: createReactNativeSqliteDriver({
      nativeSqlite: binding,
      databaseDirectory: directory,
    }),
  });
  const evolu7 = await (async () => {
    using driver = await evolu7Run.ok(
      evolu7Run.deps.createSqliteDriver(Name.orThrow(appName)),
    );
    const evolu7 = await setupEvolu7(driver, { name: appName });
    evolu7.evolu.insert("todo", { title: "stored by Evolu 7" });
    await evolu7.settled();
    // The app closed, so nothing holds the file.
    return evolu7;
  })();
  assertTrue(
    readFileSync(path).toString("latin1", 0, 15) === "SQLite format 3",
  );

  using deps = createEvoluDeps();
  await using run = createRun(deps);
  await using app = await run.orThrow(
    createEvoluApp(schema, {
      appName,
      auth: { type: "InstantStart" },
      createFirstAppOwner: true,
      transports: [],
    }),
  );

  assertEqual(
    app.appOwners.get().map((appOwner) => appOwner.id),
    [evolu7.appOwner.id],
  );
  const current = app.current.get();
  assertNonNullable(current);
  assertEqual(current.appOwner.mnemonic, evolu7.appOwner.mnemonic);
  assertEqual(await (await current.evolu).loadQuery(titlesQuery), [
    { title: "stored by Evolu 7" },
  ]);
  assertFalse(existsSync(path));
  assertFalse(existsSync(`${path}-journal`));
});

test("Evolu's DbWorker and SharedWorker encrypt and decrypt changes with the binding", async () => {
  const schema = {
    todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
  };
  const countQuery = createQueryBuilder(schema)((db) =>
    db.selectFrom("todo").select((eb) => eb.fn.countAll<number>().as("count")),
  );
  const owner = createAppOwner(
    createOwnerSecret({ randomBytes: createRandomBytes() }),
  );
  await using relayRun = createRun({
    createSqliteDriver: createReactNativeSqliteDriver({
      nativeSqlite: binding,
      databaseDirectory: directory,
    }),
  });
  await using relay = await relayRun.ok(createBenchRelay());
  xChaChaCalls.length = 0;

  const startEvolu = async (name: string) => {
    const deps = createEvoluDeps();
    const run = createRun(deps);
    const url = WebSocketUrl.orThrow(`ws://xchacha.invalid/${name}`);
    const evolu = await run.ok(
      createEvolu(schema, {
        appName: AppName.orThrow(name),
        appOwner: owner,
        transports: [{ type: "WebSocket", url }],
      }),
    );
    return {
      evolu,
      url,
      [Symbol.asyncDispose]: async () => {
        await evolu[Symbol.asyncDispose]();
        await run[Symbol.asyncDispose]();
        deps[Symbol.dispose]();
      },
    };
  };

  {
    await using writer = await startEvolu("xchachaWriter");
    const insert = async (title: string) => {
      const inserted = Promise.withResolvers<void>();
      writer.evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow(title) },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;
    };
    await insert("stored before the relay connects");
    assertEqual(xChaChaCalls, []);

    // The DbWorker encrypts the change the relay lacks.
    await relay.waitForSocket(writer.url);
    relay.open(writer.url);
    await relay.waitForMessages(owner.id, 1);
    assertEqual(xChaChaCalls, ["encryptXChaCha20Poly1305"]);

    // The SharedWorker encrypts a write's upload.
    await insert("uploaded once written");
    await relay.waitForMessages(owner.id, 2);
    assertEqual(xChaChaCalls, [
      "encryptXChaCha20Poly1305",
      "encryptXChaCha20Poly1305",
    ]);
  }

  // The DbWorker of another database decrypts what it receives.
  {
    await using reader = await startEvolu("xchachaReader");
    const received = Promise.withResolvers<void>();
    const unsubscribe = reader.evolu.subscribeQuery(countQuery)(() => {
      if (reader.evolu.getQueryRows(countQuery)[0]?.count === 2)
        received.resolve();
    });
    assertEqual(await reader.evolu.loadQuery(countQuery), [{ count: 0 }]);
    await relay.waitForSocket(reader.url);
    relay.open(reader.url);
    await received.promise;
    unsubscribe();
    assertEqual(xChaChaCalls, [
      "encryptXChaCha20Poly1305",
      "encryptXChaCha20Poly1305",
      "decryptXChaCha20Poly1305",
      "decryptXChaCha20Poly1305",
    ]);
  }
});
