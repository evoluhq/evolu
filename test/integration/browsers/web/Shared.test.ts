import {
  assert,
  assertEqual,
  assertInstanceOf,
  assertLength,
  assertNotNull,
  assertNotUndefined,
  assertSame,
  constVoid,
  createConsole,
  createIdFromString,
  createRandomBytes,
  createRun,
  id,
  PositiveInt,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  createOwnerWebSocketTransport,
  createProtocolBroadcastMessagesFromCrdtMessages,
  createTimestamp,
  DbChange,
  testAppOwner,
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

test("a worker of another build tells its tab it waits until the first build closes", async () => {
  // Workers with different names behave as the workers of two builds: they are
  // separate instances that share the build lock.
  const buildA = `build-a-${crypto.randomUUID()}`;
  const buildB = `build-b-${crypto.randomUUID()}`;
  const outputA = new BroadcastChannel(buildA);
  const outputB = new BroadcastChannel(buildB);
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    outputB.postMessage({ type: "Close" });
    outputB.close();
  });
  let isBuildAClosed = false;
  const closeBuildA = () => {
    if (isBuildAClosed) return;
    isBuildAClosed = true;
    outputA.postMessage({ type: "Close" });
    outputA.close();
  };
  // Disposed in reverse, so build A closes first even when the test fails.
  cleanup.defer(closeBuildA);

  const createBuildWorker = (name: string) => {
    const worker = cleanup.use(
      createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
        new SharedWorker(
          new URL("./workers/sync-shared-worker.ts", import.meta.url),
          { name, type: "module" },
        ),
      ),
    );
    const outputs: Array<SharedWorkerOutput> = [];
    let nextOutput = Promise.withResolvers<void>();
    worker.port.onMessage = (output) => {
      outputs.push(output);
      nextOutput.resolve();
      nextOutput = Promise.withResolvers<void>();
    };
    const waitForOutputs = async (count: number) => {
      while (outputs.length < count) await nextOutput.promise;
    };
    return { outputs, waitForOutputs };
  };

  const a = createBuildWorker(buildA);
  // A tab connecting to a starting worker may hear Waiting before Connected.
  await a.waitForOutputs(1);
  if (a.outputs[0]?.type === "Waiting") await a.waitForOutputs(2);
  assertSame(a.outputs.at(-1)?.type, "Connected");

  const b = createBuildWorker(buildB);
  await b.waitForOutputs(1);
  const [waiting] = b.outputs;
  assertNotUndefined(waiting);
  assert(waiting.type === "Waiting", "Expected a Waiting output.");

  closeBuildA();
  await b.waitForOutputs(2);
  assertEqual(b.outputs[1], {
    type: "Connected",
    workerId: waiting.workerId,
    syncStateChannelName: `evolu:sync-state:${waiting.workerId}`,
  });
});

test("requestSync crosses browser worker ports while two clients retain the owner", async () => {
  const workerName = `sync-${crypto.randomUUID()}`;
  const output = new BroadcastChannel(workerName);
  const messages: Array<{ url: string; data: Uint8Array }> = [];
  let openCount = 0;
  let nextMessage = Promise.withResolvers<void>();
  output.addEventListener(
    "message",
    (
      event: MessageEvent<{
        type: "Open" | "Send";
        url: string;
        data: Uint8Array;
      }>,
    ) => {
      if (event.data.type === "Open") {
        openCount++;
        return;
      }
      messages.push({ url: event.data.url, data: event.data.data });
      nextMessage.resolve();
      nextMessage = Promise.withResolvers<void>();
    },
  );
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    output.postMessage({ type: "Close" });
    output.close();
  });

  const setupClient = () =>
    createEvoluDeps({
      console: createConsole({ level: "silent" }),
      createBroadcastChannel,
      createMessageChannel,
      createDbWorker: () =>
        createWorker<DbWorkerInit, never>(
          new Worker(
            new URL(
              "../../../../packages/web/src/local-first/Db.worker.ts",
              import.meta.url,
            ),
            { type: "module" },
          ),
        ),
      lockManager: navigator.locks,
      reloadApp: constVoid,
      sharedWorker: createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
        new SharedWorker(
          new URL("./workers/sync-shared-worker.ts", import.meta.url),
          { name: workerName, type: "module" },
        ),
      ),
    });
  const createInstance = createEvolu(
    { todo: { id: id("Todo") } },
    {
      appName: AppName.orThrow(`test-${crypto.randomUUID()}`),
      appOwner: testAppOwner,
      transports: [],
      memoryOnly: true,
    },
  );
  const transport = createOwnerWebSocketTransport({
    url: "wss://sync.example",
    ownerId: testAppOwner.id,
  });
  using firstDeps = setupClient();
  await using firstRun = createRun(firstDeps);
  await using first = await firstRun.ok(createInstance);
  const initial = nextMessage.promise;
  first.useOwner(testAppOwner, [transport]);
  await initial;

  using secondDeps = setupClient();
  await using secondRun = createRun(secondDeps);
  await using second = await secondRun.ok(createInstance);
  const secondSync = nextMessage.promise;
  second.useOwner(testAppOwner, [transport]);
  second.requestSync(testAppOwner.id);
  await secondSync;

  const firstSync = nextMessage.promise;
  first.requestSync(testAppOwner.id);
  await firstSync;
  assertSame(openCount, 1);
  assertSame(messages.length, 3);
  assertEqual(messages[1], messages[0]);
  assertEqual(messages[2], messages[0]);
  assertSame(firstDeps.evoluError.get(), null);
  assertSame(secondDeps.evoluError.get(), null);
});

test("a rejected encrypted change retains its error across browser worker ports", async () => {
  const workerName = `rejection-${crypto.randomUUID()}`;
  const output = new BroadcastChannel(workerName);
  const initial = Promise.withResolvers<void>();
  output.addEventListener(
    "message",
    (event: MessageEvent<{ type: "Open" | "Send" }>) => {
      if (event.data.type === "Send") initial.resolve();
    },
  );
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    output.postMessage({ type: "Close" });
    output.close();
  });
  using deps = createEvoluDeps({
    console: createConsole({ level: "silent" }),
    createBroadcastChannel,
    createMessageChannel,
    createDbWorker: () =>
      createWorker<DbWorkerInit, never>(
        new Worker(
          new URL(
            "../../../../packages/web/src/local-first/Db.worker.ts",
            import.meta.url,
          ),
          { type: "module" },
        ),
      ),
    lockManager: navigator.locks,
    reloadApp: constVoid,
    sharedWorker: createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
      new SharedWorker(
        new URL("./workers/sync-shared-worker.ts", import.meta.url),
        { name: workerName, type: "module" },
      ),
    ),
  });
  await using run = createRun(deps);
  await using evolu = await run.ok(
    createEvolu(
      { todo: { id: id("Todo") } },
      {
        appName: AppName.orThrow(`test-${crypto.randomUUID()}`),
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      },
    ),
  );
  const transport = createOwnerWebSocketTransport({
    url: "wss://rejected-change.example",
    ownerId: testAppOwner.id,
  });
  evolu.useOwner(testAppOwner, [transport]);
  await initial.promise;

  const broadcasts = createProtocolBroadcastMessagesFromCrdtMessages({
    randomBytes: createRandomBytes(),
  })(testAppOwner, [
    {
      timestamp: createTimestamp(),
      change: DbChange.orThrow({
        table: "todo",
        id: createIdFromString("browser-rejected-change"),
        values: {},
        isInsert: true,
        isDelete: null,
      }),
    },
  ]);
  assertLength(broadcasts, 1);
  const corrupted = Uint8Array.from(broadcasts[0]);
  corrupted[corrupted.length - 1] ^= 0xff;
  const errorReported = Promise.withResolvers<void>();
  const routeReported = Promise.withResolvers<void>();
  cleanup.defer(deps.evoluError.subscribe(errorReported.resolve));
  cleanup.defer(
    deps.syncState.subscribe(() => {
      const route = deps.syncState.get()?.tenants[0]?.owners[0]?.routes[0];
      if (route?.error) routeReported.resolve();
    }),
  );
  output.postMessage({
    type: "Receive",
    url: transport.url,
    data: corrupted.buffer,
  });
  // The error and route snapshots arrive through independent channels.
  await Promise.all([errorReported.promise, routeReported.promise]);
  const error = deps.evoluError.get();
  assertNotNull(error);
  assertSame(error.type, "DecryptWithXChaCha20Poly1305Error");
  assertInstanceOf(error.error, Error);
  const route = deps.syncState.get()?.tenants[0]?.owners[0]?.routes[0];
  assertNotUndefined(route);
  assertSame(route.error?.type, "DecryptWithXChaCha20Poly1305Error");
});

test("a refused SharedWorker reports the error to a later client store", async () => {
  const workerName = `refusal-${crypto.randomUUID()}`;
  const output = new BroadcastChannel(workerName);
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    output.postMessage({ type: "Close" });
    output.close();
  });
  let dbWorkerCount = 0;
  const setupClient = () =>
    createEvoluDeps({
      console: createConsole({ level: "silent" }),
      createBroadcastChannel,
      createMessageChannel,
      createDbWorker: () => {
        dbWorkerCount++;
        return createWorker<DbWorkerInit, never>(
          new Worker(
            new URL("./workers/refusing-db-worker.ts", import.meta.url),
            {
              type: "module",
            },
          ),
        );
      },
      lockManager: navigator.locks,
      reloadApp: constVoid,
      // The production Shared.worker.ts never releases the build lock, so the
      // tests after this one would wait for it; the e2e suite covers it.
      sharedWorker: createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
        new SharedWorker(
          new URL("./workers/sync-shared-worker.ts", import.meta.url),
          { name: workerName, type: "module" },
        ),
      ),
    });
  const createInstance = createEvolu(
    { todo: { id: id("Todo") } },
    {
      appName: AppName.orThrow(`test-${crypto.randomUUID()}`),
      appOwner: testAppOwner,
      transports: [],
    },
  );
  const error = {
    type: "UnsupportedDbVersionError",
    storedVersion: PositiveInt.orThrow(2),
    supportedVersion: PositiveInt.orThrow(1),
  };

  using firstDeps = setupClient();
  await using firstRun = createRun(firstDeps);
  const firstReported = Promise.withResolvers<void>();
  let firstErrorCount = 0;
  firstDeps.evoluError.subscribe(() => {
    firstErrorCount++;
    firstReported.resolve();
  });
  await using first = await firstRun.ok(createInstance);
  await firstReported.promise;
  assertEqual(firstDeps.evoluError.get(), error);

  using secondDeps = setupClient();
  assertSame(secondDeps.evoluError.get(), null);
  await using secondRun = createRun(secondDeps);
  const secondReported = Promise.withResolvers<void>();
  secondDeps.evoluError.subscribe(secondReported.resolve);
  await using second = await secondRun.ok(createInstance);
  await secondReported.promise;
  assertEqual(secondDeps.evoluError.get(), error);
  // Connecting the second client does not create another DbWorker.
  assertSame(dbWorkerCount, 1);
  assertSame(first.name, second.name);
  // The first client's error-store subscriber is not notified again.
  assertSame(firstErrorCount, 1);
});
