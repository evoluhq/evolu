/**
 * Formattatori italiani degli errori di Evolu Type.
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

  return `Il valore ${safelyStringifyUnknownValue(error.value)} non è di tipo ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Il valore ${safelyStringifyUnknownValue(reason.value)} non è un oggetto.`
    : "Il valore è un oggetto, ma l’Output di Object deve essere un oggetto semplice o avere un prototipo null.";

/** Formatta NeverError in italiano. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è valido per il tipo Never.`;

/** Formatta String TypeOfError in italiano. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formatta TemplateLiteralError in italiano. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non corrisponde al template literal.`;

/** Formatta Number TypeOfError in italiano. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formatta BigInt TypeOfError in italiano. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formatta Boolean TypeOfError in italiano. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formatta Symbol TypeOfError in italiano. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formatta Function TypeOfError in italiano. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formatta EvoluTypeError in italiano. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Evolu Type.`;

/** Formatta ObjectTagError in italiano. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non ha il tag dell’oggetto previsto ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formatta InstanceOfError in italiano. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un’istanza di ${error.constructorName}.`;

/** Formatta LiteralError in italiano. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è strettamente uguale al letterale previsto: ${globalThis.String(error.expected)}.`;

/** Formatta UnionError in italiano. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Il valore non corrisponde ad alcuna variante consentita.";

/** Formatta DateIsoError in italiano. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una stringa data-ora ISO canonica.`;

/** Formatta DateIsoFromDateError in italiano. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "L’oggetto Date non può essere rappresentato come DateIso.";

/** Formatta DecimalStringError in italiano. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale canonica.`;

/** Formatta Int64Error in italiano. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un intero con segno a 64 bit valido (Int64).`;

/** Formatta UInt64Error in italiano. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un intero senza segno a 64 bit valido (UInt64).`;

/** Formatta Int64StringError in italiano. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una stringa Int64 valida.`;

/** Formatta CapitalizedError in italiano. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve iniziare con una lettera maiuscola.`;

/** Formatta TrimmedError in italiano. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non deve contenere spazi bianchi iniziali o finali.`;

/** Formatta MinLengthError in italiano. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non raggiunge la lunghezza minima di ${error.min}.`;

/** Formatta MaxLengthError in italiano. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} supera la lunghezza massima di ${error.max}.`;

/** Formatta LengthError in italiano. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non ha la lunghezza richiesta di ${error.exact}.`;

/** Formatta RegexError in italiano. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non corrisponde a /${error.source}/${error.flags}.`;

/** Formatta Base64UrlError in italiano. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una stringa Base64Url valida.`;

/** Formatta NameError in italiano. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Name valido.`;

/** Formatta MnemonicError in italiano. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una frase mnemonica BIP39 inglese valida.`;

/** Formatta IdError in italiano. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Id valido.`;

/** Formatta TableIdError in italiano. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Id valido per la tabella ${error.table}.`;

/** Formatta NonNegativeError in italiano. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere non negativo (>= 0).`;

/** Formatta NonNegativeDecimalStringError in italiano. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale non negativa.`;

/** Formatta PositiveError in italiano. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere positivo (> 0).`;

/** Formatta PositiveDecimalStringError in italiano. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale positiva.`;

/** Formatta NonPositiveError in italiano. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere non positivo (<= 0).`;

/** Formatta NonPositiveDecimalStringError in italiano. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale non positiva.`;

/** Formatta NegativeError in italiano. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere negativo (< 0).`;

/** Formatta NegativeDecimalStringError in italiano. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale negativa.`;

/** Formatta IntError in italiano. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere un intero sicuro.`;

/** Formatta GreaterThanError in italiano. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere maggiore di ${error.min}.`;

/** Formatta GreaterThanOrEqualToError in italiano. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere maggiore o uguale a ${error.min}.`;

/** Formatta LessThanError in italiano. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere minore di ${error.max}.`;

/** Formatta LessThanOrEqualToError in italiano. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere minore o uguale a ${error.max}.`;

/** Formatta NonNaNError in italiano. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Il valore non deve essere NaN.";

/** Formatta FiniteError in italiano. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere finito.`;

/** Formatta MultipleOfError in italiano. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere un multiplo di ${error.divisor}.`;

/** Formatta BetweenError in italiano. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere compreso tra ${error.min} e ${error.max}, estremi inclusi.`;

/** Formatta ArrayError in italiano. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Il valore ${safelyStringifyUnknownValue(error.reason.value)} non è un array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Manca un elemento dell’array all’indice ${issue.index}.`;
    case "Accessor":
      return `L’elemento dell’array all’indice ${issue.index} deve essere una proprietà dati.`;
    case "ExcessProperty":
      return "Una proprietà Array in eccesso non è consentita. Rimuovila oppure usa un Type diverso.";
    case "Element":
      return `L’elemento dell’array all’indice ${issue.index} non è valido.`;
  }
};

/** Formatta SetError in italiano. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Il valore ${safelyStringifyUnknownValue(error.reason.value)} non è un Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `La proprietà Set in eccesso ${safelyStringifyUnknownValue(issue.key)} non è consentita.`;
    case "Element":
      return `L’elemento del Set all’indice ${issue.index} non è valido.`;
  }
};

/** Formatta MapError in italiano. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Il valore ${safelyStringifyUnknownValue(error.reason.value)} non è un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `La proprietà Map in eccesso ${safelyStringifyUnknownValue(issue.key)} non è consentita.`;
    case "Key":
    case "Value":
      return `L’elemento del Map all’indice ${issue.index} non è valido.`;
    case "Collision":
      return `Le chiavi Map ${safelyStringifyUnknownValue(issue.previousKey)} e ${safelyStringifyUnknownValue(issue.key)} vengono decodificate nella stessa chiave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formatta TupleError in italiano. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Il valore ${safelyStringifyUnknownValue(error.reason.value)} non è una tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Una Tuple deve contenere esattamente ${error.reason.expected} elementi, ma il valore ne contiene ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Manca un elemento della Tuple all’indice ${issue.index}.`;
    case "Accessor":
      return `L’elemento della Tuple all’indice ${issue.index} deve essere una proprietà dati.`;
    case "ExcessProperty":
      return "Una proprietà Tuple in eccesso non è consentita. Rimuovila oppure usa un Type diverso.";
    case "Element":
      return `L’elemento della Tuple all’indice ${issue.index} non è valido.`;
  }
};

/** Formatta RecordError in italiano. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Il valore ${safelyStringifyUnknownValue(error.reason.value)} non è un Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Il valore è un oggetto, ma l’Output di Record deve essere un oggetto semplice o avere un prototipo null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `La chiave della proprietà ${safelyStringifyUnknownValue(issue.key)} non è valida.`;
    case "Value":
      return `Il valore della proprietà ${safelyStringifyUnknownValue(issue.key)} non è valido.`;
    case "Accessor":
      return `La proprietà Record ${safelyStringifyUnknownValue(issue.key)} deve essere una proprietà dati.`;
    case "NonEnumerable":
      return `La proprietà Record ${safelyStringifyUnknownValue(issue.key)} deve essere enumerabile.`;
    case "Collision":
      return `Le chiavi Record ${safelyStringifyUnknownValue(issue.previousKey)} e ${safelyStringifyUnknownValue(issue.key)} vengono decodificate nella stessa chiave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formatta ObjectError in italiano. */
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
        return "Una proprietà Object deve essere una proprietà dati. Materializza i valori degli accessor come dati semplici prima di usare questo Type, oppure usa un Type diverso.";
      case "NonEnumerable":
        return "Una proprietà Object deve essere enumerabile. Rendila enumerabile oppure usa un Type diverso.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Manca la proprietà obbligatoria ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "La chiave di una proprietà Object deve essere una stringa. Rimuovi la proprietà symbol oppure usa un Type diverso.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `La proprietà ${safelyStringifyUnknownValue(key)} non è consentita. Rimuovila oppure usa un Type diverso.`;
  }
  return `La proprietà ${safelyStringifyUnknownValue(key)} non è valida.`;
};

/** Formatta DiscriminatedUnionError in italiano. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `La proprietà discriminante ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} deve essere una proprietà dati.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} deve essere una proprietà propria.`;
      }
      return `${property} deve essere enumerabile.`;
    }
    case "Discriminator":
      return `La proprietà discriminante ${safelyStringifyUnknownValue(error.reason.key)} ha un valore inatteso ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `La variante selezionata ${safelyStringifyUnknownValue(error.reason.discriminator)} non è valida.`;
  }
};

/** Formatta JsonValueError in italiano. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Il valore ${safelyStringifyUnknownValue(issue.value)} non è un valore JSON.`;
    case "NonFiniteNumber":
      return "Un numero JSON deve essere finito.";
    case "UnexpectedPrototype":
      return "Il valore è un oggetto, ma un oggetto JsonValue deve essere un oggetto semplice o avere un prototipo null.";
    case "Accessor":
      return "Una proprietà JSON deve essere una proprietà dati. Materializza i valori degli accessor come dati semplici prima di usare questo Type, oppure usa un Type diverso.";
    case "NonEnumerable":
      return "Una proprietà di un oggetto JSON deve essere enumerabile. Rimuovila oppure usa un Type diverso.";
    case "SymbolProperty":
      return "La chiave di una proprietà di un oggetto JSON deve essere una stringa. Rimuovi la proprietà symbol oppure usa un Type diverso.";
    case "Hole":
      return "Manca un elemento dell’array JSON.";
    case "ExcessProperty":
      return "Una proprietà dell’array JSON in eccesso non è consentita. Rimuovila oppure usa un Type diverso.";
    case "CircularReference":
      return "Un JsonValue non deve contenere riferimenti circolari.";
  }
};

/** Formatta JsonError in italiano. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non può essere interpretato come JsonValue.`;
