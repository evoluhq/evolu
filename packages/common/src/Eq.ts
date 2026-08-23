/**
 * Equality comparison functions and utilities.
 *
 * @module
 */

import type { Order } from "./Order.ts";
import { getObjectKind } from "./Object.ts";
import type { Data, IsData, JsonValue, JsonValueInput } from "./Type.ts";
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
 * Use {@link eqFromOrder} to derive equality from an {@link Order}.
 *
 * ### Example
 *
 * ```ts
 * import { createEqObject, eqNumber } from "@evolu/common";
 *
 * const eqPoint = createEqObject({ x: eqNumber, y: eqNumber });
 *
 * expect(eqPoint({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
 * expect(eqPoint({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false);
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
 * import { eqSameValueZero } from "@evolu/common";
 *
 * expect(eqSameValueZero(NaN, NaN)).toBe(true);
 * expect(eqSameValueZero(0, -0)).toBe(true);
 * expect(eqSameValueZero({}, {})).toBe(false);
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
 * import { createEqArrayLike, eqNumber } from "@evolu/common";
 *
 * const eqArrayNumber = createEqArrayLike(eqNumber);
 *
 * expect(eqArrayNumber([1, 2, 3], [1, 2, 3])).toBe(true);
 * expect(
 *   eqArrayNumber(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])),
 * ).toBe(true);
 * expect(eqArrayNumber([1, 2, 3], [1, 2, 4])).toBe(false);
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
 * import { eqArrayStrict } from "@evolu/common";
 *
 * const a = { x: 1 };
 * const b = { x: 1 };
 * expect(eqArrayStrict([a, a], [a, a])).toBe(true);
 * expect(eqArrayStrict([a], [b])).toBe(false);
 * ```
 */
export const eqArrayStrict = /*#__PURE__*/ createEqArrayLike(eqStrict);

/**
 * Compares two array-like structures of numbers for equality.
 *
 * ### Example
 *
 * ```ts
 * import { eqArrayNumber } from "@evolu/common";
 *
 * expect(eqArrayNumber([1, NaN], [1, NaN])).toBe(true);
 * ```
 */
export const eqArrayNumber = /*#__PURE__*/ createEqArrayLike(eqNumber);

/**
 * Compares two Uint8Arrays by byte value.
 *
 * ### Example
 *
 * ```ts
 * import { eqUint8Array } from "@evolu/common";
 *
 * expect(
 *   eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
 * ).toBe(true);
 * expect(
 *   eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
 * ).toBe(false);
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
 * import { createEqObject, eqNumber } from "@evolu/common";
 *
 * const eqObjectNumber = createEqObject({ a: eqNumber });
 *
 * expect(eqObjectNumber({ a: 1 }, { a: 1 })).toBe(true);
 * expect(eqObjectNumber({ a: 1 }, { a: 2 })).toBe(false);
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
 * Compares two {@link Data} values.
 *
 * Primitive values use SameValueZero, so `NaN` equals itself and `0` equals
 * `-0`. Arrays and Object properties are ordered and keyed respectively. Sets
 * and Maps compare their elements and entries without regard to insertion
 * order. Dates compare their time values, while Uint8Arrays compare their
 * bytes. Cyclic and shared data graphs are supported.
 *
 * The compile-time validation recursively accepts ordinary interfaces whose
 * properties consist only of Data. Runtime representation details are trusted;
 * use the {@link Data} Type at an unknown boundary.
 *
 * ### Example
 *
 * ```ts
 * import { assert, eqData } from "@evolu/common";
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
 * assert(eqData(first, second), "Expected users to contain equal Data.");
 * ```
 */
export function eqData<Actual, Expected>(
  actual: Actual,
  expected: Expected,
  ...dataError: EqDataError<Actual | Expected>
): boolean;
export function eqData(actual: Data, expected: Data): boolean {
  return eqDataInternal(actual, expected, {
    pairs: [],
    rightsByLeft: new Map(),
  });
}

/**
 * Compares two {@link JsonValue} values using {@link eqData}.
 *
 * ### Example
 *
 * ```ts
 * import { assert, eqJsonValue, type JsonValue } from "@evolu/common";
 *
 * const first: JsonValue = { profile: { name: "Ada" } };
 * const second: JsonValue = { profile: { name: "Ada" } };
 *
 * assert(eqJsonValue(first, second), "Expected equal JSON values.");
 * ```
 */
export const eqJsonValue: Eq<JsonValue> = eqData;

/** Compares two {@link JsonValueInput} values using {@link eqData}. */
export const eqJsonValueInput: Eq<JsonValueInput> = eqData;

type EqDataError<Value> =
  IsData<Value> extends true
    ? []
    : [
        error: CompileTimeError<
          "eqData",
          "Actual and expected values must consist only of Data."
        >,
      ];

interface EqDataContext {
  readonly pairs: Array<readonly [object, object]>;
  readonly rightsByLeft: Map<object, Set<object>>;
}

interface EqDataCompareFrame {
  readonly kind: "Compare";
  readonly actual: Data;
  readonly expected: Data;
}

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

interface EqDataCommitSetFrame {
  readonly kind: "CommitSet";
  readonly match: EqDataSetFrame;
}

interface EqDataCommitMapFrame {
  readonly kind: "CommitMap";
  readonly match: EqDataMapFrame;
}

interface EqDataFailFrame {
  readonly kind: "Fail";
}

type EqDataFrame =
  | EqDataCompareFrame
  | EqDataSetFrame
  | EqDataMapFrame
  | EqDataCommitSetFrame
  | EqDataCommitMapFrame
  | EqDataFailFrame;

type EqDataCollectionFrame = EqDataSetFrame | EqDataMapFrame;

interface EqDataCandidateAttempt {
  readonly contextCheckpoint: number;
  readonly frameCheckpoint: number;
  readonly retry: EqDataCollectionFrame;
}

const eqDataInternal = (
  actual: Data,
  expected: Data,
  context: EqDataContext,
): boolean => {
  const frames: Array<EqDataFrame> = [{ kind: "Compare", actual, expected }];
  const attempts: Array<EqDataCandidateAttempt> = [];

  const retryFailedCandidate = (_frame: EqDataFailFrame): boolean => {
    const attempt = attempts.pop();
    if (attempt === undefined) return false;

    rollbackEqDataContext(context, attempt.contextCheckpoint);
    frames.length = attempt.frameCheckpoint;
    frames.push(attempt.retry);
    return true;
  };

  while (frames.length > 0) {
    const frame = frames.pop()!;

    if (frame.kind === "Compare") {
      const x = frame.actual;
      const y = frame.expected;

      if (eqSameValueZero(x, y)) continue;
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

      const rights = context.rightsByLeft.get(x);
      if (rights?.has(y)) continue;
      if (rights === undefined) {
        context.rightsByLeft.set(x, new Set([y]));
      } else {
        rights.add(y);
      }
      context.pairs.push([x, y]);

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

      const attempt: EqDataCandidateAttempt = {
        contextCheckpoint: context.pairs.length,
        frameCheckpoint: frames.length,
        retry: { ...frame, candidateIndex: frame.candidateIndex + 1 },
      };
      attempts.push(attempt);
      frames.push({ kind: "CommitSet", match: frame });
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
      const attempt: EqDataCandidateAttempt = {
        contextCheckpoint: context.pairs.length,
        frameCheckpoint: frames.length,
        retry: { ...frame, candidateIndex: frame.candidateIndex + 1 },
      };
      attempts.push(attempt);
      frames.push({ kind: "CommitMap", match: frame });
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

    if (frame.kind === "CommitSet") {
      attempts.pop();
      frame.match.unmatched.splice(frame.match.candidateIndex, 1);
      frames.push({
        ...frame.match,
        actualIndex: frame.match.actualIndex + 1,
        candidateIndex: 0,
      });
      continue;
    }

    if (frame.kind === "CommitMap") {
      attempts.pop();
      frame.match.unmatched.splice(frame.match.candidateIndex, 1);
      frames.push({
        ...frame.match,
        actualIndex: frame.match.actualIndex + 1,
        candidateIndex: 0,
      });
      continue;
    }

    if (!retryFailedCandidate(frame)) return false;
  }

  return true;
};

const rollbackEqDataContext = (
  context: EqDataContext,
  checkpoint: number,
): void => {
  while (context.pairs.length > checkpoint) {
    const [left, right] = context.pairs.pop()!;
    const rights = context.rightsByLeft.get(left)!;
    rights.delete(right);
    if (rights.size === 0) context.rightsByLeft.delete(left);
  }
};
