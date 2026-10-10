/**
 * Hindi Evolu Type error formatters.
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

  return `मान ${safelyStringifyUnknownValue(error.value)} ${typeOf} नहीं है।`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `मान ${safelyStringifyUnknownValue(reason.value)} object नहीं है।`
    : "मान एक object है, लेकिन Object Output को plain object होना चाहिए या उसका prototype null होना चाहिए।";

/** Formats a NeverError in Hindi. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} Never प्रकार के लिए मान्य नहीं है।`;

/** Formats a String TypeOfError in Hindi. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Hindi. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} template literal से मेल नहीं खाता।`;

/** Formats a Number TypeOfError in Hindi. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Hindi. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Hindi. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Hindi. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} boolean नहीं है। true या false का उपयोग करें।`;

/** Formats a Symbol TypeOfError in Hindi. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Hindi. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Hindi. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `मान ${safelyStringifyUnknownValue(error.value)} Evolu Type नहीं है।`;

/** Formats an ObjectTagError in Hindi. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में अपेक्षित object tag ${safelyStringifyUnknownValue(error.expected)} नहीं है।`;

/** Formats a ValidDateError in Hindi. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date अमान्य है।";

/** Formats an InstanceOfError in Hindi. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.constructorName} का instance नहीं है।`;

/** Formats a LiteralError in Hindi. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} अपेक्षित literal के strictly बराबर नहीं है: ${String(error.expected)}।`;

/** Formats a UnionError in Hindi. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "मान किसी भी अनुमत variant से मेल नहीं खाता।";

/** Formats a DateIsoError in Hindi. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string नहीं है।`;

/** Formats a PlainDateIsoError in Hindi. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} YYYY-MM-DD प्रारूप में मान्य कैलेंडर तिथि नहीं है।`;

/** Formats a DateIsoFromDateError in Hindi. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date को DateIso के रूप में दर्शाया नहीं जा सकता।";

/** Formats a DateIsoFromRfc3339Error in Hindi. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} समर्थित RFC 3339 date-time नहीं है। "2024-01-01T12:00:00Z" जैसे मान का उपयोग करें।`;

/** Formats a DecimalStringError in Hindi. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} canonical decimal string होना चाहिए।`;

/** Formats an Int64Error in Hindi. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य signed 64-bit integer (Int64) नहीं है।`;

/** Formats a UInt64Error in Hindi. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य unsigned 64-bit integer (UInt64) नहीं है।`;

/** Formats an Int64StringError in Hindi. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Int64 string नहीं है।`;

/** Formats an IdentifierError in Hindi. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.casing} पहचानकर्ता नहीं है।`;

/** Formats a CapitalizedError in Hindi. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} का पहला अक्षर बड़ा होना चाहिए।`;

/** Formats an UncapitalizedError in Hindi. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} बड़े अक्षर से शुरू नहीं होना चाहिए।`;

/** Formats an UppercasedError in Hindi. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} बड़े अक्षरों में होना चाहिए।`;

/** Formats a LowercasedError in Hindi. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} छोटे अक्षरों में होना चाहिए।`;

/** Formats a TrimmedError in Hindi. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} के आरंभ और अंत से whitespace हटाया हुआ होना चाहिए।`;

/** Formats a WellFormedError in Hindi. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} well-formed Unicode टेक्स्ट होना चाहिए।`;

/** Formats a NormalizedError in Hindi. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} Unicode सामान्यीकरण रूप ${error.form} में होना चाहिए।`;

/** Formats a StartsWithError in Hindi. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की शुरुआत ${safelyStringifyUnknownValue(error.prefix)} से होनी चाहिए।`;

/** Formats an EndsWithError in Hindi. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} का अंत ${safelyStringifyUnknownValue(error.suffix)} से होना चाहिए।`;

/** Formats an IncludesError in Hindi. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में ${safelyStringifyUnknownValue(error.substring)} शामिल होना चाहिए।`;

/** Formats an ExcludesError in Hindi. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में ${safelyStringifyUnknownValue(error.substring)} शामिल नहीं होना चाहिए।`;

/** Formats a MinLengthError in Hindi. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की लंबाई न्यूनतम ${error.min} होनी चाहिए।`;

/** Formats a MaxLengthError in Hindi. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की लंबाई अधिकतम ${error.max} हो सकती है।`;

/** Formats a MaxUtf8ByteLengthError in Hindi. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की UTF-8 बाइट लंबाई अधिकतम ${error.max} हो सकती है।`;

/** Formats a LengthError in Hindi. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की लंबाई ठीक ${error.exact} होनी चाहिए।`;

/** Formats a RegexError in Hindi. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} से मेल नहीं खाता।`;

/** Formats a Base64UrlError in Hindi. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Base64Url string नहीं है।`;

/** Formats a Base64Error in Hindi. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Base64 string नहीं है।`;

/** Formats a HexError in Hindi. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} छोटे अक्षरों और सम संख्या में अंकों वाली hexadecimal string नहीं है।`;

/** Formats a HexColorError in Hindi. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} छोटे अक्षरों में #rrggbb प्रारूप वाला रंग नहीं है।`;

/** Formats a NameError in Hindi. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Name नहीं है।`;

/** Formats an EmailError in Hindi. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य ईमेल पता नहीं है।`;

/** Formats a HostnameError in Hindi. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} छोटे अक्षरों वाला मान्य होस्टनाम नहीं है।`;

/** Formats an Ipv4AddressError in Hindi. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) => `मान ${safelyStringifyUnknownValue(error.value)} मान्य IPv4 पता नहीं है।`;

/** Formats an Ipv6AddressError in Hindi. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} canonical IPv6 पता नहीं है।`;

/** Formats an Ipv6AddressFromStringError in Hindi. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य IPv6 पता नहीं है।`;

/** Formats an IpAddressError in Hindi. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य IPv4 पता या canonical IPv6 पता नहीं है।`;

/** Formats an IpAddressFromStringError in Hindi. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य IP पता नहीं है।`;

/** Formats a PhoneNumberE164Error in Hindi. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} E.164 प्रारूप में फ़ोन नंबर नहीं है।`;

/** Formats an IbanError in Hindi. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} बड़े अक्षरों में और बिना रिक्त स्थान के मान्य IBAN नहीं है।`;

/** Formats an IsbnError in Hindi. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} हाइफ़न के बिना 13 अंकों वाला मान्य ISBN नहीं है।`;

/** Formats a SimplePasswordError in Hindi. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "पासवर्ड के आरंभ और अंत से whitespace हटाया हुआ होना चाहिए।";
    case "TooLong":
      return "पासवर्ड की लंबाई अधिकतम 64 हो सकती है।";
    case "TooShort":
      return "पासवर्ड की लंबाई न्यूनतम 8 होनी चाहिए।";
  }
};

/** Formats a MnemonicError in Hindi. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "मान मान्य अंग्रेज़ी BIP39 mnemonic नहीं है।";

/** Formats an IdError in Hindi. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Id नहीं है।`;

/** Formats a TableIdError in Hindi. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} table ${error.table} के लिए मान्य Id नहीं है।`;

/** Formats a UuidError in Hindi. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} छोटे अक्षरों वाला canonical UUID नहीं है।`;

/** Formats a UuidVersionError in Hindi. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} संस्करण ${error.version} का UUID नहीं है।`;

/** Formats a UlidError in Hindi. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} बड़े अक्षरों वाला canonical ULID नहीं है।`;

/** Formats a NonNegativeError in Hindi. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ऋणात्मक नहीं होना चाहिए (>= 0)।`;

/** Formats a NonNegativeDecimalStringError in Hindi. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} decimal string होना चाहिए और ऋणात्मक नहीं होना चाहिए।`;

/** Formats a PositiveError in Hindi. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} धनात्मक होना चाहिए (> 0)।`;

/** Formats a PositiveDecimalStringError in Hindi. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} धनात्मक decimal string होना चाहिए।`;

/** Formats a NonPositiveError in Hindi. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} धनात्मक नहीं होना चाहिए (<= 0)।`;

/** Formats a NonPositiveDecimalStringError in Hindi. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} decimal string होना चाहिए और धनात्मक नहीं होना चाहिए।`;

/** Formats a NegativeError in Hindi. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ऋणात्मक होना चाहिए (< 0)।`;

/** Formats a NegativeDecimalStringError in Hindi. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ऋणात्मक decimal string होना चाहिए।`;

/** Formats an IntError in Hindi. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} safe integer होना चाहिए।`;

/** Formats an IntFromStringError in Hindi. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} दशमलव पूर्णांक नहीं है।`;

/** Formats a FiniteNumberFromStringError in Hindi. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} दशमलव संख्या नहीं है।`;

/** Formats a GreaterThanError in Hindi. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.min} से बड़ा होना चाहिए।`;

/** Formats a GreaterThanOrEqualToError in Hindi. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.min} से बड़ा या उसके बराबर होना चाहिए।`;

/** Formats a LessThanError in Hindi. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.max} से छोटा होना चाहिए।`;

/** Formats a LessThanOrEqualToError in Hindi. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.max} से छोटा या उसके बराबर होना चाहिए।`;

/** Formats a NonNaNError in Hindi. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "मान NaN नहीं होना चाहिए।";

/** Formats a FiniteError in Hindi. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} परिमित होना चाहिए।`;

/** Formats a MultipleOfError in Hindi. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.divisor} का गुणज होना चाहिए।`;

/** Formats a BetweenError in Hindi. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.min} और ${error.max} के बीच, दोनों सीमाओं सहित, होना चाहिए।`;

/** Formats a GreaterThanBigIntError in Hindi. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.min} से बड़ा होना चाहिए।`;

/** Formats a GreaterThanOrEqualToBigIntError in Hindi. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.min} से बड़ा या उसके बराबर होना चाहिए।`;

/** Formats a LessThanBigIntError in Hindi. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.max} से छोटा होना चाहिए।`;

/** Formats a LessThanOrEqualToBigIntError in Hindi. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.max} से छोटा या उसके बराबर होना चाहिए।`;

/** Formats a BetweenBigIntError in Hindi. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को ${error.min} और ${error.max} के बीच, दोनों सीमाओं सहित, होना चाहिए।`;

/** Formats an ArrayError in Hindi. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} array नहीं है।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} पर array element मौजूद नहीं है।`;
    case "Accessor":
      return `index ${issue.index} पर array element data property होना चाहिए।`;
    case "ExcessProperty":
      return "अतिरिक्त Array property की अनुमति नहीं है। उसे हटाएँ या किसी अलग Type का उपयोग करें।";
    case "Element":
      return `index ${issue.index} पर array element अमान्य है।`;
  }
};

/** Formats a NonEmptyArrayError in Hindi. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में कम से कम एक आइटम होना चाहिए।`;

/** Formats a UniqueError in Hindi. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में index ${error.previousIndex} और ${error.index} पर समान आइटम हैं।`;

/** Formats a SetError in Hindi. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} Set नहीं है।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `अतिरिक्त Set property ${safelyStringifyUnknownValue(issue.key)} की अनुमति नहीं है।`;
    case "Element":
      return `index ${issue.index} पर Set element अमान्य है।`;
  }
};

/** Formats a MapError in Hindi. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} Map नहीं है।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `अतिरिक्त Map property ${safelyStringifyUnknownValue(issue.key)} की अनुमति नहीं है।`;
    case "Key":
      return `index ${issue.index} पर Map की key अमान्य है।`;
    case "Value":
      return `index ${issue.index} पर Map का मान अमान्य है।`;
    case "Collision":
      return `index ${issue.previousIndex} और ${issue.index} पर मौजूद Map keys decode होकर एक ही key ${safelyStringifyUnknownValue(issue.outputKey)} बनती हैं।`;
  }
};

/** Formats a MinSizeError in Hindi. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `आकार ${error.value.size} है, लेकिन यह न्यूनतम ${error.min} होना चाहिए।`;

/** Formats a MaxSizeError in Hindi. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `आकार ${error.value.size} है, लेकिन यह अधिकतम ${error.max} हो सकता है।`;

/** Formats a TupleError in Hindi. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} tuple नहीं है।`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple की लंबाई ${error.reason.expected} होनी चाहिए, लेकिन मान की लंबाई ${error.reason.actual} है।`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} पर Tuple element मौजूद नहीं है।`;
    case "Accessor":
      return `index ${issue.index} पर Tuple element data property होना चाहिए।`;
    case "ExcessProperty":
      return "अतिरिक्त Tuple property की अनुमति नहीं है। उसे हटाएँ या किसी अलग Type का उपयोग करें।";
    case "Element":
      return `index ${issue.index} पर Tuple element अमान्य है।`;
  }
};

/** Formats a RecordError in Hindi. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} Record नहीं है।`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "मान एक object है, लेकिन Record Output को plain object होना चाहिए या उसका prototype null होना चाहिए।";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} अमान्य है।`;
    case "Value":
      return `Property ${safelyStringifyUnknownValue(issue.key)} का मान अमान्य है।`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} data property होनी चाहिए।`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable होनी चाहिए।`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} और ${safelyStringifyUnknownValue(issue.key)} decode होकर एक ही key ${safelyStringifyUnknownValue(issue.outputKey)} बनती हैं।`;
  }
};

/** Formats a MinEntriesError in Hindi. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में प्रविष्टियों की संख्या न्यूनतम ${error.min} होनी चाहिए।`;

/** Formats a MaxEntriesError in Hindi. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में प्रविष्टियों की संख्या अधिकतम ${error.max} हो सकती है।`;

/** Formats an ObjectError in Hindi. */
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
        return "Object property data property होनी चाहिए। इस Type का उपयोग करने से पहले accessor values को plain data में materialize करें या किसी अलग Type का उपयोग करें।";
      case "NonEnumerable":
        return "Object property enumerable होनी चाहिए। उसे enumerable बनाएँ या किसी अलग Type का उपयोग करें।";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `आवश्यक property ${safelyStringifyUnknownValue(key)} मौजूद नहीं है।`;
  }
  if (typeof key === "symbol") {
    return "Object property key string होनी चाहिए। symbol property हटाएँ या किसी अलग Type का उपयोग करें।";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Property ${safelyStringifyUnknownValue(key)} की अनुमति नहीं है। उसे हटाएँ या किसी अलग Type का उपयोग करें।`;
  }
  return `Property ${safelyStringifyUnknownValue(key)} अमान्य है।`;
};

/** Formats a DiscriminatedUnionError in Hindi. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} data property होनी चाहिए।`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} own property होनी चाहिए।`;
      }
      return `${property} enumerable होनी चाहिए।`;
    }
    case "Discriminator":
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)} का मान ${safelyStringifyUnknownValue(error.reason.value)} अपेक्षित नहीं है।`;
    case "Member":
      return `चुना गया variant ${safelyStringifyUnknownValue(error.reason.discriminator)} अमान्य है।`;
  }
};

/** Formats a DataError in Hindi. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `मान ${safelyStringifyUnknownValue(issue.value)} Data नहीं है।`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} का prototype अपेक्षित नहीं है।`;
    case "Accessor":
      return "Data property data property होनी चाहिए। इस Type का उपयोग करने से पहले accessor values को plain data में materialize करें या किसी अलग Type का उपयोग करें।";
    case "NonEnumerable":
      return "Data Object property enumerable होनी चाहिए। उसे हटाएँ या किसी अलग Type का उपयोग करें।";
    case "SymbolProperty":
      return "Data Object property key string होनी चाहिए। symbol property हटाएँ या किसी अलग Type का उपयोग करें।";
    case "Hole":
      return "Data Array element मौजूद नहीं है।";
    case "InvalidUint8Array":
      return "Data Uint8Array का ArrayBuffer detached नहीं होना चाहिए, और Uint8Array उस ArrayBuffer की सीमाओं के भीतर होना चाहिए।";
    case "ExcessProperty":
      return `Data ${issue.container} में अतिरिक्त own properties नहीं होनी चाहिए। उस property को हटाएँ या किसी अलग Type का उपयोग करें।`;
  }
};

/** Formats a JsonValueError in Hindi. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `मान ${safelyStringifyUnknownValue(issue.value)} JSON value नहीं है।`;
    case "NonFiniteNumber":
      return "JSON number परिमित होना चाहिए।";
    case "UnexpectedPrototype":
      return "मान एक object है, लेकिन JsonValue object को plain object होना चाहिए या उसका prototype null होना चाहिए।";
    case "Accessor":
      return "JSON property data property होनी चाहिए। इस Type का उपयोग करने से पहले accessor values को plain data में materialize करें या किसी अलग Type का उपयोग करें।";
    case "NonEnumerable":
      return "JSON object property enumerable होनी चाहिए। उसे हटाएँ या किसी अलग Type का उपयोग करें।";
    case "SymbolProperty":
      return "JSON object property key string होनी चाहिए। symbol property हटाएँ या किसी अलग Type का उपयोग करें।";
    case "Hole":
      return "JSON array element मौजूद नहीं है।";
    case "ExcessProperty":
      return "अतिरिक्त JSON array property की अनुमति नहीं है। उसे हटाएँ या किसी अलग Type का उपयोग करें।";
    case "CircularReference":
      return "JsonValue में circular references नहीं होने चाहिए।";
  }
};

/** Formats a JsonError in Hindi. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को JsonValue में parse नहीं किया जा सकता।`;

/** Formats a ByteSizeLiteralError in Hindi. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} बाइट आकार का literal नहीं है। "512KiB" या "1MiB" जैसे मान का उपयोग करें।`;

/** Formats a ByteLengthError in Hindi. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "मान -0 बाइट लंबाई नहीं है। इसके बजाय 0 का उपयोग करें।";

/** Formats a ByteLengthFromStringError in Hindi. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} बाइट लंबाई नहीं है। बाइटों की संख्या या 10MiB जैसे literal का उपयोग करें।`;

/** Formats a DurationLiteralError in Hindi. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} अवधि का literal नहीं है। "500ms" या "1.5s" जैसे मान का उपयोग करें।`;

/** Formats a PercentageLiteralError in Hindi. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} प्रतिशत का literal नहीं है। "50%" या "12.5%" जैसे मान का उपयोग करें।`;
