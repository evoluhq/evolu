/**
 * Runtime type validation, parsing, and branded types.
 *
 * @module
 */

import { utf8ToBytes } from "@noble/ciphers/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { pack } from "msgpackr";
import type { Brand } from "./Brand.js";
import type { RandomBytesDep } from "./Crypto.js";
import { exhaustiveCheck } from "./Function.js";
import { isFunction, isPlainObject } from "./Object.js";
import { hasNodeBuffer } from "./Platform.js";
import type { NextResult, Result } from "./Result.js";
import { err, getOrNull, getOrThrow, ok, trySync } from "./Result.js";
import { safelyStringifyUnknownValue } from "./String.js";
import type { TimeDep } from "./Time.js";
import type {
  IntentionalNever,
  Literal,
  Refinement,
  Simplify,
  WidenLiteral,
} from "./Types.js";

/**
 * Evolu {@link Type} is like a type guard that returns typed errors (via
 * {@link Result}) instead of throwing. We either receive a safely typed value or
 * a composable typed error that tells us exactly why the validation failed.
 *
 * The reason why Evolu Type exists is that no other TypeScript validation
 * library met Evolu's requirements. A distinctive feature of Evolu Type
 * compared to other validation libraries is that it returns typed errors rather
 * than string messages. This allows TypeScript to enforce that all validation
 * errors are handled via {@link exhaustiveCheck}, significantly improving the
 * developer experience. Those requirements are:
 *
 * - **Result-based error handling** – no exceptions for normal control flow.
 * - **Typed errors with decoupled formatters** – validation logic ≠ user
 *   messages.
 * - **Consistent constraints via {@link Brand}** – every constraint becomes part
 *   of the type.
 * - **Skippable validation** – parent validations can be skipped when already
 *   proved by types.
 * - **Simple, top-down implementation** – readable source code from top to
 *   bottom.
 * - **No user-land chaining DSL** – prepared for TC39 Hack pipes.
 *
 * Evolu Type supports [Standard Schema](https://standardschema.dev/) for
 * interoperability with 40+ validation-compatible tools and frameworks.
 *
 * ### Example
 *
 * Examples are shown below. For a complete list of all types and utilities
 * Evolu Type provides, see the [API
 * reference](/docs/api-reference/common/Type).
 *
 * ## Base types
 *
 * ```ts
 * // Validate unknown values
 * const value: unknown = "hello";
 * const stringResult = String.fromUnknown(value);
 * if (!stringResult.ok) {
 *   // console.error(formatStringError(stringResult.error));
 *   return stringResult;
 * }
 * // Safe branch: value is now string
 * const upper = stringResult.value.toUpperCase();
 *
 * // Type guard style
 * if (String.is(value)) {
 *   // narrowed to string
 * }
 *
 * // Composing: arrays & objects
 * const Numbers = array(Number); // ReadonlyArray<number>
 * const Point = object({ x: Number, y: Number });
 *
 * Numbers.from([1, 2, 3]); // ok
 * Point.from({ x: 1, y: 2 }); // ok
 * Point.from({ x: 1, y: "2" }); // err -> nested Number error
 * ```
 *
 * ## Branded types
 *
 * Branding is the recommended way to define types in Evolu. Instead of using
 * primitive types like `string` or `number` directly, wrap them with
 * {@link brand} to create semantically meaningful types. See {@link Brand} for
 * why this matters.
 *
 * ```ts
 * const CurrencyCode = brand("CurrencyCode", String, (value) =>
 *   /^[A-Z]{3}$/.test(value)
 *     ? ok(value)
 *     : err<CurrencyCodeError>({ type: "CurrencyCode", value }),
 * );
 * type CurrencyCode = typeof CurrencyCode.Type; // string & Brand<"CurrencyCode">
 *
 * interface CurrencyCodeError extends TypeError<"CurrencyCode"> {}
 *
 * const formatCurrencyCodeError =
 *   createTypeErrorFormatter<CurrencyCodeError>(
 *     (error) => `Invalid currency code: ${error.value}`,
 *   );
 *
 * const r = CurrencyCode.from("USD"); // ok("USD")
 * const e = CurrencyCode.from("usd"); // err(...)
 * ```
 *
 * See also reusable brand factories like `minLength`, `maxLength`, `trimmed`,
 * `positive`, `between`, etc.
 *
 * ## Object types
 *
 * ```ts
 * const User = object({
 *   name: NonEmptyTrimmedString100,
 *   age: optional(PositiveInt),
 * });
 *
 * // Use interface for objects. TypeScript displays the interface name
 * // instead of expanding all properties.
 * interface User extends InferType<typeof User> {}
 *
 * User.from({ name: "Alice" }); // ok
 * User.from({ name: "Alice", age: -1 }); // err(PositiveInt)
 *
 * // TODO: Add `record`
 * ```
 *
 * ## JSON type
 *
 * ```ts
 * const Person = object({
 *   name: NonEmptyString50,
 *   // Did you know that JSON.stringify converts NaN (a number) into null?
 *   // To prevent this, use FiniteNumber.
 *   age: FiniteNumber,
 * });
 * interface Person extends InferType<typeof Person> {}
 *
 * const [PersonJson, personToPersonJson, personJsonToPerson] = json(
 *   Person,
 *   "PersonJson",
 * );
 * // string & Brand<"PersonJson">
 * type PersonJson = typeof PersonJson.Type;
 *
 * const person = Person.orThrow({
 *   name: "Alice",
 *   age: 30,
 * });
 *
 * const personJson = personToPersonJson(person);
 * expect(personJsonToPerson(personJson)).toEqual(person);
 * ```
 *
 * ## Error Formatting
 *
 * Evolu separates validation logic from human-readable messages. There are two
 * layers:
 *
 * 1. Per-type formatters (e.g. `formatStringError`) – simple, focused, already
 *    used earlier in the quick start example.
 * 2. A unified formatter via `createFormatTypeError` – composes all built-in and
 *    custom errors (including nested composite types) and lets us override
 *    selected messages.
 *
 * ### 1. Per-Type formatter
 *
 * ```ts
 * const r = String.fromUnknown(42);
 * if (!r.ok) console.error(formatStringError(r.error));
 * ```
 *
 * ### 2. Unified formatter with overrides
 *
 * ```ts
 * // Override only what we care about; fall back to built-ins for the rest.
 * const formatTypeError = createFormatTypeError((error) => {
 *   if (error.type === "MinLength") return `Min length is ${error.min}`;
 * });
 *
 * const User = object({ name: NonEmptyTrimmedString100 });
 * const resultUser = User.from({ name: "" });
 * if (!resultUser.ok) console.error(formatTypeError(resultUser.error));
 *
 * const badPoint = object({ x: Number, y: Number }).from({
 *   x: 1,
 *   y: "foo",
 * });
 * if (!badPoint.ok) console.error(formatTypeError(badPoint.error));
 * ```
 *
 * The unified formatter walks nested structures (object / array / record /
 * tuple / union) and applies overrides only where specified, greatly reducing
 * boilerplate when formatting complex validation errors.
 *
 * ## Naming
 *
 * Evolu Types intentionally use the same names as native JavaScript types
 * (String, Number, Boolean, etc.). When you need to distinguish between an
 * Evolu Type and the native type, use `globalThis` to reference the native one
 * (e.g., `globalThis.String`, `globalThis.Number`).
 *
 * ## Design decision
 *
 * Evolu Type intentionally does not support bidirectional transformations. It
 * previously did, but supporting that while keeping typed error fidelity added
 * complexity that hurt readability & reliability. Most persistence pipelines
 * (e.g. SQLite) already require explicit mapping of query results, so implicit
 * reverse transforms would not buy much. We may revisit this if we can design a
 * minimal, 100% safe API that preserves simplicity.
 *
 * ## Composition without pipe
 *
 * Take a look how `SimplePassword` is defined:
 *
 * ```ts
 * const SimplePassword = brand(
 *   "SimplePassword",
 *   minLength(8)(maxLength(64)(TrimmedString)),
 * );
 * ```
 *
 * Shallow nesting often fits one line. If it doesn't, split into named parts:
 *
 * ```ts
 * const Min8TrimmedString64 = minLength(8)(maxLength(64)(TrimmedString));
 * const SimplePassword = brand("SimplePassword", Min8TrimmedString64);
 * ```
 *
 * ## FAQ
 *
 * ### How do I create a generic interface like `FooState<T>`?
 *
 * TypeScript's {@link InferType} extracts a concrete type, not a generic one.
 * You cannot write `interface FooState<T> extends InferType<typeof
 * fooState<T>>` because `InferType` needs a concrete Type instance.
 *
 * The recommended approach is to define the generic interface manually, then
 * create a Type factory that produces structurally compatible Types:
 *
 * ```ts
 * // Define the generic interface manually
 * interface FooState<T> {
 *   readonly value: T;
 *   readonly loading: boolean;
 * }
 *
 * // Create a Type factory that produces Types matching the interface
 * const fooState = <T extends AnyType>(valueType: T) =>
 *   object({
 *     value: valueType,
 *     loading: Boolean,
 *   });
 *
 * // Usage
 * const StringFooState = fooState(String);
 * type StringFooState = InferType<typeof StringFooState>;
 *
 * // The interface and inferred type are structurally compatible
 * const state: FooState<string> = StringFooState.orThrow({
 *   value: "hi",
 *   loading: false,
 * });
 * ```
 *
 * This keeps the interface generic while having type-safe runtime validation
 * for each concrete use.
 */
export interface Type<
  Name extends TypeName,
  /** The type this Type resolves to. */
  T,
  /** The type expected by `from` and `fromUnknown`. */
  Input,
  /** The specific error introduced by this Type. */
  Error extends TypeError = never,
  /** The parent type. */
  Parent = T,
  /** The parent's error. */
  ParentError extends TypeError = Error,
> extends StandardSchemaV1<Input, T> {
  readonly name: Name;

  /**
   * Creates `T` from an `Input` value.
   *
   * This is useful when we have a typed value.
   *
   * `from` is a typed alias of `fromUnknown`.
   */
  readonly from: (value: Input) => Result<T, ParentError | Error>;

  /**
   * Creates `T` from an `Input` value, throwing an error if validation fails.
   *
   * Throws an Error with the Type validation error in its `cause` property,
   * making it debuggable while avoiding the need for custom error messages.
   *
   * This is a convenience method that combines `from` with `getOrThrow`.
   *
   * **When to use:**
   *
   * - Configuration values that are guaranteed to be valid (e.g., hardcoded
   *   constants)
   * - Application startup where failure should crash the program
   * - As an alternative to assertions when the Type error in the thrown Error's
   *   `cause` provides sufficient debugging information
   * - Test code with known valid inputs (when error message clarity is not
   *   critical; for better test error messages, use Vitest `schemaMatching` +
   *   `assert` with `.is()`)
   *
   * ### Example
   *
   * ```ts
   * // Good: Known valid constant
   * const maxRetries = PositiveInt.orThrow(3);
   *
   * // Good: App configuration that should crash on invalid values
   * const appName = SimpleName.orThrow("MyApp");
   *
   * // Good: Instead of assert when Type error is clear enough
   * // Context makes it obvious: count increments from non-negative value
   * const currentCount = counts.get(id) ?? 0;
   * const newCount = PositiveInt.orThrow(currentCount + 1);
   *
   * // Good: Test setup with known valid values
   * const testUser = User.orThrow({ name: "Alice", age: 30 });
   *
   * // Avoid: User input (use `from` instead)
   * const userAge = PositiveInt.orThrow(userInput); // Could crash!
   *
   * // Better: Handle user input gracefully
   * const ageResult = PositiveInt.from(userInput);
   * if (!ageResult.ok) {
   *   // Handle validation error
   * }
   * ```
   */
  readonly orThrow: (value: Input) => T;

  /**
   * Creates `T` from an `Input` value, returning `null` if validation fails.
   *
   * This is a convenience method that combines `from` with `getOrNull`.
   *
   * **When to use:**
   *
   * - When you need to convert a validation result to a nullable value
   * - When the error is not important and you just want the value or nothing
   *
   * ### Example
   *
   * ```ts
   * // Good: Optional user input
   * const age = PositiveInt.orNull(userInput);
   * if (age != null) {
   *   console.log("Valid age:", age);
   * }
   *
   * // Good: Default fallback
   * const maxRetries = PositiveInt.orNull(config.retries) ?? 3;
   *
   * // Avoid: When you need to know why validation failed (use `from` instead)
   * const result = PositiveInt.from(userInput);
   * if (!result.ok) {
   *   console.error(formatPositiveError(result.error));
   * }
   * ```
   */
  readonly orNull: (value: Input) => T | null;

  /**
   * Creates `T` from an unknown value.
   *
   * This is useful when a value is unknown.
   */
  readonly fromUnknown: (value: unknown) => Result<T, ParentError | Error>;

  /**
   * Creates `T` from `Parent` type.
   *
   * This function skips parent Types validations when we have already partially
   * validated value.
   */
  readonly fromParent: (value: Parent) => Result<T, Error>;

  /**
   * A **type guard** that checks whether an unknown value satisfies the
   * {@link Type}.
   *
   * ### Example
   *
   * ```ts
   * const value: unknown = "hello";
   * if (String.is(value)) {
   *   // TypeScript now knows `value` is a `string` here.
   *   console.log("This is a valid string!");
   * }
   *
   * const strings: unknown[] = [1, "hello", true, "world"];
   * const filteredStrings = strings.filter(String.is);
   *
   * console.log(filteredStrings); // ["hello", "world"]
   * ```
   */
  readonly is: Refinement<unknown, T>;

  readonly [EvoluTypeSymbol]: true;

  /**
   * The type this Type resolves to.
   *
   * ### Example
   *
   * ```ts
   * type String = typeof String.Type;
   * ```
   */
  readonly Type: T;

  /**
   * The type expected by `from` and `fromUnknown`.
   *
   * ### Example
   *
   * ```ts
   * type StringInput = typeof String.Input;
   * ```
   */
  readonly Input: Input;

  /**
   * The specific error introduced by this Type.
   *
   * ### Example
   *
   * ```ts
   * type StringError = typeof String.Error;
   * ```
   */
  readonly Error: Error;

  /**
   * The parent type.
   *
   * ### Example
   *
   * ```ts
   * type StringParent = typeof String.Parent;
   * ```
   */
  readonly Parent: Parent;

  /**
   * The parent's error.
   *
   * ### Example
   *
   * ```ts
   * type StringParentError = typeof String.ParentError;
   * ```
   */
  readonly ParentError: ParentError;

  /**
   * ### Example
   *
   * ```ts
   * type StringParentErrors = typeof String.Errors;
   * ```
   */
  readonly Errors: Error | ParentError;
}

/**
 * Unique identifier for a {@link Type}.
 *
 * @group Utilities
 */
export type TypeName = Capitalize<string>;

export interface TypeError<Name extends TypeName = TypeName> {
  readonly type: Name;

  /**
   * The value that was received and caused the error. Provides additional
   * context for debugging and validation feedback.
   */
  readonly value: unknown;
}

export interface TypeErrorWithReason<
  Name extends TypeName = TypeName,
  Reason extends { readonly kind: Capitalize<string> } = {
    readonly kind: Capitalize<string>;
  },
> extends TypeError<Name> {
  /** The detailed reason for the error, represented as a tagged union. */
  readonly reason: Reason;
}

/**
 * A {@link Type} with all type parameters set to `any`.
 *
 * @group Utilities
 */
export type AnyType = Type<any, any, any, any, any, any>;

/**
 * Extracts the name from a {@link Type}.
 *
 * @group Utilities
 */
export type InferName<A extends AnyType> =
  A extends Type<infer Name, any, any, any, any, any> ? Name : never;

/**
 * Extracts the type from a {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * const User = object({
 *   name: NonEmptyTrimmedString100,
 *   age: optional(PositiveInt),
 * });
 *
 * // Use interface for objects. TypeScript displays the interface name
 * // instead of expanding all properties.
 * interface User extends InferType<typeof User> {}
 * ```
 *
 * @group Utilities
 */
export type InferType<A extends AnyType> =
  A extends Type<any, infer T, any, any, any, any> ? T : never;

/**
 * Extracts the input type from a {@link Type}.
 *
 * @group Utilities
 */
export type InferInput<A extends AnyType> =
  A extends Type<any, any, infer Input, any, any, any> ? Input : never;

/**
 * Extracts the specific error type from a {@link Type}.
 *
 * @group Utilities
 */
export type InferError<A extends AnyType> =
  A extends Type<any, any, any, infer Error, any, any> ? Error : never;

/**
 * Extracts the parent type from a {@link Type}.
 *
 * @group Utilities
 */
export type InferParent<A extends AnyType> =
  A extends Type<any, any, any, any, infer Parent, any> ? Parent : never;

/**
 * Extracts the parent error type from a {@link Type}.
 *
 * @group Utilities
 */
export type InferParentError<A extends AnyType> =
  A extends Type<any, any, any, any, any, infer ParentError>
    ? ParentError
    : never;

/**
 * Extracts all error types from a {@link Type}.
 *
 * @group Utilities
 */
export type InferErrors<T extends AnyType> =
  T extends Type<any, any, any, infer Error, any, infer ParentError>
    ? Error | ParentError
    : never;

const EvoluTypeSymbol = Symbol("evolu.Type");

/**
 * Checks if the given value is an {@link Type}.
 *
 * @group Utilities
 */
export const isType = (value: unknown): value is AnyType =>
  typeof value === "object" && value !== null && EvoluTypeSymbol in value;

const createType = <
  Name extends TypeName,
  T,
  Input,
  Error extends TypeError = never,
  Parent = T,
  ParentError extends TypeError = never,
>(
  name: Name,
  definition: Omit<
    Type<Name, T, Input, Error, Parent, ParentError>,
    | "name"
    | "is"
    | "from"
    | "orThrow"
    | "orNull"
    | typeof EvoluTypeSymbol
    | "Type"
    | "Input"
    | "Error"
    | "Parent"
    | "ParentError"
    | "Errors"
    | "~standard"
  >,
): Type<Name, T, Input, Error, Parent, ParentError> => ({
  ...definition,
  name,
  is: (value: unknown): value is T => definition.fromUnknown(value).ok,
  from: definition.fromUnknown,
  orThrow: (value) => getOrThrow(definition.fromUnknown(value)),
  orNull: (value) => getOrNull(definition.fromUnknown(value)),
  [EvoluTypeSymbol]: true,
  Type: undefined as unknown as T,
  Input: undefined as unknown as Input,
  Error: undefined as unknown as Error,
  Parent: undefined as unknown as Parent,
  ParentError: undefined as unknown as ParentError,
  Errors: undefined as unknown as Error | ParentError,
  "~standard": {
    version: 1,
    vendor: "evolu",
    validate: (value: unknown): StandardSchemaV1.Result<T> => {
      const result = definition.fromUnknown(value);
      if (result.ok) {
        return { value: result.value };
      }
      cachedStandardSchemaFormatTypeError ??= createFormatTypeError();
      return {
        issues: typeErrorToStandardSchemaIssues(
          result.error as TypeErrors<Error>,
          cachedStandardSchemaFormatTypeError,
        ),
      };
    },
    types: {
      input: undefined as unknown as Input,
      output: undefined as unknown as T,
    },
  },
});

/**
 * Creates a formatter function for {@link TypeError}.
 *
 * The formatter generates human-readable error messages using a custom
 * formatting function and a safely stringified error value.
 *
 * ### Example
 *
 * ```ts
 * const formatStringError = createTypeErrorFormatter<StringError>(
 *   (value) => `A value ${value} is not a string.`,
 * );
 * ```
 *
 * @group Utilities
 */
export const createTypeErrorFormatter =
  <Error extends TypeError>(
    format: (
      error: Simplify<Omit<Error, "value"> & { value: string }>,
    ) => string,
  ): TypeErrorFormatter<Error> =>
  (error) =>
    format({ ...error, value: safelyStringifyUnknownValue(error.value) });

export type TypeErrorFormatter<Error extends TypeError> = (
  error: Error,
) => string;

/**
 * Base {@link Type}.
 *
 * A Base Type validates that a value conforms to a specific TypeScript type.
 *
 * ### Example
 *
 * ```ts
 * const String = base("String", (value) =>
 *   typeof value === "string"
 *     ? ok(value)
 *     : err<StringError>({ type: "String", value }),
 * );
 *
 * interface StringError extends TypeError<"String"> {}
 *
 * const formatStringError = createTypeErrorFormatter<StringError>(
 *   (error) => `A value ${error.value} is not a string`,
 * );
 * ```
 *
 * @group Base Factories
 */
export const base = <Name extends TypeName, T, Error extends TypeError>(
  name: Name,
  fromUnknown: (value: unknown) => Result<T, Error>,
): Type<Name, T, T, Error> =>
  createType(name, {
    fromUnknown,
    fromParent: ok<T>, // `fromParent` relies on types, so it can't fail for the Base Type
  });

/**
 * Creates a formatter function for a base {@link TypeError}.
 *
 * This formatter is specifically for Base Types that only need a simple error
 * message indicating that the value is not of the expected type.
 *
 * ### Example
 *
 * ```ts
 * export const formatStringError =
 *   createBaseTypeErrorFormatter<StringError>();
 * ```
 *
 * @group Utilities
 */
export const createBaseTypeErrorFormatter = <
  Error extends TypeError,
>(): TypeErrorFormatter<Error> =>
  createTypeErrorFormatter<Error>(
    (error) => `A value ${error.value} is not a ${error.type.toLowerCase()}.`,
  );

/** @group Base Types */
export const Unknown = base<"Unknown", unknown, never>("Unknown", ok);

/**
 * @group Base Types
 * @group String
 */
export const String = base("String", (value) =>
  typeof value === "string"
    ? ok(value)
    : err<StringError>({ type: "String", value }),
);

export interface StringError extends TypeError<"String"> {}

export const formatStringError = createBaseTypeErrorFormatter<StringError>();

/** @group Base Types */
export const Number = base("Number", (value) =>
  typeof value === "number"
    ? ok(value)
    : err<NumberError>({ type: "Number", value }),
);

export interface NumberError extends TypeError<"Number"> {}

export const formatNumberError = createBaseTypeErrorFormatter<NumberError>();

/** @group Base Types */
export const BigInt = base("BigInt", (value) =>
  typeof value === "bigint"
    ? ok(value)
    : err<BigIntError>({ type: "BigInt", value }),
);

export interface BigIntError extends TypeError<"BigInt"> {}

export const formatBigIntError = createBaseTypeErrorFormatter<BigIntError>();

/** @group Base Types */
export const Boolean = base("Boolean", (value) =>
  typeof value === "boolean"
    ? ok(value)
    : err<BooleanError>({ type: "Boolean", value }),
);

export interface BooleanError extends TypeError<"Boolean"> {}

export const formatBooleanError = createBaseTypeErrorFormatter<BooleanError>();

/** @group Base Types */
export const Undefined = base("Undefined", (value) =>
  value === undefined
    ? ok(value)
    : err<UndefinedError>({ type: "Undefined", value }),
);

export interface UndefinedError extends TypeError<"Undefined"> {}

export const formatUndefinedError =
  createBaseTypeErrorFormatter<UndefinedError>();

/** @group Base Types */
export const Null = base("Null", (value) =>
  value === null ? ok(value) : err<NullError>({ type: "Null", value }),
);

export interface NullError extends TypeError<"Null"> {}

export const formatNullError = createBaseTypeErrorFormatter<NullError>();

/** @group Base Types */
export const Function = base("Function", (value) =>
  isFunction(value)
    ? ok(value)
    : err<FunctionError>({ type: "Function", value }),
);

export interface FunctionError extends TypeError<"Function"> {}

export const formatFunctionError =
  createBaseTypeErrorFormatter<FunctionError>();

/** @group Base Types */
export const Uint8Array = base("Uint8Array", (value) =>
  value instanceof globalThis.Uint8Array
    ? ok(value)
    : err<Uint8ArrayError>({ type: "Uint8Array", value }),
);

export interface Uint8ArrayError extends TypeError<"Uint8Array"> {}

export const formatUint8ArrayError =
  createBaseTypeErrorFormatter<Uint8ArrayError>();

/**
 * `instanceof` {@link Type}.
 *
 * Ensures that a value is an instance of the given class constructor.
 *
 * ### Example
 *
 * ```ts
 * class User {
 *   constructor(public name: string) {}
 * }
 *
 * const UserInstance = instanceOf(User);
 *
 * const result = UserInstance.from(new User("Alice")); // ok
 * const error = UserInstance.from({}); // err
 * ```
 *
 * @group Base Factories
 */
export const instanceOf = <T extends abstract new (...args: any) => any>(
  ctor: T,
): InstanceOfType<T> => ({
  ...base("InstanceOf", (value) =>
    value instanceof ctor
      ? ok(value)
      : err<InstanceOfError>({ type: "InstanceOf", value, ctor: ctor.name }),
  ),
  ctor,
});

export interface InstanceOfError extends TypeError<"InstanceOf"> {
  readonly ctor: string;
}

export interface InstanceOfType<
  T extends abstract new (...args: any) => any,
> extends Type<
  "InstanceOf",
  InstanceType<T>,
  InstanceType<T>,
  InstanceOfError
> {
  ctor: T;
}

export const formatInstanceOfError = createTypeErrorFormatter<InstanceOfError>(
  (error) => `The value ${error.value} is not an instance of ${error.ctor}.`,
);

/**
 * JavaScript Date.
 *
 * @group Base Types
 */
export const Date = instanceOf(globalThis.Date);

/**
 * Validates that an unknown value is an Evolu {@link Type} (i.e., satisfies
 * `AnyType`).
 *
 * ### Example
 *
 * ```ts
 * const result = EvoluType.from(String); // ok(String)
 * const error = EvoluType.from("not a Type"); // err
 * ```
 */
// TODO: Rename to TypeInstance or something like that.
export const EvoluType = base("EvoluType", (value) =>
  isType(value)
    ? ok(value)
    : err<EvoluTypeError>({
        type: "EvoluType",
        value,
      }),
);

export interface EvoluTypeError extends TypeError<"EvoluType"> {}

export const formatIsTypeError = createTypeErrorFormatter<EvoluTypeError>(
  (error) => `Value ${error.value} is not a valid Evolu Type.`,
);

/**
 * Branded {@link Type}.
 *
 * Branding is the recommended way to define types in Evolu. Instead of using
 * primitive types like `string` or `number` directly, wrap them with `brand` to
 * create semantically meaningful types. See {@link Brand} for why this matters.
 *
 * The `brand` Type Factory takes the name of a new {@link Brand}, a parent Type
 * to be branded, and the optional `refine` function for additional constraint.
 *
 * The `refine` function can be omitted if we only want to add a brand.
 *
 * ### Example
 *
 * A simple `CurrencyCode` Type:
 *
 * ```ts
 * const CurrencyCode = brand("CurrencyCode", String, (value) =>
 *   /^[A-Z]{3}$/.test(value)
 *     ? ok(value)
 *     : err<CurrencyCodeError>({ type: "CurrencyCode", value }),
 * );
 *
 * // string & Brand<"CurrencyCode">
 * type CurrencyCode = typeof CurrencyCode.Type;
 *
 * interface CurrencyCodeError extends TypeError<"CurrencyCode"> {}
 *
 * const formatCurrencyCodeError =
 *   createTypeErrorFormatter<CurrencyCodeError>(
 *     (error) => `Invalid currency code: ${error.value}`,
 *   );
 *
 * // Usage
 * const result = CurrencyCode.from("USD");
 * if (result.ok) {
 *   console.log("Valid currency code:", result.value);
 * } else {
 *   console.error(formatCurrencyCodeError(result.error));
 * }
 * ```
 *
 * Often, we want to make a branded Type reusable. For example, instead of
 * `TrimmedString`, we want the `trimmed` Type Factory:
 *
 * ```ts
 * const trimmed: BrandFactory<"Trimmed", string, TrimmedError> = (
 *   parent,
 * ) =>
 *   brand("Trimmed", parent, (value) =>
 *     value.trim().length === value.length
 *       ? ok(value)
 *       : err<TrimmedError>({ type: "Trimmed", value }),
 *   );
 *
 * interface TrimmedError extends TypeError<"Trimmed"> {}
 *
 * const formatTrimmedError = createTypeErrorFormatter<TrimmedError>(
 *   (error) => `A value ${error.value} is not trimmed`,
 * );
 *
 * const TrimmedString = trimmed(String);
 *
 * // string & Brand<"Trimmed">
 * type TrimmedString = typeof TrimmedString.Type;
 *
 * const TrimmedNote = trimmed(Note);
 * ```
 *
 * As noted earlier, the `refine` function is optional. That's useful to add
 * semantic meaning to the existing Type without altering its functionality:
 *
 * ```ts
 * const SimplePassword = brand(
 *   "SimplePassword",
 *   minLength(8)(maxLength(64)(TrimmedString)),
 * );
 * // string & Brand<"Trimmed"> & Brand<"MinLength8"> & Brand<"MaxLength64"> & Brand<"SimplePassword">
 * type SimplePassword = typeof SimplePassword.Type;
 * ```
 *
 * We can use `brand` to enforce valid object as well:
 *
 * ```ts
 * const Form = object({
 *   password: SimplePassword,
 *   confirmPassword: SimplePassword,
 * });
 *
 * const ValidForm = brand("ValidForm", Form, (value) => {
 *   if (value.password !== value.confirmPassword)
 *     return err<ValidFormError>({
 *       type: "ValidForm",
 *       value,
 *       reason: { kind: "PasswordMismatch" },
 *     });
 *   return ok(value);
 * });
 * type ValidForm = typeof ValidForm.Type;
 *
 * interface ValidFormError extends TypeError<"ValidForm"> {
 *   readonly reason: { kind: "PasswordMismatch" };
 * }
 *
 * const result = ValidForm.from({
 *   password: "abcde123",
 *   confirmPassword: "bbcde123",
 * });
 *
 * const safeForm = (_form: ValidForm) => {
 *   //
 * };
 *
 * if (result.ok) {
 *   safeForm(result.value);
 * }
 *
 * expect(result).toEqual(
 *   err({
 *     type: "ValidForm",
 *     value: {
 *       confirmPassword: "bbcde123",
 *       password: "abcde123",
 *     },
 *     reason: {
 *       kind: "PasswordMismatch",
 *     },
 *   }),
 * );
 * ```
 *
 * @group Base Factories
 */
export function brand<
  Name extends TypeName,
  ParentType extends AnyType,
  Parent = InferType<ParentType>,
  RefineError extends TypeError = never,
>(
  name: Name,
  parent: ParentType,
  refine: (value: Parent) => Result<Parent, RefineError>,
): BrandType<ParentType, Name, RefineError, InferErrors<ParentType>>;

export function brand<Name extends TypeName, ParentType extends AnyType>(
  name: Name,
  parent: ParentType,
): BrandType<
  ParentType,
  Name,
  BrandWithoutRefineError<Name, InferErrors<ParentType>>
>;

export function brand<
  Name extends TypeName,
  ParentType extends AnyType,
  Parent = InferType<ParentType>,
  RefineError extends TypeError = never,
>(
  name: Name,
  parent: ParentType,
  refine?: (value: Parent) => Result<Parent, RefineError>,
): BrandType<ParentType, Name, RefineError, InferErrors<ParentType>> {
  const fromUnknown = refine
    ? (value: unknown) => {
        const parentResult = parent.fromUnknown(value);
        if (!parentResult.ok) return parentResult;
        return refine(parentResult.value as IntentionalNever);
      }
    : (value: unknown) => {
        const parentResult = parent.fromUnknown(value);
        if (!parentResult.ok)
          return err<BrandWithoutRefineError<Name, IntentionalNever>>({
            type: name,
            value,
            parentError: parentResult.error as IntentionalNever,
          });
        return ok(parentResult.value);
      };

  return {
    ...createType("Brand", {
      fromUnknown,
      fromParent: (refine ?? ok) as IntentionalNever,
    }),
    brand: name,
    parentType: parent,
  };
}

export interface BrandType<
  ParentType extends AnyType,
  Name extends TypeName,
  Error extends TypeError = never,
  ParentError extends TypeError = never,
> extends Type<
  "Brand",
  InferType<ParentType> & Brand<Name>,
  InferInput<ParentType>,
  Error,
  InferType<ParentType>,
  ParentError
> {
  readonly brand: Name;
  readonly parentType: ParentType;
}

export interface BrandWithoutRefineError<
  Name extends TypeName,
  ParentError extends TypeError,
> extends TypeError<Name> {
  readonly parentError: ParentError;
}

/**
 * A three-letter ISO 4217 currency code (e.g., USD, EUR).
 *
 * @group String
 */
export const CurrencyCode = brand("CurrencyCode", String, (value) =>
  /^[A-Z]{3}$/.test(value)
    ? ok(value)
    : err<CurrencyCodeError>({ type: "CurrencyCode", value }),
);

export type CurrencyCode = typeof CurrencyCode.Type;

export interface CurrencyCodeError extends TypeError<"CurrencyCode"> {}

export const formatCurrencyCodeError =
  createTypeErrorFormatter<CurrencyCodeError>(
    (error) => `Invalid currency code: ${error.value}.`,
  );

/**
 * ISO 8601 date-time string.
 *
 * This {@link Type} represents a date-time string that follows the ISO 8601
 * format and is compatible with SQLite, which lacks a native date type and
 * relies on ISO 8601 strings for sorting. Enforcing a 24-character format
 * ensures correct lexicographic ordering.
 *
 * It must be a valid JavaScript Date string that can be parsed.
 *
 * Valid range: `"0000-01-01T00:00:00.000Z"` to `"9999-12-31T23:59:59.999Z"`.
 *
 * ### Example
 *
 * ```ts
 * const result = DateIso.from("2023-01-01T12:00:00.000Z"); // ok
 * const error = DateIso.from("10000-01-01T00:00:00.000Z"); // err
 * ```
 *
 * @group String
 */
export const DateIso = brand("DateIso", String, (value) => {
  if (value.length !== 24) {
    return err<DateIsoError>({ type: "DateIso", value });
  }
  const parsed = globalThis.Date.parse(value);
  if (isNaN(parsed)) {
    return err<DateIsoError>({ type: "DateIso", value });
  }
  // Round-trip test: ensure the string is actually a proper ISO format
  const roundTrip = new globalThis.Date(parsed).toISOString();
  if (roundTrip !== value) {
    return err<DateIsoError>({ type: "DateIso", value });
  }
  return ok(value);
});

export type DateIso = typeof DateIso.Type;

export interface DateIsoError extends TypeError<"DateIso"> {}

export const formatDateIsoError = createTypeErrorFormatter<DateIsoError>(
  (error) => `The value ${error.value} is not a valid ISO 8601 date string.`,
);

export const dateToDateIso = (value: Date): Result<DateIso, DateIsoError> =>
  DateIso.fromParent(value.toISOString());

export const dateIsoToDate = (value: DateIso): Date =>
  new globalThis.Date(value);

/**
 * Helper type for Type Factory that creates a branded Type.
 *
 * ### Example
 *
 * ```ts
 * const trimmed: BrandFactory<"Trimmed", string, TrimmedError> = (
 *   parent,
 * ) =>
 *   brand("Trimmed", parent, (value) =>
 *     value.trim().length === value.length
 *       ? ok(value)
 *       : err<TrimmedError>({ type: "Trimmed", value }),
 *   );
 * ```
 *
 * ### Numeric literal inference
 *
 * When using factories with numeric parameters (like `lessThan`, `maxLength`,
 * `between`), use numeric literals instead of expressions. TypeScript widens
 * expressions to `number`, losing the literal type in the brand name:
 *
 * ```ts
 * lessThan(100)(Number); // Brand<"LessThan100"> ✓
 * lessThan(100 - 1)(Number); // Brand<"LessThan" + number> ✗
 * ```
 *
 * @group Utilities
 */
export type BrandFactory<
  Name extends TypeName,
  Input,
  RefineError extends TypeError,
> = <
  PName extends TypeName,
  P extends Input,
  PInput,
  PParent,
  PError extends TypeError = never,
  PParentError extends TypeError = never,
>(
  parent: Type<PName, P, PInput, PError, PParent, PParentError>,
) => BrandType<
  Type<PName, P, PInput, PError, PParent, PParentError>,
  Name,
  RefineError,
  PError | PParentError
>;

/**
 * Trimmed string.
 *
 * This Type Factory validates whether a string has no leading or trailing
 * whitespaces.
 *
 * ### Example
 *
 * ```ts
 * const TrimmedNonEmptyString = trimmed(minLength(1)(String));
 * // string & Brand<"MinLength1"> & Brand<"Trimmed">
 * type TrimmedNonEmptyString = typeof TrimmedNonEmptyString.Type;
 * ```
 *
 * @group String
 */
export const trimmed: BrandFactory<"Trimmed", string, TrimmedError> = (
  parent,
) =>
  brand("Trimmed", parent, (value) =>
    value.trim().length === value.length
      ? ok(value)
      : err<TrimmedError>({ type: "Trimmed", value }),
  );

export interface TrimmedError extends TypeError<"Trimmed"> {}

export const formatTrimmedError = createTypeErrorFormatter<TrimmedError>(
  (error) => `The value ${error.value} must be trimmed.`,
);

/**
 * Trimmed string
 *
 * - Use `TrimmedString.is` to check if an unknown value is trimmed.
 * - Use `TrimmedString.from` to check if a string is trimmed.
 *
 * @group String
 */
export const TrimmedString = trimmed(String);
export type TrimmedString = typeof TrimmedString.Type;

export const trim = (value: string): TrimmedString =>
  value.trim() as TrimmedString;

/**
 * Minimum length.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * ### Example
 *
 * ```ts
 * // string & Brand<"MinLength1">
 * const NonEmptyString = minLength(1)(String);
 * ```
 *
 * @group String
 * @group Array
 */
export const minLength: <Min extends number>(
  min: Min,
) => BrandFactory<`MinLength${Min}`, { length: number }, MinLengthError<Min>> =
  (min) => (parent) =>
    brand(`MinLength${min}`, parent, (value) =>
      value.length >= min ? ok(value) : err({ type: "MinLength", value, min }),
    );

export interface MinLengthError<
  Min extends number = number,
> extends TypeError<"MinLength"> {
  readonly min: Min;
}

export const formatMinLengthError = createTypeErrorFormatter<MinLengthError>(
  (error) =>
    `The value ${error.value} does not meet the minimum length of ${error.min}.`,
);

/**
 * Maximum length.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * ### Example
 *
 * ```ts
 * // string & Brand<"MaxLength100">
 * const String100 = maxLength(100)(String);
 * ```
 *
 * @group String
 * @group Array
 */
export const maxLength: <Max extends number>(
  max: Max,
) => BrandFactory<`MaxLength${Max}`, { length: number }, MaxLengthError<Max>> =
  (max) => (parent) =>
    brand(`MaxLength${max}`, parent, (value) =>
      value.length <= max ? ok(value) : err({ type: "MaxLength", value, max }),
    );

export interface MaxLengthError<
  Max extends number = number,
> extends TypeError<"MaxLength"> {
  readonly max: Max;
}

export const formatMaxLengthError = createTypeErrorFormatter<MaxLengthError>(
  (error) =>
    `The value ${error.value} exceeds the maximum length of ${error.max}.`,
);

/**
 * Exact length.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * ### Example
 *
 * ```ts
 * // string & Brand<"Length1">
 * const Length1String = length(1)(String);
 * ```
 *
 * @group String
 * @group Array
 */
export const length: <Exact extends number>(
  exact: Exact,
) => BrandFactory<`Length${Exact}`, { length: number }, LengthError<Exact>> =
  (exact) => (parent) =>
    brand(`Length${exact}`, parent, (value) =>
      value.length === exact
        ? ok(value)
        : err({ type: "Length", value, exact }),
    );

export interface LengthError<
  Exact extends number = number,
> extends TypeError<"Length"> {
  readonly exact: Exact;
}

export const formatLengthError = createTypeErrorFormatter<LengthError>(
  (error) =>
    `The value ${error.value} does not have the required length of ${error.exact}.`,
);

/** @group String */
export const NonEmptyString = minLength(1)(String);
export type NonEmptyString = typeof NonEmptyString.Type;

/** @group String */
export const String100 = maxLength(100)(String);
export type String100 = typeof String100.Type;

/** @group String */
export const String1000 = maxLength(1000)(String);
export type String1000 = typeof String1000.Type;

/** @group String */
export const NonEmptyString100 = minLength(1)(String100);
export type NonEmptyString100 = typeof NonEmptyString100.Type;

/** @group String */
export const NonEmptyString1000 = minLength(1)(String1000);
export type NonEmptyString1000 = typeof NonEmptyString1000.Type;

/** @group String */
export const NonEmptyTrimmedString = minLength(1)(TrimmedString);
export type NonEmptyTrimmedString = typeof NonEmptyTrimmedString.Type;

/** @group String */
export const TrimmedString100 = maxLength(100)(TrimmedString);
export type TrimmedString100 = typeof TrimmedString100.Type;

/** @group String */
export const TrimmedString1000 = maxLength(1000)(TrimmedString);
export type TrimmedString1000 = typeof TrimmedString1000.Type;

/** @group String */
export const NonEmptyTrimmedString100 = minLength(1)(TrimmedString100);
export type NonEmptyTrimmedString100 = typeof NonEmptyTrimmedString100.Type;

/** @group String */
export const NonEmptyTrimmedString1000 = minLength(1)(TrimmedString1000);
export type NonEmptyTrimmedString1000 = typeof NonEmptyTrimmedString1000.Type;

/**
 * The mnemonic, also known as a "seed phrase," is a set of 12 words in a
 * specific order chosen from a predefined list (BIP39). It provides a
 * human-readable way to store a private key securely. The mnemonic is generated
 * safely on the user's device using cryptographically secure random number
 * generation, ensuring it remains private and unique.
 *
 * @group String
 */
export const Mnemonic = brand("Mnemonic", NonEmptyTrimmedString, (value) =>
  bip39.validateMnemonic(value, wordlist)
    ? ok(value)
    : err<MnemonicError>({ type: "Mnemonic", value }),
);
export type Mnemonic = typeof Mnemonic.Type;

export interface MnemonicError extends TypeError<"Mnemonic"> {}

export const formatMnemonicError = createTypeErrorFormatter<MnemonicError>(
  (error) => `Invalid BIP39 mnemonic: ${error.value}.`,
);

/**
 * String matching a regular expression.
 *
 * ### Example
 *
 * ```ts
 * const Alphanumeric = regex("Alphanumeric", /^[a-z0-9]+$/i)(String);
 * ```
 *
 * @group String
 */
export const regex: <Name extends TypeName>(
  name: Name,
  pattern: RegExp,
) => BrandFactory<Name, string, RegexError<Name>> = (name, pattern) => {
  // Clone the regex to avoid shared state.
  const clonedPattern = new RegExp(pattern.source, pattern.flags);
  return (parent) =>
    brand(name, parent, (value) => {
      // Reset `lastIndex` before each use to ensure the regex starts matching
      // from the beginning of the string.
      clonedPattern.lastIndex = 0;
      return clonedPattern.test(value)
        ? ok(value)
        : err({ type: "Regex", name, value, pattern });
    });
};

export interface RegexError<
  Name extends TypeName = TypeName,
> extends TypeError<"Regex"> {
  readonly name: Name;
  readonly pattern: RegExp;
}

export const formatRegexError = createTypeErrorFormatter<RegexError>(
  (error) =>
    `The value ${error.value} does not match the pattern for ${error.name}: ${error.pattern}.`,
);

/**
 * URL-safe string.
 *
 * A `UrlSafeString` uses a limited alphabet that is safe for URLs:
 *
 * - Uppercase letters (`A-Z`)
 * - Lowercase letters (`a-z`)
 * - Digits (`0-9`)
 * - Dash (`-`)
 * - Underscore (`_`)
 *
 * This is the same character set used by Base64Url encoding, but this type does
 * not validate that the string is actually Base64Url-encoded data.
 *
 * ### Example
 *
 * ```ts
 * const result = UrlSafeString.from("abc123_-");
 * if (result.ok) {
 *   console.log("Valid URL-safe string:", result.value);
 * } else {
 *   console.error("Invalid URL-safe string:", result.error);
 * }
 * ```
 *
 * @group String
 */
export const UrlSafeString = regex("UrlSafeString", /^[A-Za-z0-9_-]+$/)(String);
export type UrlSafeString = typeof UrlSafeString.Type;
export type UrlSafeStringError = typeof UrlSafeString.Error;

/**
 * Base64Url without padding.
 *
 * Encode with {@link uint8ArrayToBase64Url}, decode with
 * {@link base64UrlToUint8Array}.
 *
 * @group String
 */
export const Base64Url = brand(
  "Base64Url",
  String,
  (value: string): Result<string, Base64UrlError> => {
    // Round-trip validation ensures consistency across different base64url
    // implementations (Node.js Buffer, native browser API, manual fallback).
    // Only strings that decode and encode identically are accepted.
    let roundTrip;
    try {
      roundTrip = uint8ArrayToBase64Url(
        base64UrlToUint8Array(value as Base64Url),
      );
    } catch {
      //
    }
    return roundTrip === value
      ? ok(value)
      : err<Base64UrlError>({ type: "Base64Url", value });
  },
);
export type Base64Url = typeof Base64Url.Type;
export interface Base64UrlError extends TypeError<"Base64Url"> {}

export const formatBase64UrlError = createTypeErrorFormatter<Base64UrlError>(
  (error) => `The value ${error.value} is not a valid Base64Url string.`,
);

const base64UrlOptions = { alphabet: "base64url", omitPadding: true };

/** Encodes a Uint8Array to a {@link Base64Url} string. */
export const uint8ArrayToBase64Url: (bytes: Uint8Array) => Base64Url =
  hasNodeBuffer
    ? (bytes: Uint8Array) =>
        globalThis.Buffer.from(bytes).toString("base64url") as Base64Url
    : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof (globalThis.Uint8Array.prototype as any)?.toBase64 !== "undefined"
      ? (bytes: Uint8Array) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          (bytes as any).toBase64(base64UrlOptions) as Base64Url
      : (bytes: Uint8Array) => {
          const binaryString = Array.from(bytes, (byte) =>
            globalThis.String.fromCodePoint(byte),
          ).join("");
          const base64 = globalThis.btoa(binaryString);
          return base64
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "") as Base64Url;
        };

/** Decodes a {@link Base64Url} string to a Uint8Array. */
export const base64UrlToUint8Array: (str: Base64Url) => Uint8Array =
  hasNodeBuffer
    ? (str: Base64Url) => {
        const nodeBuffer = globalThis.Buffer.from(str, "base64url");
        return new globalThis.Uint8Array(nodeBuffer);
      }
    : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof (globalThis.Uint8Array as any)?.fromBase64 !== "undefined"
      ? (str: Base64Url) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          (globalThis.Uint8Array as any).fromBase64(
            str,
            base64UrlOptions,
          ) as Uint8Array
      : (str: Base64Url) => {
          let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
          while (base64.length % 4 !== 0) {
            base64 += "=";
          }
          const binaryString = globalThis.atob(base64);
          return globalThis.Uint8Array.from(binaryString, (c) =>
            c.charCodeAt(0),
          );
        };

/**
 * Simple alphanumeric string for naming in file systems, URLs, and identifiers.
 *
 * Uses the same safe alphabet as {@link UrlSafeString} (letters, digits, `-`,
 * `_`). See `UrlSafeString` for details.
 *
 * The string must be between 1 and 64 characters.
 *
 * ### Example
 *
 * ```ts
 * const result = SimpleName.from("data-report-123");
 * if (result.ok) {
 *   console.log("Valid SimpleName string:", result.value);
 * } else {
 *   console.error("Invalid SimpleName string:", result.error);
 * }
 * ```
 *
 * @group String
 */
export const SimpleName = brand("SimpleName", UrlSafeString, (value) =>
  value.length >= 1 && value.length <= 64
    ? ok(value)
    : err<SimpleNameError>({ type: "SimpleName", value }),
);
export type SimpleName = typeof SimpleName.Type;
export interface SimpleNameError extends TypeError<"SimpleName"> {}

/**
 * Trimmed string between 8 and 64 characters, branded as `SimplePassword`.
 *
 * Take a look how `SimplePassword` is defined:
 *
 * ```ts
 * export const SimplePassword = brand(
 *   "SimplePassword",
 *   minLength(8)(maxLength(64)(TrimmedString)),
 * );
 * ```
 *
 * Nested functions are often OK (if not, make a helper), but with TC39 Hack
 * pipes it would be clearer:
 *
 * ```ts
 * // TrimmedString
 * //   |> minLength(8)(%)
 * //   |> maxLength(64)(%)
 * //   |> brand("SimplePassword", %)
 * ```
 *
 * @group String
 */
export const SimplePassword = brand(
  "SimplePassword",
  minLength(8)(maxLength(64)(TrimmedString)),
);
export type SimplePassword = typeof SimplePassword.Type;

export type SimplePasswordError = typeof SimplePassword.Error;

export const formatSimplePasswordError = (
  formatTypeError: TypeErrorFormatter<
    StringError | MinLengthError<8> | MaxLengthError<64> | TrimmedError
  >,
): TypeErrorFormatter<SimplePasswordError> =>
  createTypeErrorFormatter<SimplePasswordError>(
    (error) => `Invalid password: ${formatTypeError(error.parentError)}`,
  );

/**
 * Evolu Id: 16 bytes encoded as a 22‑character Base64Url string.
 *
 * There are three ways to create an Evolu Id:
 *
 * - {@link createId} – default cryptographically secure random bytes
 *   (privacy‑preserving)
 * - {@link createIdFromString} – deterministic: first 16 bytes of SHA‑256 of a
 *   string
 * - {@link createIdAsUuidv7} – optional: embeds timestamp bits (UUID v7 layout)
 *
 * Privacy: the default random Id does not leak creation time and is safe to
 * share or log. The UUID v7 variant leaks creation time anywhere the Id is
 * copied (logs, URLs, exports); only use it when you explicitly want insertion
 * locality for very large write‑heavy tables and accept timestamp exposure.
 *
 * ## Future
 *
 * A possible hybrid masked‑time approach (`timestamp ^ H(cluster_id, timestamp
 *
 * > > N)`) could provide locality without exposing raw creation time. See
 * > > https://brooker.co.za/blog/2025/10/22/uuidv7.html
 *
 * @group String
 */
export const Id = brand("Id", String, (value) =>
  value.length === 22 && Base64Url.fromParent(value).ok
    ? ok(value)
    : err<IdError>({ type: "Id", value }),
);
export type Id = typeof Id.Type;

export interface IdError extends TypeError<"Id"> {}

export const formatIdError = createTypeErrorFormatter<IdError>(
  (error) => `The value ${error.value} is not a valid Id.`,
);

/**
 * Creates a random {@link Id}. This is the recommended default.
 *
 * Use {@link createIdFromString} for deterministic mapping of external IDs or
 * {@link createIdAsUuidv7} when you accept timestamp leakage for index
 * locality.
 *
 * ### Example
 *
 * ```ts
 * const id = createId(deps);
 * const todoId = createId<"Todo">(deps);
 * ```
 */
export const createId = <B extends string = never>(
  deps: RandomBytesDep,
): [B] extends [never] ? Id : Id & Brand<B> => {
  const id = uint8ArrayToBase64Url(deps.randomBytes.create(16));
  return id as unknown as [B] extends [never] ? Id : Id & Brand<B>;
};

/**
 * Creates an {@link Id} from a string using SHA-256.
 *
 * When integrating with external systems that use different ID formats, use
 * this function to convert external IDs into valid Evolu IDs.
 *
 * In Evolu's CRDT, the ID serves as the unique identifier for conflict
 * resolution across distributed clients. When multiple clients create records
 * with the same external identifier, they must resolve to the same Evolu ID to
 * ensure data consistency.
 *
 * ### Example
 *
 * ```ts
 * // Both clients will generate the same ID
 * const id1 = createIdFromString("user-api-123");
 * const id2 = createIdFromString("user-api-123");
 * console.log(id1 === id2); // true
 *
 * upsert("todo", {
 *   id: createIdFromString("external-todo-456"),
 *   title: "Synced from external system",
 * });
 * ```
 *
 * **Important**: This transformation uses the first 16 bytes of SHA-256 hash of
 * the string bytes, therefore it's not possible to recover the original
 * external string from the generated {@link Id}. If you need to preserve the
 * original external ID, store it in a separate column.
 *
 * @group String
 */
export const createIdFromString = <B extends string = never>(
  value: string,
): [B] extends [never] ? Id : Id & Brand<B> => {
  const hash = sha256(utf8ToBytes(value));
  // Take first 16 bytes of hash and convert to Id
  const id = idBytesToId(hash.slice(0, 16) as IdBytes);

  return id as [B] extends [never] ? Id : Id & Brand<B>;
};

/**
 * Creates an {@link Id} embedding timestamp bits (UUID v7 layout) before
 * Base64Url encoding.
 *
 * Tradeoff: better insertion locality / index performance for huge datasets vs
 * leaking creation time everywhere the Id appears. Evolu uses {@link createId}
 * by default to avoid activity leakage; choose this only if you explicitly
 * accept timestamp exposure.
 *
 * ### Example
 *
 * ```ts
 * const id = createIdAsUuidv7({ randomBytes, time });
 * const todoId = createIdAsUuidv7<"Todo">({ randomBytes, time });
 * ```
 */
export const createIdAsUuidv7 = <B extends string = never>(
  deps: RandomBytesDep & TimeDep,
): [B] extends [never] ? Id : Id & Brand<B> => {
  const id = deps.randomBytes.create(16);

  const timestamp = globalThis.BigInt(deps.time.now());

  id[0] = globalThis.Number((timestamp >> 40n) & 0xffn);
  id[1] = globalThis.Number((timestamp >> 32n) & 0xffn);
  id[2] = globalThis.Number((timestamp >> 24n) & 0xffn);
  id[3] = globalThis.Number((timestamp >> 16n) & 0xffn);
  id[4] = globalThis.Number((timestamp >> 8n) & 0xffn);
  id[5] = globalThis.Number(timestamp & 0xffn);

  id[6] = (id[6] & 0x0f) | 0x70;
  id[8] = (id[8] & 0x3f) | 0x80;

  return id as unknown as [B] extends [never] ? Id : Id & Brand<B>;
};

/**
 * Creates a branded {@link Id} Type for a table's primary key.
 *
 * The table name becomes an additional brand for type safety.
 *
 * ### Example
 *
 * ```ts
 * const TodoId = id("Todo");
 * // string & Brand<"Id"> & Brand<"Todo">
 * type TodoId = typeof TodoId.Type;
 * ```
 *
 * @group String
 */
export const id = <Table extends TypeName>(table: Table): TableId<Table> => {
  const fromUnknown = (value: unknown) => {
    const parentResult = String.fromUnknown(value);
    if (!parentResult.ok) return parentResult;
    return fromParent(parentResult.value);
  };

  const fromParent = (value: string) => {
    const idResult = Id.fromParent(value);
    if (!idResult.ok) {
      return err<TableIdError<Table>>({ type: "TableId", value, table });
    }
    return ok(idResult.value as Id & Brand<Table>);
  };

  return {
    ...createType("Id", { fromUnknown, fromParent }),
    table,
  };
};

export interface TableId<Table extends TypeName> extends Type<
  "Id",
  string & Brand<"Id"> & Brand<Table>,
  string,
  TableIdError<Table>,
  string,
  StringError
> {
  table: Table;
}

export interface TableIdError<
  Table extends TypeName = TypeName,
> extends TypeError<"TableId"> {
  readonly table: Table;
}

export const formatTableIdError = createTypeErrorFormatter<TableIdError>(
  (error) => `Invalid Id for table ${error.table}: ${error.value}.`,
);

/** Binary representation of an {@link Id}. */
export const IdBytes = brand("IdBytes", length(16)(Uint8Array));
export type IdBytes = typeof IdBytes.Type;

export const idBytesTypeValueLength = 16 as NonNegativeInt;

export const idToIdBytes = (id: Id): IdBytes =>
  // Id is Base64Url (validated by Id.from), cast is safe
  base64UrlToUint8Array(id as unknown as Base64Url) as IdBytes;

export const idBytesToId = (idBytes: IdBytes): Id =>
  // Base64Url encoding of 16 bytes always produces valid Id (22 chars)
  uint8ArrayToBase64Url(idBytes) as unknown as Id;

/**
 * Positive number (> 0).
 *
 * ### Example
 *
 * ```ts
 * const PositiveNumber = positive(Number);
 *
 * const result = PositiveNumber.from(42); // ok
 * const errorResult = PositiveNumber.from(-5); // err
 * ```
 *
 * @group Number
 */
export const positive: BrandFactory<"Positive", number, PositiveError> = (
  parent,
) =>
  brand("Positive", parent, (value) =>
    value > 0 ? ok(value) : err<PositiveError>({ type: "Positive", value }),
  );

export interface PositiveError extends TypeError<"Positive"> {}

export const formatPositiveError = createTypeErrorFormatter<PositiveError>(
  (error) => `The value ${error.value} must be positive (> 0).`,
);

/**
 * Negative number (< 0).
 *
 * ### Example
 *
 * ```ts
 * const NegativeNumber = negative(Number);
 * ```
 *
 * @group Number
 */
export const negative: BrandFactory<"Negative", number, NegativeError> = (
  parent,
) =>
  brand("Negative", parent, (value) =>
    value < 0 ? ok(value) : err<NegativeError>({ type: "Negative", value }),
  );

export interface NegativeError extends TypeError<"Negative"> {}

export const formatNegativeError = createTypeErrorFormatter<NegativeError>(
  (error) => `The value ${error.value} must be negative (< 0).`,
);

/**
 * Non-positive number (≤ 0).
 *
 * ### Example
 *
 * ```ts
 * const NonPositiveNumber = nonPositive(Number);
 * ```
 *
 * @group Number
 */
export const nonPositive: BrandFactory<
  "NonPositive",
  number,
  NonPositiveError
> = (parent) =>
  brand("NonPositive", parent, (value) =>
    value <= 0
      ? ok(value)
      : err<NonPositiveError>({ type: "NonPositive", value }),
  );

export interface NonPositiveError extends TypeError<"NonPositive"> {}

export const formatNonPositiveError =
  createTypeErrorFormatter<NonPositiveError>(
    (error) => `The value ${error.value} must be non-positive (≤ 0).`,
  );

/**
 * Non-negative number (≥ 0).
 *
 * ### Example
 *
 * ```ts
 * const NonNegativeNumber = nonNegative(Number);
 * ```
 *
 * @group Number
 */
export const nonNegative: BrandFactory<
  "NonNegative",
  number,
  NonNegativeError
> = (parent) =>
  brand("NonNegative", parent, (value) =>
    value >= 0
      ? ok(value)
      : err<NonNegativeError>({ type: "NonNegative", value }),
  );

export interface NonNegativeError extends TypeError<"NonNegative"> {}

export const formatNonNegativeError =
  createTypeErrorFormatter<NonNegativeError>(
    (error) => `The value ${error.value} must be non-negative (≥ 0).`,
  );

/**
 * Non-negative number (≥ 0).
 *
 * @group Number
 */
export const NonNegativeNumber = nonNegative(Number);
export type NonNegativeNumber = typeof NonNegativeNumber.Type;

/**
 * Positive number (> 0).
 *
 * @group Number
 */
export const PositiveNumber = positive(NonNegativeNumber);
export type PositiveNumber = typeof PositiveNumber.Type;

/**
 * Non-positive number (≤ 0).
 *
 * @group Number
 */
export const NonPositiveNumber = nonPositive(Number);
export type NonPositiveNumber = typeof NonPositiveNumber.Type;

/**
 * Negative number (< 0).
 *
 * @group Number
 */
export const NegativeNumber = negative(NonPositiveNumber);
export type NegativeNumber = typeof NegativeNumber.Type;

/**
 * Integer within the safe range of JavaScript numbers.
 *
 * ### Example
 *
 * ```ts
 * const Int = int(Number);
 * ```
 *
 * @group Number
 */
export const int: BrandFactory<"Int", number, IntError> = (parent) =>
  brand("Int", parent, (value) =>
    globalThis.Number.isSafeInteger(value)
      ? ok(value)
      : err<IntError>({ type: "Int", value }),
  );

export interface IntError extends TypeError<"Int"> {}

export const formatIntError = createTypeErrorFormatter<IntError>(
  (error) => `The value ${error.value} must be an integer.`,
);

/**
 * Integer within the safe range of JavaScript numbers.
 *
 * @group Number
 */
export const Int = int(Number);
export type Int = typeof Int.Type;

/**
 * Non-negative integer (≥ 0).
 *
 * @group Number
 */
export const NonNegativeInt = nonNegative(Int);
export type NonNegativeInt = typeof NonNegativeInt.Type;

/**
 * Positive integer (> 0).
 *
 * @group Number
 */
export const PositiveInt = positive(NonNegativeInt);
export type PositiveInt = typeof PositiveInt.Type;

/** Minimum {@link PositiveInt} value (1). */
export const minPositiveInt = PositiveInt.orThrow(1);

/** Maximum {@link PositiveInt} value (MAX_SAFE_INTEGER). */
export const maxPositiveInt = PositiveInt.orThrow(
  globalThis.Number.MAX_SAFE_INTEGER,
);

/**
 * Non-positive integer (≤ 0).
 *
 * @group Number
 */
export const NonPositiveInt = nonPositive(Int);
export type NonPositiveInt = typeof NonPositiveInt.Type;

/**
 * Negative integer (< 0).
 *
 * @group Number
 */
export const NegativeInt = negative(NonPositiveInt);
export type NegativeInt = typeof NegativeInt.Type;

/**
 * Number greater than a specified value.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * @group Number
 */
export const greaterThan: <Min extends number>(
  min: Min,
) => BrandFactory<`GreaterThan${Min}`, number, GreaterThanError<Min>> =
  (min) => (parent) =>
    brand(`GreaterThan${min}`, parent, (value) =>
      value > min ? ok(value) : err({ type: "GreaterThan", value, min }),
    );

export interface GreaterThanError<
  Min extends number = number,
> extends TypeError<"GreaterThan"> {
  readonly min: Min;
}

export const formatGreaterThanError =
  createTypeErrorFormatter<GreaterThanError>(
    (error) => `The value ${error.value} is not > ${error.min}.`,
  );

/**
 * Number less than a specified value.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * @group Number
 */
export const lessThan: <Max extends number>(
  max: Max,
) => BrandFactory<`LessThan${Max}`, number, LessThanError<Max>> =
  (max) => (parent) =>
    brand(`LessThan${max}`, parent, (value) =>
      value < max ? ok(value) : err({ type: "LessThan", value, max }),
    );

export interface LessThanError<
  Max extends number = number,
> extends TypeError<"LessThan"> {
  readonly max: Max;
}

export const formatLessThanError = createTypeErrorFormatter<LessThanError>(
  (error) => `The value ${error.value} is not < ${error.max}.`,
);

/**
 * Number ≥ a specified value.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * @group Number
 */
export const greaterThanOrEqualTo: <Min extends number>(
  min: Min,
) => BrandFactory<
  `GreaterThanOrEqualTo${Min}`,
  number,
  GreaterThanOrEqualToError<Min>
> = (min) => (parent) =>
  brand(`GreaterThanOrEqualTo${min}`, parent, (value) =>
    value >= min
      ? ok(value)
      : err({ type: "GreaterThanOrEqualTo", value, min }),
  );

export interface GreaterThanOrEqualToError<
  Min extends number = number,
> extends TypeError<"GreaterThanOrEqualTo"> {
  readonly min: Min;
}

export const formatGreaterThanOrEqualToError =
  createTypeErrorFormatter<GreaterThanOrEqualToError>(
    (error) => `The value ${error.value} is not >= ${error.min}.`,
  );

/**
 * Number ≤ a specified value.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * @group Number
 */
export const lessThanOrEqualTo: <Max extends number>(
  max: Max,
) => BrandFactory<
  `LessThanOrEqualTo${Max}`,
  number,
  LessThanOrEqualToError<Max>
> = (max) => (parent) =>
  brand(`LessThanOrEqualTo${max}`, parent, (value) =>
    value <= max ? ok(value) : err({ type: "LessThanOrEqualTo", value, max }),
  );

export interface LessThanOrEqualToError<
  Max extends number = number,
> extends TypeError<"LessThanOrEqualTo"> {
  readonly max: Max;
}

export const formatLessThanOrEqualToError =
  createTypeErrorFormatter<LessThanOrEqualToError>(
    (error) => `The value ${error.value} is not <= ${error.max}.`,
  );

/**
 * Number that is not NaN.
 *
 * @group Number
 */
export const nonNaN: BrandFactory<"NonNaN", number, NonNaNError> = (parent) =>
  brand("NonNaN", parent, (value) =>
    !globalThis.Number.isNaN(value)
      ? ok(value)
      : err<NonNaNError>({ type: "NonNaN", value }),
  );

export interface NonNaNError extends TypeError<"NonNaN"> {}

export const formatNonNaNError = createTypeErrorFormatter<NonNaNError>(
  () => `The value must not be NaN.`,
);

/** @group Number */
export const NonNaNNumber = nonNaN(Number);
export type NonNaNNumber = typeof NonNaNNumber.Type;

/**
 * Finite number.
 *
 * @group Number
 */
export const finite: BrandFactory<"Finite", number, FiniteError> = (parent) =>
  brand("Finite", parent, (value) =>
    globalThis.Number.isFinite(value)
      ? ok(value)
      : err<FiniteError>({ type: "Finite", value }),
  );

export interface FiniteError extends TypeError<"Finite"> {}

export const formatFiniteError = createTypeErrorFormatter<FiniteError>(
  (error) => `The value ${error.value} must be finite.`,
);

/**
 * Finite number.
 *
 * This Type ensures that a number is finite.
 *
 * **Why is this important?**
 *
 * `JSON.stringify` serializes JavaScript numbers into `null` if they are not
 * finite (e.g., `Infinity`, `-Infinity`, or `NaN`). Using `FiniteNumber` helps
 * prevent these unexpected behaviors when working with JSON serialization.
 *
 * @group Number
 */
export const FiniteNumber = finite(Number);
export type FiniteNumber = typeof FiniteNumber.Type;

/**
 * Number that is a multiple of a divisor.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * @group Number
 */
export const multipleOf: <Divisor extends number>(
  divisor: Divisor,
) => BrandFactory<`MultipleOf${Divisor}`, number, MultipleOfError<Divisor>> =
  (divisor) => (parent) =>
    brand(`MultipleOf${divisor}`, parent, (value) =>
      value % divisor === 0
        ? ok(value)
        : err({ type: "MultipleOf", value, divisor }),
    );

export interface MultipleOfError<
  Divisor extends number = number,
> extends TypeError<"MultipleOf"> {
  readonly divisor: Divisor;
}

export const formatMultipleOfError = createTypeErrorFormatter<MultipleOfError>(
  (error) => `The value ${error.value} is not a multiple of ${error.divisor}.`,
);

/**
 * Number within a range, inclusive.
 *
 * Use numeric literal, not expression. See {@link BrandFactory}.
 *
 * ### Example
 *
 * ```ts
 * const Between1And10 = between(1, 10)(PositiveNumber);
 * const result = Between1And10.from(5); // ok(5)
 * const errorResult = Between1And10.from(11); // err
 * ```
 *
 * @group Number
 */
export const between: <Min extends number, Max extends number>(
  min: Min,
  max: Max,
) => BrandFactory<`Between${Min}-${Max}`, number, BetweenError<Min, Max>> =
  (min, max) => (parent) =>
    brand(`Between${min}-${max}`, parent, (value) =>
      value >= min && value <= max
        ? ok(value)
        : err({ type: "Between", value, min, max }),
    );

export interface BetweenError<
  Min extends number = number,
  Max extends number = number,
> extends TypeError<"Between"> {
  readonly min: Min;
  readonly max: Max;
}

export const formatBetweenError = createTypeErrorFormatter<BetweenError>(
  (error) =>
    `The value ${error.value} is not between ${error.min} and ${error.max}, inclusive.`,
);

/**
 * Literal {@link Type}.
 *
 * https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types
 *
 * ### Example
 *
 * ```ts
 * const LiteralHello = literal("Hello");
 * const result = LiteralHello.from("Hello"); // ok("Hello")
 * const errorResult = LiteralHello.from("World"); // err
 * ```
 *
 * TODO: Add JsonValue
 *
 * @group Base Factories
 */
export const literal = <T extends Literal>(expected: T): LiteralType<T> => {
  const fromUnknown = (value: unknown): Result<T, LiteralError<T>> =>
    value === expected
      ? ok(expected)
      : err<LiteralError<T>>({ type: "Literal", value, expected });

  return {
    ...createType("Literal", {
      fromUnknown,
      fromParent: ok,
    }),
    expected,
  } as LiteralType<T>;
};

export interface LiteralType<T extends Literal> extends Type<
  "Literal",
  T,
  WidenLiteral<T>,
  LiteralError<T>
> {
  expected: T;
}

export interface LiteralError<
  T extends Literal = Literal,
> extends TypeError<"Literal"> {
  readonly expected: T;
}

export const formatLiteralError = createTypeErrorFormatter<LiteralError>(
  (error) =>
    `The value ${error.value} is not strictly equal to the expected literal: ${globalThis.String(
      error.expected,
    )}.`,
);

/**
 * Array of a specific {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * const NumberArray = array(Number);
 *
 * const result1 = NumberArray.from([1, 2, 3]); // ok([1, 2, 3])
 * const result2 = NumberArray.from(["a", "b"]); // err(...)
 * ```
 *
 * @group Base Factories
 * @group Array
 */
export const array = <ElementType extends AnyType>(
  element: ElementType,
): ArrayType<ElementType> => {
  const fromUnknown = (
    value: unknown,
  ): Result<
    ReadonlyArray<InferType<ElementType>>,
    ArrayError<InferErrors<ElementType>>
  > => {
    if (!Array.isArray(value)) {
      return err<ArrayError<InferErrors<ElementType>>>({
        type: "Array",
        value,
        reason: { kind: "NotArray" },
      });
    }

    const result: Array<InferType<ElementType>> = [];
    for (let i = 0; i < value.length; i++) {
      const elementResult = element.fromUnknown(value[i]);
      if (!elementResult.ok) {
        return err<ArrayError<InferErrors<ElementType>>>({
          type: "Array",
          value,
          reason: {
            kind: "Element",
            index: i,
            error: elementResult.error as InferErrors<ElementType>,
          },
        });
      }
      result.push(elementResult.value as InferType<ElementType>);
    }

    return ok(result);
  };

  const fromParent = (
    value: ReadonlyArray<InferParent<ElementType>>,
  ): Result<
    ReadonlyArray<InferType<ElementType>>,
    ArrayError<InferError<ElementType>>
  > => {
    const result: Array<InferType<ElementType>> = [];
    for (let i = 0; i < value.length; i++) {
      const elementResult = element.fromParent(value[i]);
      if (!elementResult.ok) {
        return err({
          type: "Array",
          value,
          reason: {
            kind: "Element",
            index: i,
            error: elementResult.error as InferError<ElementType>,
          },
        });
      }
      result.push(elementResult.value as InferType<ElementType>);
    }
    return ok(result);
  };

  return {
    ...createType("Array", { fromUnknown, fromParent }),
    element,
  };
};

/** ArrayType extends Type with an additional `element` property for reflection. */
export interface ArrayType<ElementType extends AnyType> extends Type<
  "Array",
  ReadonlyArray<InferType<ElementType>>,
  ReadonlyArray<InferInput<ElementType>>,
  ArrayError<InferError<ElementType>>,
  ReadonlyArray<InferParent<ElementType>>,
  ArrayError<InferParentError<ElementType>>
> {
  readonly element: ElementType;
}

export interface ArrayError<
  Error extends TypeError = TypeError,
> extends TypeErrorWithReason<
  "Array",
  | { readonly kind: "NotArray" }
  | {
      readonly kind: "Element";
      readonly index: number;
      readonly error: Error;
    }
> {}

export const formatArrayError = <Error extends TypeError>(
  formatTypeError: TypeErrorFormatter<Error>,
): TypeErrorFormatter<ArrayError<Error>> =>
  createTypeErrorFormatter((error) => {
    switch (error.reason.kind) {
      case "NotArray":
        return `Expected an array but received ${error.value}.`;
      case "Element":
        return `Invalid element at index ${error.reason.index}: ${formatTypeError(error.reason.error)}`;
    }
  });

/**
 * Set of a specific {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * const NumberSet = set(Number);
 *
 * const result1 = NumberSet.from(new Set([1, 2, 3])); // ok(Set { 1, 2, 3 })
 * const result2 = NumberSet.from(new Set(["a", "b"])); // err(...)
 * ```
 *
 * @group Base Factories
 */
export const set = <ElementType extends AnyType>(
  element: ElementType,
): SetType<ElementType> => {
  const fromUnknown = (
    value: unknown,
  ): Result<
    ReadonlySet<InferType<ElementType>>,
    SetError<InferErrors<ElementType>>
  > => {
    if (!(value instanceof globalThis.Set)) {
      return err<SetError<InferErrors<ElementType>>>({
        type: "Set",
        value,
        reason: { kind: "NotSet" },
      });
    }

    let index = 0;
    for (const item of value) {
      const elementResult = element.fromUnknown(item);
      if (!elementResult.ok) {
        return err<SetError<InferErrors<ElementType>>>({
          type: "Set",
          value,
          reason: {
            kind: "Element",
            index,
            error: elementResult.error as InferErrors<ElementType>,
          },
        });
      }
      index++;
    }

    return ok(value as ReadonlySet<InferType<ElementType>>);
  };

  const fromParent = (
    value: ReadonlySet<InferParent<ElementType>>,
  ): Result<
    ReadonlySet<InferType<ElementType>>,
    SetError<InferError<ElementType>>
  > => {
    let index = 0;
    for (const item of value) {
      const elementResult = element.fromParent(item);
      if (!elementResult.ok) {
        return err({
          type: "Set",
          value,
          reason: {
            kind: "Element",
            index,
            error: elementResult.error as InferError<ElementType>,
          },
        });
      }
      index++;
    }
    return ok(value as ReadonlySet<InferType<ElementType>>);
  };

  return {
    ...createType("Set", { fromUnknown, fromParent }),
    element,
  };
};

/** SetType extends Type with an additional `element` property for reflection. */
export interface SetType<ElementType extends AnyType> extends Type<
  "Set",
  ReadonlySet<InferType<ElementType>>,
  ReadonlySet<InferInput<ElementType>>,
  SetError<InferError<ElementType>>,
  ReadonlySet<InferParent<ElementType>>,
  SetError<InferParentError<ElementType>>
> {
  readonly element: ElementType;
}

export interface SetError<
  Error extends TypeError = TypeError,
> extends TypeErrorWithReason<
  "Set",
  | { readonly kind: "NotSet" }
  | {
      readonly kind: "Element";
      readonly index: number;
      readonly error: Error;
    }
> {}

export const formatSetError = <Error extends TypeError>(
  formatTypeError: TypeErrorFormatter<Error>,
): TypeErrorFormatter<SetError<Error>> =>
  createTypeErrorFormatter((error) => {
    switch (error.reason.kind) {
      case "NotSet":
        return `Expected a Set but received ${error.value}.`;
      case "Element":
        return `Invalid element at index ${error.reason.index}: ${formatTypeError(error.reason.error)}`;
    }
  });

/**
 * Record of a key {@link Type} and value {@link Type}.
 *
 * - The input must be a plain object (validated by {@link isPlainObject}).
 * - Each key is validated/transformed by the `key` Type.
 * - Each value is validated/transformed by the `value` Type.
 *
 * The resulting type is `Readonly<Record<KeyT, ValueT>>`.
 *
 * ### Example
 *
 * ```ts
 * const StringToNumberRecord = record(String, Number);
 *
 * // ok({ "a": 1, "b": 2 })
 * StringToNumberRecord.from({ a: 1, b: 2 });
 *
 * // err => "Key" because 42 is not a string key
 * StringToNumberRecord.from({ 42: 1, b: 2 });
 *
 * // err => "Value" because "x" is not a number
 * StringToNumberRecord.from({ a: "x", b: 2 });
 * ```
 *
 * @group Base Factories
 * @group Object
 */
export const record = <
  KeyName extends TypeName,
  KeyT extends string,
  KeyInput extends string,
  KeyError extends TypeError,
  KeyParent extends string,
  KeyParentError extends TypeError,
  Value extends AnyType,
>(
  keyType: Type<KeyName, KeyT, KeyInput, KeyError, KeyParent, KeyParentError>,
  valueType: Value,
): RecordType<
  KeyName,
  KeyT,
  KeyInput,
  KeyError,
  KeyParent,
  KeyParentError,
  Value
> => {
  const fromUnknown = (
    value: unknown,
  ): Result<
    Record<KeyT, InferType<Value>>,
    RecordError<KeyError, InferError<Value>>
  > => {
    if (!isPlainObject(value)) {
      return err({
        type: "Record",
        value,
        reason: { kind: "NotRecord" },
      });
    }

    const result: Record<KeyT, InferType<Value>> = {} as Record<
      KeyT,
      InferType<Value>
    >;
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const keyResult = keyType.fromUnknown(rawKey);
      if (!keyResult.ok) {
        return err({
          type: "Record",
          value,
          reason: { kind: "Key", key: rawKey, error: keyResult.error },
        } as IntentionalNever);
      }

      const valueResult = valueType.fromUnknown(rawValue);
      if (!valueResult.ok) {
        return err({
          type: "Record",
          value,
          reason: {
            kind: "Value",
            key: rawKey,
            error: valueResult.error as IntentionalNever,
          },
        });
      }

      result[keyResult.value] = valueResult.value as IntentionalNever;
    }

    return ok(result);
  };

  const fromParent = (
    value: Readonly<Record<KeyParent, InferParent<Value>>>,
  ): Result<
    Record<KeyT, InferType<Value>>,
    RecordError<KeyError, InferError<Value>>
  > => {
    const result: Record<KeyT, InferType<Value>> = {} as Record<
      KeyT,
      InferType<Value>
    >;

    for (const [rawKey, rawValue] of Object.entries(value)) {
      const keyResult = keyType.fromParent(rawKey as KeyParent);
      if (!keyResult.ok) {
        return err<RecordError<KeyError, InferError<Value>>>({
          type: "Record",
          value,
          reason: {
            kind: "Key",
            key: rawKey,
            error: keyResult.error,
          },
        });
      }

      const valueResult = valueType.fromParent(rawValue);
      if (!valueResult.ok) {
        return err({
          type: "Record",
          value,
          reason: {
            kind: "Value",
            key: keyResult.value,
            error: valueResult.error as InferError<Value>,
          },
        });
      }

      result[keyResult.value] = valueResult.value as InferType<Value>;
    }

    return ok(result);
  };

  return {
    ...createType("Record", {
      fromUnknown,
      fromParent,
    }),
    key: keyType,
    value: valueType,
  } as IntentionalNever;
};

/**
 * RecordType extends {@link Type} with additional `key` and `value` properties
 * for reflection.
 */
export interface RecordType<
  KeyName extends TypeName,
  KeyT extends string,
  KeyInput extends string,
  KeyError extends TypeError,
  KeyParent extends string,
  KeyParentError extends TypeError,
  Value extends AnyType = AnyType,
> extends Type<
  "Record",
  Readonly<Record<KeyT, InferType<Value>>>,
  Readonly<Record<KeyInput, InferInput<Value>>>,
  RecordError<KeyError, InferError<Value>>,
  Readonly<Record<KeyParent, InferParent<Value>>>,
  RecordError<KeyParentError, InferParentError<Value>>
> {
  readonly key: Type<
    KeyName,
    KeyT,
    KeyInput,
    KeyError,
    KeyParent,
    KeyParentError
  >;
  readonly value: Value;
}

export interface RecordError<
  KeyError extends TypeError = TypeError,
  ValueError extends TypeError = TypeError,
> extends TypeErrorWithReason<
  "Record",
  | { readonly kind: "NotRecord" }
  | {
      readonly kind: "Key";
      readonly key: unknown;
      readonly error: KeyError;
    }
  | {
      readonly kind: "Value";
      readonly key: unknown;
      readonly error: ValueError;
    }
> {}

export const formatRecordError = <Error extends TypeError>(
  formatTypeError: TypeErrorFormatter<Error>,
): TypeErrorFormatter<RecordError<Error, Error>> =>
  createTypeErrorFormatter((error) => {
    switch (error.reason.kind) {
      case "NotRecord":
        return `Expected a record (plain object) but received ${error.value}.`;
      case "Key":
        return `Invalid key ${error.reason.key}: ${formatTypeError(error.reason.error)}`;
      case "Value":
        return `Invalid value for key ${error.reason.key}: ${formatTypeError(error.reason.error)}`;
    }
  });

/**
 * Object {@link Type}.
 *
 * This validates that:
 *
 * - The value is a plain object (checked with {@link isPlainObject}).
 * - The object has no extra properties beyond the specified keys unless an index
 *   signature is provided.
 * - Each property's value matches the specified Type.
 *
 * When an index signature is included, the object can have additional keys that
 * conform to the specified key and value Types.
 *
 * The resulting `ObjectType` includes `props` for reflection, which defines the
 * expected structure, and optionally an `record` for flexible key/value pairs.
 *
 * https://www.typescriptlang.org/docs/handbook/2/objects.html#index-signatures
 *
 * ### Example
 *
 * ## Basic Object Validation
 *
 * ```ts
 * const User = object({
 *   name: NonEmptyTrimmedString,
 *   age: PositiveNumber,
 * });
 * interface User extends InferType<typeof User> {}
 *
 * const result = User.from({ name: "John", age: 30 }); // ok({ name: "John", age: 30 })
 * const error = User.from({ name: "John", age: -5 }); // err
 * ```
 *
 * ## Optional Properties
 *
 * In this example the `age` property is marked as optional using
 * {@link optional}.
 *
 * ```ts
 * const User = object({
 *   name: NonEmptyString, // Required
 *   age: optional(PositiveNumber), // Optional
 * });
 * interface User extends InferType<typeof User> {}
 * ```
 *
 * ## Allowing Additional Properties
 *
 * ```ts
 * const UserWithAnyExtraProperties = object(
 *   {
 *     name: NonEmptyString,
 *     age: PositiveNumber,
 *   },
 *   record(String, Unknown),
 * );
 *
 * expect(
 *   UserWithAnyExtraProperties.from({ name: "a", age: 1, foo: 1 }),
 * ).toEqual({
 *   ok: true,
 *   value: { age: 1, foo: 1, name: "a" },
 * });
 * ```
 *
 * ## Combining Fixed and Flexible Properties
 *
 * ```ts
 * const NumberDictionary = object(
 *   { length: Number },
 *   record(String, Number),
 * );
 *
 * const validInput = {
 *   length: 5,
 *   extraKey1: 10,
 *   extraKey2: 15,
 * };
 *
 * const fromResult = NumberDictionary.from(validInput);
 * expect(fromResult).toEqual(ok(validInput));
 *
 * const invalidInput = {
 *   length: 5,
 *   extraKey1: "not a number",
 *   extraKey2: 15,
 * };
 *
 * const invalidFromResult = NumberDictionary.fromUnknown(invalidInput);
 * expect(invalidFromResult).toEqual(
 *   err({
 *     type: "Object",
 *     value: invalidInput,
 *     reason: {
 *       kind: "IndexValue",
 *       key: "extraKey1",
 *       error: { type: "Number", value: "not a number" },
 *     },
 *   }),
 * );
 * ```
 *
 * @group Base Factories
 * @group Object
 */
export function object<Props extends Record<string, AnyType>>(
  props: Props,
): ObjectType<Props>;

export function object<
  Props extends Record<string, AnyType>,
  KeyName extends TypeName,
  KeyT extends string,
  KeyInput extends string,
  KeyError extends TypeError,
  KeyParent extends string,
  KeyParentError extends TypeError,
  Value extends AnyType,
>(
  props: Props,
  record: RecordType<
    KeyName,
    KeyT,
    KeyInput,
    KeyError,
    KeyParent,
    KeyParentError,
    Value
  >,
): ObjectWithRecordType<
  Props,
  KeyName,
  KeyT,
  KeyInput,
  KeyError,
  KeyParent,
  KeyParentError,
  Value
>;

export function object(
  props: Record<string, AnyType>,
  record?: RecordType<any, any, any, any, any, any>,
): any {
  /* eslint-disable */
  const propKeys = Object.keys(props);

  const fromUnknown = (
    value: unknown,
  ): Result<
    any,
    ObjectError<Record<string, any>> | ObjectWithRecordError<any, any, any>
  > => {
    if (!isPlainObject(value)) {
      return err({
        type: record ? "ObjectWithRecord" : "Object",
        value,
        reason: { kind: "NotObject" },
      });
    }

    const errors: Record<string, any> = {};
    const result: Record<string, any> = {};

    for (const key of propKeys) {
      if (!(key in value) && isOptionalType(props[key])) {
        continue;
      }

      const propResult = props[key].fromUnknown(value[key]);
      if (!propResult.ok) {
        errors[key] = propResult.error as IntentionalNever;
      } else {
        result[key] = propResult.value as IntentionalNever;
      }
    }

    const extraKeys = Object.keys(value).filter(
      (key) => !propKeys.includes(key),
    );

    if (record) {
      for (const key of extraKeys) {
        const keyResult = record.key.fromUnknown(key);
        if (!keyResult.ok) {
          return err({
            type: "ObjectWithRecord",
            value,
            reason: {
              kind: "IndexKey",
              key,
              error: keyResult.error as IntentionalNever,
            },
          });
        }

        const valueResult = record.value.fromUnknown(value[key]);
        if (!valueResult.ok) {
          return err({
            type: "ObjectWithRecord",
            value,
            reason: {
              kind: "IndexValue",
              key,
              error: valueResult.error as IntentionalNever,
            },
          });
        }

        result[keyResult.value] = valueResult.value as IntentionalNever;
      }
    } else if (extraKeys.length > 0) {
      return err({
        type: "Object",
        value,
        reason: { kind: "ExtraKeys", extraKeys },
      });
    }

    if (Object.keys(errors).length > 0) {
      return err({
        type: record ? "ObjectWithRecord" : "Object",
        value,
        reason: { kind: "Props", errors },
      });
    }

    return ok(result);
  };

  const fromParent = (value: any): Result<any, any> => {
    const errors: Record<string, any> = {};
    const result: Record<string, any> = {};

    for (const key of propKeys) {
      if (!(key in value) && isOptionalType(props[key])) {
        continue;
      }
      const propResult = props[key].fromParent(value[key]);
      if (!propResult.ok) {
        errors[key] = propResult.error;
      } else {
        result[key] = propResult.value;
      }
    }

    if (record) {
      for (const [key, val] of Object.entries(value)) {
        if (!propKeys.includes(key)) {
          const keyResult = record.key.fromParent(key);
          if (!keyResult.ok) {
            return err({
              type: "ObjectWithRecord",
              value,
              reason: { kind: "IndexKey", key, error: keyResult.error },
            });
          }
          const valueResult = record.value.fromParent(val);
          if (!valueResult.ok) {
            return err({
              type: "ObjectWithRecord",
              value,
              reason: { kind: "IndexValue", key, error: valueResult.error },
            });
          }
          result[keyResult.value] = valueResult.value;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return err({
        type: record ? "ObjectWithRecord" : "Object",
        value,
        reason: { kind: "Props", errors },
      });
    }

    return ok(result);
  };

  return {
    ...createType(record ? "ObjectWithRecord" : "Object", {
      fromUnknown,
      fromParent,
    }),
    props,
    ...(record ? { record } : {}),
  };
  /* eslint-enable */
}

/**
 * ObjectType extends {@link Type} with an additional `props` property for
 * reflection.
 */
export interface ObjectType<Props extends Record<string, AnyType>> extends Type<
  "Object",
  Readonly<ObjectT<Props>>,
  Readonly<ObjectInput<Props>>,
  ObjectError<{ [K in keyof Props]: InferError<Props[K]> }>,
  Readonly<ObjectParent<Props>>,
  ObjectError<{ [K in keyof Props]: InferParentError<Props[K]> }>
> {
  readonly props: Props;
}

type ObjectT<Props extends Record<string, AnyType>> = Simplify<
  {
    [K in RequiredKeys<Props>]: InferType<Props[K]>;
  } & {
    [K in OptionalKeys<Props>]?: Props[K] extends OptionalType<infer U>
      ? InferType<U>
      : never;
  }
>;

type ObjectInput<Props extends Record<string, AnyType>> = Simplify<
  {
    [K in RequiredKeys<Props>]: InferInput<Props[K]>;
  } & {
    [K in OptionalKeys<Props>]?: Props[K] extends OptionalType<infer U>
      ? InferInput<U>
      : never;
  }
>;

type ObjectParent<Props extends Record<string, AnyType>> = Simplify<
  {
    [K in RequiredKeys<Props>]: InferParent<Props[K]>;
  } & {
    [K in OptionalKeys<Props>]?: Props[K] extends OptionalType<infer U>
      ? InferParent<U>
      : never;
  }
>;

type RequiredKeys<Props extends Record<string, AnyType>> = Exclude<
  keyof Props,
  OptionalKeys<Props>
>;

type OptionalKeys<Props extends Record<string, AnyType>> = {
  [K in keyof Props]: Props[K] extends OptionalType<any> ? K : never;
}[keyof Props];

export interface ObjectError<
  PropsErrors extends Record<string, TypeError> = Record<string, TypeError>,
> extends TypeErrorWithReason<
  "Object",
  | { readonly kind: "NotObject" }
  | {
      readonly kind: "Props";
      readonly errors: Partial<PropsErrors>;
    }
  | { readonly kind: "ExtraKeys"; readonly extraKeys: ReadonlyArray<string> }
> {}

/**
 * Merge Error and ParentError into one ObjectError so tooltips and error
 * messages are easier to read.
 *
 * @group Utilities
 */
export type MergeObjectTypeErrors<T extends ObjectType<any>> =
  T extends ObjectType<infer Props>
    ? ObjectError<{ [K in keyof Props]: InferErrors<Props[K]> }>
    : never;

export const formatObjectError = <Error extends TypeError>(
  formatTypeError: TypeErrorFormatter<Error>,
): TypeErrorFormatter<ObjectError<Record<string, Error>>> =>
  createTypeErrorFormatter((error) => {
    switch (error.reason.kind) {
      case "NotObject":
        return `Expected a plain object but received ${error.value}`;
      case "ExtraKeys":
        return `Unexpected extra keys: ${error.reason.extraKeys.join(", ")}`;
      case "Props": {
        const formattedErrors = Object.entries(error.reason.errors)
          .filter(([, error]) => error !== undefined)
          .map(([key, error]) => `- ${key}: ${formatTypeError(error!)}`)
          .join("\n");
        return `Invalid object properties:\n${formattedErrors}`;
      }
    }
  });

/**
 * ObjectWithRecordType extends {@link Type} with additional `props` and `record`
 * properties for reflection.
 */
export interface ObjectWithRecordType<
  Props extends Record<string, AnyType>,
  KeyName extends TypeName,
  KeyT extends string,
  KeyInput extends string,
  KeyError extends TypeError,
  KeyParent extends string,
  KeyParentError extends TypeError,
  Value extends AnyType,
> extends Type<
  "ObjectWithRecord",
  Readonly<ObjectT<Props>> & Readonly<Record<KeyT, InferType<Value>>>,
  Readonly<ObjectInput<Props>> & Readonly<Record<KeyInput, InferInput<Value>>>,
  ObjectWithRecordError<
    { [K in keyof Props]: InferError<Props[K]> },
    KeyError,
    InferError<Value>
  >,
  Readonly<ObjectParent<Props>> &
    Readonly<Record<KeyParent, InferParent<Value>>>,
  ObjectWithRecordError<
    { [K in keyof Props]: InferParentError<Props[K]> },
    KeyParentError,
    InferParentError<Value>
  >
> {
  readonly props: Props;
  readonly record: RecordType<
    KeyName,
    KeyT,
    KeyInput,
    KeyError,
    KeyParent,
    KeyParentError,
    Value
  >;
}

export interface ObjectWithRecordError<
  PropsErrors extends Record<string, TypeError> = Record<string, TypeError>,
  KeyError extends TypeError = TypeError,
  ValueError extends TypeError = TypeError,
> extends TypeErrorWithReason<
  "ObjectWithRecord",
  | { readonly kind: "NotObject" }
  | { readonly kind: "Props"; readonly errors: Partial<PropsErrors> }
  | {
      readonly kind: "IndexKey";
      readonly key: unknown;
      readonly error: KeyError;
    }
  | {
      readonly kind: "IndexValue";
      readonly key: string;
      readonly error: ValueError;
    }
> {}

export const formatObjectWithRecordError = <Error extends TypeError>(
  formatTypeError: TypeErrorFormatter<Error>,
): TypeErrorFormatter<
  ObjectWithRecordError<Record<string, Error>, Error, Error>
> =>
  createTypeErrorFormatter((error) => {
    switch (error.reason.kind) {
      case "NotObject":
        return `Expected an object, but received ${error.value}.`;
      case "Props":
        return formatObjectError(formatTypeError)({
          type: "Object",
          value: error.value,
          reason: { kind: "Props", errors: error.reason.errors },
        });
      case "IndexKey":
        return `Invalid index key ${error.reason.key}: ${formatTypeError(error.reason.error)}`;
      case "IndexValue":
        return `Invalid value at index key ${error.reason.key}: ${formatTypeError(error.reason.error)}`;
    }
  });

/**
 * Base interface for objects with a discriminant `type` property.
 *
 * This enables
 * {@link https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions | discriminated unions}
 * (also known as tagged unions) — a pattern where TypeScript uses a literal
 * `type` field to narrow union types automatically.
 *
 * ## Why Discriminated Unions?
 *
 * Discriminated unions model states that are **mutually exclusive**. Instead of
 * optional fields and boolean flags that can combine into invalid
 * configurations, each variant is a distinct type. This makes illegal states
 * unrepresentable — invalid combinations cannot exist, so bugs cannot create
 * them.
 *
 * Benefits:
 *
 * - **Self-documenting** — Union cases immediately show all possible states
 * - **Compile-time safety** — TypeScript enforces handling all cases
 * - **Refactoring-friendly** — Adding a new state breaks code that doesn't handle
 *   it
 *
 * ### Example
 *
 * ```ts
 * // Bad: optional fields allow invalid states (no contact info at all)
 * interface Contact {
 *   readonly email?: Email;
 *   readonly phone?: Phone;
 * }
 *
 * // Good: discriminated union makes "at least one" explicit
 * interface EmailOnly extends Typed<"EmailOnly"> {
 *   readonly email: Email;
 * }
 * interface PhoneOnly extends Typed<"PhoneOnly"> {
 *   readonly phone: Phone;
 * }
 * interface EmailAndPhone extends Typed<"EmailAndPhone"> {
 *   readonly email: Email;
 *   readonly phone: Phone;
 * }
 *
 * type ContactInfo = EmailOnly | PhoneOnly | EmailAndPhone;
 * ```
 *
 * ```ts
 * interface Pending extends Typed<"Pending"> {
 *   readonly createdAt: DateIso;
 * }
 * interface Shipped extends Typed<"Shipped"> {
 *   readonly trackingNumber: TrackingNumber;
 * }
 * interface Delivered extends Typed<"Delivered"> {
 *   readonly deliveredAt: DateIso;
 * }
 * interface Cancelled extends Typed<"Cancelled"> {
 *   readonly reason: CancellationReason;
 * }
 *
 * type OrderState = Pending | Shipped | Delivered | Cancelled;
 *
 * // TypeScript enforces exhaustiveness via return type
 * const getStatusMessage = (state: OrderState): string => {
 *   switch (state.type) {
 *     case "Pending":
 *       return "Order placed";
 *     case "Shipped":
 *       return `Shipped: ${state.trackingNumber}`;
 *     case "Delivered":
 *       return `Delivered on ${state.deliveredAt.toLocaleDateString()}`;
 *     case "Cancelled":
 *       return `Cancelled: ${state.reason}`;
 *   }
 * };
 *
 * // For void functions, use exhaustiveCheck to ensure all cases are handled
 * const logState = (state: OrderState): void => {
 *   switch (state.type) {
 *     case "Pending":
 *       console.log("Order placed");
 *       break;
 *     case "Shipped":
 *       console.log(`Shipped: ${state.trackingNumber}`);
 *       break;
 *     case "Delivered":
 *       console.log(
 *         `Delivered on ${state.deliveredAt.toLocaleDateString()}`,
 *       );
 *       break;
 *     case "Cancelled":
 *       console.log(`Cancelled: ${state.reason}`);
 *       break;
 *     default:
 *       exhaustiveCheck(state);
 *   }
 * };
 * ```
 *
 * ## Why `type` (and not e.g. `_tag`)?
 *
 * Underscore-prefixing is meant to avoid clashing with domain properties, but
 * proper discriminated union design means the discriminant IS the domain
 * concept — there's no clash to avoid. The `type` prop name also aligns with
 * {@link Type}'s name. If an entity has a meaningful "type" (like product
 * category), model it as the discriminant itself:
 *
 * ```ts
 * interface Electronics extends Typed<"Electronics"> {
 *   voltage: Voltage;
 * }
 * interface Clothing extends Typed<"Clothing"> {
 *   size: Size;
 * }
 * type Product = Electronics | Clothing;
 * ```
 *
 * @see {@link exhaustiveCheck} to ensure all cases are handled in void functions.
 * @see {@link typed} for runtime-validated typed objects.
 */
export interface Typed<T extends string> {
  readonly type: T;
}

/**
 * Creates a runtime-validated typed object with a `type` discriminant.
 *
 * ### Example
 *
 * ```ts
 * const Card = typed("Card", {
 *   cardNumber: CardNumber,
 *   expiry: DateIso,
 * });
 *
 * const Cash = typed("Cash", {
 *   currency: NonEmptyTrimmedString,
 * });
 *
 * const Payment = union(Card, Cash);
 * type Payment = typeof Payment.Type;
 *
 * const result = Payment.fromUnknown(data);
 * if (result.ok) {
 *   switch (result.value.type) {
 *     case "Card":
 *       console.log(result.value.cardNumber);
 *       break;
 *     case "Cash":
 *       console.log(result.value.currency);
 *       break;
 *   }
 * }
 * ```
 *
 * @see {@link Typed} for type-only discrimination.
 */
export function typed<Tag extends string>(tag: Tag): TypedType<Tag>;
export function typed<
  Tag extends string,
  Props extends Record<string, AnyType>,
>(tag: Tag, props: Props): TypedType<Tag, Props>;
export function typed<
  Tag extends string,
  Props extends Record<string, AnyType>,
>(tag: Tag, props?: Props): ObjectType<{ type: LiteralType<Tag> } & Props> {
  return object({ type: literal(tag), ...props } as {
    type: LiteralType<Tag>;
  } & Props);
}

/** Return type of {@link typed}. */
export type TypedType<
  Tag extends string,
  Props extends Record<string, AnyType> = Record<never, never>,
> = ObjectType<{ type: LiteralType<Tag> } & Props>;

/**
 * Union {@link Type}.
 *
 * `UnionType` represents a union of multiple member Types. Accepts both
 * {@link Type} and literal values as arguments.
 *
 * Note that the `union` Type Factory delegates `fromParent` to `fromUnknown`.
 * That's because the union members can have different `Parent` types, and at
 * runtime, it is impossible to determine which member should process a given
 * `Parent` value.
 *
 * ### Example
 *
 * ```ts
 * const AorB = union("a", "b");
 * const result1 = AorB.from("a"); // ok("a")
 * const result2 = AorB.from("c"); // err
 *
 * const StringOrNumber = union(String, Number);
 * const result3 = StringOrNumber.from(42); // ok(42)
 * ```
 *
 * @group Base Factories
 */
export function union<
  Members extends [AnyType, AnyType, ...ReadonlyArray<AnyType>],
>(...members: Members): UnionType<Members>;

export function union<
  Literals extends [Literal, Literal, ...ReadonlyArray<Literal>],
>(
  ...literals: Literals
): UnionType<{
  [K in keyof Literals]: LiteralType<Literals[K]>;
}>;

export function union(...args: ReadonlyArray<any>): any {
  /**
   * Good First Issue:
   *
   * 1. Optimize for microbenchmarks:
   *
   *    - Detect if all arguments are literals and generate a fast-check function.
   *    - This could significantly improve performance for unions of literals.
   * 2. Enhance tagged union support:
   *
   *    - Detect if all arguments are objects with the same property but different
   *         literal values (tagged unions).
   *    - Generate a specialized function to improve validation performance for such
   *         cases.
   */

  const members = args.map((arg) => (isType(arg) ? arg : literal(arg)));

  const fromUnknown = (value: unknown) => {
    const errors: UnionError<InferError<(typeof members)[number]>>["errors"] =
      [];
    for (const member of members) {
      const result = member.fromUnknown(value);
      if (result.ok) return result;
      errors.push(result.error);
    }
    return err<UnionError<InferError<(typeof members)[number]>>>({
      type: "Union",
      value,
      errors,
    });
  };

  return {
    ...createType("Union", {
      fromUnknown,
      fromParent: fromUnknown,
    }),
    members,
  };
}

/**
 * UnionType extends {@link Type} with an additional `members` property for
 * reflection.
 */
export interface UnionType<
  Members extends [AnyType, ...ReadonlyArray<AnyType>],
> extends Type<
  "Union",
  InferType<Members[number]>,
  InferInput<Members[number]>,
  UnionError<InferErrors<Members[number]>>,
  InferInput<Members[number]>,
  never
> {
  readonly members: Members;
}

export interface UnionError<
  E extends TypeError = TypeError,
> extends TypeError<"Union"> {
  readonly errors: Array<E>;
}

export const formatUnionError = <Error extends TypeError>(
  formatTypeError: TypeErrorFormatter<Error>,
): TypeErrorFormatter<UnionError<Error>> =>
  createTypeErrorFormatter((error) => {
    const formattedErrors = error.errors
      .map((e, i) => `  ${i + 1}. ${formatTypeError(e)}`)
      .join("\n");

    return `Value ${error.value} does not match any member of the union.\nErrors:\n${formattedErrors}`;
  });

export const isUnionType = (
  t: AnyType,
): t is UnionType<[AnyType, ...ReadonlyArray<AnyType>]> =>
  t.name === "Union" && Array.isArray((t as { members?: unknown }).members);

/**
 * Creates a {@link Type} for {@link Result} values.
 *
 * Use for validating serialized Results from storage, APIs, or message passing.
 *
 * ### Example
 *
 * ```ts
 * const SyncResponse = result(
 *   object({ timestamp: NonNegativeInt }),
 *   typed("SyncError", { message: String }),
 * );
 *
 * // Validate response from worker or API
 * const validated = SyncResponse.from(JSON.parse(message));
 * if (!validated.ok) return validated; // validation error
 * // validated.value is Result<{ timestamp }, SyncError>
 * ```
 *
 * @group Composite Factories
 */
export const result = <OkType extends AnyType, ErrType extends AnyType>(
  okType: OkType,
  errType: ErrType,
): UnionType<
  [
    ObjectType<{ ok: LiteralType<true>; value: OkType }>,
    ObjectType<{ ok: LiteralType<false>; error: ErrType }>,
  ]
> =>
  union(
    object({ ok: literal(true), value: okType }),
    object({ ok: literal(false), error: errType }),
  );

/**
 * A {@link result} type for `Result<unknown, unknown>`.
 *
 * Useful for serializing Results where the value and error types are unknown.
 *
 * @group Composite Factories
 */
export const UnknownResult = result(Unknown, Unknown);
export type UnknownResult = typeof UnknownResult.Type;

/**
 * Creates a {@link Type} for {@link NextResult} with three outcomes.
 *
 * Validates results where the producer responds with:
 *
 * - `Ok<A>` — produced a value
 * - `Err<Done<D>>` — completed normally with a done value
 * - `Err<E>` — failed with an error
 *
 * ### Example
 *
 * ```ts
 * const MyNextResult = nextResult(Item, MyError, Summary);
 *
 * const validated = MyNextResult.fromUnknown(data);
 * if (!validated.ok) return validated;
 *
 * const result = validated.value;
 * if (result.ok) {
 *   console.log(result.value);
 * } else if (result.error.type === "Done") {
 *   console.log("Done:", result.error.done);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 *
 * @group Composite Factories
 */
export const nextResult = <
  ValueType extends AnyType,
  ErrorType extends AnyType,
  DoneType extends AnyType,
>(
  valueType: ValueType,
  errorType: ErrorType,
  doneType: DoneType,
): ReturnType<
  typeof result<
    ValueType,
    UnionType<[ErrorType, TypedType<"Done", { done: DoneType }>]>
  >
> => result(valueType, union(errorType, typed("Done", { done: doneType })));

/**
 * A {@link nextResult} type for `NextResult<unknown, unknown, unknown>`.
 *
 * Useful for checking if a value is a {@link NextResult} via
 * `UnknownNextResult.is(value)`.
 *
 * @group Composite Factories
 */
export const UnknownNextResult = nextResult(Unknown, Unknown, Unknown);
export type UnknownNextResult = typeof UnknownNextResult.Type;

/**
 * Recursive {@link Type}.
 *
 * Recursive types can't be inferred, so we must define them using an interface
 * and `recursive` Type Factory that returns a {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * interface Category {
 *   readonly name: string;
 *   readonly subcategories: ReadonlyArray<Category>;
 * }
 *
 * interface CategoryInput {
 *   readonly name: string;
 *   readonly subcategories: ReadonlyArray<CategoryInput>;
 * }
 *
 * type CategoryError = ObjectError<{
 *   readonly name: typeof String.Error;
 *   readonly subcategories: ArrayError<CategoryError>;
 * }>;
 *
 * const Category = recursive(
 *   (): Type<"Object", Category, CategoryInput, CategoryError> =>
 *     object({
 *       name: String,
 *       subcategories: array(Category),
 *     }),
 * );
 * ```
 *
 * @group Base Factories
 */
export const recursive = <ParentType extends AnyType>(
  create: () => ParentType,
): RecursiveType<ParentType> => {
  let type: ParentType | undefined;

  type T = InferType<ParentType>;
  type Input = InferInput<ParentType>;
  type Parent = InferParent<ParentType>;

  return {
    name: "Recursive",
    from: (value: Input) => {
      type ??= create();
      return type.from(value);
    },
    fromUnknown: (value: unknown) => {
      type ??= create();
      return type.fromUnknown(value);
    },
    fromParent: (value: Parent) => {
      type ??= create();
      return type.fromParent(value);
    },
    is: (value: unknown): value is T => {
      type ??= create();
      return type.is(value);
    },
    [EvoluTypeSymbol]: true,
    getParentType: () => {
      type ??= create();
      return type;
    },
  } as RecursiveType<ParentType>;
};

export interface RecursiveType<ParentType extends AnyType> extends Type<
  "Recursive",
  InferType<ParentType>,
  InferInput<ParentType>,
  InferError<ParentType>,
  InferParent<ParentType>,
  InferParentError<ParentType>
> {
  getParentType(): ParentType;
}

/**
 * `union(null, T)` {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * const NullOrString = nullOr(String);
 * NullOrString.from("hello"); // ok("hello")
 * NullOrString.from(null); // ok(null)
 * NullOrString.from(42); // err(...)
 * ```
 *
 * @group Base Factories
 */
export const nullOr = <T extends AnyType>(
  type: T,
): UnionType<[typeof Null, T]> => union(Null, type);

/**
 * `union(undefined, T)` {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * const UndefinedOrString = undefinedOr(String);
 * UndefinedOrString.from("world"); // ok("world")
 * UndefinedOrString.from(undefined); // ok()
 * UndefinedOrString.from(42); // err(...)
 * ```
 *
 * @group Base Factories
 */
export const undefinedOr = <T extends AnyType>(
  type: T,
): UnionType<[typeof Undefined, T]> => union(Undefined, type);

/**
 * `union(undefined, null, T)` {@link Type}.
 *
 * Learn more:
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#nullish-coalescing
 *
 * ### Example
 *
 * ```ts
 * const NullishOrString = nullishOr(String);
 * NullishOrString.from("test"); // ok("test")
 * NullishOrString.from(null); // ok(null)
 * NullishOrString.from(undefined); // ok()
 * NullishOrString.from(42); // err(...)
 * ```
 *
 * @group Base Factories
 */
export const nullishOr = <T extends AnyType>(
  type: T,
): UnionType<[typeof Undefined, typeof Null, T]> =>
  union(Undefined, Null, type);

/**
 * Tuple {@link Type}.
 *
 * Represents a tuple of specific Types.
 *
 * ### Example
 *
 * ```ts
 * const NameAndAge = tuple(NonEmptyTrimmedString, PositiveNumber);
 *
 * const result = NameAndAge.from(["Alice", 25]); // ok(["Alice", 25])
 * const error = NameAndAge.from(["Alice", -10]); // err
 * ```
 *
 * @group Base Factories
 */
export const tuple = <Elements extends [AnyType, ...ReadonlyArray<AnyType>]>(
  ...elements: Elements
): TupleType<Elements> => {
  const fromUnknown = (
    value: unknown,
  ): Result<
    { [K in keyof Elements]: InferType<Elements[K]> },
    TupleError<InferError<Elements[number]>>
  > => {
    if (!Array.isArray(value) || value.length !== elements.length) {
      return err({
        type: "Tuple",
        value,
        reason: { kind: "InvalidLength", expected: elements.length },
      });
    }

    const result = [] as { [K in keyof Elements]: InferType<Elements[K]> };

    for (let i = 0; i < elements.length; i++) {
      const elementResult = elements[i].fromUnknown(value[i]);
      if (!elementResult.ok) {
        return err({
          type: "Tuple",
          value,
          reason: {
            kind: "Element",
            index: i,
            error: elementResult.error as IntentionalNever,
          },
        });
      }
      result[i] = elementResult.value as InferType<Elements[typeof i]>;
    }

    return ok(result);
  };

  const fromParent = (value: {
    [K in keyof Elements]: InferParent<Elements[K]>;
  }) => {
    if (!Array.isArray(value) || value.length !== elements.length) {
      return err<TupleError<InferParentError<Elements[number]>>>({
        type: "Tuple",
        value,
        reason: { kind: "InvalidLength", expected: elements.length },
      });
    }

    const result: Array<unknown> = [];
    for (let i = 0; i < elements.length; i++) {
      const elementResult = elements[i].fromParent(value[i]);
      if (!elementResult.ok) {
        return err<TupleError<InferParentError<Elements[number]>>>({
          type: "Tuple",
          value,
          reason: {
            kind: "Element",
            index: i,
            error: elementResult.error as IntentionalNever,
          },
        });
      }
      result.push(elementResult.value);
    }

    return ok(result as { [K in keyof Elements]: InferType<Elements[K]> });
  };

  return {
    ...createType("Tuple", {
      fromUnknown,
      fromParent,
    }),
    elements,
  } as IntentionalNever;
};

/**
 * TupleType extends {@link Type} with an additional `elements` property for
 * reflection.
 */
export interface TupleType<
  Elements extends readonly [AnyType, ...ReadonlyArray<AnyType>],
> extends Type<
  "Tuple",
  readonly [...{ [K in keyof Elements]: InferType<Elements[K]> }],
  readonly [...{ [K in keyof Elements]: InferInput<Elements[K]> }],
  TupleError<{ [K in keyof Elements]: InferError<Elements[K]> }[number]>,
  readonly [...{ [K in keyof Elements]: InferParent<Elements[K]> }],
  TupleError<{ [K in keyof Elements]: InferParentError<Elements[K]> }[number]>
> {
  readonly elements: Elements;
}

export interface TupleError<
  ElementError extends TypeError = TypeError,
> extends TypeErrorWithReason<
  "Tuple",
  | { readonly kind: "InvalidLength"; readonly expected: number }
  | {
      readonly kind: "Element";
      readonly index: number;
      readonly error: ElementError;
    }
> {}

export const formatTupleError = <Error extends TypeError>(
  formatTypeError: TypeErrorFormatter<Error>,
): TypeErrorFormatter<TupleError<Error>> =>
  createTypeErrorFormatter((error) => {
    switch (error.reason.kind) {
      case "InvalidLength":
        return `Expected a tuple of length ${error.reason.expected}, but received ${error.value}.`;
      case "Element":
        return `Invalid element at index ${error.reason.index}:\n  ${formatTypeError(error.reason.error)}`;
    }
  });

/**
 * 64-bit signed integer.
 *
 * `Int64` represents a `BigInt` constrained to a 64-bit signed integer range,
 * which is useful for platforms that do not support the `bigint` type, such as
 * SQLite.
 *
 * Because SQLite lacks a dedicated `bigint` type, it may return `number` or
 * 'Int64` depending on the stored value or even a wrong value if a platform
 * wrapper does not support it. A workaround for SQLite is to insert 'Int64`
 * serialized as a string (SQLite will convert it to int) and manually cast the
 * result to a string in SQL query and then to `Int64` in JS.
 *
 * https://www.sqlite.org/c3ref/int64.html
 *
 * @group Number
 */
export const Int64 = brand("Int64", BigInt, (value) =>
  value >= -9223372036854775808n && value <= 9223372036854775807n
    ? ok(value)
    : err<Int64Error>({ type: "Int64", value }),
);
export type Int64 = typeof Int64.Type;
export interface Int64Error extends TypeError<"Int64"> {}

export const formatInt64Error = createTypeErrorFormatter<Int64Error>(
  (error) =>
    `The value ${error.value} is not a valid 64-bit signed integer (Int64).`,
);

/**
 * Stringified {@link Int64}.
 *
 * @group String
 */
export const Int64String = brand("Int64", NonEmptyTrimmedString, (value) =>
  trySync(
    () => {
      const maybeInt = globalThis.BigInt(value);
      Int64.orThrow(maybeInt);
      return value;
    },
    (): Int64StringError => ({ type: "Int64String", value }),
  ),
);

export type Int64String = typeof Int64String.Type;

export interface Int64StringError extends TypeError<"Int64String"> {}

export const formatInt64StringError =
  createTypeErrorFormatter<Int64StringError>(
    (error) => `The value ${error.value} is not a valid Int64 string.`,
  );

export type JsonValue =
  | string
  | FiniteNumber
  | boolean
  | null
  | JsonArray
  | JsonObject;

export type JsonValueInput =
  | string
  | number
  | boolean
  | null
  | JsonArrayInput
  | JsonObjectInput;

export type JsonValueError = UnionError<
  | StringError
  | BooleanError
  | NullError
  | FiniteError
  | NumberError
  | ArrayError<JsonValueError>
  | RecordError<StringError, JsonValueError>
>;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface JsonObjectInput {
  readonly [key: string]: JsonValueInput;
}

export type JsonArray = ReadonlyArray<JsonValue>;
export type JsonArrayInput = ReadonlyArray<JsonValueInput>;

/**
 * JSON-compatible value: string, {@link FiniteNumber}, boolean, null,
 * {@link JsonArray}, or {@link JsonObject}.
 *
 * @group Base Types
 */
export const JsonValue = recursive(
  (): UnionType<
    [
      typeof String,
      typeof FiniteNumber,
      typeof Boolean,
      typeof Null,
      ArrayType<
        Type<
          "Recursive",
          JsonValue,
          JsonValueInput,
          JsonValueError,
          JsonValueInput,
          JsonValueError
        >
      >,
      RecordType<
        "String",
        string,
        string,
        StringError,
        string,
        StringError,
        Type<
          "Recursive",
          JsonValue,
          JsonValueInput,
          JsonValueError,
          JsonValueInput,
          JsonValueError
        >
      >,
    ]
  > => union(String, FiniteNumber, Boolean, Null, JsonArray, JsonObject),
);

/**
 * JSON-compatible array of {@link JsonValue} elements.
 *
 * @group Array
 */
export const JsonArray = array(JsonValue);

/**
 * JSON-compatible object with string keys and {@link JsonValue} values.
 *
 * @group Object
 */
export const JsonObject = record(String, JsonValue);

export const parseJson = (value: string): Result<JsonValue, JsonError> =>
  trySync(
    () => JSON.parse(value) as JsonValue,
    (error): JsonError => ({
      type: `Json`,
      value,
      message: globalThis.String(error),
    }),
  );

/**
 * JSON-string {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * const result = Json.from('{"key":"value"}'); // ok
 * const error = Json.from("invalid json"); // err
 * ```
 *
 * @group String
 */
export const Json = brand("Json", String, (value) => {
  const result = parseJson(value);
  if (!result.ok) return result;
  return ok(value);
});

export type Json = typeof Json.Type;

export interface JsonError extends TypeError<"Json"> {
  readonly message: string;
}

export const formatJsonError = createTypeErrorFormatter<JsonError>(
  (error) => `Invalid JSON: ${error.value}. Error: ${error.message}`,
);

export const jsonValueToJson = (value: JsonValue): Json =>
  JSON.stringify(value) as Json;

export const jsonToJsonValue = (value: Json): JsonValue =>
  JSON.parse(value) as JsonValue;

/**
 * Creates a branded JSON string {@link Type} and type-safe conversion functions
 * for a given Type.
 *
 * This factory creates:
 *
 * 1. A branded string Type that validates JSON parsing and structural conformity
 * 2. A serialization function (Type → branded JSON string)
 * 3. A parsing function (branded JSON string → Type, skipping validation)
 *
 * Optimized for Evolu's SQLite workflow where we store typed JSON strings and
 * need type-safe conversions without double parsing.
 *
 * ### Example
 *
 * ```ts
 * const Person = object({
 *   name: NonEmptyString100,
 *   age: FiniteNumber,
 * });
 * interface Person extends InferType<typeof Person> {}
 *
 * const [PersonJson, personToPersonJson, personJsonToPerson] = json(
 *   Person,
 *   "PersonJson",
 * );
 * // string & Brand<"PersonJson">
 * type PersonJson = typeof PersonJson.Type;
 *
 * // Usage:
 * const person: Person = { name: "Alice", age: 30 };
 * const jsonString = personToPersonJson(person); // PersonJson
 * const backToPerson = personJsonToPerson(jsonString); // Person
 * ```
 */
export const json = <T extends AnyType, Name extends TypeName>(
  type: T,
  name: Name,
): [
  BrandType<typeof String, Name, JsonError | InferErrors<T>, StringError>,
  (
    value: InferType<T>,
  ) => InferType<
    BrandType<typeof String, Name, JsonError | InferErrors<T>, StringError>
  >,
  (
    value: InferType<
      BrandType<typeof String, Name, JsonError | InferErrors<T>, StringError>
    >,
  ) => InferType<T>,
] => {
  const BrandedJsonType = brand(name, String, (value) => {
    const parseResult = parseJson(value);
    if (!parseResult.ok) return parseResult;

    const validationResult = type.fromUnknown(parseResult.value);
    if (!validationResult.ok) return validationResult;

    return ok(value);
  }) as BrandType<typeof String, Name, JsonError | InferErrors<T>, StringError>;

  return [
    BrandedJsonType,
    jsonValueToJson as IntentionalNever,
    jsonToJsonValue as IntentionalNever,
  ];
};

/**
 * Optional {@link Type}.
 *
 * Marks a `Type` as **optional**, meaning:
 *
 * - If the value is **present**, it must match the given `Type`.
 * - If the value is **absent**, it is **not included** in the final object.
 *
 * This is different from {@link undefinedOr}, which allows explicit `undefined`
 * but **still requires the key to exist**.
 *
 * ### Example:
 *
 * ```ts
 * const Todo = object({
 *   id: TodoId,
 *   title: NonEmptyString1000,
 *   isCompleted: optional(SqliteBoolean),
 * });
 * ```
 */
export const optional = <T extends AnyType>(type: T): OptionalType<T> => ({
  ...createType("Optional", {
    fromUnknown: type.fromUnknown,
    fromParent: type.fromParent,
  }),
  parent: type,
});

export interface OptionalType<T extends AnyType> extends Type<
  "Optional",
  InferType<T>,
  InferInput<T>,
  InferError<T>,
  InferParent<T>,
  InferParentError<T>
> {
  readonly parent: T;
}

/** Determines if a given type is an {@link OptionalType}. */
export const isOptionalType = (x: unknown): x is OptionalType<any> =>
  typeof x === "object" && x != null && "name" in x && x.name === "Optional";

/**
 * Creates a partial object type where all properties are optional.
 *
 * This is useful when we want to validate an object in which none of the keys
 * are required, but if they are present they must conform to their
 * corresponding Types.
 *
 * ### Example
 *
 * ```ts
 * const PartialUser = partial({
 *   name: NonEmptyString,
 *   age: PositiveNumber,
 * });
 *
 * // Valid: an empty object is accepted
 * PartialUser.from({});
 *
 * // Valid: when provided, the properties must validate correctly
 * PartialUser.from({ name: "Alice" });
 *
 * // Invalid: if a property is present but fails validation it returns an error
 * PartialUser.from({ age: -5 });
 * ```
 *
 * @group Object
 */
export const partial = <Props extends Record<string, AnyType>>(
  props: Props,
): ObjectType<{ [K in keyof Props]: OptionalType<Props[K]> }> => {
  const optionalProps = {} as { [K in keyof Props]: OptionalType<Props[K]> };
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      optionalProps[key] = optional(props[key]);
    }
  }
  return object(optionalProps);
};

/**
 * Converts each “nullable” property (a union that includes {@link Null}) into an
 * {@link optional} property. This means consumers can omit the property
 * entirely, or set it to `null`, or set it to the non-null member of the
 * union.
 *
 * @group Object
 */
export const nullableToOptional = <Props extends Record<string, AnyType>>(
  props: Props,
): ObjectType<NullableToOptionalProps<Props>> => {
  const transformedProps: Record<string, AnyType> = {};
  for (const key in props) {
    const type = props[key];
    if (isUnionType(type)) {
      const hasNull = type.members.some((m) => m === Null);
      if (hasNull) {
        transformedProps[key] = optional(type);
        continue;
      }
    }
    transformedProps[key] = type;
  }
  return object(transformedProps) as ObjectType<NullableToOptionalProps<Props>>;
};

export type NullableToOptionalProps<Props extends Record<string, AnyType>> = {
  [K in keyof Props]: TransformNullable<Props[K]>;
};

export type TransformNullable<P extends AnyType> =
  IsUnionWithNull<P> extends true ? OptionalType<P> : P;

export type IsUnionWithNull<U extends AnyType> =
  U extends UnionType<infer Members>
    ? Members extends [AnyType, ...Array<AnyType>]
      ? NullTypeInMembers<Members>
      : false
    : false;

export type NullTypeInMembers<Members extends [AnyType, ...Array<AnyType>]> =
  Members extends [infer Head, ...infer Tail]
    ? Head extends typeof Null
      ? true
      : Tail extends [AnyType, ...Array<AnyType>]
        ? NullTypeInMembers<Tail>
        : false
    : false;

/**
 * Create a new `object` {@link Type} by omitting some keys.
 *
 * @group Object
 */
export const omit = <T extends ObjectType<any>, Keys extends keyof T["props"]>(
  objectType: T,
  ...keys: ReadonlyArray<Keys>
): ObjectType<Omit<T["props"], Keys>> => {
  const newProps = {} as Omit<T["props"], Keys>;

  for (const key in objectType.props) {
    if (!keys.includes(key as Keys)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      newProps[key as keyof typeof newProps] = objectType.props[key];
    }
  }
  return object(newProps);
};

export const maxMutationSize = 655360;

/**
 * Evolu has to limit the maximum mutation size. Otherwise, sync couldn't use
 * the `maxProtocolMessageRangesSize`. The max size is 640KB in bytes, measured
 * via MessagePack. Evolu Protocol DbChange will be smaller thanks to various
 * optimizations.
 */
export const validMutationSize = <T extends AnyType>(
  type: T,
): BrandType<T, "ValidMutationSize", ValidMutationSizeError, InferErrors<T>> =>
  brand("ValidMutationSize", type, (value) =>
    pack(value).byteLength <= maxMutationSize
      ? ok(value)
      : err<ValidMutationSizeError>({ type: "ValidMutationSize", value }),
  );

export interface ValidMutationSizeError extends TypeError<"ValidMutationSize"> {}

export const formatValidMutationSizeError =
  createTypeErrorFormatter<ValidMutationSizeError>(
    (error) =>
      `The mutation size exceeds the maximum limit of ${maxMutationSize} bytes. The provided mutation has a size of ${pack(error.value).byteLength} bytes.`,
  );

export type ValidMutationSize<Props extends Record<string, AnyType>> =
  BrandType<
    ObjectType<Props>,
    "ValidMutationSize",
    ValidMutationSizeError,
    InferErrors<ObjectType<Props>>
  >;

/**
 * Union of all `TypeError`s defined in the `Type.ts` file, including base type
 * errors (e.g., `StringError`, `NumberError`), composite type errors
 * (`ArrayError`, `ObjectError`), and optionally, user-defined extra errors.
 *
 * This type is **recursive**, meaning errors can be nested within composite
 * structures like arrays, objects, records, unions, and tuples.
 *
 * Used by {@link createFormatTypeError} to generate human-readable error
 * messages.
 *
 * @group Utilities
 */
export type TypeErrors<ExtraErrors extends TypeError = never> =
  | StringError
  | NumberError
  | BigIntError
  | BooleanError
  | UndefinedError
  | NullError
  | FunctionError
  | Uint8ArrayError
  | InstanceOfError
  | EvoluTypeError
  | CurrencyCodeError
  | DateIsoError
  | TrimmedError
  | MinLengthError
  | MaxLengthError
  | LengthError
  | MnemonicError
  | RegexError
  | SimplePasswordError
  | IdError
  | TableIdError
  | PositiveError
  | NegativeError
  | NonPositiveError
  | NonNegativeError
  | IntError
  | GreaterThanError
  | LessThanError
  | GreaterThanOrEqualToError
  | LessThanOrEqualToError
  | NonNaNError
  | FiniteError
  | MultipleOfError
  | BetweenError
  | LiteralError
  | Int64Error
  | Int64StringError
  | JsonError
  | ValidMutationSizeError
  | ExtraErrors
  // Composite errors
  | ArrayError<TypeErrors<ExtraErrors>>
  | SetError<TypeErrors<ExtraErrors>>
  | RecordError<TypeErrors<ExtraErrors>, TypeErrors<ExtraErrors>>
  | ObjectError<Record<string, TypeErrors<ExtraErrors>>>
  | ObjectWithRecordError<
      Record<string, TypeErrors<ExtraErrors>>,
      TypeErrors<ExtraErrors>,
      TypeErrors<ExtraErrors>
    >
  | UnionError<TypeErrors<ExtraErrors>>
  | TupleError<TypeErrors<ExtraErrors>>;

/**
 * Formats Evolu Type errors into user-friendly messages.
 *
 * Evolu Type typed errors ensure every error type must have a formatter.
 * TypeScript enforces this at compile-time, preventing unhandled validation
 * errors from reaching users.
 *
 * The `createFormatTypeError` function handles both built-in {@link TypeErrors}
 * and custom errors, and lets us override default formatting for specific
 * errors.
 *
 * ### Example
 *
 * ```ts
 * const formatTypeError = createFormatTypeError<
 *   MinLengthError | MaxLengthError
 * >((error): string => {
 *   switch (error.type) {
 *     case "MinLength":
 *       return `Text must be at least ${error.min} character${error.min === 1 ? "" : "s"} long`;
 *     case "MaxLength":
 *       return `Text is too long (maximum ${error.max} characters)`;
 *   }
 * });
 * ```
 *
 * Alternatively, write a custom formatter from scratch without using
 * `createFormatTypeError`. This gives us full control over error formatting:
 *
 * ```ts
 * const Person = object({
 *   name: NonEmptyTrimmedString100,
 *   age: optional(PositiveInt),
 * });
 *
 * // Define only the errors actually used by Person Type
 * type PersonErrors =
 *   | StringError
 *   | MaxLengthError
 *   | MinLengthError
 *   | TrimmedError
 *   | PositiveError
 *   | NonNegativeError
 *   | IntError
 *   | NumberError
 *   | ObjectError<Record<string, PersonErrors>>;
 *
 * const formatTypeError: TypeErrorFormatter<PersonErrors> = (error) => {
 *   switch (error.type) {
 *     case "String":
 *       return formatStringError(error);
 *     case "Number":
 *       return "Must be a number";
 *     case "MinLength":
 *       return `Must be at least ${error.min} characters`;
 *     case "MaxLength":
 *       return `Cannot exceed ${error.max} characters`;
 *     case "Trimmed":
 *       return "Cannot have leading or trailing spaces";
 *     case "Positive":
 *       return "Must be a positive number";
 *     case "NonNegative":
 *       return "Must be zero or positive";
 *     case "Int":
 *       return "Must be an integer";
 *     case "Object": {
 *       if (error.reason.kind === "NotObject") return "Must be an object";
 *       if (error.reason.kind === "ExtraKeys")
 *         return "Contains unexpected fields";
 *       const firstError = Object.values(error.reason.errors).find(
 *         (e) => e !== undefined,
 *       )!;
 *       return formatTypeError(firstError);
 *     }
 *   }
 * };
 * ```
 *
 * @group Utilities
 */
export const createFormatTypeError = <ExtraErrors extends TypeError = never>(
  extraFormatter?: TypeErrorFormatter<ExtraErrors>,
): TypeErrorFormatter<TypeErrors<ExtraErrors>> => {
  const formatTypeError: TypeErrorFormatter<TypeErrors<ExtraErrors>> = (
    error,
  ) => {
    const extraMessage = extraFormatter?.(error as ExtraErrors);

    if (extraMessage != null) return extraMessage;

    error = error as TypeErrors;

    switch (error.type) {
      case "String":
        return formatStringError(error);
      case "Number":
        return formatNumberError(error);
      case "BigInt":
        return formatBigIntError(error);
      case "Boolean":
        return formatBooleanError(error);
      case "Undefined":
        return formatUndefinedError(error);
      case "Null":
        return formatNullError(error);
      case "Function":
        return formatFunctionError(error);
      case "Uint8Array":
        return formatUint8ArrayError(error);
      case "InstanceOf":
        return formatInstanceOfError(error);
      case "EvoluType":
        return formatIsTypeError(error);
      case "CurrencyCode":
        return formatCurrencyCodeError(error);
      case "DateIso":
        return formatDateIsoError(error);
      case "Trimmed":
        return formatTrimmedError(error);
      case "MinLength":
        return formatMinLengthError(error);
      case "MaxLength":
        return formatMaxLengthError(error);
      case "Length":
        return formatLengthError(error);
      case "Mnemonic":
        return formatMnemonicError(error);
      case "Regex":
        return formatRegexError(error);
      case "Id":
        return formatIdError(error);
      case "TableId":
        return formatTableIdError(error);
      case "Positive":
        return formatPositiveError(error);
      case "Negative":
        return formatNegativeError(error);
      case "NonPositive":
        return formatNonPositiveError(error);
      case "NonNegative":
        return formatNonNegativeError(error);
      case "Int":
        return formatIntError(error);
      case "GreaterThan":
        return formatGreaterThanError(error);
      case "LessThan":
        return formatLessThanError(error);
      case "GreaterThanOrEqualTo":
        return formatGreaterThanOrEqualToError(error);
      case "LessThanOrEqualTo":
        return formatLessThanOrEqualToError(error);
      case "NonNaN":
        return formatNonNaNError(error);
      case "Finite":
        return formatFiniteError(error);
      case "MultipleOf":
        return formatMultipleOfError(error);
      case "Between":
        return formatBetweenError(error);
      case "Literal":
        return formatLiteralError(error);
      case "Int64":
        return formatInt64Error(error);
      case "Int64String":
        return formatInt64StringError(error);
      case "Json":
        return formatJsonError(error);
      case "ValidMutationSize":
        return formatValidMutationSizeError(error);
      // Composite Types
      case "SimplePassword":
        return formatSimplePasswordError(formatTypeError)(error);
      case "Array":
        return formatArrayError(formatTypeError)(error);
      case "Set":
        return formatSetError(formatTypeError)(error);
      case "Record":
        return formatRecordError(formatTypeError)(error);
      case "Object":
        return formatObjectError(formatTypeError)(error);
      case "ObjectWithRecord":
        return formatObjectWithRecordError(formatTypeError)(error);
      case "Union":
        return formatUnionError(formatTypeError)(error);
      case "Tuple":
        return formatTupleError(formatTypeError)(error);
      default: {
        // Fallback for unknown error types
        const unknownError = error as TypeError;
        return `A value ${safelyStringifyUnknownValue(unknownError.value)} is not valid for type ${unknownError.type}.`;
      }
    }
  };

  return formatTypeError;
};

/**
 * Converts an Evolu {@link TypeError} to Standard Schema V1 issues format.
 *
 * This function recursively converts Evolu's typed errors into the Standard
 * Schema issue format with proper path tracking for nested structures.
 *
 * @group Utilities
 */
export const typeErrorToStandardSchemaIssues = <
  ExtraErrors extends TypeError = never,
>(
  error: TypeErrors<ExtraErrors>,
  formatTypeError: TypeErrorFormatter<TypeErrors<ExtraErrors>>,
  path: ReadonlyArray<PropertyKey> = [],
): ReadonlyArray<StandardSchemaV1.Issue> => {
  if (error.type === "Array") {
    const arrayError = error as ArrayError;
    if (arrayError.reason.kind === "NotArray") {
      return [{ message: formatTypeError(error), path }];
    }
    return typeErrorToStandardSchemaIssues(
      arrayError.reason.error as TypeErrors<ExtraErrors>,
      formatTypeError,
      [...path, arrayError.reason.index],
    );
  }

  if (error.type === "Set") {
    const setError = error as SetError;
    if (setError.reason.kind === "NotSet") {
      return [{ message: formatTypeError(error), path }];
    }
    return typeErrorToStandardSchemaIssues(
      setError.reason.error as TypeErrors<ExtraErrors>,
      formatTypeError,
      [...path, setError.reason.index],
    );
  }

  if (error.type === "Object") {
    const objectError = error as ObjectError;
    if (
      objectError.reason.kind === "NotObject" ||
      objectError.reason.kind === "ExtraKeys"
    ) {
      return [{ message: formatTypeError(error), path }];
    }
    const issues: Array<StandardSchemaV1.Issue> = [];
    for (const [key, propError] of Object.entries(objectError.reason.errors)) {
      issues.push(
        ...typeErrorToStandardSchemaIssues(
          propError as TypeErrors<ExtraErrors>,
          formatTypeError,
          [...path, key],
        ),
      );
    }
    return issues;
  }

  if (error.type === "ObjectWithRecord") {
    const objectWithRecordError = error as ObjectWithRecordError;
    if (objectWithRecordError.reason.kind === "NotObject") {
      return [{ message: formatTypeError(error), path }];
    }
    if (
      objectWithRecordError.reason.kind === "IndexKey" ||
      objectWithRecordError.reason.kind === "IndexValue"
    ) {
      return typeErrorToStandardSchemaIssues(
        objectWithRecordError.reason.error as TypeErrors<ExtraErrors>,
        formatTypeError,
        [...path, objectWithRecordError.reason.key as PropertyKey],
      );
    }
    const issues: Array<StandardSchemaV1.Issue> = [];
    for (const [key, propError] of Object.entries(
      objectWithRecordError.reason.errors,
    )) {
      issues.push(
        ...typeErrorToStandardSchemaIssues(
          propError as TypeErrors<ExtraErrors>,
          formatTypeError,
          [...path, key],
        ),
      );
    }
    return issues;
  }

  if (error.type === "Record") {
    const recordError = error as RecordError;
    if (recordError.reason.kind === "NotRecord") {
      return [{ message: formatTypeError(error), path }];
    }
    return typeErrorToStandardSchemaIssues(
      recordError.reason.error as TypeErrors<ExtraErrors>,
      formatTypeError,
      [...path, recordError.reason.key as PropertyKey],
    );
  }

  if (error.type === "Tuple") {
    const tupleError = error as TupleError;
    if (tupleError.reason.kind === "InvalidLength") {
      return [{ message: formatTypeError(error), path }];
    }
    return typeErrorToStandardSchemaIssues(
      tupleError.reason.error as TypeErrors<ExtraErrors>,
      formatTypeError,
      [...path, tupleError.reason.index],
    );
  }

  if (error.type === "Union") {
    const unionError = error as UnionError;
    return unionError.errors.flatMap((err) =>
      typeErrorToStandardSchemaIssues(
        err as TypeErrors<ExtraErrors>,
        formatTypeError,
        path,
      ),
    );
  }

  if (error.type === "Brand") {
    const brandError = error as BrandWithoutRefineError<TypeName, TypeError>;
    if ("parentError" in brandError) {
      return typeErrorToStandardSchemaIssues(
        brandError.parentError as TypeErrors<ExtraErrors>,
        formatTypeError,
        path,
      );
    }
    return [{ message: formatTypeError(error), path }];
  }

  return [{ message: formatTypeError(error), path }];
};

/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates unknown input values. */
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult;

  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** The non-existent issues. */
    readonly issues?: undefined;
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }

  /** The issue interface of the failure output. */
  export interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  /** The path segment interface of the issue. */
  export interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }

  /** The Standard Schema types interface. */
  export interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }

  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];

  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

/**
 * Shared formatter cache for Standard Schema integration - avoids circular
 * dependency by lazily creating the formatter on first use rather than during
 * module initialization.
 */
let cachedStandardSchemaFormatTypeError: TypeErrorFormatter<any> | undefined;
