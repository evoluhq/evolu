/**
 * Svenska Evolu Type-felformaterare.
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

  return `Värdet ${safelyStringifyUnknownValue(error.value)} har inte typen ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Värdet ${safelyStringifyUnknownValue(reason.value)} är inte ett objekt.`
    : "Värdet är ett objekt, men en Object Output måste vara ett vanligt objekt eller ha en null-prototyp.";

/** Formaterar ett NeverError på svenska. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte giltigt för typen Never.`;

/** Formaterar ett String TypeOfError på svenska. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formaterar ett TemplateLiteralError på svenska. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} matchar inte mallsträngen.`;

/** Formaterar ett Number TypeOfError på svenska. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formaterar ett BigInt TypeOfError på svenska. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formaterar ett Boolean TypeOfError på svenska. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formaterar ett Symbol TypeOfError på svenska. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formaterar ett Function TypeOfError på svenska. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formaterar ett EvoluTypeError på svenska. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en Evolu Type.`;

/** Formaterar ett ObjectTagError på svenska. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} har inte den förväntade objekttaggen ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formaterar ett InstanceOfError på svenska. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en instans av ${error.constructorName}.`;

/** Formaterar ett LiteralError på svenska. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte strikt lika med det förväntade literalvärdet: ${globalThis.String(error.expected)}.`;

/** Formaterar ett UnionError på svenska. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Ett värde matchar ingen tillåten variant.";

/** Formaterar ett DateIsoError på svenska. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en kanonisk ISO-sträng för datum och tid.`;

/** Formaterar ett DateIsoFromDateError på svenska. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date kan inte representeras som DateIso.";

/** Formaterar ett DecimalStringError på svenska. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en kanonisk decimalsträng.`;

/** Formaterar ett Int64Error på svenska. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt signerat 64-bitars heltal (Int64).`;

/** Formaterar ett UInt64Error på svenska. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt osignerat 64-bitars heltal (UInt64).`;

/** Formaterar ett Int64StringError på svenska. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig Int64-sträng.`;

/** Formaterar ett CapitalizedError på svenska. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste börja med stor bokstav.`;

/** Formaterar ett TrimmedError på svenska. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} får inte ha inledande eller avslutande blanksteg.`;

/** Formaterar ett MinLengthError på svenska. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} uppfyller inte minimilängden ${error.min}.`;

/** Formaterar ett MaxLengthError på svenska. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} överskrider maxlängden ${error.max}.`;

/** Formaterar ett LengthError på svenska. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} har inte den obligatoriska längden ${error.exact}.`;

/** Formaterar ett RegexError på svenska. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} matchar inte /${error.source}/${error.flags}.`;

/** Formaterar ett Base64UrlError på svenska. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig Base64Url-sträng.`;

/** Formaterar ett NameError på svenska. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt Name.`;

/** Formaterar ett MnemonicError på svenska. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig engelsk BIP39-mnemonisk fras.`;

/** Formaterar ett IdError på svenska. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt Id.`;

/** Formaterar ett TableIdError på svenska. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt Id för tabellen ${error.table}.`;

/** Formaterar ett NonNegativeError på svenska. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara icke-negativt (>= 0).`;

/** Formaterar ett NonNegativeDecimalStringError på svenska. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en icke-negativ decimalsträng.`;

/** Formaterar ett PositiveError på svenska. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara positivt (> 0).`;

/** Formaterar ett PositiveDecimalStringError på svenska. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en positiv decimalsträng.`;

/** Formaterar ett NonPositiveError på svenska. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara icke-positivt (<= 0).`;

/** Formaterar ett NonPositiveDecimalStringError på svenska. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en icke-positiv decimalsträng.`;

/** Formaterar ett NegativeError på svenska. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara negativt (< 0).`;

/** Formaterar ett NegativeDecimalStringError på svenska. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en negativ decimalsträng.`;

/** Formaterar ett IntError på svenska. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara ett säkert heltal.`;

/** Formaterar ett GreaterThanError på svenska. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara större än ${error.min}.`;

/** Formaterar ett GreaterThanOrEqualToError på svenska. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara större än eller lika med ${error.min}.`;

/** Formaterar ett LessThanError på svenska. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara mindre än ${error.max}.`;

/** Formaterar ett LessThanOrEqualToError på svenska. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara mindre än eller lika med ${error.max}.`;

/** Formaterar ett NonNaNError på svenska. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Värdet får inte vara NaN.";

/** Formaterar ett FiniteError på svenska. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara ändligt.`;

/** Formaterar ett MultipleOfError på svenska. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en multipel av ${error.divisor}.`;

/** Formaterar ett BetweenError på svenska. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste ligga mellan ${error.min} och ${error.max}, inklusive.`;

/** Formaterar ett ArrayError på svenska. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Ett arrayelement vid index ${issue.index} saknas.`;
    case "Accessor":
      return `Ett arrayelement vid index ${issue.index} måste vara en dataegenskap.`;
    case "ExcessProperty":
      return "En extra Array-egenskap är inte tillåten. Ta bort den eller använd en annan Type.";
    case "Element":
      return `Ett arrayelement vid index ${issue.index} är ogiltigt.`;
  }
};

/** Formaterar ett SetError på svenska. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `En extra Set-egenskap ${safelyStringifyUnknownValue(issue.key)} är inte tillåten.`;
    case "Element":
      return `Ett Set-element vid index ${issue.index} är ogiltigt.`;
  }
};

/** Formaterar ett MapError på svenska. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `En extra Map-egenskap ${safelyStringifyUnknownValue(issue.key)} är inte tillåten.`;
    case "Key":
    case "Value":
      return `Ett Map-element vid index ${issue.index} är ogiltigt.`;
    case "Collision":
      return `Map-nycklarna ${safelyStringifyUnknownValue(issue.previousKey)} och ${safelyStringifyUnknownValue(issue.key)} avkodas till samma nyckel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formaterar ett TupleError på svenska. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `En Tuple måste innehålla exakt ${error.reason.expected} element, men värdet innehåller ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Ett Tuple-element vid index ${issue.index} saknas.`;
    case "Accessor":
      return `Ett Tuple-element vid index ${issue.index} måste vara en dataegenskap.`;
    case "ExcessProperty":
      return "En extra Tuple-egenskap är inte tillåten. Ta bort den eller använd en annan Type.";
    case "Element":
      return `Ett Tuple-element vid index ${issue.index} är ogiltigt.`;
  }
};

/** Formaterar ett RecordError på svenska. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Värdet är ett objekt, men en Record Output måste vara ett vanligt objekt eller ha en null-prototyp.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Egenskapsnyckeln ${safelyStringifyUnknownValue(issue.key)} är ogiltig.`;
    case "Value":
      return `Värdet för egenskapen ${safelyStringifyUnknownValue(issue.key)} är ogiltigt.`;
    case "Accessor":
      return `En Record-egenskap ${safelyStringifyUnknownValue(issue.key)} måste vara en dataegenskap.`;
    case "NonEnumerable":
      return `En Record-egenskap ${safelyStringifyUnknownValue(issue.key)} måste vara uppräkningsbar.`;
    case "Collision":
      return `Record-nycklarna ${safelyStringifyUnknownValue(issue.previousKey)} och ${safelyStringifyUnknownValue(issue.key)} avkodas till samma nyckel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formaterar ett ObjectError på svenska. */
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
        return "En Object-egenskap måste vara en dataegenskap. Omvandla accessor-värden till vanliga data innan du använder denna Type eller använd en annan Type.";
      case "NonEnumerable":
        return "En Object-egenskap måste vara uppräkningsbar. Gör den uppräkningsbar eller använd en annan Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Den obligatoriska egenskapen ${safelyStringifyUnknownValue(key)} saknas.`;
  }
  if (typeof key === "symbol") {
    return "En Object-egenskapsnyckel måste vara en sträng. Ta bort symbolegenskapen eller använd en annan Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Egenskapen ${safelyStringifyUnknownValue(key)} är inte tillåten. Ta bort den eller använd en annan Type.`;
  }
  return `Egenskapen ${safelyStringifyUnknownValue(key)} är ogiltigt.`;
};

/** Formaterar ett DiscriminatedUnionError på svenska. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Diskriminatoregenskapen ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} måste vara en dataegenskap.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} måste vara en egen egenskap.`;
      }
      return `${property} måste vara uppräkningsbar.`;
    }
    case "Discriminator":
      return `Diskriminatoregenskapen ${safelyStringifyUnknownValue(error.reason.key)} har ett oväntat värde ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Den valda varianten ${safelyStringifyUnknownValue(error.reason.discriminator)} är ogiltigt.`;
  }
};

/** Formaterar ett JsonValueError på svenska. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Värdet ${safelyStringifyUnknownValue(issue.value)} är inte ett JSON-värde.`;
    case "NonFiniteNumber":
      return "Ett JSON-tal måste vara ändligt.";
    case "UnexpectedPrototype":
      return "Värdet är ett objekt, men ett JsonValue-objekt måste vara ett vanligt objekt eller ha en null-prototyp.";
    case "Accessor":
      return "En JSON-egenskap måste vara en dataegenskap. Omvandla accessor-värden till vanliga data innan du använder denna Type eller använd en annan Type.";
    case "NonEnumerable":
      return "En JSON-objektegenskap måste vara uppräkningsbar. Ta bort den eller använd en annan Type.";
    case "SymbolProperty":
      return "En JSON-objektegenskapsnyckel måste vara en sträng. Ta bort symbolegenskapen eller använd en annan Type.";
    case "Hole":
      return "Ett JSON-arrayelement saknas.";
    case "ExcessProperty":
      return "En extra JSON-arrayegenskap är inte tillåten. Ta bort den eller använd en annan Type.";
    case "CircularReference":
      return "Ett JsonValue får inte innehålla cirkulära referenser.";
  }
};

/** Formaterar ett JsonError på svenska. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} kan inte tolkas som ett JsonValue.`;
