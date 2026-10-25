/**
 * The device suites' Evolu test on the N-API mirror of the binding, with both
 * specs mocked, since Node.js can't load React Native: a failure in Evolu must
 * fail the test, never hang it, and report no defect, since a reported defect
 * is fatal on React Native.
 */
// Declares React Native's ErrorUtils global as src/Task.ts reads it, before
// React Native's own types, which the specs bring, declare it as a const.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers -- Includes global declarations during type-checking without emitting a runtime import.
import type {} from "../../src/ErrorUtils.d.ts";

import {
  assert,
  assertEqual,
  assertRejects,
  assertSame,
  createStore,
  createUnknownError,
  type NativeSqlite,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import type { EvoluDeps, EvoluError } from "@evolu/common/local-first";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
import { setTimeout } from "node:timers/promises";

installPolyfills();

const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-suites-"));
after(() => {
  rmSync(directory, { recursive: true, force: true });
});
const binding = (await setupAddon()).createBinding() as NativeSqlite;

mock.module(
  new URL("../../src/specs/NativeEvoluSqlite.ts", import.meta.url).href,
  { exports: { default: { createBinding: () => binding } } },
);
mock.module(
  new URL("../../src/specs/NativeEvoluApp.ts", import.meta.url).href,
  {
    exports: {
      default: {
        getDatabaseDirectory: () => directory,
        reloadApp: () => undefined,
      },
    },
  },
);

const { createEvoluDeps } = await import("../../src/createEvoluDeps.ts");
const { registerDeviceSuites } = await import("../device/suites.ts");

/** Runs the device suites' Evolu test with `createDeps`. */
const setupEvoluTest = (createDeps: () => EvoluDeps): Promise<void> => {
  const tests = new Map<string, () => void | Promise<void>>();
  registerDeviceSuites({
    platform: "ios",
    nativeSqlite: binding,
    databaseDirectory: directory,
    directory,
    test: (name, fn) => tests.set(name, fn),
    assertEqual,
    createEvoluDeps: createDeps,
  });
  const fn = tests.get(
    "Evolu, created by createEvoluDeps with a transport, stores and queries a row",
  );
  assert(fn != null, "The suites register the Evolu test.");
  return Promise.resolve(fn());
};

test("rejects with a failing Evolu's defect, and reports none", async () => {
  const defect = new Error("No lock.");

  await assertRejects(
    setupEvoluTest(() => ({
      ...createEvoluDeps(),
      lockManager: {
        request: () => {
          throw defect;
        },
      } as unknown as EvoluDeps["lockManager"],
    })),
    (error) => {
      assertSame(
        (error as { readonly reason?: { readonly defect?: unknown } }).reason
          ?.defect,
        defect,
      );
    },
  );
  // A reported defect would throw after a microtask.
  await setTimeout(10);
});

test("rejects at once when evoluError holds what JSON can't encode", async () => {
  await assertRejects(
    setupEvoluTest(() => {
      const evoluError = createStore<EvoluError | null>(null);
      globalThis.setTimeout(() => {
        evoluError.set(createUnknownError({ rowid: 1n }));
      }, 0);
      return { ...createEvoluDeps(), evoluError };
    }),
    (error) => {
      assertEqual(
        (error as Error).message,
        'evoluError: {"type":"UnknownError","error":{"rowid":"1n"}}',
      );
    },
  );
});
