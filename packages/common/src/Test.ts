/**
 * Cross-module test utilities for deterministic testing.
 *
 * Test helpers are usually colocated with the code they test. General helpers
 * shared across unrelated modules, or helpers whose colocation would create
 * dependency cycles, belong here.
 *
 * @module
 */

import type { Brand } from "./Brand.ts";
import { testCreateRandomBytes } from "./Crypto.ts";
import { testCreateRandomLib } from "./Random.ts";
import { createId, type Id } from "./Type.ts";

/**
 * Temporarily replaces a global property for a test scope.
 *
 * Node.js can mock existing globals with `t.mock.property`, but it rejects a
 * property that does not exist. That catches misspelled mock targets, but it
 * cannot model optional platform globals whose presence varies. Use this helper
 * to provide such a global, for example `scheduler`, or replace a global with
 * `undefined` to exercise a fallback.
 *
 * The original property descriptor is restored on disposal. A property that did
 * not exist is deleted. Prefer dependency injection when available because
 * global properties are shared by concurrently running tests.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, assertFalse, testStubGlobal } from "@evolu/common";
 *
 * const key = Symbol("test global");
 * {
 *   using _stub = testStubGlobal(key, 42);
 *   assertEqual(Reflect.get(globalThis, key), 42);
 * }
 * assertFalse(Reflect.has(globalThis, key));
 * ```
 */
export const testStubGlobal = (
  key: PropertyKey,
  value: unknown,
): Disposable => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });

  const disposer = new DisposableStack();
  disposer.defer(() => {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
    else Object.defineProperty(globalThis, key, descriptor);
  });
  return disposer;
};

export type TestCreateId = <B extends string = never>() => [B] extends [never]
  ? Id
  : Id & Brand<B>;

/**
 * Creates a deterministic `createId` helper.
 *
 * The returned function mirrors {@link createId}, but uses stable test entropy
 * so each call yields the next deterministic pseudo-random id.
 *
 * Create one helper per test, or per reusable test setup helper such as
 * `setupFoo`, so deterministic ids stay local to that setup.
 *
 * Avoid sharing one helper across a whole test file. Adding an extra `createId`
 * call in one test would shift ids used by unrelated tests later in the file.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   testCreateId,
 *   type Brand,
 *   type Id,
 * } from "@evolu/common";
 *
 * const createId = testCreateId();
 *
 * const callbackId = createId();
 * const secondCallbackId = createId();
 * const todoId = createId<"Todo">();
 * assertEqual(new Set([callbackId, secondCallbackId, todoId]).size, 3);
 *
 * const replayCreateId = testCreateId();
 * assertEqual(replayCreateId(), callbackId);
 * assertType<typeof todoId, Id & Brand<"Todo">>();
 * ```
 */
export const testCreateId = (): TestCreateId => {
  const randomBytes = testCreateRandomBytes({
    randomLib: testCreateRandomLib(),
  });

  // oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- Explicit never resolves createId's conditional brand-validation rest parameter; inference rejects the argument without it.
  return (() => createId<never>({ randomBytes })) as TestCreateId;
};
