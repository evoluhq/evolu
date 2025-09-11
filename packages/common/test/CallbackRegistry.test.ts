import { expect, test } from "vitest";
import { createCallbackRegistry } from "../src/CallbackRegistry.js";
import { testNanoIdLibDep } from "./_deps.js";

test("CallbackRegistry", () => {
  const registry = createCallbackRegistry(testNanoIdLibDep);

  let called = false;
  const id = registry.register(() => {
    called = true;
  });

  expect(id).toBeDefined();
  registry.execute(id);
  expect(called).toBe(true);

  called = false;
  registry.execute(id);
  expect(called).toBe(false);
});
