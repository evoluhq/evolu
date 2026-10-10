/**
 * Danish Evolu Type error formatters.
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

  return `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke af typen ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Værdien ${safelyStringifyUnknownValue(reason.value)} er ikke et objekt.`
    : "Værdien er et objekt, men et Object Output skal være et almindeligt objekt eller have en null-prototype.";

/** Formats a NeverError in Danish. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke gyldig for typen Never.`;

/** Formats a String TypeOfError in Danish. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Danish. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} matcher ikke skabelonliteralen.`;

/** Formats a Number TypeOfError in Danish. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Danish. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Danish. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Danish. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en boolesk værdi. Brug true eller false.`;

/** Formats a Symbol TypeOfError in Danish. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Danish. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Danish. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en Evolu Type.`;

/** Formats an ObjectTagError in Danish. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} har ikke det forventede objekt-tag ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Danish. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date-værdien er ugyldig.";

/** Formats an InstanceOfError in Danish. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en instans af ${error.constructorName}.`;

/** Formats a LiteralError in Danish. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke strengt lig med den forventede literalværdi: ${String(error.expected)}.`;

/** Formats a UnionError in Danish. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Værdien matcher ingen af de tilladte varianter.";

/** Formats a DateIsoError in Danish. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en kanonisk ISO-dato- og tidsstreng.`;

/** Formats a PlainDateIsoError in Danish. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig kalenderdato i formatet YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Danish. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-værdien kan ikke repræsenteres som DateIso.";

/** Formats a DateIsoFromRfc3339Error in Danish. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en understøttet dato- og tidsstreng i RFC 3339-format. Brug en værdi som "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Danish. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en kanonisk decimalstreng.`;

/** Formats an Int64Error in Danish. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt 64-bit heltal med fortegn (Int64).`;

/** Formats a UInt64Error in Danish. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt 64-bit heltal uden fortegn (UInt64).`;

/** Formats an Int64StringError in Danish. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Int64-streng.`;

/** Formats an IdentifierError in Danish. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en ${error.casing}-identifikator.`;

/** Formats a CapitalizedError in Danish. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal begynde med stort bogstav.`;

/** Formats an UncapitalizedError in Danish. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} må ikke begynde med et stort bogstav.`;

/** Formats an UppercasedError in Danish. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være skrevet med store bogstaver.`;

/** Formats a LowercasedError in Danish. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være skrevet med små bogstaver.`;

/** Formats a TrimmedError in Danish. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være trimmet.`;

/** Formats a WellFormedError in Danish. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være velformet Unicode-tekst.`;

/** Formats a NormalizedError in Danish. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være i Unicode-normaliseringsformen ${error.form}.`;

/** Formats a StartsWithError in Danish. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal starte med ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Danish. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal slutte med ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Danish. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal indeholde ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Danish. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} må ikke indeholde ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Danish. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} opfylder ikke minimumslængden på ${error.min}.`;

/** Formats a MaxLengthError in Danish. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} overskrider maksimumslængden på ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Danish. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} overskrider maksimumslængden i UTF-8-bytes på ${error.max}.`;

/** Formats a LengthError in Danish. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} har ikke den krævede længde på ${error.exact}.`;

/** Formats a RegexError in Danish. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} matcher ikke /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Danish. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Base64Url-streng.`;

/** Formats a Base64Error in Danish. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Base64-streng.`;

/** Formats a HexError in Danish. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke hexadecimal med små bogstaver og et lige antal cifre.`;

/** Formats a HexColorError in Danish. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en farve i formatet #rrggbb med små bogstaver.`;

/** Formats a NameError in Danish. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt Name.`;

/** Formats an EmailError in Danish. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig e-mailadresse.`;

/** Formats a HostnameError in Danish. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt værtsnavn med små bogstaver.`;

/** Formats an Ipv4AddressError in Danish. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig IPv4-adresse.`;

/** Formats an Ipv6AddressError in Danish. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en kanonisk IPv6-adresse.`;

/** Formats an Ipv6AddressFromStringError in Danish. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig IPv6-adresse.`;

/** Formats an IpAddressError in Danish. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig IPv4-adresse eller en kanonisk IPv6-adresse.`;

/** Formats an IpAddressFromStringError in Danish. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig IP-adresse.`;

/** Formats a PhoneNumberE164Error in Danish. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et telefonnummer i E.164-format.`;

/** Formats an IbanError in Danish. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt IBAN-nummer med store bogstaver uden mellemrum.`;

/** Formats an IsbnError in Danish. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt 13-cifret ISBN-nummer uden bindestreger.`;

/** Formats a SimplePasswordError in Danish. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Adgangskoden skal være trimmet.";
    case "TooLong":
      return "Adgangskoden overskrider maksimumslængden på 64.";
    case "TooShort":
      return "Adgangskoden opfylder ikke minimumslængden på 8.";
  }
};

/** Formats a MnemonicError in Danish. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Værdien er ikke en gyldig engelsk BIP39-mnemonic.";

/** Formats an IdError in Danish. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt Id.`;

/** Formats a TableIdError in Danish. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt Id for tabellen ${error.table}.`;

/** Formats a UuidError in Danish. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et kanonisk UUID med små bogstaver.`;

/** Formats a UuidVersionError in Danish. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et UUID af version ${error.version}.`;

/** Formats a UlidError in Danish. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et kanonisk ULID med store bogstaver.`;

/** Formats a NonNegativeError in Danish. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være ikke-negativ (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Danish. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en ikke-negativ decimalstreng.`;

/** Formats a PositiveError in Danish. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være positiv (> 0).`;

/** Formats a PositiveDecimalStringError in Danish. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en positiv decimalstreng.`;

/** Formats a NonPositiveError in Danish. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være ikke-positiv (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Danish. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en ikke-positiv decimalstreng.`;

/** Formats a NegativeError in Danish. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være negativ (< 0).`;

/** Formats a NegativeDecimalStringError in Danish. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en negativ decimalstreng.`;

/** Formats an IntError in Danish. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være et sikkert heltal.`;

/** Formats an IntFromStringError in Danish. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et decimalt heltal.`;

/** Formats a FiniteNumberFromStringError in Danish. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et decimaltal.`;

/** Formats a GreaterThanError in Danish. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være større end ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Danish. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være større end eller lig med ${error.min}.`;

/** Formats a LessThanError in Danish. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mindre end ${error.max}.`;

/** Formats a LessThanOrEqualToError in Danish. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mindre end eller lig med ${error.max}.`;

/** Formats a NonNaNError in Danish. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Værdien må ikke være NaN.";

/** Formats a FiniteError in Danish. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være endelig.`;

/** Formats a MultipleOfError in Danish. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være et multiplum af ${error.divisor}.`;

/** Formats a BetweenError in Danish. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mellem ${error.min} og ${error.max}, inklusive.`;

/** Formats a GreaterThanBigIntError in Danish. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være større end ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Danish. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være større end eller lig med ${error.min}.`;

/** Formats a LessThanBigIntError in Danish. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mindre end ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Danish. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mindre end eller lig med ${error.max}.`;

/** Formats a BetweenBigIntError in Danish. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mellem ${error.min} og ${error.max}, inklusive.`;

/** Formats an ArrayError in Danish. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Værdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke et array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Et array-element på indeks ${issue.index} mangler.`;
    case "Accessor":
      return `Et array-element på indeks ${issue.index} skal være en dataegenskab.`;
    case "ExcessProperty":
      return "En ekstra Array-egenskab er ikke tilladt. Fjern den, eller brug en anden Type.";
    case "Element":
      return `Et array-element på indeks ${issue.index} er ugyldigt.`;
  }
};

/** Formats a NonEmptyArrayError in Danish. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal indeholde mindst ét element.`;

/** Formats a UniqueError in Danish. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} har ens elementer på indeks ${error.previousIndex} og ${error.index}.`;

/** Formats a SetError in Danish. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Værdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke et Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Den ekstra Set-egenskab ${safelyStringifyUnknownValue(issue.key)} er ikke tilladt.`;
    case "Element":
      return `Et Set-element på indeks ${issue.index} er ugyldigt.`;
  }
};

/** Formats a MapError in Danish. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Værdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke et Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Den ekstra Map-egenskab ${safelyStringifyUnknownValue(issue.key)} er ikke tilladt.`;
    case "Key":
      return `En Map-nøgle på indeks ${issue.index} er ugyldig.`;
    case "Value":
      return `En Map-værdi på indeks ${issue.index} er ugyldig.`;
    case "Collision":
      return `Map-nøglerne på indeks ${issue.previousIndex} og ${issue.index} afkodes til den samme nøgle ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Danish. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Størrelsen ${error.value.size} opfylder ikke minimumsstørrelsen på ${error.min}.`;

/** Formats a MaxSizeError in Danish. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Størrelsen ${error.value.size} overskrider maksimumsstørrelsen på ${error.max}.`;

/** Formats a TupleError in Danish. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Værdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke en tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `En Tuple skal have en længde på ${error.reason.expected}, men værdien har en længde på ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Et Tuple-element på indeks ${issue.index} mangler.`;
    case "Accessor":
      return `Et Tuple-element på indeks ${issue.index} skal være en dataegenskab.`;
    case "ExcessProperty":
      return "En ekstra Tuple-egenskab er ikke tilladt. Fjern den, eller brug en anden Type.";
    case "Element":
      return `Et Tuple-element på indeks ${issue.index} er ugyldigt.`;
  }
};

/** Formats a RecordError in Danish. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Værdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke en Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Værdien er et objekt, men et Record Output skal være et almindeligt objekt eller have en null-prototype.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Egenskabsnøglen ${safelyStringifyUnknownValue(issue.key)} er ugyldig.`;
    case "Value":
      return `Værdien af egenskaben ${safelyStringifyUnknownValue(issue.key)} er ugyldig.`;
    case "Accessor":
      return `Record-egenskaben ${safelyStringifyUnknownValue(issue.key)} skal være en dataegenskab.`;
    case "NonEnumerable":
      return `Record-egenskaben ${safelyStringifyUnknownValue(issue.key)} skal være enumererbar.`;
    case "Collision":
      return `Record-nøglerne ${safelyStringifyUnknownValue(issue.previousKey)} og ${safelyStringifyUnknownValue(issue.key)} afkodes til den samme nøgle ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Danish. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} opfylder ikke minimumsantallet af poster på ${error.min}.`;

/** Formats a MaxEntriesError in Danish. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} overskrider maksimumsantallet af poster på ${error.max}.`;

/** Formats an ObjectError in Danish. */
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
        return "En Object-egenskab skal være en dataegenskab. Materialiser accessor-værdier som almindelige data, før denne Type bruges, eller brug en anden Type.";
      case "NonEnumerable":
        return "En Object-egenskab skal være enumererbar. Gør den enumererbar, eller brug en anden Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Den påkrævede egenskab ${safelyStringifyUnknownValue(key)} mangler.`;
  }
  if (typeof key === "symbol") {
    return "En Object-egenskabsnøgle skal være en streng. Fjern symbol-egenskaben, eller brug en anden Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Egenskaben ${safelyStringifyUnknownValue(key)} er ikke tilladt. Fjern den, eller brug en anden Type.`;
  }
  return `Egenskaben ${safelyStringifyUnknownValue(key)} er ugyldig.`;
};

/** Formats a DiscriminatedUnionError in Danish. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Diskriminatoregenskaben ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} skal være en dataegenskab.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} skal være en egen egenskab.`;
      }
      return `${property} skal være enumererbar.`;
    }
    case "Discriminator":
      return `Diskriminatoregenskaben ${safelyStringifyUnknownValue(error.reason.key)} har den uventede værdi ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Den valgte variant ${safelyStringifyUnknownValue(error.reason.discriminator)} er ugyldig.`;
  }
};

/** Formats a DataError in Danish. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Værdien ${safelyStringifyUnknownValue(issue.value)} er ikke Data.`;
    case "UnexpectedPrototype":
      return `Et Data-${issue.container} har en uventet prototype.`;
    case "Accessor":
      return "En Data-egenskab skal være en dataegenskab. Materialiser accessor-værdier som almindelige data, før denne Type bruges, eller brug en anden Type.";
    case "NonEnumerable":
      return "En Data-Object-egenskab skal være enumererbar. Fjern den, eller brug en anden Type.";
    case "SymbolProperty":
      return "En Data-Object-egenskabsnøgle skal være en streng. Fjern symbol-egenskaben, eller brug en anden Type.";
    case "Hole":
      return "Et Data-Array-element mangler.";
    case "InvalidUint8Array":
      return "Et Data-Uint8Array skal have en ikke-frakoblet ArrayBuffer og ligge inden for dens grænser.";
    case "ExcessProperty":
      return `Et Data-${issue.container} må ikke have ekstra egne egenskaber. Fjern egenskaben, eller brug en anden Type.`;
  }
};

/** Formats a JsonValueError in Danish. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Værdien ${safelyStringifyUnknownValue(issue.value)} er ikke en JSON-værdi.`;
    case "NonFiniteNumber":
      return "Et JSON-tal skal være endeligt.";
    case "UnexpectedPrototype":
      return "Værdien er et objekt, men et JsonValue-objekt skal være et almindeligt objekt eller have en null-prototype.";
    case "Accessor":
      return "En JSON-egenskab skal være en dataegenskab. Materialiser accessor-værdier som almindelige data, før denne Type bruges, eller brug en anden Type.";
    case "NonEnumerable":
      return "En JSON-objektegenskab skal være enumererbar. Fjern den, eller brug en anden Type.";
    case "SymbolProperty":
      return "En JSON-objektegenskabsnøgle skal være en streng. Fjern symbol-egenskaben, eller brug en anden Type.";
    case "Hole":
      return "Et JSON-array-element mangler.";
    case "ExcessProperty":
      return "En ekstra JSON-array-egenskab er ikke tilladt. Fjern den, eller brug en anden Type.";
    case "CircularReference":
      return "En JsonValue må ikke indeholde cirkulære referencer.";
  }
};

/** Formats a JsonError in Danish. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} kan ikke parses til en JsonValue.`;

/** Formats a ByteSizeLiteralError in Danish. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en literal for en størrelse i bytes. Brug en værdi som "512KiB" eller "1MiB".`;

/** Formats a ByteLengthError in Danish. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Værdien -0 er ikke en længde i bytes. Brug 0 i stedet.";

/** Formats a ByteLengthFromStringError in Danish. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en længde i bytes. Brug et antal bytes eller en literal som 10MiB.`;

/** Formats a DurationLiteralError in Danish. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en varighedsliteral. Brug en værdi som "500ms" eller "1.5s".`;

/** Formats a PercentageLiteralError in Danish. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en procentliteral. Brug en værdi som "50%" eller "12.5%".`;
