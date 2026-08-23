/**
 * Norske Bokmål-feilformaterere for Evolu Type.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
  Base64UrlError,
  BetweenError,
  CapitalizedError,
  DateIsoError,
  DateIsoFromDateError,
  DecimalStringError,
  DiscriminatedUnionError,
  EvoluTypeError,
  FiniteError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IdError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxLengthError,
  MinLengthError,
  MnemonicError,
  MultipleOfError,
  NegativeDecimalStringError,
  NegativeError,
  NameError,
  NeverError,
  NonNaNError,
  NonNegativeDecimalStringError,
  NonNegativeError,
  NonPositiveDecimalStringError,
  NonPositiveError,
  ObjectError,
  ObjectNotObjectError,
  ObjectPropertyAccessError,
  ObjectTagError,
  ObjectUnexpectedPrototypeError,
  PositiveDecimalStringError,
  PositiveError,
  RecordError,
  RegexError,
  SetError,
  TableIdError,
  TemplateLiteralError,
  TrimmedError,
  TupleElementsError,
  TupleError,
  TypeError,
  TypeErrorFormatter,
  TypeOfError,
  UInt64Error,
  UnionError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();
  return `En verdi ${safelyStringifyUnknownValue(error.value)} er ikke en ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `En verdi ${safelyStringifyUnknownValue(reason.value)} er ikke et objekt.`
    : "Verdien er et objekt, men et Object Output må være et rent objekt eller ha en null-prototype.";

/** Formaterer NeverError på norsk bokmål. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `En verdi ${safelyStringifyUnknownValue(error.value)} er ikke gyldig for typen Never.`;
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} samsvarer ikke med templateteksten.`;
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `En verdi ${safelyStringifyUnknownValue(error.value)} er ikke en Evolu Type.`;
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} har ikke den forventede objekt-taggen ${safelyStringifyUnknownValue(error.expected)}.`;
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `En verdi ${safelyStringifyUnknownValue(error.value)} er ikke en instans av ${error.constructorName}.`;
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke strengt lik den forventede literalverdien: ${globalThis.String(error.expected)}.`;
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "En verdi samsvarer ikke med noen av de tillatte variantene.";
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en kanonisk ISO-dato- og tidsstreng.`;
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date kan ikke representeres som DateIso.";
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en kanonisk desimalstreng.`;
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig 64-bits heltall med fortegn (Int64).`;
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig 64-bits heltall uten fortegn (UInt64).`;
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Int64-streng.`;
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må begynne med stor bokstav.`;
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være trimmet.`;
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} oppfyller ikke minimumslengden på ${error.min}.`;
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} overskrider maksimumslengden på ${error.max}.`;
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} har ikke den påkrevde lengden ${error.exact}.`;
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} samsvarer ikke med /${error.source}/${error.flags}.`;
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Base64Url-streng.`;
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig Name.`;
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldig engelsk BIP39-mnemonisk uttrykk.`;
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Id.`;
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Id for tabellen ${error.table}.`;
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være ikke-negativ (>= 0).`;
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en ikke-negativ desimalstreng.`;
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være positiv (> 0).`;
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en positiv desimalstreng.`;
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være ikke-positiv (<= 0).`;
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en ikke-positiv desimalstreng.`;
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være negativ (< 0).`;
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være en negativ desimalstreng.`;
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være et sikkert heltall.`;
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være større enn ${error.min}.`;
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være større enn eller lik ${error.min}.`;
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være mindre enn ${error.max}.`;
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være mindre enn eller lik ${error.max}.`;
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Verdien må ikke være NaN.";
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være endelig.`;
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være et multiplum av ${error.divisor}.`;
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} må være mellom ${error.min} og ${error.max}, inkludert.`;

export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `En verdi ${safelyStringifyUnknownValue(error.reason.value)} er ikke en matrise.`;
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

export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `En verdi ${safelyStringifyUnknownValue(error.reason.value)} er ikke et Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `En overflødig Set-egenskap ${safelyStringifyUnknownValue(issue.key)} er ikke tillatt.`;
    case "Element":
      return `Et Set-element med indeks ${issue.index} er ugyldig.`;
  }
};

export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `En verdi ${safelyStringifyUnknownValue(error.reason.value)} er ikke et Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `En overflødig Map-egenskap ${safelyStringifyUnknownValue(issue.key)} er ikke tillatt.`;
    case "Key":
    case "Value":
      return `Et Map-element med indeks ${issue.index} er ugyldig.`;
    case "Collision":
      return `Map-nøklene ${safelyStringifyUnknownValue(issue.previousKey)} og ${safelyStringifyUnknownValue(issue.key)} dekoder til samme nøkkel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `En verdi ${safelyStringifyUnknownValue(error.reason.value)} er ikke en tuppel.`;
  if (error.reason.kind === "InvalidLength")
    return `En Tuple må inneholde nøyaktig ${error.reason.expected} elementer, men verdien inneholder ${error.reason.actual}.`;
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

export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `En verdi ${safelyStringifyUnknownValue(error.reason.value)} er ikke en Record.`;
  if (error.reason.kind === "NotPlainRecord")
    return "Verdien er et objekt, men et Record Output må være et rent objekt eller ha en null-prototype.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `Egenskapsnøkkelen ${safelyStringifyUnknownValue(issue.key)} er ugyldig.`;
    case "Value":
      return `Verdien for egenskapen ${safelyStringifyUnknownValue(issue.key)} er ugyldig.`;
    case "Accessor":
      return `En Record-egenskap ${safelyStringifyUnknownValue(issue.key)} må være en dataegenskap.`;
    case "NonEnumerable":
      return `En Record-egenskap ${safelyStringifyUnknownValue(issue.key)} må være oppregnbar.`;
    case "Collision":
      return `Record-nøklene ${safelyStringifyUnknownValue(issue.previousKey)} og ${safelyStringifyUnknownValue(issue.key)} dekoder til samme nøkkel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

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
        return "En Object-egenskap må være en dataegenskap. Materialiser tilgangsverdier til rene data før du bruker denne Type, eller bruk en annen Type.";
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

export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `En verdi ${safelyStringifyUnknownValue(issue.value)} er ikke en JSON-verdi.`;
    case "NonFiniteNumber":
      return "Et JSON-tall må være endelig.";
    case "UnexpectedPrototype":
      return "Verdien er et objekt, men et JsonValue-objekt må være et rent objekt eller ha en null-prototype.";
    case "Accessor":
      return "En JSON-egenskap må være en dataegenskap. Materialiser tilgangsverdier til rene data før du bruker denne Type, eller bruk en annen Type.";
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

export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Verdien ${safelyStringifyUnknownValue(error.value)} kan ikke tolkes som en JsonValue.`;
