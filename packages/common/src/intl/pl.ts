/**
 * Polish Evolu Type error formatters.
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
  StartsWithError,
  TableIdError,
  TemplateLiteralError,
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

const formatValueMustBe = (value: unknown, expected: string): string =>
  `Wartość ${safelyStringifyUnknownValue(value)} musi być ${expected}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Wartość ${safelyStringifyUnknownValue(reason.value)} nie jest obiektem.`
    : "Wartość jest obiektem, ale wynik typu Object musi być zwykłym obiektem lub mieć prototyp null.";

/** Formats a NeverError in Polish. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowa dla typu Never.`;

/** Formats a String TypeOfError in Polish. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> = (
  error,
) => formatValueMustBe(error.value, "tekstem");

/** Formats a TemplateLiteralError in Polish. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie pasuje do literału szablonowego.`;

/** Formats a Number TypeOfError in Polish. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> = (
  error,
) => formatValueMustBe(error.value, "liczbą");

/** Formats a BigInt TypeOfError in Polish. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> = (
  error,
) => formatValueMustBe(error.value, "liczbą całkowitą typu bigint");

/** Formats a Boolean TypeOfError in Polish. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> = (
  error,
) => formatValueMustBe(error.value, "wartością logiczną");

/** Formats a BooleanFromStringError in Polish. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest wartością logiczną. Użyj true lub false.`;

/** Formats a Symbol TypeOfError in Polish. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> = (
  error,
) => formatValueMustBe(error.value, "symbolem");

/** Formats a Function TypeOfError in Polish. */
export const formatFunctionError: TypeErrorFormatter<
  TypeOfError<"Function">
> = (error) => formatValueMustBe(error.value, "funkcją");

/** Formats an EvoluTypeError in Polish. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Wartość ${safelyStringifyUnknownValue(error.value)} musi być Evolu Type.`;

/** Formats an ObjectTagError in Polish. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie ma oczekiwanego znacznika obiektu ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Polish. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Data jest nieprawidłowa.";

/** Formats an InstanceOfError in Polish. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest instancją ${error.constructorName}.`;

/** Formats a LiteralError in Polish. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest ściśle równa oczekiwanemu literałowi: ${String(error.expected)}.`;

/** Formats a UnionError in Polish. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Wartość nie pasuje do żadnego z dozwolonych wariantów.";

/** Formats a DateIsoError in Polish. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest kanonicznym łańcuchem daty i czasu ISO.`;

/** Formats a PlainDateIsoError in Polish. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową datą kalendarzową w formacie YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Polish. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Daty nie można przedstawić jako DateIso.";

/** Formats a DateIsoFromRfc3339Error in Polish. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest datą i czasem w obsługiwanym formacie RFC 3339. Użyj wartości takiej jak "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Polish. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być kanonicznym łańcuchem dziesiętnym.`;

/** Formats an Int64Error in Polish. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową 64-bitową liczbą całkowitą ze znakiem (Int64).`;

/** Formats a UInt64Error in Polish. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową 64-bitową liczbą całkowitą bez znaku (UInt64).`;

/** Formats an Int64StringError in Polish. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym łańcuchem Int64.`;

/** Formats an IdentifierError in Polish. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest identyfikatorem w formacie ${error.casing}.`;

/** Formats a CapitalizedError in Polish. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Tekst ${safelyStringifyUnknownValue(error.value)} musi zaczynać się wielką literą.`;

/** Formats an UncapitalizedError in Polish. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie może zaczynać się wielką literą.`;

/** Formats an UppercasedError in Polish. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być zapisana wielkimi literami.`;

/** Formats a LowercasedError in Polish. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być zapisana małymi literami.`;

/** Formats a TrimmedError in Polish. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Tekst ${safelyStringifyUnknownValue(error.value)} nie może zawierać białych znaków na początku ani na końcu.`;

/** Formats a WellFormedError in Polish. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być poprawnie sformułowanym tekstem Unicode.`;

/** Formats a NormalizedError in Polish. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być w formie normalizacji Unicode ${error.form}.`;

/** Formats a StartsWithError in Polish. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi zaczynać się od ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Polish. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi kończyć się na ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Polish. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi zawierać ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Polish. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie może zawierać ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Polish. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie spełnia minimalnej długości ${error.min}.`;

/** Formats a MaxLengthError in Polish. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} przekracza maksymalną długość ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Polish. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} przekracza maksymalną długość ${error.max} w bajtach UTF-8.`;

/** Formats a LengthError in Polish. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie ma wymaganej długości ${error.exact}.`;

/** Formats a RegexError in Polish. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie pasuje do /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Polish. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym łańcuchem Base64Url.`;

/** Formats a Base64Error in Polish. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym łańcuchem Base64.`;

/** Formats a HexError in Polish. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest łańcuchem szesnastkowym zapisanym małymi literami o parzystej liczbie cyfr.`;

/** Formats a HexColorError in Polish. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest kolorem w formacie #rrggbb zapisanym małymi literami.`;

/** Formats a NameError in Polish. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową nazwą.`;

/** Formats an EmailError in Polish. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym adresem e-mail.`;

/** Formats a HostnameError in Polish. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową nazwą hosta zapisaną małymi literami.`;

/** Formats an Ipv4AddressError in Polish. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym adresem IPv4.`;

/** Formats an Ipv6AddressError in Polish. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest kanonicznym adresem IPv6.`;

/** Formats an Ipv6AddressFromStringError in Polish. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym adresem IPv6.`;

/** Formats an IpAddressError in Polish. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym adresem IPv4 ani kanonicznym adresem IPv6.`;

/** Formats an IpAddressFromStringError in Polish. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym adresem IP.`;

/** Formats a PhoneNumberE164Error in Polish. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest numerem telefonu w formacie E.164.`;

/** Formats an IbanError in Polish. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym numerem IBAN zapisanym wielkimi literami bez spacji.`;

/** Formats an IsbnError in Polish. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym 13-cyfrowym numerem ISBN bez łączników.`;

/** Formats a SimplePasswordError in Polish. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Hasło nie może zawierać białych znaków na początku ani na końcu.";
    case "TooLong":
      return "Hasło przekracza maksymalną długość 64.";
    case "TooShort":
      return "Hasło nie spełnia minimalnej długości 8.";
  }
};

/** Formats a MnemonicError in Polish. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Wartość nie jest prawidłową angielską frazą mnemoniczną BIP39.";

/** Formats a RedactedError in Polish. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "Sekret musi być tekstem.";

/** Formats an IdError in Polish. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym Id.`;

/** Formats a TableIdError in Polish. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym Id tabeli ${error.table}.`;

/** Formats a UuidError in Polish. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest kanonicznym UUID zapisanym małymi literami.`;

/** Formats a UuidVersionError in Polish. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest UUID w wersji ${error.version}.`;

/** Formats a UlidError in Polish. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest kanonicznym ULID zapisanym wielkimi literami.`;

/** Formats a NonNegativeError in Polish. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być nieujemna (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Polish. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być nieujemnym łańcuchem dziesiętnym.`;

/** Formats a PositiveError in Polish. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być dodatnia (> 0).`;

/** Formats a PositiveDecimalStringError in Polish. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być dodatnim łańcuchem dziesiętnym.`;

/** Formats a NonPositiveError in Polish. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być niedodatnia (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Polish. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być niedodatnim łańcuchem dziesiętnym.`;

/** Formats a NegativeError in Polish. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być ujemna (< 0).`;

/** Formats a NegativeDecimalStringError in Polish. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być ujemnym łańcuchem dziesiętnym.`;

/** Formats an IntError in Polish. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być bezpieczną liczbą całkowitą.`;

/** Formats an IntFromStringError in Polish. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest dziesiętną liczbą całkowitą.`;

/** Formats a FiniteNumberFromStringError in Polish. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest liczbą dziesiętną.`;

/** Formats a GreaterThanError in Polish. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być większa niż ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Polish. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być większa lub równa ${error.min}.`;

/** Formats a LessThanError in Polish. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być mniejsza niż ${error.max}.`;

/** Formats a LessThanOrEqualToError in Polish. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być mniejsza lub równa ${error.max}.`;

/** Formats a NonNaNError in Polish. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Wartość nie może być NaN.";

/** Formats a FiniteError in Polish. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być skończona.`;

/** Formats a MultipleOfError in Polish. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być wielokrotnością ${error.divisor}.`;

/** Formats a BetweenError in Polish. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi mieścić się w przedziale od ${error.min} do ${error.max}, włącznie.`;

/** Formats a GreaterThanBigIntError in Polish. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być większa niż ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Polish. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być większa lub równa ${error.min}.`;

/** Formats a LessThanBigIntError in Polish. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być mniejsza niż ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Polish. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być mniejsza lub równa ${error.max}.`;

/** Formats a BetweenBigIntError in Polish. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi mieścić się w przedziale od ${error.min} do ${error.max}, włącznie.`;

/** Formats an ArrayError in Polish. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest tablicą.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Brakuje elementu tablicy o indeksie ${issue.index}.`;
    case "Accessor":
      return `Element tablicy o indeksie ${issue.index} musi być właściwością danych.`;
    case "ExcessProperty":
      return "Nadmiarowa właściwość tablicy jest niedozwolona. Usuń ją lub użyj innego Type.";
    case "Element":
      return `Element tablicy o indeksie ${issue.index} jest nieprawidłowy.`;
  }
};

/** Formats a NonEmptyArrayError in Polish. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi zawierać co najmniej jeden element.`;

/** Formats a UniqueError in Polish. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} zawiera równe elementy o indeksach ${error.previousIndex} i ${error.index}.`;

/** Formats a SetError in Polish. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest Setem.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Nadmiarowa właściwość Set ${safelyStringifyUnknownValue(issue.key)} jest niedozwolona.`;
    case "Element":
      return `Element Set o indeksie ${issue.index} jest nieprawidłowy.`;
  }
};

/** Formats a MapError in Polish. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest Mapem.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Nadmiarowa właściwość Map ${safelyStringifyUnknownValue(issue.key)} jest niedozwolona.`;
    case "Key":
      return `Klucz Map o indeksie ${issue.index} jest nieprawidłowy.`;
    case "Value":
      return `Wartość Map o indeksie ${issue.index} jest nieprawidłowa.`;
    case "Collision":
      return `Klucze Map o indeksach ${issue.previousIndex} i ${issue.index} dekodują się do tego samego klucza ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Polish. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Rozmiar ${error.value.size} nie spełnia minimalnego rozmiaru ${error.min}.`;

/** Formats a MaxSizeError in Polish. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Rozmiar ${error.value.size} przekracza maksymalny rozmiar ${error.max}.`;

/** Formats a TupleError in Polish. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest krotką.`;
  if (error.reason.kind === "InvalidLength")
    return `Krotka musi mieć długość ${error.reason.expected}, ale wartość ma długość ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Brakuje elementu krotki o indeksie ${issue.index}.`;
    case "Accessor":
      return `Element krotki o indeksie ${issue.index} musi być właściwością danych.`;
    case "ExcessProperty":
      return "Nadmiarowa właściwość krotki jest niedozwolona. Usuń ją lub użyj innego Type.";
    case "Element":
      return `Element krotki o indeksie ${issue.index} jest nieprawidłowy.`;
  }
};

/** Formats a RecordError in Polish. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest Recordem.`;
  if (error.reason.kind === "NotPlainRecord")
    return "Wartość jest obiektem, ale wynik typu Record musi być zwykłym obiektem lub mieć prototyp null.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `Klucz właściwości ${safelyStringifyUnknownValue(issue.key)} jest nieprawidłowy.`;
    case "Value":
      return `Wartość właściwości ${safelyStringifyUnknownValue(issue.key)} jest nieprawidłowa.`;
    case "Accessor":
      return `Właściwość Record ${safelyStringifyUnknownValue(issue.key)} musi być właściwością danych.`;
    case "NonEnumerable":
      return `Właściwość Record ${safelyStringifyUnknownValue(issue.key)} musi być wyliczalna.`;
    case "Collision":
      return `Klucze Record ${safelyStringifyUnknownValue(issue.previousKey)} i ${safelyStringifyUnknownValue(issue.key)} dekodują się do tego samego klucza ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Polish. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie spełnia minimalnej liczby wpisów ${error.min}.`;

/** Formats a MaxEntriesError in Polish. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} przekracza maksymalną liczbę wpisów ${error.max}.`;

/** Formats an ObjectError in Polish. */
export const formatObjectError: TypeErrorFormatter<ObjectError> = (error) => {
  if (error.reason.kind !== "Properties")
    return formatPlainObjectRootError(error.reason);
  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);
  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "Właściwość Object musi być właściwością danych. Przekształć wartości akcesorów w zwykłe dane przed użyciem tego Type lub użyj innego Type.";
      case "NonEnumerable":
        return "Właściwość Object musi być wyliczalna. Uczyń ją wyliczalną lub użyj innego Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `Brakuje wymaganej właściwości ${safelyStringifyUnknownValue(key)}.`;
  if (typeof key === "symbol")
    return "Klucz właściwości Object musi być tekstem. Usuń właściwość-symbol lub użyj innego Type.";
  if (propertyError.type === "ObjectExcessProperty")
    return `Właściwość ${safelyStringifyUnknownValue(key)} jest niedozwolona. Usuń ją lub użyj innego Type.`;
  return `Właściwość ${safelyStringifyUnknownValue(key)} jest nieprawidłowa.`;
};

/** Formats a DiscriminatedUnionError in Polish. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Właściwość dyskryminująca ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} musi być właściwością danych.`;
      if (error.reason.reason === "Inherited")
        return `${property} musi być własną właściwością.`;
      return `${property} musi być wyliczalna.`;
    }
    case "Discriminator":
      return `Właściwość dyskryminująca ${safelyStringifyUnknownValue(error.reason.key)} ma nieoczekiwaną wartość ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Wybrany wariant ${safelyStringifyUnknownValue(error.reason.discriminator)} jest nieprawidłowy.`;
  }
};

/** Formats a DataError in Polish. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Wartość ${safelyStringifyUnknownValue(issue.value)} nie jest wartością Data.`;
    case "UnexpectedPrototype":
      return `Wartość typu ${issue.container} w Data ma nieoczekiwany prototyp.`;
    case "Accessor":
      return "Właściwość w Data musi być właściwością danych. Przekształć wartości akcesorów w zwykłe dane przed użyciem tego Type lub użyj innego Type.";
    case "NonEnumerable":
      return "Właściwość obiektu w Data musi być wyliczalna. Usuń ją lub użyj innego Type.";
    case "SymbolProperty":
      return "Klucz właściwości obiektu w Data musi być tekstem. Usuń właściwość-symbol lub użyj innego Type.";
    case "Hole":
      return "Brakuje elementu tablicy w Data.";
    case "InvalidUint8Array":
      return "Uint8Array w Data musi mieć ArrayBuffer, który nie jest odłączony, i mieścić się w jego granicach.";
    case "ExcessProperty":
      return `Wartość typu ${issue.container} w Data nie może mieć nadmiarowych własnych właściwości. Usuń właściwość lub użyj innego Type.`;
  }
};

/** Formats a JsonValueError in Polish. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Wartość ${safelyStringifyUnknownValue(issue.value)} nie jest wartością JSON.`;
    case "NonFiniteNumber":
      return "Liczba JSON musi być skończona.";
    case "UnexpectedPrototype":
      return "Wartość jest obiektem, ale obiekt JsonValue musi być zwykłym obiektem lub mieć prototyp null.";
    case "Accessor":
      return "Właściwość JSON musi być właściwością danych. Przekształć wartości akcesorów w zwykłe dane przed użyciem tego Type lub użyj innego Type.";
    case "NonEnumerable":
      return "Właściwość obiektu JSON musi być wyliczalna. Usuń ją lub użyj innego Type.";
    case "SymbolProperty":
      return "Klucz właściwości obiektu JSON musi być tekstem. Usuń właściwość-symbol lub użyj innego Type.";
    case "Hole":
      return "Brakuje elementu tablicy JSON.";
    case "ExcessProperty":
      return "Nadmiarowa właściwość tablicy JSON jest niedozwolona. Usuń ją lub użyj innego Type.";
    case "CircularReference":
      return "JsonValue nie może zawierać odwołań cyklicznych.";
  }
};

/** Formats a JsonError in Polish. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Wartości ${safelyStringifyUnknownValue(error.value)} nie można sparsować jako JsonValue.`;

/** Formats a ByteSizeLiteralError in Polish. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest literałem rozmiaru w bajtach. Użyj wartości takiej jak "512KiB" lub "1MiB".`;

/** Formats a ByteLengthError in Polish. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Wartość -0 nie jest długością w bajtach. Użyj zamiast niej 0.";

/** Formats a ByteLengthFromStringError in Polish. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest długością w bajtach. Użyj liczby bajtów lub literału takiego jak 10MiB.`;

/** Formats a DurationLiteralError in Polish. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest literałem czasu trwania. Użyj wartości takiej jak "500ms" lub "1.5s".`;

/** Formats a PercentageLiteralError in Polish. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest literałem procentowym. Użyj wartości takiej jak "50%" lub "12.5%".`;
