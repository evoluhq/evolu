/**
 * Ukrainian Evolu Type error formatters.
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

const typeOfNames = {
  String: "рядком",
  Number: "числом",
  BigInt: "значенням BigInt",
  Boolean: "логічним значенням",
  Symbol: "символом",
  Function: "функцією",
};

const formatTypeOfError = (
  error: TypeOfError<keyof typeof typeOfNames>,
): string =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є ${typeOfNames[error.expected]}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Значення ${safelyStringifyUnknownValue(reason.value)} не є об’єктом.`
    : "Значення є об’єктом, але вихідне значення Object має бути простим об’єктом або мати прототип null.";

/** Formats a NeverError in Ukrainian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим для типу Never.`;

/** Formats a String TypeOfError in Ukrainian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Ukrainian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не відповідає шаблонному літералу.`;

/** Formats a Number TypeOfError in Ukrainian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Ukrainian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Ukrainian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Ukrainian. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є логічним значенням. Використовуйте true або false.`;

/** Formats a Symbol TypeOfError in Ukrainian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Ukrainian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Ukrainian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Значення ${safelyStringifyUnknownValue(error.value)} не є Evolu Type.`;

/** Formats an ObjectTagError in Ukrainian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не має очікуваного тегу об’єкта ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Ukrainian. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Дата недійсна.";

/** Formats an InstanceOfError in Ukrainian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є екземпляром ${error.constructorName}.`;

/** Formats a LiteralError in Ukrainian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не дорівнює строго очікуваному літералу: ${String(error.expected)}.`;

/** Formats a UnionError in Ukrainian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Значення не відповідає жодному з допустимих варіантів.";

/** Formats a DateIsoError in Ukrainian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є канонічним рядком дати й часу ISO.`;

/** Formats a PlainDateIsoError in Ukrainian. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимою календарною датою у форматі YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Ukrainian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Дату неможливо подати як DateIso.";

/** Formats a DateIsoFromRfc3339Error in Ukrainian. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є датою й часом у підтримуваному форматі RFC 3339. Використовуйте значення на кшталт "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Ukrainian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути канонічним десятковим рядком.`;

/** Formats an Int64Error in Ukrainian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим 64-бітним цілим числом зі знаком (Int64).`;

/** Formats a UInt64Error in Ukrainian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим 64-бітним цілим числом без знака (UInt64).`;

/** Formats an Int64StringError in Ukrainian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим рядком Int64.`;

/** Formats an IdentifierError in Ukrainian. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є ідентифікатором у форматі ${error.casing}.`;

/** Formats a CapitalizedError in Ukrainian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має починатися з великої літери.`;

/** Formats an UncapitalizedError in Ukrainian. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не повинно починатися з великої літери.`;

/** Formats an UppercasedError in Ukrainian. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути записане великими літерами.`;

/** Formats a LowercasedError in Ukrainian. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути записане малими літерами.`;

/** Formats a TrimmedError in Ukrainian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не має містити пробілів на початку та в кінці.`;

/** Formats a WellFormedError in Ukrainian. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути правильно сформованим текстом Unicode.`;

/** Formats a NormalizedError in Ukrainian. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути у формі нормалізації Unicode ${error.form}.`;

/** Formats a StartsWithError in Ukrainian. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має починатися з ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Ukrainian. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має закінчуватися на ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Ukrainian. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має містити ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Ukrainian. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не повинно містити ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Ukrainian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} коротше за мінімальну довжину ${error.min}.`;

/** Formats a MaxLengthError in Ukrainian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} перевищує максимальну довжину ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Ukrainian. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} перевищує максимальну довжину ${error.max} в байтах UTF-8.`;

/** Formats a LengthError in Ukrainian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не має необхідної довжини ${error.exact}.`;

/** Formats a RegexError in Ukrainian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не відповідає /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Ukrainian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим рядком Base64Url.`;

/** Formats a Base64Error in Ukrainian. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим рядком Base64.`;

/** Formats a HexError in Ukrainian. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є шістнадцятковим рядком у нижньому регістрі з парною кількістю цифр.`;

/** Formats a HexColorError in Ukrainian. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є кольором у форматі #rrggbb у нижньому регістрі.`;

/** Formats a NameError in Ukrainian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим Name.`;

/** Formats an EmailError in Ukrainian. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимою адресою електронної пошти.`;

/** Formats a HostnameError in Ukrainian. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим ім’ям хоста в нижньому регістрі.`;

/** Formats an Ipv4AddressError in Ukrainian. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимою адресою IPv4.`;

/** Formats an Ipv6AddressError in Ukrainian. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є канонічною адресою IPv6.`;

/** Formats an Ipv6AddressFromStringError in Ukrainian. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимою адресою IPv6.`;

/** Formats an IpAddressError in Ukrainian. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є ні допустимою адресою IPv4, ні канонічною адресою IPv6.`;

/** Formats an IpAddressFromStringError in Ukrainian. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимою IP-адресою.`;

/** Formats a PhoneNumberE164Error in Ukrainian. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є номером телефону у форматі E.164.`;

/** Formats an IbanError in Ukrainian. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим IBAN у верхньому регістрі без пробілів.`;

/** Formats an IsbnError in Ukrainian. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим 13-значним ISBN без дефісів.`;

/** Formats a SimplePasswordError in Ukrainian. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Пароль не має містити пробілів на початку та в кінці.";
    case "TooLong":
      return "Пароль перевищує максимальну довжину 64.";
    case "TooShort":
      return "Пароль коротший за мінімальну довжину 8.";
  }
};

/** Formats a MnemonicError in Ukrainian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Значення не є допустимою англійською мнемонічною фразою BIP39.";

/** Formats a RedactedError in Ukrainian. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "Секрет має бути рядком.";

/** Formats an IdError in Ukrainian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим Id.`;

/** Formats a TableIdError in Ukrainian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим Id для таблиці ${error.table}.`;

/** Formats a UuidError in Ukrainian. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є канонічним UUID у нижньому регістрі.`;

/** Formats a UuidVersionError in Ukrainian. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є UUID версії ${error.version}.`;

/** Formats a UlidError in Ukrainian. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є канонічним ULID у верхньому регістрі.`;

/** Formats a NonNegativeError in Ukrainian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути невід’ємним (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Ukrainian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути невід’ємним десятковим рядком.`;

/** Formats a PositiveError in Ukrainian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути додатним (> 0).`;

/** Formats a PositiveDecimalStringError in Ukrainian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути додатним десятковим рядком.`;

/** Formats a NonPositiveError in Ukrainian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути недодатним (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Ukrainian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути недодатним десятковим рядком.`;

/** Formats a NegativeError in Ukrainian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути від’ємним (< 0).`;

/** Formats a NegativeDecimalStringError in Ukrainian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути від’ємним десятковим рядком.`;

/** Formats an IntError in Ukrainian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути безпечним цілим числом.`;

/** Formats an IntFromStringError in Ukrainian. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є десятковим цілим числом.`;

/** Formats a FiniteNumberFromStringError in Ukrainian. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є десятковим числом.`;

/** Formats a GreaterThanError in Ukrainian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути більшим за ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Ukrainian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути більшим або рівним ${error.min}.`;

/** Formats a LessThanError in Ukrainian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути меншим за ${error.max}.`;

/** Formats a LessThanOrEqualToError in Ukrainian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути меншим або рівним ${error.max}.`;

/** Formats a NonNaNError in Ukrainian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Значення не має бути NaN.";

/** Formats a FiniteError in Ukrainian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути скінченним.`;

/** Formats a MultipleOfError in Ukrainian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути кратним ${error.divisor}.`;

/** Formats a BetweenError in Ukrainian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути в межах від ${error.min} до ${error.max} включно.`;

/** Formats a GreaterThanBigIntError in Ukrainian. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути більшим за ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Ukrainian. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути більшим або рівним ${error.min}.`;

/** Formats a LessThanBigIntError in Ukrainian. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути меншим за ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Ukrainian. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути меншим або рівним ${error.max}.`;

/** Formats a BetweenBigIntError in Ukrainian. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути в межах від ${error.min} до ${error.max} включно.`;

/** Formats an ArrayError in Ukrainian. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є масивом.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Елемент масиву з індексом ${issue.index} відсутній.`;
    case "Accessor":
      return `Елемент масиву з індексом ${issue.index} має бути властивістю даних.`;
    case "ExcessProperty":
      return "Зайва властивість Array не допускається. Видаліть її або використайте інший Type.";
    case "Element":
      return `Елемент масиву з індексом ${issue.index} недійсний.`;
  }
};

/** Formats a NonEmptyArrayError in Ukrainian. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має містити принаймні один елемент.`;

/** Formats a UniqueError in Ukrainian. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} містить однакові елементи з індексами ${error.previousIndex} та ${error.index}.`;

/** Formats a SetError in Ukrainian. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Зайва властивість Set ${safelyStringifyUnknownValue(issue.key)} не допускається.`;
    case "Element":
      return `Елемент Set з індексом ${issue.index} недійсний.`;
  }
};

/** Formats a MapError in Ukrainian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Зайва властивість Map ${safelyStringifyUnknownValue(issue.key)} не допускається.`;
    case "Key":
      return `Ключ Map з індексом ${issue.index} недійсний.`;
    case "Value":
      return `Значення Map з індексом ${issue.index} недійсне.`;
    case "Collision":
      return `Ключі Map з індексами ${issue.previousIndex} та ${issue.index} декодуються в той самий ключ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Ukrainian. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Розмір ${error.value.size} менший за мінімальний розмір ${error.min}.`;

/** Formats a MaxSizeError in Ukrainian. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Розмір ${error.value.size} перевищує максимальний розмір ${error.max}.`;

/** Formats a TupleError in Ukrainian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є кортежем.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Довжина Tuple має дорівнювати ${error.reason.expected}, але значення має довжину ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Елемент Tuple з індексом ${issue.index} відсутній.`;
    case "Accessor":
      return `Елемент Tuple з індексом ${issue.index} має бути властивістю даних.`;
    case "ExcessProperty":
      return "Зайва властивість Tuple не допускається. Видаліть її або використайте інший Type.";
    case "Element":
      return `Елемент Tuple з індексом ${issue.index} недійсний.`;
  }
};

/** Formats a RecordError in Ukrainian. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Значення є об’єктом, але вихідне значення Record має бути простим об’єктом або мати прототип null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Ключ властивості ${safelyStringifyUnknownValue(issue.key)} недійсний.`;
    case "Value":
      return `Значення властивості ${safelyStringifyUnknownValue(issue.key)} недійсне.`;
    case "Accessor":
      return `Властивість Record ${safelyStringifyUnknownValue(issue.key)} має бути властивістю даних.`;
    case "NonEnumerable":
      return `Властивість Record ${safelyStringifyUnknownValue(issue.key)} має бути перелічуваною.`;
    case "Collision":
      return `Ключі Record ${safelyStringifyUnknownValue(issue.previousKey)} та ${safelyStringifyUnknownValue(issue.key)} декодуються в той самий ключ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Ukrainian. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не досягає мінімальної кількості записів ${error.min}.`;

/** Formats a MaxEntriesError in Ukrainian. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} перевищує максимальну кількість записів ${error.max}.`;

/** Formats an ObjectError in Ukrainian. */
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
        return "Властивість Object має бути властивістю даних. Матеріалізуйте значення аксесорів у прості дані перед використанням цього Type або використайте інший Type.";
      case "NonEnumerable":
        return "Властивість Object має бути перелічуваною. Зробіть її перелічуваною або використайте інший Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Обов’язкова властивість ${safelyStringifyUnknownValue(key)} відсутня.`;
  }
  if (typeof key === "symbol") {
    return "Ключ властивості Object має бути рядком. Видаліть символьну властивість або використайте інший Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Властивість ${safelyStringifyUnknownValue(key)} не допускається. Видаліть її або використайте інший Type.`;
  }
  return `Властивість ${safelyStringifyUnknownValue(key)} недійсна.`;
};

/** Formats a DiscriminatedUnionError in Ukrainian. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Властивість-дискримінатор ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} має бути властивістю даних.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} має бути власною властивістю.`;
      }
      return `${property} має бути перелічуваною.`;
    }
    case "Discriminator":
      return `Властивість-дискримінатор ${safelyStringifyUnknownValue(error.reason.key)} має неочікуване значення ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Вибраний варіант ${safelyStringifyUnknownValue(error.reason.discriminator)} недійсний.`;
  }
};

/** Formats a DataError in Ukrainian. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Значення ${safelyStringifyUnknownValue(issue.value)} не є Data.`;
    case "UnexpectedPrototype":
      return `Значення типу ${issue.container} у Data має неочікуваний прототип.`;
    case "Accessor":
      return "Властивість у Data має бути властивістю даних. Матеріалізуйте значення аксесорів у прості дані перед використанням цього Type або використайте інший Type.";
    case "NonEnumerable":
      return "Властивість об’єкта в Data має бути перелічуваною. Видаліть її або використайте інший Type.";
    case "SymbolProperty":
      return "Ключ властивості об’єкта в Data має бути рядком. Видаліть символьну властивість або використайте інший Type.";
    case "Hole":
      return "Елемент масиву в Data відсутній.";
    case "InvalidUint8Array":
      return "Uint8Array у Data повинен мати невід’єднаний ArrayBuffer і лежати в його межах.";
    case "ExcessProperty":
      return `Значення типу ${issue.container} у Data не має містити зайвих власних властивостей. Видаліть властивість або використайте інший Type.`;
  }
};

/** Formats a JsonValueError in Ukrainian. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Значення ${safelyStringifyUnknownValue(issue.value)} не є значенням JSON.`;
    case "NonFiniteNumber":
      return "Число JSON має бути скінченним.";
    case "UnexpectedPrototype":
      return "Значення є об’єктом, але об’єкт JsonValue має бути простим об’єктом або мати прототип null.";
    case "Accessor":
      return "Властивість JSON має бути властивістю даних. Матеріалізуйте значення аксесорів у прості дані перед використанням цього Type або використайте інший Type.";
    case "NonEnumerable":
      return "Властивість об’єкта JSON має бути перелічуваною. Видаліть її або використайте інший Type.";
    case "SymbolProperty":
      return "Ключ властивості об’єкта JSON має бути рядком. Видаліть символьну властивість або використайте інший Type.";
    case "Hole":
      return "Елемент масиву JSON відсутній.";
    case "ExcessProperty":
      return "Зайва властивість масиву JSON не допускається. Видаліть її або використайте інший Type.";
    case "CircularReference":
      return "JsonValue не має містити циклічних посилань.";
  }
};

/** Formats a JsonError in Ukrainian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} неможливо розібрати як JsonValue.`;

/** Formats a ByteSizeLiteralError in Ukrainian. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є літералом розміру в байтах. Використовуйте значення на кшталт "512KiB" або "1MiB".`;

/** Formats a ByteLengthError in Ukrainian. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Значення -0 не є довжиною в байтах. Використовуйте натомість 0.";

/** Formats a ByteLengthFromStringError in Ukrainian. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є довжиною в байтах. Використовуйте кількість байтів або літерал на кшталт 10MiB.`;

/** Formats a DurationLiteralError in Ukrainian. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є літералом тривалості. Використовуйте значення на кшталт "500ms" або "1.5s".`;

/** Formats a PercentageLiteralError in Ukrainian. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є відсотковим літералом. Використовуйте значення на кшталт "50%" або "12.5%".`;
