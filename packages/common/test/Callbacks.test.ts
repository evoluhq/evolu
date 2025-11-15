import { expect, test } from "vitest";
import { createCallbacks } from "../src/Callbacks.js";
import { testDeps } from "./_deps.js";

test("Callbacks with no argument", () => {
  const callbacks = createCallbacks(testDeps);

  let called = false;
  const id = callbacks.register(() => {
    called = true;
  });

  callbacks.execute(id);
  expect(called).toBe(true);

  called = false;
  callbacks.execute(id);
  expect(called).toBe(false);
});

test("Callbacks with string type", () => {
  const callbacks = createCallbacks<string>(testDeps);

  let receivedValue: string | null = null;
  const id = callbacks.register((value) => {
    receivedValue = value;
  });

  callbacks.execute(id, "test value");
  expect(receivedValue).toBe("test value");

  receivedValue = null;
  callbacks.execute(id, "should not execute");
  expect(receivedValue).toBe(null);
});

test("Callbacks with Promise.withResolvers pattern", () => {
  const callbacks = createCallbacks<string>(testDeps);

  const { promise, resolve } = Promise.withResolvers<string>();
  const id = callbacks.register(resolve);

  callbacks.execute(id, "resolved value");

  return expect(promise).resolves.toBe("resolved value");
});
