/**
 * French Evolu Type error formatters.
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

  return `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas de type ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `La valeur ${safelyStringifyUnknownValue(reason.value)} n’est pas un objet.`
    : "La valeur est un objet, mais la sortie Object doit être un objet simple ou avoir un prototype nul.";

/** Formats a NeverError in French. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas valide pour le type Never.`;

/** Formats a String TypeOfError in French. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in French. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne correspond pas au littéral de modèle.`;

/** Formats a Number TypeOfError in French. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in French. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in French. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in French. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un booléen. Utilisez true ou false.`;

/** Formats a Symbol TypeOfError in French. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in French. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in French. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un type Evolu.`;

/** Formats an ObjectTagError in French. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’a pas l’étiquette d’objet attendue ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in French. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "La Date n’est pas valide.";

/** Formats an InstanceOfError in French. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une instance de ${error.constructorName}.`;

/** Formats a LiteralError in French. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas strictement égale au littéral attendu : ${String(error.expected)}.`;

/** Formats a UnionError in French. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "La valeur ne correspond à aucune variante autorisée.";

/** Formats a DateIsoError in French. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une chaîne de date et d’heure ISO canonique.`;

/** Formats a PlainDateIsoError in French. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une date calendaire valide au format YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in French. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "La Date ne peut pas être représentée comme DateIso.";

/** Formats a DateIsoFromRfc3339Error in French. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une date et heure au format RFC 3339 prise en charge. Utilisez une valeur comme "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in French. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être une chaîne décimale canonique.`;

/** Formats an Int64Error in French. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un entier signé 64 bits (Int64) valide.`;

/** Formats a UInt64Error in French. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un entier non signé 64 bits (UInt64) valide.`;

/** Formats an Int64StringError in French. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une chaîne Int64 valide.`;

/** Formats an IdentifierError in French. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un identifiant ${error.casing}.`;

/** Formats a CapitalizedError in French. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit commencer par une majuscule.`;

/** Formats an UncapitalizedError in French. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne doit pas commencer par une majuscule.`;

/** Formats an UppercasedError in French. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être en majuscules.`;

/** Formats a LowercasedError in French. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être en minuscules.`;

/** Formats a TrimmedError in French. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne doit pas avoir d’espaces au début ou à la fin.`;

/** Formats a WellFormedError in French. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être un texte Unicode bien formé.`;

/** Formats a NormalizedError in French. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être en forme de normalisation Unicode ${error.form}.`;

/** Formats a StartsWithError in French. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit commencer par ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in French. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit se terminer par ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in French. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit contenir ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in French. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne doit pas contenir ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in French. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne respecte pas la longueur minimale de ${error.min}.`;

/** Formats a MaxLengthError in French. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} dépasse la longueur maximale de ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in French. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} dépasse la longueur maximale en octets UTF-8 de ${error.max}.`;

/** Formats a LengthError in French. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’a pas la longueur requise de ${error.exact}.`;

/** Formats a RegexError in French. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne correspond pas à /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in French. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une chaîne Base64Url valide.`;

/** Formats a Base64Error in French. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une chaîne Base64 valide.`;

/** Formats a HexError in French. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une chaîne hexadécimale en minuscules avec un nombre pair de chiffres.`;

/** Formats a HexColorError in French. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une couleur au format #rrggbb en minuscules.`;

/** Formats a NameError in French. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un Name valide.`;

/** Formats an EmailError in French. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une adresse e-mail valide.`;

/** Formats a HostnameError in French. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un nom d’hôte en minuscules valide.`;

/** Formats an Ipv4AddressError in French. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une adresse IPv4 valide.`;

/** Formats an Ipv6AddressError in French. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une adresse IPv6 canonique.`;

/** Formats an Ipv6AddressFromStringError in French. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une adresse IPv6 valide.`;

/** Formats an IpAddressError in French. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est ni une adresse IPv4 valide ni une adresse IPv6 canonique.`;

/** Formats an IpAddressFromStringError in French. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une adresse IP valide.`;

/** Formats a PhoneNumberE164Error in French. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un numéro de téléphone au format E.164.`;

/** Formats an IbanError in French. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un IBAN valide en majuscules sans espaces.`;

/** Formats an IsbnError in French. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un ISBN valide à 13 chiffres sans tirets.`;

/** Formats a SimplePasswordError in French. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Le mot de passe ne doit pas avoir d’espaces au début ou à la fin.";
    case "TooLong":
      return "Le mot de passe dépasse la longueur maximale de 64.";
    case "TooShort":
      return "Le mot de passe ne respecte pas la longueur minimale de 8.";
  }
};

/** Formats a MnemonicError in French. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "La valeur n’est pas une phrase mnémonique BIP39 anglaise valide.";

/** Formats an IdError in French. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un Id valide.`;

/** Formats a TableIdError in French. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un Id valide pour la table ${error.table}.`;

/** Formats a UuidError in French. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un UUID canonique en minuscules.`;

/** Formats a UuidVersionError in French. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un UUID de version ${error.version}.`;

/** Formats a UlidError in French. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un ULID canonique en majuscules.`;

/** Formats a NonNegativeError in French. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être positive ou nulle (>= 0).`;

/** Formats a NonNegativeDecimalStringError in French. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être une chaîne décimale positive ou nulle.`;

/** Formats a PositiveError in French. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être positive (> 0).`;

/** Formats a PositiveDecimalStringError in French. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être une chaîne décimale positive.`;

/** Formats a NonPositiveError in French. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être négative ou nulle (<= 0).`;

/** Formats a NonPositiveDecimalStringError in French. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être une chaîne décimale négative ou nulle.`;

/** Formats a NegativeError in French. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être négative (< 0).`;

/** Formats a NegativeDecimalStringError in French. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être une chaîne décimale négative.`;

/** Formats an IntError in French. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être un entier sûr.`;

/** Formats an IntFromStringError in French. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un entier décimal.`;

/** Formats a FiniteNumberFromStringError in French. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un nombre décimal.`;

/** Formats a GreaterThanError in French. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être supérieure à ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in French. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être supérieure ou égale à ${error.min}.`;

/** Formats a LessThanError in French. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être inférieure à ${error.max}.`;

/** Formats a LessThanOrEqualToError in French. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être inférieure ou égale à ${error.max}.`;

/** Formats a NonNaNError in French. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "La valeur ne doit pas être NaN.";

/** Formats a FiniteError in French. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être finie.`;

/** Formats a MultipleOfError in French. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être un multiple de ${error.divisor}.`;

/** Formats a BetweenError in French. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être comprise entre ${error.min} et ${error.max}, inclus.`;

/** Formats a GreaterThanBigIntError in French. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être supérieure à ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in French. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être supérieure ou égale à ${error.min}.`;

/** Formats a LessThanBigIntError in French. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être inférieure à ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in French. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être inférieure ou égale à ${error.max}.`;

/** Formats a BetweenBigIntError in French. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit être comprise entre ${error.min} et ${error.max}, inclus.`;

/** Formats an ArrayError in French. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `La valeur ${safelyStringifyUnknownValue(error.reason.value)} n’est pas un tableau.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `L’élément du tableau à l’indice ${issue.index} est manquant.`;
    case "Accessor":
      return `L’élément du tableau à l’indice ${issue.index} doit être une propriété de données.`;
    case "ExcessProperty":
      return "Une propriété Array excédentaire n’est pas autorisée. Supprimez-la ou utilisez un autre Type.";
    case "Element":
      return `L’élément du tableau à l’indice ${issue.index} n’est pas valide.`;
  }
};

/** Formats a NonEmptyArrayError in French. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit contenir au moins un élément.`;

/** Formats a UniqueError in French. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} contient des éléments égaux aux indices ${error.previousIndex} et ${error.index}.`;

/** Formats a SetError in French. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `La valeur ${safelyStringifyUnknownValue(error.reason.value)} n’est pas un Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `La propriété Set excédentaire ${safelyStringifyUnknownValue(issue.key)} n’est pas autorisée.`;
    case "Element":
      return `L’élément Set à l’indice ${issue.index} n’est pas valide.`;
  }
};

/** Formats a MapError in French. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `La valeur ${safelyStringifyUnknownValue(error.reason.value)} n’est pas un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `La propriété Map excédentaire ${safelyStringifyUnknownValue(issue.key)} n’est pas autorisée.`;
    case "Key":
      return `La clé Map à l’indice ${issue.index} n’est pas valide.`;
    case "Value":
      return `La valeur Map à l’indice ${issue.index} n’est pas valide.`;
    case "Collision":
      return `Les clés Map aux indices ${issue.previousIndex} et ${issue.index} sont décodées en la même clé ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in French. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `La taille ${error.value.size} ne respecte pas la taille minimale de ${error.min}.`;

/** Formats a MaxSizeError in French. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `La taille ${error.value.size} dépasse la taille maximale de ${error.max}.`;

/** Formats a TupleError in French. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `La valeur ${safelyStringifyUnknownValue(error.reason.value)} n’est pas un tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Un Tuple doit avoir une longueur de ${error.reason.expected}, mais la valeur a une longueur de ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `L’élément Tuple à l’indice ${issue.index} est manquant.`;
    case "Accessor":
      return `L’élément Tuple à l’indice ${issue.index} doit être une propriété de données.`;
    case "ExcessProperty":
      return "Une propriété Tuple excédentaire n’est pas autorisée. Supprimez-la ou utilisez un autre Type.";
    case "Element":
      return `L’élément Tuple à l’indice ${issue.index} n’est pas valide.`;
  }
};

/** Formats a RecordError in French. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `La valeur ${safelyStringifyUnknownValue(error.reason.value)} n’est pas un Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "La valeur est un objet, mais la sortie Record doit être un objet simple ou avoir un prototype nul.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `La clé de propriété ${safelyStringifyUnknownValue(issue.key)} n’est pas valide.`;
    case "Value":
      return `La valeur de la propriété ${safelyStringifyUnknownValue(issue.key)} n’est pas valide.`;
    case "Accessor":
      return `La propriété Record ${safelyStringifyUnknownValue(issue.key)} doit être une propriété de données.`;
    case "NonEnumerable":
      return `La propriété Record ${safelyStringifyUnknownValue(issue.key)} doit être énumérable.`;
    case "Collision":
      return `Les clés Record ${safelyStringifyUnknownValue(issue.previousKey)} et ${safelyStringifyUnknownValue(issue.key)} sont décodées en la même clé ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in French. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne respecte pas le nombre minimal d’entrées de ${error.min}.`;

/** Formats a MaxEntriesError in French. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} dépasse le nombre maximal d’entrées de ${error.max}.`;

/** Formats an ObjectError in French. */
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
        return "Une propriété Object doit être une propriété de données. Convertissez les valeurs d’accesseur en données simples avant d’utiliser ce Type, ou utilisez un autre Type.";
      case "NonEnumerable":
        return "Une propriété Object doit être énumérable. Rendez-la énumérable ou utilisez un autre Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `La propriété requise ${safelyStringifyUnknownValue(key)} est manquante.`;
  }
  if (typeof key === "symbol") {
    return "La clé d’une propriété Object doit être une chaîne. Supprimez la propriété symbole ou utilisez un autre Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `La propriété ${safelyStringifyUnknownValue(key)} n’est pas autorisée. Supprimez-la ou utilisez un autre Type.`;
  }
  return `La propriété ${safelyStringifyUnknownValue(key)} n’est pas valide.`;
};

/** Formats a DiscriminatedUnionError in French. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `La propriété discriminante ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} doit être une propriété de données.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} doit être une propriété propre.`;
      }
      return `${property} doit être énumérable.`;
    }
    case "Discriminator":
      return `La propriété discriminante ${safelyStringifyUnknownValue(error.reason.key)} a une valeur inattendue ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `La variante sélectionnée ${safelyStringifyUnknownValue(error.reason.discriminator)} n’est pas valide.`;
  }
};

/** Formats a DataError in French. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `La valeur ${safelyStringifyUnknownValue(issue.value)} n’est pas une valeur Data.`;
    case "UnexpectedPrototype":
      return `Une valeur Data de type ${issue.container} a un prototype inattendu.`;
    case "Accessor":
      return "Une propriété Data doit être une propriété de données. Convertissez les valeurs d’accesseur en données simples avant d’utiliser ce Type, ou utilisez un autre Type.";
    case "NonEnumerable":
      return "Une propriété d’objet Data doit être énumérable. Supprimez-la ou utilisez un autre Type.";
    case "SymbolProperty":
      return "La clé d’une propriété d’objet Data doit être une chaîne. Supprimez la propriété symbole ou utilisez un autre Type.";
    case "Hole":
      return "Un élément de tableau Data est manquant.";
    case "InvalidUint8Array":
      return "Un Uint8Array Data doit reposer sur un ArrayBuffer non détaché et rester dans ses limites.";
    case "ExcessProperty":
      return `Une valeur Data de type ${issue.container} ne doit pas avoir de propriétés propres excédentaires. Supprimez la propriété ou utilisez un autre Type.`;
  }
};

/** Formats a JsonValueError in French. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `La valeur ${safelyStringifyUnknownValue(issue.value)} n’est pas une valeur JSON.`;
    case "NonFiniteNumber":
      return "Un nombre JSON doit être fini.";
    case "UnexpectedPrototype":
      return "La valeur est un objet, mais un objet JsonValue doit être un objet simple ou avoir un prototype nul.";
    case "Accessor":
      return "Une propriété JSON doit être une propriété de données. Convertissez les valeurs d’accesseur en données simples avant d’utiliser ce Type, ou utilisez un autre Type.";
    case "NonEnumerable":
      return "Une propriété d’objet JSON doit être énumérable. Supprimez-la ou utilisez un autre Type.";
    case "SymbolProperty":
      return "La clé d’une propriété d’objet JSON doit être une chaîne. Supprimez la propriété symbole ou utilisez un autre Type.";
    case "Hole":
      return "Un élément de tableau JSON est manquant.";
    case "ExcessProperty":
      return "Une propriété de tableau JSON excédentaire n’est pas autorisée. Supprimez-la ou utilisez un autre Type.";
    case "CircularReference":
      return "Un JsonValue ne doit pas contenir de références circulaires.";
  }
};

/** Formats a JsonError in French. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne peut pas être analysée comme un JsonValue.`;

/** Formats a ByteSizeLiteralError in French. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un littéral de taille en octets. Utilisez une valeur comme "512KiB" ou "1MiB".`;

/** Formats a ByteLengthError in French. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "La valeur -0 n’est pas une longueur en octets. Utilisez plutôt 0.";

/** Formats a ByteLengthFromStringError in French. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une longueur en octets. Utilisez un nombre d’octets ou un littéral comme 10MiB.`;

/** Formats a DurationLiteralError in French. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un littéral de durée. Utilisez une valeur comme "500ms" ou "1.5s".`;

/** Formats a PercentageLiteralError in French. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un littéral de pourcentage. Utilisez une valeur comme "50%" ou "12.5%".`;
