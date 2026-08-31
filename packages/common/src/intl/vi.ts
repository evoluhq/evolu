/**
 * Bộ định dạng lỗi Evolu Type tiếng Việt.
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
  return `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Giá trị ${safelyStringifyUnknownValue(reason.value)} không phải là đối tượng.`
    : "Giá trị là một đối tượng, nhưng Object Output phải là một đối tượng thuần hoặc có nguyên mẫu null.";

/** Định dạng NeverError bằng tiếng Việt. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không hợp lệ cho kiểu Never.`;
/** Định dạng String TypeOfError bằng tiếng Việt. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** Định dạng TemplateLiteralError bằng tiếng Việt. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không khớp với mẫu chuỗi.`;
/** Định dạng Number TypeOfError bằng tiếng Việt. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Định dạng BigInt TypeOfError bằng tiếng Việt. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Định dạng Boolean TypeOfError bằng tiếng Việt. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Định dạng Symbol TypeOfError bằng tiếng Việt. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Định dạng Function TypeOfError bằng tiếng Việt. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** Định dạng EvoluTypeError bằng tiếng Việt. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là một Evolu Type.`;
/** Định dạng ObjectTagError bằng tiếng Việt. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không có thẻ đối tượng mong đợi ${safelyStringifyUnknownValue(error.expected)}.`;
/** Định dạng InstanceOfError bằng tiếng Việt. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là một thể hiện của ${error.constructorName}.`;
/** Định dạng LiteralError bằng tiếng Việt. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không hoàn toàn bằng literal mong đợi: ${String(error.expected)}.`;
/** Định dạng UnionError bằng tiếng Việt. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Giá trị không khớp với bất kỳ biến thể nào được cho phép.";
/** Định dạng DateIsoError bằng tiếng Việt. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là chuỗi ngày-giờ ISO chính tắc.`;
/** Định dạng DateIsoFromDateError bằng tiếng Việt. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date không thể được biểu diễn dưới dạng DateIso.";
/** Định dạng DecimalStringError bằng tiếng Việt. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân chính tắc.`;
/** Định dạng Int64Error bằng tiếng Việt. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là số nguyên 64-bit có dấu (Int64) hợp lệ.`;
/** Định dạng UInt64Error bằng tiếng Việt. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là số nguyên 64-bit không dấu (UInt64) hợp lệ.`;
/** Định dạng Int64StringError bằng tiếng Việt. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là chuỗi Int64 hợp lệ.`;
/** Định dạng CapitalizedError bằng tiếng Việt. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải viết hoa chữ cái đầu.`;
/** Định dạng TrimmedError bằng tiếng Việt. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải được cắt khoảng trắng đầu và cuối.`;
/** Định dạng MinLengthError bằng tiếng Việt. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không đạt độ dài tối thiểu là ${error.min}.`;
/** Định dạng MaxLengthError bằng tiếng Việt. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} vượt quá độ dài tối đa là ${error.max}.`;
/** Định dạng LengthError bằng tiếng Việt. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không có độ dài bắt buộc là ${error.exact}.`;
/** Định dạng RegexError bằng tiếng Việt. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không khớp với /${error.source}/${error.flags}.`;
/** Định dạng Base64UrlError bằng tiếng Việt. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là chuỗi Base64Url hợp lệ.`;
/** Định dạng NameError bằng tiếng Việt. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là Name hợp lệ.`;
/** Định dạng MnemonicError bằng tiếng Việt. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là cụm từ gợi nhớ BIP39 tiếng Anh hợp lệ.`;
/** Định dạng IdError bằng tiếng Việt. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là Id hợp lệ.`;
/** Định dạng TableIdError bằng tiếng Việt. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là Id hợp lệ cho bảng ${error.table}.`;
/** Định dạng NonNegativeError bằng tiếng Việt. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải không âm (>= 0).`;
/** Định dạng NonNegativeDecimalStringError bằng tiếng Việt. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân không âm.`;
/** Định dạng PositiveError bằng tiếng Việt. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải dương (> 0).`;
/** Định dạng PositiveDecimalStringError bằng tiếng Việt. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân dương.`;
/** Định dạng NonPositiveError bằng tiếng Việt. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải không dương (<= 0).`;
/** Định dạng NonPositiveDecimalStringError bằng tiếng Việt. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân không dương.`;
/** Định dạng NegativeError bằng tiếng Việt. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải âm (< 0).`;
/** Định dạng NegativeDecimalStringError bằng tiếng Việt. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân âm.`;
/** Định dạng IntError bằng tiếng Việt. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là số nguyên an toàn.`;
/** Định dạng GreaterThanError bằng tiếng Việt. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải lớn hơn ${error.min}.`;
/** Định dạng GreaterThanOrEqualToError bằng tiếng Việt. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải lớn hơn hoặc bằng ${error.min}.`;
/** Định dạng LessThanError bằng tiếng Việt. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải nhỏ hơn ${error.max}.`;
/** Định dạng LessThanOrEqualToError bằng tiếng Việt. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải nhỏ hơn hoặc bằng ${error.max}.`;
/** Định dạng NonNaNError bằng tiếng Việt. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Giá trị không được là NaN.";
/** Định dạng FiniteError bằng tiếng Việt. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải hữu hạn.`;
/** Định dạng MultipleOfError bằng tiếng Việt. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là bội số của ${error.divisor}.`;
/** Định dạng BetweenError bằng tiếng Việt. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải nằm trong khoảng từ ${error.min} đến ${error.max}, kể cả hai đầu.`;

/** Định dạng ArrayError bằng tiếng Việt. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Giá trị ${safelyStringifyUnknownValue(error.reason.value)} không phải là mảng.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Phần tử mảng tại chỉ mục ${issue.index} bị thiếu.`;
    case "Accessor":
      return `Phần tử mảng tại chỉ mục ${issue.index} phải là thuộc tính dữ liệu.`;
    case "ExcessProperty":
      return "Không cho phép thuộc tính Array dư thừa. Hãy xóa nó hoặc dùng Type khác.";
    case "Element":
      return `Phần tử mảng tại chỉ mục ${issue.index} không hợp lệ.`;
  }
};

/** Định dạng SetError bằng tiếng Việt. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Giá trị ${safelyStringifyUnknownValue(error.reason.value)} không phải là Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Không cho phép thuộc tính Set dư thừa ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `Phần tử Set tại chỉ mục ${issue.index} không hợp lệ.`;
  }
};

/** Định dạng MapError bằng tiếng Việt. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Giá trị ${safelyStringifyUnknownValue(error.reason.value)} không phải là Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Không cho phép thuộc tính Map dư thừa ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
    case "Value":
      return `Phần tử Map tại chỉ mục ${issue.index} không hợp lệ.`;
    case "Collision":
      return `Các khóa Map ${safelyStringifyUnknownValue(issue.previousKey)} và ${safelyStringifyUnknownValue(issue.key)} giải mã thành cùng một khóa ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Định dạng TupleError bằng tiếng Việt. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Giá trị ${safelyStringifyUnknownValue(error.reason.value)} không phải là tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple phải chứa đúng ${error.reason.expected} phần tử, nhưng giá trị chứa ${error.reason.actual}.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Phần tử Tuple tại chỉ mục ${issue.index} bị thiếu.`;
    case "Accessor":
      return `Phần tử Tuple tại chỉ mục ${issue.index} phải là thuộc tính dữ liệu.`;
    case "ExcessProperty":
      return "Không cho phép thuộc tính Tuple dư thừa. Hãy xóa nó hoặc dùng Type khác.";
    case "Element":
      return `Phần tử Tuple tại chỉ mục ${issue.index} không hợp lệ.`;
  }
};

/** Định dạng RecordError bằng tiếng Việt. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Giá trị ${safelyStringifyUnknownValue(error.reason.value)} không phải là Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Giá trị là một đối tượng, nhưng Record Output phải là một đối tượng thuần hoặc có nguyên mẫu null.";
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Khóa thuộc tính ${safelyStringifyUnknownValue(issue.key)} không hợp lệ.`;
    case "Value":
      return `Giá trị của thuộc tính ${safelyStringifyUnknownValue(issue.key)} không hợp lệ.`;
    case "Accessor":
      return `Thuộc tính Record ${safelyStringifyUnknownValue(issue.key)} phải là thuộc tính dữ liệu.`;
    case "NonEnumerable":
      return `Thuộc tính Record ${safelyStringifyUnknownValue(issue.key)} phải có thể liệt kê.`;
    case "Collision":
      return `Các khóa Record ${safelyStringifyUnknownValue(issue.previousKey)} và ${safelyStringifyUnknownValue(issue.key)} giải mã thành cùng một khóa ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Định dạng ObjectError bằng tiếng Việt. */
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
        return "Thuộc tính Object phải là thuộc tính dữ liệu. Hãy hiện thực hóa giá trị accessor thành dữ liệu thuần trước khi dùng Type này hoặc dùng Type khác.";
      case "NonEnumerable":
        return "Thuộc tính Object phải có thể liệt kê. Hãy làm cho nó có thể liệt kê hoặc dùng Type khác.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Thiếu thuộc tính bắt buộc ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "Khóa thuộc tính Object phải là chuỗi. Hãy xóa thuộc tính symbol hoặc dùng Type khác.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Thuộc tính ${safelyStringifyUnknownValue(key)} không được phép. Hãy xóa nó hoặc dùng Type khác.`;
  }
  return `Thuộc tính ${safelyStringifyUnknownValue(key)} không hợp lệ.`;
};

/** Định dạng DiscriminatedUnionError bằng tiếng Việt. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Thuộc tính phân biệt ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} phải là thuộc tính dữ liệu.`;
      if (error.reason.reason === "Inherited")
        return `${property} phải là thuộc tính riêng.`;
      return `${property} phải có thể liệt kê.`;
    }
    case "Discriminator":
      return `Thuộc tính phân biệt ${safelyStringifyUnknownValue(error.reason.key)} có giá trị không mong đợi ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Biến thể đã chọn ${safelyStringifyUnknownValue(error.reason.discriminator)} không hợp lệ.`;
  }
};

/** Định dạng JsonValueError bằng tiếng Việt. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Giá trị ${safelyStringifyUnknownValue(issue.value)} không phải là giá trị JSON.`;
    case "NonFiniteNumber":
      return "Số JSON phải hữu hạn.";
    case "UnexpectedPrototype":
      return "Giá trị là một đối tượng, nhưng đối tượng JsonValue phải là đối tượng thuần hoặc có nguyên mẫu null.";
    case "Accessor":
      return "Thuộc tính JSON phải là thuộc tính dữ liệu. Hãy hiện thực hóa giá trị accessor thành dữ liệu thuần trước khi dùng Type này hoặc dùng Type khác.";
    case "NonEnumerable":
      return "Thuộc tính đối tượng JSON phải có thể liệt kê. Hãy xóa nó hoặc dùng Type khác.";
    case "SymbolProperty":
      return "Khóa thuộc tính đối tượng JSON phải là chuỗi. Hãy xóa thuộc tính symbol hoặc dùng Type khác.";
    case "Hole":
      return "Một phần tử mảng JSON bị thiếu.";
    case "ExcessProperty":
      return "Không cho phép thuộc tính mảng JSON dư thừa. Hãy xóa nó hoặc dùng Type khác.";
    case "CircularReference":
      return "JsonValue không được chứa tham chiếu vòng.";
  }
};

/** Định dạng JsonError bằng tiếng Việt. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không thể được phân tích thành JsonValue.`;
