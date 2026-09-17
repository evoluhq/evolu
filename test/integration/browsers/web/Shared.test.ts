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
