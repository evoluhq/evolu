import { describe, expect, test, vi } from "vitest";
import { createListeners } from "../src/Listeners.js";

describe("createListeners", () => {
  test("subscribe and notify", () => {
    const listeners = createListeners();
    const listener = vi.fn();

    listeners.subscribe(listener);
    listeners.notify();

    expect(listener).toHaveBeenCalledOnce();
  });

  test("unsubscribe removes listener", () => {
    const listeners = createListeners();
    const listener = vi.fn();

    const unsubscribe = listeners.subscribe(listener);
    unsubscribe();
    listeners.notify();

    expect(listener).not.toHaveBeenCalled();
  });

  test("unsubscribe is idempotent", () => {
    const listeners = createListeners();
    const listener = vi.fn();

    const unsubscribe = listeners.subscribe(listener);
    unsubscribe();
    unsubscribe(); // second call should not throw

    listeners.notify();
    expect(listener).not.toHaveBeenCalled();
  });

  test("notifies listeners in subscription order", () => {
    const listeners = createListeners();
    const order: Array<number> = [];

    listeners.subscribe(() => order.push(1));
    listeners.subscribe(() => order.push(2));
    listeners.subscribe(() => order.push(3));
    listeners.notify();

    expect(order).toEqual([1, 2, 3]);
  });

  test("passes value to listeners", () => {
    const listeners = createListeners<{ id: string }>();
    const listener = vi.fn();

    listeners.subscribe(listener);
    listeners.notify({ id: "123" });

    expect(listener).toHaveBeenCalledWith({ id: "123" });
  });

  test("same listener added twice is called once", () => {
    const listeners = createListeners();
    const listener = vi.fn();

    listeners.subscribe(listener);
    listeners.subscribe(listener);
    listeners.notify();

    expect(listener).toHaveBeenCalledOnce();
  });

  test("dispose clears all listeners", () => {
    const listeners = createListeners();
    const listener = vi.fn();

    listeners.subscribe(listener);
    listeners[Symbol.dispose]();
    listeners.notify();

    expect(listener).not.toHaveBeenCalled();
  });

  test("notify with no listeners does not throw", () => {
    const listeners = createListeners();
    expect(() => {
      listeners.notify();
    }).not.toThrow();
  });

  test("listener can unsubscribe itself during notify", () => {
    const listeners = createListeners();
    const selfUnsubscribing = vi.fn();
    const listener = vi.fn();

    const unsubscribe = listeners.subscribe(() => {
      selfUnsubscribing();
      unsubscribe();
    });
    listeners.subscribe(listener);

    listeners.notify();
    expect(selfUnsubscribing).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();

    listeners.notify();
    expect(selfUnsubscribing).toHaveBeenCalledOnce(); // still once, was removed
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
