import { expect, test } from "vitest";
import { createCallbacks } from "../src/Callbacks.js";
import { testNanoIdLibDep } from "./_deps.js";

test("Callbacks", () => {
  const callbacks = createCallbacks(testNanoIdLibDep);

  let called = false;
  const id = callbacks.register(() => {
    called = true;
  });
  expect(id).toBeDefined();
  callbacks.execute(id);
  expect(called).toBe(true);

  called = false;
  callbacks.execute(id);
  expect(called).toBe(false);
});
