/**
 * Sensitive value protection against accidental exposure.
 *
 * @module
 */

import { assert } from "./Assert.ts";
import type { Brand } from "./Brand.ts";

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
 * Redacted guards against accidental exposure, such as logs, error reports, and
 * serialized payloads. It does not hide the value from a debugger: DevTools and
 * heap snapshots can still reach it.
 *
 * A structured clone, such as a `postMessage` to a worker, does not copy the
 * hidden value and arrives as an empty object. Reveal the value before posting
 * it, and wrap it again on arrival if the receiver passes it to app code.
 *
 * Implements `Disposable`, so the `using` syntax detaches the value when the
 * scope ends. Disposal does not overwrite the value or release other references
 * to it.
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
 * // Leaving the `using` scope detaches the value, so revealing it throws.
 * assertErr(trySync(() => revealRedacted(disposedKey)));
 * ```
 */
export interface Redacted<A> extends Brand<"Redacted">, Disposable {
  /**
   * The inner type. This is a type-only phantom property. Use it through
   * `typeof redacted.Type`; it does not exist at runtime.
   */
  readonly Type: A;
  readonly toString: () => "<redacted>";
  readonly toJSON: () => "<redacted>";
}

/** Creates a {@link Redacted} wrapper for a sensitive value. */
export const createRedacted = <A>(value: A): Redacted<A> => {
  // Symbol.dispose is read here rather than in proto because installPolyfills
  // runs after imported modules are evaluated. An arrow function also keeps a
  // detached dispose method working.
  const redacted = Object.create(proto, {
    [Symbol.dispose]: {
      value: () => {
        registry.delete(redacted);
      },
    },
  }) as Redacted<A>;
  registry.set(redacted, value);
  return redacted;
};

const proto = {
  toString: () => redactedString,
  toJSON: () => redactedString,
  [Symbol.for("nodejs.util.inspect.custom")]: () => redactedString,
};
const redactedString = "<redacted>";

// The value lives in a WeakMap, so it is never a property: previews,
// enumeration, and serialization cannot show it, and it is garbage collected
// with the wrapper. A private field would show when DevTools expands the
// object. The wrapper is an object, not a symbol, because a symbol cannot
// customize toString or toJSON. DevTools can still reach the registry through
// the scopes of the wrapper's functions.
const registry = new WeakMap<Redacted<unknown>, unknown>();

/**
 * Reveals the original value from a {@link Redacted} wrapper.
 *
 * This is a separate function rather than a method on {@link Redacted} to make
 * access visually explicit and easy to grep in code reviews. Accessing
 * sensitive values should feel intentional, not convenient.
 *
 * Throws when the wrapper was disposed or is a structured clone.
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
