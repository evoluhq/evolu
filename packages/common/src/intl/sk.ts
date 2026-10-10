/**
 * Slovak Evolu Type error formatters.
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

const formatValueMustBe = (value: unknown, expected: string): string =>
  `Hodnota ${safelyStringifyUnknownValue(value)} musí byť ${expected}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Hodnota ${safelyStringifyUnknownValue(reason.value)} nie je objekt.`
    : "Hodnota je objekt, ale výstup typu Object musí byť obyčajný objekt alebo mať prototyp null.";

/** Formats a NeverError in Slovak. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platná pre typ Never.`;
/** Formats a String TypeOfError in Slovak. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> = (
  error,
) => formatValueMustBe(error.value, "reťazec");
/** Formats a TemplateLiteralError in Slovak. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nezodpovedá šablónovému literálu.`;
/** Formats a Number TypeOfError in Slovak. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> = (
  error,
) => formatValueMustBe(error.value, "číslo");
/** Formats a BigInt TypeOfError in Slovak. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> = (
  error,
) => formatValueMustBe(error.value, "celé číslo typu bigint");
/** Formats a Boolean TypeOfError in Slovak. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> = (
  error,
) => formatValueMustBe(error.value, "logická hodnota");
/** Formats a Symbol TypeOfError in Slovak. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> = (
  error,
) => formatValueMustBe(error.value, "symbol");
/** Formats a Function TypeOfError in Slovak. */
export const formatFunctionError: TypeErrorFormatter<
  TypeOfError<"Function">
> = (error) => formatValueMustBe(error.value, "funkcia");
/** Formats an EvoluTypeError in Slovak. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť Evolu Type.`;
/** Formats an ObjectTagError in Slovak. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nemá očakávanú značku objektu ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formats a ValidDateError in Slovak. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Dátum je neplatný.";
/** Formats an InstanceOfError in Slovak. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť inštanciou ${error.constructorName}.`;
/** Formats a LiteralError in Slovak. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} sa musí presne rovnať očakávanému literálu ${String(error.expected)}.`;
/** Formats a UnionError in Slovak. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Hodnota nezodpovedá žiadnemu z povolených variantov.";
/** Formats a DateIsoError in Slovak. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť reťazec dátumu a času v kanonickom formáte ISO.`;
/** Formats a PlainDateIsoError in Slovak. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platný kalendárny dátum vo formáte YYYY-MM-DD.`;
/** Formats a DateIsoFromDateError in Slovak. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Dátum nie je možné reprezentovať ako DateIso.";
/** Formats a DateIsoFromRfc3339Error in Slovak. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je dátum a čas v podporovanom formáte RFC 3339. Použite napríklad "2024-01-01T12:00:00Z".`;
/** Formats a DecimalStringError in Slovak. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť kanonický desatinný reťazec.`;
/** Formats an Int64Error in Slovak. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť platné 64-bitové celé číslo so znamienkom (Int64).`;
/** Formats a UInt64Error in Slovak. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť platné 64-bitové celé číslo bez znamienka (UInt64).`;
/** Formats an Int64StringError in Slovak. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť platný reťazec Int64.`;

/** Formats an IdentifierError in Slovak. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je identifikátor vo formáte ${error.casing}.`;

/** Formats a CapitalizedError in Slovak. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Reťazec ${safelyStringifyUnknownValue(error.value)} musí začínať veľkým písmenom.`;

/** Formats an UncapitalizedError in Slovak. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nesmie začínať veľkým písmenom.`;

/** Formats an UppercasedError in Slovak. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť napísaná veľkými písmenami.`;

/** Formats a LowercasedError in Slovak. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť napísaná malými písmenami.`;
/** Formats a TrimmedError in Slovak. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Reťazec ${safelyStringifyUnknownValue(error.value)} nesmie obsahovať medzery na začiatku ani na konci.`;
/** Formats a WellFormedError in Slovak. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť správne utvorený text Unicode.`;
/** Formats a NormalizedError in Slovak. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť v normalizačnej forme Unicode ${error.form}.`;
/** Formats a StartsWithError in Slovak. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí začínať na ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Slovak. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí končiť na ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Slovak. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí obsahovať ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Slovak. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nesmie obsahovať ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Slovak. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  typeof error.value === "string" && error.min === 1
    ? "Reťazec nesmie byť prázdny."
    : `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mať dĺžku aspoň ${error.min}.`;
/** Formats a MaxLengthError in Slovak. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} môže mať dĺžku najviac ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Slovak. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} môže mať dĺžku v bajtoch UTF-8 najviac ${error.max}.`;

/** Formats a LengthError in Slovak. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mať presne dĺžku ${error.exact}.`;
/** Formats a RegexError in Slovak. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nezodpovedá regulárnemu výrazu /${error.source}/${error.flags}.`;
/** Formats a Base64UrlError in Slovak. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platný reťazec Base64Url.`;
/** Formats a Base64Error in Slovak. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platný reťazec Base64.`;
/** Formats a HexError in Slovak. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je hexadecimálny reťazec zapísaný malými písmenami s párnym počtom číslic.`;

/** Formats a HexColorError in Slovak. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je farba vo formáte #rrggbb zapísaná malými písmenami.`;

/** Formats a NameError in Slovak. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platný názov.`;
/** Formats an EmailError in Slovak. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platná e-mailová adresa.`;
/** Formats a HostnameError in Slovak. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platný názov hostiteľa zapísaný malými písmenami.`;
/** Formats an Ipv4AddressError in Slovak. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platná adresa IPv4.`;
/** Formats an Ipv6AddressError in Slovak. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je kanonická adresa IPv6.`;
/** Formats an Ipv6AddressFromStringError in Slovak. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platná adresa IPv6.`;

/** Formats an IpAddressError in Slovak. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platná adresa IPv4 ani kanonická adresa IPv6.`;

/** Formats an IpAddressFromStringError in Slovak. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platná adresa IP.`;

/** Formats a PhoneNumberE164Error in Slovak. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je telefónne číslo vo formáte E.164.`;
/** Formats an IbanError in Slovak. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platný IBAN zapísaný veľkými písmenami bez medzier.`;

/** Formats an IsbnError in Slovak. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platné 13-miestne ISBN bez spojovníkov.`;

/** Formats a SimplePasswordError in Slovak. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Heslo nesmie obsahovať medzery na začiatku ani na konci.";
    case "TooLong":
      return "Heslo môže mať dĺžku najviac 64.";
    case "TooShort":
      return "Heslo musí mať dĺžku aspoň 8.";
  }
};
/** Formats a MnemonicError in Slovak. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Hodnota nie je platná anglická mnemotechnická fráza BIP39.";
/** Formats a RedactedError in Slovak. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "Tajomstvo musí byť reťazec.";
/** Formats an IdError in Slovak. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platné Id.`;
/** Formats a TableIdError in Slovak. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platné Id pre tabuľku ${safelyStringifyUnknownValue(error.table)}.`;
/** Formats a UuidError in Slovak. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je kanonické UUID zapísané malými písmenami.`;
/** Formats a UuidVersionError in Slovak. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je UUID verzie ${error.version}.`;

/** Formats a UlidError in Slovak. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je kanonický ULID zapísaný veľkými písmenami.`;

/** Formats a NonNegativeError in Slovak. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť nezáporná (>= 0).`;
/** Formats a NonNegativeDecimalStringError in Slovak. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť nezáporný desatinný reťazec.`;
/** Formats a PositiveError in Slovak. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť kladná (> 0).`;
/** Formats a PositiveDecimalStringError in Slovak. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť kladný desatinný reťazec.`;
/** Formats a NonPositiveError in Slovak. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť nekladná (<= 0).`;
/** Formats a NonPositiveDecimalStringError in Slovak. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť nekladný desatinný reťazec.`;
/** Formats a NegativeError in Slovak. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť záporná (< 0).`;
/** Formats a NegativeDecimalStringError in Slovak. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť záporný desatinný reťazec.`;
/** Formats an IntError in Slovak. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť bezpečné celé číslo.`;
/** Formats a GreaterThanError in Slovak. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť väčšia ako ${error.min}.`;
/** Formats a GreaterThanOrEqualToError in Slovak. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť väčšia alebo rovná ${error.min}.`;
/** Formats a LessThanError in Slovak. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť menšia ako ${error.max}.`;
/** Formats a LessThanOrEqualToError in Slovak. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť menšia alebo rovná ${error.max}.`;
/** Formats a NonNaNError in Slovak. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Hodnota nesmie byť NaN.";
/** Formats a FiniteError in Slovak. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť konečná.`;
/** Formats a MultipleOfError in Slovak. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť násobkom čísla ${error.divisor}.`;
/** Formats a BetweenError in Slovak. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť v rozsahu od ${error.min} do ${error.max} vrátane.`;

/** Formats a GreaterThanBigIntError in Slovak. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť väčšia ako ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Slovak. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť väčšia alebo rovná ${error.min}.`;

/** Formats a LessThanBigIntError in Slovak. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť menšia ako ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Slovak. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť menšia alebo rovná ${error.max}.`;

/** Formats a BetweenBigIntError in Slovak. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť v rozsahu od ${error.min} do ${error.max} vrátane.`;

/** Formats a BooleanFromStringError in Slovak. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť true alebo false.`;

/** Formats an IntFromStringError in Slovak. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť celé číslo v desiatkovom zápise.`;

/** Formats a FiniteNumberFromStringError in Slovak. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí byť číslo v desiatkovom zápise.`;

/** Formats an ArrayError in Slovak. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} nie je pole.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `V poli chýba prvok na indexe ${issue.index}.`;
    case "Accessor":
      return `Prvok poľa na indexe ${issue.index} musí byť dátová vlastnosť.`;
    case "ExcessProperty":
      return "Pole obsahuje nepovolenú vlastnosť. Odstráňte ju alebo použite iný Type.";
    case "Element":
      return `Prvok poľa na indexe ${issue.index} nie je platný.`;
  }
};
/** Formats a NonEmptyArrayError in Slovak. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí obsahovať aspoň jednu položku.`;
/** Formats a UniqueError in Slovak. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} obsahuje rovnaké položky na indexoch ${error.previousIndex} a ${error.index}.`;
/** Formats a SetError in Slovak. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} nie je Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Set obsahuje nepovolenú vlastnosť ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `Prvok Set na indexe ${issue.index} nie je platný.`;
  }
};

/** Formats a MapError in Slovak. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} nie je Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Map obsahuje nepovolenú vlastnosť ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
      return `Kľúč Map na indexe ${issue.index} nie je platný.`;
    case "Value":
      return `Hodnota Map na indexe ${issue.index} nie je platná.`;
    case "Collision":
      return `Kľúče Map na indexoch ${issue.previousIndex} a ${issue.index} sa dekódujú na rovnaký kľúč ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Slovak. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Veľkosť ${error.value.size} nedosahuje minimálnu veľkosť ${error.min}.`;

/** Formats a MaxSizeError in Slovak. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Veľkosť ${error.value.size} prekračuje maximálnu veľkosť ${error.max}.`;

/** Formats a TupleError in Slovak. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} nie je tuple.`;
  if (error.reason.kind === "InvalidLength")
    return `Tuple musí mať dĺžku ${error.reason.expected}, ale hodnota má dĺžku ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `V Tuple chýba prvok na indexe ${issue.index}.`;
    case "Accessor":
      return `Prvok Tuple na indexe ${issue.index} musí byť dátová vlastnosť.`;
    case "ExcessProperty":
      return "Tuple obsahuje nepovolenú vlastnosť. Odstráňte ju alebo použite iný Type.";
    case "Element":
      return `Prvok Tuple na indexe ${issue.index} nie je platný.`;
  }
};
/** Formats a RecordError in Slovak. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} nie je Record.`;
  if (error.reason.kind === "NotPlainRecord")
    return "Hodnota je objekt, ale výstup typu Record musí byť obyčajný objekt alebo mať prototyp null.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `Kľúč vlastnosti ${safelyStringifyUnknownValue(issue.key)} nie je platný.`;
    case "Value":
      return `Hodnota vlastnosti ${safelyStringifyUnknownValue(issue.key)} nie je platná.`;
    case "Accessor":
      return `Vlastnosť Record ${safelyStringifyUnknownValue(issue.key)} musí byť dátová vlastnosť.`;
    case "NonEnumerable":
      return `Vlastnosť Record ${safelyStringifyUnknownValue(issue.key)} musí byť enumerovateľná.`;
    case "Collision":
      return `Kľúče Record ${safelyStringifyUnknownValue(issue.previousKey)} a ${safelyStringifyUnknownValue(issue.key)} sa dekódujú na rovnaký kľúč ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};
/** Formats a MinEntriesError in Slovak. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mať počet položiek aspoň ${error.min}.`;
/** Formats a MaxEntriesError in Slovak. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} môže mať počet položiek najviac ${error.max}.`;
/** Formats an ObjectError in Slovak. */
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
        return "Vlastnosť Object musí byť dátová vlastnosť. Pred použitím tohto Type materializujte hodnoty prístupových vlastností do obyčajných dát alebo použite iný Type.";
      case "NonEnumerable":
        return "Vlastnosť Object musí byť enumerovateľná. Nastavte ju ako enumerovateľnú alebo použite iný Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `Chýba povinná vlastnosť ${safelyStringifyUnknownValue(key)}.`;
  if (typeof key === "symbol")
    return "Kľúč vlastnosti Object musí byť reťazec. Odstráňte vlastnosť so symbolom alebo použite iný Type.";
  if (propertyError.type === "ObjectExcessProperty")
    return `Vlastnosť ${safelyStringifyUnknownValue(key)} nie je povolená. Odstráňte ju alebo použite iný Type.`;
  return `Vlastnosť ${safelyStringifyUnknownValue(key)} nie je platná.`;
};
/** Formats a DiscriminatedUnionError in Slovak. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Rozlišovacia vlastnosť ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} musí byť dátová vlastnosť.`;
      if (error.reason.reason === "Inherited")
        return `${property} musí byť vlastná vlastnosť.`;
      return `${property} musí byť enumerovateľná.`;
    }
    case "Discriminator":
      return `Rozlišovacia vlastnosť ${safelyStringifyUnknownValue(error.reason.key)} má neočakávanú hodnotu ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Vybraný variant ${safelyStringifyUnknownValue(error.reason.discriminator)} nie je platný.`;
  }
};
/** Formats a DataError in Slovak. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Hodnota ${safelyStringifyUnknownValue(issue.value)} nie je Data.`;
    case "UnexpectedPrototype":
      return `Hodnota typu ${issue.container} v Data má neočakávaný prototyp.`;
    case "Accessor":
      return "Vlastnosť v Data musí byť dátová vlastnosť. Pred použitím tohto Type materializujte hodnoty prístupových vlastností do obyčajných dát alebo použite iný Type.";
    case "NonEnumerable":
      return "Vlastnosť objektu v Data musí byť enumerovateľná. Odstráňte ju alebo použite iný Type.";
    case "SymbolProperty":
      return "Kľúč vlastnosti objektu v Data musí byť reťazec. Odstráňte vlastnosť so symbolom alebo použite iný Type.";
    case "Hole":
      return "Prvok poľa v Data chýba.";
    case "InvalidUint8Array":
      return "Uint8Array v Data musí mať ArrayBuffer, ktorý nie je odpojený, a musí ležať v jeho rozsahu.";
    case "ExcessProperty":
      return `Hodnota typu ${issue.container} v Data nesmie mať nadbytočné vlastné vlastnosti. Odstráňte vlastnosť alebo použite iný Type.`;
  }
};

/** Formats a JsonValueError in Slovak. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Hodnota ${safelyStringifyUnknownValue(issue.value)} nie je hodnota JSON.`;
    case "NonFiniteNumber":
      return "Číslo JSON musí byť konečné.";
    case "UnexpectedPrototype":
      return "Hodnota je objekt, ale objekt JsonValue musí byť obyčajný objekt alebo mať prototyp null.";
    case "Accessor":
      return "Vlastnosť JSON musí byť dátová vlastnosť. Pred použitím tohto Type materializujte hodnoty prístupových vlastností do obyčajných dát alebo použite iný Type.";
    case "NonEnumerable":
      return "Vlastnosť objektu JSON musí byť enumerovateľná. Odstráňte ju alebo použite iný Type.";
    case "SymbolProperty":
      return "Kľúč vlastnosti objektu JSON musí byť reťazec. Odstráňte vlastnosť so symbolom alebo použite iný Type.";
    case "Hole":
      return "V poli JSON chýba prvok.";
    case "ExcessProperty":
      return "Pole JSON obsahuje nepovolenú vlastnosť. Odstráňte ju alebo použite iný Type.";
    case "CircularReference":
      return "JsonValue nesmie obsahovať cyklické referencie.";
  }
};
/** Formats a JsonError in Slovak. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Hodnotu ${safelyStringifyUnknownValue(error.value)} nemožno analyzovať ako JsonValue.`;

/** Formats a ByteSizeLiteralError in Slovak. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je literál veľkosti v bajtoch. Použite napríklad "512KiB" alebo "1MiB".`;

/** Formats a ByteLengthError in Slovak. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Hodnota -0 nie je dĺžka v bajtoch. Použite namiesto nej 0.";

/** Formats a ByteLengthFromStringError in Slovak. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je dĺžka v bajtoch. Použite počet bajtov alebo literál, napríklad 10MiB.`;

/** Formats a DurationLiteralError in Slovak. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je literál trvania. Použite napríklad "500ms" alebo "1.5s".`;

/** Formats a PercentageLiteralError in Slovak. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je percentuálny literál. Použite napríklad "50%" alebo "12.5%".`;
