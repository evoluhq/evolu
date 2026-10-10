/**
 * Turkish Evolu Type error formatters.
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

const formatValueIsNot = (value: unknown, expected: string): string =>
  `${safelyStringifyUnknownValue(value)} değeri ${expected} değildir.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `${safelyStringifyUnknownValue(reason.value)} değeri bir nesne değildir.`
    : "Değer bir nesnedir, ancak bir Object Output düz nesne olmalı veya null prototipine sahip olmalıdır.";

/** Formats a NeverError in Turkish. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri Never türü için geçerli değildir.`;

/** Formats a String TypeOfError in Turkish. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> = (
  error,
) => formatValueIsNot(error.value, "bir dizge");

/** Formats a TemplateLiteralError in Turkish. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri şablon değişmezine uymuyor.`;

/** Formats a Number TypeOfError in Turkish. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> = (
  error,
) => formatValueIsNot(error.value, "bir sayı");

/** Formats a BigInt TypeOfError in Turkish. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> = (
  error,
) => formatValueIsNot(error.value, "bir BigInt");

/** Formats a Boolean TypeOfError in Turkish. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> = (
  error,
) => formatValueIsNot(error.value, "bir mantıksal değer");

/** Formats a BooleanFromStringError in Turkish. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir mantıksal değer değildir. true veya false kullanın.`;

/** Formats a Symbol TypeOfError in Turkish. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> = (
  error,
) => formatValueIsNot(error.value, "bir sembol");

/** Formats a Function TypeOfError in Turkish. */
export const formatFunctionError: TypeErrorFormatter<
  TypeOfError<"Function">
> = (error) => formatValueIsNot(error.value, "bir işlev");

/** Formats an EvoluTypeError in Turkish. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir Evolu Type değildir.`;

/** Formats an ObjectTagError in Turkish. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri beklenen nesne etiketine sahip değil: ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Turkish. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date geçersizdir.";

/** Formats an InstanceOfError in Turkish. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.constructorName} örneği değildir.`;

/** Formats a LiteralError in Turkish. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri beklenen değişmezle kesin olarak eşit değildir: ${String(error.expected)}.`;

/** Formats a UnionError in Turkish. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Değer izin verilen varyantların hiçbirine uymuyor.";

/** Formats a DateIsoError in Turkish. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri kurallı bir ISO tarih-saat dizgesi değildir.`;

/** Formats a PlainDateIsoError in Turkish. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri YYYY-MM-DD biçiminde geçerli bir takvim tarihi değildir.`;

/** Formats a DateIsoFromDateError in Turkish. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date, DateIso olarak temsil edilemez.";

/** Formats a DateIsoFromRfc3339Error in Turkish. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri desteklenen bir RFC 3339 tarih-saati değildir. "2024-01-01T12:00:00Z" gibi bir değer kullanın.`;

/** Formats a DecimalStringError in Turkish. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri kurallı bir ondalık dizgesi olmalıdır.`;

/** Formats an Int64Error in Turkish. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir işaretli 64 bit tam sayı (Int64) değildir.`;

/** Formats a UInt64Error in Turkish. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir işaretsiz 64 bit tam sayı (UInt64) değildir.`;

/** Formats an Int64StringError in Turkish. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir Int64 dizgesi değildir.`;

/** Formats an IdentifierError in Turkish. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir ${error.casing} tanımlayıcısı değildir.`;

/** Formats a CapitalizedError in Turkish. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri büyük harfle başlamalıdır.`;

/** Formats an UncapitalizedError in Turkish. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri büyük harfle başlamamalıdır.`;

/** Formats an UppercasedError in Turkish. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri büyük harflerle yazılmalıdır.`;

/** Formats a LowercasedError in Turkish. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri küçük harflerle yazılmalıdır.`;

/** Formats a TrimmedError in Turkish. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değerinin başında veya sonunda boşluk olmamalıdır.`;

/** Formats a WellFormedError in Turkish. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri iyi biçimlendirilmiş bir Unicode metni olmalıdır.`;

/** Formats a NormalizedError in Turkish. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.form} Unicode normalleştirme biçiminde olmalıdır.`;

/** Formats a StartsWithError in Turkish. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${safelyStringifyUnknownValue(error.prefix)} ile başlamalıdır.`;

/** Formats an EndsWithError in Turkish. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${safelyStringifyUnknownValue(error.suffix)} ile bitmelidir.`;

/** Formats an IncludesError in Turkish. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${safelyStringifyUnknownValue(error.substring)} içermelidir.`;

/** Formats an ExcludesError in Turkish. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${safelyStringifyUnknownValue(error.substring)} içermemelidir.`;

/** Formats a MinLengthError in Turkish. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri en az ${error.min} uzunluğunda olmalıdır.`;

/** Formats a MaxLengthError in Turkish. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri en fazla ${error.max} uzunluğunda olmalıdır.`;

/** Formats a MaxUtf8ByteLengthError in Turkish. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri UTF-8 olarak en fazla ${error.max} bayt uzunluğunda olmalıdır.`;

/** Formats a LengthError in Turkish. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri tam olarak ${error.exact} uzunluğunda olmalıdır.`;

/** Formats a RegexError in Turkish. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri /${error.source}/${error.flags} düzenli ifadesiyle eşleşmiyor.`;

/** Formats a Base64UrlError in Turkish. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir Base64Url dizgesi değildir.`;

/** Formats a Base64Error in Turkish. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir Base64 dizgesi değildir.`;

/** Formats a HexError in Turkish. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri çift sayıda basamak içeren küçük harfli onaltılık bir dizge değildir.`;

/** Formats a HexColorError in Turkish. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri küçük harfli #rrggbb biçiminde bir renk değildir.`;

/** Formats a NameError in Turkish. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir Name değildir.`;

/** Formats an EmailError in Turkish. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir e-posta adresi değildir.`;

/** Formats a HostnameError in Turkish. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir küçük harfli ana bilgisayar adı değildir.`;

/** Formats an Ipv4AddressError in Turkish. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir IPv4 adresi değildir.`;

/** Formats an Ipv6AddressError in Turkish. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri kurallı bir IPv6 adresi değildir.`;

/** Formats an Ipv6AddressFromStringError in Turkish. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir IPv6 adresi değildir.`;

/** Formats an IpAddressError in Turkish. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir IPv4 adresi veya kurallı bir IPv6 adresi değildir.`;

/** Formats an IpAddressFromStringError in Turkish. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir IP adresi değildir.`;

/** Formats a PhoneNumberE164Error in Turkish. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri E.164 biçiminde bir telefon numarası değildir.`;

/** Formats an IbanError in Turkish. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri boşluksuz ve büyük harfli geçerli bir IBAN değildir.`;

/** Formats an IsbnError in Turkish. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri tiresiz, 13 haneli geçerli bir ISBN değildir.`;

/** Formats a SimplePasswordError in Turkish. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Parolanın başında veya sonunda boşluk olmamalıdır.";
    case "TooLong":
      return "Parola en fazla 64 uzunluğunda olmalıdır.";
    case "TooShort":
      return "Parola en az 8 uzunluğunda olmalıdır.";
  }
};

/** Formats a MnemonicError in Turkish. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Değer geçerli bir İngilizce BIP39 anımsatıcı ifadesi değildir.";

/** Formats an IdError in Turkish. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri geçerli bir Id değildir.`;

/** Formats a TableIdError in Turkish. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.table} tablosu için geçerli bir Id değildir.`;

/** Formats a UuidError in Turkish. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri kurallı bir küçük harfli UUID değildir.`;

/** Formats a UuidVersionError in Turkish. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir sürüm ${error.version} UUID değildir.`;

/** Formats a UlidError in Turkish. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri kurallı bir büyük harfli ULID değildir.`;

/** Formats a NonNegativeError in Turkish. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri negatif olmayan (>= 0) bir sayı olmalıdır.`;

/** Formats a NonNegativeDecimalStringError in Turkish. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri negatif olmayan bir ondalık dizgesi olmalıdır.`;

/** Formats a PositiveError in Turkish. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri pozitif (> 0) olmalıdır.`;

/** Formats a PositiveDecimalStringError in Turkish. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri pozitif bir ondalık dizgesi olmalıdır.`;

/** Formats a NonPositiveError in Turkish. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri pozitif olmayan (<= 0) bir sayı olmalıdır.`;

/** Formats a NonPositiveDecimalStringError in Turkish. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri pozitif olmayan bir ondalık dizgesi olmalıdır.`;

/** Formats a NegativeError in Turkish. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri negatif (< 0) olmalıdır.`;

/** Formats a NegativeDecimalStringError in Turkish. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri negatif bir ondalık dizgesi olmalıdır.`;

/** Formats an IntError in Turkish. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri güvenli bir tam sayı olmalıdır.`;

/** Formats an IntFromStringError in Turkish. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri onluk tabanda bir tam sayı değildir.`;

/** Formats a FiniteNumberFromStringError in Turkish. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri onluk tabanda bir sayı değildir.`;

/** Formats a GreaterThanError in Turkish. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.min} değerinden büyük olmalıdır.`;

/** Formats a GreaterThanOrEqualToError in Turkish. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.min} veya daha büyük olmalıdır.`;

/** Formats a LessThanError in Turkish. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.max} değerinden küçük olmalıdır.`;

/** Formats a LessThanOrEqualToError in Turkish. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.max} veya daha küçük olmalıdır.`;

/** Formats a NonNaNError in Turkish. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Değer NaN olmamalıdır.";

/** Formats a FiniteError in Turkish. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri sonlu olmalıdır.`;

/** Formats a MultipleOfError in Turkish. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.divisor} sayısının katı olmalıdır.`;

/** Formats a BetweenError in Turkish. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri sınırlar dahil ${error.min} ile ${error.max} arasında olmalıdır.`;

/** Formats a GreaterThanBigIntError in Turkish. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.min} değerinden büyük olmalıdır.`;

/** Formats a GreaterThanOrEqualToBigIntError in Turkish. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.min} veya daha büyük olmalıdır.`;

/** Formats a LessThanBigIntError in Turkish. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.max} değerinden küçük olmalıdır.`;

/** Formats a LessThanOrEqualToBigIntError in Turkish. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.max} veya daha küçük olmalıdır.`;

/** Formats a BetweenBigIntError in Turkish. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri sınırlar dahil ${error.min} ile ${error.max} arasında olmalıdır.`;

/** Formats an ArrayError in Turkish. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `${safelyStringifyUnknownValue(error.reason.value)} değeri bir dizi değildir.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `${issue.index} dizinindeki dizi öğesi eksik.`;
    case "Accessor":
      return `${issue.index} dizinindeki dizi öğesi bir veri özelliği olmalıdır.`;
    case "ExcessProperty":
      return "Fazladan bir Array özelliğine izin verilmez. Bu özelliği kaldırın veya farklı bir Type kullanın.";
    case "Element":
      return `${issue.index} dizinindeki dizi öğesi geçersiz.`;
  }
};

/** Formats a NonEmptyArrayError in Turkish. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri en az bir öğe içermelidir.`;

/** Formats a UniqueError in Turkish. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri ${error.previousIndex} ve ${error.index} dizinlerinde eşit öğeler içeriyor.`;

/** Formats a SetError in Turkish. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `${safelyStringifyUnknownValue(error.reason.value)} değeri bir Set değildir.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Fazladan ${safelyStringifyUnknownValue(issue.key)} Set özelliğine izin verilmez.`;
    case "Element":
      return `${issue.index} dizinindeki Set öğesi geçersiz.`;
  }
};

/** Formats a MapError in Turkish. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `${safelyStringifyUnknownValue(error.reason.value)} değeri bir Map değildir.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Fazladan ${safelyStringifyUnknownValue(issue.key)} Map özelliğine izin verilmez.`;
    case "Key":
      return `${issue.index} dizinindeki Map anahtarı geçersiz.`;
    case "Value":
      return `${issue.index} dizinindeki Map değeri geçersiz.`;
    case "Collision":
      return `${issue.previousIndex} ve ${issue.index} dizinlerindeki Map anahtarları aynı ${safelyStringifyUnknownValue(issue.outputKey)} anahtarına çözümleniyor.`;
  }
};

/** Formats a MinSizeError in Turkish. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `Boyut ${error.value.size}, ancak en az ${error.min} olmalıdır.`;

/** Formats a MaxSizeError in Turkish. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `Boyut ${error.value.size}, ancak en fazla ${error.max} olmalıdır.`;

/** Formats a TupleError in Turkish. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `${safelyStringifyUnknownValue(error.reason.value)} değeri bir tuple değildir.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Bir Tuple ${error.reason.expected} uzunluğunda olmalıdır, ancak değerin uzunluğu ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `${issue.index} dizinindeki Tuple öğesi eksik.`;
    case "Accessor":
      return `${issue.index} dizinindeki Tuple öğesi bir veri özelliği olmalıdır.`;
    case "ExcessProperty":
      return "Fazladan bir Tuple özelliğine izin verilmez. Bu özelliği kaldırın veya farklı bir Type kullanın.";
    case "Element":
      return `${issue.index} dizinindeki Tuple öğesi geçersiz.`;
  }
};

/** Formats a RecordError in Turkish. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `${safelyStringifyUnknownValue(error.reason.value)} değeri bir Record değildir.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Değer bir nesnedir, ancak bir Record Output düz nesne olmalı veya null prototipine sahip olmalıdır.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `${safelyStringifyUnknownValue(issue.key)} özellik anahtarı geçersiz.`;
    case "Value":
      return `${safelyStringifyUnknownValue(issue.key)} özelliğinin değeri geçersiz.`;
    case "Accessor":
      return `${safelyStringifyUnknownValue(issue.key)} Record özelliği bir veri özelliği olmalıdır.`;
    case "NonEnumerable":
      return `${safelyStringifyUnknownValue(issue.key)} Record özelliği numaralandırılabilir olmalıdır.`;
    case "Collision":
      return `${safelyStringifyUnknownValue(issue.previousKey)} ve ${safelyStringifyUnknownValue(issue.key)} Record anahtarları aynı ${safelyStringifyUnknownValue(issue.outputKey)} anahtarına çözümleniyor.`;
  }
};

/** Formats a MinEntriesError in Turkish. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri en az ${error.min} girdi içermelidir.`;

/** Formats a MaxEntriesError in Turkish. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} değeri en fazla ${error.max} girdi içermelidir.`;

/** Formats an ObjectError in Turkish. */
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
        return "Bir Object özelliği veri özelliği olmalıdır. Bu Type'ı kullanmadan önce erişimci değerlerini düz verilere dönüştürün veya farklı bir Type kullanın.";
      case "NonEnumerable":
        return "Bir Object özelliği numaralandırılabilir olmalıdır. Bu özelliği numaralandırılabilir yapın veya farklı bir Type kullanın.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Zorunlu ${safelyStringifyUnknownValue(key)} özelliği eksik.`;
  }
  if (typeof key === "symbol") {
    return "Bir Object özellik anahtarı bir dizge olmalıdır. Sembol özelliğini kaldırın veya farklı bir Type kullanın.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `${safelyStringifyUnknownValue(key)} özelliğine izin verilmez. Bu özelliği kaldırın veya farklı bir Type kullanın.`;
  }
  return `${safelyStringifyUnknownValue(key)} özelliği geçersiz.`;
};

/** Formats a DiscriminatedUnionError in Turkish. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `${safelyStringifyUnknownValue(error.reason.key)} ayırt edici özelliği`;
      if (error.reason.reason === "Accessor") {
        return `${property} bir veri özelliği olmalıdır.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} nesnenin kendi özelliği olmalıdır.`;
      }
      return `${property} numaralandırılabilir olmalıdır.`;
    }
    case "Discriminator":
      return `${safelyStringifyUnknownValue(error.reason.key)} ayırt edici özelliği beklenmeyen bir değere sahip: ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Seçilen ${safelyStringifyUnknownValue(error.reason.discriminator)} varyantı geçersiz.`;
  }
};

/** Formats a DataError in Turkish. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `${safelyStringifyUnknownValue(issue.value)} değeri Data değildir.`;
    case "UnexpectedPrototype":
      return `Bir Data ${issue.container} beklenmeyen bir prototipe sahiptir.`;
    case "Accessor":
      return "Bir Data özelliği veri özelliği olmalıdır. Bu Type'ı kullanmadan önce erişimci değerlerini düz verilere dönüştürün veya farklı bir Type kullanın.";
    case "NonEnumerable":
      return "Bir Data Object özelliği numaralandırılabilir olmalıdır. Bu özelliği kaldırın veya farklı bir Type kullanın.";
    case "SymbolProperty":
      return "Bir Data Object özellik anahtarı bir dizge olmalıdır. Sembol özelliğini kaldırın veya farklı bir Type kullanın.";
    case "Hole":
      return "Bir Data Array öğesi eksik.";
    case "InvalidUint8Array":
      return "Bir Data Uint8Array, bağlantısı kesilmemiş bir ArrayBuffer'a sahip olmalı ve bu ArrayBuffer'ın sınırları içinde kalmalıdır.";
    case "ExcessProperty":
      return `Bir Data ${issue.container} fazladan kendi özelliklerine sahip olmamalıdır. Özelliği kaldırın veya farklı bir Type kullanın.`;
  }
};

/** Formats a JsonValueError in Turkish. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `${safelyStringifyUnknownValue(issue.value)} değeri bir JSON değeri değildir.`;
    case "NonFiniteNumber":
      return "Bir JSON sayısı sonlu olmalıdır.";
    case "UnexpectedPrototype":
      return "Değer bir nesnedir, ancak bir JsonValue nesnesi düz nesne olmalı veya null prototipine sahip olmalıdır.";
    case "Accessor":
      return "Bir JSON özelliği veri özelliği olmalıdır. Bu Type'ı kullanmadan önce erişimci değerlerini düz verilere dönüştürün veya farklı bir Type kullanın.";
    case "NonEnumerable":
      return "Bir JSON nesnesi özelliği numaralandırılabilir olmalıdır. Bu özelliği kaldırın veya farklı bir Type kullanın.";
    case "SymbolProperty":
      return "Bir JSON nesnesi özellik anahtarı bir dizge olmalıdır. Sembol özelliğini kaldırın veya farklı bir Type kullanın.";
    case "Hole":
      return "Bir JSON dizi öğesi eksik.";
    case "ExcessProperty":
      return "Fazladan bir JSON dizi özelliğine izin verilmez. Bu özelliği kaldırın veya farklı bir Type kullanın.";
    case "CircularReference":
      return "Bir JsonValue döngüsel başvurular içermemelidir.";
  }
};

/** Formats a JsonError in Turkish. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir JsonValue olarak ayrıştırılamaz.`;

/** Formats a ByteSizeLiteralError in Turkish. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir bayt boyutu değişmezi değildir. "512KiB" veya "1MiB" gibi bir değer kullanın.`;

/** Formats a ByteLengthError in Turkish. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "-0 değeri bir bayt uzunluğu değildir. Bunun yerine 0 kullanın.";

/** Formats a ByteLengthFromStringError in Turkish. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir bayt uzunluğu değildir. Bir bayt sayısı veya 10MiB gibi bir değişmez kullanın.`;

/** Formats a DurationLiteralError in Turkish. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir süre değişmezi değildir. "500ms" veya "1.5s" gibi bir değer kullanın.`;

/** Formats a PercentageLiteralError in Turkish. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} değeri bir yüzde değişmezi değildir. "50%" veya "12.5%" gibi bir değer kullanın.`;
