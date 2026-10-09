/**
 * Simplified Chinese Evolu Type error formatters.
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

  return `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${typeOf} 类型。`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `值 ${safelyStringifyUnknownValue(reason.value)} 不是对象。`
    : "该值是对象，但 Object Output 必须是普通对象或具有 null 原型。";

/** Formats a NeverError in Simplified Chinese. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 对类型 Never 无效。`;

/** Formats a String TypeOfError in Simplified Chinese. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Simplified Chinese. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不匹配模板字面量。`;

/** Formats a Number TypeOfError in Simplified Chinese. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Simplified Chinese. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Simplified Chinese. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Simplified Chinese. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是布尔值。请使用 true 或 false。`;

/** Formats a Symbol TypeOfError in Simplified Chinese. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Simplified Chinese. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Simplified Chinese. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是 Evolu Type。`;

/** Formats an ObjectTagError in Simplified Chinese. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不具有预期的对象标签 ${safelyStringifyUnknownValue(error.expected)}。`;

/** Formats a ValidDateError in Simplified Chinese. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date 无效。";

/** Formats an InstanceOfError in Simplified Chinese. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${error.constructorName} 的实例。`;

/** Formats a LiteralError in Simplified Chinese. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不严格等于预期字面量：${String(error.expected)}。`;

/** Formats a UnionError in Simplified Chinese. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "值不匹配任何允许的变体。";

/** Formats a DateIsoError in Simplified Chinese. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是规范的 ISO 日期时间字符串。`;

/** Formats a PlainDateIsoError in Simplified Chinese. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 YYYY-MM-DD 格式的有效日历日期。`;

/** Formats a DateIsoFromDateError in Simplified Chinese. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date 无法表示为 DateIso。";

/** Formats a DateIsoFromRfc3339Error in Simplified Chinese. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是受支持的 RFC 3339 日期时间。请使用 "2024-01-01T12:00:00Z" 这样的值。`;

/** Formats a DecimalStringError in Simplified Chinese. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是规范的十进制字符串。`;

/** Formats an Int64Error in Simplified Chinese. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的有符号 64 位整数（Int64）。`;

/** Formats a UInt64Error in Simplified Chinese. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的无符号 64 位整数（UInt64）。`;

/** Formats an Int64StringError in Simplified Chinese. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Int64 字符串。`;

/** Formats an IdentifierError in Simplified Chinese. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${error.casing} 标识符。`;

/** Formats a CapitalizedError in Simplified Chinese. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须以大写字母开头。`;

/** Formats an UncapitalizedError in Simplified Chinese. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不得以大写字母开头。`;

/** Formats an UppercasedError in Simplified Chinese. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须为大写。`;

/** Formats a LowercasedError in Simplified Chinese. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须为小写。`;

/** Formats a TrimmedError in Simplified Chinese. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须去除首尾空白。`;

/** Formats a WellFormedError in Simplified Chinese. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是格式正确的 Unicode 文本。`;

/** Formats a NormalizedError in Simplified Chinese. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须采用 Unicode 规范化形式 ${error.form}。`;

/** Formats a StartsWithError in Simplified Chinese. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须以 ${safelyStringifyUnknownValue(error.prefix)} 开头。`;

/** Formats an EndsWithError in Simplified Chinese. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须以 ${safelyStringifyUnknownValue(error.suffix)} 结尾。`;

/** Formats a MinLengthError in Simplified Chinese. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 未达到最小长度 ${error.min}。`;

/** Formats a MaxLengthError in Simplified Chinese. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 超过最大长度 ${error.max}。`;

/** Formats a LengthError in Simplified Chinese. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 的长度不等于要求的 ${error.exact}。`;

/** Formats a RegexError in Simplified Chinese. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不匹配 /${error.source}/${error.flags}。`;

/** Formats a Base64UrlError in Simplified Chinese. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Base64Url 字符串。`;

/** Formats a Base64Error in Simplified Chinese. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Base64 字符串。`;

/** Formats a HexError in Simplified Chinese. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是位数为偶数的小写十六进制字符串。`;

/** Formats a NameError in Simplified Chinese. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Name。`;

/** Formats an EmailError in Simplified Chinese. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的电子邮件地址。`;

/** Formats a HostnameError in Simplified Chinese. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的小写主机名。`;

/** Formats an Ipv4AddressError in Simplified Chinese. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 IPv4 地址。`;

/** Formats an Ipv6AddressError in Simplified Chinese. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是规范的 IPv6 地址。`;

/** Formats an Ipv6AddressFromStringError in Simplified Chinese. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 IPv6 地址。`;

/** Formats a PhoneNumberE164Error in Simplified Chinese. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 E.164 格式的电话号码。`;

/** Formats an IbanError in Simplified Chinese. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的无空格大写 IBAN。`;

/** Formats a MnemonicError in Simplified Chinese. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的英文 BIP39 助记词。`;

/** Formats an IdError in Simplified Chinese. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Id。`;

/** Formats a TableIdError in Simplified Chinese. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是表 ${error.table} 的有效 Id。`;

/** Formats a UuidError in Simplified Chinese. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是规范的小写 UUID。`;

/** Formats a UuidVersionError in Simplified Chinese. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是版本 ${error.version} 的 UUID。`;

/** Formats a NonNegativeError in Simplified Chinese. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须为非负数（>= 0）。`;

/** Formats a NonNegativeDecimalStringError in Simplified Chinese. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是非负十进制字符串。`;

/** Formats a PositiveError in Simplified Chinese. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须为正数（> 0）。`;

/** Formats a PositiveDecimalStringError in Simplified Chinese. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是正十进制字符串。`;

/** Formats a NonPositiveError in Simplified Chinese. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须为非正数（<= 0）。`;

/** Formats a NonPositiveDecimalStringError in Simplified Chinese. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是非正十进制字符串。`;

/** Formats a NegativeError in Simplified Chinese. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须为负数（< 0）。`;

/** Formats a NegativeDecimalStringError in Simplified Chinese. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是负十进制字符串。`;

/** Formats an IntError in Simplified Chinese. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是安全整数。`;

/** Formats an IntFromStringError in Simplified Chinese. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是十进制整数。`;

/** Formats a FiniteNumberFromStringError in Simplified Chinese. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) => `值 ${safelyStringifyUnknownValue(error.value)} 不是十进制数。`;

/** Formats a GreaterThanError in Simplified Chinese. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须大于 ${error.min}。`;

/** Formats a GreaterThanOrEqualToError in Simplified Chinese. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须大于或等于 ${error.min}。`;

/** Formats a LessThanError in Simplified Chinese. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须小于 ${error.max}。`;

/** Formats a LessThanOrEqualToError in Simplified Chinese. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须小于或等于 ${error.max}。`;

/** Formats a NonNaNError in Simplified Chinese. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "值不能为 NaN。";

/** Formats a FiniteError in Simplified Chinese. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是有限数。`;

/** Formats a MultipleOfError in Simplified Chinese. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是 ${error.divisor} 的倍数。`;

/** Formats a BetweenError in Simplified Chinese. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须介于 ${error.min} 和 ${error.max} 之间（含边界）。`;

/** Formats an ArrayError in Simplified Chinese. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是数组。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `索引 ${issue.index} 处缺少数组元素。`;
    case "Accessor":
      return `索引 ${issue.index} 处的数组元素必须是数据属性。`;
    case "ExcessProperty":
      return "不允许多余的 Array 属性。请将其删除或使用其他 Type。";
    case "Element":
      return `索引 ${issue.index} 处的数组元素无效。`;
  }
};

/** Formats a NonEmptyArrayError in Simplified Chinese. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须至少包含一项。`;

/** Formats a UniqueError in Simplified Chinese. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 中索引 ${error.previousIndex} 和 ${error.index} 处的项相等。`;

/** Formats a SetError in Simplified Chinese. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Set。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `不允许多余的 Set 属性 ${safelyStringifyUnknownValue(issue.key)}。`;
    case "Element":
      return `索引 ${issue.index} 处的 Set 元素无效。`;
  }
};

/** Formats a MapError in Simplified Chinese. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Map。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `不允许多余的 Map 属性 ${safelyStringifyUnknownValue(issue.key)}。`;
    case "Key":
      return `索引 ${issue.index} 处的 Map 键无效。`;
    case "Value":
      return `索引 ${issue.index} 处的 Map 值无效。`;
    case "Collision":
      return `索引 ${issue.previousIndex} 和 ${issue.index} 处的 Map 键解码后得到相同的键 ${safelyStringifyUnknownValue(issue.outputKey)}。`;
  }
};

/** Formats a TupleError in Simplified Chinese. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是元组。`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple 的长度必须为 ${error.reason.expected}，但该值的长度为 ${error.reason.actual}。`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `索引 ${issue.index} 处缺少 Tuple 元素。`;
    case "Accessor":
      return `索引 ${issue.index} 处的 Tuple 元素必须是数据属性。`;
    case "ExcessProperty":
      return "不允许多余的 Tuple 属性。请将其删除或使用其他 Type。";
    case "Element":
      return `索引 ${issue.index} 处的 Tuple 元素无效。`;
  }
};

/** Formats a RecordError in Simplified Chinese. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Record。`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "该值是对象，但 Record Output 必须是普通对象或具有 null 原型。";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `属性键 ${safelyStringifyUnknownValue(issue.key)} 无效。`;
    case "Value":
      return `属性 ${safelyStringifyUnknownValue(issue.key)} 的值无效。`;
    case "Accessor":
      return `Record 属性 ${safelyStringifyUnknownValue(issue.key)} 必须是数据属性。`;
    case "NonEnumerable":
      return `Record 属性 ${safelyStringifyUnknownValue(issue.key)} 必须是可枚举的。`;
    case "Collision":
      return `Record 键 ${safelyStringifyUnknownValue(issue.previousKey)} 和 ${safelyStringifyUnknownValue(issue.key)} 解码后得到相同的键 ${safelyStringifyUnknownValue(issue.outputKey)}。`;
  }
};

/** Formats a MinEntriesError in Simplified Chinese. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 未达到最小条目数 ${error.min}。`;

/** Formats a MaxEntriesError in Simplified Chinese. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 超过最大条目数 ${error.max}。`;

/** Formats an ObjectError in Simplified Chinese. */
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
        return "Object 属性必须是数据属性。请先将访问器值具体化为普通数据，再使用此 Type，或改用其他 Type。";
      case "NonEnumerable":
        return "Object 属性必须可枚举。请将其设为可枚举，或使用其他 Type。";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `缺少必需属性 ${safelyStringifyUnknownValue(key)}。`;
  }
  if (typeof key === "symbol") {
    return "Object 属性键必须是字符串。请删除 symbol 属性或使用其他 Type。";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `不允许属性 ${safelyStringifyUnknownValue(key)}。请将其删除或使用其他 Type。`;
  }
  return `属性 ${safelyStringifyUnknownValue(key)} 无效。`;
};

/** Formats a DiscriminatedUnionError in Simplified Chinese. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `判别属性 ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} 必须是数据属性。`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} 必须是自有属性。`;
      }
      return `${property} 必须是可枚举的。`;
    }
    case "Discriminator":
      return `判别属性 ${safelyStringifyUnknownValue(error.reason.key)} 的值 ${safelyStringifyUnknownValue(error.reason.value)} 不符合预期。`;
    case "Member":
      return `所选变体 ${safelyStringifyUnknownValue(error.reason.discriminator)} 无效。`;
  }
};

/** Formats a DataError in Simplified Chinese. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `值 ${safelyStringifyUnknownValue(issue.value)} 不是 Data。`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} 具有意外的原型。`;
    case "Accessor":
      return "Data 属性必须是数据属性。请先将访问器值具体化为普通数据，再使用此 Type，或改用其他 Type。";
    case "NonEnumerable":
      return "Data Object 属性必须可枚举。请将其删除或使用其他 Type。";
    case "SymbolProperty":
      return "Data Object 属性键必须是字符串。请删除 symbol 属性或使用其他 Type。";
    case "Hole":
      return "缺少 Data Array 元素。";
    case "InvalidUint8Array":
      return "Data Uint8Array 必须引用未分离的 ArrayBuffer，且不得超出其边界。";
    case "ExcessProperty":
      return `Data ${issue.container} 不允许有多余的自有属性。请删除该属性或使用其他 Type。`;
  }
};

/** Formats a JsonValueError in Simplified Chinese. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `值 ${safelyStringifyUnknownValue(issue.value)} 不是 JSON 值。`;
    case "NonFiniteNumber":
      return "JSON 数字必须是有限数。";
    case "UnexpectedPrototype":
      return "该值是对象，但 JsonValue 对象必须是普通对象或具有 null 原型。";
    case "Accessor":
      return "JSON 属性必须是数据属性。请先将访问器值具体化为普通数据，再使用此 Type，或改用其他 Type。";
    case "NonEnumerable":
      return "JSON 对象属性必须可枚举。请将其删除或使用其他 Type。";
    case "SymbolProperty":
      return "JSON 对象属性键必须是字符串。请删除 symbol 属性或使用其他 Type。";
    case "Hole":
      return "缺少 JSON 数组元素。";
    case "ExcessProperty":
      return "不允许多余的 JSON 数组属性。请将其删除或使用其他 Type。";
    case "CircularReference":
      return "JsonValue 不能包含循环引用。";
  }
};

/** Formats a JsonError in Simplified Chinese. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 无法解析为 JsonValue。`;

/** Formats a ByteSizeLiteralError in Simplified Chinese. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是字节大小字面量。请使用 "512KiB" 或 "1MiB" 这样的值。`;

/** Formats a ByteLengthError in Simplified Chinese. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "值 -0 不是字节长度。请改用 0。";

/** Formats a ByteLengthFromStringError in Simplified Chinese. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是字节长度。请使用字节数或 10MiB 这样的字面量。`;

/** Formats a DurationLiteralError in Simplified Chinese. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是时长字面量。请使用 "500ms" 或 "1.5s" 这样的值。`;

/** Formats a PercentageLiteralError in Simplified Chinese. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是百分比字面量。请使用 "50%" 或 "12.5%" 这样的值。`;
