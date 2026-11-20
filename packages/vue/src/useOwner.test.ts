import {
  assert,
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
  deriveShardOwner,
  isDatabaseDeleted,
  RelayUrl,
  testAppName,
  testAppOwner,
  type Evolu,
  type EvoluInput,
  type EvoluOutput,
  type Owner,
  type OwnerWriteKey,
  type ReadonlyOwner,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  type UseOwnerOptions,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { mock, test } from "node:test";
import {
  createApp,
  createRenderer,
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  reactive,
  readonly,
  ref,
  shallowRef,
  type EffectScope,
  type PropType,
} from "vue";
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
  const uses: Array<{
    readonly owner: ReadonlyOwner | Owner;
    readonly options: UseOwnerOptions | undefined;
  }> = [];
  // Only useOwner is used by the composable.
  const evolu = {
    useOwner: (owner, options) => {
      calls.push("use");
      uses.push({ owner, options });
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

  return { calls, uses, evolu, runInScope };
};

const transports = [
  createOwnerWebSocketTransport({
    url: RelayUrl.orThrow("wss://relay.example/"),
    ownerId: testAppOwner.id,
  }),
] as const;

test("releases the owner when its scope is disposed", () => {
  const { calls, uses, runInScope } = setupUseOwner();

  const scope = runInScope(() => {
    useOwner(testAppOwner, { transports, deleteWhenUnused: true });
  });
  assertEqual(calls, ["use"]);
  assertEqual(uses, [
    { owner: testAppOwner, options: { transports, deleteWhenUnused: true } },
  ]);

  scope.stop();
  assertEqual(calls, ["use", "unuse"]);
});

test("forwards the owner and no options when they are omitted", () => {
  const { uses, runInScope } = setupUseOwner();

  const scope = runInScope(() => {
    useOwner(testAppOwner);
  });
  assertEqual(uses, [{ owner: testAppOwner, options: undefined }]);
  scope.stop();
});

test("uses no owner during server rendering", async () => {
  const { calls, evolu } = setupUseOwner();
  const app = createSSRApp({
    setup: () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      useOwner(testAppOwner, { transports });
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
        useOwner(testAppOwner, { transports });
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
    useOwner(null, { transports });
  });
  scope.stop();
  assertEqual(calls, []);
});

/** A node of the in-memory tree a test app renders into. */
interface TestNode {
  readonly children: Array<TestNode>;
  parent: TestNode | null;
}

const createTestNode = (): TestNode => ({ children: [], parent: null });

const removeTestNode = (node: TestNode): void => {
  if (!node.parent) return;
  const { children } = node.parent;
  children.splice(children.indexOf(node), 1);
  node.parent = null;
};

// Vue's renderer over an in-memory tree, so components mount, update, and
// unmount in Node without a DOM.
const { createApp: createTestApp } = createRenderer<TestNode, TestNode>({
  createElement: createTestNode,
  createText: createTestNode,
  createComment: createTestNode,
  setText: constVoid,
  setElementText: constVoid,
  insert: (child, parent, anchor) => {
    removeTestNode(child);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index === -1) parent.children.push(child);
    else parent.children.splice(index, 0, child);
    child.parent = parent;
  },
  remove: removeTestNode,
  parentNode: (node) => node.parent,
  nextSibling: (node) => {
    if (!node.parent) return null;
    const { children } = node.parent;
    return children[children.indexOf(node) + 1] ?? null;
  },
  patchProp: constVoid,
});

test("releases the owner of a keyed child before its replacement uses another owner and options", async () => {
  const calls: Array<string> = [];
  // Only useOwner is used by the composable.
  const evolu = {
    useOwner: (owner, options) => {
      const label = `${owner.id === testAppOwner.id ? "app" : "shard"}${options?.deleteWhenUnused ? " deleting" : ""}`;
      calls.push(`use ${label}`);
      return () => {
        calls.push(`unuse ${label}`);
      };
    },
  } as Pick<Evolu, "useOwner"> as Evolu;
  const shardOwner = deriveShardOwner(testAppOwner, ["shard", 1]);
  const Child = defineComponent({
    props: {
      owner: { type: Object as PropType<Owner>, required: true },
      options: { type: Object as PropType<UseOwnerOptions>, required: true },
    },
    setup: (props) => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      useOwner(props.owner, props.options);
      return () => null;
    },
  });
  const selected = shallowRef<{
    readonly owner: Owner;
    readonly options: UseOwnerOptions;
  }>({ owner: testAppOwner, options: { transports } });
  const app = createTestApp({
    // Keyed by the owner, because useOwner reads its arguments once.
    render: () => h(Child, { key: selected.value.owner.id, ...selected.value }),
  });
  app.provide(EvoluContext, evolu);
  app.mount(createTestNode());

  selected.value = {
    owner: shardOwner,
    options: {
      transports: [
        createOwnerWebSocketTransport({
          url: RelayUrl.orThrow("wss://relay.example/"),
          ownerId: shardOwner.id,
        }),
      ],
      deleteWhenUnused: true,
    },
  };
  await nextTick();
  assertEqual(calls, ["use app", "unuse app", "use shard deleting"]);

  app.unmount();
  assertEqual(calls, [
    "use app",
    "unuse app",
    "use shard deleting",
    "unuse shard deleting",
  ]);
});

/**
 * Creates an Evolu instance whose database the test can delete, as the message
 * that tells it a tab deleted its database does, and records what the instance
 * posts to its worker.
 */
const setupDeletableEvolu = async () => {
  const disposer = new AsyncDisposableStack();
  const ports: Array<{
    readonly onMessage: ((output: EvoluOutput) => void) | null;
  }> = [];
  const posted: Array<EvoluInput> = [];
  const run = disposer.use(
    testCreateRun({
      createDbWorker: testCreateWorker,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: <Input, Output = never>() => {
        const channel = testCreateMessageChannel<Input, Output>();
        ports.push(channel.port1 as never);
        const { postMessage } = channel.port1;
        // Records what is posted, which this port, unlike a web one, doesn't
        // structured-clone.
        Object.assign(channel.port1, {
          postMessage: (...args: Parameters<typeof postMessage>) => {
            posted.push(args[0] as never);
            postMessage(...args);
          },
        });
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
    posted,
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
      useOwner(testAppOwner, { transports });
    }),
  );

  deleteDatabase();
  await Promise.resolve();
  assertTrue(isDatabaseDeleted(evolu));

  // A component the app hasn't replaced yet sets up after the deletion.
  const after = effectScope();
  app.runWithContext(() =>
    after.run(() => {
      useOwner(testAppOwner, { transports });
    }),
  );
  after.stop();
  before.stop();
});

test("posts a reactive owner and options as plain data a worker can receive", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, posted } = setup;
  const owner = deriveShardOwner(testAppOwner, ["shard", 1]);
  const transport = createOwnerWebSocketTransport({
    url: RelayUrl.orThrow("wss://relay.example/"),
    ownerId: owner.id,
  });
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();
  app.runWithContext(() =>
    scope.run(() => {
      // Evolu copies the owner's fields it posts.
      useOwner(
        reactive({ ...owner }),
        reactive<UseOwnerOptions>({
          transports: [transport],
          deleteWhenUnused: true,
        }),
      );
    }),
  );
  await Promise.resolve();

  const message = posted.find(({ type }) => type === "UseOwner");
  assert(message?.type === "UseOwner", "Expected a UseOwner message.");
  // A web port posts a structured clone, which can't be made of a proxy.
  assertEqual(structuredClone(message), message);
  const [action] = message.actions;
  assert(action?.action === "add", "Expected an add action.");
  assertEqual(action.owner.transports, [transport]);
  assertTrue(action.deleteWhenUnused);
  scope.stop();
});

test("posts an owner and transports of refs as plain data a worker can receive", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, posted } = setup;
  const owner = deriveShardOwner(testAppOwner, ["shard", 1]);
  const transport = createOwnerWebSocketTransport({
    url: RelayUrl.orThrow("wss://relay.example/"),
    ownerId: owner.id,
  });
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();
  app.runWithContext(() =>
    scope.run(() => {
      // A ref makes its object or array value deeply reactive.
      useOwner(ref({ ...owner }).value, {
        transports: ref([transport] as const).value,
        deleteWhenUnused: true,
      });
    }),
  );
  await Promise.resolve();

  const message = posted.find(({ type }) => type === "UseOwner");
  assert(message?.type === "UseOwner", "Expected a UseOwner message.");
  // A web port posts a structured clone, which can't be made of a proxy.
  assertEqual(structuredClone(message), message);
  const [action] = message.actions;
  assert(action?.action === "add", "Expected an add action.");
  assertEqual(action.owner.transports, [transport]);
  assertTrue(action.deleteWhenUnused);
  scope.stop();
});

test("posts an owner whose writeKey ref holds no key as a readonly owner", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, posted } = setup;
  const { id, encryptionKey } = deriveShardOwner(testAppOwner, ["shard", 1]);
  const transport = createOwnerWebSocketTransport({
    url: RelayUrl.orThrow("wss://relay.example/"),
    ownerId: id,
  });
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();
  app.runWithContext(() =>
    scope.run(() => {
      // The reactive object unwraps the ref, so its writeKey reads undefined.
      useOwner(
        reactive({
          id,
          encryptionKey,
          writeKey: ref<OwnerWriteKey | undefined>(undefined),
        }),
        { transports: [transport], deleteWhenUnused: true },
      );
    }),
  );
  await Promise.resolve();

  const message = posted.find(({ type }) => type === "UseOwner");
  assert(message?.type === "UseOwner", "Expected a UseOwner message.");
  const [action] = message.actions;
  assert(action?.action === "add", "Expected an add action.");
  assertEqual(action.owner.owner, { id, encryptionKey });
  scope.stop();
});

test("posts a readonly owner and options as plain data a worker can receive", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, posted } = setup;
  const owner = deriveShardOwner(testAppOwner, ["shard", 1]);
  const transport = createOwnerWebSocketTransport({
    url: RelayUrl.orThrow("wss://relay.example/"),
    ownerId: owner.id,
  });
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();
  app.runWithContext(() =>
    scope.run(() => {
      useOwner(
        readonly({ ...owner }),
        readonly<UseOwnerOptions>({
          transports: [transport],
          deleteWhenUnused: true,
        }),
      );
    }),
  );
  await Promise.resolve();

  const message = posted.find(({ type }) => type === "UseOwner");
  assert(message?.type === "UseOwner", "Expected a UseOwner message.");
  // A web port posts a structured clone, which can't be made of a proxy.
  assertEqual(structuredClone(message), message);
  const [action] = message.actions;
  assert(action?.action === "add", "Expected an add action.");
  assertEqual(action.owner.transports, [transport]);
  assertTrue(action.deleteWhenUnused);
  scope.stop();
});

test("rejects transports in place of the options", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, posted } = setup;
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();

  assertThrows(
    () =>
      app.runWithContext(() =>
        scope.run(() => {
          // @ts-expect-error Transports go in the options object.
          useOwner(testAppOwner, transports);
        }),
      ),
    (thrown) => {
      assertTrue(thrown instanceof Error);
      assertTrue(
        thrown.message.startsWith(
          "useOwner takes its transports in the options",
        ),
      );
    },
  );
  scope.stop();
  await Promise.resolve();
  // Evolu throws before it registers the owner.
  assertEqual(
    posted.filter(({ type }) => type === "UseOwner"),
    [],
  );
});
