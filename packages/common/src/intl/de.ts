/**
 * German Evolu Type error formatters.
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

  return `Der Wert ${safelyStringifyUnknownValue(error.value)} ist nicht vom Typ ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Der Wert ${safelyStringifyUnknownValue(reason.value)} ist kein Objekt.`
    : "Der Wert ist ein Objekt, aber ein Object Output muss ein Plain Object sein oder einen null-Prototyp haben.";

/** Formats a NeverError in German. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist für den Typ Never ungültig.`;

/** Formats a String TypeOfError in German. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in German. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} entspricht nicht dem Template-Literal.`;

/** Formats a Number TypeOfError in German. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in German. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in German. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in German. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein boolescher Wert. Verwende true oder false.`;

/** Formats a Symbol TypeOfError in German. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in German. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in German. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein Evolu Type.`;

/** Formats an ObjectTagError in German. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} hat nicht den erwarteten Object-Tag ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in German. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Der Date-Wert ist ungültig.";

/** Formats an InstanceOfError in German. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine Instanz von ${error.constructorName}.`;

/** Formats a LiteralError in German. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist nicht strikt gleich dem erwarteten Literal: ${String(error.expected)}.`;

/** Formats a UnionError in German. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Ein Wert entspricht keiner zulässigen Variante.";

/** Formats a DateIsoError in German. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein kanonischer ISO-Datums-/Zeit-String.`;

/** Formats a PlainDateIsoError in German. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiges Kalenderdatum im Format YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in German. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Der Date-Wert kann nicht als DateIso dargestellt werden.";

/** Formats a DateIsoFromRfc3339Error in German. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine unterstützte Datums-/Zeitangabe gemäß RFC 3339. Verwende einen Wert wie "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in German. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein kanonischer Dezimal-String sein.`;

/** Formats an Int64Error in German. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige vorzeichenbehaftete 64-Bit-Ganzzahl (Int64).`;

/** Formats a UInt64Error in German. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige vorzeichenlose 64-Bit-Ganzzahl (UInt64).`;

/** Formats an Int64StringError in German. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Int64-String.`;

/** Formats an IdentifierError in German. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein ${error.casing}-Bezeichner.`;

/** Formats a CapitalizedError in German. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss mit einem Großbuchstaben beginnen.`;

/** Formats an UncapitalizedError in German. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} darf nicht mit einem Großbuchstaben beginnen.`;

/** Formats an UppercasedError in German. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss in Großbuchstaben geschrieben sein.`;

/** Formats a LowercasedError in German. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss in Kleinbuchstaben geschrieben sein.`;

/** Formats a TrimmedError in German. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss getrimmt sein.`;

/** Formats a WellFormedError in German. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss wohlgeformter Unicode-Text sein.`;

/** Formats a NormalizedError in German. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss in der Unicode-Normalisierungsform ${error.form} vorliegen.`;

/** Formats a StartsWithError in German. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss mit ${safelyStringifyUnknownValue(error.prefix)} beginnen.`;

/** Formats an EndsWithError in German. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss mit ${safelyStringifyUnknownValue(error.suffix)} enden.`;

/** Formats an IncludesError in German. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ${safelyStringifyUnknownValue(error.substring)} enthalten.`;

/** Formats an ExcludesError in German. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} darf ${safelyStringifyUnknownValue(error.substring)} nicht enthalten.`;

/** Formats a MinLengthError in German. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} erreicht die Mindestlänge von ${error.min} nicht.`;

/** Formats a MaxLengthError in German. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} überschreitet die Maximallänge von ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in German. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} überschreitet die maximale UTF-8-Bytelänge von ${error.max}.`;

/** Formats a LengthError in German. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} hat nicht die erforderliche Länge von ${error.exact}.`;

/** Formats a RegexError in German. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} entspricht nicht /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in German. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Base64Url-String.`;

/** Formats a Base64Error in German. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Base64-String.`;

/** Formats a HexError in German. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein hexadezimaler String in Kleinbuchstaben mit einer geraden Anzahl von Ziffern.`;

/** Formats a HexColorError in German. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine Farbe im Format #rrggbb in Kleinbuchstaben.`;

/** Formats a NameError in German. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Name.`;

/** Formats an EmailError in German. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige E-Mail-Adresse.`;

/** Formats a HostnameError in German. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein gültiger Hostname in Kleinbuchstaben.`;

/** Formats an Ipv4AddressError in German. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige IPv4-Adresse.`;

/** Formats an Ipv6AddressError in German. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine kanonische IPv6-Adresse.`;

/** Formats an Ipv6AddressFromStringError in German. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige IPv6-Adresse.`;

/** Formats an IpAddressError in German. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist weder eine gültige IPv4-Adresse noch eine kanonische IPv6-Adresse.`;

/** Formats an IpAddressFromStringError in German. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige IP-Adresse.`;

/** Formats a PhoneNumberE164Error in German. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine Telefonnummer im E.164-Format.`;

/** Formats an IbanError in German. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige IBAN in Großbuchstaben ohne Leerzeichen.`;

/** Formats an IsbnError in German. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige 13-stellige ISBN ohne Bindestriche.`;

/** Formats a SimplePasswordError in German. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Das Passwort muss getrimmt sein.";
    case "TooLong":
      return "Das Passwort überschreitet die Maximallänge von 64.";
    case "TooShort":
      return "Das Passwort erreicht die Mindestlänge von 8 nicht.";
  }
};

/** Formats a MnemonicError in German. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Der Wert ist keine gültige englische BIP39-Mnemonik.";

/** Formats an IdError in German. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige Id.`;

/** Formats a TableIdError in German. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine gültige Id für die Tabelle ${error.table}.`;

/** Formats a UuidError in German. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine kanonische UUID in Kleinbuchstaben.`;

/** Formats a UuidVersionError in German. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine UUID der Version ${error.version}.`;

/** Formats a UlidError in German. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine kanonische ULID in Großbuchstaben.`;

/** Formats a NonNegativeError in German. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss nichtnegativ sein (>= 0).`;

/** Formats a NonNegativeDecimalStringError in German. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein nichtnegativer Dezimal-String sein.`;

/** Formats a PositiveError in German. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss positiv sein (> 0).`;

/** Formats a PositiveDecimalStringError in German. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein positiver Dezimal-String sein.`;

/** Formats a NonPositiveError in German. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss nichtpositiv sein (<= 0).`;

/** Formats a NonPositiveDecimalStringError in German. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein nichtpositiver Dezimal-String sein.`;

/** Formats a NegativeError in German. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss negativ sein (< 0).`;

/** Formats a NegativeDecimalStringError in German. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein negativer Dezimal-String sein.`;

/** Formats an IntError in German. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss eine sichere Ganzzahl sein.`;

/** Formats an IntFromStringError in German. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine dezimale Ganzzahl.`;

/** Formats a FiniteNumberFromStringError in German. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine Dezimalzahl.`;

/** Formats a GreaterThanError in German. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss größer als ${error.min} sein.`;

/** Formats a GreaterThanOrEqualToError in German. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss größer als oder gleich ${error.min} sein.`;

/** Formats a LessThanError in German. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss kleiner als ${error.max} sein.`;

/** Formats a LessThanOrEqualToError in German. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss kleiner als oder gleich ${error.max} sein.`;

/** Formats a NonNaNError in German. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Der Wert darf nicht NaN sein.";

/** Formats a FiniteError in German. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss endlich sein.`;

/** Formats a MultipleOfError in German. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss ein Vielfaches von ${error.divisor} sein.`;

/** Formats a BetweenError in German. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss zwischen ${error.min} und ${error.max} liegen, einschließlich der Grenzwerte.`;

/** Formats a GreaterThanBigIntError in German. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss größer als ${error.min} sein.`;

/** Formats a GreaterThanOrEqualToBigIntError in German. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss größer als oder gleich ${error.min} sein.`;

/** Formats a LessThanBigIntError in German. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss kleiner als ${error.max} sein.`;

/** Formats a LessThanOrEqualToBigIntError in German. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss kleiner als oder gleich ${error.max} sein.`;

/** Formats a BetweenBigIntError in German. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss zwischen ${error.min} und ${error.max} liegen, einschließlich der Grenzwerte.`;

/** Formats an ArrayError in German. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist kein Array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Das Array-Element am Index ${issue.index} fehlt.`;
    case "Accessor":
      return `Das Array-Element am Index ${issue.index} muss eine Dateneigenschaft sein.`;
    case "ExcessProperty":
      return "Eine zusätzliche Array-Eigenschaft ist nicht zulässig. Entferne sie oder verwende einen anderen Type.";
    case "Element":
      return `Das Array-Element am Index ${issue.index} ist ungültig.`;
  }
};

/** Formats a NonEmptyArrayError in German. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} muss mindestens ein Element enthalten.`;

/** Formats a UniqueError in German. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} enthält gleiche Elemente an den Indizes ${error.previousIndex} und ${error.index}.`;

/** Formats a SetError in German. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist kein Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Die zusätzliche Set-Eigenschaft ${safelyStringifyUnknownValue(issue.key)} ist nicht zulässig.`;
    case "Element":
      return `Das Set-Element am Index ${issue.index} ist ungültig.`;
  }
};

/** Formats a MapError in German. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist keine Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Die zusätzliche Map-Eigenschaft ${safelyStringifyUnknownValue(issue.key)} ist nicht zulässig.`;
    case "Key":
      return `Der Map-Schlüssel am Index ${issue.index} ist ungültig.`;
    case "Value":
      return `Der Map-Wert am Index ${issue.index} ist ungültig.`;
    case "Collision":
      return `Die Map-Schlüssel an den Indizes ${issue.previousIndex} und ${issue.index} werden zum selben Schlüssel ${safelyStringifyUnknownValue(issue.outputKey)} dekodiert.`;
  }
};

/** Formats a MinSizeError in German. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Die Größe ${error.value.size} erreicht die Mindestgröße von ${error.min} nicht.`;

/** Formats a MaxSizeError in German. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Die Größe ${error.value.size} überschreitet die Maximalgröße von ${error.max}.`;

/** Formats a TupleError in German. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Der Wert ${safelyStringifyUnknownValue(error.reason.value)} ist kein Tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Ein Tuple muss die Länge ${error.reason.expected} haben, der Wert hat jedoch die Länge ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Das Tuple-Element am Index ${issue.index} fehlt.`;
    case "Accessor":
      return `Das Tuple-Element am Index ${issue.index} muss eine Dateneigenschaft sein.`;
    case "ExcessProperty":
      return "Eine zusätzliche Tuple-Eigenschaft ist nicht zulässig. Entferne sie oder verwende einen anderen Type.";
    case "Element":
      return `Das Tuple-Element am Index ${issue.index} ist ungültig.`;
  }
};

/** Formats a RecordError in German. */
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
      return `Der Eigenschaftsschlüssel ${safelyStringifyUnknownValue(issue.key)} ist ungültig.`;
    case "Value":
      return `Der Wert der Eigenschaft ${safelyStringifyUnknownValue(issue.key)} ist ungültig.`;
    case "Accessor":
      return `Die Record-Eigenschaft ${safelyStringifyUnknownValue(issue.key)} muss eine Dateneigenschaft sein.`;
    case "NonEnumerable":
      return `Die Record-Eigenschaft ${safelyStringifyUnknownValue(issue.key)} muss enumerierbar sein.`;
    case "Collision":
      return `Die Record-Schlüssel ${safelyStringifyUnknownValue(issue.previousKey)} und ${safelyStringifyUnknownValue(issue.key)} werden zum selben Schlüssel ${safelyStringifyUnknownValue(issue.outputKey)} dekodiert.`;
  }
};

/** Formats a MinEntriesError in German. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} erreicht die Mindestanzahl der Einträge von ${error.min} nicht.`;

/** Formats a MaxEntriesError in German. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} überschreitet die Maximalanzahl der Einträge von ${error.max}.`;

/** Formats an ObjectError in German. */
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
        return "Eine Object-Eigenschaft muss eine Dateneigenschaft sein. Materialisiere Accessor-Werte als einfache Daten, bevor du diesen Type verwendest, oder verwende einen anderen Type.";
      case "NonEnumerable":
        return "Eine Object-Eigenschaft muss enumerierbar sein. Mache sie enumerierbar oder verwende einen anderen Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Die erforderliche Eigenschaft ${safelyStringifyUnknownValue(key)} fehlt.`;
  }
  if (typeof key === "symbol") {
    return "Der Schlüssel einer Object-Eigenschaft muss ein String sein. Entferne die Symbol-Eigenschaft oder verwende einen anderen Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Die Eigenschaft ${safelyStringifyUnknownValue(key)} ist nicht zulässig. Entferne sie oder verwende einen anderen Type.`;
  }
  return `Die Eigenschaft ${safelyStringifyUnknownValue(key)} ist ungültig.`;
};

/** Formats a DiscriminatedUnionError in German. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Die Diskriminator-Eigenschaft ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} muss eine Dateneigenschaft sein.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} muss eine eigene Eigenschaft sein.`;
      }
      return `${property} muss enumerierbar sein.`;
    }
    case "Discriminator":
      return `Die Diskriminator-Eigenschaft ${safelyStringifyUnknownValue(error.reason.key)} hat den unerwarteten Wert ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Die ausgewählte Variante ${safelyStringifyUnknownValue(error.reason.discriminator)} ist ungültig.`;
  }
};

/** Formats a DataError in German. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Der Wert ${safelyStringifyUnknownValue(issue.value)} ist kein Data.`;
    case "UnexpectedPrototype":
      return `Ein Data-${issue.container} hat einen unerwarteten Prototyp.`;
    case "Accessor":
      return "Eine Data-Eigenschaft muss eine Dateneigenschaft sein. Materialisiere Accessor-Werte als einfache Daten, bevor du diesen Type verwendest, oder verwende einen anderen Type.";
    case "NonEnumerable":
      return "Eine Data-Object-Eigenschaft muss enumerierbar sein. Entferne sie oder verwende einen anderen Type.";
    case "SymbolProperty":
      return "Der Schlüssel einer Data-Object-Eigenschaft muss ein String sein. Entferne die Symbol-Eigenschaft oder verwende einen anderen Type.";
    case "Hole":
      return "Ein Data-Array-Element fehlt.";
    case "InvalidUint8Array":
      return "Ein Data-Uint8Array muss einen nicht abgetrennten ArrayBuffer haben und innerhalb dessen Grenzen liegen.";
    case "ExcessProperty":
      return `Ein Data-Wert vom Typ ${issue.container} darf keine zusätzlichen eigenen Eigenschaften haben. Entferne die Eigenschaft oder verwende einen anderen Type.`;
  }
};

/** Formats a JsonValueError in German. */
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
      return "Eine JSON-Eigenschaft muss eine Dateneigenschaft sein. Materialisiere Accessor-Werte als einfache Daten, bevor du diesen Type verwendest, oder verwende einen anderen Type.";
    case "NonEnumerable":
      return "Eine JSON-Objekt-Eigenschaft muss enumerierbar sein. Entferne sie oder verwende einen anderen Type.";
    case "SymbolProperty":
      return "Der Schlüssel einer JSON-Objekt-Eigenschaft muss ein String sein. Entferne die Symbol-Eigenschaft oder verwende einen anderen Type.";
    case "Hole":
      return "Ein JSON-Array-Element fehlt.";
    case "ExcessProperty":
      return "Eine zusätzliche JSON-Array-Eigenschaft ist nicht zulässig. Entferne sie oder verwende einen anderen Type.";
    case "CircularReference":
      return "Ein JsonValue darf keine zirkulären Referenzen enthalten.";
  }
};

/** Formats a JsonError in German. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} kann nicht in einen JsonValue geparst werden.`;

/** Formats a ByteSizeLiteralError in German. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein Byte-Größenliteral. Verwende einen Wert wie "512KiB" oder "1MiB".`;

/** Formats a ByteLengthError in German. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Der Wert -0 ist keine Bytelänge. Verwende stattdessen 0.";

/** Formats a ByteLengthFromStringError in German. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist keine Bytelänge. Verwende eine Anzahl von Bytes oder ein Literal wie 10MiB.`;

/** Formats a DurationLiteralError in German. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein Dauerliteral. Verwende einen Wert wie "500ms" oder "1.5s".`;

/** Formats a PercentageLiteralError in German. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Der Wert ${safelyStringifyUnknownValue(error.value)} ist kein Prozentliteral. Verwende einen Wert wie "50%" oder "12.5%".`;
