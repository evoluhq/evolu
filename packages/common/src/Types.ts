/**
 * TypeScript utility types.
 *
 * @module
 */

import * as Kysely from "kysely";

/**
 * A function that receives a value and returns nothing.
 *
 * Use for event handlers, observers, and async completion handlers.
 *
 * ### Example
 *
 * ```ts
 * const onComplete: Callback<string> = (value) => console.log(value);
 * const queue = new Set<Callback<Result<Data, Error>>>();
 * ```
 */
export type Callback<T> = (value: T) => void;

/**
 * Checks a condition on a value and returns a boolean.
 *
 * A predicate starts with an 'is' prefix, e.g., `isEven`.
 *
 * ### Example
 *
 * ```ts
 * const isEven: Predicate<number> = (n) => n % 2 === 0;
 *
 * const numbers = [1, 2, 3, 4];
 * const evenNumbers = numbers.filter(isEven); // [2, 4]
 * ```
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Checks a condition on a value at a given index and returns a boolean.
 *
 * Useful for callbacks that need both the element and its position.
 *
 * ### Example
 *
 * ```ts
 * const isEvenIndex: PredicateWithIndex<string> = (value, index) =>
 *   index % 2 === 0;
 *
 * const items = ["a", "b", "c", "d"];
 * const evenIndexItems = items.filter(isEvenIndex); // ["a", "c"]
 * ```
 */
export type PredicateWithIndex<T> = (value: T, index: number) => boolean;

/**
 * A type guard function that refines type `A` to a narrower type `B`.
 *
 * ### Example
 *
 * ```ts
 * type Animal = { name: string };
 * type Dog = Animal & { breed: string };
 *
 * const isDog: Refinement<Animal, Dog> = (animal): animal is Dog =>
 *   "breed" in animal;
 *
 * const animal: Animal = { name: "Dog", breed: "Beagle" };
 * if (isDog(animal)) {
 *   console.log(animal.breed); // Safe access to `breed`
 * }
 * ```
 */
export type Refinement<in A, out B extends A> = (a: A) => a is B;

/**
 * A type guard function that refines type `A` to a narrower type `B` at a given
 * index.
 *
 * Useful for callbacks that need both the element and its position while
 * maintaining type narrowing.
 *
 * ### Example
 *
 * ```ts
 * type Item = { type: "number" | "string"; value: unknown };
 *
 * const isNumberItem: RefinementWithIndex<Item, Item & { type: "number" }> =
 *   (item, index): item is Item & { type: "number" } =>
 *     index > 0 && item.type === "number";
 *
 * const items: ReadonlyArray<Item> = [...];
 * const [numbers, others] = partitionArray(items, isNumberItem);
 * ```
 */
export type RefinementWithIndex<in A, out B extends A> = (
  a: A,
  index: number,
) => a is B;

/**
 * Makes properties optional if they accept `null` as a value.
 *
 * For each property in `T`, if `null` is a valid value for that property, the
 * property will be made optional in the resulting type.
 *
 * ### Example
 *
 * ```ts
 * type Example = {
 *   required: string;
 *   optionalWithNull: string | null;
 * };
 *
 * type Result = NullablePartial<Example>;
 * // Result is:
 * // {
 * //   required: string;
 * //   optionalWithNull?: string | null;
 * // }
 * ```
 */
export type NullablePartial<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
> = { [K in keyof NP]: NP[K] };

/**
 * A type alias for `never` that is used intentionally when casting is not
 * needed and unit tests exist to ensure correctness.
 */
export type IntentionalNever = never;

/**
 * String, number, bigint, boolean, undefined, null
 *
 * https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types
 */
export type Literal = string | number | bigint | boolean | undefined | null;

/**
 * Infers a broader type from a specific literal value type.
 *
 * Examples:
 *
 * - "foo" -> string
 * - 42 -> number
 * - 42n -> bigint
 * - True -> boolean
 */
export type WidenLiteral<T extends Literal> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends bigint
        ? bigint
        : T;

/**
 * Removes `readonly` modifier from all properties of a type.
 *
 * Useful for constructing immutable objects step-by-step (e.g. builder pattern)
 * before casting them back to the readonly type.
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Simplify an intersection type into a single mapped type.
 *
 * This utility forces TypeScript to "flatten" an intersection type into a
 * single object type so that tooltips and error messages are easier to read.
 *
 * ### Example
 *
 * ```ts
 * type A = { a: string } & { b: number };
 * // Without Simplify, TypeScript may display A as:
 * // { a: string } & { b: number }
 *
 * type B = Simplify<A>;
 * // B is equivalent to:
 * // { a: string; b: number }
 * ```
 */
export type Simplify<T> = Kysely.Simplify<T>;

/**
 * Makes a specific property of an object optional while keeping others
 * unchanged.
 */
export type PartialProp<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/**
 * A value that can be awaited.
 *
 * Use when a function may complete synchronously or asynchronously depending on
 * runtime conditions (e.g., cache hit vs network fetch).
 *
 * ### Example
 *
 * ```ts
 * const getData = (id: string): Awaitable<Data> => {
 *   const cached = cache.get(id);
 *   if (cached) return cached; // Sync path
 *   return fetchData(id); // Async path
 * };
 *
 * // Always works
 * const data = await getData(id);
 *
 * // Or optimize for sync path
 * const result = getData(id);
 * const data = isPromiseLike(result) ? await result : result;
 * ```
 */
export type Awaitable<T> = T | PromiseLike<T>;

/**
 * Type guard to check if a value is a {@link PromiseLike}.
 *
 * Use with {@link Awaitable} to conditionally `await` only when necessary,
 * avoiding microtask overhead for synchronous values.
 */
export const isPromiseLike = <T>(
  value: Awaitable<T>,
): value is PromiseLike<T> =>
  typeof (value as PromiseLike<T> | null | undefined)?.then === "function";

/** Single digit 0-9. Useful for template literal type validation. */
export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** Digit 1-9. Useful for template literal type validation. */
export type Digit1To9 = Exclude<Digit, "0">;

/** Numeric string 1-6. Useful for days validation. */
export type Digit1To6 = "1" | "2" | "3" | "4" | "5" | "6";

/** Numeric string 1-23. Useful for hours validation. */
export type Digit1To23 =
  | Digit1To9 // 1-9
  | `1${Digit}` // 10-19
  | `2${"0" | "1" | "2" | "3"}`; // 20-23

/** Numeric string 1-51. Useful for weeks validation. */
export type Digit1To51 =
  | Digit1To9 // 1-9
  | `${"1" | "2" | "3" | "4"}${Digit}` // 10-49
  | `5${"0" | "1"}`; // 50-51

/** Numeric string 1-99. Useful for years validation. */
export type Digit1To99 =
  | Digit1To9 // 1-9
  | `${Digit1To9}${Digit}`; // 10-99

/** Numeric string 1-59. Useful for minutes, seconds validation. */
export type Digit1To59 =
  | Digit1To9 // 1-9
  | `1${Digit}` // 10-19
  | `2${Digit}` // 20-29
  | `3${Digit}` // 30-39
  | `4${Digit}` // 40-49
  | `5${Digit}`; // 50-59

/** Numeric literal 1-99. */
export type Int1To99 = NumberFromString<Digit1To99>;

/** Numeric literal 1-100. */
export type Int1To100 = Int1To99 | 100;

/**
 * Parses a numeric literal type from a string literal.
 *
 * Used by {@link Int1To99}.
 */
export type NumberFromString<T extends string> =
  T extends `${infer N extends number}` ? N : never;

/** Converts a union to an intersection. */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Removes keys from each member of a union.
 *
 * Use when {@link Omit} would collapse a discriminated union into a single
 * shared shape.
 *
 * ### Example
 *
 * ```ts
 * type Event =
 *   | { type: "a"; a: string; shared: number }
 *   | { type: "b"; b: number; shared: number };
 *
 * type Payload = DistributiveOmit<Event, "shared">;
 * // { type: "a"; a: string } | { type: "b"; b: number }
 * ```
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
