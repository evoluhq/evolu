import {
  constVoid,
  createConsole,
  createRun,
  id,
  isPlainObject,
  UnknownError,
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

test("a panic of the production shared worker reaches evoluError", async () => {
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
        new URL(
          "../../../../packages/web/src/local-first/Shared.worker.ts",
          import.meta.url,
        ),
        { name: `panic-${crypto.randomUUID()}`, type: "module" },
      ),
    ),
  });
  // Disposing the panicked worker reports more errors, so the test waits for
  // the panic's error rather than reading the latest one.
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

  // The WebSocket constructor throws a SyntaxError for a URL with a fragment,
  // which panics the worker's root Run. The panic also releases the build lock
  // that the production worker otherwise holds, which would block later tests.
  // If that throw stops panicking, this test needs another panic.
  evolu.useOwner(testAppOwner, [
    createOwnerWebSocketTransport({
      url: "wss://panic.example/#",
      ownerId: testAppOwner.id,
    }),
  ]);

  await panicReported.promise;
});
