/**
 * Spanish Evolu Type error formatters.
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
  BetweenBigIntError,
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
  ExcludesError,
  FiniteError,
  FiniteNumberFromStringError,
  GreaterThanBigIntError,
  GreaterThanError,
  GreaterThanOrEqualToBigIntError,
  GreaterThanOrEqualToError,
  HexColorError,
  HexError,
  HostnameError,
  IbanError,
  IncludesError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
  IdError,
  IpAddressError,
  IpAddressFromStringError,
  Ipv4AddressError,
  Ipv6AddressError,
  Ipv6AddressFromStringError,
  IsbnError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanBigIntError,
  LessThanError,
  LessThanOrEqualToBigIntError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxEntriesError,
  MaxLengthError,
  MaxSizeError,
  MaxUtf8ByteLengthError,
  MinEntriesError,
  MinLengthError,
  MinSizeError,
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
  SimplePasswordError,
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
  UlidError,
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

  return `El valor ${safelyStringifyUnknownValue(error.value)} no es de tipo ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `El valor ${safelyStringifyUnknownValue(reason.value)} no es un objeto.`
    : "El valor es un objeto, pero un Output de Object debe ser un objeto plano o tener un prototipo null.";

/** Formats a NeverError in Spanish. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es válido para el tipo Never.`;

/** Formats a String TypeOfError in Spanish. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Spanish. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincide con el literal de plantilla.`;

/** Formats a Number TypeOfError in Spanish. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Spanish. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Spanish. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Spanish. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un booleano. Usa true o false.`;

/** Formats a Symbol TypeOfError in Spanish. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Spanish. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Spanish. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Evolu Type.`;

/** Formats an ObjectTagError in Spanish. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no tiene la etiqueta de objeto esperada ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Spanish. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "El Date no es válido.";

/** Formats an InstanceOfError in Spanish. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una instancia de ${error.constructorName}.`;

/** Formats a LiteralError in Spanish. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es estrictamente igual al literal esperado: ${String(error.expected)}.`;

/** Formats a UnionError in Spanish. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "El valor no coincide con ninguna variante permitida.";

/** Formats a DateIsoError in Spanish. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una cadena canónica de fecha y hora ISO.`;

/** Formats a PlainDateIsoError in Spanish. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una fecha de calendario válida en formato YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Spanish. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "El Date no se puede representar como DateIso.";

/** Formats a DateIsoFromRfc3339Error in Spanish. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una fecha y hora RFC 3339 admitida. Usa un valor como "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Spanish. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal canónica.`;

/** Formats an Int64Error in Spanish. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un entero con signo de 64 bits válido (Int64).`;

/** Formats a UInt64Error in Spanish. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un entero sin signo de 64 bits válido (UInt64).`;

/** Formats an Int64StringError in Spanish. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una cadena Int64 válida.`;

/** Formats an IdentifierError in Spanish. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un identificador ${error.casing}.`;

/** Formats a CapitalizedError in Spanish. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe empezar con mayúscula.`;

/** Formats an UncapitalizedError in Spanish. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no debe empezar con una letra mayúscula.`;

/** Formats an UppercasedError in Spanish. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe estar en mayúsculas.`;

/** Formats a LowercasedError in Spanish. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe estar en minúsculas.`;

/** Formats a TrimmedError in Spanish. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no debe tener espacios en blanco al principio ni al final.`;

/** Formats a WellFormedError in Spanish. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser un texto Unicode bien formado.`;

/** Formats a NormalizedError in Spanish. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe estar en la forma de normalización Unicode ${error.form}.`;

/** Formats a StartsWithError in Spanish. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe empezar por ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Spanish. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe terminar en ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Spanish. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe contener ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Spanish. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no debe contener ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Spanish. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no alcanza la longitud mínima de ${error.min}.`;

/** Formats a MaxLengthError in Spanish. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera la longitud máxima de ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Spanish. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera la longitud máxima en bytes UTF-8 de ${error.max}.`;

/** Formats a LengthError in Spanish. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no tiene la longitud requerida de ${error.exact}.`;

/** Formats a RegexError in Spanish. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincide con /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Spanish. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una cadena Base64Url válida.`;

/** Formats a Base64Error in Spanish. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una cadena Base64 válida.`;

/** Formats a HexError in Spanish. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es hexadecimal en minúsculas con un número par de dígitos.`;

/** Formats a HexColorError in Spanish. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un color en formato #rrggbb en minúsculas.`;

/** Formats a NameError in Spanish. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Name válido.`;

/** Formats an EmailError in Spanish. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una dirección de correo electrónico válida.`;

/** Formats a HostnameError in Spanish. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un nombre de host en minúsculas válido.`;

/** Formats an Ipv4AddressError in Spanish. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una dirección IPv4 válida.`;

/** Formats an Ipv6AddressError in Spanish. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una dirección IPv6 canónica.`;

/** Formats an Ipv6AddressFromStringError in Spanish. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una dirección IPv6 válida.`;

/** Formats an IpAddressError in Spanish. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una dirección IPv4 válida ni una dirección IPv6 canónica.`;

/** Formats an IpAddressFromStringError in Spanish. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una dirección IP válida.`;

/** Formats a PhoneNumberE164Error in Spanish. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un número de teléfono en formato E.164.`;

/** Formats an IbanError in Spanish. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un IBAN válido en mayúsculas y sin espacios.`;

/** Formats an IsbnError in Spanish. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un ISBN válido de 13 dígitos sin guiones.`;

/** Formats a SimplePasswordError in Spanish. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "La contraseña no debe tener espacios en blanco al principio ni al final.";
    case "TooLong":
      return "La contraseña supera la longitud máxima de 64.";
    case "TooShort":
      return "La contraseña no alcanza la longitud mínima de 8.";
  }
};

/** Formats a MnemonicError in Spanish. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "El valor no es un mnemónico BIP39 en inglés válido.";

/** Formats an IdError in Spanish. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Id válido.`;

/** Formats a TableIdError in Spanish. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un Id válido para la tabla ${error.table}.`;

/** Formats a UuidError in Spanish. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un UUID canónico en minúsculas.`;

/** Formats a UuidVersionError in Spanish. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un UUID de versión ${error.version}.`;

/** Formats a UlidError in Spanish. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un ULID canónico en mayúsculas.`;

/** Formats a NonNegativeError in Spanish. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser no negativo (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Spanish. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal no negativa.`;

/** Formats a PositiveError in Spanish. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser positivo (> 0).`;

/** Formats a PositiveDecimalStringError in Spanish. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal positiva.`;

/** Formats a NonPositiveError in Spanish. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser no positivo (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Spanish. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal no positiva.`;

/** Formats a NegativeError in Spanish. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser negativo (< 0).`;

/** Formats a NegativeDecimalStringError in Spanish. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser una cadena decimal negativa.`;

/** Formats an IntError in Spanish. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser un entero seguro.`;

/** Formats an IntFromStringError in Spanish. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un entero decimal.`;

/** Formats a FiniteNumberFromStringError in Spanish. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un número decimal.`;

/** Formats a GreaterThanError in Spanish. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser mayor que ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Spanish. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser mayor o igual que ${error.min}.`;

/** Formats a LessThanError in Spanish. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser menor que ${error.max}.`;

/** Formats a LessThanOrEqualToError in Spanish. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser menor o igual que ${error.max}.`;

/** Formats a NonNaNError in Spanish. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "El valor no debe ser NaN.";

/** Formats a FiniteError in Spanish. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser finito.`;

/** Formats a MultipleOfError in Spanish. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser múltiplo de ${error.divisor}.`;

/** Formats a BetweenError in Spanish. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe estar entre ${error.min} y ${error.max}, ambos inclusive.`;

/** Formats a GreaterThanBigIntError in Spanish. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser mayor que ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Spanish. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser mayor o igual que ${error.min}.`;

/** Formats a LessThanBigIntError in Spanish. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser menor que ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Spanish. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe ser menor o igual que ${error.max}.`;

/** Formats a BetweenBigIntError in Spanish. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe estar entre ${error.min} y ${error.max}, ambos inclusive.`;

/** Formats an ArrayError in Spanish. */
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

/** Formats a NonEmptyArrayError in Spanish. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} debe contener al menos un elemento.`;

/** Formats a UniqueError in Spanish. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} tiene elementos iguales en los índices ${error.previousIndex} y ${error.index}.`;

/** Formats a SetError in Spanish. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no es un Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `No se permite la propiedad adicional de Set ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `El elemento de Set en el índice ${issue.index} no es válido.`;
  }
};

/** Formats a MapError in Spanish. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no es un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `No se permite la propiedad adicional de Map ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
      return `La clave de Map en el índice ${issue.index} no es válida.`;
    case "Value":
      return `El valor de Map en el índice ${issue.index} no es válido.`;
    case "Collision":
      return `Las claves de Map en los índices ${issue.previousIndex} y ${issue.index} se decodifican como la misma clave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Spanish. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `El tamaño ${error.value.size} no alcanza el tamaño mínimo de ${error.min}.`;

/** Formats a MaxSizeError in Spanish. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `El tamaño ${error.value.size} supera el tamaño máximo de ${error.max}.`;

/** Formats a TupleError in Spanish. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no es una tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Un Tuple debe tener una longitud de ${error.reason.expected}, pero el valor tiene una longitud de ${error.reason.actual}.`;
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

/** Formats a RecordError in Spanish. */
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

/** Formats a MinEntriesError in Spanish. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no alcanza el número mínimo de entradas, que es ${error.min}.`;

/** Formats a MaxEntriesError in Spanish. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera el número máximo de entradas, que es ${error.max}.`;

/** Formats an ObjectError in Spanish. */
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

/** Formats a DiscriminatedUnionError in Spanish. */
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

/** Formats a DataError in Spanish. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `El valor ${safelyStringifyUnknownValue(issue.value)} no es un valor Data.`;
    case "UnexpectedPrototype":
      return `Un valor Data de tipo ${issue.container} tiene un prototipo inesperado.`;
    case "Accessor":
      return "Una propiedad Data debe ser una propiedad de datos. Materializa los valores de los accesores como datos simples antes de usar este Type o usa un Type diferente.";
    case "NonEnumerable":
      return "Una propiedad de un objeto Data debe ser enumerable. Elimínala o usa un Type diferente.";
    case "SymbolProperty":
      return "La clave de una propiedad de un objeto Data debe ser una cadena. Elimina la propiedad symbol o usa un Type diferente.";
    case "Hole":
      return "Falta un elemento del array Data.";
    case "InvalidUint8Array":
      return "Un Uint8Array Data debe tener un ArrayBuffer no desacoplado y estar dentro de sus límites.";
    case "ExcessProperty":
      return `Un valor Data de tipo ${issue.container} no debe tener propiedades propias adicionales. Elimina la propiedad o usa un Type diferente.`;
  }
};

/** Formats a JsonValueError in Spanish. */
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

/** Formats a JsonError in Spanish. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no se puede analizar como JsonValue.`;

/** Formats a ByteSizeLiteralError in Spanish. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un literal de tamaño en bytes. Usa un valor como "512KiB" o "1MiB".`;

/** Formats a ByteLengthError in Spanish. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "El valor -0 no es una longitud en bytes. Usa 0 en su lugar.";

/** Formats a ByteLengthFromStringError in Spanish. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es una longitud en bytes. Usa un número de bytes o un literal como 10MiB.`;

/** Formats a DurationLiteralError in Spanish. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un literal de duración. Usa un valor como "500ms" o "1.5s".`;

/** Formats a PercentageLiteralError in Spanish. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es un literal de porcentaje. Usa un valor como "50%" o "12.5%".`;
