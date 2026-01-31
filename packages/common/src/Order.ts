/**
 * Ordering and comparison utilities.
 *
 * @module
 */

/**
 * Compares two values of type `A` and returns their ordering.
 *
 * Ordering functions start with an 'order' prefix, e.g., `orderNumber`.
 *
 * - Returns `-1` if `x` is less than `y`.
 * - Returns `0` if `x` is equal to `y`.
 * - Returns `1` if `x` is greater than `y`.
 */
export type Order<in A> = (x: A, y: A) => Ordering;

/**
 * A type representing the result of an ordering operation.
 *
 * Compatible with the return values expected by `Array.prototype.sort`.
 */
export type Ordering = -1 | 0 | 1;

/**
 * Creates an ordering function from a "less than" comparator.
 *
 * ### Example
 *
 * ```ts
 * const orderNumber = createOrder<number>((x, y) => x < y);
 * expect(orderNumber(1, 2)).toEqual(-1);
 * expect(orderNumber(2, 1)).toEqual(1);
 * expect(orderNumber(1, 1)).toEqual(0);
 * ```
 */
export const createOrder =
  <A>(isLessThan: (x: A, y: A) => boolean): Order<A> =>
  (x, y) =>
    x === y ? 0 : isLessThan(x, y) ? -1 : 1;

/**
 * Returns an order that reverses the order of the given order.
 *
 * ### Example
 *
 * ```ts
 * reverseOrder(orderNumber)(1, 2); // 1
 * reverseOrder(orderNumber)(2, 1); // -1
 * reverseOrder(orderNumber)(1, 1); // 0
 * ```
 */
export const reverseOrder =
  <A>(order: Order<A>): Order<A> =>
  (a, b) =>
    order(b, a);

/**
 * An order for `string` values in ascending order.
 *
 * ### Example
 *
 * ```ts
 * orderString("a", "b"); // -1
 * orderString("b", "a"); // 1
 * orderString("a", "a"); // 0
 * ["c", "b", "a"].toSorted(orderString); // ["a", "b", "c"]
 * ```
 */
export const orderString: Order<string> = /*#__PURE__*/ createOrder(
  (a, b) => a < b,
);

/**
 * An order for numbers in ascending order.
 *
 * ### Example
 *
 * ```ts
 * orderNumber(1, 2); // -1
 * orderNumber(2, 1); // 1
 * orderNumber(1, 1); // 0
 * [2, 1, 3].toSorted(orderNumber); // [1, 2, 3]
 * reverseOrder(orderNumber)(1, 2); // 1
 * reverseOrder(orderNumber)(2, 1); // -1
 * reverseOrder(orderNumber)(1, 1); // 0
 * ```
 */
export const orderNumber = /*#__PURE__*/ createOrder<number>((a, b) => a < b);

/**
 * An order for bigints in ascending order.
 *
 * ### Example
 *
 * ```ts
 * orderBigInt(1n, 2n); // -1
 * orderBigInt(2n, 1n); // 1
 * orderBigInt(1n, 1n); // 0
 * [2n, 1n, 3n].toSorted(orderBigInt); // [1n, 2n, 3n]
 * ```
 */
export const orderBigInt = /*#__PURE__*/ createOrder<bigint>((a, b) => a < b);

/** An {@link Order} for Uint8Array. */
export const orderUint8Array: Order<Uint8Array> = (a, b) => {
  if (a.byteLength > b.byteLength) return 1;
  if (a.byteLength < b.byteLength) return -1;

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }

  return 0;
};
