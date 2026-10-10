/**
 * Slovenian Evolu Type error formatters.
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

const typeOfNameByExpected = {
  String: "niz",
  Number: "število",
  BigInt: "bigint",
  Boolean: "logična vrednost",
  Symbol: "simbol",
  Function: "funkcija",
} as const;

const formatTypeOfError = (
  error: TypeOfError<keyof typeof typeOfNameByExpected>,
): string =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni ${typeOfNameByExpected[error.expected]}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Vrednost ${safelyStringifyUnknownValue(reason.value)} ni objekt.`
    : "Vrednost je objekt, vendar mora biti izhod tipa Object navaden objekt ali imeti prototip null.";

/** Formats a NeverError in Slovenian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavna za tip Never.`;

/** Formats a String TypeOfError in Slovenian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Slovenian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se ne ujema z literalom predloge.`;

/** Formats a Number TypeOfError in Slovenian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Slovenian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Slovenian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Slovenian. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni logična vrednost. Uporabite true ali false.`;

/** Formats a Symbol TypeOfError in Slovenian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Slovenian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Slovenian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Vrednost ${safelyStringifyUnknownValue(error.value)} ni Evolu Type.`;

/** Formats an ObjectTagError in Slovenian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} nima pričakovane oznake objekta ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Slovenian. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Datum ni veljaven.";

/** Formats an InstanceOfError in Slovenian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni primerek ${error.constructorName}.`;

/** Formats a LiteralError in Slovenian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni strogo enaka pričakovanemu literalu: ${String(error.expected)}.`;

/** Formats a UnionError in Slovenian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Vrednost se ne ujema z nobeno dovoljeno različico.";

/** Formats a DateIsoError in Slovenian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni kanonični niz datuma in časa ISO.`;

/** Formats a PlainDateIsoError in Slovenian. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven koledarski datum v obliki YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Slovenian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Datuma ni mogoče predstaviti kot DateIso.";

/** Formats a DateIsoFromRfc3339Error in Slovenian. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni datum in čas v podprti obliki RFC 3339. Uporabite vrednost, kot je "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Slovenian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti kanonični decimalni niz.`;

/** Formats an Int64Error in Slovenian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavno 64-bitno celo število s predznakom (Int64).`;

/** Formats a UInt64Error in Slovenian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavno 64-bitno celo število brez predznaka (UInt64).`;

/** Formats an Int64StringError in Slovenian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven niz Int64.`;

/** Formats an IdentifierError in Slovenian. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni identifikator v obliki ${error.casing}.`;

/** Formats a CapitalizedError in Slovenian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se mora začeti z veliko začetnico.`;

/** Formats an UncapitalizedError in Slovenian. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se ne sme začeti z veliko črko.`;

/** Formats an UppercasedError in Slovenian. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti zapisana z velikimi črkami.`;

/** Formats a LowercasedError in Slovenian. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti zapisana z malimi črkami.`;

/** Formats a TrimmedError in Slovenian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti brez presledkov na začetku in koncu.`;

/** Formats a WellFormedError in Slovenian. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti pravilno oblikovano besedilo Unicode.`;

/** Formats a NormalizedError in Slovenian. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti v normalizacijski obliki Unicode ${error.form}.`;

/** Formats a StartsWithError in Slovenian. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se mora začeti z ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Slovenian. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se mora končati z ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Slovenian. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora vsebovati ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Slovenian. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ne sme vsebovati ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Slovenian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ne dosega najmanjše dolžine ${error.min}.`;

/** Formats a MaxLengthError in Slovenian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} presega največjo dolžino ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Slovenian. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} presega največjo dolžino ${error.max} v bajtih UTF-8.`;

/** Formats a LengthError in Slovenian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} nima zahtevane dolžine ${error.exact}.`;

/** Formats a RegexError in Slovenian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se ne ujema z /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Slovenian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven niz Base64Url.`;

/** Formats a Base64Error in Slovenian. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven niz Base64.`;

/** Formats a HexError in Slovenian. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni šestnajstiški niz, zapisan z malimi črkami, s sodim številom števk.`;

/** Formats a HexColorError in Slovenian. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni barva v obliki #rrggbb, zapisana z malimi črkami.`;

/** Formats a NameError in Slovenian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavno ime.`;

/** Formats an EmailError in Slovenian. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven e-poštni naslov.`;

/** Formats a HostnameError in Slovenian. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavno ime gostitelja, zapisano z malimi črkami.`;

/** Formats an Ipv4AddressError in Slovenian. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven naslov IPv4.`;

/** Formats an Ipv6AddressError in Slovenian. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni kanonični naslov IPv6.`;

/** Formats an Ipv6AddressFromStringError in Slovenian. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven naslov IPv6.`;

/** Formats an IpAddressError in Slovenian. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven naslov IPv4 niti kanonični naslov IPv6.`;

/** Formats an IpAddressFromStringError in Slovenian. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven naslov IP.`;

/** Formats a PhoneNumberE164Error in Slovenian. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni telefonska številka v obliki E.164.`;

/** Formats an IbanError in Slovenian. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven IBAN, zapisan z velikimi črkami brez presledkov.`;

/** Formats an IsbnError in Slovenian. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven 13-mestni ISBN brez vezajev.`;

/** Formats a SimplePasswordError in Slovenian. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Geslo mora biti brez presledkov na začetku in koncu.";
    case "TooLong":
      return "Geslo presega največjo dolžino 64.";
    case "TooShort":
      return "Geslo ne dosega najmanjše dolžine 8.";
  }
};

/** Formats a MnemonicError in Slovenian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Vrednost ni veljavna angleška mnemonična fraza BIP39.";

/** Formats a RedactedError in Slovenian. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "Skrivnost mora biti niz.";

/** Formats an IdError in Slovenian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven Id.`;

/** Formats a TableIdError in Slovenian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven Id za tabelo ${error.table}.`;

/** Formats a UuidError in Slovenian. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni kanonični UUID, zapisan z malimi črkami.`;

/** Formats a UuidVersionError in Slovenian. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni UUID različice ${error.version}.`;

/** Formats a UlidError in Slovenian. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni kanonični ULID, zapisan z velikimi črkami.`;

/** Formats a NonNegativeError in Slovenian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativna (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Slovenian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativni decimalni niz.`;

/** Formats a PositiveError in Slovenian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivna (> 0).`;

/** Formats a PositiveDecimalStringError in Slovenian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivni decimalni niz.`;

/** Formats a NonPositiveError in Slovenian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivna (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Slovenian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivni decimalni niz.`;

/** Formats a NegativeError in Slovenian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti negativna (< 0).`;

/** Formats a NegativeDecimalStringError in Slovenian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti negativni decimalni niz.`;

/** Formats an IntError in Slovenian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti varno celo število.`;

/** Formats an IntFromStringError in Slovenian. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni celo število v desetiškem zapisu.`;

/** Formats a FiniteNumberFromStringError in Slovenian. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni število v desetiškem zapisu.`;

/** Formats a GreaterThanError in Slovenian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večja od ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Slovenian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večja ali enaka ${error.min}.`;

/** Formats a LessThanError in Slovenian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti manjša od ${error.max}.`;

/** Formats a LessThanOrEqualToError in Slovenian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti manjša ali enaka ${error.max}.`;

/** Formats a NonNaNError in Slovenian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Vrednost ne sme biti NaN.";

/** Formats a FiniteError in Slovenian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti končna.`;

/** Formats a MultipleOfError in Slovenian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večkratnik števila ${error.divisor}.`;

/** Formats a BetweenError in Slovenian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti med ${error.min} in ${error.max}, vključno.`;

/** Formats a GreaterThanBigIntError in Slovenian. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večja od ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Slovenian. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večja ali enaka ${error.min}.`;

/** Formats a LessThanBigIntError in Slovenian. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti manjša od ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Slovenian. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti manjša ali enaka ${error.max}.`;

/** Formats a BetweenBigIntError in Slovenian. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti med ${error.min} in ${error.max}, vključno.`;

/** Formats an ArrayError in Slovenian. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni polje.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Element polja na indeksu ${issue.index} manjka.`;
    case "Accessor":
      return `Element polja na indeksu ${issue.index} mora biti podatkovna lastnost.`;
    case "ExcessProperty":
      return "Dodatna lastnost polja ni dovoljena. Odstranite jo ali uporabite drug Type.";
    case "Element":
      return `Element polja na indeksu ${issue.index} ni veljaven.`;
  }
};

/** Formats a NonEmptyArrayError in Slovenian. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora vsebovati vsaj en element.`;

/** Formats a UniqueError in Slovenian. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ima enaka elementa na indeksih ${error.previousIndex} in ${error.index}.`;

/** Formats a SetError in Slovenian. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Dodatna lastnost Set ${safelyStringifyUnknownValue(issue.key)} ni dovoljena.`;
    case "Element":
      return `Element Set na indeksu ${issue.index} ni veljaven.`;
  }
};

/** Formats a MapError in Slovenian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Dodatna lastnost Map ${safelyStringifyUnknownValue(issue.key)} ni dovoljena.`;
    case "Key":
      return `Ključ Map na indeksu ${issue.index} ni veljaven.`;
    case "Value":
      return `Vrednost Map na indeksu ${issue.index} ni veljavna.`;
    case "Collision":
      return `Ključa Map na indeksih ${issue.previousIndex} in ${issue.index} se dekodirata v isti ključ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Slovenian. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Velikost ${error.value.size} ne dosega najmanjše velikosti ${error.min}.`;

/** Formats a MaxSizeError in Slovenian. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Velikost ${error.value.size} presega največjo velikost ${error.max}.`;

/** Formats a TupleError in Slovenian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni terka.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Terka mora imeti dolžino ${error.reason.expected}, vendar ima vrednost dolžino ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Element terke na indeksu ${issue.index} manjka.`;
    case "Accessor":
      return `Element terke na indeksu ${issue.index} mora biti podatkovna lastnost.`;
    case "ExcessProperty":
      return "Dodatna lastnost terke ni dovoljena. Odstranite jo ali uporabite drug Type.";
    case "Element":
      return `Element terke na indeksu ${issue.index} ni veljaven.`;
  }
};

/** Formats a RecordError in Slovenian. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Vrednost je objekt, vendar mora biti izhod tipa Record navaden objekt ali imeti prototip null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Ključ lastnosti ${safelyStringifyUnknownValue(issue.key)} ni veljaven.`;
    case "Value":
      return `Vrednost lastnosti ${safelyStringifyUnknownValue(issue.key)} ni veljavna.`;
    case "Accessor":
      return `Lastnost Record ${safelyStringifyUnknownValue(issue.key)} mora biti podatkovna lastnost.`;
    case "NonEnumerable":
      return `Lastnost Record ${safelyStringifyUnknownValue(issue.key)} mora biti naštevna.`;
    case "Collision":
      return `Ključa Record ${safelyStringifyUnknownValue(issue.previousKey)} in ${safelyStringifyUnknownValue(issue.key)} se dekodirata v isti ključ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Slovenian. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ne dosega najmanjšega števila vnosov ${error.min}.`;

/** Formats a MaxEntriesError in Slovenian. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} presega največje število vnosov ${error.max}.`;

/** Formats an ObjectError in Slovenian. */
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
        return "Lastnost Object mora biti podatkovna lastnost. Pred uporabo tega Type pretvorite vrednosti dostopnikov v navadne podatke ali uporabite drug Type.";
      case "NonEnumerable":
        return "Lastnost Object mora biti naštevna. Naredite jo naštevno ali uporabite drug Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Zahtevana lastnost ${safelyStringifyUnknownValue(key)} manjka.`;
  }
  if (typeof key === "symbol") {
    return "Ključ lastnosti Object mora biti niz. Odstranite lastnost s simbolom ali uporabite drug Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Lastnost ${safelyStringifyUnknownValue(key)} ni dovoljena. Odstranite jo ali uporabite drug Type.`;
  }
  return `Lastnost ${safelyStringifyUnknownValue(key)} ni veljavna.`;
};

/** Formats a DiscriminatedUnionError in Slovenian. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Razločevalna lastnost ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} mora biti podatkovna lastnost.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} mora biti lastna lastnost.`;
      }
      return `${property} mora biti naštevna.`;
    }
    case "Discriminator":
      return `Razločevalna lastnost ${safelyStringifyUnknownValue(error.reason.key)} ima nepričakovano vrednost ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Izbrana različica ${safelyStringifyUnknownValue(error.reason.discriminator)} ni veljavna.`;
  }
};

/** Formats a DataError in Slovenian. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Vrednost ${safelyStringifyUnknownValue(issue.value)} ni Data.`;
    case "UnexpectedPrototype":
      return `Vrednost tipa ${issue.container} v Data ima nepričakovan prototip.`;
    case "Accessor":
      return "Lastnost v Data mora biti podatkovna lastnost. Pred uporabo tega Type pretvorite vrednosti dostopnikov v navadne podatke ali uporabite drug Type.";
    case "NonEnumerable":
      return "Lastnost objekta v Data mora biti naštevna. Odstranite jo ali uporabite drug Type.";
    case "SymbolProperty":
      return "Ključ lastnosti objekta v Data mora biti niz. Odstranite lastnost s simbolom ali uporabite drug Type.";
    case "Hole":
      return "Element polja v Data manjka.";
    case "InvalidUint8Array":
      return "Uint8Array v Data mora imeti ArrayBuffer, ki ni odklopljen, in ležati znotraj njegovih meja.";
    case "ExcessProperty":
      return `Vrednost tipa ${issue.container} v Data ne sme imeti dodatnih lastnih lastnosti. Odstranite lastnost ali uporabite drug Type.`;
  }
};

/** Formats a JsonValueError in Slovenian. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Vrednost ${safelyStringifyUnknownValue(issue.value)} ni vrednost JSON.`;
    case "NonFiniteNumber":
      return "Število JSON mora biti končno.";
    case "UnexpectedPrototype":
      return "Vrednost je objekt, vendar mora biti objekt JsonValue navaden objekt ali imeti prototip null.";
    case "Accessor":
      return "Lastnost JSON mora biti podatkovna lastnost. Pred uporabo tega Type pretvorite vrednosti dostopnikov v navadne podatke ali uporabite drug Type.";
    case "NonEnumerable":
      return "Lastnost objekta JSON mora biti naštevna. Odstranite jo ali uporabite drug Type.";
    case "SymbolProperty":
      return "Ključ lastnosti objekta JSON mora biti niz. Odstranite lastnost s simbolom ali uporabite drug Type.";
    case "Hole":
      return "Element polja JSON manjka.";
    case "ExcessProperty":
      return "Dodatna lastnost polja JSON ni dovoljena. Odstranite jo ali uporabite drug Type.";
    case "CircularReference":
      return "JsonValue ne sme vsebovati krožnih sklicev.";
  }
};

/** Formats a JsonError in Slovenian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Vrednosti ${safelyStringifyUnknownValue(error.value)} ni mogoče razčleniti v JsonValue.`;

/** Formats a ByteSizeLiteralError in Slovenian. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni literal velikosti v bajtih. Uporabite vrednost, kot je "512KiB" ali "1MiB".`;

/** Formats a ByteLengthError in Slovenian. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Vrednost -0 ni dolžina v bajtih. Namesto nje uporabite 0.";

/** Formats a ByteLengthFromStringError in Slovenian. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni dolžina v bajtih. Uporabite število bajtov ali literal, kot je 10MiB.`;

/** Formats a DurationLiteralError in Slovenian. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni literal trajanja. Uporabite vrednost, kot je "500ms" ali "1.5s".`;

/** Formats a PercentageLiteralError in Slovenian. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni odstotni literal. Uporabite vrednost, kot je "50%" ali "12.5%".`;
