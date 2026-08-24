/**
 * Cross-module test utilities for deterministic testing.
 *
 * Test helpers are usually colocated with the code they test. Helpers that
 * cannot be colocated because they would create dependency cycles belong here.
 *
 * @module
 */

import type { Brand } from "./Brand.ts";
import { testCreateRandomBytes } from "./Crypto.ts";
import { testCreateRandomLib } from "./Random.ts";
import { createId, type Id } from "./Type.ts";

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
 * assertType<Id & Brand<"Todo">, typeof todoId>();
 * ```
 */
export const testCreateId = (): TestCreateId => {
  const randomBytes = testCreateRandomBytes({
    randomLib: testCreateRandomLib(),
  });

  // oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- Explicit never resolves createId's conditional brand-validation rest parameter; inference rejects the argument without it.
  return (() => createId<never>({ randomBytes })) as TestCreateId;
};
