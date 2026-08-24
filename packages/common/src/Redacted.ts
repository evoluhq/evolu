/**
 * Sensitive value protection against accidental exposure.
 *
 * @module
 */

import { assert } from "./Assert.ts";
import type { Brand } from "./Brand.ts";
import type { Eq } from "./Eq.ts";

/**
 * A wrapper type that prevents sensitive values from being accidentally exposed
 * through logging, serialization, or inspection.
 *
 * The wrapped value is hidden and can only be accessed explicitly via
 * {@link revealRedacted}. All standard methods (`toString`, `toJSON`, and
 * Node.js inspect) return `<redacted>`.
 *
 * For type-level distinction between different secrets, use branded types.
 *
 * The actual value lives in a `WeakMap`, so it never appears as a property and
 * is automatically garbage collected when the wrapper is dropped. This is
 * better than a class with a private field because private fields are still
 * visible in devtools. Symbols can't be used because they don't support custom
 * `toString`.
 *
 * Implements `Disposable` for automatic cleanup via the `using` syntax.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertErr,
 *   assertEqual,
 *   createRedacted,
 *   revealRedacted,
 *   trySync,
 *   type Brand,
 *   type Redacted,
 * } from "@evolu/common";
 *
 * type ApiKey = string & Brand<"ApiKey">;
 * type DbPassword = string & Brand<"DbPassword">;
 * type RedactedApiKey = Redacted<ApiKey>;
 *
 * // Apply brands only after validation or at another trusted boundary.
 * const apiKey: ApiKey = "secret-123" as ApiKey;
 * using redactedKey: RedactedApiKey = createRedacted(apiKey);
 * const fetchUser = (key: RedactedApiKey): ApiKey => revealRedacted(key);
 *
 * assertEqual(redactedKey.toString(), "<redacted>");
 * assertEqual(
 *   JSON.stringify({ apiKey: redactedKey }),
 *   '{"apiKey":"<redacted>"}',
 * );
 * assertEqual(fetchUser(redactedKey), apiKey);
 *
 * using password = createRedacted("password" as DbPassword);
 * // @ts-expect-error Redacted secrets retain their distinct branded types.
 * fetchUser(password);
 *
 * const disposedKey = (() => {
 *   using key = createRedacted(apiKey);
 *   return key;
 * })();
 * // Leaving the `using` scope removes the value from memory.
 * assertErr(trySync(() => revealRedacted(disposedKey)));
 * ```
 */
export interface Redacted<A> extends Brand<"Redacted">, Disposable {
  /** The inner type. Useful for inference via `typeof redacted.Type`. */
  readonly Type: A;
}

/** Creates a {@link Redacted} wrapper for a sensitive value. */
export const createRedacted = <A>(value: A): Redacted<A> => {
  const redacted = Object.create(proto) as Redacted<A>;
  registry.set(redacted, value);
  return redacted;
};

const proto = {
  toString: () => redactedString,
  toJSON: () => redactedString,
  [Symbol.for("nodejs.util.inspect.custom")]: () => redactedString,
  [Symbol.dispose](this: Redacted<unknown>) {
    registry.delete(this);
  },
};
const redactedString = "<redacted>";
const registry = new WeakMap<Redacted<unknown>, unknown>();

/**
 * Reveals the original value from a {@link Redacted} wrapper.
 *
 * This is a separate function rather than a method on {@link Redacted} to make
 * access visually explicit and easy to grep in code reviews. Accessing
 * sensitive values should feel intentional, not convenient.
 */
export const revealRedacted = <A>(redacted: Redacted<A>): A => {
  assert(registry.has(redacted), "Redacted value was not in registry");
  return registry.get(redacted) as A;
};

/** Checks if a value is a {@link Redacted} wrapper. */
export const isRedacted = (value: unknown): value is Redacted<unknown> =>
  typeof value === "object" &&
  value !== null &&
  Object.getPrototypeOf(value) === proto;

/**
 * Creates an {@link Eq} for {@link Redacted} values based on an equality function
 * for the underlying type.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertFalse,
 *   assertTrue,
 *   createEqRedacted,
 *   createRedacted,
 *   eqString,
 *   type Brand,
 * } from "@evolu/common";
 *
 * type ApiKey = string & Brand<"ApiKey">;
 * const eqRedactedApiKey = createEqRedacted<ApiKey>(eqString);
 *
 * // Apply brands only after validation or at another trusted boundary.
 * using a = createRedacted("x" as ApiKey);
 * using b = createRedacted("x" as ApiKey);
 * using c = createRedacted("y" as ApiKey);
 *
 * assertTrue(eqRedactedApiKey(a, b));
 * assertFalse(eqRedactedApiKey(a, c));
 * ```
 */
export const createEqRedacted =
  <A>(eq: Eq<A>): Eq<Redacted<A>> =>
  (x, y) =>
    eq(revealRedacted(x), revealRedacted(y));
