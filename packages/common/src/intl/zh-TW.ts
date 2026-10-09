/**
 * Traditional Chinese Evolu Type error formatters.
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
  FiniteError,
  FiniteNumberFromStringError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  HexError,
  HostnameError,
  IbanError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
  IdError,
  Ipv4AddressError,
  Ipv6AddressError,
  Ipv6AddressFromStringError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxEntriesError,
  MaxLengthError,
  MinEntriesError,
  MinLengthError,
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

  return `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${typeOf} 類型。`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `值 ${safelyStringifyUnknownValue(reason.value)} 不是物件。`
    : "此值是物件，但 Object Output 必須是普通物件或具有 null 原型。";

/** Formats a NeverError in Traditional Chinese. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不符合 Never 類型。`;

/** Formats a String TypeOfError in Traditional Chinese. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Traditional Chinese. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不符合樣板字面值。`;

/** Formats a Number TypeOfError in Traditional Chinese. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Traditional Chinese. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Traditional Chinese. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Traditional Chinese. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是布林值。請使用 true 或 false。`;

/** Formats a Symbol TypeOfError in Traditional Chinese. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Traditional Chinese. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Traditional Chinese. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是 Evolu Type。`;

/** Formats an ObjectTagError in Traditional Chinese. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 沒有預期的物件標籤 ${safelyStringifyUnknownValue(error.expected)}。`;

/** Formats a ValidDateError in Traditional Chinese. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "此 Date 無效。";

/** Formats an InstanceOfError in Traditional Chinese. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${error.constructorName} 的執行個體。`;

/** Formats a LiteralError in Traditional Chinese. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不與預期的字面值嚴格相等：${String(error.expected)}。`;

/** Formats a UnionError in Traditional Chinese. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "值不符合任何允許的變體。";

/** Formats a DateIsoError in Traditional Chinese. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是標準 ISO 日期時間字串。`;

/** Formats a PlainDateIsoError in Traditional Chinese. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 YYYY-MM-DD 格式的有效日曆日期。`;

/** Formats a DateIsoFromDateError in Traditional Chinese. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "此 Date 無法表示為 DateIso。";

/** Formats a DateIsoFromRfc3339Error in Traditional Chinese. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是受支援的 RFC 3339 日期時間。請使用 "2024-01-01T12:00:00Z" 這樣的值。`;

/** Formats a DecimalStringError in Traditional Chinese. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是標準十進位字串。`;

/** Formats an Int64Error in Traditional Chinese. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的有號 64 位元整數（Int64）。`;

/** Formats a UInt64Error in Traditional Chinese. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的無號 64 位元整數（UInt64）。`;

/** Formats an Int64StringError in Traditional Chinese. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Int64 字串。`;

/** Formats an IdentifierError in Traditional Chinese. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${error.casing} 識別字。`;

/** Formats a CapitalizedError in Traditional Chinese. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須以大寫字母開頭。`;

/** Formats an UncapitalizedError in Traditional Chinese. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不得以大寫字母開頭。`;

/** Formats an UppercasedError in Traditional Chinese. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須為大寫。`;

/** Formats a LowercasedError in Traditional Chinese. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須為小寫。`;

/** Formats a TrimmedError in Traditional Chinese. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不得有前後空白。`;

/** Formats a WellFormedError in Traditional Chinese. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是格式正確的 Unicode 文字。`;

/** Formats a NormalizedError in Traditional Chinese. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須採用 Unicode 正規化形式 ${error.form}。`;

/** Formats a StartsWithError in Traditional Chinese. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須以 ${safelyStringifyUnknownValue(error.prefix)} 開頭。`;

/** Formats an EndsWithError in Traditional Chinese. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須以 ${safelyStringifyUnknownValue(error.suffix)} 結尾。`;

/** Formats a MinLengthError in Traditional Chinese. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 未達最小長度 ${error.min}。`;

/** Formats a MaxLengthError in Traditional Chinese. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 超過最大長度 ${error.max}。`;

/** Formats a LengthError in Traditional Chinese. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不具有所需長度 ${error.exact}。`;

/** Formats a RegexError in Traditional Chinese. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不符合 /${error.source}/${error.flags}。`;

/** Formats a Base64UrlError in Traditional Chinese. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Base64Url 字串。`;

/** Formats a Base64Error in Traditional Chinese. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Base64 字串。`;

/** Formats a HexError in Traditional Chinese. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是位數為偶數的小寫十六進位字串。`;

/** Formats a NameError in Traditional Chinese. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Name。`;

/** Formats an EmailError in Traditional Chinese. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的電子郵件地址。`;

/** Formats a HostnameError in Traditional Chinese. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的小寫主機名稱。`;

/** Formats an Ipv4AddressError in Traditional Chinese. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 IPv4 位址。`;

/** Formats an Ipv6AddressError in Traditional Chinese. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是標準 IPv6 位址。`;

/** Formats an Ipv6AddressFromStringError in Traditional Chinese. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 IPv6 位址。`;

/** Formats a PhoneNumberE164Error in Traditional Chinese. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 E.164 格式的電話號碼。`;

/** Formats an IbanError in Traditional Chinese. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的無空格大寫 IBAN。`;

/** Formats a SimplePasswordError in Traditional Chinese. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "密碼不得有前後空白。";
    case "TooLong":
      return "密碼超過最大長度 64。";
    case "TooShort":
      return "密碼未達最小長度 8。";
  }
};

/** Formats a MnemonicError in Traditional Chinese. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "此值不是有效的英文 BIP39 助記詞。";

/** Formats an IdError in Traditional Chinese. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Id。`;

/** Formats a TableIdError in Traditional Chinese. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是資料表 ${error.table} 的有效 Id。`;

/** Formats a UuidError in Traditional Chinese. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是標準小寫 UUID。`;

/** Formats a UuidVersionError in Traditional Chinese. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是版本 ${error.version} 的 UUID。`;

/** Formats a NonNegativeError in Traditional Chinese. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須為非負數（>= 0）。`;

/** Formats a NonNegativeDecimalStringError in Traditional Chinese. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是非負十進位字串。`;

/** Formats a PositiveError in Traditional Chinese. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須為正數（> 0）。`;

/** Formats a PositiveDecimalStringError in Traditional Chinese. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是正十進位字串。`;

/** Formats a NonPositiveError in Traditional Chinese. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須為非正數（<= 0）。`;

/** Formats a NonPositiveDecimalStringError in Traditional Chinese. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是非正十進位字串。`;

/** Formats a NegativeError in Traditional Chinese. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須為負數（< 0）。`;

/** Formats a NegativeDecimalStringError in Traditional Chinese. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是負十進位字串。`;

/** Formats an IntError in Traditional Chinese. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是安全整數。`;

/** Formats an IntFromStringError in Traditional Chinese. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是十進位整數。`;

/** Formats a FiniteNumberFromStringError in Traditional Chinese. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是十進位數字。`;

/** Formats a GreaterThanError in Traditional Chinese. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須大於 ${error.min}。`;

/** Formats a GreaterThanOrEqualToError in Traditional Chinese. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須大於或等於 ${error.min}。`;

/** Formats a LessThanError in Traditional Chinese. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須小於 ${error.max}。`;

/** Formats a LessThanOrEqualToError in Traditional Chinese. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須小於或等於 ${error.max}。`;

/** Formats a NonNaNError in Traditional Chinese. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "值不得為 NaN。";

/** Formats a FiniteError in Traditional Chinese. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須為有限數字。`;

/** Formats a MultipleOfError in Traditional Chinese. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是 ${error.divisor} 的倍數。`;

/** Formats a BetweenError in Traditional Chinese. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須介於 ${error.min} 和 ${error.max} 之間（含端點）。`;

/** Formats an ArrayError in Traditional Chinese. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是陣列。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `索引 ${issue.index} 的陣列元素缺失。`;
    case "Accessor":
      return `索引 ${issue.index} 的陣列元素必須是資料屬性。`;
    case "ExcessProperty":
      return "不允許多餘的 Array 屬性。請移除它或使用不同的 Type。";
    case "Element":
      return `索引 ${issue.index} 的陣列元素無效。`;
  }
};

/** Formats a NonEmptyArrayError in Traditional Chinese. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須至少包含一個項目。`;

/** Formats a UniqueError in Traditional Chinese. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 中索引 ${error.previousIndex} 和 ${error.index} 的項目相等。`;

/** Formats a SetError in Traditional Chinese. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Set。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `不允許多餘的 Set 屬性 ${safelyStringifyUnknownValue(issue.key)}。`;
    case "Element":
      return `索引 ${issue.index} 的 Set 元素無效。`;
  }
};

/** Formats a MapError in Traditional Chinese. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Map。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `不允許多餘的 Map 屬性 ${safelyStringifyUnknownValue(issue.key)}。`;
    case "Key":
      return `索引 ${issue.index} 的 Map 鍵無效。`;
    case "Value":
      return `索引 ${issue.index} 的 Map 值無效。`;
    case "Collision":
      return `索引 ${issue.previousIndex} 和 ${issue.index} 的 Map 鍵解碼為相同的鍵 ${safelyStringifyUnknownValue(issue.outputKey)}。`;
  }
};

/** Formats a TupleError in Traditional Chinese. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是元組。`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple 的長度必須為 ${error.reason.expected}，但此值的長度為 ${error.reason.actual}。`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `索引 ${issue.index} 的 Tuple 元素缺失。`;
    case "Accessor":
      return `索引 ${issue.index} 的 Tuple 元素必須是資料屬性。`;
    case "ExcessProperty":
      return "不允許多餘的 Tuple 屬性。請移除它或使用不同的 Type。";
    case "Element":
      return `索引 ${issue.index} 的 Tuple 元素無效。`;
  }
};

/** Formats a RecordError in Traditional Chinese. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Record。`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "此值是物件，但 Record Output 必須是普通物件或具有 null 原型。";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `屬性鍵 ${safelyStringifyUnknownValue(issue.key)} 無效。`;
    case "Value":
      return `屬性 ${safelyStringifyUnknownValue(issue.key)} 的值無效。`;
    case "Accessor":
      return `Record 屬性 ${safelyStringifyUnknownValue(issue.key)} 必須是資料屬性。`;
    case "NonEnumerable":
      return `Record 屬性 ${safelyStringifyUnknownValue(issue.key)} 必須可列舉。`;
    case "Collision":
      return `Record 鍵 ${safelyStringifyUnknownValue(issue.previousKey)} 和 ${safelyStringifyUnknownValue(issue.key)} 解碼為相同的鍵 ${safelyStringifyUnknownValue(issue.outputKey)}。`;
  }
};

/** Formats a MinEntriesError in Traditional Chinese. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 未達最小項目數 ${error.min}。`;

/** Formats a MaxEntriesError in Traditional Chinese. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 超過最大項目數 ${error.max}。`;

/** Formats an ObjectError in Traditional Chinese. */
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
        return "Object 屬性必須是資料屬性。請先將存取子值具體化為純資料，再使用此 Type，或使用不同的 Type。";
      case "NonEnumerable":
        return "Object 屬性必須可列舉。請讓它可列舉，或使用不同的 Type。";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `必要的屬性 ${safelyStringifyUnknownValue(key)} 缺失。`;
  }
  if (typeof key === "symbol") {
    return "Object 屬性鍵必須是字串。請移除 symbol 屬性或使用不同的 Type。";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `不允許屬性 ${safelyStringifyUnknownValue(key)}。請移除它或使用不同的 Type。`;
  }
  return `屬性 ${safelyStringifyUnknownValue(key)} 無效。`;
};

/** Formats a DiscriminatedUnionError in Traditional Chinese. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `判別屬性 ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} 必須是資料屬性。`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} 必須是自身屬性。`;
      }
      return `${property} 必須可列舉。`;
    }
    case "Discriminator":
      return `判別屬性 ${safelyStringifyUnknownValue(error.reason.key)} 具有非預期的值 ${safelyStringifyUnknownValue(error.reason.value)}。`;
    case "Member":
      return `選取的變體 ${safelyStringifyUnknownValue(error.reason.discriminator)} 無效。`;
  }
};

/** Formats a DataError in Traditional Chinese. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `值 ${safelyStringifyUnknownValue(issue.value)} 不是 Data。`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} 具有非預期的原型。`;
    case "Accessor":
      return "Data 屬性必須是資料屬性。請先將存取子值具體化為純資料，再使用此 Type，或使用不同的 Type。";
    case "NonEnumerable":
      return "Data Object 屬性必須可列舉。請移除它或使用不同的 Type。";
    case "SymbolProperty":
      return "Data Object 屬性鍵必須是字串。請移除 symbol 屬性或使用不同的 Type。";
    case "Hole":
      return "Data Array 元素缺失。";
    case "InvalidUint8Array":
      return "Data Uint8Array 必須參照未分離的 ArrayBuffer，且不得超出其邊界。";
    case "ExcessProperty":
      return `Data ${issue.container} 不允許有多餘的自身屬性。請移除該屬性或使用不同的 Type。`;
  }
};

/** Formats a JsonValueError in Traditional Chinese. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `值 ${safelyStringifyUnknownValue(issue.value)} 不是 JSON 值。`;
    case "NonFiniteNumber":
      return "JSON 數字必須是有限數字。";
    case "UnexpectedPrototype":
      return "此值是物件，但 JsonValue 物件必須是普通物件或具有 null 原型。";
    case "Accessor":
      return "JSON 屬性必須是資料屬性。請先將存取子值具體化為純資料，再使用此 Type，或使用不同的 Type。";
    case "NonEnumerable":
      return "JSON 物件屬性必須可列舉。請移除它或使用不同的 Type。";
    case "SymbolProperty":
      return "JSON 物件屬性鍵必須是字串。請移除 symbol 屬性或使用不同的 Type。";
    case "Hole":
      return "JSON 陣列元素缺失。";
    case "ExcessProperty":
      return "不允許多餘的 JSON 陣列屬性。請移除它或使用不同的 Type。";
    case "CircularReference":
      return "JsonValue 不得包含循環參照。";
  }
};

/** Formats a JsonError in Traditional Chinese. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 無法剖析為 JsonValue。`;

/** Formats a ByteSizeLiteralError in Traditional Chinese. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是位元組大小字面值。請使用 "512KiB" 或 "1MiB" 這樣的值。`;

/** Formats a ByteLengthError in Traditional Chinese. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "值 -0 不是位元組長度。請改用 0。";

/** Formats a ByteLengthFromStringError in Traditional Chinese. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是位元組長度。請使用位元組數或 10MiB 這樣的字面值。`;

/** Formats a DurationLiteralError in Traditional Chinese. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是時間長度字面值。請使用 "500ms" 或 "1.5s" 這樣的值。`;

/** Formats a PercentageLiteralError in Traditional Chinese. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是百分比字面值。請使用 "50%" 或 "12.5%" 這樣的值。`;
