import {
  assertEqual,
  assertNonNullable,
  constVoid,
  createConsole,
  createQueryBuilder,
  createUnknownError,
  id,
  testStubGlobal,
  type EvoluError,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  testAppOwner,
  type EvoluDeps,
} from "@evolu/common/local-first";
import { test } from "vitest";
import { createEvoluDeps } from "../../../../packages/web/src/local-first/Evolu.ts";
import {
  panicSharedWorker,
  setupRunWithEvoluPorts,
  waitForSharedWorkerClose,
} from "./_panicSharedWorker.ts";

const schema = { todo: { id: id("Todo") } };

const todosQuery = createQueryBuilder(schema)((db) =>
  db.selectFrom("todo").selectAll(),
);

/**
 * Creates the web deps, which start the production shared worker and the
 * production DbWorkers.
 */
const setupDeps = (disposer: AsyncDisposableStack): EvoluDeps =>
  disposer.use(
    createEvoluDeps({
      console: createConsole({ level: "silent" }),
      reloadApp: constVoid,
      requestPersistentStorage: constVoid,
    }),
  );

/** Opens an app of its own name with the deps. */
const setupApp = async (disposer: AsyncDisposableStack, deps: EvoluDeps) => {
  const { run, evoluPorts } = setupRunWithEvoluPorts(deps);
  disposer.use(run);
  const evolu = disposer.use(
    await run.ok(
      createEvolu(schema, {
        appName: AppName.orThrow(`test-${crypto.randomUUID()}`),
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

test("a tab starts its database's DbWorker once the worker's script loads", async () => {
  await using disposer = new AsyncDisposableStack();
  const app = await setupApp(disposer, setupDeps(disposer));

  assertEqual(await app.evolu.loadQuery(todosQuery), []);

  // Releases the build lock for the tests that run after this one.
  await panicSharedWorker(app);
  await waitForSharedWorkerClose(app.run);
});

test("a tab finds the persistent storage the browser offers", async () => {
  await using disposer = new AsyncDisposableStack();
  const app = await setupApp(disposer, setupDeps(disposer));

  // The tab, not its workers, decides whether a database is stored.
  assertEqual(await app.deps.getDevicePersistence(), "Unknown");

  // Releases the build lock for the tests that run after this one.
  await panicSharedWorker(app);
  await waitForSharedWorkerClose(app.run);
});

test("a tab refuses its database when the DbWorker's script fails to load", async () => {
  await using disposer = new AsyncDisposableStack();
  const deps = setupDeps(disposer);
  const evoluError = new Promise<EvoluError | null>((resolve) => {
    const unsubscribe = deps.evoluError.subscribe(() => {
      unsubscribe();
      resolve(deps.evoluError.get());
    });
  });

  {
    // The DbWorker loads a script the server does not have, as after a
    // deployment that removed it while the tab ran the previous build.
    using _worker = testStubGlobal(
      "Worker",
      class extends Worker {
        constructor(_scriptURL: string | URL, options?: WorkerOptions) {
          super(new URL("./missing-db-worker.js", import.meta.url), options);
        }
      },
    );
    await setupApp(disposer, deps);

    assertEqual(
      await evoluError,
      createUnknownError({ message: "The DbWorker failed to load." }),
    );
  }

  // A refused database ignores its instances, so another app panics the
  // worker to release the build lock for the tests that run after this one.
  const otherApp = await setupApp(disposer, deps);
  assertEqual(await otherApp.evolu.loadQuery(todosQuery), []);
  await panicSharedWorker(otherApp);
  await waitForSharedWorkerClose(otherApp.run);
});
