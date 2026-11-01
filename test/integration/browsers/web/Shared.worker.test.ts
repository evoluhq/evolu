import {
  assertEqual,
  assertNonNullable,
  constVoid,
  createConsole,
  createQueryBuilder,
  id,
  sleep,
  type EvoluError,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  testAppOwner,
  type CreateDbWorker,
  type DbWorker,
  type DbWorkerInit,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "@evolu/common/local-first";
import { test } from "vitest";
import {
  panicSharedWorker,
  setupRunWithEvoluPorts,
  waitForSharedWorkerClose,
} from "./_panicSharedWorker.ts";
import {
  createBroadcastChannel,
  createMessageChannel,
  createSharedWorker,
  createWorker,
} from "../../../../packages/web/src/Worker.ts";

const schema = { todo: { id: id("Todo") } };

const todosQuery = createQueryBuilder(schema)((db) =>
  db.selectFrom("todo").selectAll(),
);

const createProductionDbWorker: CreateDbWorker = () =>
  createWorker<DbWorkerInit, never>(
    new Worker(
      new URL(
        "../../../../packages/web/src/local-first/Db.worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    ),
  );

const createProductionSharedWorker = (name: string): SharedWorker =>
  new SharedWorker(
    new URL(
      "../../../../packages/web/src/local-first/Shared.worker.ts",
      import.meta.url,
    ),
    { name, type: "module" },
  );

/**
 * Starts the production shared worker the way
 * `installOneTabSharedWorkerPolyfill` does in a browser without SharedWorker.
 */
const createOneTabProductionSharedWorker = (name: string): SharedWorker => {
  const worker = new Worker(
    new URL(
      "../../../../packages/web/src/local-first/Shared.worker.ts",
      import.meta.url,
    ),
    { name, type: "module" },
  );
  // A panic also reaches the page as the dedicated worker's error, which would
  // fail the test run.
  worker.addEventListener("error", (event) => {
    event.preventDefault();
  });
  return { port: worker } as unknown as SharedWorker;
};

/** Opens an app in a tab connected to the production shared worker. */
const setupTab = async (
  disposer: AsyncDisposableStack,
  workerName: string,
  appName: AppName,
  createDbWorker: CreateDbWorker = createProductionDbWorker,
  createNativeSharedWorker: (
    name: string,
  ) => SharedWorker = createProductionSharedWorker,
) => {
  const deps = disposer.use(
    createEvoluDeps({
      console: createConsole({ level: "silent" }),
      createBroadcastChannel,
      createMessageChannel,
      getDevicePersistence: () => Promise.resolve("Unknown"),
      createDbWorker,
      lockManager: navigator.locks,
      reloadApp: constVoid,
      sharedWorker: createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
        createNativeSharedWorker(workerName),
      ),
    }),
  );
  const { run, evoluPorts } = setupRunWithEvoluPorts(deps);
  disposer.use(run);
  const evolu = disposer.use(
    await run.ok(
      createEvolu(schema, {
        appName,
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      }),
    ),
  );
  const [evoluPort] = evoluPorts;
  assertNonNullable(evoluPort);
  return { deps, run, evolu, evoluPort };
};

test("a panic of the production shared worker reaches evoluError", async () => {
  await using disposer = new AsyncDisposableStack();
  const tab = await setupTab(
    disposer,
    `panic-${crypto.randomUUID()}`,
    AppName.orThrow(`test-${crypto.randomUUID()}`),
  );

  await panicSharedWorker(tab);
  await waitForSharedWorkerClose(tab.run);
});

test("a tab opened after a panic of the production shared worker starts a new worker", async () => {
  await using disposer = new AsyncDisposableStack();
  const workerName = `panic-${crypto.randomUUID()}`;
  const appName = AppName.orThrow(`test-${crypto.randomUUID()}`);
  const failedTab = await setupTab(disposer, workerName, appName);
  await panicSharedWorker(failedTab);
  await waitForSharedWorkerClose(failedTab.run);

  const reopenedTab = await setupTab(disposer, workerName, appName);

  // A tab connected to the failed worker would never get its rows.
  assertEqual(await reopenedTab.evolu.loadQuery(todosQuery), []);

  // Releases the build lock for the tests that run after this one.
  await panicSharedWorker(reopenedTab);
  await waitForSharedWorkerClose(reopenedTab.run);
});

test("a DbWorker requested before a panic of the production shared worker stops", async () => {
  await using disposer = new AsyncDisposableStack();
  const workerName = `panic-${crypto.randomUUID()}`;
  const appName = AppName.orThrow(`test-${crypto.randomUUID()}`);
  const firstTabDisposer = disposer.use(new AsyncDisposableStack());
  await setupTab(firstTabDisposer, workerName, appName);

  // The second tab holds the DbWorkerInit of its DbWorker until the test posts
  // it, so the DbWorker's port stays in transit meanwhile.
  const replacement = Promise.withResolvers<{
    readonly dbWorker: DbWorker;
    readonly init: DbWorkerInit;
  }>();
  const secondTab = await setupTab(disposer, workerName, appName, () => {
    const dbWorker = createProductionDbWorker();
    return {
      ...dbWorker,
      postMessage: (init) => {
        replacement.resolve({ dbWorker, init });
      },
    };
  });
  // The worker serves the second tab, so its database outlives the first tab.
  assertEqual(await secondTab.evolu.loadQuery(todosQuery), []);

  // Closing the first tab makes the second one the tab leader, so the worker
  // requests a replacement DbWorker from it.
  await firstTabDisposer.disposeAsync();
  const { dbWorker, init } = await replacement.promise;

  // The worker panics and closes while the replacement's port is in transit.
  // Firefox drops a message posted to such a port once its sender closes.
  await panicSharedWorker(secondTab);
  await waitForSharedWorkerClose(secondTab.run);
  dbWorker.postMessage(init, [init.port]);

  const reopenedTab = await setupTab(disposer, workerName, appName);

  // A replacement that missed Dispose would hold the database lock until its
  // tab closes, so the reopened tab would never get its rows.
  const rows = await Promise.race([
    reopenedTab.evolu.loadQuery(todosQuery),
    reopenedTab.run(sleep("5s")).then(() => null),
  ]);

  // Closing the second tab would end such a replacement. Ending it here lets
  // the panic below release the build lock even when this test fails.
  dbWorker[Symbol.dispose]();
  await panicSharedWorker(reopenedTab);
  await waitForSharedWorkerClose(reopenedTab.run);

  assertEqual(rows, []);
});

for (const [sharedWorkerKind, createNativeSharedWorker] of [
  ["production shared worker", createProductionSharedWorker],
  [
    "one-tab polyfill of the production shared worker",
    createOneTabProductionSharedWorker,
  ],
] as const) {
  test(`a ${sharedWorkerKind} drops messages that arrive after its panic`, async () => {
    await using disposer = new AsyncDisposableStack();
    // The tab holds the DbWorkerInit of the database it opens second, so that
    // database stays starting, and the failed worker's cleanup waits for it.
    let holdDbWorkerInit = false;
    const starting = Promise.withResolvers<{
      readonly dbWorker: DbWorker;
      readonly init: DbWorkerInit;
    }>();
    const tab = await setupTab(
      disposer,
      `panic-${crypto.randomUUID()}`,
      AppName.orThrow(`test-${crypto.randomUUID()}`),
      () => {
        const dbWorker = createProductionDbWorker();
        if (!holdDbWorkerInit) return dbWorker;
        return {
          ...dbWorker,
          postMessage: (init) => {
            starting.resolve({ dbWorker, init });
          },
        };
      },
      createNativeSharedWorker,
    );
    const openApp = async () => {
      disposer.use(
        await tab.run.ok(
          createEvolu(schema, {
            appName: AppName.orThrow(`test-${crypto.randomUUID()}`),
            appOwner: testAppOwner,
            transports: [],
            memoryOnly: true,
          }),
        ),
      );
    };
    // The first database has its DbWorker once it answers a query.
    assertEqual(await tab.evolu.loadQuery(todosQuery), []);
    holdDbWorkerInit = true;
    await openApp();
    const { dbWorker, init } = await starting.promise;

    await panicSharedWorker(tab);

    // A worker that handled this app's message on its disposed Run would throw,
    // and the tab would set that error as its evoluError.
    const laterErrors: Array<EvoluError | null> = [];
    const laterError = Promise.withResolvers<void>();
    tab.deps.evoluError.subscribe(() => {
      laterErrors.push(tab.deps.evoluError.get());
      laterError.resolve();
    });
    await openApp();
    await Promise.race([laterError.promise, waitForSharedWorkerClose(tab.run)]);

    // Lets a worker that kept running end its cleanup, so it releases the build
    // lock even when this test fails.
    dbWorker.postMessage(init, [init.port]);
    await waitForSharedWorkerClose(tab.run);
    dbWorker[Symbol.dispose]();

    assertEqual(laterErrors, []);
  });
}
