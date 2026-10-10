/**
 * English Evolu Type error formatters.
 *
 * Types use these formatters as their default messages, so add, remove, or
 * change their English here, not in the Type modules. Only the internal checks
 * of `withDefault` keep their English inline, because no application formats
 * them. Locale modules translate this file: each one exports the same
 * formatters with the same branches.
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
  Base64Error,
  Base64UrlError,
  BooleanFromStringError,
  BetweenBigIntError,
  BetweenError,
  IdentifierError,
  CapitalizedError,
  DataError,
  UncapitalizedError,
  UppercasedError,
  LowercasedError,
  DateIsoError,
  DateIsoFromDateError,
  DateIsoFromRfc3339Error,
  DecimalStringError,
  DiscriminatedUnionError,
  EmailError,
  EndsWithError,
  EvoluTypeError,
  ExcludesError,
  FiniteError,
  FiniteNumberFromStringError,
  GreaterThanBigIntError,
  GreaterThanError,
  GreaterThanOrEqualToBigIntError,
  GreaterThanOrEqualToError,
  HexColorError,
  HexError,
  HostnameError,
  IbanError,
  IncludesError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
  IdError,
  IpAddressError,
  IpAddressFromStringError,
  Ipv4AddressError,
  Ipv6AddressError,
  Ipv6AddressFromStringError,
  IsbnError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanBigIntError,
  LessThanError,
  LessThanOrEqualToBigIntError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxEntriesError,
  MaxLengthError,
  MaxSizeError,
  MaxUtf8ByteLengthError,
  MinEntriesError,
  MinLengthError,
  MinSizeError,
  MnemonicError,
  MultipleOfError,
  NegativeDecimalStringError,
  NegativeError,
  NameError,
  NeverError,
  NonEmptyArrayError,
  NonNaNError,
  NonNegativeDecimalStringError,
  NonNegativeError,
  NonPositiveDecimalStringError,
  NonPositiveError,
  NormalizedError,
  ObjectError,
  ObjectNotObjectError,
  ObjectPropertyAccessError,
  ObjectTagError,
  ObjectUnexpectedPrototypeError,
  PhoneNumberE164Error,
  PlainDateIsoError,
  PositiveDecimalStringError,
  PositiveError,
  RecordError,
  RedactedError,
  RegexError,
  SetError,
  SimplePasswordError,
  StartsWithError,
  TableIdError,
  TemplateLiteralError,
  TrimmedError,
  TupleElementsError,
  TupleError,
  TypeError,
  TypeErrorFormatter,
  TypeOfError,
  TypeValueError,
  UInt64Error,
  UlidError,
  UnionError,
  UniqueError,
  UuidError,
  UuidVersionError,
  ValidDateError,
  WellFormedError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string =>
  `A value ${safelyStringifyUnknownValue(error.value)} is not a ${error.expected.toLowerCase()}.`;

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

/** Formats a BooleanFromStringError in English. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a boolean. Use true or false.`;

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

/** Formats a ValidDateError in English. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "The Date is invalid.";

/** Formats an InstanceOfError in English. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `A value ${safelyStringifyUnknownValue(error.value)} is not an instance of ${error.constructorName}.`;

/** Formats a LiteralError in English. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not strictly equal to the expected literal: ${String(error.expected)}.`;

/** Formats a UnionError in English. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "A value does not match any allowed variant.";

/** Formats a DateIsoError in English. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a canonical ISO date-time string.`;

/** Formats a PlainDateIsoError in English. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid calendar date in the YYYY-MM-DD format.`;

/** Formats a DateIsoFromDateError in English. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "The Date cannot be represented as DateIso.";

/** Formats a DateIsoFromRfc3339Error in English. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a supported RFC 3339 date-time. Use a value such as "2024-01-01T12:00:00Z".`;

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

/** Formats an IdentifierError in English. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a ${error.casing} identifier.`;

/** Formats a CapitalizedError in English. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be capitalized.`;

/** Formats an UncapitalizedError in English. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must not start with an uppercase letter.`;

/** Formats an UppercasedError in English. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be uppercased.`;

/** Formats a LowercasedError in English. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be lowercased.`;

/** Formats a TrimmedError in English. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be trimmed.`;

/** Formats a WellFormedError in English. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be well-formed Unicode text.`;

/** Formats a NormalizedError in English. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be in Unicode normalization form ${error.form}.`;

/** Formats a StartsWithError in English. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must start with ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in English. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must end with ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in English. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must contain ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in English. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must not contain ${safelyStringifyUnknownValue(error.substring)}.`;

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

/** Formats a MaxUtf8ByteLengthError in English. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} exceeds the maximum UTF-8 byte length of ${error.max}.`;

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

/** Formats a Base64Error in English. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Base64 string.`;

/** Formats a HexError in English. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not lowercase hexadecimal with an even number of digits.`;

/** Formats a HexColorError in English. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a color in the lowercase #rrggbb format.`;

/** Formats a NameError in English. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Name.`;

/** Formats an EmailError in English. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid email address.`;

/** Formats a HostnameError in English. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid lowercase hostname.`;

/** Formats an Ipv4AddressError in English. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid IPv4 address.`;

/** Formats an Ipv6AddressError in English. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a canonical IPv6 address.`;

/** Formats an Ipv6AddressFromStringError in English. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid IPv6 address.`;

/** Formats an IpAddressError in English. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid IPv4 address or canonical IPv6 address.`;

/** Formats an IpAddressFromStringError in English. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid IP address.`;

/** Formats a PhoneNumberE164Error in English. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a phone number in E.164 format.`;

/** Formats an IbanError in English. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid IBAN in uppercase without spaces.`;

/** Formats an IsbnError in English. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid 13-digit ISBN without hyphens.`;

/** Formats a SimplePasswordError in English. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "The password must be trimmed.";
    case "TooLong":
      return "The password exceeds the maximum length of 64.";
    case "TooShort":
      return "The password does not meet the minimum length of 8.";
  }
};

/** Formats a MnemonicError in English. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "The value is not a valid English BIP39 mnemonic.";

/** Formats a RedactedError in English. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "The secret must be a string.";

/** Formats an IdError in English. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Id.`;

/** Formats a TableIdError in English. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a valid Id for table ${error.table}.`;

/** Formats a UuidError in English. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a canonical lowercase UUID.`;

/** Formats a UuidVersionError in English. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a version ${error.version} UUID.`;

/** Formats a UlidError in English. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a canonical uppercase ULID.`;

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

/** Formats an IntFromStringError in English. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a decimal integer.`;

/** Formats a FiniteNumberFromStringError in English. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a decimal number.`;

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

/** Formats a GreaterThanBigIntError in English. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be greater than ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in English. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be greater than or equal to ${error.min}.`;

/** Formats a LessThanBigIntError in English. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be less than ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in English. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must be less than or equal to ${error.max}.`;

/** Formats a BetweenBigIntError in English. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
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

/** Formats a NonEmptyArrayError in English. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} must contain at least one item.`;

/** Formats a UniqueError in English. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} has equal items at indexes ${error.previousIndex} and ${error.index}.`;

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

/** Formats a MinSizeError in English. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `The size ${error.value.size} does not meet the minimum size of ${error.min}.`;

/** Formats a MaxSizeError in English. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `The size ${error.value.size} exceeds the maximum size of ${error.max}.`;

/** Formats a TupleError in English. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not a tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `A Tuple must have length ${error.reason.expected}, but the value has length ${error.reason.actual}.`;
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

/** Formats a MinEntriesError in English. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} does not meet the minimum entry count of ${error.min}.`;

/** Formats a MaxEntriesError in English. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `The value ${safelyStringifyUnknownValue(error.value)} exceeds the maximum entry count of ${error.max}.`;

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

/** Formats a DataError in English. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `A value ${safelyStringifyUnknownValue(issue.value)} is not Data.`;
    case "UnexpectedPrototype":
      return `A Data ${issue.container} has an unexpected prototype.`;
    case "Accessor":
      return "A Data property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.";
    case "NonEnumerable":
      return "A Data Object property must be enumerable. Remove it or use a different Type.";
    case "SymbolProperty":
      return "A Data Object property key must be a string. Remove the symbol property or use a different Type.";
    case "Hole":
      return "A Data Array element is missing.";
    case "InvalidUint8Array":
      return "A Data Uint8Array must have an attached, in-bounds ArrayBuffer.";
    case "ExcessProperty":
      return `A Data ${issue.container} must not have excess own properties. Remove the property or use a different Type.`;
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

// Type imports this module, so the Bytes, Time, and Number formatters do not
// import their error types from those modules. Importing ByteSizeLiteralError
// would make every program that imports Type also type-check Bytes. The
// formatters read only the value.

/** Formats a ByteSizeLiteralError in English. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a byte-size literal. Use a value such as "512KiB" or "1MiB".`;

/** Formats a ByteLengthError in English. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "The value -0 is not a byte length. Use 0 instead.";

/** Formats a ByteLengthFromStringError in English. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a byte length. Use a number of bytes or a literal such as 10MiB.`;

/** Formats a DurationLiteralError in English. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a duration literal. Use a value such as "500ms" or "1.5s".`;

/** Formats a PercentageLiteralError in English. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `The value ${safelyStringifyUnknownValue(error.value)} is not a percentage literal. Use a value such as "50%" or "12.5%".`;
