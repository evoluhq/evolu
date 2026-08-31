/**
 * Hungarian Evolu Type error formatters.
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

  return `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `A(z) ${safelyStringifyUnknownValue(reason.value)} érték nem objektum.`
    : "Az érték objektum, de az Object Outputnak egyszerű objektumnak kell lennie, vagy null prototípussal kell rendelkeznie.";

/** Formats a NeverError in Hungarian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes a Never típushoz.`;
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem felel meg a sablonliterálnak.`;
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
) => `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem Evolu Type.`;
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem rendelkezik a várt ${safelyStringifyUnknownValue(error.expected)} objektumcímkével.`;
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem ${error.constructorName} példány.`;
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem szigorúan egyenlő a várt literállal: ${String(error.expected)}.`;
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Az érték nem felel meg egyik engedélyezett változatnak sem.";
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem kanonikus ISO dátum-idő karakterlánc.`;
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "A Date nem ábrázolható DateIso-ként.";
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek kanonikus decimális karakterláncnak kell lennie.`;
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes előjeles 64 bites egész szám (Int64).`;
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes előjel nélküli 64 bites egész szám (UInt64).`;
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Int64 karakterlánc.`;
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nagybetűvel kell kezdődnie.`;
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nem lehetnek kezdő vagy záró szóközei.`;
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem éri el a(z) ${error.min} minimális hosszúságot.`;
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték meghaladja a(z) ${error.max} maximális hosszúságot.`;
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek pontosan ${error.exact} hosszúságúnak kell lennie.`;
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem felel meg ennek: /${error.source}/${error.flags}.`;
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Base64Url karakterlánc.`;
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes név.`;
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes angol BIP39 mnemonikus kifejezés.`;
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Id.`;
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Id a(z) ${error.table} táblához.`;
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nemnegatívnak kell lennie (>= 0).`;
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nemnegatív decimális karakterláncnak kell lennie.`;
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek pozitívnak kell lennie (> 0).`;
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek pozitív decimális karakterláncnak kell lennie.`;
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nempozitívnak kell lennie (<= 0).`;
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nempozitív decimális karakterláncnak kell lennie.`;
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek negatívnak kell lennie (< 0).`;
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek negatív decimális karakterláncnak kell lennie.`;
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek biztonságos egész számnak kell lennie.`;
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nagyobbnak kell lennie, mint ${error.min}.`;
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nagyobbnak vagy egyenlőnek kell lennie ${error.min} értéknél.`;
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek kisebbnek kell lennie, mint ${error.max}.`;
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek kisebbnek vagy egyenlőnek kell lennie ${error.max} értéknél.`;
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Az érték nem lehet NaN.";
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek végesnek kell lennie.`;
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek ${error.divisor} többszörösének kell lennie.`;
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek ${error.min} és ${error.max} között kell lennie, a határokat is beleértve.`;

export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem tömb.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Hiányzik egy tömbelem a(z) ${issue.index} indexen.`;
    case "Accessor":
      return `A(z) ${issue.index} indexen lévő tömbelemnek adat-tulajdonságnak kell lennie.`;
    case "ExcessProperty":
      return "Többlet Array-tulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.";
    case "Element":
      return `A(z) ${issue.index} indexen lévő tömbelem érvénytelen.`;
  }
};

export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `A többlet Set-tulajdonság ${safelyStringifyUnknownValue(issue.key)} nem engedélyezett.`;
    case "Element":
      return `A(z) ${issue.index} indexen lévő Set-elem érvénytelen.`;
  }
};

export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `A többlet Map-tulajdonság ${safelyStringifyUnknownValue(issue.key)} nem engedélyezett.`;
    case "Key":
    case "Value":
      return `A(z) ${issue.index} indexen lévő Map-elem érvénytelen.`;
    case "Collision":
      return `A(z) ${safelyStringifyUnknownValue(issue.previousKey)} és ${safelyStringifyUnknownValue(issue.key)} Map-kulcs ugyanarra a(z) ${safelyStringifyUnknownValue(issue.outputKey)} kulcsra dekódolódik.`;
  }
};

export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `A Tuple-nak pontosan ${error.reason.expected} elemet kell tartalmaznia, de az érték ${error.reason.actual} elemet tartalmaz.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Hiányzik egy Tuple-elem a(z) ${issue.index} indexen.`;
    case "Accessor":
      return `A(z) ${issue.index} indexen lévő Tuple-elemnek adat-tulajdonságnak kell lennie.`;
    case "ExcessProperty":
      return "Többlet Tuple-tulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.";
    case "Element":
      return `A(z) ${issue.index} indexen lévő Tuple-elem érvénytelen.`;
  }
};

export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Az érték objektum, de a Record Outputnak egyszerű objektumnak kell lennie, vagy null prototípussal kell rendelkeznie.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} tulajdonságkulcs érvénytelen.`;
    case "Value":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} tulajdonság értéke érvénytelen.`;
    case "Accessor":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} Record-tulajdonságnak adat-tulajdonságnak kell lennie.`;
    case "NonEnumerable":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} Record-tulajdonságnak felsorolhatónak kell lennie.`;
    case "Collision":
      return `A(z) ${safelyStringifyUnknownValue(issue.previousKey)} és ${safelyStringifyUnknownValue(issue.key)} Record-kulcs ugyanarra a(z) ${safelyStringifyUnknownValue(issue.outputKey)} kulcsra dekódolódik.`;
  }
};

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
        return "Egy Object-tulajdonságnak adat-tulajdonságnak kell lennie. Az accessorértékeket a Type használata előtt alakítsa egyszerű adatokká, vagy használjon másik Type-ot.";
      case "NonEnumerable":
        return "Egy Object-tulajdonságnak felsorolhatónak kell lennie. Tegye felsorolhatóvá, vagy használjon másik Type-ot.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Hiányzik a kötelező ${safelyStringifyUnknownValue(key)} tulajdonság.`;
  }
  if (typeof key === "symbol") {
    return "Egy Object-tulajdonság kulcsának karakterláncnak kell lennie. Távolítsa el a szimbólumtulajdonságot, vagy használjon másik Type-ot.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `A(z) ${safelyStringifyUnknownValue(key)} tulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.`;
  }
  return `A(z) ${safelyStringifyUnknownValue(key)} tulajdonság érvénytelen.`;
};

export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `A(z) ${safelyStringifyUnknownValue(error.reason.key)} diszkriminátor-tulajdonságnak`;
      if (error.reason.reason === "Accessor") {
        return `${property} adat-tulajdonságnak kell lennie.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} saját tulajdonságnak kell lennie.`;
      }
      return `${property} felsorolhatónak kell lennie.`;
    }
    case "Discriminator":
      return `A(z) ${safelyStringifyUnknownValue(error.reason.key)} diszkriminátor-tulajdonság ${safelyStringifyUnknownValue(error.reason.value)} értéke nem várt.`;
    case "Member":
      return `A kiválasztott ${safelyStringifyUnknownValue(error.reason.discriminator)} változat érvénytelen.`;
  }
};

export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `A(z) ${safelyStringifyUnknownValue(issue.value)} érték nem JSON-érték.`;
    case "NonFiniteNumber":
      return "Egy JSON-számnak végesnek kell lennie.";
    case "UnexpectedPrototype":
      return "Az érték objektum, de a JsonValue-objektumnak egyszerű objektumnak kell lennie, vagy null prototípussal kell rendelkeznie.";
    case "Accessor":
      return "Egy JSON-tulajdonságnak adat-tulajdonságnak kell lennie. Az accessorértékeket a Type használata előtt alakítsa egyszerű adatokká, vagy használjon másik Type-ot.";
    case "NonEnumerable":
      return "Egy JSON-objektumtulajdonságnak felsorolhatónak kell lennie. Távolítsa el, vagy használjon másik Type-ot.";
    case "SymbolProperty":
      return "Egy JSON-objektumtulajdonság kulcsának karakterláncnak kell lennie. Távolítsa el a szimbólumtulajdonságot, vagy használjon másik Type-ot.";
    case "Hole":
      return "Hiányzik egy JSON-tömbelem.";
    case "ExcessProperty":
      return "Többlet JSON-tömbtulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.";
    case "CircularReference":
      return "A JsonValue nem tartalmazhat körkörös hivatkozásokat.";
  }
};

export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem elemezhető JsonValue-vá.`;
