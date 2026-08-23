/**
 * English Evolu Type error formatters.
 *
 * This module mirrors Type's default English formatters. It is the canonical
 * source for translating Type error messages into other languages. Update this
 * file whenever Type adds, removes, or changes a default formatter.
 *
 * Every formatter is exported separately so applications bundle only messages
 * referenced by their localized Type collections. Parameterized Type factories
 * reuse one formatter for every parameter value; for example,
 * {@link formatMinLengthError} formats both `MinLength1` and `MinLength100`.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
  Base64UrlError,
  BetweenError,
  CapitalizedError,
  DateIsoError,
  DateIsoFromDateError,
  DecimalStringError,
  DiscriminatedUnionError,
  EvoluTypeError,
  FiniteError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IdError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxLengthError,
  MinLengthError,
  MnemonicError,
  MultipleOfError,
  NegativeDecimalStringError,
  NegativeError,
  NameError,
  NeverError,
  NonNaNError,
  NonNegativeDecimalStringError,
  NonNegativeError,
  NonPositiveDecimalStringError,
  NonPositiveError,
  ObjectError,
  ObjectNotObjectError,
  ObjectPropertyAccessError,
  ObjectTagError,
  ObjectUnexpectedPrototypeError,
  PositiveDecimalStringError,
  PositiveError,
  RecordError,
  RegexError,
  SetError,
  TableIdError,
  TemplateLiteralError,
  TrimmedError,
  TupleElementsError,
  TupleError,
  TypeError,
  TypeErrorFormatter,
  TypeOfError,
  UInt64Error,
  UnionError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();

  return `A value ${safelyStringifyUnknownValue(error.value)} is not a ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `A value ${safelyStringifyUnknownValue(reason.value)} is not an object.`
    : "The value is an object, but an Object Output must be a plain object or have a null prototype.";

/** Formats a NeverError in English. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `A value ${safelyStringifyUnknownValue(error.value)} is not valid for type Never.`;

/** Formats a String TypeOfError in English. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in English. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} does not match the template literal.`;

/** Formats a Number TypeOfError in English. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in English. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in English. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a Symbol TypeOfError in English. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in English. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in English. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `A value ${safelyStringifyUnknownValue(error.value)} is not an Evolu Type.`;

/** Formats an ObjectTagError in English. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `A value ${safelyStringifyUnknownValue(error.value)} does not have the expected object tag ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in English. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `A value ${safelyStringifyUnknownValue(error.value)} is not an instance of ${error.constructorName}.`;

/** Formats a LiteralError in English. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not strictly equal to the expected literal: ${globalThis.String(error.expected)}.`;

/** Formats a UnionError in English. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "A value does not match any allowed variant.";

/** Formats a DateIsoError in English. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a canonical ISO date-time string.`;

/** Formats a DateIsoFromDateError in English. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "The Date cannot be represented as DateIso.";

/** Formats a DecimalStringError in English. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be a canonical decimal string.`;

/** Formats an Int64Error in English. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid signed 64-bit integer (Int64).`;

/** Formats a UInt64Error in English. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid unsigned 64-bit integer (UInt64).`;

/** Formats an Int64StringError in English. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Int64 string.`;

/** Formats a CapitalizedError in English. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be capitalized.`;

/** Formats a TrimmedError in English. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be trimmed.`;

/** Formats a MinLengthError in English. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} does not meet the minimum length of ${error.min}.`;

/** Formats a MaxLengthError in English. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} exceeds the maximum length of ${error.max}.`;

/** Formats a LengthError in English. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} does not have the required length of ${error.exact}.`;

/** Formats a RegexError in English. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} does not match /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in English. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Base64Url string.`;

/** Formats a NameError in English. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Name.`;

/** Formats a MnemonicError in English. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid English BIP39 mnemonic.`;

/** Formats an IdError in English. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Id.`;

/** Formats a TableIdError in English. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Id for table ${error.table}.`;

/** Formats a NonNegativeError in English. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be non-negative (>= 0).`;

/** Formats a NonNegativeDecimalStringError in English. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be a non-negative decimal string.`;

/** Formats a PositiveError in English. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be positive (> 0).`;

/** Formats a PositiveDecimalStringError in English. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be a positive decimal string.`;

/** Formats a NonPositiveError in English. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be non-positive (<= 0).`;

/** Formats a NonPositiveDecimalStringError in English. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be a non-positive decimal string.`;

/** Formats a NegativeError in English. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be negative (< 0).`;

/** Formats a NegativeDecimalStringError in English. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be a negative decimal string.`;

/** Formats an IntError in English. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be a safe integer.`;

/** Formats a GreaterThanError in English. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be greater than ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in English. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be greater than or equal to ${error.min}.`;

/** Formats a LessThanError in English. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be less than ${error.max}.`;

/** Formats a LessThanOrEqualToError in English. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be less than or equal to ${error.max}.`;

/** Formats a NonNaNError in English. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "The value must not be NaN.";

/** Formats a FiniteError in English. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be finite.`;

/** Formats a MultipleOfError in English. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be a multiple of ${error.divisor}.`;

/** Formats a BetweenError in English. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be between ${error.min} and ${error.max}, inclusive.`;

/** Formats an ArrayError in English. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not an array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `An array element at index ${issue.index} is missing.`;
    case "Accessor":
      return `An array element at index ${issue.index} must be a data property.`;
    case "ExcessProperty":
      return "An excess Array property is not allowed. Remove it or use a different Type.";
    case "Element":
      return `An array element at index ${issue.index} is invalid.`;
  }
};

/** Formats a SetError in English. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not a Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `An excess Set property ${safelyStringifyUnknownValue(issue.key)} is not allowed.`;
    case "Element":
      return `A Set element at index ${issue.index} is invalid.`;
  }
};

/** Formats a MapError in English. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not a Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `An excess Map property ${safelyStringifyUnknownValue(issue.key)} is not allowed.`;
    case "Key":
      return `A Map key at index ${issue.index} is invalid.`;
    case "Value":
      return `A Map value at index ${issue.index} is invalid.`;
    case "Collision":
      return `Map keys at indexes ${issue.previousIndex} and ${issue.index} decode to the same key ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in English. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not a tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `A Tuple must contain exactly ${error.reason.expected} elements, but the value contains ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `A Tuple element at index ${issue.index} is missing.`;
    case "Accessor":
      return `A Tuple element at index ${issue.index} must be a data property.`;
    case "ExcessProperty":
      return "An excess Tuple property is not allowed. Remove it or use a different Type.";
    case "Element":
      return `A Tuple element at index ${issue.index} is invalid.`;
  }
};

/** Formats a RecordError in English. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not a Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "The value is an object, but a Record Output must be a plain object or have a null prototype.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} is invalid.`;
    case "Value":
      return `The value of property ${safelyStringifyUnknownValue(issue.key)} is invalid.`;
    case "Accessor":
      return `A Record property ${safelyStringifyUnknownValue(issue.key)} must be a data property.`;
    case "NonEnumerable":
      return `A Record property ${safelyStringifyUnknownValue(issue.key)} must be enumerable.`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} and ${safelyStringifyUnknownValue(issue.key)} decode to the same key ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in English. */
export const formatObjectError: TypeErrorFormatter<ObjectError> = (error) => {
  if (error.reason.kind !== "Properties") {
    return formatPlainObjectRootError(error.reason);
  }

  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);

  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.";
      case "NonEnumerable":
        return "An Object property must be enumerable. Make it enumerable or use a different Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `The required property ${safelyStringifyUnknownValue(key)} is missing.`;
  }
  if (typeof key === "symbol") {
    return "An Object property key must be a string. Remove the symbol property or use a different Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `The property ${safelyStringifyUnknownValue(key)} is not allowed. Remove it or use a different Type.`;
  }
  return `The property ${safelyStringifyUnknownValue(key)} is invalid.`;
};

/** Formats a DiscriminatedUnionError in English. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `The discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} must be a data property.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} must be an own property.`;
      }
      return `${property} must be enumerable.`;
    }
    case "Discriminator":
      return `The discriminator property ${safelyStringifyUnknownValue(error.reason.key)} has an unexpected value ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `The selected variant ${safelyStringifyUnknownValue(error.reason.discriminator)} is invalid.`;
  }
};

/** Formats a JsonValueError in English. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `A value ${safelyStringifyUnknownValue(issue.value)} is not a JSON value.`;
    case "NonFiniteNumber":
      return "A JSON number must be finite.";
    case "UnexpectedPrototype":
      return "The value is an object, but a JsonValue object must be a plain object or have a null prototype.";
    case "Accessor":
      return "A JSON property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.";
    case "NonEnumerable":
      return "A JSON object property must be enumerable. Remove it or use a different Type.";
    case "SymbolProperty":
      return "A JSON object property key must be a string. Remove the symbol property or use a different Type.";
    case "Hole":
      return "A JSON array element is missing.";
    case "ExcessProperty":
      return "An excess JSON array property is not allowed. Remove it or use a different Type.";
    case "CircularReference":
      return "A JsonValue must not contain circular references.";
  }
};

/** Formats a JsonError in English. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} cannot be parsed into a JsonValue.`;
