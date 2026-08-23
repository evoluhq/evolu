/**
 * Formatters for Evolu Type errors in French.
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

  return `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un(e) ${typeOf}.`;
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

/** Formats an InstanceOfError in French. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une instance de ${error.constructorName}.`;

/** Formats a LiteralError in French. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas strictement égale au littéral attendu : ${globalThis.String(error.expected)}.`;

/** Formats a UnionError in French. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "La valeur ne correspond à aucune variante autorisée.";

/** Formats a DateIsoError in French. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une chaîne de date et d’heure ISO canonique.`;

/** Formats a DateIsoFromDateError in French. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "La Date ne peut pas être représentée comme DateIso.";

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

/** Formats a CapitalizedError in French. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} doit commencer par une majuscule.`;

/** Formats a TrimmedError in French. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} ne doit pas avoir d’espaces au début ou à la fin.`;

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

/** Formats a NameError in French. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un Name valide.`;

/** Formats a MnemonicError in French. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas une phrase mnémonique BIP39 anglaise valide.`;

/** Formats an IdError in French. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un Id valide.`;

/** Formats a TableIdError in French. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `La valeur ${safelyStringifyUnknownValue(error.value)} n’est pas un Id valide pour la table ${error.table}.`;

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
    case "Value":
      return `L’élément Map à l’indice ${issue.index} n’est pas valide.`;
    case "Collision":
      return `Les clés Map ${safelyStringifyUnknownValue(issue.previousKey)} et ${safelyStringifyUnknownValue(issue.key)} sont décodées en la même clé ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in French. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `La valeur ${safelyStringifyUnknownValue(error.reason.value)} n’est pas un tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Un Tuple doit contenir exactement ${error.reason.expected} éléments, mais la valeur en contient ${error.reason.actual}.`;
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
