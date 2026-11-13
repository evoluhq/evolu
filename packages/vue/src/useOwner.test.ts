import {
  assertEqual,
  assertNonNullable,
  assertThrows,
  assertTrue,
  constVoid,
  testCreateBroadcastChannel,
  testCreateLockManager,
  testCreateMessageChannel,
  testCreateRun,
  testCreateSharedWorker,
  testCreateWorker,
  testEvoluSchema,
} from "@evolu/common";
import {
  createEvolu,
  createOwnerWebSocketTransport,
  isDatabaseDeleted,
  RelayUrl,
  testAppName,
  testAppOwner,
  type Evolu,
  type EvoluOutput,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { mock, test } from "node:test";
import { createApp, createSSRApp, effectScope, type EffectScope } from "vue";
import { renderToString } from "vue/server-renderer";
import { EvoluContext } from "./provideEvolu.ts";
import { useOwner } from "./useOwner.ts";

// Evolu instances need them.
installPolyfills();

/**
 * Runs composables in an effect scope of an app providing an Evolu stub that
 * records each owner registration and its release.
 */
const setupUseOwner = () => {
  const calls: Array<string> = [];
  // Only useOwner is used by the composable.
  const evolu = {
    useOwner: () => {
      calls.push("use");
      return () => {
        calls.push("unuse");
      };
    },
  } as Pick<Evolu, "useOwner"> as Evolu;
  const app = createApp({});
  app.provide(EvoluContext, evolu);

  const runInScope = (fn: () => void): EffectScope => {
    const scope = effectScope();
    app.runWithContext(() => scope.run(fn));
    return scope;
  };

  return { calls, evolu, runInScope };
};

const transports = [
  createOwnerWebSocketTransport({
    url: RelayUrl.orThrow("wss://relay.example/"),
    ownerId: testAppOwner.id,
  }),
] as const;

test("releases the owner when its scope is disposed", () => {
  const { calls, runInScope } = setupUseOwner();

  const scope = runInScope(() => {
    useOwner(testAppOwner, transports);
  });
  assertEqual(calls, ["use"]);

  scope.stop();
  assertEqual(calls, ["use", "unuse"]);
});

test("uses no owner during server rendering", async () => {
  const { calls, evolu } = setupUseOwner();
  const app = createSSRApp({
    setup: () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      useOwner(testAppOwner, transports);
      return () => null;
    },
  });
  app.provide(EvoluContext, evolu);

  await renderToString(app);
  assertEqual(calls, []);
});

test("throws outside a component or app", () => {
  // Vue warns that inject runs outside setup, which is the misuse tested here.
  const warn = mock.method(console, "warn", constVoid);
  try {
    assertThrows(
      () => {
        useOwner(testAppOwner, transports);
      },
      (thrown) => {
        assertTrue(thrown instanceof Error);
        assertTrue(thrown.message.startsWith("Could not find Evolu context"));
      },
    );
  } finally {
    warn.mock.restore();
  }
});

test("uses no owner when it is null", () => {
  const { calls, runInScope } = setupUseOwner();

  const scope = runInScope(() => {
    useOwner(null, transports);
  });
  scope.stop();
  assertEqual(calls, []);
});

/**
 * Creates an Evolu instance whose database the test deletes, as the message
 * that tells it a tab deleted its database does.
 */
const setupDeletableEvolu = async () => {
  const disposer = new AsyncDisposableStack();
  const ports: Array<{
    readonly onMessage: ((output: EvoluOutput) => void) | null;
  }> = [];
  const run = disposer.use(
    testCreateRun({
      createDbWorker: testCreateWorker,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: <Input, Output = never>() => {
        const channel = testCreateMessageChannel<Input, Output>();
        ports.push(channel.port1 as never);
        return channel;
      },
      getDevicePersistence: () => Promise.resolve("Unknown" as const),
      lockManager: testCreateLockManager(),
      reloadApp: constVoid,
      storedWorker: Promise.resolve(
        disposer.use(
          testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
        ),
      ),
    }),
  );
  const evolu = await run.ok(
    createEvolu(testEvoluSchema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    }),
  );
  return {
    evolu,
    deleteDatabase: (): void => {
      const onMessage = ports.find((port) => port.onMessage)?.onMessage;
      assertNonNullable(onMessage);
      onMessage({ type: "OnDatabaseDeleted", removed: false });
    },
    [Symbol.asyncDispose]: () => disposer.disposeAsync(),
  };
};

test("uses no owner of an instance whose database was deleted", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, deleteDatabase } = setup;
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const before = effectScope();
  app.runWithContext(() =>
    before.run(() => {
      useOwner(testAppOwner, transports);
    }),
  );

  deleteDatabase();
  await Promise.resolve();
  assertTrue(isDatabaseDeleted(evolu));

  // A component the app hasn't replaced yet sets up after the deletion.
  const after = effectScope();
  app.runWithContext(() =>
    after.run(() => {
      useOwner(testAppOwner, transports);
    }),
  );
  after.stop();
  before.stop();
});
