/**
 * Norwegian Bokmål Evolu Type error formatters.
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
  return `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke av typen ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Verdien ${safelyStringifyUnknownValue(reason.value)} er ikke et objekt.`
    : "Verdien er et objekt, men et Object Output må være et rent objekt eller ha en null-prototype.";

/** Formats a NeverError in Norwegian Bokmål. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke gyldig for typen Never.`;
/** Formats a String TypeOfError in Norwegian Bokmål. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** Formats a TemplateLiteralError in Norwegian Bokmål. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} samsvarer ikke med malliteralen.`;
/** Formats a Number TypeOfError in Norwegian Bokmål. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formats a BigInt TypeOfError in Norwegian Bokmål. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formats a Boolean TypeOfError in Norwegian Bokmål. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formats a Symbol TypeOfError in Norwegian Bokmål. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formats a Function TypeOfError in Norwegian Bokmål. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** Formats an EvoluTypeError in Norwegian Bokmål. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en Evolu Type.`;
/** Formats an ObjectTagError in Norwegian Bokmål. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} har ikke den forventede objekt-taggen ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formats a ValidDateError in Norwegian Bokmål. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date-verdien er ugyldig.";
/** Formats an InstanceOfError in Norwegian Bokmål. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en instans av ${error.constructorName}.`;
/** Formats a LiteralError in Norwegian Bokmål. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke strengt lik den forventede literalverdien: ${String(error.expected)}.`;
/** Formats a UnionError in Norwegian Bokmål. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "En verdi samsvarer ikke med noen av de tillatte variantene.";
/** Formats a DateIsoError in Norwegian Bokmål. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en kanonisk ISO-dato- og tidsstreng.`;
/** Formats a PlainDateIsoError in Norwegian Bokmål. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig kalenderdato i formatet YYYY-MM-DD.`;
/** Formats a DateIsoFromDateError in Norwegian Bokmål. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date kan ikke representeres som DateIso.";
/** Formats a DateIsoFromRfc3339Error in Norwegian Bokmål. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en støttet dato- og tidsstreng i RFC 3339-format. Bruk en verdi som "2024-01-01T12:00:00Z".`;
/** Formats a DecimalStringError in Norwegian Bokmål. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en kanonisk desimalstreng.`;
/** Formats an Int64Error in Norwegian Bokmål. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig 64-bits heltall med fortegn (Int64).`;
/** Formats a UInt64Error in Norwegian Bokmål. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig 64-bits heltall uten fortegn (UInt64).`;
/** Formats an Int64StringError in Norwegian Bokmål. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Int64-streng.`;

/** Formats an IdentifierError in Norwegian Bokmål. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en ${error.casing}-identifikator.`;

/** Formats a CapitalizedError in Norwegian Bokmål. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må begynne med stor bokstav.`;

/** Formats an UncapitalizedError in Norwegian Bokmål. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må ikke begynne med en stor bokstav.`;

/** Formats an UppercasedError in Norwegian Bokmål. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være skrevet med store bokstaver.`;

/** Formats a LowercasedError in Norwegian Bokmål. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være skrevet med små bokstaver.`;
/** Formats a TrimmedError in Norwegian Bokmål. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være trimmet.`;
/** Formats a WellFormedError in Norwegian Bokmål. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være velformet Unicode-tekst.`;
/** Formats a NormalizedError in Norwegian Bokmål. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være i Unicode-normaliseringsformen ${error.form}.`;
/** Formats a StartsWithError in Norwegian Bokmål. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må starte med ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Norwegian Bokmål. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må slutte med ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats a MinLengthError in Norwegian Bokmål. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} oppfyller ikke minimumslengden på ${error.min}.`;
/** Formats a MaxLengthError in Norwegian Bokmål. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} overskrider maksimumslengden på ${error.max}.`;
/** Formats a LengthError in Norwegian Bokmål. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} har ikke den påkrevde lengden ${error.exact}.`;
/** Formats a RegexError in Norwegian Bokmål. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} samsvarer ikke med /${error.source}/${error.flags}.`;
/** Formats a Base64UrlError in Norwegian Bokmål. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Base64Url-streng.`;
/** Formats a Base64Error in Norwegian Bokmål. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Base64-streng.`;
/** Formats a HexError in Norwegian Bokmål. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke heksadesimal med små bokstaver og et like antall sifre.`;
/** Formats a NameError in Norwegian Bokmål. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig Name.`;
/** Formats an EmailError in Norwegian Bokmål. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig e-postadresse.`;
/** Formats a HostnameError in Norwegian Bokmål. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig vertsnavn med små bokstaver.`;
/** Formats an Ipv4AddressError in Norwegian Bokmål. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig IPv4-adresse.`;
/** Formats an Ipv6AddressError in Norwegian Bokmål. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en kanonisk IPv6-adresse.`;
/** Formats an Ipv6AddressFromStringError in Norwegian Bokmål. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig IPv6-adresse.`;
/** Formats a PhoneNumberE164Error in Norwegian Bokmål. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et telefonnummer i E.164-format.`;
/** Formats an IbanError in Norwegian Bokmål. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig IBAN-nummer med store bokstaver uten mellomrom.`;
/** Formats a MnemonicError in Norwegian Bokmål. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig engelsk BIP39-mnemonisk uttrykk.`;
/** Formats an IdError in Norwegian Bokmål. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Id.`;
/** Formats a TableIdError in Norwegian Bokmål. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Id for tabellen ${error.table}.`;
/** Formats a UuidError in Norwegian Bokmål. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en kanonisk UUID med små bokstaver.`;
/** Formats a UuidVersionError in Norwegian Bokmål. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en UUID av versjon ${error.version}.`;
/** Formats a NonNegativeError in Norwegian Bokmål. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være ikke-negativ (>= 0).`;
/** Formats a NonNegativeDecimalStringError in Norwegian Bokmål. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en ikke-negativ desimalstreng.`;
/** Formats a PositiveError in Norwegian Bokmål. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være positiv (> 0).`;
/** Formats a PositiveDecimalStringError in Norwegian Bokmål. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en positiv desimalstreng.`;
/** Formats a NonPositiveError in Norwegian Bokmål. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være ikke-positiv (<= 0).`;
/** Formats a NonPositiveDecimalStringError in Norwegian Bokmål. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en ikke-positiv desimalstreng.`;
/** Formats a NegativeError in Norwegian Bokmål. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være negativ (< 0).`;
/** Formats a NegativeDecimalStringError in Norwegian Bokmål. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en negativ desimalstreng.`;
/** Formats an IntError in Norwegian Bokmål. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være et sikkert heltall.`;
/** Formats a GreaterThanError in Norwegian Bokmål. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være større enn ${error.min}.`;
/** Formats a GreaterThanOrEqualToError in Norwegian Bokmål. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være større enn eller lik ${error.min}.`;
/** Formats a LessThanError in Norwegian Bokmål. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være mindre enn ${error.max}.`;
/** Formats a LessThanOrEqualToError in Norwegian Bokmål. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være mindre enn eller lik ${error.max}.`;
/** Formats a NonNaNError in Norwegian Bokmål. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Verdien må ikke være NaN.";
/** Formats a FiniteError in Norwegian Bokmål. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være endelig.`;
/** Formats a MultipleOfError in Norwegian Bokmål. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være et multiplum av ${error.divisor}.`;
/** Formats a BetweenError in Norwegian Bokmål. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være mellom ${error.min} og ${error.max}, inkludert.`;

/** Formats a BooleanFromStringError in Norwegian Bokmål. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en boolsk verdi. Bruk true eller false.`;

/** Formats an IntFromStringError in Norwegian Bokmål. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et desimalt heltall.`;

/** Formats a FiniteNumberFromStringError in Norwegian Bokmål. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et desimaltall.`;

/** Formats an ArrayError in Norwegian Bokmål. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Verdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke en matrise.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Et matriseelement med indeks ${issue.index} mangler.`;
    case "Accessor":
      return `Et matriseelement med indeks ${issue.index} må være en dataegenskap.`;
    case "ExcessProperty":
      return "En overflødig Array-egenskap er ikke tillatt. Fjern den eller bruk en annen Type.";
    case "Element":
      return `Et matriseelement med indeks ${issue.index} er ugyldig.`;
  }
};

/** Formats a NonEmptyArrayError in Norwegian Bokmål. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må inneholde minst ett element.`;

/** Formats a UniqueError in Norwegian Bokmål. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} har like elementer med indeks ${error.previousIndex} og ${error.index}.`;

/** Formats a SetError in Norwegian Bokmål. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `Verdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke et Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Den overflødige Set-egenskapen ${safelyStringifyUnknownValue(issue.key)} er ikke tillatt.`;
    case "Element":
      return `Et Set-element med indeks ${issue.index} er ugyldig.`;
  }
};

/** Formats a MapError in Norwegian Bokmål. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `Verdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke et Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Den overflødige Map-egenskapen ${safelyStringifyUnknownValue(issue.key)} er ikke tillatt.`;
    case "Key":
      return `En Map-nøkkel med indeks ${issue.index} er ugyldig.`;
    case "Value":
      return `En Map-verdi med indeks ${issue.index} er ugyldig.`;
    case "Collision":
      return `Map-nøklene med indeks ${issue.previousIndex} og ${issue.index} dekoder til samme nøkkel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Norwegian Bokmål. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Verdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke en tuppel.`;
  if (error.reason.kind === "InvalidLength")
    return `En Tuple må ha lengden ${error.reason.expected}, men verdien har lengden ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Et Tuple-element med indeks ${issue.index} mangler.`;
    case "Accessor":
      return `Et Tuple-element med indeks ${issue.index} må være en dataegenskap.`;
    case "ExcessProperty":
      return "En overflødig Tuple-egenskap er ikke tillatt. Fjern den eller bruk en annen Type.";
    case "Element":
      return `Et Tuple-element med indeks ${issue.index} er ugyldig.`;
  }
};

/** Formats a RecordError in Norwegian Bokmål. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `Verdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke en Record.`;
  if (error.reason.kind === "NotPlainRecord")
    return "Verdien er et objekt, men et Record Output må være et rent objekt eller ha en null-prototype.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `Egenskapsnøkkelen ${safelyStringifyUnknownValue(issue.key)} er ugyldig.`;
    case "Value":
      return `Verdien for egenskapen ${safelyStringifyUnknownValue(issue.key)} er ugyldig.`;
    case "Accessor":
      return `Record-egenskapen ${safelyStringifyUnknownValue(issue.key)} må være en dataegenskap.`;
    case "NonEnumerable":
      return `Record-egenskapen ${safelyStringifyUnknownValue(issue.key)} må være oppregnbar.`;
    case "Collision":
      return `Record-nøklene ${safelyStringifyUnknownValue(issue.previousKey)} og ${safelyStringifyUnknownValue(issue.key)} dekoder til samme nøkkel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Norwegian Bokmål. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} oppfyller ikke minimumsantallet oppføringer på ${error.min}.`;

/** Formats a MaxEntriesError in Norwegian Bokmål. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} overskrider maksimumsantallet oppføringer på ${error.max}.`;

/** Formats an ObjectError in Norwegian Bokmål. */
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
        return "En Object-egenskap må være en dataegenskap. Materialiser accessor-verdier som rene data før du bruker denne Typen, eller bruk en annen Type.";
      case "NonEnumerable":
        return "En Object-egenskap må være oppregnbar. Gjør den oppregnbar eller bruk en annen Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `Den påkrevde egenskapen ${safelyStringifyUnknownValue(key)} mangler.`;
  if (typeof key === "symbol")
    return "En Object-egenskapsnøkkel må være en streng. Fjern symbolegenskapen eller bruk en annen Type.";
  if (propertyError.type === "ObjectExcessProperty")
    return `Egenskapen ${safelyStringifyUnknownValue(key)} er ikke tillatt. Fjern den eller bruk en annen Type.`;
  return `Egenskapen ${safelyStringifyUnknownValue(key)} er ugyldig.`;
};

/** Formats a DiscriminatedUnionError in Norwegian Bokmål. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Diskriminatoregenskapen ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} må være en dataegenskap.`;
      if (error.reason.reason === "Inherited")
        return `${property} må være en egen egenskap.`;
      return `${property} må være oppregnbar.`;
    }
    case "Discriminator":
      return `Diskriminatoregenskapen ${safelyStringifyUnknownValue(error.reason.key)} har den uventede verdien ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Den valgte varianten ${safelyStringifyUnknownValue(error.reason.discriminator)} er ugyldig.`;
  }
};

/** Formats a DataError in Norwegian Bokmål. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Verdien ${safelyStringifyUnknownValue(issue.value)} er ikke Data.`;
    case "UnexpectedPrototype":
      return `En Data-verdi av typen ${issue.container} har en uventet prototype.`;
    case "Accessor":
      return "En Data-egenskap må være en dataegenskap. Materialiser accessor-verdier som rene data før du bruker denne Typen, eller bruk en annen Type.";
    case "NonEnumerable":
      return "En Data-Object-egenskap må være oppregnbar. Fjern den eller bruk en annen Type.";
    case "SymbolProperty":
      return "En Data-Object-egenskapsnøkkel må være en streng. Fjern symbolegenskapen eller bruk en annen Type.";
    case "Hole":
      return "Et Data-Array-element mangler.";
    case "InvalidUint8Array":
      return "En Data-verdi av typen Uint8Array må ligge helt innenfor en ArrayBuffer som ikke er frakoblet.";
    case "ExcessProperty":
      return `En Data-verdi av typen ${issue.container} må ikke ha overflødige egne egenskaper. Fjern egenskapen eller bruk en annen Type.`;
  }
};

/** Formats a JsonValueError in Norwegian Bokmål. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Verdien ${safelyStringifyUnknownValue(issue.value)} er ikke en JSON-verdi.`;
    case "NonFiniteNumber":
      return "Et JSON-tall må være endelig.";
    case "UnexpectedPrototype":
      return "Verdien er et objekt, men et JsonValue-objekt må være et rent objekt eller ha en null-prototype.";
    case "Accessor":
      return "En JSON-egenskap må være en dataegenskap. Materialiser accessor-verdier som rene data før du bruker denne Typen, eller bruk en annen Type.";
    case "NonEnumerable":
      return "En JSON-objektegenskap må være oppregnbar. Fjern den eller bruk en annen Type.";
    case "SymbolProperty":
      return "En JSON-objektegenskapsnøkkel må være en streng. Fjern symbolegenskapen eller bruk en annen Type.";
    case "Hole":
      return "Et JSON-matriseelement mangler.";
    case "ExcessProperty":
      return "En overflødig JSON-matriseegenskap er ikke tillatt. Fjern den eller bruk en annen Type.";
    case "CircularReference":
      return "En JsonValue må ikke inneholde sirkulære referanser.";
  }
};

/** Formats a JsonError in Norwegian Bokmål. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} kan ikke tolkes som en JsonValue.`;

/** Formats a ByteSizeLiteralError in Norwegian Bokmål. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en literal for en størrelse i byte. Bruk en verdi som "512KiB" eller "1MiB".`;

/** Formats a ByteLengthError in Norwegian Bokmål. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Verdien -0 er ikke en lengde i byte. Bruk 0 i stedet.";

/** Formats a ByteLengthFromStringError in Norwegian Bokmål. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en lengde i byte. Bruk et antall byte eller en literal som 10MiB.`;

/** Formats a DurationLiteralError in Norwegian Bokmål. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en varighetsliteral. Bruk en verdi som "500ms" eller "1.5s".`;

/** Formats a PercentageLiteralError in Norwegian Bokmål. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en prosentliteral. Bruk en verdi som "50%" eller "12.5%".`;
