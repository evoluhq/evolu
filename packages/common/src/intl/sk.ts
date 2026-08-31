/**
 * Slovak Evolu Type error formatters.
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
/** Formats a DateIsoFromDateError in Slovak. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Dátum nie je možné reprezentovať ako DateIso.";
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
/** Formats a CapitalizedError in Slovak. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Reťazec ${safelyStringifyUnknownValue(error.value)} musí začínať veľkým písmenom.`;
/** Formats a TrimmedError in Slovak. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Reťazec ${safelyStringifyUnknownValue(error.value)} nesmie obsahovať medzery na začiatku ani na konci.`;
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
/** Formats a NameError in Slovak. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platný názov.`;
/** Formats a MnemonicError in Slovak. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platná anglická mnemotechnická fráza BIP39.`;
/** Formats an IdError in Slovak. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platné Id.`;
/** Formats a TableIdError in Slovak. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nie je platné Id pre tabuľku ${safelyStringifyUnknownValue(error.table)}.`;
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
    case "Value":
      return `Prvok Map na indexe ${issue.index} nie je platný.`;
    case "Collision":
      return `Kľúče Map ${safelyStringifyUnknownValue(issue.previousKey)} a ${safelyStringifyUnknownValue(issue.key)} sa dekódujú na rovnaký kľúč ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};
/** Formats a TupleError in Slovak. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} nie je tuple.`;
  if (error.reason.kind === "InvalidLength")
    return `Tuple musí obsahovať presne ${error.reason.expected} prvkov, ale hodnota obsahuje ${error.reason.actual}.`;
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
        return "Vlastnosť Object musí byť enumerovateľná.";
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
