/**
 * Evolu Type 錯誤格式化工具的繁體中文翻譯。
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

  return `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${typeOf} 類型。`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `值 ${safelyStringifyUnknownValue(reason.value)} 不是物件。`
    : "此值是物件，但 Object Output 必須是普通物件或具有 null 原型。";

/** 以繁體中文格式化 NeverError。 */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不符合 Never 類型。`;

/** 以繁體中文格式化 String TypeOfError。 */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** 以繁體中文格式化 TemplateLiteralError。 */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不符合樣板字面值。`;

/** 以繁體中文格式化 Number TypeOfError。 */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** 以繁體中文格式化 BigInt TypeOfError。 */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** 以繁體中文格式化 Boolean TypeOfError。 */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** 以繁體中文格式化 Symbol TypeOfError。 */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** 以繁體中文格式化 Function TypeOfError。 */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** 以繁體中文格式化 EvoluTypeError。 */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是 Evolu Type。`;

/** 以繁體中文格式化 ObjectTagError。 */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 沒有預期的物件標籤 ${safelyStringifyUnknownValue(error.expected)}。`;

/** 以繁體中文格式化 InstanceOfError。 */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是 ${error.constructorName} 的執行個體。`;

/** 以繁體中文格式化 LiteralError。 */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不與預期的字面值嚴格相等：${globalThis.String(error.expected)}。`;

/** 以繁體中文格式化 UnionError。 */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "值不符合任何允許的變體。";

/** 以繁體中文格式化 DateIsoError。 */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是標準 ISO 日期時間字串。`;

/** 以繁體中文格式化 DateIsoFromDateError。 */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "此 Date 無法表示為 DateIso。";

/** 以繁體中文格式化 DecimalStringError。 */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是標準十進位字串。`;

/** 以繁體中文格式化 Int64Error。 */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的有號 64 位元整數（Int64）。`;

/** 以繁體中文格式化 UInt64Error。 */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的無號 64 位元整數（UInt64）。`;

/** 以繁體中文格式化 Int64StringError。 */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Int64 字串。`;

/** 以繁體中文格式化 CapitalizedError。 */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須以大寫字母開頭。`;

/** 以繁體中文格式化 TrimmedError。 */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不得有前後空白。`;

/** 以繁體中文格式化 MinLengthError。 */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 未達最小長度 ${error.min}。`;

/** 以繁體中文格式化 MaxLengthError。 */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 超過最大長度 ${error.max}。`;

/** 以繁體中文格式化 LengthError。 */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不具有所需長度 ${error.exact}。`;

/** 以繁體中文格式化 RegexError。 */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不符合 /${error.source}/${error.flags}。`;

/** 以繁體中文格式化 Base64UrlError。 */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Base64Url 字串。`;

/** 以繁體中文格式化 NameError。 */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Name。`;

/** 以繁體中文格式化 MnemonicError。 */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的英文 BIP39 助記詞。`;

/** 以繁體中文格式化 IdError。 */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是有效的 Id。`;

/** 以繁體中文格式化 TableIdError。 */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 不是資料表 ${error.table} 的有效 Id。`;

/** 以繁體中文格式化 NonNegativeError。 */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須為非負數（>= 0）。`;

/** 以繁體中文格式化 NonNegativeDecimalStringError。 */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是非負十進位字串。`;

/** 以繁體中文格式化 PositiveError。 */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須為正數（> 0）。`;

/** 以繁體中文格式化 PositiveDecimalStringError。 */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是正十進位字串。`;

/** 以繁體中文格式化 NonPositiveError。 */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須為非正數（<= 0）。`;

/** 以繁體中文格式化 NonPositiveDecimalStringError。 */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是非正十進位字串。`;

/** 以繁體中文格式化 NegativeError。 */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須為負數（< 0）。`;

/** 以繁體中文格式化 NegativeDecimalStringError。 */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是負十進位字串。`;

/** 以繁體中文格式化 IntError。 */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是安全整數。`;

/** 以繁體中文格式化 GreaterThanError。 */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) => `值 ${safelyStringifyUnknownValue(error.value)} 必須大於 ${error.min}。`;

/** 以繁體中文格式化 GreaterThanOrEqualToError。 */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須大於或等於 ${error.min}。`;

/** 以繁體中文格式化 LessThanError。 */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須小於 ${error.max}。`;

/** 以繁體中文格式化 LessThanOrEqualToError。 */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須小於或等於 ${error.max}。`;

/** 以繁體中文格式化 NonNaNError。 */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "值不得為 NaN。";

/** 以繁體中文格式化 FiniteError。 */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須為有限數字。`;

/** 以繁體中文格式化 MultipleOfError。 */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須是 ${error.divisor} 的倍數。`;

/** 以繁體中文格式化 BetweenError。 */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 必須介於 ${error.min} 和 ${error.max} 之間（含端點）。`;

/** 以繁體中文格式化 ArrayError。 */
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

/** 以繁體中文格式化 SetError。 */
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

/** 以繁體中文格式化 MapError。 */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是 Map。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `不允許多餘的 Map 屬性 ${safelyStringifyUnknownValue(issue.key)}。`;
    case "Key":
    case "Value":
      return `索引 ${issue.index} 的 Map 元素無效。`;
    case "Collision":
      return `Map 鍵 ${safelyStringifyUnknownValue(issue.previousKey)} 和 ${safelyStringifyUnknownValue(issue.key)} 解碼為相同的鍵 ${safelyStringifyUnknownValue(issue.outputKey)}。`;
  }
};

/** 以繁體中文格式化 TupleError。 */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `值 ${safelyStringifyUnknownValue(error.reason.value)} 不是元組。`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple 必須恰好包含 ${error.reason.expected} 個元素，但此值包含 ${error.reason.actual} 個。`;
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

/** 以繁體中文格式化 RecordError。 */
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

/** 以繁體中文格式化 ObjectError。 */
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

/** 以繁體中文格式化 DiscriminatedUnionError。 */
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

/** 以繁體中文格式化 JsonValueError。 */
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

/** 以繁體中文格式化 JsonError。 */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `值 ${safelyStringifyUnknownValue(error.value)} 無法剖析為 JsonValue。`;
