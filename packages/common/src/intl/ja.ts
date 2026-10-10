/**
 * Japanese Evolu Type error formatters.
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

  return `値 ${safelyStringifyUnknownValue(error.value)} は ${typeOf} 型ではありません。`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `値 ${safelyStringifyUnknownValue(reason.value)} はオブジェクトではありません。`
    : "値はオブジェクトですが、Object Output はプレーンオブジェクトであるか、null プロトタイプを持つ必要があります。";

/** Formats a NeverError in Japanese. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は型 Never では無効です。`;

/** Formats a String TypeOfError in Japanese. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Japanese. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はテンプレートリテラルに一致しません。`;

/** Formats a Number TypeOfError in Japanese. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Japanese. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Japanese. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Japanese. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は真偽値ではありません。true または false を使用してください。`;

/** Formats a Symbol TypeOfError in Japanese. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Japanese. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Japanese. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は Evolu Type ではありません。`;

/** Formats an ObjectTagError in Japanese. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} には、期待されるオブジェクトタグ ${safelyStringifyUnknownValue(error.expected)} がありません。`;

/** Formats a ValidDateError in Japanese. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date が無効です。";

/** Formats an InstanceOfError in Japanese. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.constructorName} のインスタンスではありません。`;

/** Formats a LiteralError in Japanese. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は、期待されるリテラル ${String(error.expected)} と厳密に等しくありません。`;

/** Formats a UnionError in Japanese. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "値はいずれの許可されたバリアントにも一致しません。";

/** Formats a DateIsoError in Japanese. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正規形式の ISO 日時文字列ではありません。`;

/** Formats a PlainDateIsoError in Japanese. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は YYYY-MM-DD 形式の有効な日付ではありません。`;

/** Formats a DateIsoFromDateError in Japanese. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date を DateIso として表現できません。";

/** Formats a DateIsoFromRfc3339Error in Japanese. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はサポートされている RFC 3339 形式の日時ではありません。"2024-01-01T12:00:00Z" のような値を使用してください。`;

/** Formats a DecimalStringError in Japanese. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正規形式の10進数文字列である必要があります。`;

/** Formats an Int64Error in Japanese. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な符号付き64ビット整数 (Int64) ではありません。`;

/** Formats a UInt64Error in Japanese. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な符号なし64ビット整数 (UInt64) ではありません。`;

/** Formats an Int64StringError in Japanese. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Int64 文字列ではありません。`;

/** Formats an IdentifierError in Japanese. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.casing} 識別子ではありません。`;

/** Formats a CapitalizedError in Japanese. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は先頭が大文字である必要があります。`;

/** Formats an UncapitalizedError in Japanese. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は大文字で始まってはいけません。`;

/** Formats an UppercasedError in Japanese. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は大文字である必要があります。`;

/** Formats a LowercasedError in Japanese. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は小文字である必要があります。`;

/** Formats a TrimmedError in Japanese. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は前後の空白が除去されている必要があります。`;

/** Formats a WellFormedError in Japanese. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は整形式の Unicode テキストである必要があります。`;

/** Formats a NormalizedError in Japanese. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は Unicode 正規化形式 ${error.form} である必要があります。`;

/** Formats a StartsWithError in Japanese. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${safelyStringifyUnknownValue(error.prefix)} で始まる必要があります。`;

/** Formats an EndsWithError in Japanese. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${safelyStringifyUnknownValue(error.suffix)} で終わる必要があります。`;

/** Formats an IncludesError in Japanese. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${safelyStringifyUnknownValue(error.substring)} を含む必要があります。`;

/** Formats an ExcludesError in Japanese. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${safelyStringifyUnknownValue(error.substring)} を含んではいけません。`;

/** Formats a MinLengthError in Japanese. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は最小長 ${error.min} を満たしていません。`;

/** Formats a MaxLengthError in Japanese. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は最大長 ${error.max} を超えています。`;

/** Formats a MaxUtf8ByteLengthError in Japanese. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は UTF-8 の最大バイト長 ${error.max} を超えています。`;

/** Formats a LengthError in Japanese. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} の長さは ${error.exact} である必要があります。`;

/** Formats a RegexError in Japanese. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は /${error.source}/${error.flags} に一致しません。`;

/** Formats a Base64UrlError in Japanese. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Base64Url 文字列ではありません。`;

/** Formats a Base64Error in Japanese. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Base64 文字列ではありません。`;

/** Formats a HexError in Japanese. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は偶数桁の小文字の16進数文字列ではありません。`;

/** Formats a HexColorError in Japanese. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は小文字の #rrggbb 形式の色ではありません。`;

/** Formats a NameError in Japanese. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Name ではありません。`;

/** Formats an EmailError in Japanese. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効なメールアドレスではありません。`;

/** Formats a HostnameError in Japanese. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な小文字のホスト名ではありません。`;

/** Formats an Ipv4AddressError in Japanese. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な IPv4 アドレスではありません。`;

/** Formats an Ipv6AddressError in Japanese. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正規形式の IPv6 アドレスではありません。`;

/** Formats an Ipv6AddressFromStringError in Japanese. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な IPv6 アドレスではありません。`;

/** Formats an IpAddressError in Japanese. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な IPv4 アドレスでも正規形式の IPv6 アドレスでもありません。`;

/** Formats an IpAddressFromStringError in Japanese. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な IP アドレスではありません。`;

/** Formats a PhoneNumberE164Error in Japanese. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は E.164 形式の電話番号ではありません。`;

/** Formats an IbanError in Japanese. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は空白を含まない大文字の有効な IBAN ではありません。`;

/** Formats an IsbnError in Japanese. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はハイフンを含まない有効な13桁の ISBN ではありません。`;

/** Formats a SimplePasswordError in Japanese. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "パスワードは前後の空白が除去されている必要があります。";
    case "TooLong":
      return "パスワードは最大長 64 を超えています。";
    case "TooShort":
      return "パスワードは最小長 8 を満たしていません。";
  }
};

/** Formats a MnemonicError in Japanese. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "値は有効な英語の BIP39 ニーモニックではありません。";

/** Formats an IdError in Japanese. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Id ではありません。`;

/** Formats a TableIdError in Japanese. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はテーブル ${error.table} の有効な Id ではありません。`;

/** Formats a UuidError in Japanese. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正規形式の小文字 UUID ではありません。`;

/** Formats a UuidVersionError in Japanese. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はバージョン ${error.version} の UUID ではありません。`;

/** Formats a UlidError in Japanese. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正規形式の大文字 ULID ではありません。`;

/** Formats a NonNegativeError in Japanese. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以上 (>= 0) である必要があります。`;

/** Formats a NonNegativeDecimalStringError in Japanese. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以上の10進数文字列である必要があります。`;

/** Formats a PositiveError in Japanese. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正 (> 0) である必要があります。`;

/** Formats a PositiveDecimalStringError in Japanese. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正の10進数文字列である必要があります。`;

/** Formats a NonPositiveError in Japanese. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以下 (<= 0) である必要があります。`;

/** Formats a NonPositiveDecimalStringError in Japanese. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以下の10進数文字列である必要があります。`;

/** Formats a NegativeError in Japanese. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は負 (< 0) である必要があります。`;

/** Formats a NegativeDecimalStringError in Japanese. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は負の10進数文字列である必要があります。`;

/** Formats an IntError in Japanese. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は安全な整数である必要があります。`;

/** Formats an IntFromStringError in Japanese. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は10進整数ではありません。`;

/** Formats a FiniteNumberFromStringError in Japanese. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は10進数ではありません。`;

/** Formats a GreaterThanError in Japanese. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} より大きい必要があります。`;

/** Formats a GreaterThanOrEqualToError in Japanese. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} 以上である必要があります。`;

/** Formats a LessThanError in Japanese. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.max} より小さい必要があります。`;

/** Formats a LessThanOrEqualToError in Japanese. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.max} 以下である必要があります。`;

/** Formats a NonNaNError in Japanese. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "値は NaN であってはなりません。";

/** Formats a FiniteError in Japanese. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有限値である必要があります。`;

/** Formats a MultipleOfError in Japanese. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.divisor} の倍数である必要があります。`;

/** Formats a BetweenError in Japanese. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} 以上 ${error.max} 以下である必要があります。`;

/** Formats a GreaterThanBigIntError in Japanese. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} より大きい必要があります。`;

/** Formats a GreaterThanOrEqualToBigIntError in Japanese. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} 以上である必要があります。`;

/** Formats a LessThanBigIntError in Japanese. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.max} より小さい必要があります。`;

/** Formats a LessThanOrEqualToBigIntError in Japanese. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.max} 以下である必要があります。`;

/** Formats a BetweenBigIntError in Japanese. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} 以上 ${error.max} 以下である必要があります。`;

/** Formats an ArrayError in Japanese. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} は配列ではありません。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `インデックス ${issue.index} の配列要素が欠落しています。`;
    case "Accessor":
      return `インデックス ${issue.index} の配列要素はデータプロパティである必要があります。`;
    case "ExcessProperty":
      return "余分な Array プロパティは許可されていません。削除するか、別の Type を使用してください。";
    case "Element":
      return `インデックス ${issue.index} の配列要素が無効です。`;
  }
};

/** Formats a NonEmptyArrayError in Japanese. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は少なくとも 1 つの要素を含む必要があります。`;

/** Formats a UniqueError in Japanese. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} のインデックス ${error.previousIndex} と ${error.index} の要素が等しくなっています。`;

/** Formats a SetError in Japanese. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} は Set ではありません。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `余分な Set プロパティ ${safelyStringifyUnknownValue(issue.key)} は許可されていません。`;
    case "Element":
      return `インデックス ${issue.index} の Set 要素が無効です。`;
  }
};

/** Formats a MapError in Japanese. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} は Map ではありません。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `余分な Map プロパティ ${safelyStringifyUnknownValue(issue.key)} は許可されていません。`;
    case "Key":
      return `インデックス ${issue.index} の Map キーが無効です。`;
    case "Value":
      return `インデックス ${issue.index} の Map の値が無効です。`;
    case "Collision":
      return `インデックス ${issue.previousIndex} と ${issue.index} の Map キーは、デコードすると同じキー ${safelyStringifyUnknownValue(issue.outputKey)} になります。`;
  }
};

/** Formats a MinSizeError in Japanese. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `サイズ ${error.value.size} は最小サイズ ${error.min} を満たしていません。`;

/** Formats a MaxSizeError in Japanese. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `サイズ ${error.value.size} は最大サイズ ${error.max} を超えています。`;

/** Formats a TupleError in Japanese. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} はタプルではありません。`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple の長さは ${error.reason.expected} である必要がありますが、値の長さは ${error.reason.actual} です。`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `インデックス ${issue.index} の Tuple 要素が欠落しています。`;
    case "Accessor":
      return `インデックス ${issue.index} の Tuple 要素はデータプロパティである必要があります。`;
    case "ExcessProperty":
      return "余分な Tuple プロパティは許可されていません。削除するか、別の Type を使用してください。";
    case "Element":
      return `インデックス ${issue.index} の Tuple 要素が無効です。`;
  }
};

/** Formats a RecordError in Japanese. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} は Record ではありません。`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "値はオブジェクトですが、Record Output はプレーンオブジェクトであるか、null プロトタイプを持つ必要があります。";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `プロパティキー ${safelyStringifyUnknownValue(issue.key)} が無効です。`;
    case "Value":
      return `プロパティ ${safelyStringifyUnknownValue(issue.key)} の値が無効です。`;
    case "Accessor":
      return `Record プロパティ ${safelyStringifyUnknownValue(issue.key)} はデータプロパティである必要があります。`;
    case "NonEnumerable":
      return `Record プロパティ ${safelyStringifyUnknownValue(issue.key)} は列挙可能である必要があります。`;
    case "Collision":
      return `Record キー ${safelyStringifyUnknownValue(issue.previousKey)} と ${safelyStringifyUnknownValue(issue.key)} は、デコードすると同じキー ${safelyStringifyUnknownValue(issue.outputKey)} になります。`;
  }
};

/** Formats a MinEntriesError in Japanese. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は最小エントリ数 ${error.min} を満たしていません。`;

/** Formats a MaxEntriesError in Japanese. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は最大エントリ数 ${error.max} を超えています。`;

/** Formats an ObjectError in Japanese. */
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
        return "Object プロパティはデータプロパティである必要があります。アクセサーの値をプレーンデータとして実体化してからこの Type を使用するか、別の Type を使用してください。";
      case "NonEnumerable":
        return "Object プロパティは列挙可能である必要があります。列挙可能にするか、別の Type を使用してください。";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `必須プロパティ ${safelyStringifyUnknownValue(key)} がありません。`;
  }
  if (typeof key === "symbol") {
    return "Object プロパティキーは文字列である必要があります。symbol プロパティを削除するか、別の Type を使用してください。";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `プロパティ ${safelyStringifyUnknownValue(key)} は許可されていません。削除するか、別の Type を使用してください。`;
  }
  return `プロパティ ${safelyStringifyUnknownValue(key)} が無効です。`;
};

/** Formats a DiscriminatedUnionError in Japanese. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `判別子プロパティ ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} はデータプロパティである必要があります。`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} は自身のプロパティである必要があります。`;
      }
      return `${property} は列挙可能である必要があります。`;
    }
    case "Discriminator":
      return `判別子プロパティ ${safelyStringifyUnknownValue(error.reason.key)} の値 ${safelyStringifyUnknownValue(error.reason.value)} は予期されていません。`;
    case "Member":
      return `選択されたバリアント ${safelyStringifyUnknownValue(error.reason.discriminator)} が無効です。`;
  }
};

/** Formats a DataError in Japanese. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `値 ${safelyStringifyUnknownValue(issue.value)} は Data ではありません。`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} に予期しないプロトタイプがあります。`;
    case "Accessor":
      return "Data プロパティはデータプロパティである必要があります。アクセサーの値をプレーンデータとして実体化してからこの Type を使用するか、別の Type を使用してください。";
    case "NonEnumerable":
      return "Data Object のプロパティは列挙可能である必要があります。列挙不可のプロパティを削除するか、別の Type を使用してください。";
    case "SymbolProperty":
      return "Data Object のプロパティキーは文字列である必要があります。symbol プロパティを削除するか、別の Type を使用してください。";
    case "Hole":
      return "Data Array の要素が欠落しています。";
    case "InvalidUint8Array":
      return "Data Uint8Array は、切り離されていない ArrayBuffer を参照し、その範囲内に収まっている必要があります。";
    case "ExcessProperty":
      return `Data ${issue.container} は余分な自身のプロパティを持ってはなりません。そのプロパティを削除するか、別の Type を使用してください。`;
  }
};

/** Formats a JsonValueError in Japanese. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `値 ${safelyStringifyUnknownValue(issue.value)} は JSON 値ではありません。`;
    case "NonFiniteNumber":
      return "JSON の数値は有限値である必要があります。";
    case "UnexpectedPrototype":
      return "値はオブジェクトですが、JsonValue オブジェクトはプレーンオブジェクトであるか、null プロトタイプを持つ必要があります。";
    case "Accessor":
      return "JSON プロパティはデータプロパティである必要があります。アクセサーの値をプレーンデータとして実体化してからこの Type を使用するか、別の Type を使用してください。";
    case "NonEnumerable":
      return "JSON オブジェクトのプロパティは列挙可能である必要があります。列挙不可のプロパティを削除するか、別の Type を使用してください。";
    case "SymbolProperty":
      return "JSON オブジェクトのプロパティキーは文字列である必要があります。symbol プロパティを削除するか、別の Type を使用してください。";
    case "Hole":
      return "JSON 配列の要素が欠落しています。";
    case "ExcessProperty":
      return "余分な JSON 配列プロパティは許可されていません。削除するか、別の Type を使用してください。";
    case "CircularReference":
      return "JsonValue に循環参照を含んではなりません。";
  }
};

/** Formats a JsonError in Japanese. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} を JsonValue として解析できません。`;

/** Formats a ByteSizeLiteralError in Japanese. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はバイトサイズのリテラルではありません。"512KiB" または "1MiB" のような値を使用してください。`;

/** Formats a ByteLengthError in Japanese. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "値 -0 はバイト長ではありません。代わりに 0 を使用してください。";

/** Formats a ByteLengthFromStringError in Japanese. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はバイト長ではありません。バイト数、または 10MiB のようなリテラルを使用してください。`;

/** Formats a DurationLiteralError in Japanese. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は期間のリテラルではありません。"500ms" または "1.5s" のような値を使用してください。`;

/** Formats a PercentageLiteralError in Japanese. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はパーセントのリテラルではありません。"50%" または "12.5%" のような値を使用してください。`;
