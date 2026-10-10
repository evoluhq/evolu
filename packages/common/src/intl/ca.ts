/**
 * Catalan Evolu Type error formatters.
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
  RedactedError,
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

  return `El valor ${safelyStringifyUnknownValue(error.value)} no és de tipus ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `El valor ${safelyStringifyUnknownValue(reason.value)} no és un objecte.`
    : "El valor és un objecte, però l’Output d’Object ha de ser un objecte pla o tenir un prototip nul.";

/** Formats a NeverError in Catalan. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és vàlid per al tipus Never.`;

/** Formats a String TypeOfError in Catalan. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Catalan. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincideix amb el literal de plantilla.`;

/** Formats a Number TypeOfError in Catalan. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Catalan. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Catalan. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Catalan. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un booleà. Utilitzeu true o false.`;

/** Formats a Symbol TypeOfError in Catalan. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Catalan. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Catalan. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Evolu Type.`;

/** Formats an ObjectTagError in Catalan. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no té l’etiqueta d’objecte esperada ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Catalan. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "El Date no és vàlid.";

/** Formats an InstanceOfError in Catalan. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una instància de ${error.constructorName}.`;

/** Formats a LiteralError in Catalan. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és estrictament igual al literal esperat: ${String(error.expected)}.`;

/** Formats a UnionError in Catalan. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "El valor no coincideix amb cap variant permesa.";

/** Formats a DateIsoError in Catalan. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una cadena canònica de data i hora ISO.`;

/** Formats a PlainDateIsoError in Catalan. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una data de calendari vàlida en format YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Catalan. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "El Date no es pot representar com a DateIso.";

/** Formats a DateIsoFromRfc3339Error in Catalan. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una data i hora RFC 3339 admesa. Feu servir un valor com ara "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Catalan. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal canònica.`;

/** Formats an Int64Error in Catalan. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un enter amb signe de 64 bits vàlid (Int64).`;

/** Formats a UInt64Error in Catalan. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un enter sense signe de 64 bits vàlid (UInt64).`;

/** Formats an Int64StringError in Catalan. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una cadena Int64 vàlida.`;

/** Formats an IdentifierError in Catalan. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un identificador ${error.casing}.`;

/** Formats a CapitalizedError in Catalan. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de començar per majúscula.`;

/** Formats an UncapitalizedError in Catalan. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no pot començar per una lletra majúscula.`;

/** Formats an UppercasedError in Catalan. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser en majúscules.`;

/** Formats a LowercasedError in Catalan. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser en minúscules.`;

/** Formats a TrimmedError in Catalan. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no pot tenir espais en blanc al principi ni al final.`;

/** Formats a WellFormedError in Catalan. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser text Unicode ben format.`;

/** Formats a NormalizedError in Catalan. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha d’estar en la forma de normalització Unicode ${error.form}.`;

/** Formats a StartsWithError in Catalan. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de començar per ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Catalan. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha d’acabar en ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Catalan. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de contenir ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Catalan. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no pot contenir ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Catalan. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no compleix la longitud mínima de ${error.min}.`;

/** Formats a MaxLengthError in Catalan. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera la longitud màxima de ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Catalan. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera la longitud màxima en bytes UTF-8 de ${error.max}.`;

/** Formats a LengthError in Catalan. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no té la longitud requerida de ${error.exact}.`;

/** Formats a RegexError in Catalan. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no coincideix amb /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Catalan. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una cadena Base64Url vàlida.`;

/** Formats a Base64Error in Catalan. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una cadena Base64 vàlida.`;

/** Formats a HexError in Catalan. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és hexadecimal en minúscules amb un nombre parell de dígits.`;

/** Formats a HexColorError in Catalan. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un color en el format #rrggbb en minúscules.`;

/** Formats a NameError in Catalan. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Name vàlid.`;

/** Formats an EmailError in Catalan. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una adreça de correu electrònic vàlida.`;

/** Formats a HostnameError in Catalan. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un nom d’amfitrió en minúscules vàlid.`;

/** Formats an Ipv4AddressError in Catalan. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una adreça IPv4 vàlida.`;

/** Formats an Ipv6AddressError in Catalan. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una adreça IPv6 canònica.`;

/** Formats an Ipv6AddressFromStringError in Catalan. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una adreça IPv6 vàlida.`;

/** Formats an IpAddressError in Catalan. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una adreça IPv4 vàlida ni una adreça IPv6 canònica.`;

/** Formats an IpAddressFromStringError in Catalan. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una adreça IP vàlida.`;

/** Formats a PhoneNumberE164Error in Catalan. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un número de telèfon en format E.164.`;

/** Formats an IbanError in Catalan. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un IBAN vàlid en majúscules i sense espais.`;

/** Formats an IsbnError in Catalan. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un ISBN vàlid de 13 dígits sense guions.`;

/** Formats a SimplePasswordError in Catalan. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "La contrasenya no pot tenir espais en blanc al principi ni al final.";
    case "TooLong":
      return "La contrasenya supera la longitud màxima de 64.";
    case "TooShort":
      return "La contrasenya no compleix la longitud mínima de 8.";
  }
};

/** Formats a MnemonicError in Catalan. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "El valor no és una frase mnemotècnica BIP39 en anglès vàlida.";

/** Formats a RedactedError in Catalan. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "El secret ha de ser una cadena.";

/** Formats an IdError in Catalan. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Id vàlid.`;

/** Formats a TableIdError in Catalan. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un Id vàlid per a la taula ${error.table}.`;

/** Formats a UuidError in Catalan. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un UUID canònic en minúscules.`;

/** Formats a UuidVersionError in Catalan. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un UUID de versió ${error.version}.`;

/** Formats a UlidError in Catalan. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un ULID canònic en majúscules.`;

/** Formats a NonNegativeError in Catalan. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser no negatiu (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Catalan. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal no negativa.`;

/** Formats a PositiveError in Catalan. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser positiu (> 0).`;

/** Formats a PositiveDecimalStringError in Catalan. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal positiva.`;

/** Formats a NonPositiveError in Catalan. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser no positiu (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Catalan. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal no positiva.`;

/** Formats a NegativeError in Catalan. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser negatiu (< 0).`;

/** Formats a NegativeDecimalStringError in Catalan. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser una cadena decimal negativa.`;

/** Formats an IntError in Catalan. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser un enter segur.`;

/** Formats an IntFromStringError in Catalan. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un enter decimal.`;

/** Formats a FiniteNumberFromStringError in Catalan. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un nombre decimal.`;

/** Formats a GreaterThanError in Catalan. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser superior a ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Catalan. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser superior o igual a ${error.min}.`;

/** Formats a LessThanError in Catalan. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser inferior a ${error.max}.`;

/** Formats a LessThanOrEqualToError in Catalan. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser inferior o igual a ${error.max}.`;

/** Formats a NonNaNError in Catalan. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "El valor no pot ser NaN.";

/** Formats a FiniteError in Catalan. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser finit.`;

/** Formats a MultipleOfError in Catalan. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser múltiple de ${error.divisor}.`;

/** Formats a BetweenError in Catalan. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha d’estar entre ${error.min} i ${error.max}, ambdós inclosos.`;

/** Formats a GreaterThanBigIntError in Catalan. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser superior a ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Catalan. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser superior o igual a ${error.min}.`;

/** Formats a LessThanBigIntError in Catalan. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser inferior a ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Catalan. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de ser inferior o igual a ${error.max}.`;

/** Formats a BetweenBigIntError in Catalan. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha d’estar entre ${error.min} i ${error.max}, ambdós inclosos.`;

/** Formats an ArrayError in Catalan. */
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

/** Formats a NonEmptyArrayError in Catalan. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} ha de contenir com a mínim un element.`;

/** Formats a UniqueError in Catalan. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} té elements iguals als índexs ${error.previousIndex} i ${error.index}.`;

/** Formats a SetError in Catalan. */
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

/** Formats a MapError in Catalan. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no és un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `No es permet la propietat Map addicional ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
      return `La clau de Map a l’índex ${issue.index} no és vàlida.`;
    case "Value":
      return `El valor de Map a l’índex ${issue.index} no és vàlid.`;
    case "Collision":
      return `Les claus de Map als índexs ${issue.previousIndex} i ${issue.index} es descodifiquen a la mateixa clau ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Catalan. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `La mida ${error.value.size} no compleix la mida mínima de ${error.min}.`;

/** Formats a MaxSizeError in Catalan. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `La mida ${error.value.size} supera la mida màxima de ${error.max}.`;

/** Formats a TupleError in Catalan. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `El valor ${safelyStringifyUnknownValue(error.reason.value)} no és una tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `La longitud d’un Tuple ha de ser ${error.reason.expected}, però la del valor és ${error.reason.actual}.`;
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

/** Formats a RecordError in Catalan. */
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

/** Formats a MinEntriesError in Catalan. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no compleix el nombre mínim d’entrades, que és ${error.min}.`;

/** Formats a MaxEntriesError in Catalan. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} supera el nombre màxim d’entrades, que és ${error.max}.`;

/** Formats an ObjectError in Catalan. */
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

/** Formats a DiscriminatedUnionError in Catalan. */
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

/** Formats a DataError in Catalan. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `El valor ${safelyStringifyUnknownValue(issue.value)} no és un valor Data.`;
    case "UnexpectedPrototype":
      return `Un valor Data de tipus ${issue.container} té un prototip inesperat.`;
    case "Accessor":
      return "Una propietat Data ha de ser una propietat de dades. Materialitzeu els valors dels accessors com a dades simples abans d’utilitzar aquest Type o utilitzeu un Type diferent.";
    case "NonEnumerable":
      return "Una propietat d’un objecte Data ha de ser enumerable. Elimineu-la o utilitzeu un Type diferent.";
    case "SymbolProperty":
      return "La clau d’una propietat d’un objecte Data ha de ser una cadena. Elimineu la propietat symbol o utilitzeu un Type diferent.";
    case "Hole":
      return "Falta un element de l’array Data.";
    case "InvalidUint8Array":
      return "Un Uint8Array Data ha de tenir un ArrayBuffer no desacoblat i quedar dins dels seus límits.";
    case "ExcessProperty":
      return `Un valor Data de tipus ${issue.container} no pot tenir propietats pròpies addicionals. Elimineu la propietat o utilitzeu un Type diferent.`;
  }
};

/** Formats a JsonValueError in Catalan. */
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

/** Formats a JsonError in Catalan. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no es pot analitzar com a JsonValue.`;

/** Formats a ByteSizeLiteralError in Catalan. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un literal de mida en bytes. Feu servir un valor com ara "512KiB" o "1MiB".`;

/** Formats a ByteLengthError in Catalan. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "El valor -0 no és una longitud en bytes. Feu servir 0 en lloc seu.";

/** Formats a ByteLengthFromStringError in Catalan. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és una longitud en bytes. Feu servir un nombre de bytes o un literal com ara 10MiB.`;

/** Formats a DurationLiteralError in Catalan. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un literal de durada. Feu servir un valor com ara "500ms" o "1.5s".`;

/** Formats a PercentageLiteralError in Catalan. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `El valor ${safelyStringifyUnknownValue(error.value)} no és un literal de percentatge. Feu servir un valor com ara "50%" o "12.5%".`;
