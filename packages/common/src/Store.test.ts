import { describe, it, mock } from "node:test";
import { assertEqual } from "./Assert.ts";

import { createStore } from "./Store.ts";

describe("get", () => {
  it("get returns initial state", () => {
    const store = createStore(42);
    assertEqual(store.get(), 42);
  });
});

describe("set", () => {
  it("updates state", () => {
    const store = createStore(0);
    store.set(1);
    assertEqual(store.get(), 1);
  });

  it("notifies listeners when state changes", () => {
    const store = createStore(0);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    store.set(1);

    assertEqual(listener.mock.callCount(), 1);
  });

  it("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    store.set(1);

    assertEqual(listener.mock.callCount(), 0);
  });

  it("does not notify listeners when repeated state is NaN", () => {
    const store = createStore(NaN);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    store.set(NaN);

    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("getAndSet", () => {
  it("returns previous state and updates state", () => {
    const store = createStore(1);

    assertEqual(store.getAndSet(2), 1);
    assertEqual(store.get(), 2);
  });

  it("notifies listeners when state changes", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    assertEqual(store.getAndSet(2), 1);
    assertEqual(listener.mock.callCount(), 1);
  });

  it("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    assertEqual(store.getAndSet(1), 1);
    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("setAndGet", () => {
  it("returns updated state", () => {
    const store = createStore(1);

    assertEqual(store.setAndGet(2), 2);
    assertEqual(store.get(), 2);
  });

  it("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    assertEqual(store.setAndGet(1), 1);
    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("update", () => {
  it("updates state", () => {
    const store = createStore(1);

    store.update((n) => n + 1);

    assertEqual(store.get(), 2);
  });

  it("notifies listeners when state changes", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    store.update((n) => n + 1);

    assertEqual(listener.mock.callCount(), 1);
  });

  it("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    store.update((n) => n);

    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("getAndUpdate", () => {
  it("returns previous state and updates state", () => {
    const store = createStore(1);

    assertEqual(
      store.getAndUpdate((n: number) => n + 1),
      1,
    );
    assertEqual(store.get(), 2);
  });

  it("notifies listeners when state changes", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    assertEqual(
      store.getAndUpdate((n: number) => n + 1),
      1,
    );
    assertEqual(listener.mock.callCount(), 1);
  });

  it("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    assertEqual(
      store.getAndUpdate((n) => n),
      1,
    );
    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("updateAndGet", () => {
  it("returns updated state", () => {
    const store = createStore(1);

    assertEqual(
      store.updateAndGet((n: number) => n + 1),
      2,
    );
    assertEqual(store.get(), 2);
  });

  it("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    assertEqual(
      store.updateAndGet((n) => n),
      1,
    );
    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("modify", () => {
  it("returns a computed result and updates state", () => {
    const store = createStore(0);
    const result = store.modify((current) => [current, current + 1]);

    assertEqual(result, 0);
    assertEqual(store.get(), 1);
  });

  it("returns computed result and updates state", () => {
    const store = createStore(1);

    const result = store.modify((current: number) => [
      `previous:${current}`,
      current + 1,
    ]);

    assertEqual(result, "previous:1");
    assertEqual(store.get(), 2);
  });

  it("notifies listeners when state changes", () => {
    const store = createStore(0);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    const result = store.modify((current: number) => [current, current + 1]);

    assertEqual(result, 0);
    assertEqual(listener.mock.callCount(), 1);
  });

  it("does not notify listeners when next state is equal", () => {
    const store = createStore(1);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    const result = store.modify((current) => [current, current]);

    assertEqual(result, 1);
    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("subscribe", () => {
  it("returns unsubscribe function", () => {
    const store = createStore(0);
    const listener = mock.fn<() => void>();
    const unsubscribe = store.subscribe(listener);

    store.set(1);
    assertEqual(listener.mock.callCount(), 1);

    unsubscribe();
    store.set(2);
    assertEqual(listener.mock.callCount(), 1);
  });

  it("supports multiple listeners", () => {
    const store = createStore(0);
    const listener1 = mock.fn<() => void>();
    const listener2 = mock.fn<() => void>();

    store.subscribe(listener1);
    store.subscribe(listener2);

    store.set(1);

    assertEqual(listener1.mock.callCount(), 1);
    assertEqual(listener2.mock.callCount(), 1);
  });
});

describe("dispose", () => {
  it("clears all listeners", () => {
    const store = createStore(0);
    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    store[Symbol.dispose]();
    store.set(1);

    assertEqual(listener.mock.callCount(), 0);
  });
});

describe("custom eq", () => {
  it("suppresses notifications for equal states under the provided equality", () => {
    const eqModulo10 = (a: number, b: number) => a % 10 === b % 10;
    const store = createStore<number>(5, eqModulo10);

    const listener = mock.fn<() => void>();
    store.subscribe(listener);

    store.set(15);
    assertEqual(store.get(), 15);
    assertEqual(listener.mock.callCount(), 0);

    store.set(16);
    assertEqual(store.get(), 16);
    assertEqual(listener.mock.callCount(), 1);
  });
});
