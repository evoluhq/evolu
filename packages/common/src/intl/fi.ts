/**
 * Finnish Evolu Type error formatters.
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

  return `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole tyyppiä ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Arvo ${safelyStringifyUnknownValue(reason.value)} ei ole objekti.`
    : "Arvo on objekti, mutta Object Outputin on oltava tavallinen objekti tai sillä on oltava null-prototyyppi.";

/** Formats a NeverError in Finnish. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei kelpaa Never-tyypille.`;

/** Formats a String TypeOfError in Finnish. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Finnish. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei vastaa template literal -mallia.`;

/** Formats a Number TypeOfError in Finnish. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Finnish. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Finnish. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Finnish. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole totuusarvo. Käytä arvoa true tai false.`;

/** Formats a Symbol TypeOfError in Finnish. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Finnish. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Finnish. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole Evolu Type.`;

/** Formats an ObjectTagError in Finnish. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Arvolla ${safelyStringifyUnknownValue(error.value)} ei ole odotettua objektitunnistetta ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Finnish. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date-arvo on virheellinen.";

/** Formats an InstanceOfError in Finnish. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole luokan ${error.constructorName} instanssi.`;

/** Formats a LiteralError in Finnish. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole täsmälleen sama kuin odotettu literaali: ${String(error.expected)}.`;

/** Formats a UnionError in Finnish. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Arvo ei vastaa mitään sallittua varianttia.";

/** Formats a DateIsoError in Finnish. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kanoninen ISO-päivämäärä- ja aikamerkkijono.`;

/** Formats a PlainDateIsoError in Finnish. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen kalenteripäivämäärä muodossa YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Finnish. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-arvoa ei voida esittää DateIso-muodossa.";

/** Formats a DateIsoFromRfc3339Error in Finnish. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole tuettu RFC 3339 -muotoinen päivämäärä- ja aikamerkkijono. Käytä esimerkiksi arvoa "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Finnish. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava kanoninen desimaalimerkkijono.`;

/** Formats an Int64Error in Finnish. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen etumerkillinen 64-bittinen kokonaisluku (Int64).`;

/** Formats a UInt64Error in Finnish. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen etumerkitön 64-bittinen kokonaisluku (UInt64).`;

/** Formats an Int64StringError in Finnish. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Int64-merkkijono.`;

/** Formats an IdentifierError in Finnish. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole ${error.casing}-tunniste.`;

/** Formats a CapitalizedError in Finnish. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on alettava isolla kirjaimella.`;

/** Formats an UncapitalizedError in Finnish. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei saa alkaa isolla kirjaimella.`;

/** Formats an UppercasedError in Finnish. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava isoilla kirjaimilla.`;

/** Formats a LowercasedError in Finnish. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava pienillä kirjaimilla.`;

/** Formats a TrimmedError in Finnish. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} alussa tai lopussa ei saa olla tyhjiä merkkejä.`;

/** Formats a WellFormedError in Finnish. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava hyvin muodostettua Unicode-tekstiä.`;

/** Formats a NormalizedError in Finnish. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava Unicode-normalisointimuodossa ${error.form}.`;

/** Formats a StartsWithError in Finnish. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on alettava merkkijonolla ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Finnish. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on päätyttävä merkkijonoon ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats a MinLengthError in Finnish. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei täytä vähimmäispituutta ${error.min}.`;

/** Formats a MaxLengthError in Finnish. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ylittää enimmäispituuden ${error.max}.`;

/** Formats a LengthError in Finnish. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} pituuden on oltava täsmälleen ${error.exact}.`;

/** Formats a RegexError in Finnish. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei vastaa säännöllistä lauseketta /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Finnish. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Base64Url-merkkijono.`;

/** Formats a Base64Error in Finnish. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Base64-merkkijono.`;

/** Formats a HexError in Finnish. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole pienillä kirjaimilla kirjoitettu heksadesimaalimerkkijono, jossa on parillinen määrä numeroita.`;

/** Formats a NameError in Finnish. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Name.`;

/** Formats an EmailError in Finnish. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen sähköpostiosoite.`;

/** Formats a HostnameError in Finnish. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen pienillä kirjaimilla kirjoitettu isäntänimi.`;

/** Formats an Ipv4AddressError in Finnish. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen IPv4-osoite.`;

/** Formats an Ipv6AddressError in Finnish. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kanoninen IPv6-osoite.`;

/** Formats an Ipv6AddressFromStringError in Finnish. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen IPv6-osoite.`;

/** Formats a PhoneNumberE164Error in Finnish. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole E.164-muotoinen puhelinnumero.`;

/** Formats an IbanError in Finnish. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen IBAN-tilinumero isoilla kirjaimilla ilman välilyöntejä.`;

/** Formats a SimplePasswordError in Finnish. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Salasanan alussa tai lopussa ei saa olla tyhjiä merkkejä.";
    case "TooLong":
      return "Salasana ylittää enimmäispituuden 64.";
    case "TooShort":
      return "Salasana ei täytä vähimmäispituutta 8.";
  }
};

/** Formats a MnemonicError in Finnish. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Arvo ei ole kelvollinen englanninkielinen BIP39-muistisanasarja.";

/** Formats an IdError in Finnish. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Id.`;

/** Formats a TableIdError in Finnish. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Id taululle ${error.table}.`;

/** Formats a UuidError in Finnish. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kanoninen pienillä kirjaimilla kirjoitettu UUID.`;

/** Formats a UuidVersionError in Finnish. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole version ${error.version} UUID.`;

/** Formats a NonNegativeError in Finnish. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava epänegatiivinen (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Finnish. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava epänegatiivinen desimaalimerkkijono.`;

/** Formats a PositiveError in Finnish. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava positiivinen (> 0).`;

/** Formats a PositiveDecimalStringError in Finnish. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava positiivinen desimaalimerkkijono.`;

/** Formats a NonPositiveError in Finnish. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava ei-positiivinen (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Finnish. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava ei-positiivinen desimaalimerkkijono.`;

/** Formats a NegativeError in Finnish. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava negatiivinen (< 0).`;

/** Formats a NegativeDecimalStringError in Finnish. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava negatiivinen desimaalimerkkijono.`;

/** Formats an IntError in Finnish. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava turvallinen kokonaisluku.`;

/** Formats an IntFromStringError in Finnish. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole desimaalimuotoinen kokonaisluku.`;

/** Formats a FiniteNumberFromStringError in Finnish. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole desimaalimuotoinen luku.`;

/** Formats a GreaterThanError in Finnish. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava suurempi kuin ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Finnish. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava suurempi tai yhtä suuri kuin ${error.min}.`;

/** Formats a LessThanError in Finnish. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava pienempi kuin ${error.max}.`;

/** Formats a LessThanOrEqualToError in Finnish. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava pienempi tai yhtä suuri kuin ${error.max}.`;

/** Formats a NonNaNError in Finnish. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Arvo ei saa olla NaN.";

/** Formats a FiniteError in Finnish. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava äärellinen.`;

/** Formats a MultipleOfError in Finnish. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava luvun ${error.divisor} monikerta.`;

/** Formats a BetweenError in Finnish. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava vähintään ${error.min} ja enintään ${error.max}.`;

/** Formats an ArrayError in Finnish. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole taulukko.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Taulukon indeksistä ${issue.index} puuttuu alkio.`;
    case "Accessor":
      return `Taulukon indeksissä ${issue.index} olevan alkion on oltava dataominaisuus.`;
    case "ExcessProperty":
      return "Ylimääräinen Array-ominaisuus ei ole sallittu. Poista se tai käytä toista Typeä.";
    case "Element":
      return `Taulukon indeksissä ${issue.index} oleva alkio on virheellinen.`;
  }
};

/** Formats a NonEmptyArrayError in Finnish. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Arvossa ${safelyStringifyUnknownValue(error.value)} on oltava vähintään yksi alkio.`;

/** Formats a UniqueError in Finnish. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Arvossa ${safelyStringifyUnknownValue(error.value)} on samanarvoiset alkiot indekseissä ${error.previousIndex} ja ${error.index}.`;

/** Formats a SetError in Finnish. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Ylimääräinen Set-ominaisuus ${safelyStringifyUnknownValue(issue.key)} ei ole sallittu.`;
    case "Element":
      return `Setin indeksissä ${issue.index} oleva alkio on virheellinen.`;
  }
};

/** Formats a MapError in Finnish. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Ylimääräinen Map-ominaisuus ${safelyStringifyUnknownValue(issue.key)} ei ole sallittu.`;
    case "Key":
      return `Mapin indeksissä ${issue.index} oleva avain on virheellinen.`;
    case "Value":
      return `Mapin indeksissä ${issue.index} oleva arvo on virheellinen.`;
    case "Collision":
      return `Mapin indekseissä ${issue.previousIndex} ja ${issue.index} olevat avaimet dekoodautuvat samaksi avaimeksi ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Finnish. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuplen pituuden on oltava ${error.reason.expected}, mutta arvon pituus on ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Tuplen indeksistä ${issue.index} puuttuu alkio.`;
    case "Accessor":
      return `Tuplen indeksissä ${issue.index} olevan alkion on oltava dataominaisuus.`;
    case "ExcessProperty":
      return "Ylimääräinen Tuple-ominaisuus ei ole sallittu. Poista se tai käytä toista Typeä.";
    case "Element":
      return `Tuplen indeksissä ${issue.index} oleva alkio on virheellinen.`;
  }
};

/** Formats a RecordError in Finnish. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Arvo on objekti, mutta Record Outputin on oltava tavallinen objekti tai sillä on oltava null-prototyyppi.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Ominaisuusavain ${safelyStringifyUnknownValue(issue.key)} on virheellinen.`;
    case "Value":
      return `Ominaisuuden ${safelyStringifyUnknownValue(issue.key)} arvo on virheellinen.`;
    case "Accessor":
      return `Record-ominaisuuden ${safelyStringifyUnknownValue(issue.key)} on oltava dataominaisuus.`;
    case "NonEnumerable":
      return `Record-ominaisuuden ${safelyStringifyUnknownValue(issue.key)} on oltava lueteltava.`;
    case "Collision":
      return `Record-avaimet ${safelyStringifyUnknownValue(issue.previousKey)} ja ${safelyStringifyUnknownValue(issue.key)} dekoodautuvat samaksi avaimeksi ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Finnish. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei täytä merkintöjen vähimmäismäärää ${error.min}.`;

/** Formats a MaxEntriesError in Finnish. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ylittää merkintöjen enimmäismäärän ${error.max}.`;

/** Formats an ObjectError in Finnish. */
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
        return "Object-ominaisuuden on oltava dataominaisuus. Muunna accessor-arvot tavalliseksi dataksi ennen tämän Typen käyttöä tai käytä toista Typeä.";
      case "NonEnumerable":
        return "Object-ominaisuuden on oltava lueteltava. Tee siitä lueteltava tai käytä toista Typeä.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Pakollinen ominaisuus ${safelyStringifyUnknownValue(key)} puuttuu.`;
  }
  if (typeof key === "symbol") {
    return "Object-ominaisuuden avaimen on oltava merkkijono. Poista symboliominaisuus tai käytä toista Typeä.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Ominaisuus ${safelyStringifyUnknownValue(key)} ei ole sallittu. Poista se tai käytä toista Typeä.`;
  }
  return `Ominaisuus ${safelyStringifyUnknownValue(key)} on virheellinen.`;
};

/** Formats a DiscriminatedUnionError in Finnish. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Diskriminaattoriominaisuuden ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} on oltava dataominaisuus.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} on oltava objektin oma ominaisuus.`;
      }
      return `${property} on oltava lueteltava.`;
    }
    case "Discriminator":
      return `Diskriminaattoriominaisuudella ${safelyStringifyUnknownValue(error.reason.key)} on odottamaton arvo ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Valittu variantti ${safelyStringifyUnknownValue(error.reason.discriminator)} on virheellinen.`;
  }
};

/** Formats a DataError in Finnish. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Arvo ${safelyStringifyUnknownValue(issue.value)} ei ole Data.`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} -arvolla on odottamaton prototyyppi.`;
    case "Accessor":
      return "Data-ominaisuuden on oltava dataominaisuus. Muunna accessor-arvot tavalliseksi dataksi ennen tämän Typen käyttöä tai käytä toista Typeä.";
    case "NonEnumerable":
      return "Data Object -ominaisuuden on oltava lueteltava. Poista se tai käytä toista Typeä.";
    case "SymbolProperty":
      return "Data Object -ominaisuuden avaimen on oltava merkkijono. Poista symboliominaisuus tai käytä toista Typeä.";
    case "Hole":
      return "Data Array -alkio puuttuu.";
    case "InvalidUint8Array":
      return "Data Uint8Array -arvon ArrayBuffer ei saa olla irrotettu, ja arvon on oltava kokonaan sen rajojen sisällä.";
    case "ExcessProperty":
      return `Data ${issue.container} -arvolla ei saa olla ylimääräisiä omia ominaisuuksia. Poista ominaisuus tai käytä toista Typeä.`;
  }
};

/** Formats a JsonValueError in Finnish. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Arvo ${safelyStringifyUnknownValue(issue.value)} ei ole JSON-arvo.`;
    case "NonFiniteNumber":
      return "JSON-luvun on oltava äärellinen.";
    case "UnexpectedPrototype":
      return "Arvo on objekti, mutta JsonValue-objektin on oltava tavallinen objekti tai sillä on oltava null-prototyyppi.";
    case "Accessor":
      return "JSON-ominaisuuden on oltava dataominaisuus. Muunna accessor-arvot tavalliseksi dataksi ennen tämän Typen käyttöä tai käytä toista Typeä.";
    case "NonEnumerable":
      return "JSON-objektin ominaisuuden on oltava lueteltava. Poista se tai käytä toista Typeä.";
    case "SymbolProperty":
      return "JSON-objektin ominaisuusavaimen on oltava merkkijono. Poista symboliominaisuus tai käytä toista Typeä.";
    case "Hole":
      return "JSON-taulukosta puuttuu alkio.";
    case "ExcessProperty":
      return "Ylimääräinen JSON-taulukon ominaisuus ei ole sallittu. Poista se tai käytä toista Typeä.";
    case "CircularReference":
      return "JsonValue ei saa sisältää syklisiä viittauksia.";
  }
};

/** Formats a JsonError in Finnish. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Arvoa ${safelyStringifyUnknownValue(error.value)} ei voida jäsentää JsonValue-arvoksi.`;

/** Formats a ByteSizeLiteralError in Finnish. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole tavukokoliteraali. Käytä esimerkiksi arvoa "512KiB" tai "1MiB".`;

/** Formats a ByteLengthError in Finnish. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Arvo -0 ei ole tavupituus. Käytä sen sijaan arvoa 0.";

/** Formats a ByteLengthFromStringError in Finnish. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole tavupituus. Käytä tavujen lukumäärää tai literaalia, kuten 10MiB.`;

/** Formats a DurationLiteralError in Finnish. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kestoliteraali. Käytä esimerkiksi arvoa "500ms" tai "1.5s".`;

/** Formats a PercentageLiteralError in Finnish. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole prosenttiliteraali. Käytä esimerkiksi arvoa "50%" tai "12.5%".`;
