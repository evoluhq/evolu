/**
 * Formateadores de errores de Evolu Type en español.
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

  return `El valor ${safelyStringifyUnknownValue(error.value)} no es de tipo ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `El valor ${safelyStringifyUnknownValue(reason.value)} no es un objeto.`
    : "El valor es un objeto, pero un Output de Object debe ser un objeto plano o tener un prototipo null.";

/** Formatea NeverError en español. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es válido para el tipo Never.`;

/** Formatea String TypeOfError en español. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formatea TemplateLiteralError en español. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincide con el literal de plantilla.`;

/** Formatea Number TypeOfError en español. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formatea BigInt TypeOfError en español. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formatea Boolean TypeOfError en español. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formatea Symbol TypeOfError en español. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formatea Function TypeOfError en español. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formatea EvoluTypeError en español. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Evolu Type.`;

/** Formatea ObjectTagError en español. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no tiene la etiqueta de objeto esperada ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formatea InstanceOfError en español. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una instancia de ${error.constructorName}.`;

/** Formatea LiteralError en español. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es estrictamente igual al literal esperado: ${globalThis.String(error.expected)}.`;

/** Formatea UnionError en español. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "El valor no coincide con ninguna variante permitida.";

/** Formatea DateIsoError en español. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una cadena canónica de fecha y hora ISO.`;

/** Formatea DateIsoFromDateError en español. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "El Date no se puede representar como DateIso.";

/** Formatea DecimalStringError en español. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal canónica.`;

/** Formatea Int64Error en español. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un entero con signo de 64 bits válido (Int64).`;

/** Formatea UInt64Error en español. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un entero sin signo de 64 bits válido (UInt64).`;

/** Formatea Int64StringError en español. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una cadena Int64 válida.`;

/** Formatea CapitalizedError en español. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe empezar con mayúscula.`;

/** Formatea TrimmedError en español. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no debe tener espacios en blanco al principio ni al final.`;

/** Formatea MinLengthError en español. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no alcanza la longitud mínima de ${error.min}.`;

/** Formatea MaxLengthError en español. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera la longitud máxima de ${error.max}.`;

/** Formatea LengthError en español. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no tiene la longitud requerida de ${error.exact}.`;

/** Formatea RegexError en español. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincide con /${error.source}/${error.flags}.`;

/** Formatea Base64UrlError en español. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una cadena Base64Url válida.`;

/** Formatea NameError en español. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Name válido.`;

/** Formatea MnemonicError en español. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un mnemónico BIP39 en inglés válido.`;

/** Formatea IdError en español. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Id válido.`;

/** Formatea TableIdError en español. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Id válido para la tabla ${error.table}.`;

/** Formatea NonNegativeError en español. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser no negativo (>= 0).`;

/** Formatea NonNegativeDecimalStringError en español. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal no negativa.`;

/** Formatea PositiveError en español. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser positivo (> 0).`;

/** Formatea PositiveDecimalStringError en español. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal positiva.`;

/** Formatea NonPositiveError en español. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser no positivo (<= 0).`;

/** Formatea NonPositiveDecimalStringError en español. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal no positiva.`;

/** Formatea NegativeError en español. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser negativo (< 0).`;

/** Formatea NegativeDecimalStringError en español. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal negativa.`;

/** Formatea IntError en español. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser un entero seguro.`;

/** Formatea GreaterThanError en español. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser mayor que ${error.min}.`;

/** Formatea GreaterThanOrEqualToError en español. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser mayor o igual que ${error.min}.`;

/** Formatea LessThanError en español. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser menor que ${error.max}.`;

/** Formatea LessThanOrEqualToError en español. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser menor o igual que ${error.max}.`;

/** Formatea NonNaNError en español. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "El valor no debe ser NaN.";

/** Formatea FiniteError en español. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser finito.`;

/** Formatea MultipleOfError en español. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser múltiplo de ${error.divisor}.`;

/** Formatea BetweenError en español. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe estar entre ${error.min} y ${error.max}, ambos inclusive.`;

/** Formatea ArrayError en español. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no es un array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Falta un elemento del array en el índice ${issue.index}.`;
    case "Accessor":
      return `El elemento del array en el índice ${issue.index} debe ser una propiedad de datos.`;
    case "ExcessProperty":
      return "No se permite una propiedad adicional de Array. Elimínala o usa un Type diferente.";
    case "Element":
      return `El elemento del array en el índice ${issue.index} no es válido.`;
  }
};

/** Formatea SetError en español. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no es un Set.`;
  }
  if (error.reason.kind === "UnexpectedPrototype") {
    return "El valor es una instancia de una subclase de Set, pero un Output de Set debe ser una instancia directa de Set.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `No se permite la propiedad adicional de Set ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `El elemento de Set en el índice ${issue.index} no es válido.`;
  }
};

/** Formatea TupleError en español. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no es una tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Un Tuple debe contener exactamente ${error.reason.expected} elementos, pero el valor contiene ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Falta un elemento de Tuple en el índice ${issue.index}.`;
    case "Accessor":
      return `El elemento de Tuple en el índice ${issue.index} debe ser una propiedad de datos.`;
    case "ExcessProperty":
      return "No se permite una propiedad adicional de Tuple. Elimínala o usa un Type diferente.";
    case "Element":
      return `El elemento de Tuple en el índice ${issue.index} no es válido.`;
  }
};

/** Formatea RecordError en español. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no es un Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "El valor es un objeto, pero un Output de Record debe ser un objeto plano o tener un prototipo null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `La clave de propiedad ${safelyStringifyUnknownValue(issue.key)} no es válida.`;
    case "Value":
      return `El valor de la propiedad ${safelyStringifyUnknownValue(issue.key)} no es válido.`;
    case "Accessor":
      return `La propiedad de Record ${safelyStringifyUnknownValue(issue.key)} debe ser una propiedad de datos.`;
    case "NonEnumerable":
      return `La propiedad de Record ${safelyStringifyUnknownValue(issue.key)} debe ser enumerable.`;
    case "Collision":
      return `Las claves de Record ${safelyStringifyUnknownValue(issue.previousKey)} y ${safelyStringifyUnknownValue(issue.key)} se decodifican como la misma clave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formatea ObjectError en español. */
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
        return "Una propiedad de Object debe ser una propiedad de datos. Materializa los valores de los accesores como datos simples antes de usar este Type o usa un Type diferente.";
      case "NonEnumerable":
        return "Una propiedad de Object debe ser enumerable. Hazla enumerable o usa un Type diferente.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Falta la propiedad requerida ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "La clave de una propiedad de Object debe ser una cadena. Elimina la propiedad symbol o usa un Type diferente.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `La propiedad ${safelyStringifyUnknownValue(key)} no está permitida. Elimínala o usa un Type diferente.`;
  }
  return `La propiedad ${safelyStringifyUnknownValue(key)} no es válida.`;
};

/** Formatea DiscriminatedUnionError en español. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `La propiedad discriminadora ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} debe ser una propiedad de datos.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} debe ser una propiedad propia.`;
      }
      return `${property} debe ser enumerable.`;
    }
    case "Discriminator":
      return `La propiedad discriminadora ${safelyStringifyUnknownValue(error.reason.key)} tiene un valor inesperado ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `La variante seleccionada ${safelyStringifyUnknownValue(error.reason.discriminator)} no es válida.`;
  }
};

/** Formatea JsonValueError en español. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `El valor ${safelyStringifyUnknownValue(issue.value)} no es un valor JSON.`;
    case "NonFiniteNumber":
      return "Un número JSON debe ser finito.";
    case "UnexpectedPrototype":
      return "El valor es un objeto, pero un objeto JsonValue debe ser un objeto plano o tener un prototipo null.";
    case "Accessor":
      return "Una propiedad JSON debe ser una propiedad de datos. Materializa los valores de los accesores como datos simples antes de usar este Type o usa un Type diferente.";
    case "NonEnumerable":
      return "Una propiedad de un objeto JSON debe ser enumerable. Elimínala o usa un Type diferente.";
    case "SymbolProperty":
      return "La clave de una propiedad de un objeto JSON debe ser una cadena. Elimina la propiedad symbol o usa un Type diferente.";
    case "Hole":
      return "Falta un elemento del array JSON.";
    case "ExcessProperty":
      return "No se permite una propiedad adicional de un array JSON. Elimínala o usa un Type diferente.";
    case "CircularReference":
      return "Un JsonValue no debe contener referencias circulares.";
  }
};

/** Formatea JsonError en español. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no se puede analizar como JsonValue.`;
