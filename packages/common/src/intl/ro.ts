/**
 * Romanian Evolu Type error formatters.
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

  return `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este de tipul ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Valoarea ${safelyStringifyUnknownValue(reason.value)} nu este un obiect.`
    : "Valoarea este un obiect, dar un Output Object trebuie să fie un obiect simplu sau să aibă un prototip null.";

/** Formats a NeverError in Romanian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este validă pentru tipul Never.`;

/** Formats a String TypeOfError in Romanian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Romanian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu corespunde literalului șablon.`;

/** Formats a Number TypeOfError in Romanian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Romanian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Romanian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Romanian. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o valoare booleană. Folosiți true sau false.`;

/** Formats a Symbol TypeOfError in Romanian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Romanian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Romanian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Evolu Type.`;

/** Formats an ObjectTagError in Romanian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu are eticheta de obiect așteptată ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Romanian. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Obiectul Date nu este valid.";

/** Formats an InstanceOfError in Romanian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o instanță a clasei ${error.constructorName}.`;

/** Formats a LiteralError in Romanian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este strict egală cu literalul așteptat: ${String(error.expected)}.`;

/** Formats a UnionError in Romanian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "O valoare nu corespunde niciunei variante permise.";

/** Formats a DateIsoError in Romanian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir canonic de dată și oră ISO.`;

/** Formats a PlainDateIsoError in Romanian. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o dată calendaristică validă în formatul YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Romanian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Obiectul Date nu poate fi reprezentat ca DateIso.";

/** Formats a DateIsoFromRfc3339Error in Romanian. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o dată și oră RFC 3339 acceptată. Folosiți o valoare precum "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Romanian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal canonic.`;

/** Formats an Int64Error in Romanian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un număr întreg valid cu semn pe 64 de biți (Int64).`;

/** Formats a UInt64Error in Romanian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un număr întreg valid fără semn pe 64 de biți (UInt64).`;

/** Formats an Int64StringError in Romanian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir Int64 valid.`;

/** Formats an IdentifierError in Romanian. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un identificator ${error.casing}.`;

/** Formats a CapitalizedError in Romanian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să înceapă cu literă mare.`;

/** Formats an UncapitalizedError in Romanian. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu trebuie să înceapă cu o literă mare.`;

/** Formats an UppercasedError in Romanian. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie scrisă cu majuscule.`;

/** Formats a LowercasedError in Romanian. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie scrisă cu minuscule.`;

/** Formats a TrimmedError in Romanian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie fără spații la început sau la sfârșit.`;

/** Formats a WellFormedError in Romanian. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un text Unicode bine format.`;

/** Formats a NormalizedError in Romanian. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie în forma de normalizare Unicode ${error.form}.`;

/** Formats a StartsWithError in Romanian. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să înceapă cu ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Romanian. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să se termine cu ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Romanian. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să conțină ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Romanian. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu trebuie să conțină ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Romanian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu îndeplinește lungimea minimă de ${error.min}.`;

/** Formats a MaxLengthError in Romanian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} depășește lungimea maximă de ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Romanian. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} depășește lungimea maximă în octeți UTF-8 de ${error.max}.`;

/** Formats a LengthError in Romanian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu are lungimea necesară de ${error.exact}.`;

/** Formats a RegexError in Romanian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu corespunde cu /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Romanian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir Base64Url valid.`;

/** Formats a Base64Error in Romanian. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir Base64 valid.`;

/** Formats a HexError in Romanian. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir hexazecimal cu litere mici și un număr par de cifre.`;

/** Formats a HexColorError in Romanian. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o culoare în formatul #rrggbb cu litere mici.`;

/** Formats a NameError in Romanian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Name valid.`;

/** Formats an EmailError in Romanian. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o adresă de e-mail validă.`;

/** Formats a HostnameError in Romanian. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un nume de gazdă valid cu litere mici.`;

/** Formats an Ipv4AddressError in Romanian. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o adresă IPv4 validă.`;

/** Formats an Ipv6AddressError in Romanian. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o adresă IPv6 canonică.`;

/** Formats an Ipv6AddressFromStringError in Romanian. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o adresă IPv6 validă.`;

/** Formats an IpAddressError in Romanian. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o adresă IPv4 validă sau o adresă IPv6 canonică.`;

/** Formats an IpAddressFromStringError in Romanian. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o adresă IP validă.`;

/** Formats a PhoneNumberE164Error in Romanian. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un număr de telefon în formatul E.164.`;

/** Formats an IbanError in Romanian. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un IBAN valid scris cu majuscule și fără spații.`;

/** Formats an IsbnError in Romanian. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un ISBN valid de 13 cifre fără cratime.`;

/** Formats a SimplePasswordError in Romanian. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Parola trebuie să fie fără spații la început sau la sfârșit.";
    case "TooLong":
      return "Parola depășește lungimea maximă de 64.";
    case "TooShort":
      return "Parola nu îndeplinește lungimea minimă de 8.";
  }
};

/** Formats a MnemonicError in Romanian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Valoarea nu este o frază mnemonică BIP39 în engleză validă.";

/** Formats a RedactedError in Romanian. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "Secretul trebuie să fie un șir.";

/** Formats an IdError in Romanian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Id valid.`;

/** Formats a TableIdError in Romanian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Id valid pentru tabelul ${error.table}.`;

/** Formats a UuidError in Romanian. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un UUID canonic cu litere mici.`;

/** Formats a UuidVersionError in Romanian. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un UUID de versiunea ${error.version}.`;

/** Formats a UlidError in Romanian. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un ULID canonic cu majuscule.`;

/** Formats a NonNegativeError in Romanian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie nenegativă (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Romanian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal nenegativ.`;

/** Formats a PositiveError in Romanian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie pozitivă (> 0).`;

/** Formats a PositiveDecimalStringError in Romanian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal pozitiv.`;

/** Formats a NonPositiveError in Romanian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie nepozitivă (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Romanian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal nepozitiv.`;

/** Formats a NegativeError in Romanian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie negativă (< 0).`;

/** Formats a NegativeDecimalStringError in Romanian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal negativ.`;

/** Formats an IntError in Romanian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un număr întreg sigur.`;

/** Formats an IntFromStringError in Romanian. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un întreg zecimal.`;

/** Formats a FiniteNumberFromStringError in Romanian. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un număr zecimal.`;

/** Formats a GreaterThanError in Romanian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mare decât ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Romanian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mare sau egală cu ${error.min}.`;

/** Formats a LessThanError in Romanian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mică decât ${error.max}.`;

/** Formats a LessThanOrEqualToError in Romanian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mică sau egală cu ${error.max}.`;

/** Formats a NonNaNError in Romanian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Valoarea nu trebuie să fie NaN.";

/** Formats a FiniteError in Romanian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie finită.`;

/** Formats a MultipleOfError in Romanian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un multiplu de ${error.divisor}.`;

/** Formats a BetweenError in Romanian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie între ${error.min} și ${error.max}, inclusiv.`;

/** Formats a GreaterThanBigIntError in Romanian. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mare decât ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Romanian. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mare sau egală cu ${error.min}.`;

/** Formats a LessThanBigIntError in Romanian. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mică decât ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Romanian. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mică sau egală cu ${error.max}.`;

/** Formats a BetweenBigIntError in Romanian. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie între ${error.min} și ${error.max}, inclusiv.`;

/** Formats an ArrayError in Romanian. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un tablou.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Lipsește un element al tabloului la indexul ${issue.index}.`;
    case "Accessor":
      return `Elementul tabloului de la indexul ${issue.index} trebuie să fie o proprietate de date.`;
    case "ExcessProperty":
      return "O proprietate Array în exces nu este permisă. Eliminați-o sau utilizați un Type diferit.";
    case "Element":
      return `Elementul tabloului de la indexul ${issue.index} nu este valid.`;
  }
};

/** Formats a NonEmptyArrayError in Romanian. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să conțină cel puțin un element.`;

/** Formats a UniqueError in Romanian. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} are elemente egale la indexurile ${error.previousIndex} și ${error.index}.`;

/** Formats a SetError in Romanian. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Proprietatea Set în exces ${safelyStringifyUnknownValue(issue.key)} nu este permisă.`;
    case "Element":
      return `Elementul Set de la indexul ${issue.index} nu este valid.`;
  }
};

/** Formats a MapError in Romanian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Proprietatea Map în exces ${safelyStringifyUnknownValue(issue.key)} nu este permisă.`;
    case "Key":
      return `Cheia Map de la indexul ${issue.index} nu este validă.`;
    case "Value":
      return `Valoarea Map de la indexul ${issue.index} nu este validă.`;
    case "Collision":
      return `Cheile Map de la indexurile ${issue.previousIndex} și ${issue.index} se decodează la aceeași cheie ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Romanian. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Dimensiunea ${error.value.size} nu îndeplinește dimensiunea minimă de ${error.min}.`;

/** Formats a MaxSizeError in Romanian. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Dimensiunea ${error.value.size} depășește dimensiunea maximă de ${error.max}.`;

/** Formats a TupleError in Romanian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un tuplu.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Un Tuple trebuie să aibă lungimea ${error.reason.expected}, dar valoarea are lungimea ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Lipsește un element Tuple la indexul ${issue.index}.`;
    case "Accessor":
      return `Elementul Tuple de la indexul ${issue.index} trebuie să fie o proprietate de date.`;
    case "ExcessProperty":
      return "O proprietate Tuple în exces nu este permisă. Eliminați-o sau utilizați un Type diferit.";
    case "Element":
      return `Elementul Tuple de la indexul ${issue.index} nu este valid.`;
  }
};

/** Formats a RecordError in Romanian. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Valoarea este un obiect, dar un Output Record trebuie să fie un obiect simplu sau să aibă un prototip null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Cheia proprietății ${safelyStringifyUnknownValue(issue.key)} nu este validă.`;
    case "Value":
      return `Valoarea proprietății ${safelyStringifyUnknownValue(issue.key)} nu este validă.`;
    case "Accessor":
      return `Proprietatea Record ${safelyStringifyUnknownValue(issue.key)} trebuie să fie o proprietate de date.`;
    case "NonEnumerable":
      return `Proprietatea Record ${safelyStringifyUnknownValue(issue.key)} trebuie să fie enumerabilă.`;
    case "Collision":
      return `Cheile Record ${safelyStringifyUnknownValue(issue.previousKey)} și ${safelyStringifyUnknownValue(issue.key)} se decodează la aceeași cheie ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Romanian. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu îndeplinește numărul minim de intrări de ${error.min}.`;

/** Formats a MaxEntriesError in Romanian. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} depășește numărul maxim de intrări de ${error.max}.`;

/** Formats an ObjectError in Romanian. */
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
        return "O proprietate Object trebuie să fie o proprietate de date. Materializați valorile accesorilor în date simple înainte de a utiliza acest Type sau utilizați un Type diferit.";
      case "NonEnumerable":
        return "O proprietate Object trebuie să fie enumerabilă. Faceți-o enumerabilă sau utilizați un Type diferit.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Lipsește proprietatea obligatorie ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "Cheia unei proprietăți Object trebuie să fie un șir. Eliminați proprietatea simbol sau utilizați un Type diferit.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Proprietatea ${safelyStringifyUnknownValue(key)} nu este permisă. Eliminați-o sau utilizați un Type diferit.`;
  }
  return `Proprietatea ${safelyStringifyUnknownValue(key)} nu este validă.`;
};

/** Formats a DiscriminatedUnionError in Romanian. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Proprietatea discriminator ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} trebuie să fie o proprietate de date.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} trebuie să fie o proprietate proprie.`;
      }
      return `${property} trebuie să fie enumerabilă.`;
    }
    case "Discriminator":
      return `Proprietatea discriminator ${safelyStringifyUnknownValue(error.reason.key)} are valoarea neașteptată ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Varianta selectată ${safelyStringifyUnknownValue(error.reason.discriminator)} nu este validă.`;
  }
};

/** Formats a DataError in Romanian. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Valoarea ${safelyStringifyUnknownValue(issue.value)} nu este o valoare Data.`;
    case "UnexpectedPrototype":
      return `O valoare Data de tipul ${issue.container} are un prototip neașteptat.`;
    case "Accessor":
      return "O proprietate Data trebuie să fie o proprietate de date. Materializați valorile accesorilor în date simple înainte de a utiliza acest Type sau utilizați un Type diferit.";
    case "NonEnumerable":
      return "O proprietate a unui obiect Data trebuie să fie enumerabilă. Eliminați-o sau utilizați un Type diferit.";
    case "SymbolProperty":
      return "Cheia unei proprietăți a unui obiect Data trebuie să fie un șir. Eliminați proprietatea simbol sau utilizați un Type diferit.";
    case "Hole":
      return "Lipsește un element al unui tablou Data.";
    case "InvalidUint8Array":
      return "Un Uint8Array Data trebuie să aibă un ArrayBuffer nedetașat și să se încadreze în limitele acestuia.";
    case "ExcessProperty":
      return `O valoare Data de tipul ${issue.container} nu trebuie să aibă proprietăți proprii în exces. Eliminați proprietatea sau utilizați un Type diferit.`;
  }
};

/** Formats a JsonValueError in Romanian. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Valoarea ${safelyStringifyUnknownValue(issue.value)} nu este o valoare JSON.`;
    case "NonFiniteNumber":
      return "Un număr JSON trebuie să fie finit.";
    case "UnexpectedPrototype":
      return "Valoarea este un obiect, dar un obiect JsonValue trebuie să fie un obiect simplu sau să aibă un prototip null.";
    case "Accessor":
      return "O proprietate JSON trebuie să fie o proprietate de date. Materializați valorile accesorilor în date simple înainte de a utiliza acest Type sau utilizați un Type diferit.";
    case "NonEnumerable":
      return "O proprietate a unui obiect JSON trebuie să fie enumerabilă. Eliminați-o sau utilizați un Type diferit.";
    case "SymbolProperty":
      return "Cheia unei proprietăți a unui obiect JSON trebuie să fie un șir. Eliminați proprietatea simbol sau utilizați un Type diferit.";
    case "Hole":
      return "Lipsește un element al unui tablou JSON.";
    case "ExcessProperty":
      return "O proprietate în exces a unui tablou JSON nu este permisă. Eliminați-o sau utilizați un Type diferit.";
    case "CircularReference":
      return "Un JsonValue nu trebuie să conțină referințe circulare.";
  }
};

/** Formats a JsonError in Romanian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu poate fi analizată ca JsonValue.`;

/** Formats a ByteSizeLiteralError in Romanian. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un literal de dimensiune în octeți. Folosiți o valoare precum "512KiB" sau "1MiB".`;

/** Formats a ByteLengthError in Romanian. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Valoarea -0 nu este o lungime în octeți. Folosiți 0 în schimb.";

/** Formats a ByteLengthFromStringError in Romanian. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o lungime în octeți. Folosiți un număr de octeți sau un literal precum 10MiB.`;

/** Formats a DurationLiteralError in Romanian. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un literal de durată. Folosiți o valoare precum "500ms" sau "1.5s".`;

/** Formats a PercentageLiteralError in Romanian. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un literal de procentaj. Folosiți o valoare precum "50%" sau "12.5%".`;
