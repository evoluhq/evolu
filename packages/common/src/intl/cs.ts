/**
 * Czech Evolu Type error formatters.
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

const formatValueMustBe = (value: unknown, expected: string): string =>
  `Hodnota ${safelyStringifyUnknownValue(value)} musí být ${expected}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Hodnota ${safelyStringifyUnknownValue(reason.value)} není objekt.`
    : "Hodnota je objekt, ale Output typu Object musí být prostý objekt nebo mít prototyp null.";

/** Formats a NeverError in Czech. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} není platná pro typ Never.`;

/** Formats a String TypeOfError in Czech. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> = (
  error,
) => formatValueMustBe(error.value, "text");

/** Formats a TemplateLiteralError in Czech. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} neodpovídá šablonovému řetězci.`;

/** Formats a Number TypeOfError in Czech. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> = (
  error,
) => formatValueMustBe(error.value, "číslo");

/** Formats a BigInt TypeOfError in Czech. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> = (
  error,
) => formatValueMustBe(error.value, "celé číslo typu bigint");

/** Formats a Boolean TypeOfError in Czech. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> = (
  error,
) => formatValueMustBe(error.value, "logická hodnota");

/** Formats a Symbol TypeOfError in Czech. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> = (
  error,
) => formatValueMustBe(error.value, "symbol");

/** Formats a Function TypeOfError in Czech. */
export const formatFunctionError: TypeErrorFormatter<
  TypeOfError<"Function">
> = (error) => formatValueMustBe(error.value, "funkce");

/** Formats an EvoluTypeError in Czech. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být Evolu Type.`;

/** Formats an ObjectTagError in Czech. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nemá očekávaný tag objektu ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in Czech. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být instancí ${error.constructorName}.`;

/** Formats a LiteralError in Czech. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} se musí přesně rovnat očekávanému literálu ${String(error.expected)}.`;

/** Formats a UnionError in Czech. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Hodnota neodpovídá žádné z povolených variant.";

/** Formats a DateIsoError in Czech. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec s datem a časem v kanonickém formátu ISO.`;

/** Formats a DateIsoFromDateError in Czech. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Datum nelze převést na DateIso.";

/** Formats a DecimalStringError in Czech. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být kanonický řetězec představující desetinné číslo.`;

/** Formats an Int64Error in Czech. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné 64bitové celé číslo se znaménkem (Int64).`;

/** Formats a UInt64Error in Czech. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné 64bitové celé číslo bez znaménka (UInt64).`;

/** Formats an Int64StringError in Czech. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný řetězec Int64.`;

/** Formats a CapitalizedError in Czech. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) => `Text ${safelyStringifyUnknownValue(error.value)} musí být kapitalizován.`;

/** Formats a TrimmedError in Czech. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Text ${safelyStringifyUnknownValue(error.value)} nesmí obsahovat bílé znaky na začátku ani na konci.`;

/** Formats a MinLengthError in Czech. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  typeof error.value === "string" && error.min === 1
    ? "Text nesmí být prázdný."
    : `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mít délku alespoň ${error.min}.`;

/** Formats a MaxLengthError in Czech. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} smí mít délku nejvýše ${error.max}.`;

/** Formats a LengthError in Czech. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mít délku přesně ${error.exact}.`;

/** Formats a RegexError in Czech. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} neodpovídá regulárnímu výrazu /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Czech. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný řetězec Base64Url.`;

/** Formats a NameError in Czech. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný název.`;

/** Formats a MnemonicError in Czech. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platná anglická BIP39 mnemotechnická fráze.`;

/** Formats an IdError in Czech. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné Id.`;

/** Formats a TableIdError in Czech. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné Id pro tabulku ${safelyStringifyUnknownValue(error.table)}.`;

/** Formats a NonNegativeError in Czech. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být nezáporná (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Czech. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující nezáporné desetinné číslo.`;

/** Formats a PositiveError in Czech. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být kladná (> 0).`;

/** Formats a PositiveDecimalStringError in Czech. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující kladné desetinné číslo.`;

/** Formats a NonPositiveError in Czech. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být nekladná (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Czech. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující nekladné desetinné číslo.`;

/** Formats a NegativeError in Czech. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být záporná (< 0).`;

/** Formats a NegativeDecimalStringError in Czech. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující záporné desetinné číslo.`;

/** Formats an IntError in Czech. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být bezpečné celé číslo.`;

/** Formats a GreaterThanError in Czech. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být větší než ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Czech. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být větší nebo rovna ${error.min}.`;

/** Formats a LessThanError in Czech. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být menší než ${error.max}.`;

/** Formats a LessThanOrEqualToError in Czech. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být menší nebo rovna ${error.max}.`;

/** Formats a NonNaNError in Czech. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Hodnota nesmí být NaN.";

/** Formats a FiniteError in Czech. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být konečné číslo.`;

/** Formats a MultipleOfError in Czech. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být násobkem čísla ${error.divisor}.`;

/** Formats a BetweenError in Czech. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být v rozsahu od ${error.min} do ${error.max} včetně.`;

/** Formats an ArrayError in Czech. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není pole.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `V poli chybí prvek na indexu ${issue.index}.`;
    case "Accessor":
      return `Prvek pole na indexu ${issue.index} musí být datová vlastnost.`;
    case "ExcessProperty":
      return "Pole obsahuje nepovolenou vlastní vlastnost. Odstraňte ji nebo použijte jiný Type.";
    case "Element":
      return `Prvek pole na indexu ${issue.index} není platný.`;
  }
};

/** Formats a SetError in Czech. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Set obsahuje nepovolenou vlastní vlastnost ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `Prvek Setu na indexu ${issue.index} není platný.`;
  }
};

/** Formats a MapError in Czech. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Map obsahuje nepovolenou vlastní vlastnost ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
    case "Value":
      return `Prvek Mapu na indexu ${issue.index} není platný.`;
    case "Collision":
      return `Klíče Mapu ${safelyStringifyUnknownValue(issue.previousKey)} a ${safelyStringifyUnknownValue(issue.key)} se dekódují na stejný klíč ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Czech. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple musí mít délku ${error.reason.expected}, ale hodnota má délku ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `V Tuple chybí prvek na indexu ${issue.index}.`;
    case "Accessor":
      return `Prvek Tuple na indexu ${issue.index} musí být datová vlastnost.`;
    case "ExcessProperty":
      return "Tuple obsahuje nepovolenou vlastní vlastnost. Odstraňte ji nebo použijte jiný Type.";
    case "Element":
      return `Prvek Tuple na indexu ${issue.index} není platný.`;
  }
};

/** Formats a RecordError in Czech. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Hodnota je objekt, ale Output typu Record musí být prostý objekt nebo mít prototyp null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Klíč vlastnosti ${safelyStringifyUnknownValue(issue.key)} není platný.`;
    case "Value":
      return `Hodnota vlastnosti ${safelyStringifyUnknownValue(issue.key)} není platná.`;
    case "Accessor":
      return `Vlastnost Recordu ${safelyStringifyUnknownValue(issue.key)} musí být datová vlastnost.`;
    case "NonEnumerable":
      return `Vlastnost Recordu ${safelyStringifyUnknownValue(issue.key)} musí být enumerovatelná (enumerable).`;
    case "Collision":
      return `Klíče Recordu ${safelyStringifyUnknownValue(issue.previousKey)} a ${safelyStringifyUnknownValue(issue.key)} se dekódují na stejný klíč ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Czech. */
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
        return "Vlastnost typu Object musí být datová vlastnost. Před použitím tohoto Type materializujte hodnotu accessoru do prostých dat nebo použijte jiný Type.";
      case "NonEnumerable":
        return "Vlastnost typu Object musí být enumerovatelná (enumerable).";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Povinná vlastnost ${safelyStringifyUnknownValue(key)} chybí.`;
  }
  if (typeof key === "symbol") {
    return "Klíč vlastnosti typu Object musí být text. Odstraňte symbolovou vlastnost nebo použijte jiný Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Vlastnost ${safelyStringifyUnknownValue(key)} není povolena. Odstraňte ji nebo použijte jiný Type.`;
  }
  return `Vlastnost ${safelyStringifyUnknownValue(key)} není platná.`;
};

/** Formats a DiscriminatedUnionError in Czech. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Rozlišovací vlastnost ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} musí být datová vlastnost.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} musí být vlastní vlastnost.`;
      }
      return `${property} musí být enumerovatelná (enumerable).`;
    }
    case "Discriminator":
      return `Rozlišovací vlastnost ${safelyStringifyUnknownValue(error.reason.key)} má neočekávanou hodnotu ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Vybraná varianta ${safelyStringifyUnknownValue(error.reason.discriminator)} není platná.`;
  }
};

/** Formats a JsonValueError in Czech. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Hodnota ${safelyStringifyUnknownValue(issue.value)} není JSON hodnota.`;
    case "NonFiniteNumber":
      return "Číslo v JSON musí být konečné.";
    case "UnexpectedPrototype":
      return "Hodnota je objekt, ale objekt v JsonValue musí být prostý objekt nebo mít prototyp null.";
    case "Accessor":
      return "Vlastnost objektu JSON musí být datová vlastnost. Před použitím tohoto Type materializujte hodnotu accessoru do prostých dat nebo použijte jiný Type.";
    case "NonEnumerable":
      return "Vlastnost objektu JSON musí být enumerovatelná (enumerable). Odstraňte ji nebo použijte jiný Type.";
    case "SymbolProperty":
      return "Klíč vlastnosti objektu JSON musí být text. Odstraňte symbolovou vlastnost nebo použijte jiný Type.";
    case "Hole":
      return "V poli JSON chybí prvek.";
    case "ExcessProperty":
      return "Pole JSON obsahuje nepovolenou vlastní vlastnost. Odstraňte ji nebo použijte jiný Type.";
    case "CircularReference":
      return "JsonValue nesmí obsahovat cyklické reference.";
  }
};

/** Formats a JsonError in Czech. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Hodnotu ${safelyStringifyUnknownValue(error.value)} nelze parsovat jako JsonValue.`;
