/**
 * Punjabi Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
  Base64UrlError,
  BooleanFromStringError,
  BetweenError,
  IdentifierError,
  CapitalizedError,
  DataError,
  UncapitalizedError,
  UppercasedError,
  LowercasedError,
  DateIsoError,
  DateIsoFromDateError,
  DecimalStringError,
  DiscriminatedUnionError,
  EmailError,
  EvoluTypeError,
  FiniteError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
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
  StartsWithError,
  TrimmedError,
  TupleElementsError,
  TupleError,
  TypeError,
  TypeErrorFormatter,
  TypeOfError,
  TypeValueError,
  UInt64Error,
  UnionError,
  UuidError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();

  return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${typeOf} ਨਹੀਂ ਹੈ।`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `ਮੁੱਲ ${safelyStringifyUnknownValue(reason.value)} object ਨਹੀਂ ਹੈ।`
    : "ਮੁੱਲ ਇੱਕ object ਹੈ, ਪਰ Object Output ਇੱਕ plain object ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ ਜਾਂ ਇਸਦਾ prototype null ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।";

/** Formats a NeverError in Punjabi. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} Never ਕਿਸਮ ਲਈ ਵੈਧ ਨਹੀਂ ਹੈ।`;

/** Formats a String TypeOfError in Punjabi. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Punjabi. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} template literal ਨਾਲ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ।`;

/** Formats a Number TypeOfError in Punjabi. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Punjabi. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Punjabi. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Punjabi. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} boolean ਨਹੀਂ ਹੈ। true ਜਾਂ false ਵਰਤੋ।`;

/** Formats a Symbol TypeOfError in Punjabi. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Punjabi. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Punjabi. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} Evolu Type ਨਹੀਂ ਹੈ।`;

/** Formats an ObjectTagError in Punjabi. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵਿੱਚ ਉਮੀਦ ਕੀਤਾ object tag ${safelyStringifyUnknownValue(error.expected)} ਨਹੀਂ ਹੈ।`;

/** Formats an InstanceOfError in Punjabi. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.constructorName} ਦਾ instance ਨਹੀਂ ਹੈ।`;

/** Formats a LiteralError in Punjabi. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਉਮੀਦ ਕੀਤੇ literal ਦੇ strictly ਬਰਾਬਰ ਨਹੀਂ ਹੈ: ${String(error.expected)}।`;

/** Formats a UnionError in Punjabi. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "ਮੁੱਲ ਕਿਸੇ ਵੀ ਮਨਜ਼ੂਰਸ਼ੁਦਾ variant ਨਾਲ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ।";

/** Formats a DateIsoError in Punjabi. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string ਨਹੀਂ ਹੈ।`;

/** Formats a DateIsoFromDateError in Punjabi. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date ਨੂੰ DateIso ਵਜੋਂ ਦਰਸਾਇਆ ਨਹੀਂ ਜਾ ਸਕਦਾ।";

/** Formats a DecimalStringError in Punjabi. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ canonical decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats an Int64Error in Punjabi. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ signed 64-bit integer (Int64) ਨਹੀਂ ਹੈ।`;

/** Formats a UInt64Error in Punjabi. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ unsigned 64-bit integer (UInt64) ਨਹੀਂ ਹੈ।`;

/** Formats an Int64StringError in Punjabi. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Int64 string ਨਹੀਂ ਹੈ।`;

/** Formats an IdentifierError in Punjabi. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.casing} ਪਛਾਣਕਰਤਾ ਨਹੀਂ ਹੈ।`;

/** Formats a CapitalizedError in Punjabi. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦਾ ਪਹਿਲਾ ਅੱਖਰ ਵੱਡਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats an UncapitalizedError in Punjabi. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੱਡੇ ਅੱਖਰ ਨਾਲ ਸ਼ੁਰੂ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ।`;

/** Formats an UppercasedError in Punjabi. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੱਡੇ ਅੱਖਰਾਂ ਵਿੱਚ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a LowercasedError in Punjabi. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਛੋਟੇ ਅੱਖਰਾਂ ਵਿੱਚ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a TrimmedError in Punjabi. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੇ ਸ਼ੁਰੂ ਅਤੇ ਅੰਤ ਤੋਂ whitespace ਹਟਿਆ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a StartsWithError in Punjabi. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੀ ਸ਼ੁਰੂਆਤ ${safelyStringifyUnknownValue(error.prefix)} ਨਾਲ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;

/** Formats a MinLengthError in Punjabi. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੀ ਲੰਬਾਈ ਘੱਟੋ-ਘੱਟ ${error.min} ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;

/** Formats a MaxLengthError in Punjabi. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੀ ਲੰਬਾਈ ਵੱਧ ਤੋਂ ਵੱਧ ${error.max} ਹੋ ਸਕਦੀ ਹੈ।`;

/** Formats a LengthError in Punjabi. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੀ ਲੰਬਾਈ ਬਿਲਕੁਲ ${error.exact} ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;

/** Formats a RegexError in Punjabi. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} ਨਾਲ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ।`;

/** Formats a Base64UrlError in Punjabi. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Base64Url string ਨਹੀਂ ਹੈ।`;

/** Formats a NameError in Punjabi. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Name ਨਹੀਂ ਹੈ।`;

/** Formats an EmailError in Punjabi. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ ਈਮੇਲ ਪਤਾ ਨਹੀਂ ਹੈ।`;

/** Formats a MnemonicError in Punjabi. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ ਅੰਗਰੇਜ਼ੀ BIP39 mnemonic ਨਹੀਂ ਹੈ।`;

/** Formats an IdError in Punjabi. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Id ਨਹੀਂ ਹੈ।`;

/** Formats a TableIdError in Punjabi. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} table ${error.table} ਲਈ ਵੈਧ Id ਨਹੀਂ ਹੈ।`;

/** Formats a UuidError in Punjabi. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਛੋਟੇ ਅੱਖਰਾਂ ਵਾਲਾ canonical UUID ਨਹੀਂ ਹੈ।`;

/** Formats a NonNegativeError in Punjabi. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਰਿਣਾਤਮਕ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ (>= 0)।`;

/** Formats a NonNegativeDecimalStringError in Punjabi. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ ਅਤੇ ਰਿਣਾਤਮਕ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ।`;

/** Formats a PositiveError in Punjabi. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਧਨਾਤਮਕ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ (> 0)।`;

/** Formats a PositiveDecimalStringError in Punjabi. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ ਧਨਾਤਮਕ decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a NonPositiveError in Punjabi. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਧਨਾਤਮਕ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ (<= 0)।`;

/** Formats a NonPositiveDecimalStringError in Punjabi. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ ਅਤੇ ਧਨਾਤਮਕ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ।`;

/** Formats a NegativeError in Punjabi. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਰਿਣਾਤਮਕ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ (< 0)।`;

/** Formats a NegativeDecimalStringError in Punjabi. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ ਰਿਣਾਤਮਕ decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats an IntError in Punjabi. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ safe integer ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats an IntFromStringError in Punjabi. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦਸ਼ਮਲਵ ਪੂਰਨ ਅੰਕ ਨਹੀਂ ਹੈ।`;

/** Formats a GreaterThanError in Punjabi. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ ${error.min} ਤੋਂ ਵੱਡਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a GreaterThanOrEqualToError in Punjabi. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ ${error.min} ਤੋਂ ਵੱਡਾ ਜਾਂ ਉਸ ਦੇ ਬਰਾਬਰ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a LessThanError in Punjabi. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ ${error.max} ਤੋਂ ਛੋਟਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a LessThanOrEqualToError in Punjabi. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ ${error.max} ਤੋਂ ਛੋਟਾ ਜਾਂ ਉਸ ਦੇ ਬਰਾਬਰ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a NonNaNError in Punjabi. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "ਮੁੱਲ NaN ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ।";

/** Formats a FiniteError in Punjabi. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਸੀਮਿਤ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a MultipleOfError in Punjabi. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ ${error.divisor} ਦਾ ਗੁਣਜ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats a BetweenError in Punjabi. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ ${error.min} ਅਤੇ ${error.max} ਦੇ ਵਿਚਕਾਰ, ਦੋਵੇਂ ਸੀਮਾਵਾਂ ਸਮੇਤ, ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Formats an ArrayError in Punjabi. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} array ਨਹੀਂ ਹੈ।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} ਉੱਤੇ array element ਮੌਜੂਦ ਨਹੀਂ ਹੈ।`;
    case "Accessor":
      return `index ${issue.index} ਉੱਤੇ array element ਇੱਕ data property ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;
    case "ExcessProperty":
      return "ਵਾਧੂ Array property ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ। ਇਸਨੂੰ ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "Element":
      return `index ${issue.index} ਉੱਤੇ array element ਅਵੈਧ ਹੈ।`;
  }
};

/** Formats a SetError in Punjabi. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} Set ਨਹੀਂ ਹੈ।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `ਵਾਧੂ Set property ${safelyStringifyUnknownValue(issue.key)} ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ।`;
    case "Element":
      return `index ${issue.index} ਉੱਤੇ Set element ਅਵੈਧ ਹੈ।`;
  }
};

/** Formats a MapError in Punjabi. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} Map ਨਹੀਂ ਹੈ।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `ਵਾਧੂ Map property ${safelyStringifyUnknownValue(issue.key)} ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ।`;
    case "Key":
      return `index ${issue.index} ਉੱਤੇ Map ਦੀ key ਅਵੈਧ ਹੈ।`;
    case "Value":
      return `index ${issue.index} ਉੱਤੇ Map ਦਾ ਮੁੱਲ ਅਵੈਧ ਹੈ।`;
    case "Collision":
      return `index ${issue.previousIndex} ਅਤੇ ${issue.index} ਉੱਤੇ ਮੌਜੂਦ Map keys decode ਹੋ ਕੇ ਇੱਕੋ key ${safelyStringifyUnknownValue(issue.outputKey)} ਬਣ ਜਾਂਦੀਆਂ ਹਨ।`;
  }
};

/** Formats a TupleError in Punjabi. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} tuple ਨਹੀਂ ਹੈ।`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple ਦੀ ਲੰਬਾਈ ${error.reason.expected} ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ, ਪਰ ਮੁੱਲ ਦੀ ਲੰਬਾਈ ${error.reason.actual} ਹੈ।`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} ਉੱਤੇ Tuple element ਮੌਜੂਦ ਨਹੀਂ ਹੈ।`;
    case "Accessor":
      return `index ${issue.index} ਉੱਤੇ Tuple element ਇੱਕ data property ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;
    case "ExcessProperty":
      return "ਵਾਧੂ Tuple property ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ। ਇਸਨੂੰ ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "Element":
      return `index ${issue.index} ਉੱਤੇ Tuple element ਅਵੈਧ ਹੈ।`;
  }
};

/** Formats a RecordError in Punjabi. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} Record ਨਹੀਂ ਹੈ।`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "ਮੁੱਲ ਇੱਕ object ਹੈ, ਪਰ Record Output ਇੱਕ plain object ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ ਜਾਂ ਇਸਦਾ prototype null ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} ਅਵੈਧ ਹੈ।`;
    case "Value":
      return `Property ${safelyStringifyUnknownValue(issue.key)} ਦਾ ਮੁੱਲ ਅਵੈਧ ਹੈ।`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ਇੱਕ data property ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} ਅਤੇ ${safelyStringifyUnknownValue(issue.key)} decode ਹੋ ਕੇ ਇੱਕੋ key ${safelyStringifyUnknownValue(issue.outputKey)} ਬਣ ਜਾਂਦੀਆਂ ਹਨ।`;
  }
};

/** Formats an ObjectError in Punjabi. */
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
        return "Object property ਇੱਕ data property ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਇਸ Type ਨੂੰ ਵਰਤਣ ਤੋਂ ਪਹਿਲਾਂ accessor values ਨੂੰ plain data ਵਿੱਚ materialize ਕਰੋ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
      case "NonEnumerable":
        return "Object property enumerable ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਇਸਨੂੰ enumerable ਬਣਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `ਲੋੜੀਂਦੀ property ${safelyStringifyUnknownValue(key)} ਮੌਜੂਦ ਨਹੀਂ ਹੈ।`;
  }
  if (typeof key === "symbol") {
    return "Object property key ਇੱਕ string ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। symbol property ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Property ${safelyStringifyUnknownValue(key)} ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ। ਇਸਨੂੰ ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।`;
  }
  return `Property ${safelyStringifyUnknownValue(key)} ਅਵੈਧ ਹੈ।`;
};

/** Formats a DiscriminatedUnionError in Punjabi. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ਇੱਕ data property ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} ਇੱਕ own property ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;
      }
      return `${property} enumerable ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;
    }
    case "Discriminator":
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)} ਦਾ ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} ਅਣਕਿਆਸਿਆ ਹੈ।`;
    case "Member":
      return `ਚੁਣਿਆ ਗਿਆ variant ${safelyStringifyUnknownValue(error.reason.discriminator)} ਅਵੈਧ ਹੈ।`;
  }
};

/** Formats a DataError in Punjabi. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `ਮੁੱਲ ${safelyStringifyUnknownValue(issue.value)} Data ਨਹੀਂ ਹੈ।`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} ਦਾ prototype ਅਣਕਿਆਸਿਆ ਹੈ।`;
    case "Accessor":
      return "Data property ਇੱਕ data property ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਇਸ Type ਨੂੰ ਵਰਤਣ ਤੋਂ ਪਹਿਲਾਂ accessor values ਨੂੰ plain data ਵਿੱਚ materialize ਕਰੋ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "NonEnumerable":
      return "Data Object property enumerable ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਇਸਨੂੰ ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "SymbolProperty":
      return "Data Object property key ਇੱਕ string ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। symbol property ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "Hole":
      return "Data Array element ਮੌਜੂਦ ਨਹੀਂ ਹੈ।";
    case "InvalidUint8Array":
      return "Data Uint8Array ਦਾ ArrayBuffer detached ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ, ਅਤੇ Uint8Array ਉਸ ArrayBuffer ਦੀਆਂ ਸੀਮਾਵਾਂ ਦੇ ਅੰਦਰ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।";
    case "ExcessProperty":
      return `Data ${issue.container} ਵਿੱਚ ਵਾਧੂ own properties ਨਹੀਂ ਹੋਣੀਆਂ ਚਾਹੀਦੀਆਂ। ਉਸ property ਨੂੰ ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।`;
  }
};

/** Formats a JsonValueError in Punjabi. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `ਮੁੱਲ ${safelyStringifyUnknownValue(issue.value)} ਇੱਕ JSON value ਨਹੀਂ ਹੈ।`;
    case "NonFiniteNumber":
      return "JSON number ਸੀਮਿਤ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।";
    case "UnexpectedPrototype":
      return "ਮੁੱਲ ਇੱਕ object ਹੈ, ਪਰ JsonValue object ਇੱਕ plain object ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ ਜਾਂ ਇਸਦਾ prototype null ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।";
    case "Accessor":
      return "JSON property ਇੱਕ data property ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਇਸ Type ਨੂੰ ਵਰਤਣ ਤੋਂ ਪਹਿਲਾਂ accessor values ਨੂੰ plain data ਵਿੱਚ materialize ਕਰੋ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "NonEnumerable":
      return "JSON object property enumerable ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਇਸਨੂੰ ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "SymbolProperty":
      return "JSON object property key ਇੱਕ string ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। symbol property ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "Hole":
      return "JSON array element ਮੌਜੂਦ ਨਹੀਂ ਹੈ।";
    case "ExcessProperty":
      return "ਵਾਧੂ JSON array property ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ। ਇਸਨੂੰ ਹਟਾਓ ਜਾਂ ਕੋਈ ਵੱਖਰਾ Type ਵਰਤੋ।";
    case "CircularReference":
      return "JsonValue ਵਿੱਚ circular references ਨਹੀਂ ਹੋਣੇ ਚਾਹੀਦੇ।";
  }
};

/** Formats a JsonError in Punjabi. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ JsonValue ਵਿੱਚ parse ਨਹੀਂ ਕੀਤਾ ਜਾ ਸਕਦਾ।`;

/** Formats a ByteSizeLiteralError in Punjabi. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਬਾਈਟ ਆਕਾਰ ਦਾ literal ਨਹੀਂ ਹੈ। "512KiB" ਜਾਂ "1MiB" ਵਰਗਾ ਮੁੱਲ ਵਰਤੋ।`;

/** Formats a ByteLengthError in Punjabi. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "ਮੁੱਲ -0 ਬਾਈਟ ਲੰਬਾਈ ਨਹੀਂ ਹੈ। ਇਸ ਦੀ ਥਾਂ 0 ਵਰਤੋ।";

/** Formats a ByteLengthFromStringError in Punjabi. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਬਾਈਟ ਲੰਬਾਈ ਨਹੀਂ ਹੈ। ਬਾਈਟਾਂ ਦੀ ਗਿਣਤੀ ਜਾਂ 10MiB ਵਰਗਾ literal ਵਰਤੋ।`;

/** Formats a DurationLiteralError in Punjabi. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਮਿਆਦ ਦਾ literal ਨਹੀਂ ਹੈ। "500ms" ਜਾਂ "1.5s" ਵਰਗਾ ਮੁੱਲ ਵਰਤੋ।`;

/** Formats a PercentageLiteralError in Punjabi. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਪ੍ਰਤੀਸ਼ਤ ਦਾ literal ਨਹੀਂ ਹੈ। "50%" ਜਾਂ "12.5%" ਵਰਗਾ ਮੁੱਲ ਵਰਤੋ।`;
