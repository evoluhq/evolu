/**
 * `createEvoluDeps` end to end on the N-API mirror of the binding, with both
 * specs mocked, since Node.js can't load React Native: Evolu creates its
 * database in `EvoluApp`'s directory, stores and queries rows, and its workers
 * encrypt and decrypt changes with the binding.
 */
// Declares React Native's ErrorUtils global as src/Task.ts reads it, before
// React Native's own types, which the specs bring, declare it as a const.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers -- Includes global declarations during type-checking without emitting a runtime import.
import type {} from "../../src/ErrorUtils.d.ts";

import {
  assertEqual,
  assertFalse,
  assertTrue,
  createRandomBytes,
  createRun,
  id,
  NonEmptyTrimmedString100,
} from "@evolu/common";
import {
  AppName,
  createAppOwner,
  createEvolu,
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
import type { NativeSqlite } from "../../src/sqlite/Binding.ts";

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
const { createNativeSqliteDriver } = await import("../../src/sqlite/Driver.ts");
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
    { onComplete: inserted.resolve },
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
    createSqliteDriver: createNativeSqliteDriver({
      nativeSqlite: binding,
      databaseDirectory: directory,
    }),
  });
  await using relay = await relayRun.ok(createBenchRelay());
  xChaChaCalls.length = 0;

  const startEvolu = async (name: string) => {
    const deps = createEvoluDeps();
    const run = createRun(deps);
    const url = `ws://xchacha.invalid/${name}`;
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
        { onComplete: inserted.resolve },
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
