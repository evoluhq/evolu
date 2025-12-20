import { describe, expect, test, vi } from "vitest";
import { createStore } from "../src/Store.js";

describe("createStore", () => {
  test("get returns initial state", () => {
    const store = createStore(42);
    expect(store.get()).toBe(42);
  });

  describe("set", () => {
    test("updates state", () => {
      const store = createStore(0);
      store.set(1);
      expect(store.get()).toBe(1);
    });

    test("returns true when state changes", () => {
      const store = createStore(0);
      expect(store.set(1)).toBe(true);
    });

    test("returns false for equal values", () => {
      const store = createStore(1);
      expect(store.set(1)).toBe(false);
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

  describe("modify", () => {
    test("updates state", () => {
      const store = createStore(0);
      store.modify((n) => n + 1);
      expect(store.get()).toBe(1);
    });

    test("returns true when state changes", () => {
      const store = createStore(0);
      expect(store.modify((n) => n + 1)).toBe(true);
    });

    test("returns false for equal values", () => {
      const store = createStore(1);
      expect(store.modify((n) => n)).toBe(false);
    });

    test("notifies listeners when state changes", () => {
      const store = createStore(0);
      const listener = vi.fn();
      store.subscribe(listener);

      store.modify((n) => n + 1);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("does not notify listeners when state is equal", () => {
      const store = createStore(1);
      const listener = vi.fn();
      store.subscribe(listener);

      store.modify((n) => n);

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

  test("with custom eq", () => {
    const eqModulo10 = (a: number, b: number) => a % 10 === b % 10;
    const store = createStore(5 as number, eqModulo10);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.set(15)).toBe(false); // 5 % 10 === 15 % 10
    expect(store.get()).toBe(5);
    expect(listener).not.toHaveBeenCalled();

    expect(store.set(16)).toBe(true); // 5 % 10 !== 16 % 10
    expect(store.get()).toBe(16);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
