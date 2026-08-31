/**
 * Arabic Evolu Type error formatters.
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
  return `القيمة ${safelyStringifyUnknownValue(error.value)} ليست من النوع ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `القيمة ${safelyStringifyUnknownValue(reason.value)} ليست كائناً.`
    : "القيمة كائن، لكن مخرج Object يجب أن يكون كائناً عادياً أو ذا نموذج أولي فارغ.";

/** Formats a NeverError in Arabic. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} غير صالحة للنوع Never.`;
/** Formats a String TypeOfError in Arabic. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** Formats a TemplateLiteralError in Arabic. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تطابق القالب النصي.`;
/** Formats a Number TypeOfError in Arabic. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formats a BigInt TypeOfError in Arabic. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formats a Boolean TypeOfError in Arabic. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formats a Symbol TypeOfError in Arabic. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formats a Function TypeOfError in Arabic. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** Formats an EvoluTypeError in Arabic. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `القيمة ${safelyStringifyUnknownValue(error.value)} ليست من نوع Evolu.`;
/** Formats an ObjectTagError in Arabic. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تحمل وسم الكائن المتوقع ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formats an InstanceOfError in Arabic. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست مثيلاً لـ ${error.constructorName}.`;
/** Formats a LiteralError in Arabic. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تساوي حرفياً القيمة المتوقعة: ${String(error.expected)}.`;
/** Formats a UnionError in Arabic. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "القيمة لا تطابق أي متغير مسموح به.";
/** Formats a DateIsoError in Arabic. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست سلسلة تاريخ ووقت ISO معيارية.`;
/** Formats a DateIsoFromDateError in Arabic. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "لا يمكن تمثيل Date على أنه DateIso.";
/** Formats a DecimalStringError in Arabic. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} سلسلة عشرية معيارية.`;
/** Formats an Int64Error in Arabic. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عدداً صحيحاً موقّعاً صالحاً من 64 بت (Int64).`;
/** Formats a UInt64Error in Arabic. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عدداً صحيحاً غير موقّع صالحاً من 64 بت (UInt64).`;
/** Formats an Int64StringError in Arabic. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست سلسلة Int64 صالحة.`;
/** Formats a CapitalizedError in Arabic. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `يجب أن تبدأ القيمة ${safelyStringifyUnknownValue(error.value)} بحرف كبير.`;
/** Formats a TrimmedError in Arabic. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `يجب إزالة المسافات من بداية القيمة ${safelyStringifyUnknownValue(error.value)} ونهايتها.`;
/** Formats a MinLengthError in Arabic. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تحقق الطول الأدنى ${error.min}.`;
/** Formats a MaxLengthError in Arabic. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} تتجاوز الطول الأقصى ${error.max}.`;
/** Formats a LengthError in Arabic. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تملك الطول المطلوب ${error.exact}.`;
/** Formats a RegexError in Arabic. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تطابق /${error.source}/${error.flags}.`;
/** Formats a Base64UrlError in Arabic. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست سلسلة Base64Url صالحة.`;
/** Formats a NameError in Arabic. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست Name صالحة.`;
/** Formats a MnemonicError in Arabic. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عبارة BIP39 إنجليزية صالحة.`;
/** Formats an IdError in Arabic. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست Id صالحة.`;
/** Formats a TableIdError in Arabic. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست Id صالحة للجدول ${error.table}.`;
/** Formats a NonNegativeError in Arabic. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} غير سالبة (>= 0).`;
/** Formats a NonNegativeDecimalStringError in Arabic. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} سلسلة عشرية غير سالبة.`;
/** Formats a PositiveError in Arabic. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} موجبة (> 0).`;
/** Formats a PositiveDecimalStringError in Arabic. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} سلسلة عشرية موجبة.`;
/** Formats a NonPositiveError in Arabic. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} غير موجبة (<= 0).`;
/** Formats a NonPositiveDecimalStringError in Arabic. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} سلسلة عشرية غير موجبة.`;
/** Formats a NegativeError in Arabic. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} سالبة (< 0).`;
/** Formats a NegativeDecimalStringError in Arabic. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} سلسلة عشرية سالبة.`;
/** Formats an IntError in Arabic. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} عدداً صحيحاً آمناً.`;
/** Formats a GreaterThanError in Arabic. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أكبر من ${error.min}.`;
/** Formats a GreaterThanOrEqualToError in Arabic. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أكبر من أو تساوي ${error.min}.`;
/** Formats a LessThanError in Arabic. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أصغر من ${error.max}.`;
/** Formats a LessThanOrEqualToError in Arabic. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أصغر من أو تساوي ${error.max}.`;
/** Formats a NonNaNError in Arabic. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "يجب ألا تكون القيمة NaN.";
/** Formats a FiniteError in Arabic. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} محدودة.`;
/** Formats a MultipleOfError in Arabic. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} مضاعفاً لـ ${error.divisor}.`;
/** Formats a BetweenError in Arabic. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} بين ${error.min} و${error.max}، شاملةً.`;

/** Formats an ArrayError in Arabic. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `القيمة ${safelyStringifyUnknownValue(error.reason.value)} ليست مصفوفة.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `عنصر المصفوفة عند الفهرس ${issue.index} مفقود.`;
    case "Accessor":
      return `يجب أن يكون عنصر المصفوفة عند الفهرس ${issue.index} خاصية بيانات.`;
    case "ExcessProperty":
      return "خاصية Array زائدة غير مسموح بها. أزلها أو استخدم Type مختلفاً.";
    case "Element":
      return `عنصر المصفوفة عند الفهرس ${issue.index} غير صالح.`;
  }
};

/** Formats a SetError in Arabic. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `القيمة ${safelyStringifyUnknownValue(error.reason.value)} ليست Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `خاصية Set زائدة ${safelyStringifyUnknownValue(issue.key)} غير مسموح بها.`;
    case "Element":
      return `عنصر Set عند الفهرس ${issue.index} غير صالح.`;
  }
};

/** Formats a MapError in Arabic. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `القيمة ${safelyStringifyUnknownValue(error.reason.value)} ليست Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `خاصية Map زائدة ${safelyStringifyUnknownValue(issue.key)} غير مسموح بها.`;
    case "Key":
    case "Value":
      return `عنصر Map عند الفهرس ${issue.index} غير صالح.`;
    case "Collision":
      return `مفتاحا Map ${safelyStringifyUnknownValue(issue.previousKey)} و${safelyStringifyUnknownValue(issue.key)} يُفك ترميزهما إلى المفتاح نفسه ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Arabic. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `القيمة ${safelyStringifyUnknownValue(error.reason.value)} ليست tuple.`;
  if (error.reason.kind === "InvalidLength")
    return `يجب أن يحتوي Tuple على ${error.reason.expected} عناصر بالضبط، لكن القيمة تحتوي على ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `عنصر Tuple عند الفهرس ${issue.index} مفقود.`;
    case "Accessor":
      return `يجب أن يكون عنصر Tuple عند الفهرس ${issue.index} خاصية بيانات.`;
    case "ExcessProperty":
      return "خاصية Tuple زائدة غير مسموح بها. أزلها أو استخدم Type مختلفاً.";
    case "Element":
      return `عنصر Tuple عند الفهرس ${issue.index} غير صالح.`;
  }
};

/** Formats a RecordError in Arabic. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `القيمة ${safelyStringifyUnknownValue(error.reason.value)} ليست Record.`;
  if (error.reason.kind === "NotPlainRecord")
    return "القيمة كائن، لكن مخرج Record يجب أن يكون كائناً عادياً أو ذا نموذج أولي فارغ.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `مفتاح الخاصية ${safelyStringifyUnknownValue(issue.key)} غير صالح.`;
    case "Value":
      return `قيمة الخاصية ${safelyStringifyUnknownValue(issue.key)} غير صالحة.`;
    case "Accessor":
      return `يجب أن تكون خاصية Record ${safelyStringifyUnknownValue(issue.key)} خاصية بيانات.`;
    case "NonEnumerable":
      return `يجب أن تكون خاصية Record ${safelyStringifyUnknownValue(issue.key)} قابلة للتعداد.`;
    case "Collision":
      return `مفتاحا Record ${safelyStringifyUnknownValue(issue.previousKey)} و${safelyStringifyUnknownValue(issue.key)} يُفك ترميزهما إلى المفتاح نفسه ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Arabic. */
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
        return "يجب أن تكون خاصية Object خاصية بيانات. حوّل قيم أدوات الوصول إلى بيانات عادية قبل استخدام هذا Type أو استخدم Type مختلفاً.";
      case "NonEnumerable":
        return "يجب أن تكون خاصية Object قابلة للتعداد. اجعلها قابلة للتعداد أو استخدم Type مختلفاً.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `الخاصية المطلوبة ${safelyStringifyUnknownValue(key)} مفقودة.`;
  if (typeof key === "symbol")
    return "يجب أن يكون مفتاح خاصية Object سلسلة نصية. أزل خاصية الرمز أو استخدم Type مختلفاً.";
  if (propertyError.type === "ObjectExcessProperty")
    return `الخاصية ${safelyStringifyUnknownValue(key)} غير مسموح بها. أزلها أو استخدم Type مختلفاً.`;
  return `الخاصية ${safelyStringifyUnknownValue(key)} غير صالحة.`;
};

/** Formats a DiscriminatedUnionError in Arabic. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `خاصية المميّز ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} يجب أن تكون خاصية بيانات.`;
      if (error.reason.reason === "Inherited")
        return `${property} يجب أن تكون خاصية مملوكة.`;
      return `${property} يجب أن تكون قابلة للتعداد.`;
    }
    case "Discriminator":
      return `خاصية المميّز ${safelyStringifyUnknownValue(error.reason.key)} لها قيمة غير متوقعة ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `المتغير المختار ${safelyStringifyUnknownValue(error.reason.discriminator)} غير صالح.`;
  }
};

/** Formats a JsonValueError in Arabic. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `القيمة ${safelyStringifyUnknownValue(issue.value)} ليست قيمة JSON.`;
    case "NonFiniteNumber":
      return "يجب أن يكون رقم JSON محدوداً.";
    case "UnexpectedPrototype":
      return "القيمة كائن، لكن كائن JsonValue يجب أن يكون كائناً عادياً أو ذا نموذج أولي فارغ.";
    case "Accessor":
      return "يجب أن تكون خاصية JSON خاصية بيانات. حوّل قيم أدوات الوصول إلى بيانات عادية قبل استخدام هذا Type أو استخدم Type مختلفاً.";
    case "NonEnumerable":
      return "يجب أن تكون خاصية كائن JSON قابلة للتعداد. أزلها أو استخدم Type مختلفاً.";
    case "SymbolProperty":
      return "يجب أن يكون مفتاح خاصية كائن JSON سلسلة نصية. أزل خاصية الرمز أو استخدم Type مختلفاً.";
    case "Hole":
      return "عنصر مصفوفة JSON مفقود.";
    case "ExcessProperty":
      return "خاصية مصفوفة JSON زائدة غير مسموح بها. أزلها أو استخدم Type مختلفاً.";
    case "CircularReference":
      return "يجب ألا تحتوي JsonValue على مراجع دائرية.";
  }
};

/** Formats a JsonError in Arabic. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `لا يمكن تحليل القيمة ${safelyStringifyUnknownValue(error.value)} إلى JsonValue.`;
