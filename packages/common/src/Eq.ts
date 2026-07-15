/**
 * Equality comparison functions and utilities.
 *
 * @module
 */

import type { Order } from "./Order.js";
import type {
  JsonArray,
  JsonObject,
  JsonValue,
  JsonValueInput,
} from "./Type.js";

/**
 * Compares two values of the same type `A` for equality.
 *
 * Equality functions start with an 'eq' prefix, e.g., `eqString`.
 *
 * An `Eq` must define an equivalence relation over its intended domain:
 *
 * - **Reflexive**: `eq(a, a)` is `true`.
 * - **Symmetric**: `eq(a, b)` equals `eq(b, a)`.
 * - **Transitive**: if `eq(a, b)` and `eq(b, c)` are `true`, then `eq(a, c)` is
 *   `true`.
 *
 * Use {@link eqFromOrder} to derive equality from an {@link Order}.
 *
 * ### Example
 *
 * ```ts
 * const eqPoint = createEqObject({ x: eqNumber, y: eqNumber });
 * eqPoint({ x: 1, y: 2 }, { x: 1, y: 2 }); // true
 * eqPoint({ x: 1, y: 2 }, { x: 2, y: 1 }); // false
 * ```
 */
export type Eq<in A> = (x: A, y: A) => boolean;

/**
 * Compares two values with strict equality (`===`).
 *
 * Strict equality considers `NaN` unequal to itself. Use {@link eqSameValueZero}
 * when values can contain `NaN` and equality must be reflexive.
 */
export const eqStrict = <A>(x: A, y: A): boolean => x === y;

/**
 * Compares two values using SameValueZero equality.
 *
 * SameValueZero is the standard equality algorithm used by `Map`, `Set`, and
 * `Array.prototype.includes`. It behaves like strict equality except that `NaN`
 * equals itself. Both algorithms consider `0` and `-0` equal.
 *
 * ### Example
 *
 * ```ts
 * eqSameValueZero(NaN, NaN); // true
 * eqSameValueZero(0, -0); // true
 * eqSameValueZero({}, {}); // false
 * ```
 */
export const eqSameValueZero = <A>(x: A, y: A): boolean =>
  x === y || Object.is(x, y);

/** An {@link Eq} for strings using strict equality. */
export const eqString: Eq<string> = eqStrict;

/** An {@link Eq} for numbers using {@link eqSameValueZero}. */
export const eqNumber: Eq<number> = eqSameValueZero;

/** An {@link Eq} for bigints using strict equality. */
export const eqBigInt: Eq<bigint> = eqStrict;

/** An {@link Eq} for booleans using strict equality. */
export const eqBoolean: Eq<boolean> = eqStrict;

/** An {@link Eq} for `undefined`. */
export const eqUndefined: Eq<undefined> = eqStrict;

/** An {@link Eq} for `null`. */
export const eqNull: Eq<null> = eqStrict;

/** Derives an {@link Eq} from an {@link Order}. */
export const eqFromOrder =
  <A>(order: Order<A>): Eq<A> =>
  (x, y) =>
    order(x, y) === 0;

/**
 * Creates an equivalence function for array-like structures based on an
 * equivalence for their elements.
 *
 * ### Example
 *
 * ```ts
 * const eqArrayNumber = createEqArrayLike(eqNumber);
 * eqArrayNumber([1, 2, 3], [1, 2, 3]); // true (works with regular arrays)
 * eqArrayNumber(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])); // true (works with Uint8Array)
 * eqArrayNumber([1, 2, 3], [1, 2, 4]); // false
 * ```
 */
export const createEqArrayLike =
  <A>(item: Eq<A>): Eq<ArrayLike<A>> =>
  (x, y) => {
    if (x === y) return true;
    if (x.length !== y.length) return false;

    for (let i = 0; i < x.length; i++) {
      if (!item(x[i], y[i])) return false;
    }

    return true;
  };

/**
 * Compares two array-like structures by strict reference equality (`===`).
 *
 * Useful for structural sharing checks where elements are compared by identity.
 *
 * ### Example
 *
 * ```ts
 * const a = { x: 1 };
 * const b = { x: 1 };
 * eqArrayStrict([a, a], [a, a]); // true (same references)
 * eqArrayStrict([a], [b]); // false (different references, even if equal values)
 * ```
 */
export const eqArrayStrict = /*#__PURE__*/ createEqArrayLike(eqStrict);

/**
 * Compares two array-like structures of numbers for equality.
 *
 * ### Example
 *
 * ```ts
 * eqArrayNumber([1, 2, 3], [1, 2, 3]); // true (works with regular arrays)
 * eqArrayNumber(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])); // true (works with Uint8Array)
 * eqArrayNumber([1, 2, 3], [1, 2, 4]); // false
 * ```
 */
export const eqArrayNumber = /*#__PURE__*/ createEqArrayLike(eqNumber);

/**
 * Creates an equivalence function for objects based on an equivalence for their
 * fields.
 *
 * ### Example
 *
 * ```ts
 * const eqObjectNumber = createEqObject({ a: eqNumber });
 * eqObjectNumber({ a: 1 }, { a: 1 }); // true
 * eqObjectNumber({ a: 1 }, { a: 2 }); // false
 * ```
 */
export const createEqObject =
  <A>(eqs: { [K in keyof A]: Eq<A[K]> }): Eq<{
    readonly [K in keyof A]: A[K];
  }> =>
  (x, y) => {
    if (x === y) return true;
    for (const key in eqs) {
      if (!eqs[key](x[key], y[key])) {
        return false;
      }
    }
    return true;
  };

/**
 * Deeply compares two {@link JsonValue} values for equality.
 *
 * - Uses an iterative approach with a stack to handle large or deeply nested
 *   objects without risking stack overflow.
 * - Defensively handles circular references in runtime values without looping,
 *   although cyclic values are not valid JSON.
 * - Unlike JSON.stringify, this function directly compares values, avoiding
 *   serialization overhead and leveraging short-circuit evaluation for faster
 *   failure on mismatched structures.
 *
 * ### Example
 *
 * ```ts
 * const obj1: JsonValue = {
 *   name: "Alice",
 *   hobbies: ["reading", "hiking"],
 * };
 * const obj2: JsonValue = {
 *   name: "Alice",
 *   hobbies: ["reading", "hiking"],
 * };
 * console.log(eqJsonValue(obj1, obj2)); // true
 * ```
 */
export const eqJsonValue = (a: JsonValue, b: JsonValue): boolean => {
  const stack: Array<[JsonValue, JsonValue]> = [[a, b]];

  const seen = new WeakMap<object, WeakSet<object>>();

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;

    if (x === y) continue;

    const typeX = typeof x;
    const typeY = typeof y;

    if (typeX !== typeY || x === null || y === null) return false;

    if (typeX === "number" && isNaN(x as number) && isNaN(y as number)) {
      continue;
    }

    if (typeX === "object") {
      const isArrayX = Array.isArray(x);
      const isArrayY = Array.isArray(y);

      if (isArrayX !== isArrayY) return false;

      const xObj = x as object;
      const yObj = y as object;

      if (seen.has(xObj)) {
        const ySet = seen.get(xObj)!;
        if (ySet.has(yObj)) {
          continue;
        }
        ySet.add(yObj);
      } else {
        const ySet = new WeakSet<object>();
        ySet.add(yObj);
        seen.set(xObj, ySet);
      }

      if (isArrayX && isArrayY) {
        const xArr = x as JsonArray;
        const yArr = y as JsonArray;

        if (xArr.length !== yArr.length) return false;
        for (let i = 0; i < xArr.length; i++) {
          stack.push([xArr[i], yArr[i]]);
        }
      } else {
        const xObjTyped = x as JsonObject;
        const yObjTyped = y as JsonObject;

        const xKeys = Object.keys(xObjTyped);
        const yKeys = Object.keys(yObjTyped);

        if (xKeys.length !== yKeys.length) return false;

        const yKeySet = new Set(yKeys);

        for (const key of xKeys) {
          if (!yKeySet.has(key)) return false;
          stack.push([xObjTyped[key], yObjTyped[key]]);
        }
      }
    } else {
      return false;
    }
  }

  return true;
};

/**
 * Deeply compares two {@link JsonValueInput} values for equality.
 *
 * - Uses an iterative approach with a stack to handle large or deeply nested
 *   objects without risking stack overflow.
 * - Defensively handles circular references in runtime values without looping,
 *   although cyclic values are not valid JSON.
 * - Unlike JSON.stringify, this function directly compares values, avoiding
 *   serialization overhead and leveraging short-circuit evaluation for faster
 *   failure on mismatched structures.
 *
 * ### Example
 *
 * ```ts
 * const obj1: JsonValueInput = {
 *   name: "Alice",
 *   hobbies: ["reading", "hiking"],
 * };
 * const obj2: JsonValueInput = {
 *   name: "Alice",
 *   hobbies: ["reading", "hiking"],
 * };
 * console.log(eqJsonValueInput(obj1, obj2)); // true
 * ```
 */
export const eqJsonValueInput = (
  a: JsonValueInput,
  b: JsonValueInput,
): boolean => eqJsonValue(a as JsonValue, b as JsonValue);
