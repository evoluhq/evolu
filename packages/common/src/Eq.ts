import { JsonArray, JsonObject, JsonValue, JsonValueInput } from "./Type.js";
import { Order } from "./Order.js";

/**
 * Compares two values of the same type `A` for equality.
 *
 * Equality functions start with an 'eq' prefix, e.g., `eqString`.
 *
 * TODO: Explain, examples (composition etc.)
 */
export type Eq<in A> = (x: A, y: A) => boolean;

export const eqStrict = <A>(x: A, y: A): boolean => x === y;

export const eqString: Eq<string> = eqStrict;
export const eqNumber: Eq<number> = eqStrict;
export const eqBigInt: Eq<bigint> = eqStrict;
export const eqBoolean: Eq<boolean> = eqStrict;
export const eqUndefined: Eq<undefined> = eqStrict;
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
export const eqArrayNumber = createEqArrayLike(eqNumber);

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
 * - Handles circular references with a WeakMap to prevent infinite loops.
 * - Unlike JSON.stringify, this function directly compares values, avoiding
 *   serialization overhead and leveraging short-circuit evaluation for faster
 *   failure on mismatched structures.
 *
 * ### Example
 *
 * ```ts
 * const obj1: Json = { name: "Alice", hobbies: ["reading", "hiking"] };
 * const obj2: Json = { name: "Alice", hobbies: ["reading", "hiking"] };
 * console.log(eqJson(obj1, obj2)); // true
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
 * - Handles circular references with a WeakMap to prevent infinite loops.
 * - Unlike JSON.stringify, this function directly compares values, avoiding
 *   serialization overhead and leveraging short-circuit evaluation for faster
 *   failure on mismatched structures.
 *
 * ### Example
 *
 * ```ts
 * const obj1: Json = { name: "Alice", hobbies: ["reading", "hiking"] };
 * const obj2: Json = { name: "Alice", hobbies: ["reading", "hiking"] };
 * console.log(eqJson(obj1, obj2)); // true
 * ```
 */
export const eqJsonValueInput = (
  a: JsonValueInput,
  b: JsonValueInput,
): boolean => eqJsonValue(a as JsonValue, b as JsonValue);
