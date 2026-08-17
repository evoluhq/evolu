/**
 * Deutsche Evolu-Type-Fehlerformatierer.
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

  return `Der Wert ${safelyStringifyUnknownValue(error.value)} ist nicht vom Typ ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Der Wert ${safelyStringifyUnknownValue(reason.value)} ist kein Objekt.`
    : "Der Wert ist ein Objekt, aber ein Object Output muss ein Plain Object sein oder einen null-Prototyp haben.";

/** Formatiert NeverError auf Deutsch. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist für den Typ Never ungültig.`;

/** Formatiert einen String-TypeOfError auf Deutsch. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formatiert TemplateLiteralError auf Deutsch. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} entspricht nicht dem Template-Literal.`;

/** Formatiert einen Number-TypeOfError auf Deutsch. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formatiert einen BigInt-TypeOfError auf Deutsch. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formatiert einen Boolean-TypeOfError auf Deutsch. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formatiert einen Symbol-TypeOfError auf Deutsch. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formatiert einen Function-TypeOfError auf Deutsch. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formatiert EvoluTypeError auf Deutsch. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein Evolu Type.`;

/** Formatiert ObjectTagError auf Deutsch. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} hat nicht den erwarteten Object-Tag ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formatiert InstanceOfError auf Deutsch. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine Instanz von ${error.constructorName}.`;

/** Formatiert LiteralError auf Deutsch. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist nicht strikt gleich dem erwarteten Literal: ${globalThis.String(error.expected)}.`;

/** Formatiert UnionError auf Deutsch. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Ein Wert entspricht keiner zulässigen Variante.";

/** Formatiert DateIsoError auf Deutsch. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein kanonischer ISO-Datums-/Zeit-String.`;

/** Formatiert DateIsoFromDateError auf Deutsch. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Der Date-Wert kann nicht als DateIso dargestellt werden.";

/** Formatiert DecimalStringError auf Deutsch. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein kanonischer Dezimal-String sein.`;

/** Formatiert Int64Error auf Deutsch. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige vorzeichenbehaftete 64-Bit-Ganzzahl (Int64).`;

/** Formatiert UInt64Error auf Deutsch. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige vorzeichenlose 64-Bit-Ganzzahl (UInt64).`;

/** Formatiert Int64StringError auf Deutsch. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Int64-String.`;

/** Formatiert CapitalizedError auf Deutsch. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss mit einem Großbuchstaben beginnen.`;

/** Formatiert TrimmedError auf Deutsch. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss getrimmt sein.`;

/** Formatiert MinLengthError auf Deutsch. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} erreicht die Mindestlänge von ${error.min} nicht.`;

/** Formatiert MaxLengthError auf Deutsch. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} überschreitet die Maximallänge von ${error.max}.`;

/** Formatiert LengthError auf Deutsch. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} hat nicht die erforderliche Länge von ${error.exact}.`;

/** Formatiert RegexError auf Deutsch. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} entspricht nicht /${error.source}/${error.flags}.`;

/** Formatiert Base64UrlError auf Deutsch. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Base64Url-String.`;

/** Formatiert NameError auf Deutsch. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Name.`;

/** Formatiert MnemonicError auf Deutsch. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige englische BIP39-Mnemonik.`;

/** Formatiert IdError auf Deutsch. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige Id.`;

/** Formatiert TableIdError auf Deutsch. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige Id für die Tabelle ${error.table}.`;

/** Formatiert NonNegativeError auf Deutsch. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss nichtnegativ sein (>= 0).`;

/** Formatiert NonNegativeDecimalStringError auf Deutsch. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein nichtnegativer Dezimal-String sein.`;

/** Formatiert PositiveError auf Deutsch. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss positiv sein (> 0).`;

/** Formatiert PositiveDecimalStringError auf Deutsch. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein positiver Dezimal-String sein.`;

/** Formatiert NonPositiveError auf Deutsch. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss nichtpositiv sein (<= 0).`;

/** Formatiert NonPositiveDecimalStringError auf Deutsch. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein nichtpositiver Dezimal-String sein.`;

/** Formatiert NegativeError auf Deutsch. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss negativ sein (< 0).`;

/** Formatiert NegativeDecimalStringError auf Deutsch. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein negativer Dezimal-String sein.`;

/** Formatiert IntError auf Deutsch. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss eine sichere Ganzzahl sein.`;

/** Formatiert GreaterThanError auf Deutsch. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss größer als ${error.min} sein.`;

/** Formatiert GreaterThanOrEqualToError auf Deutsch. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss größer als oder gleich ${error.min} sein.`;

/** Formatiert LessThanError auf Deutsch. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss kleiner als ${error.max} sein.`;

/** Formatiert LessThanOrEqualToError auf Deutsch. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss kleiner als oder gleich ${error.max} sein.`;

/** Formatiert NonNaNError auf Deutsch. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Der Wert darf nicht NaN sein.";

/** Formatiert FiniteError auf Deutsch. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss endlich sein.`;

/** Formatiert MultipleOfError auf Deutsch. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein Vielfaches von ${error.divisor} sein.`;

/** Formatiert BetweenError auf Deutsch. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss zwischen ${error.min} und ${error.max} liegen, einschließlich der Grenzwerte.`;

/** Formatiert ArrayError auf Deutsch. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist kein Array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Das Array-Element am Index ${issue.index} fehlt.`;
    case "Accessor":
      return `Das Array-Element am Index ${issue.index} muss eine Daten-Property sein.`;
    case "ExcessProperty":
      return "Eine zusätzliche Array-Property ist nicht zulässig. Entferne sie oder verwende einen anderen Type.";
    case "Element":
      return `Das Array-Element am Index ${issue.index} ist ungültig.`;
  }
};

/** Formatiert SetError auf Deutsch. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist kein Set.`;
  }
  if (error.reason.kind === "UnexpectedPrototype") {
    return "Der Wert ist eine Instanz einer Set-Unterklasse, aber ein Set Output muss eine direkte Set-Instanz sein.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Die zusätzliche Set-Property ${safelyStringifyUnknownValue(issue.key)} ist nicht zulässig.`;
    case "Element":
      return `Das Set-Element am Index ${issue.index} ist ungültig.`;
  }
};

/** Formatiert TupleError auf Deutsch. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist kein Tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Ein Tuple muss genau ${error.reason.expected} Elemente enthalten, der Wert enthält jedoch ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Das Tuple-Element am Index ${issue.index} fehlt.`;
    case "Accessor":
      return `Das Tuple-Element am Index ${issue.index} muss eine Daten-Property sein.`;
    case "ExcessProperty":
      return "Eine zusätzliche Tuple-Property ist nicht zulässig. Entferne sie oder verwende einen anderen Type.";
    case "Element":
      return `Das Tuple-Element am Index ${issue.index} ist ungültig.`;
  }
};

/** Formatiert RecordError auf Deutsch. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist kein Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Der Wert ist ein Objekt, aber ein Record Output muss ein Plain Object sein oder einen null-Prototyp haben.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Der Property-Key ${safelyStringifyUnknownValue(issue.key)} ist ungültig.`;
    case "Value":
      return `Der Wert der Property ${safelyStringifyUnknownValue(issue.key)} ist ungültig.`;
    case "Accessor":
      return `Die Record-Property ${safelyStringifyUnknownValue(issue.key)} muss eine Daten-Property sein.`;
    case "NonEnumerable":
      return `Die Record-Property ${safelyStringifyUnknownValue(issue.key)} muss enumerierbar sein.`;
    case "Collision":
      return `Die Record-Keys ${safelyStringifyUnknownValue(issue.previousKey)} und ${safelyStringifyUnknownValue(issue.key)} werden zum selben Key ${safelyStringifyUnknownValue(issue.outputKey)} dekodiert.`;
  }
};

/** Formatiert ObjectError auf Deutsch. */
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
        return "Eine Object-Property muss eine Daten-Property sein. Materialisiere Accessor-Werte als einfache Daten, bevor du diesen Type verwendest, oder verwende einen anderen Type.";
      case "NonEnumerable":
        return "Eine Object-Property muss enumerierbar sein. Mache sie enumerierbar oder verwende einen anderen Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Die erforderliche Property ${safelyStringifyUnknownValue(key)} fehlt.`;
  }
  if (typeof key === "symbol") {
    return "Der Key einer Object-Property muss ein String sein. Entferne die Symbol-Property oder verwende einen anderen Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Die Property ${safelyStringifyUnknownValue(key)} ist nicht zulässig. Entferne sie oder verwende einen anderen Type.`;
  }
  return `Die Property ${safelyStringifyUnknownValue(key)} ist ungültig.`;
};

/** Formatiert DiscriminatedUnionError auf Deutsch. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Die Diskriminator-Property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} muss eine Daten-Property sein.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} muss eine eigene Property sein.`;
      }
      return `${property} muss enumerierbar sein.`;
    }
    case "Discriminator":
      return `Die Diskriminator-Property ${safelyStringifyUnknownValue(error.reason.key)} hat den unerwarteten Wert ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Die ausgewählte Variante ${safelyStringifyUnknownValue(error.reason.discriminator)} ist ungültig.`;
  }
};

/** Formatiert JsonValueError auf Deutsch. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Der Wert ${safelyStringifyUnknownValue(issue.value)} ist kein JSON-Wert.`;
    case "NonFiniteNumber":
      return "Eine JSON-Zahl muss endlich sein.";
    case "UnexpectedPrototype":
      return "Der Wert ist ein Objekt, aber ein JsonValue-Objekt muss ein Plain Object sein oder einen null-Prototyp haben.";
    case "Accessor":
      return "Eine JSON-Property muss eine Daten-Property sein. Materialisiere Accessor-Werte als einfache Daten, bevor du diesen Type verwendest, oder verwende einen anderen Type.";
    case "NonEnumerable":
      return "Eine JSON-Objekt-Property muss enumerierbar sein. Entferne sie oder verwende einen anderen Type.";
    case "SymbolProperty":
      return "Der Key einer JSON-Objekt-Property muss ein String sein. Entferne die Symbol-Property oder verwende einen anderen Type.";
    case "Hole":
      return "Ein JSON-Array-Element fehlt.";
    case "ExcessProperty":
      return "Eine zusätzliche JSON-Array-Property ist nicht zulässig. Entferne sie oder verwende einen anderen Type.";
    case "CircularReference":
      return "Ein JsonValue darf keine zirkulären Referenzen enthalten.";
  }
};

/** Formatiert JsonError auf Deutsch. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} kann nicht in einen JsonValue geparst werden.`;
