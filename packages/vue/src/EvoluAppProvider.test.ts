import {
  assertEqual,
  assertNotUndefined,
  assertSame,
  assertThrows,
  assertTrue,
  constVoid,
  createQueryBuilder,
  createStore,
  testEvoluSchema,
  type ReadonlyStore,
  type TestEvoluSchema,
} from "@evolu/common";
import {
  testAppOwner,
  type AppOwnerEntry,
  type AppOwnerEvolu,
  type CurrentAppOwner,
  type DeviceEvolu,
  type EvoluApp,
  type EvoluSchema,
  type OwnerId,
} from "@evolu/common/local-first";
import { mock, test } from "node:test";
import {
  createApp,
  createRenderer,
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  onUnmounted,
  watchEffect,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { createEvoluBinding } from "./createEvoluBinding.ts";
import {
  EvoluAppContext,
  EvoluAppProvider,
  useEvoluApp,
} from "./EvoluAppProvider.ts";
import { useAppOwners } from "./useAppOwners.ts";
import { useDeviceEvolu } from "./useDeviceEvolu.ts";
import { useEvolu } from "./useEvolu.ts";
import { useDeviceQueries, useQueries } from "./useQueries.ts";
import { useDeviceQuery, useQuery } from "./useQuery.ts";

/** A node of the in-memory tree {@link setupRenderedApp} renders into. */
interface TestNode {
  readonly type: string;
  text: string;
  readonly children: Array<TestNode>;
  parent: TestNode | null;
}

const createTestNode = (type: string, text = ""): TestNode => ({
  type,
  text,
  children: [],
  parent: null,
});

const detachTestNode = (node: TestNode): void => {
  const { parent } = node;
  if (!parent) return;
  parent.children.splice(parent.children.indexOf(node), 1);
  node.parent = null;
};

// Vue's renderer over an in-memory tree, so components mount, update, and
// unmount in Node without a DOM.
const { createApp: createTestApp } = createRenderer<TestNode, TestNode>({
  createElement: (type) => createTestNode(type),
  createText: (text) => createTestNode("#text", text),
  createComment: (text) => createTestNode("#comment", text),
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (element, text) => {
    for (const child of element.children) child.parent = null;
    element.children.length = 0;
    if (!text) return;
    const textNode = createTestNode("#text", text);
    textNode.parent = element;
    element.children.push(textNode);
  },
  insert: (child, parent, anchor) => {
    detachTestNode(child);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index === -1) parent.children.push(child);
    else parent.children.splice(index, 0, child);
    child.parent = parent;
  },
  remove: detachTestNode,
  parentNode: (node) => node.parent,
  nextSibling: (node) => {
    const siblings = node.parent?.children;
    return siblings?.[siblings.indexOf(node) + 1] ?? null;
  },
  patchProp: constVoid,
});

const textOfTestNode = (node: TestNode): string =>
  node.type === "#text"
    ? node.text
    : node.type === "#comment"
      ? ""
      : node.children.map(textOfTestNode).join("");

/** A store that counts its listeners. */
const createCountingStore = <T>(initialValue: T) => {
  const store = createStore(initialValue);
  let listenerCount = 0;
  const counted: ReadonlyStore<T> = {
    ...store,
    subscribe: (listener) => {
      listenerCount++;
      const unsubscribe = store.subscribe(listener);
      return () => {
        listenerCount--;
        unsubscribe();
      };
    },
  };
  return { store, counted, listenerCount: () => listenerCount };
};

// Only the name tells the instances apart in these tests.
const createInstance = (name: string) =>
  ({ name }) as unknown as AppOwnerEvolu<EvoluSchema>;

const device = { name: "device" } as unknown as DeviceEvolu<EvoluSchema>;

const appOwnerEntries: ReadonlyArray<AppOwnerEntry> = [
  { id: testAppOwner.id, name: null, lastOpenedAt: null },
];

/** An EvoluApp stub whose `current` and `appOwners` count their listeners. */
const setupApp = (initialCurrent: CurrentAppOwner<EvoluSchema> | null) => {
  const current = createCountingStore(initialCurrent);
  const appOwners = createCountingStore(appOwnerEntries);
  // Only current, appOwners, and device are used by the binding.
  const app = {
    current: current.counted,
    appOwners: appOwners.counted,
    device,
  } as unknown as EvoluApp<EvoluSchema, EvoluSchema>;

  return {
    app,
    setCurrent: (value: CurrentAppOwner<EvoluSchema> | null) => {
      current.store.set(value);
    },
    setAppOwners: (value: ReadonlyArray<AppOwnerEntry>) => {
      appOwners.store.set(value);
    },
    currentListenerCount: current.listenerCount,
    appOwnersListenerCount: appOwners.listenerCount,
  };
};

const currentOf = (
  evolu: Promise<AppOwnerEvolu<EvoluSchema>>,
): CurrentAppOwner<EvoluSchema> => ({ appOwner: testAppOwner, evolu });

const WithoutAppOwner = defineComponent({
  setup: () => {
    /* oxlint-disable react/rules-of-hooks -- Vue composables run in setup. */
    const app = useEvoluApp();
    const appOwners = useAppOwners();
    const deviceEvolu = useDeviceEvolu();
    /* oxlint-enable react/rules-of-hooks */
    return () =>
      h(
        "p",
        `none of ${appOwners.value.length}, device ${deviceEvolu === app.device ? "same" : "other"}`,
      );
  },
});

/**
 * Renders EvoluAppProvider with a default slot that shows the instance useEvolu
 * returns and counts its mounts and unmounts, and a `withoutAppOwner` slot that
 * reads the app.
 */
const setupRenderedApp = (app: EvoluApp<EvoluSchema, EvoluSchema>) => {
  let mounts = 0;
  let unmounts = 0;
  const WithAppOwner = defineComponent({
    setup: () => {
      mounts++;
      onUnmounted(() => {
        unmounts++;
      });
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const evolu = useEvolu();
      return () => h("p", `open ${evolu.name}`);
    },
  });
  const root = createTestNode("root");
  const testApp = createTestApp({
    setup: () => () =>
      h(
        EvoluAppProvider,
        { app },
        {
          default: () => h(WithAppOwner),
          withoutAppOwner: () => h(WithoutAppOwner),
        },
      ),
  });
  testApp.mount(root);

  return {
    text: () => textOfTestNode(root),
    mounts: () => mounts,
    unmounts: () => unmounts,
    unmount: () => {
      testApp.unmount();
    },
  };
};

/** Lets resolved promises call back, then Vue render. */
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await nextTick();
};

test("renders the default slot with the open AppOwner's instance once it opens", async () => {
  const opening = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  const { app } = setupApp(currentOf(opening.promise));
  const rendered = setupRenderedApp(app);

  assertSame(rendered.text(), "");
  opening.resolve(createInstance("a"));
  await flush();
  assertSame(rendered.text(), "open a");
  rendered.unmount();
});

test("renders the opening slot while the open AppOwner's instance opens, also on the server", async () => {
  const openingA = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  const { app, setCurrent } = setupApp(currentOf(openingA.promise));
  const render = () =>
    h(
      EvoluAppProvider,
      { app },
      {
        default: () => h("p", "open"),
        withoutAppOwner: () => h("p", "none"),
        opening: () => h("p", "opening"),
      },
    );
  assertSame(
    await renderToString(createSSRApp({ setup: () => render })),
    "<!--[--><p>opening</p><!--]-->",
  );
  const root = createTestNode("root");
  const testApp = createTestApp({ setup: () => render });
  testApp.mount(root);

  assertSame(textOfTestNode(root), "opening");
  openingA.resolve(createInstance("a"));
  await flush();
  assertSame(textOfTestNode(root), "open");

  // Another instance opens again.
  const openingB = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  setCurrent(currentOf(openingB.promise));
  await flush();
  assertSame(textOfTestNode(root), "opening");

  setCurrent(null);
  await flush();
  assertSame(textOfTestNode(root), "none");
  testApp.unmount();
});

test("renders withoutAppOwner while no AppOwner is open, where the app and its AppOwners can be read", async () => {
  const { app, setCurrent, setAppOwners } = setupApp(null);
  const rendered = setupRenderedApp(app);

  assertSame(rendered.text(), "none of 1, device same");
  setAppOwners([]);
  await flush();
  assertSame(rendered.text(), "none of 0, device same");

  setCurrent(currentOf(Promise.resolve(createInstance("a"))));
  await flush();
  assertSame(rendered.text(), "open a");

  setCurrent(null);
  await flush();
  assertSame(rendered.text(), "none of 0, device same");
  rendered.unmount();
});

test("remounts the default slot for another instance and keeps it for the same one", async () => {
  const a = Promise.resolve(createInstance("a"));
  const { app, setCurrent } = setupApp(currentOf(a));
  const rendered = setupRenderedApp(app);
  await flush();
  assertEqual([rendered.text(), rendered.mounts()], ["open a", 1]);

  // Another CurrentAppOwner with the same instance, as an open of the AppOwner
  // the tab already has open gives.
  setCurrent(currentOf(a));
  await flush();
  assertEqual(
    [rendered.text(), rendered.mounts(), rendered.unmounts()],
    ["open a", 1, 0],
  );

  // Another instance, as of another AppOwner or of the same one after its
  // database's deletion, unmounts the slot at once and mounts it once open.
  const opening = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  setCurrent(currentOf(opening.promise));
  await flush();
  assertEqual(
    [rendered.text(), rendered.mounts(), rendered.unmounts()],
    ["", 1, 1],
  );
  opening.resolve(createInstance("b"));
  await flush();
  assertEqual(
    [rendered.text(), rendered.mounts(), rendered.unmounts()],
    ["open b", 2, 1],
  );
  rendered.unmount();
});

test("remounts the default slot when the tab switches between open instances", async () => {
  // An AppOwner's instance stays open, so switching back gives a promise that
  // has already resolved.
  const a = Promise.resolve(createInstance("a"));
  const b = Promise.resolve(createInstance("b"));
  const { app, setCurrent } = setupApp(currentOf(a));
  const rendered = setupRenderedApp(app);
  await flush();

  setCurrent(currentOf(b));
  await flush();
  assertEqual(
    [rendered.text(), rendered.mounts(), rendered.unmounts()],
    ["open b", 2, 1],
  );
  setCurrent(currentOf(a));
  await flush();
  assertEqual(
    [rendered.text(), rendered.mounts(), rendered.unmounts()],
    ["open a", 3, 2],
  );
  rendered.unmount();
});

test("ignores an instance that opens after the tab moved on", async () => {
  const openingA = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  const openingB = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  const { app, setCurrent } = setupApp(currentOf(openingA.promise));
  const rendered = setupRenderedApp(app);

  setCurrent(currentOf(openingB.promise));
  openingA.resolve(createInstance("a"));
  await flush();
  assertSame(rendered.text(), "");
  openingB.resolve(createInstance("b"));
  await flush();
  assertSame(rendered.text(), "open b");

  const openingC = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  setCurrent(currentOf(openingC.promise));
  setCurrent(null);
  openingC.resolve(createInstance("c"));
  await flush();
  assertSame(rendered.text(), "none of 1, device same");
  rendered.unmount();
});

test("isn't tracked by a watchEffect that opens an AppOwner", async () => {
  const { app, setCurrent } = setupApp(null);
  const rendered = setupRenderedApp(app);
  const opening = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  let opens = 0;
  const scope = effectScope();
  scope.run(() => {
    watchEffect(() => {
      opens++;
      // As app.open sets current, synchronously.
      setCurrent(currentOf(opening.promise));
    });
  });

  opening.resolve(createInstance("a"));
  await flush();
  assertSame(rendered.text(), "open a");
  assertSame(opens, 1);
  scope.stop();
  rendered.unmount();
});

test("stops following the app when it unmounts while an instance opens", () => {
  const opening = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  const { app, currentListenerCount } = setupApp(currentOf(opening.promise));
  const rendered = setupRenderedApp(app);

  assertSame(currentListenerCount(), 1);
  rendered.unmount();
  assertSame(currentListenerCount(), 0);
});

test("waits for no open and follows nothing during server rendering", async () => {
  const opening = Promise.withResolvers<AppOwnerEvolu<EvoluSchema>>();
  // Counts what waits for the open.
  const waits = mock.method(opening.promise, "then");
  const { app, setCurrent, currentListenerCount, appOwnersListenerCount } =
    setupApp(null);
  // A server renders each request with an app of its own.
  const createSsrApp = () =>
    createSSRApp({
      setup: () => () =>
        h(
          EvoluAppProvider,
          { app },
          {
            default: () => h("p", "open"),
            withoutAppOwner: () => h(WithoutAppOwner),
          },
        ),
    });

  // A slot renders as a fragment, between its markers.
  assertSame(
    await renderToString(createSsrApp()),
    "<!--[--><p>none of 1, device same</p><!--]-->",
  );
  // An open renders as it does while the instance opens.
  setCurrent(currentOf(opening.promise));
  assertSame(await renderToString(createSsrApp()), "<!---->");
  assertEqual(
    [waits.mock.callCount(), currentListenerCount(), appOwnersListenerCount()],
    [0, 0, 0],
  );
});

test("useEvoluApp throws outside EvoluAppProvider", () => {
  assertThrows(
    () => {
      createApp({}).runWithContext(useEvoluApp);
    },
    (thrown) => {
      assertTrue(thrown instanceof Error);
      assertTrue(thrown.message.startsWith("Could not find the EvoluApp"));
    },
  );
});

test("createEvoluBinding returns the composables, only typed", () => {
  const typed = createEvoluBinding<TestEvoluSchema>();
  assertSame(typed.useEvolu, useEvolu);
  assertSame(typed.useEvoluApp, useEvoluApp);
  assertSame(typed.useDeviceEvolu, useDeviceEvolu);
  assertSame(typed.useQuery, useQuery);
  assertSame(typed.useQueries, useQueries);
  assertSame(typed.useDeviceQuery, useDeviceQuery);
  assertSame(typed.useDeviceQueries, useDeviceQueries);

  const allTodos = createQueryBuilder(testEvoluSchema)((db) =>
    db.selectFrom("todo").selectAll(),
  );
  // @ts-expect-error A device schema without tables has no table to query, such as the app's own.
  void (() => typed.useDeviceQuery(allTodos));
  // @ts-expect-error A device schema without tables has no table to query, such as the app's own.
  void (() => typed.useDeviceQueries([allTodos]));
});

test("useAppOwners follows the app's AppOwners until its scope is disposed", () => {
  const { app, setAppOwners, appOwnersListenerCount } = setupApp(null);
  const vueApp = createApp({});
  vueApp.provide(EvoluAppContext, app);
  const scope = effectScope();

  const appOwners = vueApp.runWithContext(() => scope.run(useAppOwners));
  assertNotUndefined(appOwners);
  assertSame(appOwners.value, appOwnerEntries);
  const next = [
    ...appOwnerEntries,
    { id: "other" as OwnerId, name: null, lastOpenedAt: null },
  ];
  setAppOwners(next);
  assertSame(appOwners.value, next);

  scope.stop();
  assertSame(appOwnersListenerCount(), 0);
});
