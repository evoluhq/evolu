/**
 * Tamil Evolu Type error formatters.
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

  return `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு ${typeOf} அல்ல.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `மதிப்பு ${safelyStringifyUnknownValue(reason.value)} ஒரு object அல்ல.`
    : "மதிப்பு ஒரு object ஆக உள்ளது, ஆனால் Object Output ஒரு plain object ஆகவோ null prototype உடையதாகவோ இருக்க வேண்டும்.";

/** Formats a NeverError in Tamil. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} Never type-க்கு செல்லுபடியாகாது.`;

/** Formats a String TypeOfError in Tamil. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Tamil. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} template literal-உடன் பொருந்தவில்லை.`;

/** Formats a Number TypeOfError in Tamil. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Tamil. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Tamil. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Tamil. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} boolean அல்ல. true அல்லது false ஐப் பயன்படுத்தவும்.`;

/** Formats a Symbol TypeOfError in Tamil. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Tamil. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Tamil. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு Evolu Type அல்ல.`;

/** Formats an ObjectTagError in Tamil. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்பார்க்கப்பட்ட object tag ${safelyStringifyUnknownValue(error.expected)}-ஐக் கொண்டிருக்கவில்லை.`;

/** Formats a ValidDateError in Tamil. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date செல்லுபடியாகாது.";

/** Formats an InstanceOfError in Tamil. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.constructorName}-இன் instance அல்ல.`;

/** Formats a LiteralError in Tamil. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்பார்க்கப்பட்ட literal-க்கு முற்றிலும் சமமாக இல்லை: ${String(error.expected)}.`;

/** Formats a UnionError in Tamil. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "மதிப்பு அனுமதிக்கப்பட்ட எந்த variant-உடனும் பொருந்தவில்லை.";

/** Formats a DateIsoError in Tamil. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு canonical ISO date-time string அல்ல.`;

/** Formats a PlainDateIsoError in Tamil. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} YYYY-MM-DD வடிவத்திலான செல்லுபடியாகும் நாட்காட்டி தேதி அல்ல.`;

/** Formats a DateIsoFromDateError in Tamil. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-ஐ DateIso ஆகக் குறிக்க முடியாது.";

/** Formats a DateIsoFromRfc3339Error in Tamil. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு ஆதரிக்கப்படும் RFC 3339 date-time அல்ல. "2024-01-01T12:00:00Z" போன்ற மதிப்பைப் பயன்படுத்தவும்.`;

/** Formats a DecimalStringError in Tamil. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு canonical decimal string ஆக இருக்க வேண்டும்.`;

/** Formats an Int64Error in Tamil. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் signed 64-bit integer (Int64) அல்ல.`;

/** Formats a UInt64Error in Tamil. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் unsigned 64-bit integer (UInt64) அல்ல.`;

/** Formats an Int64StringError in Tamil. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Int64 string அல்ல.`;

/** Formats an IdentifierError in Tamil. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு ${error.casing} அடையாளங்காட்டி அல்ல.`;

/** Formats a CapitalizedError in Tamil. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} பேரெழுத்தில் தொடங்க வேண்டும்.`;

/** Formats an UncapitalizedError in Tamil. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} பேரெழுத்தில் தொடங்கக்கூடாது.`;

/** Formats an UppercasedError in Tamil. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} பேரெழுத்துகளில் இருக்க வேண்டும்.`;

/** Formats a LowercasedError in Tamil. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} சிற்றெழுத்துகளில் இருக்க வேண்டும்.`;

/** Formats a TrimmedError in Tamil. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)}-இன் தொடக்கத்திலோ முடிவிலோ இடைவெளிகள் இருக்கக் கூடாது.`;

/** Formats a WellFormedError in Tamil. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} well-formed Unicode உரையாக இருக்க வேண்டும்.`;

/** Formats a NormalizedError in Tamil. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} Unicode இயல்பாக்க வடிவம் ${error.form}-இல் இருக்க வேண்டும்.`;

/** Formats a StartsWithError in Tamil. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஆனது ${safelyStringifyUnknownValue(error.prefix)} உடன் தொடங்க வேண்டும்.`;

/** Formats an EndsWithError in Tamil. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஆனது ${safelyStringifyUnknownValue(error.suffix)} உடன் முடிய வேண்டும்.`;

/** Formats an IncludesError in Tamil. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஆனது ${safelyStringifyUnknownValue(error.substring)}-ஐக் கொண்டிருக்க வேண்டும்.`;

/** Formats an ExcludesError in Tamil. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஆனது ${safelyStringifyUnknownValue(error.substring)}-ஐக் கொண்டிருக்கக் கூடாது.`;

/** Formats a MinLengthError in Tamil. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} குறைந்தபட்ச நீளமான ${error.min}-ஐப் பூர்த்தி செய்யவில்லை.`;

/** Formats a MaxLengthError in Tamil. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} அதிகபட்ச நீளமான ${error.max}-ஐ மீறுகிறது.`;

/** Formats a MaxUtf8ByteLengthError in Tamil. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} அதிகபட்ச UTF-8 பைட் நீளமான ${error.max}-ஐ மீறுகிறது.`;

/** Formats a LengthError in Tamil. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} தேவையான நீளமான ${error.exact}-ஐக் கொண்டிருக்கவில்லை.`;

/** Formats a RegexError in Tamil. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags}-உடன் பொருந்தவில்லை.`;

/** Formats a Base64UrlError in Tamil. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Base64Url string அல்ல.`;

/** Formats a Base64Error in Tamil. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Base64 string அல்ல.`;

/** Formats a HexError in Tamil. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} சிற்றெழுத்துகளிலான, இரட்டைப்படை எண்ணிக்கையிலான இலக்கங்களைக் கொண்ட hexadecimal string அல்ல.`;

/** Formats a HexColorError in Tamil. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} சிற்றெழுத்துகளிலான #rrggbb வடிவத்திலான நிறம் அல்ல.`;

/** Formats a NameError in Tamil. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Name அல்ல.`;

/** Formats an EmailError in Tamil. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் மின்னஞ்சல் முகவரி அல்ல.`;

/** Formats a HostnameError in Tamil. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} சிற்றெழுத்துகளிலான செல்லுபடியாகும் ஹோஸ்ட் பெயர் அல்ல.`;

/** Formats an Ipv4AddressError in Tamil. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் IPv4 முகவரி அல்ல.`;

/** Formats an Ipv6AddressError in Tamil. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு canonical IPv6 முகவரி அல்ல.`;

/** Formats an Ipv6AddressFromStringError in Tamil. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் IPv6 முகவரி அல்ல.`;

/** Formats an IpAddressError in Tamil. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் IPv4 முகவரியோ canonical IPv6 முகவரியோ அல்ல.`;

/** Formats an IpAddressFromStringError in Tamil. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் IP முகவரி அல்ல.`;

/** Formats a PhoneNumberE164Error in Tamil. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} E.164 வடிவத்திலான தொலைபேசி எண் அல்ல.`;

/** Formats an IbanError in Tamil. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} பேரெழுத்துகளிலான, இடைவெளிகள் இல்லாத செல்லுபடியாகும் IBAN அல்ல.`;

/** Formats an IsbnError in Tamil. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} இணைப்புக்கோடுகள் இல்லாத, 13 இலக்கங்களைக் கொண்ட செல்லுபடியாகும் ISBN அல்ல.`;

/** Formats a SimplePasswordError in Tamil. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "கடவுச்சொல்லின் தொடக்கத்திலோ முடிவிலோ இடைவெளிகள் இருக்கக் கூடாது.";
    case "TooLong":
      return "கடவுச்சொல் அதிகபட்ச நீளமான 64-ஐ மீறுகிறது.";
    case "TooShort":
      return "கடவுச்சொல் குறைந்தபட்ச நீளமான 8-ஐப் பூர்த்தி செய்யவில்லை.";
  }
};

/** Formats a MnemonicError in Tamil. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "மதிப்பு செல்லுபடியாகும் ஆங்கில BIP39 mnemonic அல்ல.";

/** Formats an IdError in Tamil. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Id அல்ல.`;

/** Formats a TableIdError in Tamil. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} table ${error.table}-க்கான செல்லுபடியாகும் Id அல்ல.`;

/** Formats a UuidError in Tamil. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} சிற்றெழுத்துகளிலான ஒரு canonical UUID அல்ல.`;

/** Formats a UuidVersionError in Tamil. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு பதிப்பு ${error.version} UUID அல்ல.`;

/** Formats a UlidError in Tamil. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} பேரெழுத்துகளிலான ஒரு canonical ULID அல்ல.`;

/** Formats a NonNegativeError in Tamil. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்மறையற்றதாக இருக்க வேண்டும் (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Tamil. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு எதிர்மறையற்ற decimal string ஆக இருக்க வேண்டும்.`;

/** Formats a PositiveError in Tamil. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} நேர்மறையாக இருக்க வேண்டும் (> 0).`;

/** Formats a PositiveDecimalStringError in Tamil. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு நேர்மறை decimal string ஆக இருக்க வேண்டும்.`;

/** Formats a NonPositiveError in Tamil. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} நேர்மறையற்றதாக இருக்க வேண்டும் (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Tamil. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு நேர்மறையற்ற decimal string ஆக இருக்க வேண்டும்.`;

/** Formats a NegativeError in Tamil. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்மறையாக இருக்க வேண்டும் (< 0).`;

/** Formats a NegativeDecimalStringError in Tamil. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு எதிர்மறை decimal string ஆக இருக்க வேண்டும்.`;

/** Formats an IntError in Tamil. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு பாதுகாப்பான integer ஆக இருக்க வேண்டும்.`;

/** Formats an IntFromStringError in Tamil. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} தசம முழு எண் அல்ல.`;

/** Formats a FiniteNumberFromStringError in Tamil. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} தசம எண் அல்ல.`;

/** Formats a GreaterThanError in Tamil. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.min}-ஐ விட அதிகமாக இருக்க வேண்டும்.`;

/** Formats a GreaterThanOrEqualToError in Tamil. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.min}-ஐ விட அதிகமாகவோ அல்லது சமமாகவோ இருக்க வேண்டும்.`;

/** Formats a LessThanError in Tamil. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.max}-ஐ விடக் குறைவாக இருக்க வேண்டும்.`;

/** Formats a LessThanOrEqualToError in Tamil. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.max}-ஐ விடக் குறைவாகவோ அல்லது சமமாகவோ இருக்க வேண்டும்.`;

/** Formats a NonNaNError in Tamil. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "மதிப்பு NaN ஆக இருக்கக் கூடாது.";

/** Formats a FiniteError in Tamil. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} முடிவுறுவதாக இருக்க வேண்டும்.`;

/** Formats a MultipleOfError in Tamil. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.divisor}-இன் மடங்காக இருக்க வேண்டும்.`;

/** Formats a BetweenError in Tamil. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.min} மற்றும் ${error.max}-க்கு இடையில், இரு எல்லைகளையும் உள்ளடக்கியதாக இருக்க வேண்டும்.`;

/** Formats a GreaterThanBigIntError in Tamil. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.min}-ஐ விட அதிகமாக இருக்க வேண்டும்.`;

/** Formats a GreaterThanOrEqualToBigIntError in Tamil. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.min}-ஐ விட அதிகமாகவோ அல்லது சமமாகவோ இருக்க வேண்டும்.`;

/** Formats a LessThanBigIntError in Tamil. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.max}-ஐ விடக் குறைவாக இருக்க வேண்டும்.`;

/** Formats a LessThanOrEqualToBigIntError in Tamil. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.max}-ஐ விடக் குறைவாகவோ அல்லது சமமாகவோ இருக்க வேண்டும்.`;

/** Formats a BetweenBigIntError in Tamil. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.min} மற்றும் ${error.max}-க்கு இடையில், இரு எல்லைகளையும் உள்ளடக்கியதாக இருக்க வேண்டும்.`;

/** Formats an ArrayError in Tamil. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு array அல்ல.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-இல் உள்ள array element காணப்படவில்லை.`;
    case "Accessor":
      return `index ${issue.index}-இல் உள்ள array element ஒரு data property ஆக இருக்க வேண்டும்.`;
    case "ExcessProperty":
      return "கூடுதலான Array property அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "Element":
      return `index ${issue.index}-இல் உள்ள array element செல்லுபடியாகாது.`;
  }
};

/** Formats a NonEmptyArrayError in Tamil. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} குறைந்தது ஒரு உருப்படியைக் கொண்டிருக்க வேண்டும்.`;

/** Formats a UniqueError in Tamil. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஆனது index ${error.previousIndex} மற்றும் ${error.index}-இல் சமமான உருப்படிகளைக் கொண்டுள்ளது.`;

/** Formats a SetError in Tamil. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு Set அல்ல.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `கூடுதலான Set property ${safelyStringifyUnknownValue(issue.key)} அனுமதிக்கப்படாது.`;
    case "Element":
      return `index ${issue.index}-இல் உள்ள Set element செல்லுபடியாகாது.`;
  }
};

/** Formats a MapError in Tamil. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு Map அல்ல.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `கூடுதலான Map property ${safelyStringifyUnknownValue(issue.key)} அனுமதிக்கப்படாது.`;
    case "Key":
      return `index ${issue.index}-இல் உள்ள Map key செல்லுபடியாகாது.`;
    case "Value":
      return `index ${issue.index}-இல் உள்ள Map மதிப்பு செல்லுபடியாகாது.`;
    case "Collision":
      return `index ${issue.previousIndex} மற்றும் ${issue.index}-இல் உள்ள Map key-கள் ஒரே key ${safelyStringifyUnknownValue(issue.outputKey)}-ஆக decode ஆகின்றன.`;
  }
};

/** Formats a MinSizeError in Tamil. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `அளவு ${error.value.size} குறைந்தபட்ச அளவான ${error.min}-ஐப் பூர்த்தி செய்யவில்லை.`;

/** Formats a MaxSizeError in Tamil. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `அளவு ${error.value.size} அதிகபட்ச அளவான ${error.max}-ஐ மீறுகிறது.`;

/** Formats a TupleError in Tamil. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு tuple அல்ல.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple-இன் நீளம் ${error.reason.expected} ஆக இருக்க வேண்டும், ஆனால் மதிப்பின் நீளம் ${error.reason.actual} ஆக உள்ளது.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-இல் உள்ள Tuple element காணப்படவில்லை.`;
    case "Accessor":
      return `index ${issue.index}-இல் உள்ள Tuple element ஒரு data property ஆக இருக்க வேண்டும்.`;
    case "ExcessProperty":
      return "கூடுதலான Tuple property அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "Element":
      return `index ${issue.index}-இல் உள்ள Tuple element செல்லுபடியாகாது.`;
  }
};

/** Formats a RecordError in Tamil. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு Record அல்ல.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "மதிப்பு ஒரு object ஆக உள்ளது, ஆனால் Record Output ஒரு plain object ஆகவோ null prototype உடையதாகவோ இருக்க வேண்டும்.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `property key ${safelyStringifyUnknownValue(issue.key)} செல்லுபடியாகாது.`;
    case "Value":
      return `property ${safelyStringifyUnknownValue(issue.key)}-இன் மதிப்பு செல்லுபடியாகாது.`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ஒரு data property ஆக இருக்க வேண்டும்.`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable ஆக இருக்க வேண்டும்.`;
    case "Collision":
      return `Record key-கள் ${safelyStringifyUnknownValue(issue.previousKey)} மற்றும் ${safelyStringifyUnknownValue(issue.key)} ஒரே key ${safelyStringifyUnknownValue(issue.outputKey)}-ஆக decode ஆகின்றன.`;
  }
};

/** Formats a MinEntriesError in Tamil. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} குறைந்தபட்ச உள்ளீடுகளின் எண்ணிக்கையான ${error.min}-ஐப் பூர்த்தி செய்யவில்லை.`;

/** Formats a MaxEntriesError in Tamil. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} அதிகபட்ச உள்ளீடுகளின் எண்ணிக்கையான ${error.max}-ஐ மீறுகிறது.`;

/** Formats an ObjectError in Tamil. */
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
        return "Object property ஒரு data property ஆக இருக்க வேண்டும். இந்த Type-ஐப் பயன்படுத்தும் முன் accessor மதிப்புகளை எளிய data-ஆக மாற்றவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
      case "NonEnumerable":
        return "Object property enumerable ஆக இருக்க வேண்டும். அதை enumerable ஆக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `தேவையான property ${safelyStringifyUnknownValue(key)} காணப்படவில்லை.`;
  }
  if (typeof key === "symbol") {
    return "Object property key ஒரு string ஆக இருக்க வேண்டும். symbol property-ஐ நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `property ${safelyStringifyUnknownValue(key)} அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.`;
  }
  return `property ${safelyStringifyUnknownValue(key)} செல்லுபடியாகாது.`;
};

/** Formats a DiscriminatedUnionError in Tamil. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ஒரு data property ஆக இருக்க வேண்டும்.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} object-இன் சொந்த property ஆக இருக்க வேண்டும்.`;
      }
      return `${property} enumerable ஆக இருக்க வேண்டும்.`;
    }
    case "Discriminator":
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} எதிர்பாராத மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)}-ஐக் கொண்டுள்ளது.`;
    case "Member":
      return `தேர்ந்தெடுக்கப்பட்ட variant ${safelyStringifyUnknownValue(error.reason.discriminator)} செல்லுபடியாகாது.`;
  }
};

/** Formats a DataError in Tamil. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `மதிப்பு ${safelyStringifyUnknownValue(issue.value)} Data அல்ல.`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} எதிர்பாராத prototype-ஐக் கொண்டுள்ளது.`;
    case "Accessor":
      return "Data property ஒரு data property ஆக இருக்க வேண்டும். இந்த Type-ஐப் பயன்படுத்தும் முன் accessor மதிப்புகளை எளிய data-ஆக மாற்றவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "NonEnumerable":
      return "Data Object property enumerable ஆக இருக்க வேண்டும். அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "SymbolProperty":
      return "Data Object property key ஒரு string ஆக இருக்க வேண்டும். symbol property-ஐ நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "Hole":
      return "Data Array element காணப்படவில்லை.";
    case "InvalidUint8Array":
      return "Data Uint8Array-இன் ArrayBuffer detach செய்யப்பட்டிருக்கக் கூடாது, மேலும் Uint8Array அந்த ArrayBuffer-இன் எல்லைக்குள் இருக்க வேண்டும்.";
    case "ExcessProperty":
      return `Data ${issue.container}-இல் கூடுதலான சொந்த property-கள் இருக்கக் கூடாது. அந்த property-ஐ நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.`;
  }
};

/** Formats a JsonValueError in Tamil. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `மதிப்பு ${safelyStringifyUnknownValue(issue.value)} ஒரு JSON மதிப்பு அல்ல.`;
    case "NonFiniteNumber":
      return "JSON number முடிவுறுவதாக இருக்க வேண்டும்.";
    case "UnexpectedPrototype":
      return "மதிப்பு ஒரு object ஆக உள்ளது, ஆனால் JsonValue object ஒரு plain object ஆகவோ null prototype உடையதாகவோ இருக்க வேண்டும்.";
    case "Accessor":
      return "JSON property ஒரு data property ஆக இருக்க வேண்டும். இந்த Type-ஐப் பயன்படுத்தும் முன் accessor மதிப்புகளை எளிய data-ஆக மாற்றவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "NonEnumerable":
      return "JSON object property enumerable ஆக இருக்க வேண்டும். அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "SymbolProperty":
      return "JSON object property key ஒரு string ஆக இருக்க வேண்டும். symbol property-ஐ நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "Hole":
      return "JSON array element காணப்படவில்லை.";
    case "ExcessProperty":
      return "கூடுதலான JSON array property அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "CircularReference":
      return "JsonValue-ல் சுழற்சிக் குறிப்புகள் இருக்கக் கூடாது.";
  }
};

/** Formats a JsonError in Tamil. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)}-ஐ JsonValue-ஆக parse செய்ய முடியாது.`;

/** Formats a ByteSizeLiteralError in Tamil. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} பைட் அளவுக்கான literal அல்ல. "512KiB" அல்லது "1MiB" போன்ற மதிப்பைப் பயன்படுத்தவும்.`;

/** Formats a ByteLengthError in Tamil. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "மதிப்பு -0 பைட் நீளம் அல்ல. அதற்குப் பதிலாக 0-ஐப் பயன்படுத்தவும்.";

/** Formats a ByteLengthFromStringError in Tamil. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} பைட் நீளம் அல்ல. பைட்டுகளின் எண்ணிக்கையை அல்லது 10MiB போன்ற literal-ஐப் பயன்படுத்தவும்.`;

/** Formats a DurationLiteralError in Tamil. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} கால அளவுக்கான literal அல்ல. "500ms" அல்லது "1.5s" போன்ற மதிப்பைப் பயன்படுத்தவும்.`;

/** Formats a PercentageLiteralError in Tamil. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} சதவீத literal அல்ல. "50%" அல்லது "12.5%" போன்ற மதிப்பைப் பயன்படுத்தவும்.`;
