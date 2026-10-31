import {
  createRun,
  isPlainObject,
  sleep,
  UnknownError,
  type DisposableRun,
  type MessagePort,
  type Run,
} from "@evolu/common";
import {
  createOwnerWebSocketTransport,
  RelayUrl,
  testAppOwner,
  type EvoluDeps,
  type EvoluInput,
  type EvoluOutput,
} from "@evolu/common/local-first";

/**
 * Creates a Run with the deps that keeps the input port of each Evolu instance
 * it creates, so {@link panicSharedWorker} can post what useOwner rejects.
 */
export const setupRunWithEvoluPorts = (
  deps: EvoluDeps,
): {
  readonly run: DisposableRun<EvoluDeps>;
  readonly evoluPorts: ReadonlyArray<MessagePort<EvoluInput, EvoluOutput>>;
} => {
  const evoluPorts: Array<MessagePort<EvoluInput, EvoluOutput>> = [];
  const run = createRun({
    ...deps,
    createMessageChannel: <Input, Output = never>() => {
      const channel = deps.createMessageChannel<Input, Output>();
      evoluPorts.push(channel.port1 as never);
      return channel;
    },
  });
  return { run, evoluPorts };
};

/**
 * Panics the tab's shared worker and waits until the panic's error reaches the
 * tab's evoluError.
 */
export const panicSharedWorker = async ({
  deps,
  evoluPort,
}: {
  readonly deps: Pick<EvoluDeps, "evoluError">;
  readonly evoluPort: MessagePort<EvoluInput, EvoluOutput>;
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
  // root Run. useOwner throws for it, so this posts it as a defective tab
  // would. The panic also releases the build lock that the production worker
  // otherwise holds, which would block later tests.
  const transport = createOwnerWebSocketTransport({
    url: RelayUrl.orThrow("wss://panic.example/"),
    ownerId: testAppOwner.id,
  });
  evoluPort.postMessage({
    type: "UseOwner",
    actions: [
      {
        owner: { owner: testAppOwner, transports: [transport, transport] },
        action: "add",
      },
    ],
  });

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
