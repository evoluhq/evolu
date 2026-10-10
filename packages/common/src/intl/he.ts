/**
 * Hebrew Evolu Type error formatters.
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
  RegexError,
  SetError,
  SimplePasswordError,
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
): string => {
  const typeOf = error.expected.toLowerCase();

  return `הערך ${safelyStringifyUnknownValue(error.value)} אינו מסוג ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `הערך ${safelyStringifyUnknownValue(reason.value)} אינו אובייקט.`
    : "הערך הוא אובייקט, אך פלט של Object חייב להיות אובייקט פשוט או בעל אב־טיפוס null.";

/** Formats a NeverError in Hebrew. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו חוקי עבור הטיפוס Never.`;

/** Formats a String TypeOfError in Hebrew. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Hebrew. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו תואם ל-template literal.`;

/** Formats a Number TypeOfError in Hebrew. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Hebrew. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Hebrew. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Hebrew. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו ערך בוליאני. יש להשתמש ב-true או ב-false.`;

/** Formats a Symbol TypeOfError in Hebrew. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Hebrew. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Hebrew. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `הערך ${safelyStringifyUnknownValue(error.value)} אינו Evolu Type.`;

/** Formats an ObjectTagError in Hebrew. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `לערך ${safelyStringifyUnknownValue(error.value)} אין את תג האובייקט הצפוי ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Hebrew. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "ה-Date אינו חוקי.";

/** Formats an InstanceOfError in Hebrew. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מופע של ${error.constructorName}.`;

/** Formats a LiteralError in Hebrew. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו שווה באופן מחמיר לליטרל הצפוי: ${String(error.expected)}.`;

/** Formats a UnionError in Hebrew. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "הערך אינו תואם לאף וריאנט מותר.";

/** Formats a DateIsoError in Hebrew. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת תאריך ושעה קנונית בתקן ISO.`;

/** Formats a PlainDateIsoError in Hebrew. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו תאריך קלנדרי חוקי בתבנית YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Hebrew. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "לא ניתן לייצג את ה-Date כ-DateIso.";

/** Formats a DateIsoFromRfc3339Error in Hebrew. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו תאריך ושעה נתמכים בתקן RFC 3339. יש להשתמש בערך כגון "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Hebrew. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית קנונית.`;

/** Formats an Int64Error in Hebrew. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר שלם חוקי עם סימן ברוחב 64 סיביות (Int64).`;

/** Formats a UInt64Error in Hebrew. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר שלם חוקי ללא סימן ברוחב 64 סיביות (UInt64).`;

/** Formats an Int64StringError in Hebrew. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת Int64 חוקית.`;

/** Formats an IdentifierError in Hebrew. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מזהה בתבנית ${error.casing}.`;

/** Formats a CapitalizedError in Hebrew. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) => `הערך ${safelyStringifyUnknownValue(error.value)} חייב להתחיל באות גדולה.`;

/** Formats an UncapitalizedError in Hebrew. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} לא יכול להתחיל באות גדולה.`;

/** Formats an UppercasedError in Hebrew. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות באותיות גדולות.`;

/** Formats a LowercasedError in Hebrew. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות באותיות קטנות.`;

/** Formats a TrimmedError in Hebrew. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `יש להסיר רווחים מיותרים מתחילת הערך ${safelyStringifyUnknownValue(error.value)} ומסופו.`;

/** Formats a WellFormedError in Hebrew. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות טקסט Unicode בנוי היטב.`;

/** Formats a NormalizedError in Hebrew. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות בצורת נרמול Unicode ${error.form}.`;

/** Formats a StartsWithError in Hebrew. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להתחיל ב־${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Hebrew. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להסתיים ב־${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Hebrew. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להכיל את ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Hebrew. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} לא יכול להכיל את ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Hebrew. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו עומד באורך המינימלי של ${error.min}.`;

/** Formats a MaxLengthError in Hebrew. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חורג מהאורך המרבי של ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Hebrew. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חורג מהאורך המרבי בבתים בקידוד UTF-8, שהוא ${error.max}.`;

/** Formats a LengthError in Hebrew. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `האורך של הערך ${safelyStringifyUnknownValue(error.value)} אינו האורך הנדרש, ${error.exact}.`;

/** Formats a RegexError in Hebrew. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו תואם ל-/${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Hebrew. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת Base64Url חוקית.`;

/** Formats a Base64Error in Hebrew. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת Base64 חוקית.`;

/** Formats a HexError in Hebrew. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת הקסדצימלית באותיות קטנות עם מספר זוגי של ספרות.`;

/** Formats a HexColorError in Hebrew. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו צבע בתבנית #rrggbb באותיות קטנות.`;

/** Formats a NameError in Hebrew. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו Name חוקי.`;

/** Formats an EmailError in Hebrew. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו כתובת אימייל חוקית.`;

/** Formats a HostnameError in Hebrew. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו שם מארח חוקי באותיות קטנות.`;

/** Formats an Ipv4AddressError in Hebrew. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) => `הערך ${safelyStringifyUnknownValue(error.value)} אינו כתובת IPv4 חוקית.`;

/** Formats an Ipv6AddressError in Hebrew. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) => `הערך ${safelyStringifyUnknownValue(error.value)} אינו כתובת IPv6 קנונית.`;

/** Formats an Ipv6AddressFromStringError in Hebrew. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו כתובת IPv6 חוקית.`;

/** Formats an IpAddressError in Hebrew. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו כתובת IPv4 חוקית או כתובת IPv6 קנונית.`;

/** Formats an IpAddressFromStringError in Hebrew. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו כתובת IP חוקית.`;

/** Formats a PhoneNumberE164Error in Hebrew. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר טלפון בתבנית E.164.`;

/** Formats an IbanError in Hebrew. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר IBAN חוקי באותיות גדולות וללא רווחים.`;

/** Formats an IsbnError in Hebrew. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר ISBN חוקי בן 13 ספרות ללא מקפים.`;

/** Formats a SimplePasswordError in Hebrew. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "יש להסיר רווחים מיותרים מתחילת הסיסמה ומסופה.";
    case "TooLong":
      return "הסיסמה חורגת מהאורך המרבי של 64.";
    case "TooShort":
      return "הסיסמה אינה עומדת באורך המינימלי של 8.";
  }
};

/** Formats a MnemonicError in Hebrew. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "הערך אינו מנמוניקת BIP39 חוקית באנגלית.";

/** Formats an IdError in Hebrew. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו Id חוקי.`;

/** Formats a TableIdError in Hebrew. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו Id חוקי עבור הטבלה ${error.table}.`;

/** Formats a UuidError in Hebrew. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו UUID קנוני באותיות קטנות.`;

/** Formats a UuidVersionError in Hebrew. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו UUID מגרסה ${error.version}.`;

/** Formats a UlidError in Hebrew. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו ULID קנוני באותיות גדולות.`;

/** Formats a NonNegativeError in Hebrew. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות אי-שלילי (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Hebrew. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית אי-שלילית.`;

/** Formats a PositiveError in Hebrew. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות חיובי (> 0).`;

/** Formats a PositiveDecimalStringError in Hebrew. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית חיובית.`;

/** Formats a NonPositiveError in Hebrew. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות אי-חיובי (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Hebrew. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית אי-חיובית.`;

/** Formats a NegativeError in Hebrew. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות שלילי (< 0).`;

/** Formats a NegativeDecimalStringError in Hebrew. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית שלילית.`;

/** Formats an IntError in Hebrew. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מספר שלם בטוח.`;

/** Formats an IntFromStringError in Hebrew. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר שלם עשרוני.`;

/** Formats a FiniteNumberFromStringError in Hebrew. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר עשרוני.`;

/** Formats a GreaterThanError in Hebrew. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות גדול מ-${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Hebrew. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות גדול מ-${error.min} או שווה לו.`;

/** Formats a LessThanError in Hebrew. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות קטן מ-${error.max}.`;

/** Formats a LessThanOrEqualToError in Hebrew. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות קטן מ-${error.max} או שווה לו.`;

/** Formats a NonNaNError in Hebrew. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "הערך אינו יכול להיות NaN.";

/** Formats a FiniteError in Hebrew. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות סופי.`;

/** Formats a MultipleOfError in Hebrew. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות כפולה של ${error.divisor}.`;

/** Formats a BetweenError in Hebrew. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות בין ${error.min} ל-${error.max}, כולל הגבולות.`;

/** Formats a GreaterThanBigIntError in Hebrew. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות גדול מ-${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Hebrew. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות גדול מ-${error.min} או שווה לו.`;

/** Formats a LessThanBigIntError in Hebrew. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות קטן מ-${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Hebrew. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות קטן מ-${error.max} או שווה לו.`;

/** Formats a BetweenBigIntError in Hebrew. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות בין ${error.min} ל-${error.max}, כולל הגבולות.`;

/** Formats an ArrayError in Hebrew. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו מערך.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `חסר איבר במערך באינדקס ${issue.index}.`;
    case "Accessor":
      return `איבר המערך באינדקס ${issue.index} חייב להיות מאפיין נתונים.`;
    case "ExcessProperty":
      return "מאפיין עודף של Array אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "Element":
      return `איבר המערך באינדקס ${issue.index} אינו חוקי.`;
  }
};

/** Formats a NonEmptyArrayError in Hebrew. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להכיל לפחות פריט אחד.`;

/** Formats a UniqueError in Hebrew. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `לערך ${safelyStringifyUnknownValue(error.value)} יש פריטים שווים באינדקסים ${error.previousIndex} ו-${error.index}.`;

/** Formats a SetError in Hebrew. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `מאפיין Set העודף ${safelyStringifyUnknownValue(issue.key)} אינו מותר.`;
    case "Element":
      return `איבר Set באינדקס ${issue.index} אינו חוקי.`;
  }
};

/** Formats a MapError in Hebrew. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `מאפיין Map העודף ${safelyStringifyUnknownValue(issue.key)} אינו מותר.`;
    case "Key":
      return `מפתח Map באינדקס ${issue.index} אינו חוקי.`;
    case "Value":
      return `ערך Map באינדקס ${issue.index} אינו חוקי.`;
    case "Collision":
      return `מפתחות Map באינדקסים ${issue.previousIndex} ו-${issue.index} מפוענחים לאותו מפתח ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Hebrew. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `הגודל ${error.value.size} אינו עומד בגודל המינימלי של ${error.min}.`;

/** Formats a MaxSizeError in Hebrew. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `הגודל ${error.value.size} חורג מהגודל המרבי של ${error.max}.`;

/** Formats a TupleError in Hebrew. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `האורך של Tuple חייב להיות ${error.reason.expected}, אך האורך של הערך הוא ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `חסר איבר Tuple באינדקס ${issue.index}.`;
    case "Accessor":
      return `איבר Tuple באינדקס ${issue.index} חייב להיות מאפיין נתונים.`;
    case "ExcessProperty":
      return "מאפיין עודף של Tuple אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "Element":
      return `איבר Tuple באינדקס ${issue.index} אינו חוקי.`;
  }
};

/** Formats a RecordError in Hebrew. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "הערך הוא אובייקט, אך פלט של Record חייב להיות אובייקט פשוט או בעל אב־טיפוס null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `מפתח המאפיין ${safelyStringifyUnknownValue(issue.key)} אינו חוקי.`;
    case "Value":
      return `הערך של המאפיין ${safelyStringifyUnknownValue(issue.key)} אינו חוקי.`;
    case "Accessor":
      return `המאפיין ${safelyStringifyUnknownValue(issue.key)} של Record חייב להיות מאפיין נתונים.`;
    case "NonEnumerable":
      return `המאפיין ${safelyStringifyUnknownValue(issue.key)} של Record חייב להיות enumerable.`;
    case "Collision":
      return `המפתחות ${safelyStringifyUnknownValue(issue.previousKey)} ו-${safelyStringifyUnknownValue(issue.key)} של Record מפוענחים לאותו מפתח ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Hebrew. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו עומד במספר הרשומות המינימלי של ${error.min}.`;

/** Formats a MaxEntriesError in Hebrew. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חורג ממספר הרשומות המרבי של ${error.max}.`;

/** Formats an ObjectError in Hebrew. */
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
        return "מאפיין של Object חייב להיות מאפיין נתונים. יש להמיר ערכי accessor לנתונים פשוטים לפני השימוש ב-Type זה, או להשתמש ב-Type אחר.";
      case "NonEnumerable":
        return "מאפיין של Object חייב להיות enumerable. יש להפוך אותו ל-enumerable או להשתמש ב-Type אחר.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `המאפיין הנדרש ${safelyStringifyUnknownValue(key)} חסר.`;
  }
  if (typeof key === "symbol") {
    return "מפתח מאפיין של Object חייב להיות מחרוזת. יש להסיר את מאפיין ה-symbol או להשתמש ב-Type אחר.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `המאפיין ${safelyStringifyUnknownValue(key)} אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.`;
  }
  return `המאפיין ${safelyStringifyUnknownValue(key)} אינו חוקי.`;
};

/** Formats a DiscriminatedUnionError in Hebrew. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `מאפיין ה-discriminator ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} חייב להיות מאפיין נתונים.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} חייב להיות מאפיין עצמי.`;
      }
      return `${property} חייב להיות enumerable.`;
    }
    case "Discriminator":
      return `למאפיין ה-discriminator ${safelyStringifyUnknownValue(error.reason.key)} יש ערך בלתי צפוי ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `הווריאנט שנבחר ${safelyStringifyUnknownValue(error.reason.discriminator)} אינו חוקי.`;
  }
};

/** Formats a DataError in Hebrew. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `הערך ${safelyStringifyUnknownValue(issue.value)} אינו Data.`;
    case "UnexpectedPrototype":
      return `ל-${issue.container} ב-Data יש אב־טיפוס בלתי צפוי.`;
    case "Accessor":
      return "מאפיין Data חייב להיות מאפיין נתונים. יש להמיר ערכי accessor לנתונים פשוטים לפני השימוש ב-Type זה, או להשתמש ב-Type אחר.";
    case "NonEnumerable":
      return "מאפיין של Object ב-Data חייב להיות enumerable. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "SymbolProperty":
      return "מפתח מאפיין של Object ב-Data חייב להיות מחרוזת. יש להסיר את מאפיין ה-symbol או להשתמש ב-Type אחר.";
    case "Hole":
      return "חסר איבר של Array ב-Data.";
    case "InvalidUint8Array":
      return "Uint8Array ב-Data חייב להתבסס על ArrayBuffer שאינו מנותק ולהימצא בתוך גבולותיו.";
    case "ExcessProperty":
      return `${issue.container} ב-Data אינו יכול להכיל מאפיינים עצמיים עודפים. יש להסיר את המאפיין או להשתמש ב-Type אחר.`;
  }
};

/** Formats a JsonValueError in Hebrew. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `הערך ${safelyStringifyUnknownValue(issue.value)} אינו ערך JSON.`;
    case "NonFiniteNumber":
      return "מספר JSON חייב להיות סופי.";
    case "UnexpectedPrototype":
      return "הערך הוא אובייקט, אך אובייקט JsonValue חייב להיות אובייקט פשוט או בעל אב־טיפוס null.";
    case "Accessor":
      return "מאפיין JSON חייב להיות מאפיין נתונים. יש להמיר ערכי accessor לנתונים פשוטים לפני השימוש ב-Type זה, או להשתמש ב-Type אחר.";
    case "NonEnumerable":
      return "מאפיין של אובייקט JSON חייב להיות enumerable. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "SymbolProperty":
      return "מפתח מאפיין של אובייקט JSON חייב להיות מחרוזת. יש להסיר את מאפיין ה-symbol או להשתמש ב-Type אחר.";
    case "Hole":
      return "חסר איבר במערך JSON.";
    case "ExcessProperty":
      return "מאפיין עודף של מערך JSON אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "CircularReference":
      return "JsonValue אינו יכול להכיל הפניות מעגליות.";
  }
};

/** Formats a JsonError in Hebrew. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `לא ניתן לנתח את הערך ${safelyStringifyUnknownValue(error.value)} ל-JsonValue.`;

/** Formats a ByteSizeLiteralError in Hebrew. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו ליטרל של גודל בבתים. יש להשתמש בערך כגון "512KiB" או "1MiB".`;

/** Formats a ByteLengthError in Hebrew. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "הערך -0 אינו אורך בבתים. יש להשתמש ב-0 במקומו.";

/** Formats a ByteLengthFromStringError in Hebrew. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו אורך בבתים. יש להשתמש במספר בתים או בליטרל כגון 10MiB.`;

/** Formats a DurationLiteralError in Hebrew. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו ליטרל של משך זמן. יש להשתמש בערך כגון "500ms" או "1.5s".`;

/** Formats a PercentageLiteralError in Hebrew. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו ליטרל של אחוזים. יש להשתמש בערך כגון "50%" או "12.5%".`;
