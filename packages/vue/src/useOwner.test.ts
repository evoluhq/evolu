import { assertEqual } from "@evolu/common";
import {
  createOwnerWebSocketTransport,
  testAppOwner,
  type Evolu,
} from "@evolu/common/local-first";
import { test } from "node:test";
import { createApp, effectScope, type EffectScope } from "vue";
import { EvoluContext } from "./provideEvolu.ts";
import { useOwner } from "./useOwner.ts";

/**
 * Runs composables in an effect scope of an app providing an Evolu stub that
 * records each owner registration and its release.
 */
const setupUseOwner = () => {
  const calls: Array<string> = [];
  // Only useOwner is used by the composable.
  const evolu = {
    useOwner: () => {
      calls.push("use");
      return () => {
        calls.push("unuse");
      };
    },
  } as Pick<Evolu, "useOwner"> as Evolu;
  const app = createApp({});
  app.provide(EvoluContext, evolu);

  const runInScope = (fn: () => void): EffectScope => {
    const scope = effectScope();
    app.runWithContext(() => scope.run(fn));
    return scope;
  };

  return { calls, runInScope };
};

const transports = [
  createOwnerWebSocketTransport({
    url: "wss://relay.example",
    ownerId: testAppOwner.id,
  }),
] as const;

test("releases the owner when its scope is disposed", () => {
  const { calls, runInScope } = setupUseOwner();

  const scope = runInScope(() => {
    useOwner(testAppOwner, transports);
  });
  assertEqual(calls, ["use"]);

  scope.stop();
  assertEqual(calls, ["use", "unuse"]);
});

test("uses no owner when it is null", () => {
  const { calls, runInScope } = setupUseOwner();

  const scope = runInScope(() => {
    useOwner(null, transports);
  });
  scope.stop();
  assertEqual(calls, []);
});
