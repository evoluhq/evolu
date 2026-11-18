import {
  assertEqual,
  assertNonNullable,
  assertSame,
  constVoid,
  createConsole,
  createQueryBuilder,
  createUnknownError,
  err,
  id,
  Name,
  NonEmptyTrimmedString100,
  nullOr,
  ok,
  SqliteBoolean,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createEvoluApp,
  testAppOwner,
  type EvoluDeps,
} from "@evolu/common/local-first";
import { onTestFinished, test } from "vitest";
import { createEvoluDeps } from "../../../../packages/web/src/local-first/Evolu.ts";
import { setupEvolu7Tab } from "./_evolu7.ts";
import { removeTestDatabase } from "./_removeTestDatabase.ts";
import {
  panicSharedWorker,
  setupRunWithEvoluPorts,
  waitForSharedWorkerClose,
} from "./_panicSharedWorker.ts";

const schema = {
  todo: {
    id: id("Todo"),
    title: NonEmptyTrimmedString100,
    isCompleted: nullOr(SqliteBoolean),
  },
};

const todosQuery = createQueryBuilder(schema)((db) =>
  db
    .selectFrom("todo")
    .select(["title", "isCompleted", "isDeleted"])
    .orderBy("title"),
);

/**
 * An app of its own name, which Evolu 7 names its database after, with the web
 * deps, which start the production shared worker and the production DbWorkers.
 * It removes the app's databases after the test: Evolu 7's has the app's name
 * and Evolu 8's start with it, also the device database of a refused start,
 * which the test can't name.
 */
const setupApp = (disposer: AsyncDisposableStack) => {
  const appName = AppName.orThrow(`test-${crypto.randomUUID()}`);
  const evolu7Name = Name.orThrow(appName);
  onTestFinished(async () => {
    const root = await navigator.storage.getDirectory();
    const names: Array<Name> = [];
    for await (const entry of root.values())
      if (entry.name.startsWith(`.${appName}`))
        names.push(Name.orThrow(entry.name.slice(1)));
    for (const name of names) await removeTestDatabase(name);
  });
  const deps = disposer.use(
    createEvoluDeps({
      console: createConsole({ level: "silent" }),
      reloadApp: constVoid,
      requestPersistentStorage: constVoid,
    }),
  );
  const { run, evoluPorts } = setupRunWithEvoluPorts(deps);
  disposer.use(run);
  return {
    appName,
    evolu7Name,
    deps,
    run,
    startApp: (options?: { readonly startAppOwnerId: null }) =>
      run(
        createEvoluApp(schema, {
          appName,
          auth: { type: "InstantStart" },
          createFirstAppOwner: true,
          transports: [],
          ...options,
        }),
      ),
    /** Releases the build lock for the tests that run after this one. */
    closeWorker: async (): Promise<void> => {
      const [evoluPort] = evoluPorts;
      assertNonNullable(evoluPort);
      await panicSharedWorker({ deps, evoluPort });
      await waitForSharedWorkerClose(run);
    },
  };
};

const hasDatabase = async (name: Name): Promise<boolean> => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(`.${name}`).then(
    () => true,
    (error: unknown) => {
      if (error instanceof DOMException && error.name === "NotFoundError")
        return false;
      throw error;
    },
  );
};

test("createEvoluApp starts with the owner and the data of the app's Evolu 7 database, and deletes that database", async () => {
  await using disposer = new AsyncDisposableStack();
  const setup = setupApp(disposer);

  const evolu7 = await setupEvolu7Tab(setup.appName);
  // Closes it also after a failure, before the test's databases are removed.
  onTestFinished(evolu7.close);
  const updated = evolu7.evolu.insert("todo", { title: "updated" });
  const deleted = evolu7.evolu.insert("todo", { title: "deleted" });
  assertNonNullable(updated.ok ? updated.value : null);
  assertNonNullable(deleted.ok ? deleted.value : null);
  evolu7.evolu.insert("todo", { title: "completed", isCompleted: 1 });
  await evolu7.settled();
  if (updated.ok)
    evolu7.evolu.update("todo", { id: updated.value.id, isCompleted: 0 });
  if (deleted.ok)
    evolu7.evolu.update("todo", { id: deleted.value.id, isDeleted: 1 });
  await evolu7.settled();
  assertSame(await hasDatabase(setup.evolu7Name), true);
  // The user closes the tab of the Evolu 7 build and opens the Evolu 8 one.
  await evolu7.close();

  const started = await setup.startApp();
  assertNonNullable(started.ok ? started.value : null);
  if (!started.ok) return;
  const app = disposer.use(started.value);

  assertEqual(
    app.appOwners.get().map((appOwner) => appOwner.id),
    [evolu7.appOwner.id],
  );
  const current = app.current.get();
  assertNonNullable(current);
  assertSame(current.appOwner.mnemonic, evolu7.appOwner.mnemonic);
  const evolu = await current.evolu;

  assertEqual(await evolu.loadQuery(todosQuery), [
    { title: "completed", isCompleted: 1, isDeleted: null },
    { title: "deleted", isCompleted: null, isDeleted: 1 },
    { title: "updated", isCompleted: 0, isDeleted: null },
  ]);
  assertSame(await hasDatabase(setup.evolu7Name), false);

  await setup.closeWorker();
});

test("removing the Evolu 7 owner before it opened deletes the Evolu 7 database too", async () => {
  await using disposer = new AsyncDisposableStack();
  const setup = setupApp(disposer);

  const evolu7 = await setupEvolu7Tab(setup.appName);
  // Closes it also after a failure, before the test's databases are removed.
  onTestFinished(evolu7.close);
  evolu7.evolu.insert("todo", { title: "unsynced" });
  await evolu7.settled();
  await evolu7.close();

  const started = await setup.startApp({ startAppOwnerId: null });
  assertNonNullable(started.ok ? started.value : null);
  if (!started.ok) return;
  const app = disposer.use(started.value);
  const [appOwner] = app.appOwners.get();
  assertNonNullable(appOwner);
  assertSame(appOwner.id as string, evolu7.appOwner.id);

  // The DbWorker closes the Evolu 7 database before it deletes its files,
  // which OPFS keeps while a connection holds them.
  assertEqual(await app.remove(appOwner.id), ok());
  assertSame(await hasDatabase(setup.evolu7Name), false);

  const other = setupOtherApp(disposer, setup.deps);
  await other.closeWorker();
});

test("createEvoluApp of an app without an Evolu 7 database creates no database of the app's name", async () => {
  await using disposer = new AsyncDisposableStack();
  const setup = setupApp(disposer);

  const started = await setup.startApp();
  assertNonNullable(started.ok ? started.value : null);
  if (!started.ok) return;
  const app = disposer.use(started.value);
  const current = app.current.get();
  assertNonNullable(current);

  assertEqual(await (await current.evolu).loadQuery(todosQuery), []);
  assertSame(await hasDatabase(setup.evolu7Name), false);

  await setup.closeWorker();
});

test(
  "createEvoluApp fails with DatabaseHeldError while a tab runs Evolu 7, and leaves its database as it is",
  // The start waits databaseHeldTimeout, 10 seconds, for the tab.
  { timeout: 30_000 },
  async () => {
    await using disposer = new AsyncDisposableStack();
    const setup = setupApp(disposer);

    const evolu7 = await setupEvolu7Tab(setup.appName);
    onTestFinished(evolu7.close);
    evolu7.evolu.insert("todo", { title: "before" });
    await evolu7.settled();

    assertEqual(
      await setup.startApp(),
      err(
        createUnknownError({
          type: "DatabaseHeldError",
          name: setup.evolu7Name,
        }),
      ),
    );

    // The tab still works.
    evolu7.evolu.insert("todo", { title: "after" });
    assertEqual(
      await evolu7.evolu.loadQuery(
        evolu7.evolu.createQuery((db) =>
          db.selectFrom("todo").select("title").orderBy("title"),
        ),
      ),
      [{ title: "after" }, { title: "before" }],
    );

    // A refused database ignores its instances, so another app panics the
    // worker to release the build lock for the tests that run after this one.
    const other = setupOtherApp(disposer, setup.deps);
    await other.closeWorker();
  },
);

/** An app that brings its AppOwner, on deps another app already uses. */
const setupOtherApp = (disposer: AsyncDisposableStack, deps: EvoluDeps) => {
  const { run, evoluPorts } = setupRunWithEvoluPorts(deps);
  disposer.use(run);
  return {
    closeWorker: async (): Promise<void> => {
      const evolu = disposer.use(
        await run.ok(
          createEvolu(schema, {
            appName: AppName.orThrow(`test-${crypto.randomUUID()}`),
            appOwner: testAppOwner,
            transports: [],
          }),
        ),
      );
      onTestFinished(() => removeTestDatabase(evolu.name));
      assertEqual(await evolu.loadQuery(todosQuery), []);
      const [evoluPort] = evoluPorts;
      assertNonNullable(evoluPort);
      await panicSharedWorker({ deps, evoluPort });
      await waitForSharedWorkerClose(run);
    },
  };
};
