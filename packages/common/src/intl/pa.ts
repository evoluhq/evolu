/**
 * ਪੰਜਾਬੀ Evolu Type ਗਲਤੀ ਫਾਰਮੈਟਰ।
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

  return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${typeOf} ਨਹੀਂ ਹੈ।`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `ਮੁੱਲ ${safelyStringifyUnknownValue(reason.value)} object ਨਹੀਂ ਹੈ।`
    : "ਮੁੱਲ ਇੱਕ object ਹੈ, ਪਰ Object Output ਇੱਕ plain object ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ ਜਾਂ ਇਸਦਾ prototype null ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।";

/** NeverError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} Never ਕਿਸਮ ਲਈ ਵੈਧ ਨਹੀਂ ਹੈ।`;

/** String TypeOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} template literal ਨਾਲ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ।`;

/** Number TypeOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} Evolu Type ਨਹੀਂ ਹੈ।`;

/** ObjectTagError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵਿੱਚ ਉਮੀਦ ਕੀਤਾ object tag ${safelyStringifyUnknownValue(error.expected)} ਨਹੀਂ ਹੈ।`;

/** InstanceOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.constructorName} ਦਾ instance ਨਹੀਂ ਹੈ।`;

/** LiteralError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਉਮੀਦ ਕੀਤੇ literal ਦੇ strictly ਬਰਾਬਰ ਨਹੀਂ ਹੈ: ${globalThis.String(error.expected)}।`;

/** UnionError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "ਮੁੱਲ ਕਿਸੇ ਵੀ ਮਨਜ਼ੂਰਸ਼ੁਦਾ variant ਨਾਲ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ।";

/** DateIsoError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string ਨਹੀਂ ਹੈ।`;

/** DateIsoFromDateError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date ਨੂੰ DateIso ਵਜੋਂ ਦਰਸਾਇਆ ਨਹੀਂ ਜਾ ਸਕਦਾ।";

/** DecimalStringError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ canonical decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** Int64Error ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ signed 64-bit integer (Int64) ਨਹੀਂ ਹੈ।`;

/** UInt64Error ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ unsigned 64-bit integer (UInt64) ਨਹੀਂ ਹੈ।`;

/** Int64StringError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Int64 string ਨਹੀਂ ਹੈ।`;

/** CapitalizedError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦਾ ਪਹਿਲਾ ਅੱਖਰ ਵੱਡਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** TrimmedError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੇ ਸ਼ੁਰੂ ਅਤੇ ਅੰਤ ਤੋਂ whitespace ਹਟਿਆ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** MinLengthError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੀ ਲੰਬਾਈ ਘੱਟੋ-ਘੱਟ ${error.min} ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;

/** MaxLengthError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੀ ਲੰਬਾਈ ਵੱਧ ਤੋਂ ਵੱਧ ${error.max} ਹੋ ਸਕਦੀ ਹੈ।`;

/** LengthError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਦੀ ਲੋੜੀਂਦੀ ਲੰਬਾਈ ${error.exact} ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।`;

/** RegexError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} ਨਾਲ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ।`;

/** Base64UrlError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Base64Url string ਨਹੀਂ ਹੈ।`;

/** NameError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Name ਨਹੀਂ ਹੈ।`;

/** MnemonicError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ ਅੰਗਰੇਜ਼ੀ BIP39 mnemonic ਨਹੀਂ ਹੈ।`;

/** IdError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਵੈਧ Id ਨਹੀਂ ਹੈ।`;

/** TableIdError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} table ${error.table} ਲਈ ਵੈਧ Id ਨਹੀਂ ਹੈ।`;

/** NonNegativeError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਰਿਣਾਤਮਕ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ (>= 0)।`;

/** NonNegativeDecimalStringError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ non-negative decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** PositiveError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਧਨਾਤਮਕ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ (> 0)।`;

/** PositiveDecimalStringError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ positive decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** NonPositiveError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਧਨਾਤਮਕ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ (<= 0)।`;

/** NonPositiveDecimalStringError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ non-positive decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** NegativeError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਰਿਣਾਤਮਕ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ (< 0)।`;

/** NegativeDecimalStringError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ negative decimal string ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** IntError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਇੱਕ safe integer ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** GreaterThanError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.min} ਤੋਂ ਵੱਡਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** GreaterThanOrEqualToError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.min} ਤੋਂ ਵੱਡਾ ਜਾਂ ਉਸ ਦੇ ਬਰਾਬਰ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** LessThanError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.max} ਤੋਂ ਛੋਟਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** LessThanOrEqualToError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.max} ਤੋਂ ਛੋਟਾ ਜਾਂ ਉਸ ਦੇ ਬਰਾਬਰ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** NonNaNError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "ਮੁੱਲ NaN ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ।";

/** FiniteError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਸੀਮਿਤ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** MultipleOfError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.divisor} ਦਾ ਗੁਣਜ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** BetweenError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ${error.min} ਅਤੇ ${error.max} ਦੇ ਵਿਚਕਾਰ, ਦੋਵੇਂ ਸੀਮਾਵਾਂ ਸਮੇਤ, ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।`;

/** ArrayError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
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

/** SetError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} Set ਨਹੀਂ ਹੈ।`;
  }
  if (error.reason.kind === "UnexpectedPrototype") {
    return "ਮੁੱਲ ਇੱਕ Set subclass ਦਾ instance ਹੈ, ਪਰ Set Output ਇੱਕ ਸਿੱਧਾ Set instance ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `ਵਾਧੂ Set property ${safelyStringifyUnknownValue(issue.key)} ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ।`;
    case "Element":
      return `index ${issue.index} ਉੱਤੇ Set element ਅਵੈਧ ਹੈ।`;
  }
};

/** TupleError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} tuple ਨਹੀਂ ਹੈ।`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple ਵਿੱਚ ਬਿਲਕੁਲ ${error.reason.expected} elements ਹੋਣੇ ਚਾਹੀਦੇ ਹਨ, ਪਰ ਮੁੱਲ ਵਿੱਚ ${error.reason.actual} ਹਨ।`;
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

/** RecordError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
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

/** ObjectError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
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

/** DiscriminatedUnionError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
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
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)} ਦਾ ਮੁੱਲ ${safelyStringifyUnknownValue(error.reason.value)} ਉਮੀਦ ਕੀਤਾ ਨਹੀਂ ਹੈ।`;
    case "Member":
      return `ਚੁਣਿਆ ਗਿਆ variant ${safelyStringifyUnknownValue(error.reason.discriminator)} ਅਵੈਧ ਹੈ।`;
  }
};

/** JsonValueError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
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

/** JsonError ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ format ਕਰਦਾ ਹੈ। */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `ਮੁੱਲ ${safelyStringifyUnknownValue(error.value)} ਨੂੰ JsonValue ਵਿੱਚ parse ਨਹੀਂ ਕੀਤਾ ਜਾ ਸਕਦਾ।`;
