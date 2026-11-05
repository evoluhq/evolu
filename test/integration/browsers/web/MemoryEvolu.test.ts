import {
  assertEqual,
  assertNonNullable,
  assertSame,
  constVoid,
  createConsole,
  createQueryBuilder,
  createRun,
  id,
  testStubGlobal,
} from "@evolu/common";
import {
  AppName,
  consoleEntryOrErrorBroadcastChannelName,
  type ConsoleEntryOrError,
  createEvolu,
  testAppOwner,
  type EvoluDeps,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "@evolu/common/local-first";
import { test } from "vitest";
import { createWorker } from "../../../../packages/web/src/Worker.ts";
import { createEvoluDeps } from "../../../../packages/web/src/local-first/Evolu.ts";
import { removeTestDatabase } from "./_removeTestDatabase.ts";
import {
  panicSharedWorker,
  setupRunWithEvoluPorts,
  waitForSharedWorkerClose,
} from "./_panicSharedWorker.ts";

const schema = { todo: { id: id("Todo") } };
const todosQuery = createQueryBuilder(schema)((db) =>
  db.selectFrom("todo").select("id"),
);

const setupDeps = (
  disposer: AsyncDisposableStack,
  { storageRefused = true } = {},
): EvoluDeps => {
  // Only the initial probe is replaced. Restoring navigator immediately also
  // proves these deps keep that result when their instances start later.
  using _navigator = storageRefused
    ? testStubGlobal("navigator", {
        locks: navigator.locks,
        storage: {
          getDirectory: () =>
            Promise.reject(
              new DOMException("Storage unavailable", "SecurityError"),
            ),
        },
      })
    : null;
  return disposer.use(
    createEvoluDeps({
      console: createConsole({ level: "silent" }),
      reloadApp: constVoid,
      requestPersistentStorage: constVoid,
    }),
  );
};

const setupMemoryApp = async (
  disposer: AsyncDisposableStack,
  deps: EvoluDeps,
  appName: AppName,
) => {
  const run = disposer.use(createRun(deps));
  return disposer.use(
    await run.ok(
      createEvolu(schema, {
        appName,
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      }),
    ),
  );
};

test("each memory instance starts its own worker and keeps its database when another tab ends", async () => {
  await using disposer = new AsyncDisposableStack();
  const workerUrls: Array<string> = [];
  using _worker = testStubGlobal(
    "Worker",
    class extends Worker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        workerUrls.push(String(scriptURL));
      }
    },
  );
  const firstTab = disposer.use(new AsyncDisposableStack());
  const firstDeps = setupDeps(firstTab);
  const secondDeps = setupDeps(disposer);
  assertSame(await firstDeps.getDevicePersistence(), "NotPersisted");
  assertSame(await secondDeps.getDevicePersistence(), "NotPersisted");
  const appName = AppName.orThrow(`test-${crypto.randomUUID()}`);
  const first = await setupMemoryApp(firstTab, firstDeps, appName);
  const second = await setupMemoryApp(disposer, secondDeps, appName);

  assertSame(
    workerUrls.filter((url) => url.includes("Shared.worker")).length,
    2,
  );
  const firstTodo = first.insert("todo", {});
  const secondTodo = second.insert("todo", {});
  assertEqual(await first.loadQuery(todosQuery), [{ id: firstTodo.id }]);
  assertEqual(await second.loadQuery(todosQuery), [{ id: secondTodo.id }]);

  await firstTab.disposeAsync();

  assertEqual(await second.loadQuery(todosQuery), [{ id: secondTodo.id }]);
  const laterTodo = second.insert("todo", {});
  assertEqual(
    (await second.loadQuery(todosQuery)).map(({ id }) => id).toSorted(),
    [secondTodo.id, laterTodo.id].toSorted(),
  );
  assertSame(secondDeps.evoluError.get(), null);
});

test("the static memory worker name selects a worker holding no polyfill lock", async () => {
  using worker = createWorker<SharedWorkerInput, SharedWorkerOutput>(
    new Worker(
      new URL(
        "../../../../packages/web/src/local-first/Shared.worker.ts",
        import.meta.url,
      ),
      { type: "module", name: "evolu-memory-instance" },
    ),
  );
  await new Promise<void>((resolve) => {
    worker.onMessage = (message) => {
      if (message.type === "Connected") resolve();
    };
  });

  const locks = await navigator.locks.query();
  assertSame(
    locks.held?.filter(
      ({ name }) => name === "evolu-one-tab-sharedworker-polyfill",
    ).length,
    0,
  );
});

test("memory instances work beside a stored instance without native SharedWorker", async () => {
  await using disposer = new AsyncDisposableStack();
  using _sharedWorker = testStubGlobal("SharedWorker", undefined);
  const sharedWorkerUrls: Array<string> = [];
  using _worker = testStubGlobal(
    "Worker",
    class extends Worker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        if (String(scriptURL).includes("Shared.worker"))
          sharedWorkerUrls.push(String(scriptURL));
        // Panicking the polyfill for cleanup also reports its uncaught error
        // on the dedicated Worker; evoluError observes it through the channel.
        this.addEventListener("error", (event) => event.preventDefault());
      }
    },
  );
  const deps = setupDeps(disposer, { storageRefused: false });
  const { run, evoluPorts } = setupRunWithEvoluPorts(deps);
  disposer.use(run);
  const appName = AppName.orThrow(`test-${crypto.randomUUID()}`);
  const stored = disposer.use(
    await run.ok(
      createEvolu(schema, {
        appName,
        appOwner: testAppOwner,
        transports: [],
      }),
    ),
  );
  try {
    assertEqual(await stored.loadQuery(todosQuery), []);
    const memory = await setupMemoryApp(disposer, deps, appName);
    const todo = memory.insert("todo", {});
    assertEqual(await memory.loadQuery(todosQuery), [{ id: todo.id }]);
    const otherMemory = await setupMemoryApp(disposer, deps, appName);
    assertEqual(await otherMemory.loadQuery(todosQuery), []);
    assertSame(sharedWorkerUrls.length, 3);
    assertEqual(await stored.loadQuery(todosQuery), []);
    const locks = await navigator.locks.query();
    assertSame(
      locks.held?.filter(
        ({ name }) => name === "evolu-one-tab-sharedworker-polyfill",
      ).length,
      1,
    );
    assertSame(deps.evoluError.get(), null);
  } finally {
    const [evoluPort] = evoluPorts;
    assertNonNullable(evoluPort);
    await panicSharedWorker({ deps, evoluPort });
    await waitForSharedWorkerClose(run);
    await removeTestDatabase(stored.name);
  }
});

test("a private worker's panic reaches only its own tab", async () => {
  await using disposer = new AsyncDisposableStack();
  using _worker = testStubGlobal(
    "Worker",
    class extends Worker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        // The intentional panic is observed through evoluError rather than
        // also failing Vitest as an uncaught dedicated-worker error.
        this.addEventListener("error", (event) => event.preventDefault());
      }
    },
  );
  const firstDeps = setupDeps(disposer);
  const secondDeps = setupDeps(disposer);
  const appName = AppName.orThrow(`test-${crypto.randomUUID()}`);
  const { run, evoluPorts } = setupRunWithEvoluPorts(firstDeps);
  disposer.use(run);
  const first = disposer.use(
    await run.ok(
      createEvolu(schema, {
        appName,
        appOwner: testAppOwner,
        memoryOnly: true,
        transports: [],
      }),
    ),
  );
  const second = await setupMemoryApp(disposer, secondDeps, appName);
  assertEqual(await first.loadQuery(todosQuery), []);
  const todo = second.insert("todo", {});
  assertEqual(await second.loadQuery(todosQuery), [{ id: todo.id }]);
  const [evoluPort] = evoluPorts;
  assertNonNullable(evoluPort);

  const globalErrors: Array<unknown> = [];
  const globalChannel = new BroadcastChannel(
    consoleEntryOrErrorBroadcastChannelName,
  );
  disposer.defer(() => globalChannel.close());
  globalChannel.addEventListener(
    "message",
    (event: MessageEvent<ConsoleEntryOrError>) => {
      if (event.data.type === "Error") globalErrors.push(event.data.error);
    },
  );

  await panicSharedWorker({ deps: firstDeps, evoluPort });

  assertEqual(await second.loadQuery(todosQuery), [{ id: todo.id }]);
  assertSame(secondDeps.evoluError.get(), null);
  assertEqual(globalErrors, []);
});
