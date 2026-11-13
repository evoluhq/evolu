import {
  assertNotUndefined,
  assertSame,
  createStore,
  type ReadonlyStore,
} from "@evolu/common";
import { test } from "node:test";
import { createSSRApp, effectScope, h, watch } from "vue";
import { renderToString } from "vue/server-renderer";
import { useStore } from "./useStore.ts";

/** A store that counts its listeners. */
const setupStore = <T>(initialValue: T) => {
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

test("follows the store until its scope is disposed", () => {
  const { store, counted, listenerCount } = setupStore("first");
  const scope = effectScope();

  const value = scope.run(() => useStore(counted));
  assertNotUndefined(value);
  assertSame(value.value, "first");
  assertSame(listenerCount(), 1);

  store.set("second");
  assertSame(value.value, "second");

  scope.stop();
  assertSame(listenerCount(), 0);
  store.set("third");
  assertSame(value.value, "second");
});

test("shows a change made between its first read and the subscription", () => {
  const store = createStore("first");
  // The value changes while it subscribes, so the listener misses it.
  const changing: ReadonlyStore<string> = {
    ...store,
    subscribe: (listener) => {
      store.set("changed");
      return store.subscribe(listener);
    },
  };
  const scope = effectScope();

  const value = scope.run(() => useStore(changing));
  assertNotUndefined(value);

  assertSame(value.value, "changed");
  scope.stop();
});

test("keeps its value while the store gives the same one", () => {
  const value = { count: 1 };
  // A store that notifies on every set, as a ReadonlyStore may.
  const store = createStore(value, () => false);
  const scope = effectScope();
  let changeCount = 0;

  scope.run(() => {
    const followed = useStore(store);
    watch(
      followed,
      () => {
        changeCount++;
      },
      { flush: "sync" },
    );
  });
  store.set(value);

  assertSame(changeCount, 0);
  scope.stop();
});

test("reads the store once, following nothing, during server rendering", async () => {
  const { counted, listenerCount } = setupStore("served");
  const app = createSSRApp({
    setup: () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const value = useStore(counted);
      return () => h("p", value.value);
    },
  });

  assertSame(await renderToString(app), "<p>served</p>");
  assertSame(listenerCount(), 0);
});
