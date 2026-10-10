/**
 * Malayalam Evolu Type error formatters.
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

  return `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു ${typeOf} അല്ല.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `മൂല്യം ${safelyStringifyUnknownValue(reason.value)} ഒരു object അല്ല.`
    : "മൂല്യം ഒരു object ആണ്, എന്നാൽ Object Output ഒരു plain object ആയിരിക്കുകയോ null prototype ഉണ്ടായിരിക്കുകയോ വേണം.";

/** Formats a NeverError in Malayalam. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} Never type-ന് സാധുവല്ല.`;

/** Formats a String TypeOfError in Malayalam. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Malayalam. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} template literal-നോട് പൊരുത്തപ്പെടുന്നില്ല.`;

/** Formats a Number TypeOfError in Malayalam. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Malayalam. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Malayalam. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Malayalam. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു boolean അല്ല. true അല്ലെങ്കിൽ false ഉപയോഗിക്കുക.`;

/** Formats a Symbol TypeOfError in Malayalam. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Malayalam. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Malayalam. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു Evolu Type അല്ല.`;

/** Formats an ObjectTagError in Malayalam. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `മൂല്യമായ ${safelyStringifyUnknownValue(error.value)}-ന് പ്രതീക്ഷിച്ച object tag ${safelyStringifyUnknownValue(error.expected)} ഇല്ല.`;

/** Formats a ValidDateError in Malayalam. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date അസാധുവാണ്.";

/** Formats an InstanceOfError in Malayalam. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.constructorName}-ന്റെ instance അല്ല.`;

/** Formats a LiteralError in Malayalam. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} പ്രതീക്ഷിച്ച literal-ന് കൃത്യമായി തുല്യമല്ല: ${String(error.expected)}.`;

/** Formats a UnionError in Malayalam. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "മൂല്യം അനുവദനീയമായ ഒരു variant-നോടും പൊരുത്തപ്പെടുന്നില്ല.";

/** Formats a DateIsoError in Malayalam. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string അല്ല.`;

/** Formats a PlainDateIsoError in Malayalam. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} YYYY-MM-DD ഫോർമാറ്റിലുള്ള സാധുവായ കലണ്ടർ തീയതി അല്ല.`;

/** Formats a DateIsoFromDateError in Malayalam. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-നെ DateIso ആയി പ്രതിനിധീകരിക്കാൻ കഴിയില്ല.";

/** Formats a DateIsoFromRfc3339Error in Malayalam. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} പിന്തുണയുള്ള ഒരു RFC 3339 date-time അല്ല. "2024-01-01T12:00:00Z" പോലുള്ള ഒരു മൂല്യം ഉപയോഗിക്കുക.`;

/** Formats a DecimalStringError in Malayalam. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} canonical decimal string ആയിരിക്കണം.`;

/** Formats an Int64Error in Malayalam. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ signed 64-bit integer (Int64) അല്ല.`;

/** Formats a UInt64Error in Malayalam. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ unsigned 64-bit integer (UInt64) അല്ല.`;

/** Formats an Int64StringError in Malayalam. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Int64 string അല്ല.`;

/** Formats an IdentifierError in Malayalam. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു ${error.casing} ഐഡന്റിഫയർ അല്ല.`;

/** Formats a CapitalizedError in Malayalam. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} വലിയ അക്ഷരത്തിൽ ആരംഭിക്കണം.`;

/** Formats an UncapitalizedError in Malayalam. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} വലിയ അക്ഷരത്തിൽ ആരംഭിക്കരുത്.`;

/** Formats an UppercasedError in Malayalam. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} വലിയ അക്ഷരങ്ങളിൽ ആയിരിക്കണം.`;

/** Formats a LowercasedError in Malayalam. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ചെറിയ അക്ഷരങ്ങളിൽ ആയിരിക്കണം.`;

/** Formats a TrimmedError in Malayalam. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന്റെ തുടക്കത്തിലോ അവസാനത്തിലോ സ്പേസ് ഉണ്ടാകരുത്.`;

/** Formats a WellFormedError in Malayalam. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} well-formed Unicode ടെക്സ്റ്റ് ആയിരിക്കണം.`;

/** Formats a NormalizedError in Malayalam. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} Unicode നോർമലൈസേഷൻ ഫോം ${error.form}-ൽ ആയിരിക്കണം.`;

/** Formats a StartsWithError in Malayalam. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${safelyStringifyUnknownValue(error.prefix)}-ൽ ആരംഭിക്കണം.`;

/** Formats an EndsWithError in Malayalam. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${safelyStringifyUnknownValue(error.suffix)}-ൽ അവസാനിക്കണം.`;

/** Formats an IncludesError in Malayalam. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ൽ ${safelyStringifyUnknownValue(error.substring)} ഉണ്ടായിരിക്കണം.`;

/** Formats an ExcludesError in Malayalam. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ൽ ${safelyStringifyUnknownValue(error.substring)} ഉണ്ടായിരിക്കരുത്.`;

/** Formats a MinLengthError in Malayalam. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന്റെ നീളം കുറഞ്ഞത് ${error.min} ആയിരിക്കണം.`;

/** Formats a MaxLengthError in Malayalam. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന്റെ നീളം ${error.max}-ൽ കൂടരുത്.`;

/** Formats a MaxUtf8ByteLengthError in Malayalam. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന്റെ UTF-8 ബൈറ്റ് നീളം ${error.max}-ൽ കൂടരുത്.`;

/** Formats a LengthError in Malayalam. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന്റെ നീളം കൃത്യമായി ${error.exact} ആയിരിക്കണം.`;

/** Formats a RegexError in Malayalam. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags}-നോട് പൊരുത്തപ്പെടുന്നില്ല.`;

/** Formats a Base64UrlError in Malayalam. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Base64Url string അല്ല.`;

/** Formats a Base64Error in Malayalam. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Base64 string അല്ല.`;

/** Formats a HexError in Malayalam. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ചെറിയ അക്ഷരങ്ങളിലുള്ളതും ഇരട്ട എണ്ണം അക്കങ്ങളുള്ളതുമായ hexadecimal string അല്ല.`;

/** Formats a HexColorError in Malayalam. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} #rrggbb ഫോർമാറ്റിൽ ചെറിയ അക്ഷരങ്ങളിലുള്ള നിറം അല്ല.`;

/** Formats a NameError in Malayalam. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Name അല്ല.`;

/** Formats an EmailError in Malayalam. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ ഇമെയിൽ വിലാസം അല്ല.`;

/** Formats a HostnameError in Malayalam. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ചെറിയ അക്ഷരങ്ങളിലുള്ള സാധുവായ ഹോസ്റ്റ് നാമം അല്ല.`;

/** Formats an Ipv4AddressError in Malayalam. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ IPv4 വിലാസം അല്ല.`;

/** Formats an Ipv6AddressError in Malayalam. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} canonical IPv6 വിലാസം അല്ല.`;

/** Formats an Ipv6AddressFromStringError in Malayalam. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ IPv6 വിലാസം അല്ല.`;

/** Formats an IpAddressError in Malayalam. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ IPv4 വിലാസമോ canonical IPv6 വിലാസമോ അല്ല.`;

/** Formats an IpAddressFromStringError in Malayalam. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ IP വിലാസം അല്ല.`;

/** Formats a PhoneNumberE164Error in Malayalam. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} E.164 ഫോർമാറ്റിലുള്ള ഫോൺ നമ്പർ അല്ല.`;

/** Formats an IbanError in Malayalam. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} വലിയ അക്ഷരങ്ങളിലുള്ളതും സ്പേസ് ഇല്ലാത്തതുമായ സാധുവായ IBAN അല്ല.`;

/** Formats an IsbnError in Malayalam. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഹൈഫൻ ഇല്ലാത്ത 13 അക്കങ്ങളുള്ള സാധുവായ ISBN അല്ല.`;

/** Formats a SimplePasswordError in Malayalam. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "പാസ്‌വേഡിന്റെ തുടക്കത്തിലോ അവസാനത്തിലോ സ്പേസ് ഉണ്ടാകരുത്.";
    case "TooLong":
      return "പാസ്‌വേഡിന്റെ നീളം 64-ൽ കൂടരുത്.";
    case "TooShort":
      return "പാസ്‌വേഡിന്റെ നീളം കുറഞ്ഞത് 8 ആയിരിക്കണം.";
  }
};

/** Formats a MnemonicError in Malayalam. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "മൂല്യം സാധുവായ ഇംഗ്ലീഷ് BIP39 mnemonic അല്ല.";

/** Formats a RedactedError in Malayalam. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "രഹസ്യം ഒരു string ആയിരിക്കണം.";

/** Formats an IdError in Malayalam. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Id അല്ല.`;

/** Formats a TableIdError in Malayalam. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} table ${error.table}-നുള്ള സാധുവായ Id അല്ല.`;

/** Formats a UuidError in Malayalam. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ചെറിയ അക്ഷരങ്ങളിലുള്ള canonical UUID അല്ല.`;

/** Formats a UuidVersionError in Malayalam. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} പതിപ്പ് ${error.version} UUID അല്ല.`;

/** Formats a UlidError in Malayalam. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} വലിയ അക്ഷരങ്ങളിലുള്ള canonical ULID അല്ല.`;

/** Formats a NonNegativeError in Malayalam. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഋണാത്മകമായിരിക്കരുത് (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Malayalam. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഋണാത്മകമല്ലാത്ത decimal string ആയിരിക്കണം.`;

/** Formats a PositiveError in Malayalam. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ധനാത്മകമായിരിക്കണം (> 0).`;

/** Formats a PositiveDecimalStringError in Malayalam. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ധനാത്മക decimal string ആയിരിക്കണം.`;

/** Formats a NonPositiveError in Malayalam. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ധനാത്മകമായിരിക്കരുത് (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Malayalam. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ധനാത്മകമല്ലാത്ത decimal string ആയിരിക്കണം.`;

/** Formats a NegativeError in Malayalam. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഋണാത്മകമായിരിക്കണം (< 0).`;

/** Formats a NegativeDecimalStringError in Malayalam. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഋണാത്മക decimal string ആയിരിക്കണം.`;

/** Formats an IntError in Malayalam. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} safe integer ആയിരിക്കണം.`;

/** Formats an IntFromStringError in Malayalam. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു ദശാംശ പൂർണ്ണസംഖ്യയല്ല.`;

/** Formats a FiniteNumberFromStringError in Malayalam. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു ദശാംശ സംഖ്യയല്ല.`;

/** Formats a GreaterThanError in Malayalam. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.min}-നേക്കാൾ വലുതായിരിക്കണം.`;

/** Formats a GreaterThanOrEqualToError in Malayalam. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.min}-നേക്കാൾ വലുതോ തുല്യമോ ആയിരിക്കണം.`;

/** Formats a LessThanError in Malayalam. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.max}-നേക്കാൾ ചെറുതായിരിക്കണം.`;

/** Formats a LessThanOrEqualToError in Malayalam. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.max}-നേക്കാൾ ചെറുതോ തുല്യമോ ആയിരിക്കണം.`;

/** Formats a NonNaNError in Malayalam. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "മൂല്യം NaN ആയിരിക്കരുത്.";

/** Formats a FiniteError in Malayalam. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} പരിമിതമായിരിക്കണം.`;

/** Formats a MultipleOfError in Malayalam. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.divisor}-ന്റെ ഗുണിതമായിരിക്കണം.`;

/** Formats a BetweenError in Malayalam. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.min} നും ${error.max} നും ഇടയിൽ (അതിരുകൾ ഉൾപ്പെടെ) ആയിരിക്കണം.`;

/** Formats a GreaterThanBigIntError in Malayalam. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.min}-നേക്കാൾ വലുതായിരിക്കണം.`;

/** Formats a GreaterThanOrEqualToBigIntError in Malayalam. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.min}-നേക്കാൾ വലുതോ തുല്യമോ ആയിരിക്കണം.`;

/** Formats a LessThanBigIntError in Malayalam. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.max}-നേക്കാൾ ചെറുതായിരിക്കണം.`;

/** Formats a LessThanOrEqualToBigIntError in Malayalam. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.max}-നേക്കാൾ ചെറുതോ തുല്യമോ ആയിരിക്കണം.`;

/** Formats a BetweenBigIntError in Malayalam. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}, ${error.min} നും ${error.max} നും ഇടയിൽ (അതിരുകൾ ഉൾപ്പെടെ) ആയിരിക്കണം.`;

/** Formats an ArrayError in Malayalam. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു array അല്ല.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-ലെ array element കാണാനില്ല.`;
    case "Accessor":
      return `index ${issue.index}-ലെ array element ഒരു data property ആയിരിക്കണം.`;
    case "ExcessProperty":
      return "അധിക Array property അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "Element":
      return `index ${issue.index}-ലെ array element അസാധുവാണ്.`;
  }
};

/** Formats a NonEmptyArrayError in Malayalam. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ൽ കുറഞ്ഞത് ഒരു ഇനമെങ്കിലും ഉണ്ടായിരിക്കണം.`;

/** Formats a UniqueError in Malayalam. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ൽ index ${error.previousIndex}-ലെയും ${error.index}-ലെയും ഇനങ്ങൾ തുല്യമാണ്.`;

/** Formats a SetError in Malayalam. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു Set അല്ല.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `അധിക Set property ${safelyStringifyUnknownValue(issue.key)} അനുവദനീയമല്ല.`;
    case "Element":
      return `index ${issue.index}-ലെ Set element അസാധുവാണ്.`;
  }
};

/** Formats a MapError in Malayalam. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു Map അല്ല.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `അധിക Map property ${safelyStringifyUnknownValue(issue.key)} അനുവദനീയമല്ല.`;
    case "Key":
      return `index ${issue.index}-ലെ Map key അസാധുവാണ്.`;
    case "Value":
      return `index ${issue.index}-ലെ Map മൂല്യം അസാധുവാണ്.`;
    case "Collision":
      return `index ${issue.previousIndex}-ലെയും ${issue.index}-ലെയും Map keys decode ചെയ്യുമ്പോൾ ഒരേ key ${safelyStringifyUnknownValue(issue.outputKey)} ലഭിക്കുന്നു.`;
  }
};

/** Formats a MinSizeError in Malayalam. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `വലുപ്പം ${error.value.size} ആണ്, എന്നാൽ അത് കുറഞ്ഞത് ${error.min} ആയിരിക്കണം.`;

/** Formats a MaxSizeError in Malayalam. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `വലുപ്പം ${error.value.size} ആണ്, എന്നാൽ അത് ${error.max}-ൽ കൂടരുത്.`;

/** Formats a TupleError in Malayalam. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു tuple അല്ല.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple-ന്റെ നീളം ${error.reason.expected} ആയിരിക്കണം, എന്നാൽ മൂല്യത്തിന്റെ നീളം ${error.reason.actual} ആണ്.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-ലെ Tuple element കാണാനില്ല.`;
    case "Accessor":
      return `index ${issue.index}-ലെ Tuple element ഒരു data property ആയിരിക്കണം.`;
    case "ExcessProperty":
      return "അധിക Tuple property അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "Element":
      return `index ${issue.index}-ലെ Tuple element അസാധുവാണ്.`;
  }
};

/** Formats a RecordError in Malayalam. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു Record അല്ല.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "മൂല്യം ഒരു object ആണ്, എന്നാൽ Record Output ഒരു plain object ആയിരിക്കുകയോ null prototype ഉണ്ടായിരിക്കുകയോ വേണം.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} അസാധുവാണ്.`;
    case "Value":
      return `Property ${safelyStringifyUnknownValue(issue.key)}-യുടെ മൂല്യം അസാധുവാണ്.`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ഒരു data property ആയിരിക്കണം.`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable ആയിരിക്കണം.`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} ഉം ${safelyStringifyUnknownValue(issue.key)} ഉം decode ചെയ്യുമ്പോൾ ഒരേ key ${safelyStringifyUnknownValue(issue.outputKey)} ലഭിക്കുന്നു.`;
  }
};

/** Formats a MinEntriesError in Malayalam. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ലെ എൻട്രികളുടെ എണ്ണം കുറഞ്ഞത് ${error.min} ആയിരിക്കണം.`;

/** Formats a MaxEntriesError in Malayalam. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ലെ എൻട്രികളുടെ എണ്ണം ${error.max}-ൽ കൂടരുത്.`;

/** Formats an ObjectError in Malayalam. */
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
        return "Object property ഒരു data property ആയിരിക്കണം. ഈ Type ഉപയോഗിക്കുന്നതിന് മുമ്പ് accessor മൂല്യങ്ങളെ plain data ആക്കി മാറ്റുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
      case "NonEnumerable":
        return "Object property enumerable ആയിരിക്കണം. അതിനെ enumerable ആക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `ആവശ്യമായ property ${safelyStringifyUnknownValue(key)} കാണാനില്ല.`;
  }
  if (typeof key === "symbol") {
    return "Object property key ഒരു string ആയിരിക്കണം. symbol property നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Property ${safelyStringifyUnknownValue(key)} അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.`;
  }
  return `Property ${safelyStringifyUnknownValue(key)} അസാധുവാണ്.`;
};

/** Formats a DiscriminatedUnionError in Malayalam. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ഒരു data property ആയിരിക്കണം.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} object-ന്റെ സ്വന്തം property ആയിരിക്കണം.`;
      }
      return `${property} enumerable ആയിരിക്കണം.`;
    }
    case "Discriminator":
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}-ന് പ്രതീക്ഷിക്കാത്ത മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഉണ്ട്.`;
    case "Member":
      return `തിരഞ്ഞെടുത്ത variant ${safelyStringifyUnknownValue(error.reason.discriminator)} അസാധുവാണ്.`;
  }
};

/** Formats a DataError in Malayalam. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `മൂല്യം ${safelyStringifyUnknownValue(issue.value)} Data അല്ല.`;
    case "UnexpectedPrototype":
      return `Data ${issue.container}-ന് പ്രതീക്ഷിക്കാത്ത prototype ഉണ്ട്.`;
    case "Accessor":
      return "Data property ഒരു data property ആയിരിക്കണം. ഈ Type ഉപയോഗിക്കുന്നതിന് മുമ്പ് accessor മൂല്യങ്ങളെ plain data ആക്കി മാറ്റുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "NonEnumerable":
      return "Data Object property enumerable ആയിരിക്കണം. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "SymbolProperty":
      return "Data Object property key ഒരു string ആയിരിക്കണം. symbol property നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "Hole":
      return "ഒരു Data Array element കാണാനില്ല.";
    case "InvalidUint8Array":
      return "Data Uint8Array-ന്റെ ArrayBuffer detach ചെയ്യപ്പെട്ടിരിക്കരുത്, കൂടാതെ Uint8Array ആ ArrayBuffer-ന്റെ പരിധിക്കുള്ളിൽ ആയിരിക്കണം.";
    case "ExcessProperty":
      return `Data ${issue.container}-ന് സ്വന്തമായ അധിക properties ഉണ്ടാകരുത്. ആ property നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.`;
  }
};

/** Formats a JsonValueError in Malayalam. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `മൂല്യം ${safelyStringifyUnknownValue(issue.value)} ഒരു JSON മൂല്യം അല്ല.`;
    case "NonFiniteNumber":
      return "ഒരു JSON number പരിമിതമായിരിക്കണം.";
    case "UnexpectedPrototype":
      return "മൂല്യം ഒരു object ആണ്, എന്നാൽ JsonValue object ഒരു plain object ആയിരിക്കുകയോ null prototype ഉണ്ടായിരിക്കുകയോ വേണം.";
    case "Accessor":
      return "JSON property ഒരു data property ആയിരിക്കണം. ഈ Type ഉപയോഗിക്കുന്നതിന് മുമ്പ് accessor മൂല്യങ്ങളെ plain data ആക്കി മാറ്റുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "NonEnumerable":
      return "JSON object property enumerable ആയിരിക്കണം. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "SymbolProperty":
      return "JSON object property key ഒരു string ആയിരിക്കണം. symbol property നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "Hole":
      return "ഒരു JSON array element കാണാനില്ല.";
    case "ExcessProperty":
      return "അധിക JSON array property അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "CircularReference":
      return "JsonValue-ൽ circular references ഉണ്ടാകരുത്.";
  }
};

/** Formats a JsonError in Malayalam. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-നെ JsonValue-ലേക്ക് parse ചെയ്യാൻ കഴിയില്ല.`;

/** Formats a ByteSizeLiteralError in Malayalam. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ബൈറ്റ് വലുപ്പത്തിന്റെ literal അല്ല. "512KiB" അല്ലെങ്കിൽ "1MiB" പോലുള്ള ഒരു മൂല്യം ഉപയോഗിക്കുക.`;

/** Formats a ByteLengthError in Malayalam. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "മൂല്യം -0 ഒരു ബൈറ്റ് നീളമല്ല. പകരം 0 ഉപയോഗിക്കുക.";

/** Formats a ByteLengthFromStringError in Malayalam. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു ബൈറ്റ് നീളമല്ല. ബൈറ്റുകളുടെ എണ്ണം അല്ലെങ്കിൽ 10MiB പോലുള്ള ഒരു literal ഉപയോഗിക്കുക.`;

/** Formats a DurationLiteralError in Malayalam. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സമയദൈർഘ്യത്തിന്റെ literal അല്ല. "500ms" അല്ലെങ്കിൽ "1.5s" പോലുള്ള ഒരു മൂല്യം ഉപയോഗിക്കുക.`;

/** Formats a PercentageLiteralError in Malayalam. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ശതമാനത്തിന്റെ literal അല്ല. "50%" അല്ലെങ്കിൽ "12.5%" പോലുള്ള ഒരു മൂല്യം ഉപയോഗിക്കുക.`;
