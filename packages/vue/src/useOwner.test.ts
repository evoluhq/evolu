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
  deriveShardOwner,
  isDatabaseDeleted,
  RelayUrl,
  testAppName,
  testAppOwner,
  type Evolu,
  type EvoluOutput,
  type Owner,
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

test("rejects transports in place of the options", () => {
  const { runInScope } = setupUseOwner();

  const scope = runInScope(() => {
    // @ts-expect-error Transports go in the options object.
    useOwner(testAppOwner, transports);
  });
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
