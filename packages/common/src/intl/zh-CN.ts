/**
 * 简体中文 Evolu Type 错误格式化器。
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

  return `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${typeOf} 类型。`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `值 ${safelyStringifyUnknownValue(reason.value)} 不是对象。`
    : "该值是对象，但 Object Output 必须是普通对象或具有 null 原型。";

/** 以简体中文格式化 NeverError。 */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 对类型 Never 无效。`;

/** 以简体中文格式化 String TypeOfError。 */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** 以简体中文格式化 TemplateLiteralError。 */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不匹配模板字面量。`;

/** 以简体中文格式化 Number TypeOfError。 */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** 以简体中文格式化 BigInt TypeOfError。 */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** 以简体中文格式化 Boolean TypeOfError。 */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** 以简体中文格式化 Symbol TypeOfError。 */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** 以简体中文格式化 Function TypeOfError。 */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError。 */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是 Evolu Type。`;

/** Formats an ObjectTagError。 */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不具有预期的对象标签 ${safelyStringifyUnknownValue(error.expected)}。`;

/** Formats an InstanceOfError。 */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${error.constructorName} 的实例。`;

/** 以简体中文格式化 LiteralError。 */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不严格等于预期字面量：${globalThis.String(error.expected)}。`;

/** 以简体中文格式化 UnionError。 */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "值不匹配任何允许的变体。";

/** 以简体中文格式化 DateIsoError。 */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是规范的 ISO 日期时间字符串。`;

/** 以简体中文格式化 DateIsoFromDateError。 */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date 无法表示为 DateIso。";

/** 以简体中文格式化 DecimalStringError。 */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是规范的十进制字符串。`;

/** Formats an Int64Error。 */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的有符号 64 位整数（Int64）。`;

/** 以简体中文格式化 UInt64Error。 */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的无符号 64 位整数（UInt64）。`;

/** Formats an Int64StringError。 */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Int64 字符串。`;

/** 以简体中文格式化 CapitalizedError。 */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须以大写字母开头。`;

/** 以简体中文格式化 TrimmedError。 */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须去除首尾空白。`;

/** 以简体中文格式化 MinLengthError。 */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 未达到最小长度 ${error.min}。`;

/** 以简体中文格式化 MaxLengthError。 */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 超过最大长度 ${error.max}。`;

/** 以简体中文格式化 LengthError。 */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 的长度不等于要求的 ${error.exact}。`;

/** 以简体中文格式化 RegexError。 */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不匹配 /${error.source}/${error.flags}。`;

/** 以简体中文格式化 Base64UrlError。 */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Base64Url 字符串。`;

/** 以简体中文格式化 NameError。 */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Name。`;

/** 以简体中文格式化 MnemonicError。 */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的英文 BIP39 助记词。`;

/** Formats an IdError。 */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Id。`;

/** 以简体中文格式化 TableIdError。 */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是表 ${error.table} 的有效 Id。`;

/** 以简体中文格式化 NonNegativeError。 */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须为非负数（>= 0）。`;

/** 以简体中文格式化 NonNegativeDecimalStringError。 */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是非负十进制字符串。`;

/** 以简体中文格式化 PositiveError。 */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须为正数（> 0）。`;

/** 以简体中文格式化 PositiveDecimalStringError。 */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是正十进制字符串。`;

/** 以简体中文格式化 NonPositiveError。 */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须为非正数（<= 0）。`;

/** 以简体中文格式化 NonPositiveDecimalStringError。 */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是非正十进制字符串。`;

/** 以简体中文格式化 NegativeError。 */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须为负数（< 0）。`;

/** 以简体中文格式化 NegativeDecimalStringError。 */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是负十进制字符串。`;

/** Formats an IntError。 */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是安全整数。`;

/** 以简体中文格式化 GreaterThanError。 */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必须大于 ${error.min}。`;

/** 以简体中文格式化 GreaterThanOrEqualToError。 */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须大于或等于 ${error.min}。`;

/** 以简体中文格式化 LessThanError。 */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须小于 ${error.max}。`;

/** 以简体中文格式化 LessThanOrEqualToError。 */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须小于或等于 ${error.max}。`;

/** 以简体中文格式化 NonNaNError。 */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "值不能为 NaN。";

/** 以简体中文格式化 FiniteError。 */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是有限数。`;

/** 以简体中文格式化 MultipleOfError。 */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须是 ${error.divisor} 的倍数。`;

/** 以简体中文格式化 BetweenError。 */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必须介于 ${error.min} 和 ${error.max} 之间（含边界）。`;

/** Formats an ArrayError。 */
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

/** 以简体中文格式化 SetError。 */
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

/** 以简体中文格式化 MapError。 */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Map。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `不允许多余的 Map 属性 ${safelyStringifyUnknownValue(issue.key)}。`;
    case "Key":
    case "Value":
      return `索引 ${issue.index} 处的 Map 元素无效。`;
    case "Collision":
      return `Map 键 ${safelyStringifyUnknownValue(issue.previousKey)} 和 ${safelyStringifyUnknownValue(issue.key)} 解码后得到相同的键 ${safelyStringifyUnknownValue(issue.outputKey)}。`;
  }
};

/** 以简体中文格式化 TupleError。 */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是元组。`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple 必须恰好包含 ${error.reason.expected} 个元素，但该值包含 ${error.reason.actual} 个。`;
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

/** 以简体中文格式化 RecordError。 */
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

/** Formats an ObjectError。 */
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

/** 以简体中文格式化 DiscriminatedUnionError。 */
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

/** 以简体中文格式化 JsonValueError。 */
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

/** 以简体中文格式化 JsonError。 */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 无法解析为 JsonValue。`;
