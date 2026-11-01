// Declares React Native's ErrorUtils global as src/Task.ts reads it.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers -- Includes global declarations during type-checking without emitting a runtime import.
import type {} from "../../src/ErrorUtils.d.ts";

import {
  assert,
  assertEqual,
  assertInstanceOf,
  assertNonNullable,
  assertSame,
  constVoid,
  createRun,
  createUnknownError,
  id,
  NonEmptyTrimmedString100,
  ok,
  testStubGlobal,
  testWaitForWorkerMessage,
  UnknownError,
  type CreateSqliteDriver,
  type EvoluDeps,
  type EvoluError,
  type MessagePort,
  type NativeSqlite,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createOwnerWebSocketTransport,
  createQueryBuilder,
  kyselySql,
  testAppOwner,
  RelayUrl,
  type DeleteDatabaseFiles,
  type EvoluInput,
  type EvoluOutput,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import { tmpdir } from "node:os";
import { describe, it, mock } from "node:test";
import { createEvoluDeps } from "../../src/shared.ts";
import { createReactNativeSqliteDriver } from "../../src/sqlite/Driver.ts";

installPolyfills();

const binding = (await setupAddon()).createBinding() as NativeSqlite;

/** Creates a SQLite driver for memory databases of the N-API binding. */
const setupMemorySqliteDriver = (): CreateSqliteDriver => (name) =>
  createReactNativeSqliteDriver({
    nativeSqlite: binding,
    databaseDirectory: tmpdir(),
  })(name, { mode: "memory" });

// The tests delete no database, and their databases are in memory, so there
// are no files to delete.
const deleteNoDatabaseFiles: DeleteDatabaseFiles = () => () => ok();

/** Resolves with the deps' first EvoluError. */
const waitForEvoluError = (deps: EvoluDeps): Promise<EvoluError | null> =>
  new Promise((resolve) => {
    const unsubscribe = deps.evoluError.subscribe(() => {
      unsubscribe();
      resolve(deps.evoluError.get());
    });
  });

/** Resolves once the deps' worker has connected and published sync state. */
const waitForSyncState = (deps: EvoluDeps): Promise<void> =>
  new Promise((resolve) => {
    const unsubscribe = deps.syncState.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });

describe("createEvoluDeps", () => {
  it("connects deps created again to the running shared worker", async () => {
    const createDeps = () =>
      createEvoluDeps({
        reloadApp: constVoid,
        createSqliteDriver: () => {
          throw new Error("No database is opened.");
        },
        deleteDatabaseFiles: deleteNoDatabaseFiles,
      });

    const first = createDeps();
    await waitForSyncState(first);
    first[Symbol.dispose]();

    // A second in-process worker would wait for the build lock forever.
    using second = createDeps();
    await waitForSyncState(second);
  });

  it("starts another shared worker after the running one panics", async () => {
    const reported = Promise.withResolvers<unknown>();
    const reportError = mock.fn<NonNullable<typeof ErrorUtils>["reportError"]>(
      (error) => {
        reported.resolve(error);
      },
    );
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    const createDeps = () =>
      createEvoluDeps({
        reloadApp: constVoid,
        createSqliteDriver: setupMemorySqliteDriver(),
        deleteDatabaseFiles: deleteNoDatabaseFiles,
      });

    using first = createDeps();
    // Keeps the instance's input port to post what useOwner rejects.
    const evoluPorts: Array<MessagePort<EvoluInput, EvoluOutput>> = [];
    await using run = createRun({
      ...first,
      createMessageChannel: <Input, Output = never>() => {
        const channel = first.createMessageChannel<Input, Output>();
        evoluPorts.push(channel.port1 as never);
        return channel;
      },
    });
    await using _evolu = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("panic"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        },
      ),
    );
    // The same transport twice in one claim is a defect that panics the
    // worker's root Run. useOwner throws for it, so this posts it as a
    // defective tab would.
    const transport = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow("wss://panic.example/"),
      ownerId: testAppOwner.id,
    });
    const [evoluPort] = evoluPorts;
    assertNonNullable(evoluPort);
    evoluPort.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: { owner: testAppOwner, transports: [transport, transport] },
          action: "add",
        },
      ],
    });
    const defect = await reported.promise;
    assertInstanceOf(defect, Error);
    assertEqual(
      defect.message,
      "resourceKeys must not contain lookup duplicates.",
    );
    // Each tab also sets the panic's defect as its evoluError.
    await testWaitForWorkerMessage();
    assertEqual(first.evoluError.get(), createUnknownError(defect));

    // The failed worker drops later messages, as a closed web SharedWorker
    // does, so creating another instance on the same deps does not run on its
    // disposed Run.
    await using _other = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("afterPanic"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        },
      ),
    );
    await testWaitForWorkerMessage();

    // Deps connected to the failed worker would never get sync state.
    using second = createDeps();
    await waitForSyncState(second);

    // The worker's panic is still reported once.
    assertEqual(
      reportError.mock.calls.map((call) => call.arguments[0]),
      [defect],
    );
  });

  it("reports a database that fails to open as an UnknownError", async () => {
    const reportError =
      mock.fn<NonNullable<typeof ErrorUtils>["reportError"]>();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    const error = new Error("No SQLCipher.");
    using deps = createEvoluDeps({
      reloadApp: constVoid,
      createSqliteDriver: () => () => {
        throw error;
      },
      deleteDatabaseFiles: deleteNoDatabaseFiles,
    });
    const evoluError = waitForEvoluError(deps);
    await using run = createRun(deps);
    await using _evolu = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("failed"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        },
      ),
    );

    assertEqual(await evoluError, createUnknownError(error));
    // The worker's panic is still reported once.
    assertEqual(
      reportError.mock.calls.map((call) => call.arguments[0]),
      [error],
    );
  });

  it("gives the DbWorker waitForDatabaseRelease, which it waits with before it opens a persistent database", async () => {
    const events: Array<string> = [];
    const opened = Promise.withResolvers<void>();
    const createSqliteDriver = setupMemorySqliteDriver();
    using deps = createEvoluDeps({
      reloadApp: constVoid,
      createSqliteDriver: (name, options) => {
        events.push(`open ${name}`);
        opened.resolve();
        return createSqliteDriver(name, options);
      },
      waitForDatabaseRelease: (name) => () => {
        events.push(`wait ${name}`);
        return ok();
      },
      deleteDatabaseFiles: deleteNoDatabaseFiles,
    });
    await using run = createRun(deps);
    let tenantDisposed = Promise.resolve();
    {
      await using evolu = await run.ok(
        createEvolu(
          { todo: { id: id("Todo") } },
          {
            appName: AppName.orThrow("release"),
            appOwner: testAppOwner,
            transports: [],
          },
        ),
      );
      await opened.promise;

      assertEqual(events, [`wait ${evolu.name}`, `open ${evolu.name}`]);

      tenantDisposed = new Promise<void>((resolve) => {
        const unsubscribe = deps.syncState.subscribe(() => {
          if (deps.syncState.get()?.tenants.some((t) => t.name === evolu.name))
            return;
          unsubscribe();
          resolve();
        });
      });
    }
    await tenantDisposed;
  });

  it("rejects a query SQLite fails and keeps the database available", async () => {
    const reportError =
      mock.fn<NonNullable<typeof ErrorUtils>["reportError"]>();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    using deps = createEvoluDeps({
      reloadApp: constVoid,
      createSqliteDriver: setupMemorySqliteDriver(),
      deleteDatabaseFiles: deleteNoDatabaseFiles,
    });
    const schema = {
      todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
    };
    const createQuery = createQueryBuilder(schema);
    // A filter a user wrote, which SQLite fails to prepare.
    const brokenQuery = createQuery((db) =>
      db
        .selectFrom("todo")
        .select("id")
        .where(kyselySql<boolean>`title = 1 +`),
    );
    const titlesQuery = createQuery((db) =>
      db.selectFrom("todo").select("title"),
    );
    await using run = createRun(deps);
    let tenantDisposed = Promise.resolve();
    {
      await using evolu = await run.ok(
        createEvolu(schema, {
          appName: AppName.orThrow("query"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        }),
      );

      // A refused database would set evoluError instead.
      const outcome = await Promise.race([
        evolu.loadQuery(brokenQuery).then(
          () => ({ type: "Loaded" }) as const,
          (error: unknown) => ({ type: "Rejected", error }) as const,
        ),
        waitForEvoluError(deps).then(
          (error) => ({ type: "EvoluError", error }) as const,
        ),
      ]);

      assertSame(outcome.type, "Rejected");
      assert(
        UnknownError.is(outcome.error),
        "The load rejects with an UnknownError.",
      );
      const { message } = outcome.error.error as { readonly message: unknown };
      assertSame(message, "incomplete input");

      const inserted = Promise.withResolvers<void>();
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("stored") },
        { onComplete: inserted.resolve },
      );
      await inserted.promise;
      assertEqual(await evolu.loadQuery(titlesQuery), [{ title: "stored" }]);
      assertSame(deps.evoluError.get(), null);
      assertEqual(reportError.mock.calls, []);

      // The in-process SharedWorker disposes the database's tenant once it is
      // idle after its last instance. Until then, a later test's deps could
      // host the database's next worker.
      tenantDisposed = new Promise<void>((resolve) => {
        const unsubscribe = deps.syncState.subscribe(() => {
          if (deps.syncState.get()?.tenants.some((t) => t.name === evolu.name))
            return;
          unsubscribe();
          resolve();
        });
      });
    }
    await tenantDisposed;
  });
});
