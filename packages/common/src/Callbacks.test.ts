import { test } from "node:test";
import { assertEqual, assertFalse, assertSame, assertTrue } from "./Assert.ts";

import { createCallbacks } from "./Callbacks.ts";
import { err, ok, type Result } from "./Result.ts";
import { testCreateDeps } from "./Task.ts";
import { createId } from "./Type.ts";

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

test("Callbacks with a union type", () => {
  const deps = testCreateDeps();
  const callbacks = createCallbacks<Result<void, string>>(deps);

  const received: Array<Result<void, string>> = [];
  const okId = callbacks.register((result) => {
    received.push(result);
  });
  const errId = callbacks.register((result) => {
    received.push(result);
  });

  callbacks.execute(okId, ok());
  callbacks.execute(errId, err("failed"));
  assertEqual(received, [ok(), err("failed")]);
});

test("Callbacks of never or any require an argument", () => {
  const deps = testCreateDeps();
  using neverCallbacks = createCallbacks<never>(deps);
  using anyCallbacks = createCallbacks<any>(deps);
  // No callback is registered under it, so nothing runs.
  const id = createId(deps);

  // @ts-expect-error execute of Callbacks<never> requires an argument.
  neverCallbacks.execute(id);
  // @ts-expect-error execute of Callbacks<any> requires an argument.
  anyCallbacks.execute(id);
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

test("Callbacks unregister removes a callback without executing it", () => {
  const deps = testCreateDeps();
  const callbacks = createCallbacks(deps);

  let calls = 0;
  const unregisteredId = callbacks.register(() => {
    calls++;
  });
  const keptId = callbacks.register(() => {
    calls += 10;
  });

  callbacks.unregister(unregisteredId);
  callbacks.execute(unregisteredId);
  assertSame(calls, 0);

  callbacks.execute(keptId);
  assertSame(calls, 10);
});
