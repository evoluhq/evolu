/**
 * Urdu Evolu Type error formatters.
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
  FiniteError,
  FiniteNumberFromStringError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  HexError,
  HostnameError,
  IbanError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
  IdError,
  Ipv4AddressError,
  Ipv6AddressError,
  Ipv6AddressFromStringError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxEntriesError,
  MaxLengthError,
  MinEntriesError,
  MinLengthError,
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
): string => {
  const typeOf = error.expected.toLowerCase();
  return `قدر ${safelyStringifyUnknownValue(error.value)} ${typeOf} نہیں ہے۔`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `قدر ${safelyStringifyUnknownValue(reason.value)} آبجیکٹ نہیں ہے۔`
    : "قدر ایک آبجیکٹ ہے، لیکن Object Output سادہ آبجیکٹ ہونا چاہیے یا اس کا prototype null ہونا چاہیے۔";

/** Formats a NeverError in Urdu. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} قسم Never کے لیے درست نہیں ہے۔`;
/** Formats a String TypeOfError in Urdu. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** Formats a TemplateLiteralError in Urdu. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} template literal سے مطابقت نہیں رکھتی۔`;
/** Formats a Number TypeOfError in Urdu. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formats a BigInt TypeOfError in Urdu. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formats a Boolean TypeOfError in Urdu. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formats a Symbol TypeOfError in Urdu. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formats a Function TypeOfError in Urdu. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** Formats an EvoluTypeError in Urdu. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `قدر ${safelyStringifyUnknownValue(error.value)} Evolu Type نہیں ہے۔`;
/** Formats an ObjectTagError in Urdu. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} میں متوقع آبجیکٹ ٹیگ ${safelyStringifyUnknownValue(error.expected)} نہیں ہے۔`;

/** Formats a ValidDateError in Urdu. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date درست نہیں ہے۔";
/** Formats an InstanceOfError in Urdu. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.constructorName} کی instance نہیں ہے۔`;
/** Formats a LiteralError in Urdu. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} متوقع لٹرل کے عین برابر نہیں ہے: ${String(error.expected)}۔`;
/** Formats a UnionError in Urdu. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "قدر کسی بھی منظور شدہ variant سے مطابقت نہیں رکھتی۔";
/** Formats a DateIsoError in Urdu. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string نہیں ہے۔`;

/** Formats a PlainDateIsoError in Urdu. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} YYYY-MM-DD فارمیٹ میں درست کیلنڈر تاریخ نہیں ہے۔`;
/** Formats a DateIsoFromDateError in Urdu. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date کو DateIso کے طور پر ظاہر نہیں کیا جا سکتا۔";

/** Formats a DateIsoFromRfc3339Error in Urdu. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} تعاون یافتہ RFC 3339 date-time نہیں ہے۔ "2024-01-01T12:00:00Z" جیسی قدر استعمال کریں۔`;
/** Formats a DecimalStringError in Urdu. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} canonical decimal string ہونی چاہیے۔`;
/** Formats an Int64Error in Urdu. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست signed 64-bit integer (Int64) نہیں ہے۔`;
/** Formats a UInt64Error in Urdu. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست unsigned 64-bit integer (UInt64) نہیں ہے۔`;
/** Formats an Int64StringError in Urdu. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Int64 string نہیں ہے۔`;

/** Formats an IdentifierError in Urdu. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} ${error.casing} شناخت کنندہ نہیں ہے۔`;

/** Formats a CapitalizedError in Urdu. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کا پہلا حرف بڑا ہونا چاہیے۔`;

/** Formats an UncapitalizedError in Urdu. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} بڑے حرف سے شروع نہیں ہونی چاہیے۔`;

/** Formats an UppercasedError in Urdu. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) => `قدر ${safelyStringifyUnknownValue(error.value)} بڑے حروف میں ہونی چاہیے۔`;

/** Formats a LowercasedError in Urdu. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} چھوٹے حروف میں ہونی چاہیے۔`;
/** Formats a TrimmedError in Urdu. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کے شروع یا آخر میں خالی جگہ نہیں ہونی چاہیے۔`;

/** Formats a WellFormedError in Urdu. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست ساخت والا Unicode متن ہونی چاہیے۔`;

/** Formats a NormalizedError in Urdu. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} Unicode normalization form ${error.form} میں ہونی چاہیے۔`;
/** Formats a StartsWithError in Urdu. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کی ابتدا ${safelyStringifyUnknownValue(error.prefix)} سے ہونی چاہیے۔`;

/** Formats an EndsWithError in Urdu. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کا اختتام ${safelyStringifyUnknownValue(error.suffix)} پر ہونا چاہیے۔`;

/** Formats a MinLengthError in Urdu. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کم از کم ${error.min} لمبی ہونی چاہیے۔`;
/** Formats a MaxLengthError in Urdu. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کی لمبائی ${error.max} سے زیادہ ہے۔`;
/** Formats a LengthError in Urdu. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کی لمبائی بالکل ${error.exact} ہونی چاہیے۔`;
/** Formats a RegexError in Urdu. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} سے مطابقت نہیں رکھتی۔`;
/** Formats a Base64UrlError in Urdu. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Base64Url string نہیں ہے۔`;

/** Formats a Base64Error in Urdu. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Base64 string نہیں ہے۔`;

/** Formats a HexError in Urdu. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} چھوٹے حروف اور ہندسوں کی جفت تعداد والی hexadecimal string نہیں ہے۔`;
/** Formats a NameError in Urdu. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Name نہیں ہے۔`;
/** Formats an EmailError in Urdu. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست ای میل ایڈریس نہیں ہے۔`;

/** Formats a HostnameError in Urdu. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} چھوٹے حروف والا درست hostname نہیں ہے۔`;

/** Formats an Ipv4AddressError in Urdu. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست IPv4 ایڈریس نہیں ہے۔`;

/** Formats an Ipv6AddressError in Urdu. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} canonical IPv6 ایڈریس نہیں ہے۔`;

/** Formats an Ipv6AddressFromStringError in Urdu. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست IPv6 ایڈریس نہیں ہے۔`;

/** Formats a PhoneNumberE164Error in Urdu. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} E.164 فارمیٹ میں فون نمبر نہیں ہے۔`;

/** Formats an IbanError in Urdu. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} بڑے حروف میں اور خالی جگہ کے بغیر درست IBAN نہیں ہے۔`;
/** Formats a MnemonicError in Urdu. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست انگریزی BIP39 mnemonic نہیں ہے۔`;
/** Formats an IdError in Urdu. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Id نہیں ہے۔`;
/** Formats a TableIdError in Urdu. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} جدول ${error.table} کے لیے درست Id نہیں ہے۔`;
/** Formats a UuidError in Urdu. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} چھوٹے حروف والا canonical UUID نہیں ہے۔`;

/** Formats a UuidVersionError in Urdu. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} ورژن ${error.version} کا UUID نہیں ہے۔`;
/** Formats a NonNegativeError in Urdu. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر منفی (>= 0) ہونی چاہیے۔`;
/** Formats a NonNegativeDecimalStringError in Urdu. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر منفی decimal string ہونی چاہیے۔`;
/** Formats a PositiveError in Urdu. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} مثبت (> 0) ہونی چاہیے۔`;
/** Formats a PositiveDecimalStringError in Urdu. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} مثبت decimal string ہونی چاہیے۔`;
/** Formats a NonPositiveError in Urdu. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر مثبت (<= 0) ہونی چاہیے۔`;
/** Formats a NonPositiveDecimalStringError in Urdu. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر مثبت decimal string ہونی چاہیے۔`;
/** Formats a NegativeError in Urdu. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} منفی (< 0) ہونی چاہیے۔`;
/** Formats a NegativeDecimalStringError in Urdu. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} منفی decimal string ہونی چاہیے۔`;
/** Formats an IntError in Urdu. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} safe integer ہونی چاہیے۔`;
/** Formats a GreaterThanError in Urdu. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.min} سے بڑی ہونی چاہیے۔`;
/** Formats a GreaterThanOrEqualToError in Urdu. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.min} سے بڑی یا برابر ہونی چاہیے۔`;
/** Formats a LessThanError in Urdu. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.max} سے چھوٹی ہونی چاہیے۔`;
/** Formats a LessThanOrEqualToError in Urdu. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.max} سے چھوٹی یا برابر ہونی چاہیے۔`;
/** Formats a NonNaNError in Urdu. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "قدر NaN نہیں ہونی چاہیے۔";
/** Formats a FiniteError in Urdu. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} محدود ہونی چاہیے۔`;
/** Formats a MultipleOfError in Urdu. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.divisor} کا مضرب ہونی چاہیے۔`;
/** Formats a BetweenError in Urdu. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.min} اور ${error.max} کے درمیان (دونوں شامل) ہونی چاہیے۔`;

/** Formats a BooleanFromStringError in Urdu. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} بولین نہیں ہے۔ true یا false استعمال کریں۔`;

/** Formats an IntFromStringError in Urdu. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} اعشاری عددِ صحیح نہیں ہے۔`;

/** Formats a FiniteNumberFromStringError in Urdu. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} اعشاری عدد نہیں ہے۔`;

/** Formats an ArrayError in Urdu. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} array نہیں ہے۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} پر array element موجود نہیں ہے۔`;
    case "Accessor":
      return `index ${issue.index} پر array element data property ہونا چاہیے۔`;
    case "ExcessProperty":
      return "اضافی Array property کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "Element":
      return `index ${issue.index} پر array element درست نہیں ہے۔`;
  }
};

/** Formats a NonEmptyArrayError in Urdu. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} میں کم از کم ایک عنصر ہونا چاہیے۔`;

/** Formats a UniqueError in Urdu. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} میں indexes ${error.previousIndex} اور ${error.index} پر برابر عناصر ہیں۔`;
/** Formats a SetError in Urdu. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} Set نہیں ہے۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `اضافی Set property ${safelyStringifyUnknownValue(issue.key)} کی اجازت نہیں ہے۔`;
    case "Element":
      return `index ${issue.index} پر Set element درست نہیں ہے۔`;
  }
};

/** Formats a MapError in Urdu. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} Map نہیں ہے۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `اضافی Map property ${safelyStringifyUnknownValue(issue.key)} کی اجازت نہیں ہے۔`;
    case "Key":
      return `index ${issue.index} پر Map کی key درست نہیں ہے۔`;
    case "Value":
      return `index ${issue.index} پر Map کی قدر درست نہیں ہے۔`;
    case "Collision":
      return `indexes ${issue.previousIndex} اور ${issue.index} پر Map keys decode ہونے کے بعد ایک ہی key ${safelyStringifyUnknownValue(issue.outputKey)} بن جاتی ہیں۔`;
  }
};
/** Formats a TupleError in Urdu. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} tuple نہیں ہے۔`;
  if (error.reason.kind === "InvalidLength")
    return `Tuple کی لمبائی ${error.reason.expected} ہونی چاہیے، لیکن قدر کی لمبائی ${error.reason.actual} ہے۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} پر Tuple element موجود نہیں ہے۔`;
    case "Accessor":
      return `index ${issue.index} پر Tuple element data property ہونا چاہیے۔`;
    case "ExcessProperty":
      return "اضافی Tuple property کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "Element":
      return `index ${issue.index} پر Tuple element درست نہیں ہے۔`;
  }
};
/** Formats a RecordError in Urdu. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} Record نہیں ہے۔`;
  if (error.reason.kind === "NotPlainRecord")
    return "قدر آبجیکٹ ہے، لیکن Record Output سادہ آبجیکٹ ہونا چاہیے یا اس کا prototype null ہونا چاہیے۔";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `property key ${safelyStringifyUnknownValue(issue.key)} درست نہیں ہے۔`;
    case "Value":
      return `property ${safelyStringifyUnknownValue(issue.key)} کی قدر درست نہیں ہے۔`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} data property ہونی چاہیے۔`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable ہونی چاہیے۔`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} اور ${safelyStringifyUnknownValue(issue.key)} decode ہونے کے بعد ایک ہی key ${safelyStringifyUnknownValue(issue.outputKey)} بن جاتی ہیں۔`;
  }
};

/** Formats a MinEntriesError in Urdu. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کے اندراجات کی تعداد کم از کم ${error.min} ہونی چاہیے۔`;

/** Formats a MaxEntriesError in Urdu. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کے اندراجات کی تعداد ${error.max} سے زیادہ ہے۔`;
/** Formats an ObjectError in Urdu. */
export const formatObjectError: TypeErrorFormatter<ObjectError> = (error) => {
  if (error.reason.kind !== "Properties")
    return formatPlainObjectRootError(error.reason);
  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);
  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "Object property data property ہونی چاہیے۔ اس Type کو استعمال کرنے سے پہلے accessor values کو سادہ data میں تبدیل کریں یا مختلف Type استعمال کریں۔";
      case "NonEnumerable":
        return "Object property enumerable ہونی چاہیے۔ اسے enumerable بنائیں یا مختلف Type استعمال کریں۔";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `مطلوبہ property ${safelyStringifyUnknownValue(key)} موجود نہیں ہے۔`;
  if (typeof key === "symbol")
    return "Object property key string ہونی چاہیے۔ symbol property ہٹائیں یا مختلف Type استعمال کریں۔";
  if (propertyError.type === "ObjectExcessProperty")
    return `property ${safelyStringifyUnknownValue(key)} کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔`;
  return `property ${safelyStringifyUnknownValue(key)} درست نہیں ہے۔`;
};
/** Formats a DiscriminatedUnionError in Urdu. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} data property ہونی چاہیے۔`;
      if (error.reason.reason === "Inherited")
        return `${property} اپنی property ہونی چاہیے۔`;
      return `${property} enumerable ہونی چاہیے۔`;
    }
    case "Discriminator":
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} کی قدر ${safelyStringifyUnknownValue(error.reason.value)} غیر متوقع ہے۔`;
    case "Member":
      return `منتخب variant ${safelyStringifyUnknownValue(error.reason.discriminator)} درست نہیں ہے۔`;
  }
};
/** Formats a DataError in Urdu. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `قدر ${safelyStringifyUnknownValue(issue.value)} Data نہیں ہے۔`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} کا prototype غیر متوقع ہے۔`;
    case "Accessor":
      return "Data property data property ہونی چاہیے۔ اس Type کو استعمال کرنے سے پہلے accessor values کو سادہ data میں تبدیل کریں یا مختلف Type استعمال کریں۔";
    case "NonEnumerable":
      return "Data Object property enumerable ہونی چاہیے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "SymbolProperty":
      return "Data Object property key string ہونی چاہیے۔ symbol property ہٹائیں یا مختلف Type استعمال کریں۔";
    case "Hole":
      return "Data Array element موجود نہیں ہے۔";
    case "InvalidUint8Array":
      return "Data Uint8Array کا ArrayBuffer detached نہیں ہونا چاہیے اور Uint8Array کو اس کی حدود کے اندر ہونا چاہیے۔";
    case "ExcessProperty":
      return `Data ${issue.container} کی اپنی اضافی properties نہیں ہونی چاہئیں۔ property ہٹائیں یا مختلف Type استعمال کریں۔`;
  }
};
/** Formats a JsonValueError in Urdu. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `قدر ${safelyStringifyUnknownValue(issue.value)} JSON value نہیں ہے۔`;
    case "NonFiniteNumber":
      return "JSON number محدود ہونا چاہیے۔";
    case "UnexpectedPrototype":
      return "قدر آبجیکٹ ہے، لیکن JsonValue آبجیکٹ سادہ آبجیکٹ ہونا چاہیے یا اس کا prototype null ہونا چاہیے۔";
    case "Accessor":
      return "JSON property data property ہونی چاہیے۔ اس Type کو استعمال کرنے سے پہلے accessor values کو سادہ data میں تبدیل کریں یا مختلف Type استعمال کریں۔";
    case "NonEnumerable":
      return "JSON آبجیکٹ کی property enumerable ہونی چاہیے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "SymbolProperty":
      return "JSON آبجیکٹ کی property key string ہونی چاہیے۔ symbol property ہٹائیں یا مختلف Type استعمال کریں۔";
    case "Hole":
      return "JSON array element موجود نہیں ہے۔";
    case "ExcessProperty":
      return "اضافی JSON array property کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "CircularReference":
      return "JsonValue میں circular references نہیں ہونے چاہئیں۔";
  }
};
/** Formats a JsonError in Urdu. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کو JsonValue میں parse نہیں کیا جا سکتا۔`;

/** Formats a ByteSizeLiteralError in Urdu. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} بائٹ کے حجم کا لٹرل نہیں ہے۔ "512KiB" یا "1MiB" جیسی قدر استعمال کریں۔`;

/** Formats a ByteLengthError in Urdu. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "قدر -0 بائٹس میں لمبائی نہیں ہے۔ اس کے بجائے 0 استعمال کریں۔";

/** Formats a ByteLengthFromStringError in Urdu. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} بائٹس میں لمبائی نہیں ہے۔ بائٹس کی تعداد یا 10MiB جیسا لٹرل استعمال کریں۔`;

/** Formats a DurationLiteralError in Urdu. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} دورانیے کا لٹرل نہیں ہے۔ "500ms" یا "1.5s" جیسی قدر استعمال کریں۔`;

/** Formats a PercentageLiteralError in Urdu. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} فیصد کا لٹرل نہیں ہے۔ "50%" یا "12.5%" جیسی قدر استعمال کریں۔`;
