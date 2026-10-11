import { isPlainObject, sleep, UnknownError, type Run } from "@evolu/common";
import {
  createOwnerWebSocketTransport,
  testAppOwner,
  type Evolu,
  type EvoluDeps,
} from "@evolu/common/local-first";

/**
 * Panics the tab's shared worker and waits until the panic's error reaches the
 * tab's evoluError.
 */
export const panicSharedWorker = async ({
  deps,
  evolu,
}: {
  readonly deps: Pick<EvoluDeps, "evoluError">;
  readonly evolu: Pick<Evolu, "useOwner">;
}): Promise<void> => {
  // The test waits for the panic's error rather than reading the latest one,
  // so an error reported later cannot hide it.
  const panicReported = Promise.withResolvers<void>();
  deps.evoluError.subscribe(() => {
    const error = deps.evoluError.get();
    if (
      UnknownError.is(error) &&
      isPlainObject(error.error) &&
      typeof error.error.message === "string" &&
      error.error.message.includes("lookup duplicates")
    )
      panicReported.resolve();
  });

  // The same transport twice in one claim is a defect that panics the worker's
  // root Run. The panic also releases the build lock that the production worker
  // otherwise holds, which would block later tests.
  const transport = createOwnerWebSocketTransport({
    url: "wss://panic.example",
    ownerId: testAppOwner.id,
  });
  evolu.useOwner(testAppOwner, [transport, transport]);

  await panicReported.promise;
};

/**
 * Waits until a failed shared worker closes. Closing releases its build lock,
 * but in Firefox, a tab opened right after that can still connect to the
 * closing worker, so this waits a little longer.
 */
export const waitForSharedWorkerClose = async (run: Run): Promise<void> => {
  while (
    (await navigator.locks.query()).held?.some(
      ({ name }) => name === "evolu-leaderlock-tab",
    )
  )
    await run.ok(sleep("10ms"));
  await run.ok(sleep("100ms"));
};
