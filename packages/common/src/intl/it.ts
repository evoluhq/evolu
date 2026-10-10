/**
 * Italian Evolu Type error formatters.
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

  return `Il valore ${safelyStringifyUnknownValue(error.value)} non è di tipo ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Il valore ${safelyStringifyUnknownValue(reason.value)} non è un oggetto.`
    : "Il valore è un oggetto, ma l’Output di Object deve essere un oggetto semplice o avere un prototipo null.";

/** Formats a NeverError in Italian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è valido per il tipo Never.`;

/** Formats a String TypeOfError in Italian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Italian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non corrisponde al template literal.`;

/** Formats a Number TypeOfError in Italian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Italian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Italian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Italian. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un booleano. Usa true o false.`;

/** Formats a Symbol TypeOfError in Italian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Italian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Italian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Evolu Type.`;

/** Formats an ObjectTagError in Italian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non ha il tag dell’oggetto previsto ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Italian. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "L’oggetto Date non è valido.";

/** Formats an InstanceOfError in Italian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un’istanza di ${error.constructorName}.`;

/** Formats a LiteralError in Italian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è strettamente uguale al letterale previsto: ${String(error.expected)}.`;

/** Formats a UnionError in Italian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Il valore non corrisponde ad alcuna variante consentita.";

/** Formats a DateIsoError in Italian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una stringa data-ora ISO canonica.`;

/** Formats a PlainDateIsoError in Italian. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una data di calendario valida nel formato YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Italian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "L’oggetto Date non può essere rappresentato come DateIso.";

/** Formats a DateIsoFromRfc3339Error in Italian. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una data-ora RFC 3339 supportata. Usa un valore come "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Italian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale canonica.`;

/** Formats an Int64Error in Italian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un intero con segno a 64 bit valido (Int64).`;

/** Formats a UInt64Error in Italian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un intero senza segno a 64 bit valido (UInt64).`;

/** Formats an Int64StringError in Italian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una stringa Int64 valida.`;

/** Formats an IdentifierError in Italian. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un identificatore ${error.casing}.`;

/** Formats a CapitalizedError in Italian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve iniziare con una lettera maiuscola.`;

/** Formats an UncapitalizedError in Italian. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non deve iniziare con una lettera maiuscola.`;

/** Formats an UppercasedError in Italian. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere in maiuscolo.`;

/** Formats a LowercasedError in Italian. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere in minuscolo.`;

/** Formats a TrimmedError in Italian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non deve contenere spazi bianchi iniziali o finali.`;

/** Formats a WellFormedError in Italian. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere un testo Unicode ben formato.`;

/** Formats a NormalizedError in Italian. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere nella forma di normalizzazione Unicode ${error.form}.`;

/** Formats a StartsWithError in Italian. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve iniziare con ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Italian. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve terminare con ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Italian. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve contenere ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Italian. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non deve contenere ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Italian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non raggiunge la lunghezza minima di ${error.min}.`;

/** Formats a MaxLengthError in Italian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} supera la lunghezza massima di ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Italian. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} supera la lunghezza massima in byte UTF-8 di ${error.max}.`;

/** Formats a LengthError in Italian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non ha la lunghezza richiesta di ${error.exact}.`;

/** Formats a RegexError in Italian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non corrisponde a /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Italian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una stringa Base64Url valida.`;

/** Formats a Base64Error in Italian. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una stringa Base64 valida.`;

/** Formats a HexError in Italian. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è esadecimale in minuscolo con un numero pari di cifre.`;

/** Formats a HexColorError in Italian. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un colore nel formato #rrggbb in minuscolo.`;

/** Formats a NameError in Italian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Name valido.`;

/** Formats an EmailError in Italian. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un indirizzo email valido.`;

/** Formats a HostnameError in Italian. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un nome host in minuscolo valido.`;

/** Formats an Ipv4AddressError in Italian. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un indirizzo IPv4 valido.`;

/** Formats an Ipv6AddressError in Italian. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un indirizzo IPv6 canonico.`;

/** Formats an Ipv6AddressFromStringError in Italian. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un indirizzo IPv6 valido.`;

/** Formats an IpAddressError in Italian. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un indirizzo IPv4 valido né un indirizzo IPv6 canonico.`;

/** Formats an IpAddressFromStringError in Italian. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un indirizzo IP valido.`;

/** Formats a PhoneNumberE164Error in Italian. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un numero di telefono in formato E.164.`;

/** Formats an IbanError in Italian. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un IBAN valido in maiuscolo e senza spazi.`;

/** Formats an IsbnError in Italian. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un ISBN valido di 13 cifre senza trattini.`;

/** Formats a SimplePasswordError in Italian. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "La password non deve contenere spazi bianchi iniziali o finali.";
    case "TooLong":
      return "La password supera la lunghezza massima di 64.";
    case "TooShort":
      return "La password non raggiunge la lunghezza minima di 8.";
  }
};

/** Formats a MnemonicError in Italian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Il valore non è una frase mnemonica BIP39 inglese valida.";

/** Formats an IdError in Italian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Id valido.`;

/** Formats a TableIdError in Italian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un Id valido per la tabella ${error.table}.`;

/** Formats a UuidError in Italian. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un UUID canonico in minuscolo.`;

/** Formats a UuidVersionError in Italian. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un UUID di versione ${error.version}.`;

/** Formats a UlidError in Italian. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un ULID canonico in maiuscolo.`;

/** Formats a NonNegativeError in Italian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere non negativo (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Italian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale non negativa.`;

/** Formats a PositiveError in Italian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere positivo (> 0).`;

/** Formats a PositiveDecimalStringError in Italian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale positiva.`;

/** Formats a NonPositiveError in Italian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere non positivo (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Italian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale non positiva.`;

/** Formats a NegativeError in Italian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere negativo (< 0).`;

/** Formats a NegativeDecimalStringError in Italian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere una stringa decimale negativa.`;

/** Formats an IntError in Italian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere un intero sicuro.`;

/** Formats an IntFromStringError in Italian. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un intero decimale.`;

/** Formats a FiniteNumberFromStringError in Italian. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un numero decimale.`;

/** Formats a GreaterThanError in Italian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere maggiore di ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Italian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere maggiore o uguale a ${error.min}.`;

/** Formats a LessThanError in Italian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere minore di ${error.max}.`;

/** Formats a LessThanOrEqualToError in Italian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere minore o uguale a ${error.max}.`;

/** Formats a NonNaNError in Italian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Il valore non deve essere NaN.";

/** Formats a FiniteError in Italian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere finito.`;

/** Formats a MultipleOfError in Italian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere un multiplo di ${error.divisor}.`;

/** Formats a BetweenError in Italian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere compreso tra ${error.min} e ${error.max}, estremi inclusi.`;

/** Formats a GreaterThanBigIntError in Italian. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere maggiore di ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Italian. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere maggiore o uguale a ${error.min}.`;

/** Formats a LessThanBigIntError in Italian. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere minore di ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Italian. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere minore o uguale a ${error.max}.`;

/** Formats a BetweenBigIntError in Italian. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve essere compreso tra ${error.min} e ${error.max}, estremi inclusi.`;

/** Formats an ArrayError in Italian. */
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

/** Formats a NonEmptyArrayError in Italian. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} deve contenere almeno un elemento.`;

/** Formats a UniqueError in Italian. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} ha elementi uguali agli indici ${error.previousIndex} e ${error.index}.`;

/** Formats a SetError in Italian. */
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

/** Formats a MapError in Italian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Il valore ${safelyStringifyUnknownValue(error.reason.value)} non è un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `La proprietà Map in eccesso ${safelyStringifyUnknownValue(issue.key)} non è consentita.`;
    case "Key":
      return `La chiave del Map all’indice ${issue.index} non è valida.`;
    case "Value":
      return `Il valore del Map all’indice ${issue.index} non è valido.`;
    case "Collision":
      return `Le chiavi del Map agli indici ${issue.previousIndex} e ${issue.index} vengono decodificate nella stessa chiave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Italian. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `La dimensione ${error.value.size} non raggiunge la dimensione minima di ${error.min}.`;

/** Formats a MaxSizeError in Italian. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `La dimensione ${error.value.size} supera la dimensione massima di ${error.max}.`;

/** Formats a TupleError in Italian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Il valore ${safelyStringifyUnknownValue(error.reason.value)} non è una tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Una Tuple deve avere una lunghezza di ${error.reason.expected}, ma il valore ha una lunghezza di ${error.reason.actual}.`;
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

/** Formats a RecordError in Italian. */
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

/** Formats a MinEntriesError in Italian. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non raggiunge il numero minimo di voci, che è ${error.min}.`;

/** Formats a MaxEntriesError in Italian. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} supera il numero massimo di voci, che è ${error.max}.`;

/** Formats an ObjectError in Italian. */
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

/** Formats a DiscriminatedUnionError in Italian. */
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

/** Formats a DataError in Italian. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Il valore ${safelyStringifyUnknownValue(issue.value)} non è un valore Data.`;
    case "UnexpectedPrototype":
      return `Un valore Data di tipo ${issue.container} ha un prototipo inatteso.`;
    case "Accessor":
      return "Una proprietà Data deve essere una proprietà dati. Materializza i valori degli accessor come dati semplici prima di usare questo Type, oppure usa un Type diverso.";
    case "NonEnumerable":
      return "Una proprietà di un oggetto Data deve essere enumerabile. Rimuovila oppure usa un Type diverso.";
    case "SymbolProperty":
      return "La chiave di una proprietà di un oggetto Data deve essere una stringa. Rimuovi la proprietà symbol oppure usa un Type diverso.";
    case "Hole":
      return "Manca un elemento dell’array Data.";
    case "InvalidUint8Array":
      return "Un Uint8Array Data deve avere un ArrayBuffer non scollegato e rientrare nei suoi limiti.";
    case "ExcessProperty":
      return `Un valore Data di tipo ${issue.container} non deve avere proprietà proprie in eccesso. Rimuovi la proprietà oppure usa un Type diverso.`;
  }
};

/** Formats a JsonValueError in Italian. */
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
      return "Una proprietà in eccesso dell’array JSON non è consentita. Rimuovila oppure usa un Type diverso.";
    case "CircularReference":
      return "Un JsonValue non deve contenere riferimenti circolari.";
  }
};

/** Formats a JsonError in Italian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non può essere interpretato come JsonValue.`;

/** Formats a ByteSizeLiteralError in Italian. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un letterale di dimensione in byte. Usa un valore come "512KiB" o "1MiB".`;

/** Formats a ByteLengthError in Italian. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Il valore -0 non è una lunghezza in byte. Usa invece 0.";

/** Formats a ByteLengthFromStringError in Italian. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è una lunghezza in byte. Usa un numero di byte o un letterale come 10MiB.`;

/** Formats a DurationLiteralError in Italian. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un letterale di durata. Usa un valore come "500ms" o "1.5s".`;

/** Formats a PercentageLiteralError in Italian. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Il valore ${safelyStringifyUnknownValue(error.value)} non è un letterale di percentuale. Usa un valore come "50%" o "12.5%".`;
