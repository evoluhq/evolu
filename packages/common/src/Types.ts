/**
 * TypeScript utility types
 *
 * @module
 */

import * as Kysely from "kysely";

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
