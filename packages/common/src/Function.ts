/**
 * Function utilities including exhaustive checks and composition.
 *
 * @module
 */

import { assertNotDisposed } from "./Assert.ts";
import { isFunction } from "./Object.ts";
import type { Writable } from "./Types.ts";

/**
 * Helper function to ensure exhaustive matching in a switch statement. Throws
 * an error if an unhandled case is encountered.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, exhaustiveCheck } from "@evolu/common";
 *
 * type Color = "red" | "green" | "blue";
 * const handled: Array<string> = [];
 *
 * const handleColor = (color: Color): void => {
 *   switch (color) {
 *     case "red":
 *       handled.push("Handling red");
 *       break;
 *     case "green":
 *       handled.push("Handling green");
 *       break;
 *     case "blue":
 *       handled.push("Handling blue");
 *       break;
 *     default:
 *       exhaustiveCheck(color);
 *   }
 * };
 *
 * handleColor("blue");
 * assertEqual(handled, ["Handling blue"]);
 * ```
 *
 * Use this primarily in side-effect switches (`void` branches). For
 * value-producing switches, TypeScript can enforce exhaustiveness without a
 * `default` branch in either of the following styles.
 *
 * ### Return from every case
 *
 * ```ts
 * import { assertEqual } from "@evolu/common";
 *
 * type Color = "red" | "green" | "blue";
 *
 * const colorToHex = (color: Color): string => {
 *   switch (color) {
 *     case "red":
 *       return "#ff0000";
 *     case "green":
 *       return "#00ff00";
 *     case "blue":
 *       return "#0000ff";
 *   }
 * };
 *
 * assertEqual(colorToHex("green"), "#00ff00");
 * ```
 *
 * ### Assign in every case
 *
 * ```ts
 * import { assertEqual } from "@evolu/common";
 *
 * type Input =
 *   | { readonly type: "Mutate" }
 *   | { readonly type: "Query" }
 *   | { readonly type: "Export" };
 *
 * const inputToKind = (input: Input): "A" | "B" | "C" => {
 *   let result: "A" | "B" | "C";
 *
 *   switch (input.type) {
 *     case "Mutate":
 *       result = "A";
 *       break;
 *     case "Query":
 *       result = "B";
 *       break;
 *     case "Export":
 *       result = "C";
 *       break;
 *   }
 *
 *   return result;
 * };
 *
 * assertEqual(inputToKind({ type: "Query" }), "B");
 * ```
 */
export const exhaustiveCheck = (value: never): never => {
  throw new Error(`exhaustiveCheck unhandled case: ${JSON.stringify(value)}`);
};

/**
 * Returns the value unchanged.
 *
 * Useful as a default transformation, placeholder callback, or when a function
 * is required but no transformation is needed.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, assertSame, identity } from "@evolu/common";
 *
 * const values = [1, 2, 3];
 * const object = { value: 1 };
 * const getTransform = (shouldDouble: boolean) =>
 *   shouldDouble ? (value: number) => value * 2 : identity;
 *
 * assertEqual(values.map(identity), [1, 2, 3]);
 * assertSame(identity(object), object);
 * assertEqual(getTransform(false)(2), 2);
 * ```
 */
export const identity = <A>(a: A): A => a;

/**
 * Creates an object that follows JavaScript disposal semantics.
 *
 * The first argument is the object to make disposable. The returned object gets
 * a disposal method and its functions are wrapped with a disposal guard. This
 * is the JavaScript equivalent of .NET `ObjectDisposedException`: once an
 * object has been disposed, calling its methods is a programmer error and
 * should throw immediately instead of continuing with invalid state. Evolu
 * asserts this invariant with the "Cannot use a disposed object." message.
 *
 * The second argument is an optional disposer. When provided, it is
 * [moved](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DisposableStack/move)
 * into the returned object, and the returned object's disposal method disposes
 * it. Omit it when the object has no cleanup resources but still must become
 * unusable after disposal, such as with reference count helpers where disposal
 * enforces correct ownership tracking.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertInstanceOf,
 *   assertTrue,
 *   disposable,
 *   trySync,
 * } from "@evolu/common";
 *
 * let cleaned = false;
 * const createResource = () => {
 *   using disposer = new DisposableStack();
 *   disposer.defer(() => {
 *     cleaned = true;
 *   });
 *   return disposable({ read: () => "ready" }, disposer);
 * };
 *
 * const resource = createResource();
 * assertEqual(resource.read(), "ready");
 * resource[Symbol.dispose]();
 *
 * assertTrue(cleaned);
 * const result = trySync(() => resource.read());
 * assertErr(result);
 * assertInstanceOf(result.error, Error);
 * assertEqual(result.error.message, "Cannot use a disposed object.");
 * ```
 */
export function disposable<T extends object>(
  value: T extends Disposable ? Omit<T, typeof Symbol.dispose> : T,
  disposer?: DisposableStack,
): T extends Disposable ? T : T & Disposable;

/** Creates an asynchronously disposable object. */
export function disposable<T extends object>(
  value: T extends AsyncDisposable ? Omit<T, typeof Symbol.asyncDispose> : T,
  disposer: AsyncDisposableStack,
): T extends AsyncDisposable ? T : T & AsyncDisposable;
export function disposable<T extends object>(
  value: T,
  disposer: DisposableStack | AsyncDisposableStack | null = null,
): T & (Disposable | AsyncDisposable) {
  const mutableValue = value as Writable<Record<string, unknown>>;
  const ownedDisposer = disposer?.move() ?? new DisposableStack();

  for (const [key, property] of Object.entries(value)) {
    if (!isFunction(property)) continue;

    mutableValue[key] = (...args: Array<unknown>): unknown => {
      assertNotDisposed(ownedDisposer);
      return (property as (...args: Array<unknown>) => unknown)(...args);
    };
  }

  if (ownedDisposer instanceof AsyncDisposableStack) {
    (value as T & AsyncDisposable)[Symbol.asyncDispose] = () =>
      ownedDisposer.disposeAsync();
  } else {
    (value as T & Disposable)[Symbol.dispose] = () => ownedDisposer.dispose();
  }

  return value as T & (Disposable | AsyncDisposable);
}

export const isDisposable = (
  value: unknown,
): value is Disposable | AsyncDisposable => {
  if (typeof value !== "object" || value === null) return false;

  return (
    isFunction((value as Partial<Disposable>)[Symbol.dispose]) ||
    isFunction((value as Partial<AsyncDisposable>)[Symbol.asyncDispose])
  );
};

/**
 * A function that takes no arguments and returns a value.
 *
 * Useful for:
 *
 * - Providing default callbacks (see {@link constVoid}, {@link constTrue}, etc.)
 * - Delaying expensive operations until actually needed
 * - Deferring side effects so the callee controls when they run
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, constVoid, type Thunk } from "@evolu/common";
 *
 * const notify = (onDone: Thunk<void> = constVoid) => onDone();
 * notify();
 *
 * let value = 0;
 * const compute: Thunk<number> = () => ++value;
 * const jobs: Array<Thunk<void>> = [];
 * const schedule = (job: Thunk<void>): void => {
 *   jobs.push(job);
 * };
 * schedule(() => {
 *   value += 10;
 * });
 *
 * const computed = compute();
 * jobs.shift()?.();
 * assertEqual(computed, 1);
 * assertEqual(value, 11);
 * ```
 */
export type Thunk<T> = () => T;

/**
 * Creates a {@link Thunk} that always returns a precomputed value.
 *
 * Use when the value is expensive to compute and you want to compute it once at
 * definition time rather than on every call.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, assertSame, constant } from "@evolu/common";
 *
 * let version = 0;
 * const readConfig = () => ({ version: ++version });
 * const getConstantConfig = constant(readConfig());
 * const getFreshConfig = () => readConfig();
 *
 * assertSame(getConstantConfig(), getConstantConfig());
 * assertEqual(getConstantConfig().version, 1);
 * assertEqual(getFreshConfig().version, 2);
 * assertEqual(getFreshConfig().version, 3);
 * ```
 */
export const constant =
  <T>(value: T): Thunk<T> =>
  () =>
    value;

/** A {@link Thunk} that returns `true`. */
export const constTrue: Thunk<true> = /*#__PURE__*/ constant(true);

/** A {@link Thunk} that returns `false`. */
export const constFalse: Thunk<false> = /*#__PURE__*/ constant(false);

/** A {@link Thunk} that returns `null`. */
export const constNull: Thunk<null> = /*#__PURE__*/ constant(null);

/** A {@link Thunk} that returns `undefined`. */
export const constUndefined: Thunk<undefined> =
  /*#__PURE__*/ constant(undefined);

/** A {@link Thunk} that returns `undefined` for void callbacks. */
export const constVoid: Thunk<void> = constUndefined;

/**
 * Development placeholder that always throws.
 *
 * Use to sketch function bodies before implementing them. TypeScript infers the
 * return type from context, so surrounding code still type-checks. Use an
 * explicit generic when there is no return type annotation.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertInstanceOf,
 *   assertType,
 *   todo,
 *   trySync,
 * } from "@evolu/common";
 *
 * interface Config {
 *   readonly theme: string;
 * }
 *
 * const getCount = (): number => todo();
 * const getConfig = () => todo<Config>();
 *
 * assertType<
 *   [ReturnType<typeof getCount>, ReturnType<typeof getConfig>],
 *   [number, Config]
 * >();
 * const result = trySync(getCount);
 * assertErr(result);
 * assertInstanceOf(result.error, Error);
 * assertEqual(result.error.message, "not yet implemented");
 * ```
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export const todo = <T>(): T => {
  throw new Error("not yet implemented");
};
