import { describe, expect, test, vi } from "vitest";
import { createStore } from "../src/Store.js";

describe("get", () => {
  test("get returns initial state", () => {
    const store = createStore(42);
    expect(store.get()).toBe(42);
  });
});

describe("set", () => {
  test("updates state", () => {
    const store = createStore(0);
    store.set(1);
    expect(store.get()).toBe(1);
  });

  test("notifies listeners when state changes", () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(1);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(1);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("getAndSet", () => {
  test("returns previous state and updates state", () => {
    const store = createStore(1);

    expect(store.getAndSet(2)).toBe(1);
    expect(store.get()).toBe(2);
  });

  test("notifies listeners when state changes", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getAndSet(2)).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getAndSet(1)).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("setAndGet", () => {
  test("returns updated state", () => {
    const store = createStore(1);

    expect(store.setAndGet(2)).toBe(2);
    expect(store.get()).toBe(2);
  });

  test("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.setAndGet(1)).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  test("updates state", () => {
    const store = createStore(1);

    store.update((n) => n + 1);

    expect(store.get()).toBe(2);
  });

  test("notifies listeners when state changes", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    store.update((n) => n + 1);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    store.update((n) => n);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("getAndUpdate", () => {
  test("returns previous state and updates state", () => {
    const store = createStore(1);

    expect(store.getAndUpdate((n: number) => n + 1)).toBe(1);
    expect(store.get()).toBe(2);
  });

  test("notifies listeners when state changes", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getAndUpdate((n: number) => n + 1)).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getAndUpdate((n) => n)).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("updateAndGet", () => {
  test("returns updated state", () => {
    const store = createStore(1);

    expect(store.updateAndGet((n: number) => n + 1)).toBe(2);
    expect(store.get()).toBe(2);
  });

  test("does not notify listeners when state is equal", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.updateAndGet((n) => n)).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("modify", () => {
  test("returns a computed result and updates state", () => {
    const store = createStore(0);
    const result = store.modify((current) => [current, current + 1]);

    expect(result).toBe(0);
    expect(store.get()).toBe(1);
  });

  test("returns computed result and updates state", () => {
    const store = createStore(1);

    const result = store.modify((current: number) => [
      `previous:${current}`,
      current + 1,
    ]);

    expect(result).toBe("previous:1");
    expect(store.get()).toBe(2);
  });

  test("notifies listeners when state changes", () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    const result = store.modify((current: number) => [current, current + 1]);

    expect(result).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("does not notify listeners when next state is equal", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    const result = store.modify((current) => [current, current]);

    expect(result).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("subscribe", () => {
  test("returns unsubscribe function", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("supports multiple listeners", () => {
    const store = createStore(0);
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    store.subscribe(listener1);
    store.subscribe(listener2);

    store.set(1);

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});

describe("dispose", () => {
  test("clears all listeners", () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store[Symbol.dispose]();
    store.set(1);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("custom eq", () => {
  test("suppresses notifications for equal states under the provided equality", () => {
    const eqModulo10 = (a: number, b: number) => a % 10 === b % 10;
    const store = createStore(5 as number, eqModulo10);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(15);
    expect(store.get()).toBe(15);
    expect(listener).not.toHaveBeenCalled();

    store.set(16);
    expect(store.get()).toBe(16);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
