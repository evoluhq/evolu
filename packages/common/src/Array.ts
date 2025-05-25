/** An array with at least one element. */
export type NonEmptyArray<T> = [T, ...Array<T>];

/** Checks if an array is non-empty. */
export const isNonEmptyArray = <T>(
  array: Array<T>,
): array is NonEmptyArray<T> => array.length > 0;

/** A readonly array with at least one element. */
export type NonEmptyReadonlyArray<T> = readonly [T, ...ReadonlyArray<T>];

/** Checks if an array is non-empty. */
export const isNonEmptyReadonlyArray = <T>(
  array: ReadonlyArray<T>,
): array is NonEmptyReadonlyArray<T> => array.length > 0;

/** Appends an item to an array returning a non-empty array. */
export const appendToArray = <T>(
  item: T,
  array: ReadonlyArray<T>,
): NonEmptyReadonlyArray<T> =>
  [...array, item] as unknown as NonEmptyReadonlyArray<T>;

/** Prepends an item to an array returning a non-empty array. */
export const prependToArray = <T>(
  item: T,
  array: ReadonlyArray<T>,
): NonEmptyReadonlyArray<T> =>
  [item, ...array] as unknown as NonEmptyReadonlyArray<T>;

/** Maps a non-empty array using a mapper function. */
export const mapNonEmptyArray = <T, U>(
  array: NonEmptyReadonlyArray<T>,
  mapper: (item: T, index: number) => U,
): NonEmptyReadonlyArray<U> =>
  array.map(mapper) as unknown as NonEmptyReadonlyArray<U>;

/** Shifts an item from a non-empty array, guaranteed to return T. */
export const shiftArray = <T>(array: NonEmptyArray<T>): T => array.shift() as T;
