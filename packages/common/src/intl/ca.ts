/**
 * Formatadors d'errors d'Evolu Type en català.
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

  return `El valor ${safelyStringifyUnknownValue(error.value)} no és de tipus ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `El valor ${safelyStringifyUnknownValue(reason.value)} no és un objecte.`
    : "El valor és un objecte, però l’Output d’Object ha de ser un objecte pla o tenir un prototip nul.";

/** Formata NeverError en català. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és vàlid per al tipus Never.`;

/** Formata String TypeOfError en català. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formata TemplateLiteralError en català. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincideix amb el literal de plantilla.`;

/** Formata Number TypeOfError en català. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formata BigInt TypeOfError en català. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formata Boolean TypeOfError en català. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formata Symbol TypeOfError en català. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formata Function TypeOfError en català. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formata EvoluTypeError en català. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Evolu Type.`;

/** Formata ObjectTagError en català. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no té l’etiqueta d’objecte esperada ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formata InstanceOfError en català. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una instància de ${error.constructorName}.`;

/** Formata LiteralError en català. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és estrictament igual al literal esperat: ${globalThis.String(error.expected)}.`;

/** Formata UnionError en català. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "El valor no coincideix amb cap variant permesa.";

/** Formata DateIsoError en català. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una cadena canònica de data i hora ISO.`;

/** Formata DateIsoFromDateError en català. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "El Date no es pot representar com a DateIso.";

/** Formata DecimalStringError en català. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal canònica.`;

/** Formata Int64Error en català. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un enter amb signe de 64 bits vàlid (Int64).`;

/** Formata UInt64Error en català. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un enter sense signe de 64 bits vàlid (UInt64).`;

/** Formata Int64StringError en català. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una cadena Int64 vàlida.`;

/** Formata CapitalizedError en català. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de començar amb majúscula.`;

/** Formata TrimmedError en català. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no pot tenir espais en blanc al principi ni al final.`;

/** Formata MinLengthError en català. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no compleix la longitud mínima de ${error.min}.`;

/** Formata MaxLengthError en català. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera la longitud màxima de ${error.max}.`;

/** Formata LengthError en català. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no té la longitud requerida de ${error.exact}.`;

/** Formata RegexError en català. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincideix amb /${error.source}/${error.flags}.`;

/** Formata Base64UrlError en català. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una cadena Base64Url vàlida.`;

/** Formata NameError en català. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Name vàlid.`;

/** Formata MnemonicError en català. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una frase mnemotècnica BIP39 en anglès vàlida.`;

/** Formata IdError en català. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Id vàlid.`;

/** Formata TableIdError en català. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Id vàlid per a la taula ${error.table}.`;

/** Formata NonNegativeError en català. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser no negatiu (>= 0).`;

/** Formata NonNegativeDecimalStringError en català. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal no negativa.`;

/** Formata PositiveError en català. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser positiu (> 0).`;

/** Formata PositiveDecimalStringError en català. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal positiva.`;

/** Formata NonPositiveError en català. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser no positiu (<= 0).`;

/** Formata NonPositiveDecimalStringError en català. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal no positiva.`;

/** Formata NegativeError en català. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser negatiu (< 0).`;

/** Formata NegativeDecimalStringError en català. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal negativa.`;

/** Formata IntError en català. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser un enter segur.`;

/** Formata GreaterThanError en català. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser superior a ${error.min}.`;

/** Formata GreaterThanOrEqualToError en català. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser superior o igual a ${error.min}.`;

/** Formata LessThanError en català. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser inferior a ${error.max}.`;

/** Formata LessThanOrEqualToError en català. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser inferior o igual a ${error.max}.`;

/** Formata NonNaNError en català. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "El valor no pot ser NaN.";

/** Formata FiniteError en català. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser finit.`;

/** Formata MultipleOfError en català. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser múltiple de ${error.divisor}.`;

/** Formata BetweenError en català. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha d’estar entre ${error.min} i ${error.max}, ambdós inclosos.`;

/** Formata ArrayError en català. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no és un array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Falta un element de l’array a l’índex ${issue.index}.`;
    case "Accessor":
      return `L’element de l’array a l’índex ${issue.index} ha de ser una propietat de dades.`;
    case "ExcessProperty":
      return "No es permet una propietat Array addicional. Elimineu-la o utilitzeu un Type diferent.";
    case "Element":
      return `L’element de l’array a l’índex ${issue.index} no és vàlid.`;
  }
};

/** Formata SetError en català. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no és un Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `No es permet la propietat Set addicional ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `L’element de Set a l’índex ${issue.index} no és vàlid.`;
  }
};

/** Formata MapError en català. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no és un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `No es permet la propietat Map addicional ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
    case "Value":
      return `L’element de Map a l’índex ${issue.index} no és vàlid.`;
    case "Collision":
      return `Les claus de Map ${safelyStringifyUnknownValue(issue.previousKey)} i ${safelyStringifyUnknownValue(issue.key)} es descodifiquen a la mateixa clau ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formata TupleError en català. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no és una tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Un Tuple ha de contenir exactament ${error.reason.expected} elements, però el valor en conté ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Falta un element de Tuple a l’índex ${issue.index}.`;
    case "Accessor":
      return `L’element de Tuple a l’índex ${issue.index} ha de ser una propietat de dades.`;
    case "ExcessProperty":
      return "No es permet una propietat Tuple addicional. Elimineu-la o utilitzeu un Type diferent.";
    case "Element":
      return `L’element de Tuple a l’índex ${issue.index} no és vàlid.`;
  }
};

/** Formata RecordError en català. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no és un Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "El valor és un objecte, però l’Output de Record ha de ser un objecte pla o tenir un prototip nul.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `La clau de propietat ${safelyStringifyUnknownValue(issue.key)} no és vàlida.`;
    case "Value":
      return `El valor de la propietat ${safelyStringifyUnknownValue(issue.key)} no és vàlid.`;
    case "Accessor":
      return `La propietat Record ${safelyStringifyUnknownValue(issue.key)} ha de ser una propietat de dades.`;
    case "NonEnumerable":
      return `La propietat Record ${safelyStringifyUnknownValue(issue.key)} ha de ser enumerable.`;
    case "Collision":
      return `Les claus de Record ${safelyStringifyUnknownValue(issue.previousKey)} i ${safelyStringifyUnknownValue(issue.key)} es descodifiquen a la mateixa clau ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formata ObjectError en català. */
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
        return "Una propietat Object ha de ser una propietat de dades. Materialitzeu els valors dels accessors com a dades simples abans d’utilitzar aquest Type o utilitzeu un Type diferent.";
      case "NonEnumerable":
        return "Una propietat Object ha de ser enumerable. Feu-la enumerable o utilitzeu un Type diferent.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Falta la propietat obligatòria ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "La clau d’una propietat Object ha de ser una cadena. Elimineu la propietat symbol o utilitzeu un Type diferent.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `La propietat ${safelyStringifyUnknownValue(key)} no està permesa. Elimineu-la o utilitzeu un Type diferent.`;
  }
  return `La propietat ${safelyStringifyUnknownValue(key)} no és vàlida.`;
};

/** Formata DiscriminatedUnionError en català. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `La propietat discriminadora ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ha de ser una propietat de dades.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} ha de ser una propietat pròpia.`;
      }
      return `${property} ha de ser enumerable.`;
    }
    case "Discriminator":
      return `La propietat discriminadora ${safelyStringifyUnknownValue(error.reason.key)} té un valor inesperat ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `La variant seleccionada ${safelyStringifyUnknownValue(error.reason.discriminator)} no és vàlida.`;
  }
};

/** Formata JsonValueError en català. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `El valor ${safelyStringifyUnknownValue(issue.value)} no és un valor JSON.`;
    case "NonFiniteNumber":
      return "Un nombre JSON ha de ser finit.";
    case "UnexpectedPrototype":
      return "El valor és un objecte, però un objecte JsonValue ha de ser un objecte pla o tenir un prototip nul.";
    case "Accessor":
      return "Una propietat JSON ha de ser una propietat de dades. Materialitzeu els valors dels accessors com a dades simples abans d’utilitzar aquest Type o utilitzeu un Type diferent.";
    case "NonEnumerable":
      return "Una propietat d’un objecte JSON ha de ser enumerable. Elimineu-la o utilitzeu un Type diferent.";
    case "SymbolProperty":
      return "La clau d’una propietat d’un objecte JSON ha de ser una cadena. Elimineu la propietat symbol o utilitzeu un Type diferent.";
    case "Hole":
      return "Falta un element de l’array JSON.";
    case "ExcessProperty":
      return "No es permet una propietat addicional de l’array JSON. Elimineu-la o utilitzeu un Type diferent.";
    case "CircularReference":
      return "Un JsonValue no pot contenir referències circulars.";
  }
};

/** Formata JsonError en català. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es pot analitzar com a JsonValue.`;
