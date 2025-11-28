import { assert } from "./Assert.js";
import type { Brand } from "./Brand.js";
import type { Eq } from "./Eq.js";

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
 * // Define branded types for your secrets
 * type ApiKey = string & Brand<"ApiKey">;
 * type DbPassword = string & Brand<"DbPassword">;
 *
 * // Wrap them with Redacted for safe passing
 * type RedactedApiKey = Redacted<ApiKey>;
 * type RedactedDbPassword = Redacted<DbPassword>;
 *
 * // Create a redacted secret
 * const apiKey: ApiKey = "secret-123" as ApiKey;
 * const redactedKey: RedactedApiKey = createRedacted(apiKey);
 *
 * console.log(redactedKey); // <redacted>
 * console.log(revealRedacted(redactedKey)); // secret-123
 *
 * // Type safety: RedactedApiKey ≠ RedactedDbPassword
 * const fetchUser = (key: RedactedApiKey) => {
 *   const value: ApiKey = revealRedacted(key);
 *   // use value...
 * };
 *
 * fetchUser(redactedKey); // ✅
 * // fetchUser(createRedacted("x" as DbPassword)); // ❌ type error
 *
 * // Automatic cleanup with `using`
 * {
 *   using secret = createRedacted("sensitive" as ApiKey);
 *   // ... use secret ...
 * } // automatically wiped from memory
 * ```
 *
 * @experimental
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
 * type ApiKey = string & Brand<"ApiKey">;
 * const eqRedactedApiKey = createEqRedacted<ApiKey>(eqString);
 *
 * const a = createRedacted("x" as ApiKey);
 * const b = createRedacted("x" as ApiKey);
 * eqRedactedApiKey(a, b); // true
 * ```
 */
export const createEqRedacted =
  <A>(eq: Eq<A>): Eq<Redacted<A>> =>
  (x, y) =>
    eq(revealRedacted(x), revealRedacted(y));
