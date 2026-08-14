/**
 * TypeScript utility types.
 *
 * @module
 */

/**
 * A function that receives a value and returns nothing.
 *
 * Use for event handlers, observers, and async completion handlers.
 *
 * ### Completion callbacks
 *
 * ```ts
 * import { ok, type Callback, type Result } from "@evolu/common";
 *
 * const completedValues: Array<string> = [];
 * const onComplete: Callback<string> = (value) => {
 *   completedValues.push(value);
 * };
 * const queue = new Set<Callback<Result<string, Error>>>();
 * queue.add((result) => {
 *   if (result.ok) completedValues.push(result.value);
 * });
 *
 * onComplete("direct");
 * for (const callback of queue) callback(ok("queued"));
 *
 * expect(completedValues).toEqual(["direct", "queued"]);
 * ```
 */
export type Callback<T> = (value: T) => void;

/**
 * A function that receives a value and optionally returns a teardown function.
 *
 * Use for subscriptions or callbacks that need abort-time teardown.
 *
 * ### Subscription teardown
 *
 * ```ts
 * import type { CallbackWithTeardown } from "@evolu/common";
 *
 * interface EventSource {
 *   readonly start: () => void;
 *   readonly stop: () => void;
 * }
 *
 * const events: Array<string> = [];
 * const source: EventSource = {
 *   start: () => events.push("started"),
 *   stop: () => events.push("stopped"),
 * };
 * const subscribe: CallbackWithTeardown<EventSource> = (source) => {
 *   source.start();
 *   return source.stop;
 * };
 * const teardown = subscribe(source);
 * if (teardown) teardown();
 *
 * expect(events).toEqual(["started", "stopped"]);
 * ```
 */
export type CallbackWithTeardown<T> = (value: T) => void | (() => void);

/**
 * Checks a condition on a value and returns a boolean.
 *
 * A predicate starts with an 'is' prefix, e.g., `isEven`.
 *
 * ### Filtering values
 *
 * ```ts
 * import type { Predicate } from "@evolu/common";
 *
 * const isEven: Predicate<number> = (n) => n % 2 === 0;
 *
 * expect([1, 2, 3, 4].filter(isEven)).toEqual([2, 4]);
 * ```
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Checks a condition on a value at a given index and returns a boolean.
 *
 * Useful for callbacks that need both the element and its position.
 *
 * ### Filtering by position
 *
 * ```ts
 * import type { PredicateWithIndex } from "@evolu/common";
 *
 * const isEvenIndex: PredicateWithIndex<string> = (value, index) =>
 *   index % 2 === 0;
 *
 * expect(["a", "b", "c", "d"].filter(isEvenIndex)).toEqual(["a", "c"]);
 * ```
 */
export type PredicateWithIndex<T> = (value: T, index: number) => boolean;

/**
 * A type guard function that refines type `A` to a narrower type `B`.
 *
 * ### Narrowing a value
 *
 * ```ts
 * import type { Refinement } from "@evolu/common";
 *
 * interface Animal {
 *   readonly name: string;
 * }
 * interface Dog extends Animal {
 *   readonly breed: string;
 * }
 *
 * const isDog: Refinement<Animal, Dog> = (animal): animal is Dog =>
 *   "breed" in animal;
 * const dog: Dog = { name: "Dog", breed: "Beagle" };
 * const animal: Animal = dog;
 * if (!isDog(animal)) throw new Error("Expected a dog");
 *
 * expect(animal.breed).toBe("Beagle");
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
 * ### Indexed refinement
 *
 * ```ts
 * import { partitionArray, type RefinementWithIndex } from "@evolu/common";
 *
 * type Item = {
 *   readonly type: "number" | "string";
 *   readonly value: unknown;
 * };
 * type NumberItem = Item & { readonly type: "number" };
 *
 * const isNumberItem: RefinementWithIndex<Item, NumberItem> = (
 *   item,
 *   index,
 * ): item is NumberItem => index > 0 && item.type === "number";
 * const items: ReadonlyArray<Item> = [
 *   { type: "number", value: 1 },
 *   { type: "number", value: 2 },
 * ];
 * const [numbers, others] = partitionArray(items, isNumberItem);
 *
 * expectTypeOf(numbers).toEqualTypeOf<ReadonlyArray<NumberItem>>();
 * expect(numbers[0]?.value).toBe(2);
 * expect(others[0]?.value).toBe(1);
 * ```
 */
export type RefinementWithIndex<in A, out B extends A> = (
  a: A,
  index: number,
) => a is B;

/**
 * Realm-neutral runtime identity for a TypeScript interface.
 *
 * Extend this interface and add its runtime evidence with {@link instance} when
 * constructing a value. Unlike JavaScript `instanceof`, the identity does not
 * depend on a constructor or prototype and therefore survives realms, package
 * duplication, object spreading, and structured cloning.
 *
 * The marker is intentionally forgeable. It identifies values created by
 * trusted constructors; it is not structural validation or a security
 * boundary.
 *
 * ### Adding runtime identity
 *
 * ```ts
 * import { instance, type Instance } from "@evolu/common";
 *
 * interface Foo extends Instance<"Foo"> {
 *   readonly value: string;
 * }
 *
 * const foo: Foo = {
 *   ...instance("Foo"),
 *   value: "value",
 * };
 *
 * expect(foo["~evolu/instance"]).toBe("Foo");
 * ```
 */
export interface Instance<Name extends string> {
  readonly "~evolu/instance": Name;
}

/** Creates the runtime identity property required by {@link Instance}. */
export const instance = <const Name extends string>(
  name: Name,
): Instance<Name> => ({ "~evolu/instance": name });

/**
 * Creates a realm-neutral predicate for one {@link Instance} name.
 *
 * The identity must be stored directly on the value; inherited markers are
 * ignored.
 *
 * The explicit value type can include the rest of an interface whose trusted
 * constructors attach the matching identity.
 *
 * ### Checking runtime identity
 *
 * ```ts
 * import { instance, isInstance, type Instance } from "@evolu/common";
 *
 * interface Foo extends Instance<"Foo"> {
 *   readonly value: string;
 * }
 *
 * const isFoo = isInstance<Foo>("Foo");
 * const value: unknown = { ...instance("Foo"), value: "value" };
 *
 * expect(isFoo(value)).toBe(true);
 * ```
 */
export const isInstance =
  <Value extends Instance<string>>(name: Value["~evolu/instance"]) =>
  (value: unknown): value is Value =>
    value !== null &&
    typeof value === "object" &&
    globalThis.Object.hasOwn(value, "~evolu/instance") &&
    (value as Instance<string>)["~evolu/instance"] === name;

/**
 * Makes properties optional if they accept `null` as a value.
 *
 * For each property in `T`, if `null` is a valid value for that property, the
 * property will be made optional in the resulting type.
 *
 * ### Optional nullable properties
 *
 * ```ts
 * import type { NullablePartial } from "@evolu/common";
 *
 * type Example = {
 *   required: string;
 *   optionalWithNull: string | null;
 * };
 *
 * expectTypeOf<NullablePartial<Example>>().toEqualTypeOf<{
 *   required: string;
 *   optionalWithNull?: string | null;
 * }>();
 * ```
 */
export type NullablePartial<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
> = { [K in keyof NP]: NP[K] };

/** A value with a numeric length. */
export interface ValueWithLength {
  readonly length: number;
}

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

/** Removes `readonly` modifier from all properties of a type. */
export type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Simplify an intersection type into a single mapped type.
 *
 * This utility forces TypeScript to "flatten" an intersection type into a
 * single object type so that tooltips and error messages are easier to read.
 *
 * ### Flattening an intersection
 *
 * ```ts
 * import type { Simplify } from "@evolu/common";
 *
 * type A = { a: string } & { b: number };
 * type B = Simplify<A>;
 *
 * expectTypeOf<B>().toEqualTypeOf<{
 *   a: string;
 *   b: number;
 * }>();
 * ```
 */
export type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

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
 * ### Sync and async completion
 *
 * ```ts
 * import { isPromiseLike, type Awaitable } from "@evolu/common";
 *
 * const cache = new Map([["cached", "from cache"]]);
 * const getData = (id: string): Awaitable<string> =>
 *   cache.get(id) ?? Promise.resolve(`fetched ${id}`);
 *
 * const fetched = await getData("missing");
 * const result = getData("cached");
 * const cached = isPromiseLike(result) ? await result : result;
 *
 * expect(fetched).toBe("fetched missing");
 * expect(cached).toBe("from cache");
 * ```
 */
export type Awaitable<T> = T | PromiseLike<T>;

/**
 * Type guard to check if a value is a {@link PromiseLike}.
 *
 * Use with {@link Awaitable} to conditionally `await` only when necessary,
 * avoiding microtask overhead for synchronous values.
 *
 * ### Conditional awaiting
 *
 * ```ts
 * import { isPromiseLike, type Awaitable } from "@evolu/common";
 *
 * const cache = new Map([["cached", true]]);
 * const validate = (id: string): Awaitable<boolean> =>
 *   cache.get(id) ?? Promise.resolve(false);
 *
 * const result = validate("cached");
 * const isValid = isPromiseLike(result) ? await result : result;
 *
 * expect(isValid).toBe(true);
 * ```
 */
export const isPromiseLike = <T>(
  value: Awaitable<T>,
): value is PromiseLike<T> =>
  typeof (value as PromiseLike<T> | null | undefined)?.then === "function";

/** Decimal digit from `"0"` to `"9"`. */
export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** Decimal digit from `"1"` to `"9"`. */
export type Digit1To9 = Exclude<Digit, "0">;

/** Decimal string from `"1"` to `"6"`. */
export type Digit1To6 = "1" | "2" | "3" | "4" | "5" | "6";

/** Decimal string from `"1"` to `"23"`. */
export type Digit1To23 =
  | Digit1To9 // 1-9
  | `1${Digit}` // 10-19
  | `2${"0" | "1" | "2" | "3"}`; // 20-23

/** Decimal string from `"1"` to `"51"`. */
export type Digit1To51 =
  | Digit1To9 // 1-9
  | `${"1" | "2" | "3" | "4"}${Digit}` // 10-49
  | `5${"0" | "1"}`; // 50-51

/** Decimal string from `"1"` to `"99"`. */
export type Digit1To99 =
  | Digit1To9 // 1-9
  | `${Digit1To9}${Digit}`; // 10-99

/** Decimal string from `"1"` to `"59"`. */
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

/** Creates a readable compiler-facing error message. */
export type CompileTimeError<
  Context extends string,
  Message extends string,
> = `⛔ ${Context} error: ${Message}`;

/** Returns whether a type is a union. */
export type IsUnion<T, Whole = T> = [T] extends [never]
  ? false
  : T extends Whole
    ? [Whole] extends [T]
      ? false
      : true
    : never;

/** Returns every property key present in any member of a union. */
export type KeysOfUnion<T> = T extends T ? keyof T : never;

/** Converts a union to an intersection. */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/** Intersects the parameter types of a union of unary functions. */
export type ParameterIntersection<T> = [T] extends [(value: infer I) => void]
  ? I
  : unknown;

/**
 * Removes keys from each member of a union.
 *
 * Use when {@link Omit} would collapse a discriminated union into a single
 * shared shape.
 *
 * ### Preserving discriminated unions
 *
 * ```ts
 * import type { DistributiveOmit } from "@evolu/common";
 *
 * type Event =
 *   | { type: "a"; a: string; shared: number }
 *   | { type: "b"; b: number; shared: number };
 *
 * type Payload = DistributiveOmit<Event, "shared">;
 *
 * expectTypeOf<Payload>().toEqualTypeOf<
 *   { type: "a"; a: string } | { type: "b"; b: number }
 * >();
 * ```
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
