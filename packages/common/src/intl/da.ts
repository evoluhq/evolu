/**
 * Danske fejlformaterere til Evolu Type.
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

  return `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke af typen ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Værdien ${safelyStringifyUnknownValue(reason.value)} er ikke et objekt.`
    : "Værdien er et objekt, men et Object Output skal være et almindeligt objekt eller have en null-prototype.";

/** Formaterer NeverError på dansk. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke gyldig for typen Never.`;

/** Formaterer String TypeOfError på dansk. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formaterer TemplateLiteralError på dansk. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} matcher ikke skabelonliteralen.`;

/** Formaterer Number TypeOfError på dansk. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formaterer BigInt TypeOfError på dansk. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formaterer Boolean TypeOfError på dansk. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formaterer Symbol TypeOfError på dansk. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formaterer Function TypeOfError på dansk. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formaterer EvoluTypeError på dansk. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en Evolu Type.`;

/** Formaterer ObjectTagError på dansk. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} har ikke det forventede objekt-tag ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formaterer InstanceOfError på dansk. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en instans af ${error.constructorName}.`;

/** Formaterer LiteralError på dansk. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke strengt lig med den forventede literalværdi: ${String(error.expected)}.`;

/** Formaterer UnionError på dansk. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Værdien matcher ingen af de tilladte varianter.";

/** Formaterer DateIsoError på dansk. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en kanonisk ISO-dato- og tidsstreng.`;

/** Formaterer DateIsoFromDateError på dansk. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-værdien kan ikke repræsenteres som DateIso.";

/** Formaterer DecimalStringError på dansk. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en kanonisk decimalstreng.`;

/** Formaterer Int64Error på dansk. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt 64-bit heltal med fortegn (Int64).`;

/** Formaterer UInt64Error på dansk. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt 64-bit heltal uden fortegn (UInt64).`;

/** Formaterer Int64StringError på dansk. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Int64-streng.`;

/** Formaterer CapitalizedError på dansk. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal begynde med stort bogstav.`;

/** Formaterer TrimmedError på dansk. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være trimmet.`;

/** Formaterer MinLengthError på dansk. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} opfylder ikke minimumslængden på ${error.min}.`;

/** Formaterer MaxLengthError på dansk. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} overskrider maksimumslængden på ${error.max}.`;

/** Formaterer LengthError på dansk. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} har ikke den krævede længde på ${error.exact}.`;

/** Formaterer RegexError på dansk. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} matcher ikke /${error.source}/${error.flags}.`;

/** Formaterer Base64UrlError på dansk. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig Base64Url-streng.`;

/** Formaterer NameError på dansk. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt Name.`;

/** Formaterer MnemonicError på dansk. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke en gyldig engelsk BIP39-mnemonic.`;

/** Formaterer IdError på dansk. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt Id.`;

/** Formaterer TableIdError på dansk. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} er ikke et gyldigt Id for tabellen ${error.table}.`;

/** Formaterer NonNegativeError på dansk. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være ikke-negativ (>= 0).`;

/** Formaterer NonNegativeDecimalStringError på dansk. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en ikke-negativ decimalstreng.`;

/** Formaterer PositiveError på dansk. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være positiv (> 0).`;

/** Formaterer PositiveDecimalStringError på dansk. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en positiv decimalstreng.`;

/** Formaterer NonPositiveError på dansk. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være ikke-positiv (<= 0).`;

/** Formaterer NonPositiveDecimalStringError på dansk. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en ikke-positiv decimalstreng.`;

/** Formaterer NegativeError på dansk. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være negativ (< 0).`;

/** Formaterer NegativeDecimalStringError på dansk. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være en negativ decimalstreng.`;

/** Formaterer IntError på dansk. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være et sikkert heltal.`;

/** Formaterer GreaterThanError på dansk. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være større end ${error.min}.`;

/** Formaterer GreaterThanOrEqualToError på dansk. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være større end eller lig med ${error.min}.`;

/** Formaterer LessThanError på dansk. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mindre end ${error.max}.`;

/** Formaterer LessThanOrEqualToError på dansk. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mindre end eller lig med ${error.max}.`;

/** Formaterer NonNaNError på dansk. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Værdien må ikke være NaN.";

/** Formaterer FiniteError på dansk. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være endelig.`;

/** Formaterer MultipleOfError på dansk. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være et multiplum af ${error.divisor}.`;

/** Formaterer BetweenError på dansk. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} skal være mellem ${error.min} og ${error.max}, inklusive.`;

/** Formaterer ArrayError på dansk. */
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

/** Formaterer SetError på dansk. */
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

/** Formaterer MapError på dansk. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Værdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke et Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Den ekstra Map-egenskab ${safelyStringifyUnknownValue(issue.key)} er ikke tilladt.`;
    case "Key":
    case "Value":
      return `Et Map-element på indeks ${issue.index} er ugyldigt.`;
    case "Collision":
      return `Map-nøglerne ${safelyStringifyUnknownValue(issue.previousKey)} og ${safelyStringifyUnknownValue(issue.key)} afkodes til den samme nøgle ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formaterer TupleError på dansk. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Værdien ${safelyStringifyUnknownValue(error.reason.value)} er ikke en tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `En Tuple skal indeholde præcis ${error.reason.expected} elementer, men værdien indeholder ${error.reason.actual}.`;
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

/** Formaterer RecordError på dansk. */
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

/** Formaterer ObjectError på dansk. */
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

/** Formaterer DiscriminatedUnionError på dansk. */
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
      return `Diskriminatoregenskaben ${safelyStringifyUnknownValue(error.reason.key)} has an unexpected value ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Den valgte variant ${safelyStringifyUnknownValue(error.reason.discriminator)} er ugyldig.`;
  }
};

/** Formaterer JsonValueError på dansk. */
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

/** Formaterer JsonError på dansk. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Værdien ${safelyStringifyUnknownValue(error.value)} kan ikke parses til en JsonValue.`;
