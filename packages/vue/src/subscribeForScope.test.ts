import {
  assertEqual,
  assertSame,
  constVoid,
  createQueryBuilder,
  testEvoluSchema,
  type ReadonlyStore,
} from "@evolu/common";
import {
  testAppOwner,
  type AppOwnerEntry,
  type EvoluApp,
  type SyncState,
} from "@evolu/common/local-first";
import { mock, test } from "node:test";
import {
  createRenderer,
  defineComponent,
  h,
  type InjectionKey,
  Suspense,
} from "vue";
import { EvoluAppContext } from "./EvoluAppProvider.ts";
import { EvoluContext } from "./provideEvolu.ts";
import { useAppOwners } from "./useAppOwners.ts";
import { useOwner } from "./useOwner.ts";
import { useOwnerSyncStatus } from "./useOwnerSyncStatus.ts";
import { useQuery } from "./useQuery.ts";

// A top-level await in <script setup> compiles to withAsyncContext, which
// Vue's types leave out as internal.
const { withAsyncContext } = (await import("vue")) as unknown as {
  readonly withAsyncContext: (
    getAwaitable: () => Promise<void>,
  ) => readonly [Promise<void>, () => void];
};

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

/**
 * Mounts a component whose async setup calls `composable` after an await, as
 * `<script setup>` with a top-level await compiles, and unmounts it during that
 * await. The restore after the await makes the component's scope current again,
 * which the unmount stopped. Resolves with what `composable` returned once the
 * setup ran.
 */
const setupUnmountedDuringAwait = async <T>(
  key: InjectionKey<unknown>,
  value: unknown,
  composable: () => T,
): Promise<T> => {
  const awaited = Promise.withResolvers<void>();
  const ran = Promise.withResolvers<T>();
  const AsyncComponent = defineComponent({
    setup: async () => {
      const [awaitable, restore] = withAsyncContext(() => awaited.promise);
      await awaitable;
      restore();
      try {
        ran.resolve(composable());
      } catch (error) {
        ran.reject(error);
      }
      return () => null;
    },
  });
  const app = createTestApp({
    render: () => h(Suspense, null, { default: () => h(AsyncComponent) }),
  });
  app.provide(key, value);
  // Vue notes once that Suspense is experimental.
  const info = mock.method(console, "info", constVoid);
  try {
    app.mount(createTestNode());
  } finally {
    info.mock.restore();
  }

  app.unmount();
  awaited.resolve();
  return ran.promise;
};

/** Counts subscriptions that are still active. */
const setupCounter = () => {
  let count = 0;
  return {
    subscribe: (): (() => void) => {
      count++;
      return () => {
        count--;
      };
    },
    count: () => count,
  };
};

test("useQuery returns no rows without using the instance in a component that unmounted while its async setup awaited", async () => {
  // Its methods throw, as a disposed instance's do, because the app may have
  // been disposed during the await.
  const evolu = {
    loadQuery: () => {
      throw new Error("The instance is disposed.");
    },
    subscribeQuery: () => {
      throw new Error("The instance is disposed.");
    },
    getQueryRows: () => {
      throw new Error("The instance is disposed.");
    },
  };
  const createQuery = createQueryBuilder(testEvoluSchema);
  const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());

  const rows = await setupUnmountedDuringAwait(EvoluContext, evolu, () =>
    useQuery(allTodos),
  );

  assertEqual(rows.value, []);
});

test("useOwner uses no owner in a component that unmounted while its async setup awaited", async () => {
  const owners = setupCounter();
  // Only useOwner is used by the composable.
  const evolu = { useOwner: owners.subscribe };

  await setupUnmountedDuringAwait(EvoluContext, evolu, () => {
    useOwner(testAppOwner);
  });

  assertSame(owners.count(), 0);
});

test("useOwnerSyncStatus follows no store in a component that unmounted while its async setup awaited", async () => {
  const listeners = setupCounter();
  // Only name and appOwner are used by the composable.
  const evolu = { name: "Evolu", appOwner: testAppOwner };
  const syncState: ReadonlyStore<SyncState | null> = {
    get: () => null,
    subscribe: listeners.subscribe,
    [Symbol.dispose]: constVoid,
  };

  const status = await setupUnmountedDuringAwait(EvoluContext, evolu, () =>
    useOwnerSyncStatus(syncState),
  );

  assertEqual(status.value, { type: "NoRelays" });
  assertSame(listeners.count(), 0);
});

test("useAppOwners follows no AppOwners in a component that unmounted while its async setup awaited", async () => {
  const listeners = setupCounter();
  const entries: ReadonlyArray<AppOwnerEntry> = [];
  // Only appOwners is used by the composable.
  const app = {
    appOwners: { get: () => entries, subscribe: listeners.subscribe },
  } as unknown as EvoluApp<never, never>;

  const appOwners = await setupUnmountedDuringAwait(EvoluAppContext, app, () =>
    useAppOwners(),
  );

  assertSame(appOwners.value, entries);
  assertSame(listeners.count(), 0);
});
