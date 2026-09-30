import {
  assertEqual,
  constVoid,
  createConsole,
  createQueryBuilder,
  createRun,
  id,
  isPlainObject,
  sleep,
  UnknownError,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  createOwnerWebSocketTransport,
  testAppOwner,
  type CreateDbWorker,
  type DbWorker,
  type DbWorkerInit,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "@evolu/common/local-first";
import { test } from "vitest";
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

/** Opens an app in a tab connected to the production shared worker. */
const setupTab = async (
  disposer: AsyncDisposableStack,
  workerName: string,
  appName: AppName,
  createDbWorker: CreateDbWorker = createProductionDbWorker,
) => {
  const deps = disposer.use(
    createEvoluDeps({
      console: createConsole({ level: "silent" }),
      createBroadcastChannel,
      createMessageChannel,
      createDbWorker,
      lockManager: navigator.locks,
      reloadApp: constVoid,
      sharedWorker: createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
        new SharedWorker(
          new URL(
            "../../../../packages/web/src/local-first/Shared.worker.ts",
            import.meta.url,
          ),
          { name: workerName, type: "module" },
        ),
      ),
    }),
  );
  const run = disposer.use(createRun(deps));
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
  return { deps, run, evolu };
};

/**
 * Panics the tab's shared worker, waits until the panic's error reaches the
 * tab's evoluError, and waits until the worker closes.
 */
const panicSharedWorker = async ({
  deps,
  evolu,
  run,
}: Awaited<ReturnType<typeof setupTab>>): Promise<void> => {
  // The test waits for the panic's error rather than reading the latest one,
  // so an error reported later cannot hide it.
  const panicReported = Promise.withResolvers<void>();
  deps.evoluError.subscribe(() => {
    const error = deps.evoluError.get();
    if (
      UnknownError.is(error) &&
      isPlainObject(error.error) &&
      typeof error.error.message === "string" &&
      error.error.message.startsWith("SyntaxError")
    )
      panicReported.resolve();
  });

  // The WebSocket constructor throws a SyntaxError for a URL with a fragment,
  // which panics the worker's root Run. The panic also releases the build lock
  // that the production worker otherwise holds, which would block later tests.
  // If that throw stops panicking, these tests need another panic.
  evolu.useOwner(testAppOwner, [
    createOwnerWebSocketTransport({
      url: "wss://panic.example/#",
      ownerId: testAppOwner.id,
    }),
  ]);

  await panicReported.promise;

  // The failed worker releases the build lock right before it closes.
  while (
    (await navigator.locks.query()).held?.some(
      ({ name }) => name === "evolu-leaderlock-tab",
    )
  )
    await run.ok(sleep("10ms"));
  await run.ok(sleep("100ms"));
};

test("a panic of the production shared worker reaches evoluError", async () => {
  await using disposer = new AsyncDisposableStack();
  const tab = await setupTab(
    disposer,
    `panic-${crypto.randomUUID()}`,
    AppName.orThrow(`test-${crypto.randomUUID()}`),
  );

  await panicSharedWorker(tab);
});

test("a tab opened after a panic of the production shared worker starts a new worker", async () => {
  await using disposer = new AsyncDisposableStack();
  const workerName = `panic-${crypto.randomUUID()}`;
  const appName = AppName.orThrow(`test-${crypto.randomUUID()}`);
  const failedTab = await setupTab(disposer, workerName, appName);
  await panicSharedWorker(failedTab);

  const reopenedTab = await setupTab(disposer, workerName, appName);

  // A tab connected to the failed worker would never get its rows.
  assertEqual(await reopenedTab.evolu.loadQuery(todosQuery), []);

  // Releases the build lock for the tests that run after this one.
  await panicSharedWorker(reopenedTab);
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

  assertEqual(rows, []);
});
