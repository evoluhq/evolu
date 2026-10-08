/**
 * Vietnamese Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
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
  DecimalStringError,
  DiscriminatedUnionError,
  EmailError,
  EvoluTypeError,
  FiniteError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
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
  UuidError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();
  return `Giá trị ${safelyStringifyUnknownValue(error.value)} không thuộc kiểu ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Giá trị ${safelyStringifyUnknownValue(reason.value)} không phải là đối tượng.`
    : "Giá trị là một đối tượng, nhưng Object Output phải là một đối tượng thuần hoặc có nguyên mẫu null.";

/** Formats a NeverError in Vietnamese. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không hợp lệ cho kiểu Never.`;
/** Formats a String TypeOfError in Vietnamese. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** Formats a TemplateLiteralError in Vietnamese. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không khớp với mẫu chuỗi.`;
/** Formats a Number TypeOfError in Vietnamese. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formats a BigInt TypeOfError in Vietnamese. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formats a Boolean TypeOfError in Vietnamese. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formats a Symbol TypeOfError in Vietnamese. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formats a Function TypeOfError in Vietnamese. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** Formats an EvoluTypeError in Vietnamese. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là một Evolu Type.`;
/** Formats an ObjectTagError in Vietnamese. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không có thẻ đối tượng mong đợi ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formats an InstanceOfError in Vietnamese. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là một thể hiện của ${error.constructorName}.`;
/** Formats a LiteralError in Vietnamese. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không bằng nghiêm ngặt với literal mong đợi: ${String(error.expected)}.`;
/** Formats a UnionError in Vietnamese. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Giá trị không khớp với bất kỳ biến thể nào được cho phép.";
/** Formats a DateIsoError in Vietnamese. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là chuỗi ngày-giờ ISO chính tắc.`;
/** Formats a DateIsoFromDateError in Vietnamese. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date không thể được biểu diễn dưới dạng DateIso.";
/** Formats a DecimalStringError in Vietnamese. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân chính tắc.`;
/** Formats an Int64Error in Vietnamese. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là số nguyên 64-bit có dấu (Int64) hợp lệ.`;
/** Formats a UInt64Error in Vietnamese. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là số nguyên 64-bit không dấu (UInt64) hợp lệ.`;
/** Formats an Int64StringError in Vietnamese. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là chuỗi Int64 hợp lệ.`;

/** Formats an IdentifierError in Vietnamese. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là định danh ${error.casing}.`;

/** Formats a CapitalizedError in Vietnamese. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải viết hoa chữ cái đầu.`;

/** Formats an UncapitalizedError in Vietnamese. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không được bắt đầu bằng chữ hoa.`;

/** Formats an UppercasedError in Vietnamese. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải được viết hoa toàn bộ.`;

/** Formats a LowercasedError in Vietnamese. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải được viết thường.`;
/** Formats a TrimmedError in Vietnamese. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải được cắt khoảng trắng đầu và cuối.`;
/** Formats a StartsWithError in Vietnamese. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải bắt đầu bằng ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats a MinLengthError in Vietnamese. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không đạt độ dài tối thiểu là ${error.min}.`;
/** Formats a MaxLengthError in Vietnamese. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} vượt quá độ dài tối đa là ${error.max}.`;
/** Formats a LengthError in Vietnamese. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không có độ dài bắt buộc là ${error.exact}.`;
/** Formats a RegexError in Vietnamese. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không khớp với /${error.source}/${error.flags}.`;
/** Formats a Base64UrlError in Vietnamese. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là chuỗi Base64Url hợp lệ.`;
/** Formats a NameError in Vietnamese. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là Name hợp lệ.`;
/** Formats an EmailError in Vietnamese. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là địa chỉ email hợp lệ.`;
/** Formats a MnemonicError in Vietnamese. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là cụm từ gợi nhớ BIP39 tiếng Anh hợp lệ.`;
/** Formats an IdError in Vietnamese. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là Id hợp lệ.`;
/** Formats a TableIdError in Vietnamese. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là Id hợp lệ cho bảng ${error.table}.`;
/** Formats a UuidError in Vietnamese. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là UUID chữ thường chính tắc.`;
/** Formats a NonNegativeError in Vietnamese. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải không âm (>= 0).`;
/** Formats a NonNegativeDecimalStringError in Vietnamese. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân không âm.`;
/** Formats a PositiveError in Vietnamese. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải dương (> 0).`;
/** Formats a PositiveDecimalStringError in Vietnamese. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân dương.`;
/** Formats a NonPositiveError in Vietnamese. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải không dương (<= 0).`;
/** Formats a NonPositiveDecimalStringError in Vietnamese. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân không dương.`;
/** Formats a NegativeError in Vietnamese. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải âm (< 0).`;
/** Formats a NegativeDecimalStringError in Vietnamese. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là chuỗi thập phân âm.`;
/** Formats an IntError in Vietnamese. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là số nguyên an toàn.`;
/** Formats a GreaterThanError in Vietnamese. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải lớn hơn ${error.min}.`;
/** Formats a GreaterThanOrEqualToError in Vietnamese. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải lớn hơn hoặc bằng ${error.min}.`;
/** Formats a LessThanError in Vietnamese. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải nhỏ hơn ${error.max}.`;
/** Formats a LessThanOrEqualToError in Vietnamese. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải nhỏ hơn hoặc bằng ${error.max}.`;
/** Formats a NonNaNError in Vietnamese. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Giá trị không được là NaN.";
/** Formats a FiniteError in Vietnamese. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải hữu hạn.`;
/** Formats a MultipleOfError in Vietnamese. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải là bội số của ${error.divisor}.`;
/** Formats a BetweenError in Vietnamese. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} phải nằm trong khoảng từ ${error.min} đến ${error.max}, kể cả hai đầu.`;

/** Formats a BooleanFromStringError in Vietnamese. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là giá trị boolean. Hãy dùng true hoặc false.`;

/** Formats an IntFromStringError in Vietnamese. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là số nguyên thập phân.`;

/** Formats an ArrayError in Vietnamese. */
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

/** Formats a SetError in Vietnamese. */
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

/** Formats a MapError in Vietnamese. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Giá trị ${safelyStringifyUnknownValue(error.reason.value)} không phải là Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Không cho phép thuộc tính Map dư thừa ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
      return `Khóa Map tại chỉ mục ${issue.index} không hợp lệ.`;
    case "Value":
      return `Giá trị Map tại chỉ mục ${issue.index} không hợp lệ.`;
    case "Collision":
      return `Các khóa Map tại chỉ mục ${issue.previousIndex} và ${issue.index} giải mã thành cùng một khóa ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Vietnamese. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Giá trị ${safelyStringifyUnknownValue(error.reason.value)} không phải là tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple phải có độ dài ${error.reason.expected}, nhưng giá trị có độ dài ${error.reason.actual}.`;
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

/** Formats a RecordError in Vietnamese. */
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

/** Formats an ObjectError in Vietnamese. */
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

/** Formats a DiscriminatedUnionError in Vietnamese. */
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

/** Formats a DataError in Vietnamese. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Giá trị ${safelyStringifyUnknownValue(issue.value)} không phải là Data.`;
    case "UnexpectedPrototype":
      return `Một ${issue.container} Data có nguyên mẫu không mong đợi.`;
    case "Accessor":
      return "Thuộc tính Data phải là thuộc tính dữ liệu. Hãy hiện thực hóa giá trị accessor thành dữ liệu thuần trước khi dùng Type này hoặc dùng Type khác.";
    case "NonEnumerable":
      return "Thuộc tính Object Data phải có thể liệt kê. Hãy xóa nó hoặc dùng Type khác.";
    case "SymbolProperty":
      return "Khóa thuộc tính Object Data phải là chuỗi. Hãy xóa thuộc tính symbol hoặc dùng Type khác.";
    case "Hole":
      return "Một phần tử Array Data bị thiếu.";
    case "InvalidUint8Array":
      return "Uint8Array Data phải có ArrayBuffer chưa bị tách rời và phải nằm trong giới hạn của ArrayBuffer đó.";
    case "ExcessProperty":
      return `Một ${issue.container} Data không được có thuộc tính riêng dư thừa. Hãy xóa thuộc tính đó hoặc dùng Type khác.`;
  }
};

/** Formats a JsonValueError in Vietnamese. */
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

/** Formats a JsonError in Vietnamese. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không thể được phân tích thành JsonValue.`;

/** Formats a ByteSizeLiteralError in Vietnamese. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là literal kích thước byte. Hãy dùng giá trị như "512KiB" hoặc "1MiB".`;

/** Formats a ByteLengthError in Vietnamese. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Giá trị -0 không phải là độ dài byte. Hãy dùng 0 thay thế.";

/** Formats a ByteLengthFromStringError in Vietnamese. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là độ dài byte. Hãy dùng số byte hoặc literal như 10MiB.`;

/** Formats a DurationLiteralError in Vietnamese. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là literal khoảng thời gian. Hãy dùng giá trị như "500ms" hoặc "1.5s".`;

/** Formats a PercentageLiteralError in Vietnamese. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Giá trị ${safelyStringifyUnknownValue(error.value)} không phải là literal phần trăm. Hãy dùng giá trị như "50%" hoặc "12.5%".`;
