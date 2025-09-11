import { expect, test } from "vitest";
import { createCallbackRegistry } from "../src/CallbackRegistry.js";
import { testNanoIdLibDep } from "./_deps.js";

test("CallbackRegistry with no argument", () => {
  const registry = createCallbackRegistry(testNanoIdLibDep);

  let called = false;
  const id = registry.register(() => {
    called = true;
  });

  registry.execute(id);
  expect(called).toBe(true);

  called = false;
  registry.execute(id);
  expect(called).toBe(false);
});

test("CallbackRegistry with string type", () => {
  const registry = createCallbackRegistry<string>(testNanoIdLibDep);

  let receivedValue: string | null = null;
  const id = registry.register((value) => {
    receivedValue = value;
  });

  registry.execute(id, "test value");
  expect(receivedValue).toBe("test value");

  receivedValue = null;
  registry.execute(id, "should not execute");
  expect(receivedValue).toBe(null);
});

test("CallbackRegistry with Promise.withResolvers pattern", () => {
  const registry = createCallbackRegistry<string>(testNanoIdLibDep);

  const { promise, resolve } = Promise.withResolvers<string>();
  const id = registry.register(resolve);

  registry.execute(id, "resolved value");

  return expect(promise).resolves.toBe("resolved value");
});
