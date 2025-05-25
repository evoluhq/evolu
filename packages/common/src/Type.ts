/**
 * 🧩 Validation, Parsing, and Transformation
 *
 * ## Intro
 *
 * You probably know [Zod](https://zod.dev). Evolu has {@link Type}.
 *
 * Evolu Type exists because no existing validation/parsing/transformation
 * library fully met our needs:
 *
 * - **Result-based error handling**: Leveraging {@link Result} instead of throwing
 *   exceptions.
 * - **Consistent constraints**: Enforcing {@link Brand} for all constraints.
 * - **Typed errors with decoupled formatters**: Avoiding coupling error messages
 *   with validators.
 * - **No user-land chaining**: Designed with ES pipe operator in mind.
 * - **Selective validation/transformation**: Skipping parent Type validations and
 *   transformations when TypeScript's type system can be relied upon.
 * - **Bidirectional transformations**: Supporting transformations in both
 *   directions.
 * - **Minimal and transparent code**: No runtime dependencies or hidden magic.
 *
 * **Note**: A proper quickstart guide is on the way. In the meantime, each type
 * includes its own usage example, and you can (and should) check the tests for
 * practical demonstrations of the API. Or dang, just read the code. It's
 * simple.
 *
 * @module
 */

import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { assert } from "./Assert.js";
import { identity } from "./Function.js";
import { NanoIdLibDep } from "./NanoId.js";
import { isPlainObject } from "./Object.js";
import { Err, err, Ok, ok, Result, trySync } from "./Result.js";
import { safelyStringifyUnknownValue } from "./String.js";
import type { Brand, Literal, Simplify, WidenLiteral } from "./Types.js";
import { IntentionalNever } from "./Types.js";

/**
 * 🧩 Validation, Parsing, and Transformation
 *
 * Evolu `Type` is:
 *
 * - A TypeScript type with a {@link Brand} whenever it's possible.
 * - A function to create a value of that type, which may fail.
 * - A function to transform value back to its original representation, which
 *   cannot fail.
 *
 * Types are chainable. The chain starts with a Base Type that refines an
 * unknown value into something and can continue with further refinements or
 * transformations. For example, `NonEmptyTrimmedString100` chain looks like
 * this:
 *
 * `Unknown` -> `String` -> `TrimmedString` -> `NonEmptyTrimmedString100`
 *
 * For `NonEmptyTrimmedString100`, the parent Type is `TrimmedString`. For
 * `TrimmedString`, the parent Type is `String`.
 *
 * The parent of the `String` Type is the `String` Type itself. All Base Types
 * `fromParent` functions are just a typed alias to `fromUnknown` to ensure that
 * `fromParent` and `toParent` can be called on any Type.
 *
 * Speaking of `fromParent` and `toParent`, those functions exist to bypass
 * parent Types when we can rely on TypeScript types.
 *
 * `Type` transformations should be reversible. If you need an irreversible
 * transformation, such as `TrimString` (trimming is not reversible as `untrim`
 * can't know what has been trimmed), you can do that, but note in JSDoc that
 * `to` will not restore the original representation. You can also use
 * {@link assert}: `assert(false, "Untrim is not possible")`.
 *
 * ### Tip
 *
 * If necessary, write `globalThis.String` instead of `String` to avoid naming
 * clashes with Base Types.
 *
 * ### Design Decision:
 *
 * While the `from` function can fail, the `to` function cannot. This simplifies
 * the model by ensuring that every valid input has a corresponding valid
 * output, eliminating the risk of edge cases caused by irreversible
 * operations.
 *
 * // TODO: Links to examples.
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
> {
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
   * Creates `T` from an unknown value.
   *
   * This is useful when a value is unknown.
   */
  readonly fromUnknown: (value: unknown) => Result<T, ParentError | Error>;

  /**
   * The opposite of `from` and `fromUnknown`.
   *
   * This is useful to transform `T` back to its `Input` representation.
   *
   * For `refine`, it only removes the brand. For `transform`, it changes value.
   */
  readonly to: (value: T) => Input;

  /**
   * Creates `T` from `Parent` type.
   *
   * This function skips parent Types validations/transformations when we have
   * already partially validated/transformed value.
   *
   * For example, `TrimString.from` checks whether a value is a string and trims
   * it. If we only want to trim a string, we can use `fromParent`.
   *
   * ### Example
   *
   * ```ts
   * // string & Brand<"Trimmed">
   * const value = TrimString.fromParent("a ").value; // as efficient as foo.trim()
   * ```
   */
  readonly fromParent: (value: Parent) => Result<T, Error>;

  /** The opposite of `fromParent`. */
  readonly toParent: (value: T) => Parent;

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
  readonly is: (value: unknown) => value is T;

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
   * Error | ParentError
   *
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
 * @category Utilities
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

export type AnyType = Type<any, any, any, any, any, any>;

export type InferName<A extends AnyType> =
  A extends Type<infer Name, any, any, any, any, any> ? Name : never;

export type InferType<A extends AnyType> =
  A extends Type<any, infer T, any, any, any, any> ? T : never;

export type InferInput<A extends AnyType> =
  A extends Type<any, any, infer Input, any, any, any> ? Input : never;

export type InferError<A extends AnyType> =
  A extends Type<any, any, any, infer Error, any, any> ? Error : never;

export type InferParent<A extends AnyType> =
  A extends Type<any, any, any, any, infer Parent, any> ? Parent : never;

export type InferParentError<A extends AnyType> =
  A extends Type<any, any, any, any, any, infer ParentError>
    ? ParentError
    : never;

export type InferErrors<T extends AnyType> =
  T extends Type<any, any, any, infer Error, any, infer ParentError>
    ? Error | ParentError
    : never;

const EvoluTypeSymbol = Symbol("evolu.Type");

/**
 * Checks if the given value is an {@link Type}.
 *
 * @category Utilities
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
    | typeof EvoluTypeSymbol
    | "Type"
    | "Input"
    | "Error"
    | "Parent"
    | "ParentError"
    | "Errors"
  >,
): Type<Name, T, Input, Error, Parent, ParentError> => ({
  ...definition,
  name,
  is: (value: unknown): value is T => definition.fromUnknown(value).ok,
  from: definition.fromUnknown,
  [EvoluTypeSymbol]: true,
  Type: undefined as unknown as T,
  Input: undefined as unknown as Input,
  Error: undefined as unknown as Error,
  Parent: undefined as unknown as Parent,
  ParentError: undefined as unknown as ParentError,
  Errors: undefined as unknown as Error | ParentError,
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
 * @category Utilities
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
 * Unlike refinements or transformations, Base Types establish the fundamental
 * shape of a value before any branding or transformation occurs.
 *
 * - To **refine** a Base Type further, use the {@link brand} Type Factory.
 * - To **transform** a Base Type into a different representation, use the
 *   {@link transform} Type Factory.
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
 * @category Base Factories
 */
export const base = <Name extends TypeName, T, Error extends TypeError>(
  name: Name,
  fromUnknown: (value: unknown) => Result<T, Error>,
): Type<Name, T, T, Error> =>
  createType(name, {
    fromUnknown,
    to: identity,
    fromParent: ok<T>, // `fromParent` relies on types, so it can't fail for the Base Type
    toParent: identity,
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
 * @category Utilities
 */
export const createBaseTypeErrorFormatter = <
  Error extends TypeError,
>(): TypeErrorFormatter<Error> =>
  createTypeErrorFormatter<Error>(
    (error) => `A value ${error.value} is not a ${error.type.toLowerCase()}.`,
  );

/** @category Base Types */
export const Unknown = base<"Unknown", unknown, never>("Unknown", ok);

/**
 * @category Base Types
 * @category String
 */
export const String = base("String", (value) =>
  typeof value === "string"
    ? ok(value)
    : err<StringError>({ type: "String", value }),
);

export interface StringError extends TypeError<"String"> {}

export const formatStringError = createBaseTypeErrorFormatter<StringError>();

/** @category Base Types */
export const Number = base("Number", (value) =>
  typeof value === "number"
    ? ok(value)
    : err<NumberError>({ type: "Number", value }),
);

export interface NumberError extends TypeError<"Number"> {}

export const formatNumberError = createBaseTypeErrorFormatter<NumberError>();

/** @category Base Types */
export const BigInt = base("BigInt", (value) =>
  typeof value === "bigint"
    ? ok(value)
    : err<BigIntError>({ type: "BigInt", value }),
);

export interface BigIntError extends TypeError<"BigInt"> {}

export const formatBigIntError = createBaseTypeErrorFormatter<BigIntError>();

/** @category Base Types */
export const Boolean = base("Boolean", (value) =>
  typeof value === "boolean"
    ? ok(value)
    : err<BooleanError>({ type: "Boolean", value }),
);

export interface BooleanError extends TypeError<"Boolean"> {}

export const formatBooleanError = createBaseTypeErrorFormatter<BooleanError>();

/** @category Base Types */
export const Undefined = base("Undefined", (value) =>
  value === undefined
    ? ok(value)
    : err<UndefinedError>({ type: "Undefined", value }),
);

export interface UndefinedError extends TypeError<"Undefined"> {}

export const formatUndefinedError =
  createBaseTypeErrorFormatter<UndefinedError>();

/** @category Base Types */
export const Null = base("Null", (value) =>
  value === null ? ok(value) : err<NullError>({ type: "Null", value }),
);

export interface NullError extends TypeError<"Null"> {}

export const formatNullError = createBaseTypeErrorFormatter<NullError>();

/** @category Base Types */
export const Function = base("Function", (value) =>
  typeof value === "function"
    ? ok(value)
    : err<FunctionError>({ type: "Function", value }),
);

export interface FunctionError extends TypeError<"Function"> {}

export const formatFunctionError =
  createBaseTypeErrorFormatter<FunctionError>();

/** @category Base Types */
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
 * @category Base Factories
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

export interface InstanceOfType<T extends abstract new (...args: any) => any>
  extends Type<
    "InstanceOf",
    InstanceType<T>,
    InstanceType<T>,
    InstanceOfError
  > {
  ctor: T;
}

export const formatInstanceOfError = createTypeErrorFormatter<InstanceOfError>(
  (error) => `Value ${error.value} is not an instance of ${error.ctor}`,
);

/**
 * JavaScript Date.
 *
 * @category Base Types
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
 * The `brand` Type Factory takes the name of a new {@link Brand}, a parent Type
 * to be branded, and the optional `refine` function for additional constraint.
 *
 * If the `refine` function is omited, TODO:
 *
 * ### Examples
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
 * const ValidForm = brand("Valid", Form, (value) => {
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
 * @category Base Factories
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
      to: identity,
      fromParent: (refine ?? ok) as IntentionalNever,
      toParent: identity,
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
 * @category String
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
    (error) => `Invalid currency code: ${error.value}`,
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
 * const result = DateIsoString.from("2023-01-01T12:00:00.000Z"); // ok
 * const error = DateIsoString.from("10000-01-01T00:00:00.000Z"); // err
 * ```
 *
 * @category String
 */
export const DateIsoString = brand("DateIso", String, (value) => {
  if (value.length !== 24) {
    return err<DateIsoStringError>({ type: "DateIsoString", value });
  }
  if (isNaN(globalThis.Date.parse(value))) {
    return err<DateIsoStringError>({ type: "DateIsoString", value });
  }
  return ok(value);
});

export type DateIsoString = typeof DateIsoString.Type;

export interface DateIsoStringError extends TypeError<"DateIsoString"> {}

export const formatDateIsoStringError =
  createTypeErrorFormatter<DateIsoStringError>(
    (error) => `The value ${error.value} is not a valid ISO 8601 date string.`,
  );

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
 * @category Utilities
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
 * This Type Factory does not transform; it only validates whether a string has
 * no leading or trailing whitespaces. To trim a string, use {@link trim} Type
 * Factory.
 *
 * ### Examples
 *
 * ```ts
 * // this Type already exists
 * const TrimmedString = trimmed(String);
 * type TrimmedString = typeof TrimmedString.Type;
 *
 * // we can make any branded Type trimmed:
 * const TrimmedNonEmptyString = trimmed(minLength(1)(String));
 * // string & Brand<"MinLength1"> & Brand<"Trimmed">
 * type TrimmedNonEmptyString = typeof TrimmedNonEmptyString.Type;
 * ```
 *
 * @category String
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
  (error) => `A value ${error.value} is not trimmed`,
);

export type TransformBrandFactory<
  Name extends TypeName,
  Input,
  TransformError extends TypeError = never,
> = <
  PName extends TypeName,
  P extends Input,
  PInput,
  PParent,
  PError extends TypeError = never,
  PParentError extends TypeError = never,
>(
  parent: Type<PName, P, PInput, PError, PParent, PParentError>,
) => TransformType<
  Type<PName, P, PInput, PError, PParent, PParentError>,
  BrandType<
    Type<PName, P, PInput, PError, PParent, PParentError>,
    Name,
    never,
    PError | PParentError
  >,
  TransformError
>;

/**
 * Trims leading and trailing whitespace from a string.
 *
 * This Type Factory **transforms** the input string by removing whitespace from
 * both ends. For validation only, use {@link trimmed} Type Factory.
 *
 * ### Example
 *
 * ```ts
 * const TrimString = trim(String);
 * expect(TrimString.from("a ")).toEqual(ok("a"));
 * expect(TrimString.fromParent("a ").value).toEqual("a");
 *
 * const TrimNonEmptyString = trim(NonEmptyString);
 * expect(TrimNonEmptyString.from("a " as NonEmptyString)).toEqual(ok("a"));
 * expect(
 *   TrimNonEmptyString.fromParent("a " as NonEmptyString).value,
 * ).toEqual("a");
 * ```
 *
 * **Note:** This transformation is irreversible. Calling `toParent` will not
 * restore the original representation.
 *
 * @category String
 */

export const trim: TransformBrandFactory<"Trimmed", string> = (parent) =>
  transform(
    parent,
    trimmed(parent) as BrandType<typeof parent, "Trimmed">,
    (value) => ok(value.trim() as InferType<typeof parent> & Brand<"Trimmed">),
    (value) => value,
  );

/**
 * Trimmed string
 *
 * - Use `TrimmedString.is` to check if an unknown value is trimmed.
 * - Use `TrimmedString.from` to check if a string is trimmed.
 *
 * @category String
 */
export const TrimmedString = trimmed(String);
export type TrimmedString = typeof TrimmedString.Type;

/**
 * Minimum length.
 *
 * ### Example
 *
 * ```ts
 * // string & Brand<"MinLength1">
 * const NonEmptyString = minLength(1)(String);
 * ```
 *
 * @category String
 * @category Array
 */
export const minLength: <Min extends number>(
  min: Min,
) => BrandFactory<`MinLength${Min}`, { length: number }, MinLengthError<Min>> =
  (min) => (parent) =>
    brand(`MinLength${min}`, parent, (value) =>
      value.length >= min ? ok(value) : err({ type: "MinLength", value, min }),
    );

export interface MinLengthError<Min extends number = number>
  extends TypeError<"MinLength"> {
  readonly min: Min;
}

export const formatMinLengthError = createTypeErrorFormatter<MinLengthError>(
  (error) =>
    `Value ${error.value} does not meet the minimum length of ${error.min}.`,
);

/**
 * Maximum length.
 *
 * ### Example
 *
 * ```ts
 * // string & Brand<"MaxLength100">
 * const String100 = maxLength(100)(String);
 * ```
 *
 * @category String
 * @category Array
 */
export const maxLength: <Max extends number>(
  max: Max,
) => BrandFactory<`MaxLength${Max}`, { length: number }, MaxLengthError<Max>> =
  (max) => (parent) =>
    brand(`MaxLength${max}`, parent, (value) =>
      value.length <= max ? ok(value) : err({ type: "MaxLength", value, max }),
    );

export interface MaxLengthError<Max extends number = number>
  extends TypeError<"MaxLength"> {
  readonly max: Max;
}

export const formatMaxLengthError = createTypeErrorFormatter<MaxLengthError>(
  (error) => `Value ${error.value} exceeds the maximum length of ${error.max}.`,
);

/**
 * Exact length.
 *
 * ### Example
 *
 * ```ts
 * // string & Brand<"Length1">
 * const Length1String = length(1)(String);
 * ```
 *
 * @category String
 * @category Array
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

export interface LengthError<Exact extends number = number>
  extends TypeError<"Length"> {
  readonly exact: Exact;
}

export const formatLengthError = createTypeErrorFormatter<LengthError>(
  (error) =>
    `Value ${error.value} does not have the required length of ${error.exact}.`,
);

/** @category String */
export const NonEmptyString = minLength(1)(String);
export type NonEmptyString = typeof NonEmptyString.Type;

/** @category String */
export const String100 = maxLength(100)(String);
export type String100 = typeof String100.Type;

/** @category String */
export const String1000 = maxLength(1000)(String);
export type String1000 = typeof String1000.Type;

/** @category String */
export const NonEmptyString100 = minLength(1)(String100);
export type NonEmptyString100 = typeof NonEmptyString100.Type;

/** @category String */
export const NonEmptyString1000 = minLength(1)(String1000);
export type NonEmptyString1000 = typeof NonEmptyString1000.Type;

/** @category String */
export const NonEmptyTrimmedString = minLength(1)(TrimmedString);
export type NonEmptyTrimmedString = typeof NonEmptyTrimmedString.Type;

/** @category String */
export const TrimmedString100 = maxLength(100)(TrimmedString);
export type TrimmedString100 = typeof TrimmedString100.Type;

/** @category String */
export const TrimmedString1000 = maxLength(1000)(TrimmedString);
export type TrimmedString1000 = typeof TrimmedString1000.Type;

/** @category String */
export const NonEmptyTrimmedString100 = minLength(1)(TrimmedString100);
export type NonEmptyTrimmedString100 = typeof NonEmptyTrimmedString100.Type;

/** @category String */
export const NonEmptyTrimmedString1000 = minLength(1)(TrimmedString1000);
export type NonEmptyTrimmedString1000 = typeof NonEmptyTrimmedString1000.Type;

/**
 * The mnemonic, also known as a "seed phrase," is a set of 12 words in a
 * specific order chosen from a predefined list (BIP39). It provides a
 * human-readable way to store a private key securely. The mnemonic is generated
 * safely on the user's device using cryptographically secure random number
 * generation, ensuring it remains private and unique.
 *
 * @category String
 */
export const Mnemonic = brand("Mnemonic", NonEmptyTrimmedString, (value) =>
  bip39.validateMnemonic(value, wordlist)
    ? ok(value)
    : err<MnemonicError>({ type: "Mnemonic", value }),
);
export type Mnemonic = typeof Mnemonic.Type;

export interface MnemonicError extends TypeError<"Mnemonic"> {}

export const formatMnemonicError = createTypeErrorFormatter<MnemonicError>(
  (error) => `Invalid BIP39 mnemonic: ${error.value}`,
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
 * @category String
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

export interface RegexError<Name extends TypeName = TypeName>
  extends TypeError<"Regex"> {
  readonly name: Name;
  readonly pattern: RegExp;
}

export const formatRegexError = createTypeErrorFormatter<RegexError>(
  (error) =>
    `Value ${error.value} does not match the pattern for ${error.name}: ${error.pattern}`,
);

/**
 * URL-safe Base64 string.
 *
 * A `Base64Url` string uses a limited alphabet that is URL-safe:
 *
 * - Uppercase letters (`A-Z`)
 * - Lowercase letters (`a-z`)
 * - Digits (`0-9`)
 * - Dash (`-`)
 * - Underscore (`_`)
 *
 * ### Example
 *
 * ```ts
 * const result = Base64Url.from("abc123_-");
 * if (result.ok) {
 *   console.log("Valid Base64Url string:", result.value);
 * } else {
 *   console.error("Invalid Base64Url string:", result.error);
 * }
 * ```
 *
 * @category String
 */
export const Base64Url = regex(
  "Base64Url",
  /^[A-Za-z0-9_-]+$/, // URL-safe Base64 alphabet
)(String);
export type Base64Url = typeof Base64Url.Type;
export type Base64UrlError = typeof Base64Url.Error;

/**
 * Simple alphanumeric string for naming.
 *
 * A `SimpleName` string uses a limited, safe alphabet for naming purposes:
 *
 * - Uppercase letters (`A-Z`)
 * - Lowercase letters (`a-z`)
 * - Digits (`0-9`)
 * - Dash (`-`)
 *
 * The string must be between 1 and 42 characters.
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
 * @category String
 */
export const SimpleName = regex("SimpleName", /^[a-z0-9-]{1,42}$/i)(String);
export type SimpleName = typeof SimpleName.Type;
export type SimpleNameError = typeof SimpleName.Error;

/**
 * Default NanoId.
 *
 * @category String
 */
export const NanoId = regex("NanoId", /^[A-Za-z0-9_-]{21}$/)(String);
export type NanoId = typeof NanoId.Type;
export type NanoIdError = typeof NanoId.Error;

/**
 * Trimmed string between 8 and 64 characters, branded as `SimplePassword`.
 *
 * @category String
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
 * `Id` {@link Type}.
 *
 * Represents a unique identifier with exactly 21 characters, using NanoID's
 * standard format (`A-Za-z0-9_-`).
 *
 * @category String
 */
export const Id = regex("Id", /^[A-Za-z0-9_-]{21}$/)(String);
export type Id = typeof Id.Type;

export const idTypeValueLength = 21;

/**
 * Creates an {@link Id}.
 *
 * ### Example
 *
 * ```ts
 * // string & Brand<"Id">
 * const id = createId(deps);
 * ```
 */
export const createId = (deps: NanoIdLibDep): Id =>
  deps.nanoIdLib.nanoid() as Id;

/**
 * Type Factory to create branded {@link Id} Type for a specific table.
 *
 * ### Example
 *
 * ```ts
 * const TodoId = id("Todo");
 * // string & Brand<"Id"> & Brand<"Todo">
 * type TodoId = typeof TodoId.Type;
 * ```
 *
 * @category String
 */
export const id = <Table extends TypeName>(table: Table): IdType<Table> => {
  const fromParent = (value: string) => {
    const idResult = Id.fromParent(value);
    if (!idResult.ok) {
      return err<IdError<Table>>({ type: "Id", value, table });
    }
    return ok(idResult.value as Id & Brand<Table>);
  };

  const fromUnknown = (value: unknown) => {
    const parentResult = String.fromUnknown(value);
    if (!parentResult.ok) return parentResult;
    return fromParent(parentResult.value);
  };

  return {
    ...createType("Id", {
      fromUnknown,
      to: (value: Id & Brand<Table>) => value as string,
      fromParent,
      toParent: (value: Id & Brand<Table>) => value as string,
    }),
    table,
  };
};

export interface IdType<Table extends TypeName>
  extends Type<
    "Id",
    string & Brand<"Id"> & Brand<Table>,
    string,
    IdError<Table>,
    string,
    StringError
  > {
  table: Table;
}

export interface IdError<Table extends TypeName = TypeName>
  extends TypeError<"Id"> {
  readonly table: Table;
}

export const formatIdError = createTypeErrorFormatter<IdError>(
  (error) => `Invalid ${error.type} table Id: ${error.value}`,
);

/**
 * Positive number.
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
 * @category Number
 */
export const positive: BrandFactory<"Positive", number, PositiveError> = (
  parent,
) =>
  brand("Positive", parent, (value) =>
    value > 0 ? ok(value) : err<PositiveError>({ type: "Positive", value }),
  );

export interface PositiveError extends TypeError<"Positive"> {}

export const formatPositiveError = createTypeErrorFormatter<PositiveError>(
  (error) => `The value ${error.value} is not positive.`,
);

/**
 * Negative number.
 *
 * ### Example
 *
 * ```ts
 * const NegativeNumber = negative(Number);
 * ```
 *
 * @category Number
 */
export const negative: BrandFactory<"Negative", number, NegativeError> = (
  parent,
) =>
  brand("Negative", parent, (value) =>
    value < 0 ? ok(value) : err<NegativeError>({ type: "Negative", value }),
  );

export interface NegativeError extends TypeError<"Negative"> {}

export const formatNegativeError = createTypeErrorFormatter<NegativeError>(
  (error) => `The value ${error.value} is not negative.`,
);

/**
 * Non-positive number.
 *
 * ### Example
 *
 * ```ts
 * const NonPositiveNumber = nonPositive(Number);
 * ```
 *
 * @category Number
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
    (error) => `The value ${error.value} is not non-positive.`,
  );

/**
 * Non-negative number.
 *
 * ### Example
 *
 * ```ts
 * const NonNegativeNumber = nonNegative(Number);
 * ```
 *
 * @category Number
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
    (error) => `The value ${error.value} is not non-negative.`,
  );

/** @category Number */
export const NonNegativeNumber = nonNegative(Number);
export type NonNegativeNumber = typeof NonNegativeNumber.Type;

/** @category Number */
export const PositiveNumber = positive(NonNegativeNumber);
export type PositiveNumber = typeof PositiveNumber.Type;

/** @category Number */
export const NonPositiveNumber = nonPositive(Number);
export type NonPositiveNumber = typeof NonPositiveNumber.Type;

/** @category Number */
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
 * @category Number
 */
export const int: BrandFactory<"Int", number, IntError> = (parent) =>
  brand("Int", parent, (value) =>
    globalThis.Number.isSafeInteger(value)
      ? ok(value)
      : err<IntError>({ type: "Int", value }),
  );

export interface IntError extends TypeError<"Int"> {}

export const formatIntError = createTypeErrorFormatter<IntError>(
  (error) => `The value ${error.value} is not an integer.`,
);

/**
 * Integer within the safe range of JavaScript numbers.
 *
 * @category Number
 */
export const Int = int(Number);
export type Int = typeof Int.Type;

/** @category Number */
export const NonNegativeInt = nonNegative(Int);
export type NonNegativeInt = typeof NonNegativeInt.Type;

/** @category Number */
export const PositiveInt = positive(NonNegativeInt);
export type PositiveInt = typeof PositiveInt.Type;

/** @category Number */
export const NonPositiveInt = nonPositive(Int);
export type NonPositiveInt = typeof NonPositiveInt.Type;

/** @category Number */
export const NegativeInt = negative(NonPositiveInt);
export type NegativeInt = typeof NegativeInt.Type;

/**
 * Number greater than a specified value.
 *
 * @category Number
 */
export const greaterThan: <Min extends number>(
  min: Min,
) => BrandFactory<`GreaterThan${Min}`, number, GreaterThanError<Min>> =
  (min) => (parent) =>
    brand(`GreaterThan${min}`, parent, (value) =>
      value > min ? ok(value) : err({ type: "GreaterThan", value, min }),
    );

export interface GreaterThanError<Min extends number = number>
  extends TypeError<"GreaterThan"> {
  readonly min: Min;
}

export const formatGreaterThanError =
  createTypeErrorFormatter<GreaterThanError>(
    (error) => `The value ${error.value} is not > ${error.min}.`,
  );

/**
 * Number less than a specified value.
 *
 * @category Number
 */
export const lessThan: <Max extends number>(
  max: Max,
) => BrandFactory<`LessThan${Max}`, number, LessThanError<Max>> =
  (max) => (parent) =>
    brand(`LessThan${max}`, parent, (value) =>
      value < max ? ok(value) : err({ type: "LessThan", value, max }),
    );

export interface LessThanError<Max extends number = number>
  extends TypeError<"LessThan"> {
  readonly max: Max;
}

export const formatLessThanError = createTypeErrorFormatter<LessThanError>(
  (error) => `The value ${error.value} is not < ${error.max}.`,
);

/**
 * Number ≥ a specified value.
 *
 * @category Number
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

export interface GreaterThanOrEqualToError<Min extends number = number>
  extends TypeError<"GreaterThanOrEqualTo"> {
  readonly min: Min;
}

export const formatGreaterThanOrEqualToError =
  createTypeErrorFormatter<GreaterThanOrEqualToError>(
    (error) => `The value ${error.value} is not >= ${error.min}.`,
  );

/**
 * Number ≤ a specified value.
 *
 * @category Number
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

export interface LessThanOrEqualToError<Max extends number = number>
  extends TypeError<"LessThanOrEqualTo"> {
  readonly max: Max;
}

export const formatLessThanOrEqualToError =
  createTypeErrorFormatter<LessThanOrEqualToError>(
    (error) => `The value ${error.value} is not <= ${error.max}.`,
  );

/**
 * Number that is not NaN.
 *
 * @category Number
 */
export const nonNaN: BrandFactory<"NonNaN", number, NonNaNError> = (parent) =>
  brand("NonNaN", parent, (value) =>
    !globalThis.Number.isNaN(value)
      ? ok(value)
      : err<NonNaNError>({ type: "NonNaN", value }),
  );

export interface NonNaNError extends TypeError<"NonNaN"> {}

export const formatNonNaNError = createTypeErrorFormatter<NonNaNError>(
  (error) => `The value ${error.value} is NaN (not a number).`,
);

/** @category Number */
export const NonNaNNumber = nonNaN(Number);
export type NonNaNNumber = typeof NonNaNNumber.Type;

/**
 * Finite number.
 *
 * @category Number
 */
export const finite: BrandFactory<"Finite", number, FiniteError> = (parent) =>
  brand("Finite", parent, (value) =>
    globalThis.Number.isFinite(value)
      ? ok(value)
      : err<FiniteError>({ type: "Finite", value }),
  );

export interface FiniteError extends TypeError<"Finite"> {}

export const formatFiniteError = createTypeErrorFormatter<FiniteError>(
  (error) => `The value ${error.value} is not finite.`,
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
 * @category Number
 */
export const FiniteNumber = finite(Number);
export type FiniteNumber = typeof FiniteNumber.Type;

/**
 * Number that is a multiple of a divisor.
 *
 * @category Number
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

export interface MultipleOfError<Divisor extends number = number>
  extends TypeError<"MultipleOf"> {
  readonly divisor: Divisor;
}

export const formatMultipleOfError = createTypeErrorFormatter<MultipleOfError>(
  (error) => `The value ${error.value} is not a multiple of ${error.divisor}.`,
);

/**
 * Number within a range, inclusive.
 *
 * ### Example
 *
 * ```ts
 * const Between1And10 = between(1, 10)(PositiveNumber);
 * const result = Between1And10.from(5); // ok(5)
 * const errorResult = Between1And10.from(11); // err
 * ```
 *
 * @category Number
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

/** @category Number */
export const Between1And10 = between(1, 10)(Number);
export type Between1And10 = typeof Between1And10.Type;

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
 * @category Base Factories
 */
export const literal = <T extends Literal>(expected: T): LiteralType<T> => {
  const fromUnknown = (value: unknown): Result<T, LiteralError<T>> =>
    value === expected
      ? ok(expected)
      : err<LiteralError<T>>({ type: "Literal", value, expected });

  return {
    ...createType("Literal", {
      fromUnknown,
      to: identity as (value: T) => WidenLiteral<T>,
      fromParent: ok,
      toParent: identity,
    }),
    expected,
  };
};

export interface LiteralType<T extends Literal>
  extends Type<"Literal", T, WidenLiteral<T>, LiteralError<T>> {
  expected: T;
}

export interface LiteralError<T extends Literal = Literal>
  extends TypeError<"Literal"> {
  readonly expected: T;
}

export const formatLiteralError = createTypeErrorFormatter<LiteralError>(
  (error) =>
    `The value ${error.value} is not strictly equal to the expected literal: ${globalThis.String(
      error.expected,
    )}.`,
);

/**
 * {@link Type} that transforms values between `FromType` and `ToType`.
 *
 * - `fromParent`: Converts `FromType` to `ToType`, may fail.
 * - `toParent`: Converts `ToType` back to `FromType`, must not fail.
 *
 * ### Example
 *
 * // TODO: Examples
 *
 * @category Base Factories
 */
export const transform = <
  FromType extends AnyType,
  ToType extends AnyType,
  TransformError extends TypeError = never,
>(
  fromType: FromType,
  toType: ToType,
  fromParent: (
    parentValue: InferType<FromType>,
  ) => Result<InferType<ToType>, TransformError>,
  toParent: (value: InferType<ToType>) => InferType<FromType>,
): TransformType<FromType, ToType, TransformError> => {
  const fromUnknown = (
    value: unknown,
  ): Result<InferType<ToType>, InferErrors<FromType> | TransformError> => {
    const parentResult = fromType.fromUnknown(value);
    if (!parentResult.ok) return parentResult;
    return fromParent(parentResult.value as IntentionalNever);
  };

  const to = (value: InferType<ToType>): InferInput<FromType> =>
    fromType.to(toParent(value)) as IntentionalNever;

  return {
    ...createType("Transform", {
      fromUnknown,
      to,
      fromParent,
      toParent,
    }),
    is: toType.is,
    fromType,
    toType,
  } as TransformType<FromType, ToType, TransformError>;
};

/**
 * TransformType extends {@link Type} with additional `fromType` and `toType`
 * properties for reflection.
 */
export interface TransformType<
  FromType extends AnyType,
  ToType extends AnyType,
  TransformError extends TypeError = never,
> extends Type<
    "Transform",
    InferType<ToType>,
    InferInput<FromType>,
    TransformError,
    InferType<FromType>,
    InferErrors<FromType>
  > {
  readonly fromType: FromType;
  readonly toType: ToType;

  readonly fromParent: (
    value: InferType<FromType>,
  ) => [TransformError] extends [never]
    ? Ok<InferType<ToType>>
    : Result<InferType<ToType>, TransformError>;
}

/**
 * Trims leading and trailing whitespace from a string.
 *
 * ### Example
 *
 * ```ts
 * expect(TrimString.from("a ")).toEqual(ok("a"));
 * expect(TrimString.fromParent("a ").value).toEqual("a");
 * ```
 *
 * @category String
 */
export const TrimString = trim(String);

/**
 * Transforms a {@link Date} into a {@link DateIsoString} string and vice versa.
 *
 * ### Example
 *
 * TODO:
 *
 * @category String
 */
export const DateIso = transform(
  Date,
  DateIsoString,
  (value) => DateIsoString.fromParent(value.toISOString()),
  (value) => new globalThis.Date(value),
);

/**
 * Transforms a {@link NonEmptyTrimmedString} into a {@link FiniteNumber}.
 *
 * ### Example
 *
 * ```ts
 * NumberFromString.from("42"); // ok(42)
 * NumberFromString.from("abc"); // err({ type: "NumberFromString", value: "abc" })
 * ```
 *
 * @category Number
 */
export const NumberFromString = transform(
  NonEmptyTrimmedString,
  FiniteNumber,
  (value) => {
    const result = FiniteNumber.fromParent(globalThis.Number(value));
    if (!result.ok)
      return err<NumberFromStringError>({ type: "NumberFromString", value });
    return result;
  },
  (num) => num.toString() as NonEmptyTrimmedString,
);

export interface NumberFromStringError extends TypeError<"NumberFromString"> {}

export const formatNumberFromStringError =
  createTypeErrorFormatter<NumberFromStringError>((error) => {
    return `The value ${error.value} could not be converted to a finite number.`;
  });

/**
 * Array of a specific {@link Type}.
 *
 * Usage:
 *
 * ```ts
 * const NumberArray = array(Number);
 *
 * const result1 = NumberArray.from([1, 2, 3]); // ok([1, 2, 3])
 * const result2 = NumberArray.from(["a", "b"]); // err(...)
 * ```
 *
 * @category Base Factories
 * @category Array
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

  const to = (value: ReadonlyArray<InferType<ElementType>>) =>
    value.map(element.to) as ReadonlyArray<InferInput<ElementType>>;

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

  const toParent = (values: ReadonlyArray<InferType<ElementType>>) =>
    values.map(element.toParent) as ReadonlyArray<InferParent<ElementType>>;

  return {
    ...createType("Array", {
      fromUnknown,
      to,
      fromParent,
      toParent,
    }),
    element,
  } as ArrayType<ElementType>;
};

/** ArrayType extends Type with an additional `element` property for reflection. */
export interface ArrayType<ElementType extends AnyType>
  extends Type<
    "Array",
    ReadonlyArray<InferType<ElementType>>,
    ReadonlyArray<InferInput<ElementType>>,
    ArrayError<InferError<ElementType>>,
    ReadonlyArray<InferParent<ElementType>>,
    ArrayError<InferParentError<ElementType>>
  > {
  readonly element: ElementType;
}

export interface ArrayError<Error extends TypeError = TypeError>
  extends TypeErrorWithReason<
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
 * @category Base Factories
 * @category Object
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

  const to = (
    value: Readonly<Record<KeyT, InferType<Value>>>,
  ): Readonly<Record<KeyInput, InferInput<Value>>> =>
    Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        keyType.to(key as KeyT),
        valueType.to(val),
      ]),
    ) as Readonly<Record<KeyInput, InferInput<Value>>>;

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

  const toParent = (
    value: Readonly<Record<KeyT, InferType<Value>>>,
  ): Readonly<Record<KeyParent, InferParent<Value>>> =>
    Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        keyType.toParent(key as KeyT),
        valueType.toParent(val),
      ]),
    ) as Readonly<Record<KeyParent, InferParent<Value>>>;

  return {
    ...createType("Record", {
      fromUnknown,
      to,
      fromParent,
      toParent,
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
 * ### Examples
 *
 * #### Basic Object Validation
 *
 * ```ts
 * const User = object({
 *   name: NonEmptyTrimmedString,
 *   age: PositiveNumber,
 * });
 * type User = typeof User.Type;
 *
 * const result = User.from({ name: "John", age: 30 }); // ok({ name: "John", age: 30 })
 * const error = User.from({ name: "John", age: -5 }); // err
 * ```
 *
 * #### Optional Properties
 *
 * In this example the `age` property is marked as optional using
 * {@link optional}.
 *
 * ```ts
 * const User = object({
 *   name: NonEmptyString, // Required
 *   age: optional(PositiveNumber), // Optional
 * });
 * type User = typeof User.Type;
 * ```
 *
 * #### Allowing Additional Properties
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
 * #### Combining Fixed and Flexible Properties
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
 * @category Base Factories
 * @category Object
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

  const to = (value: any) => {
    const entries: [string, any][] = [];
    for (const key of propKeys) {
      if (!(key in value) && isOptionalType(props[key])) {
        continue;
      }
      entries.push([key, props[key].to(value[key])]);
    }
    if (record) {
      const recordEntries = Object.entries(value).filter(
        ([key]) => !propKeys.includes(key),
      );
      for (const [key, val] of recordEntries) {
        entries.push([record.key.to(key), record.value.to(val)]);
      }
    }
    return Object.fromEntries(entries);
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

  const toParent = (value: any) => {
    const entries: [string, any][] = [];
    for (const key of propKeys) {
      if (!(key in value) && isOptionalType(props[key])) {
        continue;
      }
      entries.push([key, props[key].toParent(value[key])]);
    }
    if (record) {
      const recordEntries = Object.entries(value).filter(
        ([key]) => !propKeys.includes(key),
      );
      for (const [key, val] of recordEntries) {
        entries.push([record.key.toParent(key), record.value.toParent(val)]);
      }
    }
    return Object.fromEntries(entries);
  };

  return {
    ...createType(record ? "ObjectWithRecord" : "Object", {
      fromUnknown,
      to,
      fromParent,
      toParent,
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
export interface ObjectType<Props extends Record<string, AnyType>>
  extends Type<
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
 * @category Utilities
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
    Readonly<ObjectInput<Props>> &
      Readonly<Record<KeyInput, InferInput<Value>>>,
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
 * @category Base Factories
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

  /* eslint-disable */
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

  const to = (value: any) => {
    for (const member of members) {
      if (member.is(value)) return member.to(value);
    }
    assert(false, "No matching member found in Union Type `to` function");
  };

  return {
    ...createType("Union", {
      fromUnknown,
      to,
      fromParent: fromUnknown,
      toParent: to,
    }),
    members,
  };
  /* eslint-enable */
}

/**
 * UnionType extends {@link Type} with an additional `members` property for
 * reflection.
 */
export interface UnionType<Members extends [AnyType, ...ReadonlyArray<AnyType>]>
  extends Type<
    "Union",
    InferType<Members[number]>,
    InferInput<Members[number]>,
    UnionError<InferErrors<Members[number]>>,
    InferInput<Members[number]>,
    never
  > {
  readonly members: Members;
}

export interface UnionError<E extends TypeError = TypeError>
  extends TypeError<"Union"> {
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
 * @category Base Factories
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
    to: (value: T) => {
      type ??= create();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return type.to(value);
    },
    fromParent: (value: Parent) => {
      type ??= create();
      return type.fromParent(value);
    },
    toParent: (value: T) => {
      type ??= create();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return type.toParent(value);
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

export interface RecursiveType<ParentType extends AnyType>
  extends Type<
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
 * @category Base Factories
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
 * @category Base Factories
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
 * @category Base Factories
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
 * @category Base Factories
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

  const to = (value: { [K in keyof Elements]: InferType<Elements[K]> }) =>
    value.map((val, index) => elements[index].to(val) as IntentionalNever);

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

  const toParent = (value: { [K in keyof Elements]: InferType<Elements[K]> }): {
    [K in keyof Elements]: InferParent<Elements[K]>;
  } =>
    value.map(
      (val, index) => elements[index].toParent(val) as IntentionalNever,
    ) as {
      [K in keyof Elements]: InferParent<Elements[K]>;
    };

  return {
    ...createType("Tuple", {
      fromUnknown,
      to,
      fromParent,
      toParent,
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

export interface TupleError<ElementError extends TypeError = TypeError>
  extends TypeErrorWithReason<
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
 * @category Number
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

export const BigIntFromString = transform(
  String,
  BigInt,
  (value) =>
    trySync(
      () => globalThis.BigInt(value),
      (): BigIntFromStringError => ({ type: "BigIntFromString", value }),
    ),
  (value) => value.toString(),
);

export interface BigIntFromStringError extends TypeError<"BigIntFromString"> {}

export const formatBigIntFromStringError =
  createTypeErrorFormatter<BigIntFromStringError>(
    (error) => `The value ${error.value} could not be converted to a BigInt.`,
  );

/**
 * Stringified {@link Int64}.
 *
 * @category Number
 */
export const Int64String = brand("Int64", String, (value) => {
  const bigint = BigIntFromString.fromParent(value);
  if (bigint.ok) {
    const int64 = Int64.fromParent(globalThis.BigInt(value));
    if (int64.ok) return ok(value);
  }
  return err<Int64StringError>({ type: "Int64String", value });
});

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
 * @category Base Types
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
 * @category Array
 */
export const JsonArray = array(JsonValue);

/**
 * JSON-compatible object with string keys and {@link JsonValue} values.
 *
 * @category Object
 */
export const JsonObject = record(String, JsonValue);

/**
 * Transform Type that parses a JSON into a {@link JsonValue} and serializes a
 * JsonValue back into a JSON string.
 *
 * ### Example
 *
 * ```ts
 * JsonValueFromString.from(`{"key":"value"}`); // -> ok({ key: "value" })
 * JsonValueFromString.to({ key: "value" }); // -> '{"key":"value"}'
 * ```
 *
 * @category String
 */
export const JsonValueFromString = transform(
  String,
  JsonValue,
  (value) =>
    trySync(
      () => JSON.parse(value) as JsonValue,
      (error): JsonValueFromStringError => ({
        type: `JsonValueFromString`,
        value,
        message: globalThis.String(error),
      }),
    ),
  (value) => JSON.stringify(value),
);

export interface JsonValueFromStringError
  extends TypeError<"JsonValueFromString"> {
  readonly message: string;
}

export const formatJsonValueFromStringError =
  createTypeErrorFormatter<JsonValueFromStringError>(
    (error) => `Invalid JSONValue: ${error.value}. Error: ${error.message}`,
  );

/**
 * JSON-string {@link Type}.
 *
 * ### Example
 *
 * ```ts
 * const result = Json.from('{"key":"value"}'); // -> ok('{"key":"value"}')
 * const error = Json.from("invalid json"); // -> err({ type: "Json", value: "invalid json", message: "Unexpected token i in JSON at position 0" })
 * ```
 *
 * @category String
 */
export const Json = brand("Json", String, (value) => {
  const result = JsonValueFromString.fromParent(value);
  if (!result.ok)
    return err<JsonError>({
      type: "Json",
      value,
      message: result.error.message,
    });
  return ok(value);
});

export type Json = typeof Json.Type;

export interface JsonError extends TypeError<"Json"> {
  readonly message: string;
}

export const formatJsonError = createTypeErrorFormatter<JsonError>(
  (error) => `Invalid JSON: ${error.value}. Error: ${error.message}`,
);

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
    to: type.to,
    fromParent: type.fromParent,
    toParent: type.toParent,
  }),
  parent: type,
});

export interface OptionalType<T extends AnyType>
  extends Type<
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
 * This is useful when you want to validate an object in which none of the keys
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
 * @category Object
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
 * @category Object
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
 * @category Object
 */
export function omit<T extends ObjectType<any>, Keys extends keyof T["props"]>(
  objectType: T,
  ...keys: ReadonlyArray<Keys>
): ObjectType<Omit<T["props"], Keys>> {
  const newProps = {} as Omit<T["props"], Keys>;

  for (const key in objectType.props) {
    if (!keys.includes(key as Keys)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      newProps[key as keyof typeof newProps] = objectType.props[key];
    }
  }
  return object(newProps);
}

/**
 * Creates a transform Type that serializes a given `Type` into a branded JSON
 * string. The transformation is reversible, ensuring that we can safely parse
 * it back.
 *
 * ### Example
 *
 * ```ts
 * const Person = object({
 *   name: NonEmptyString50,
 *   age: FiniteNumber,
 * });
 * type Person = typeof Person.Type;
 *
 * const PersonJson = json(Person, "PersonJson");
 * // string & Brand<"PersonJson">
 * type PersonJson = typeof PersonJson.Type;
 *
 * // Person -> string & Brand<"PersonJson">
 * const personJson = PersonJson.from({ name: "Alice", age: 30 });
 * expect(personJson).toEqual(ok('{"name":"Alice","age":30}'));
 *
 * // string & Brand<"PersonJson"> -> Person
 * const person = PersonJson.to(personJson);
 *
 * // serialize/parse any JSON value
 * const AnyJson = json(JsonValue, "AnyJson");
 * ```
 */
export const json = <T extends AnyType, Name extends TypeName>(
  type: T,
  name: Name,
): TransformType<
  T,
  BrandType<
    typeof String,
    Name,
    JsonValueFromStringError | T["Errors"],
    StringError
  >
> => {
  type E = JsonValueFromStringError | T["Errors"];

  const BrandedJsonString: BrandType<typeof String, Name, E, StringError> =
    brand(name, String, (value) => {
      const jsonValue = JsonValueFromString.fromParent(value);
      if (!jsonValue.ok) return jsonValue as Err<E>;

      const parsed = type.fromUnknown(jsonValue.value);
      if (!parsed.ok) return parsed as Err<E>;

      return ok(value as InferType<typeof BrandedJsonString>);
    });

  return transform(
    type,
    BrandedJsonString,
    (value) => ok(JSON.stringify(value) as InferType<typeof BrandedJsonString>),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    (value) => JSON.parse(value) as InferType<T>,
  );
};

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
 * @category Utilities
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
  | DateIsoStringError
  | TrimmedError
  | MinLengthError
  | MaxLengthError
  | LengthError
  | MnemonicError
  | RegexError
  | NanoIdError
  | SimplePasswordError
  | IdError
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
  | BigIntFromStringError
  | Int64StringError
  | JsonValueFromStringError
  | JsonError
  | ExtraErrors
  // Composite errors
  | ArrayError<TypeErrors<ExtraErrors>>
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
 * Creates a unified error formatter that handles both Evolu Type's built-in
 * {@link TypeErrors} and custom errors. It also lets us override the default
 * formatting for specific errors.
 *
 * If you prefer not to reuse any built-in error formatters, you can write your
 * own `formatTypeError` function from scratch.
 *
 * ### Examples
 *
 * ```ts
 * const formatError = createFormatTypeError();
 * console.log(formatError({ type: "String", value: 42 }));
 * // "A value 42 is not a string."
 * ```
 *
 * A custom `formatTypeError` function:
 *
 * ```ts
 * type AppErrors =
 *   | ValidMutationSizeError
 *   | StringError
 *   | MinLengthError
 *   | MaxLengthError
 *   | NullError
 *   | IdError
 *   | TrimmedError
 *   | MnemonicError
 *   | LiteralError
 *   // Composite errors
 *   | ObjectError<Record<string, AppErrors>>
 *   | UnionError<AppErrors>;
 *
 * const formatTypeError: TypeErrorFormatter<AppErrors> = (error) => {
 *   // In the real code, we would use the createTypeErrorFormatter helper
 *   // that safely stringifies error value.
 *   switch (error.type) {
 *     case "Id":
 *       return `Invalid Id on table: ${error.table}.`;
 *     case "MaxLength":
 *       return `Max length is ${error.max}.`;
 *     case "MinLength":
 *       return `Min length is ${error.min}.`;
 *     case "Mnemonic":
 *       return `Invalid mnemonic: ${String(error.value)}`;
 *     case "Null":
 *       return `Not null`;
 *     case "String":
 *       // We can reuse existing formatter.
 *       return formatStringError(error);
 *     case "Trimmed":
 *       return "Value is not trimmed.";
 *     case "ValidMutationSize":
 *       return "A developer made an error, this should not happen.";
 *     case "Literal":
 *       return formatLiteralError(error);
 *     // Composite Types
 *     case "Union":
 *       return `Union errors: ${error.errors.map(formatTypeError).join(", ")}`;
 *     case "Object": {
 *       if (
 *         error.reason.kind === "ExtraKeys" ||
 *         error.reason.kind === "NotObject"
 *       )
 *         return "A developer made an error, this should not happen.";
 *       const firstError = Object.values(error.reason.errors).find(
 *         (e) => e !== undefined,
 *       )!;
 *       return formatTypeError(firstError);
 *     }
 *   }
 * };
 * ```
 *
 * @category Utilities
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
      case "DateIsoString":
        return formatDateIsoStringError(error);
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
      case "BigIntFromString":
        return formatBigIntFromStringError(error);
      case "Int64String":
        return formatInt64StringError(error);
      case "JsonValueFromString":
        return formatJsonValueFromStringError(error);
      case "Json":
        return formatJsonError(error);
      // Composite Types
      case "SimplePassword":
        return formatSimplePasswordError(formatTypeError)(error);
      case "Array":
        return formatArrayError(formatTypeError)(error);
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
    }
  };

  return formatTypeError;
};
