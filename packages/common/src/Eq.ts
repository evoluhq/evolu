/**
 * Equality comparison functions and utilities.
 *
 * @module
 */

import type { Order } from "./Order.ts";
import { getObjectKind } from "./Object.ts";
import type { Data, IsData } from "./Type.ts";
import type { CompileTimeError } from "./Types.ts";

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
 * Evolu does not provide `eqStrict`: JavaScript strict equality (`===`) is not
 * reflexive because `NaN === NaN` is `false`, so it cannot define an
 * `Eq<number>`. Use `===` directly when that behavior is required. See [MDN's
 * equality comparisons and sameness
 * guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness)
 * for how JavaScript's equality algorithms differ.
 *
 * Use {@link eqFromOrder} to derive equality from an {@link Order}.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertFalse,
 *   assertTrue,
 *   createEqObject,
 *   eqNumber,
 * } from "@evolu/common";
 *
 * const eqPoint = createEqObject({ x: eqNumber, y: eqNumber });
 *
 * assertTrue(eqPoint({ x: 1, y: 2 }, { x: 1, y: 2 }));
 * assertFalse(eqPoint({ x: 1, y: 2 }, { x: 2, y: 1 }));
 * ```
 */
export type Eq<in A> = (x: A, y: A) => boolean;

/**
 * Compares two values using SameValue equality (`Object.is`).
 *
 * SameValue considers `NaN` equal to itself, distinguishes `0` from `-0`, and
 * compares objects by reference identity.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertTrue, eqSameValue } from "@evolu/common";
 *
 * assertTrue(eqSameValue(NaN, NaN));
 * assertFalse(eqSameValue(0, -0));
 * ```
 */
export const eqSameValue = <A>(x: A, y: A): boolean => Object.is(x, y);

/**
 * Compares two values using SameValueZero equality.
 *
 * SameValueZero is the standard equality algorithm used by `Map`, `Set`, and
 * `Array.prototype.includes`. Like SameValue, it considers `NaN` equal to
 * itself, but unlike SameValue, it considers `0` and `-0` equal.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertTrue, eqSameValueZero } from "@evolu/common";
 *
 * assertTrue(eqSameValueZero(NaN, NaN));
 * assertTrue(eqSameValueZero(0, -0));
 * assertFalse(eqSameValueZero({}, {}));
 * ```
 */
export const eqSameValueZero = <A>(x: A, y: A): boolean =>
  x === y || Object.is(x, y);

/** An {@link Eq} for strings using {@link eqSameValue}. */
export const eqString: Eq<string> = eqSameValue;

/** An {@link Eq} for numbers using {@link eqSameValue}. */
export const eqNumber: Eq<number> = eqSameValue;

/** An {@link Eq} for bigints using {@link eqSameValue}. */
export const eqBigInt: Eq<bigint> = eqSameValue;

/** An {@link Eq} for booleans using {@link eqSameValue}. */
export const eqBoolean: Eq<boolean> = eqSameValue;

/** An {@link Eq} for `undefined`. */
export const eqUndefined: Eq<undefined> = eqSameValue;

/** An {@link Eq} for `null`. */
export const eqNull: Eq<null> = eqSameValue;

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
 * import {
 *   assertFalse,
 *   assertTrue,
 *   createEqArrayLike,
 *   eqNumber,
 * } from "@evolu/common";
 *
 * const eqArrayNumber = createEqArrayLike(eqNumber);
 *
 * assertTrue(eqArrayNumber([1, 2, 3], [1, 2, 3]));
 * assertTrue(
 *   eqArrayNumber(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])),
 * );
 * assertFalse(eqArrayNumber([1, 2, 3], [1, 2, 4]));
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
 * Compares two array-like structures element by element using
 * {@link eqSameValue}.
 *
 * Useful for structural sharing checks where objects are compared by reference
 * identity. `NaN` elements are equal, while `0` and `-0` elements differ.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertFalse,
 *   assertTrue,
 *   eqArraySameValue,
 * } from "@evolu/common";
 *
 * const a = { x: 1 };
 * const b = { x: 1 };
 * assertTrue(eqArraySameValue([a, a], [a, a]));
 * assertFalse(eqArraySameValue([a], [b]));
 * ```
 */
export const eqArraySameValue = /*#__PURE__*/ createEqArrayLike(eqSameValue);

/**
 * Compares two array-like structures of numbers for equality.
 *
 * ### Example
 *
 * ```ts
 * import { assertTrue, eqArrayNumber } from "@evolu/common";
 *
 * assertTrue(eqArrayNumber([1, NaN], [1, NaN]));
 * ```
 */
export const eqArrayNumber = /*#__PURE__*/ createEqArrayLike(eqNumber);

/**
 * Compares two Uint8Arrays by byte value.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertTrue, eqUint8Array } from "@evolu/common";
 *
 * assertTrue(eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
 * assertFalse(
 *   eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
 * );
 * ```
 */
export const eqUint8Array: Eq<Uint8Array> = eqArrayNumber;

/**
 * Creates an equivalence function for objects based on an equivalence for their
 * fields.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertFalse,
 *   assertTrue,
 *   createEqObject,
 *   eqNumber,
 * } from "@evolu/common";
 *
 * const eqObjectNumber = createEqObject({ a: eqNumber });
 *
 * assertTrue(eqObjectNumber({ a: 1 }, { a: 1 }));
 * assertFalse(eqObjectNumber({ a: 1 }, { a: 2 }));
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
 * Deeply compares two {@link Data} values using platform-independent structural
 * equality.
 *
 * Primitive values use `Object.is`. Arrays are ordered; plain Objects compare
 * their own string-keyed properties regardless of property order or prototype;
 * Sets and Maps ignore insertion order; Dates compare their time values; and
 * Uint8Arrays compare their bytes. Cyclic and shared data graphs are
 * supported.
 *
 * Arguments are restricted to Data at compile time. Use the {@link Data} Type at
 * an unknown boundary.
 *
 * ### Example
 *
 * ```ts
 * import { assertTrue, eqData } from "@evolu/common";
 *
 * interface User {
 *   readonly name: string;
 *   readonly roles: ReadonlySet<string>;
 * }
 *
 * const first: User = { name: "Ada", roles: new Set(["admin", "author"]) };
 * const second: User = {
 *   name: "Ada",
 *   roles: new Set(["author", "admin"]),
 * };
 *
 * assertTrue(eqData(first, second));
 * ```
 */
export function eqData<Actual, Expected>(
  actual: Actual,
  expected: Expected,
  ...dataError: EqDataError<Actual | Expected>
): boolean;
export function eqData(actual: Data, expected: Data): boolean {
  const pairs: Array<readonly [object, object]> = [];
  const rightsByLeft = new Map<object, Set<object>>();
  const frames: Array<EqDataFrame> = [{ kind: "Compare", actual, expected }];
  const attempts: Array<{
    readonly pairsCheckpoint: number;
    readonly frameCheckpoint: number;
    readonly retry: EqDataCollectionFrame;
  }> = [];

  while (frames.length > 0) {
    const frame = frames.pop()!;

    if (frame.kind === "Compare") {
      const x = frame.actual;
      const y = frame.expected;

      if (eqSameValue(x, y)) continue;
      if (typeof x !== typeof y) {
        frames.push({ kind: "Fail" });
        continue;
      }
      if (
        typeof x !== "object" ||
        x === null ||
        typeof y !== "object" ||
        y === null
      ) {
        frames.push({ kind: "Fail" });
        continue;
      }

      const rights = rightsByLeft.get(x);
      if (rights?.has(y)) continue;
      if (rights === undefined) {
        rightsByLeft.set(x, new Set([y]));
      } else {
        rights.add(y);
      }
      pairs.push([x, y]);

      const xKind = getObjectKind(x);
      const yKind = getObjectKind(y);
      if (xKind !== yKind) {
        frames.push({ kind: "Fail" });
        continue;
      }

      if (xKind === "Array") {
        const xArray = x as ReadonlyArray<Data>;
        const yArray = y as ReadonlyArray<Data>;
        if (
          xArray.length !== yArray.length ||
          Reflect.ownKeys(xArray).length !== xArray.length + 1 ||
          Reflect.ownKeys(yArray).length !== yArray.length + 1
        ) {
          frames.push({ kind: "Fail" });
          continue;
        }

        let valid = true;
        for (let index = 0; index < xArray.length; index++) {
          const xDescriptor = Object.getOwnPropertyDescriptor(xArray, index);
          const yDescriptor = Object.getOwnPropertyDescriptor(yArray, index);
          if (
            xDescriptor === undefined ||
            yDescriptor === undefined ||
            !("value" in xDescriptor) ||
            !("value" in yDescriptor)
          ) {
            valid = false;
            break;
          }
          frames.push({
            kind: "Compare",
            actual: xDescriptor.value as Data,
            expected: yDescriptor.value as Data,
          });
        }
        if (!valid) frames.push({ kind: "Fail" });
        continue;
      }

      switch (xKind) {
        case "Date":
          if (
            !Object.is(
              Date.prototype.getTime.call(x),
              Date.prototype.getTime.call(y),
            )
          ) {
            frames.push({ kind: "Fail" });
          }
          continue;
        case "Uint8Array":
          if (!eqUint8Array(x as Uint8Array, y as Uint8Array)) {
            frames.push({ kind: "Fail" });
          }
          continue;
        case "Set": {
          const xSet = x as ReadonlySet<Data>;
          const ySet = y as ReadonlySet<Data>;
          if (
            Reflect.ownKeys(x).length !== 0 ||
            Reflect.ownKeys(y).length !== 0 ||
            xSet.size !== ySet.size
          ) {
            frames.push({ kind: "Fail" });
            continue;
          }
          frames.push({
            kind: "Set",
            actual: Array.from(xSet),
            actualIndex: 0,
            unmatched: Array.from(ySet),
            candidateIndex: 0,
          });
          continue;
        }
        case "Map": {
          const xMap = x as ReadonlyMap<Data, Data>;
          const yMap = y as ReadonlyMap<Data, Data>;
          if (
            Reflect.ownKeys(x).length !== 0 ||
            Reflect.ownKeys(y).length !== 0 ||
            xMap.size !== yMap.size
          ) {
            frames.push({ kind: "Fail" });
            continue;
          }
          frames.push({
            kind: "Map",
            actual: Array.from(xMap),
            actualIndex: 0,
            unmatched: Array.from(yMap),
            candidateIndex: 0,
          });
          continue;
        }
        case "Object": {
          const xKeys = Reflect.ownKeys(x);
          const yKeys = Reflect.ownKeys(y);
          if (xKeys.length !== yKeys.length) {
            frames.push({ kind: "Fail" });
            continue;
          }

          let valid = true;
          for (const key of xKeys) {
            if (typeof key !== "string") {
              valid = false;
              break;
            }
            const xDescriptor = Object.getOwnPropertyDescriptor(x, key);
            const yDescriptor = Object.getOwnPropertyDescriptor(y, key);
            if (
              xDescriptor === undefined ||
              yDescriptor === undefined ||
              !("value" in xDescriptor) ||
              !("value" in yDescriptor) ||
              !xDescriptor.enumerable ||
              !yDescriptor.enumerable
            ) {
              valid = false;
              break;
            }
            frames.push({
              kind: "Compare",
              actual: xDescriptor.value as Data,
              expected: yDescriptor.value as Data,
            });
          }
          if (!valid) frames.push({ kind: "Fail" });
          continue;
        }
        case "Unsupported":
          frames.push({ kind: "Fail" });
          continue;
      }
    }

    if (frame.kind === "Set") {
      if (frame.actualIndex === frame.actual.length) continue;
      if (frame.candidateIndex === frame.unmatched.length) {
        frames.push({ kind: "Fail" });
        continue;
      }

      attempts.push({
        pairsCheckpoint: pairs.length,
        frameCheckpoint: frames.length,
        retry: { ...frame, candidateIndex: frame.candidateIndex + 1 },
      });
      frames.push({ kind: "Commit", match: frame });
      frames.push({
        kind: "Compare",
        actual: frame.actual[frame.actualIndex],
        expected: frame.unmatched[frame.candidateIndex],
      });
      continue;
    }

    if (frame.kind === "Map") {
      if (frame.actualIndex === frame.actual.length) continue;
      if (frame.candidateIndex === frame.unmatched.length) {
        frames.push({ kind: "Fail" });
        continue;
      }

      const [actualKey, actualValue] = frame.actual[frame.actualIndex];
      const [expectedKey, expectedValue] =
        frame.unmatched[frame.candidateIndex];
      attempts.push({
        pairsCheckpoint: pairs.length,
        frameCheckpoint: frames.length,
        retry: { ...frame, candidateIndex: frame.candidateIndex + 1 },
      });
      frames.push({ kind: "Commit", match: frame });
      frames.push({
        kind: "Compare",
        actual: actualValue,
        expected: expectedValue,
      });
      frames.push({
        kind: "Compare",
        actual: actualKey,
        expected: expectedKey,
      });
      continue;
    }

    if (frame.kind === "Commit") {
      attempts.pop();
      frame.match.unmatched.splice(frame.match.candidateIndex, 1);
      frames.push({
        ...frame.match,
        actualIndex: frame.match.actualIndex + 1,
        candidateIndex: 0,
      });
      continue;
    }

    const attempt = attempts.pop();
    if (attempt === undefined) return false;

    while (pairs.length > attempt.pairsCheckpoint) {
      const [left, right] = pairs.pop()!;
      const rights = rightsByLeft.get(left)!;
      rights.delete(right);
      if (rights.size === 0) rightsByLeft.delete(left);
    }
    frames.length = attempt.frameCheckpoint;
    frames.push(attempt.retry);
  }

  return true;
}

type EqDataError<Value> =
  IsData<Value> extends true
    ? []
    : [
        error: CompileTimeError<
          "eqData",
          "Actual and expected values must consist only of Data."
        >,
      ];

interface EqDataSetFrame {
  readonly kind: "Set";
  readonly actual: ReadonlyArray<Data>;
  readonly actualIndex: number;
  readonly unmatched: Array<Data>;
  readonly candidateIndex: number;
}

interface EqDataMapFrame {
  readonly kind: "Map";
  readonly actual: ReadonlyArray<readonly [Data, Data]>;
  readonly actualIndex: number;
  readonly unmatched: Array<readonly [Data, Data]>;
  readonly candidateIndex: number;
}

type EqDataCollectionFrame = EqDataSetFrame | EqDataMapFrame;

type EqDataFrame =
  | {
      readonly kind: "Compare";
      readonly actual: Data;
      readonly expected: Data;
    }
  | EqDataCollectionFrame
  | { readonly kind: "Commit"; readonly match: EqDataCollectionFrame }
  | { readonly kind: "Fail" };
