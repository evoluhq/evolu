import { test } from "node:test";
import { assertEqual, assertFalse, assertSame, assertTrue } from "./Assert.ts";

import { createCallbacks } from "./Callbacks.ts";
import { testCreateDeps } from "./Task.ts";

test("Callbacks with no argument", () => {
  const deps = testCreateDeps();
  const callbacks = createCallbacks(deps);

  let called = false;
  const id = callbacks.register(() => {
    called = true;
  });

  callbacks.execute(id);
  assertTrue(called);

  called = false;
  callbacks.execute(id);
  assertFalse(called);
});

test("Callbacks with string type", () => {
  const deps = testCreateDeps();
  const callbacks = createCallbacks<string>(deps);

  let receivedValue: string | null = null;
  const id = callbacks.register((value) => {
    receivedValue = value;
  });

  callbacks.execute(id, "test value");
  assertEqual(receivedValue, "test value");

  receivedValue = null;
  callbacks.execute(id, "should not execute");
  assertSame(receivedValue, null);
});

test("Callbacks with Promise.withResolvers pattern", async () => {
  const deps = testCreateDeps();
  const callbacks = createCallbacks<string>(deps);

  const { promise, resolve } = Promise.withResolvers<string>();
  const id = callbacks.register(resolve);

  callbacks.execute(id, "resolved value");

  assertEqual(await promise, "resolved value");
});

test("Callbacks dispose clears pending callbacks", () => {
  const deps = testCreateDeps();
  const callbacks = createCallbacks<string>(deps);

  let called = false;
  const id = callbacks.register(() => {
    called = true;
  });

  callbacks[Symbol.dispose]();
  callbacks.execute(id, "ignored");

  assertFalse(called);
});
