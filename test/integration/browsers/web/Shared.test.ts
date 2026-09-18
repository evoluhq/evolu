import {
  assertEqual,
  assertSame,
  constVoid,
  createConsole,
  createRun,
  id,
  PositiveInt,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  createOwnerWebSocketTransport,
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
  cleanup.defer(() => output.close());

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

test("a refused SharedWorker reports the error to a later client store", async () => {
  const workerName = `refusal-${crypto.randomUUID()}`;
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
      sharedWorker: createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
        new SharedWorker(
          new URL(
            "../../../../packages/web/src/local-first/Shared.worker.ts",
            import.meta.url,
          ),
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
