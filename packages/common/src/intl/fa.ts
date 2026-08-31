/**
 * قالب‌بندهای فارسی خطاهای Evolu Type.
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

  return `مقدار ${safelyStringifyUnknownValue(error.value)} از نوع ${typeOf} نیست.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `مقدار ${safelyStringifyUnknownValue(reason.value)} یک object نیست.`
    : "مقدار یک object است، اما خروجی Object باید یک object ساده باشد یا prototype آن null باشد.";

/** NeverError را به فارسی قالب‌بندی می‌کند. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} برای Type از نوع Never معتبر نیست.`;

/** String TypeOfError را به فارسی قالب‌بندی می‌کند. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralError را به فارسی قالب‌بندی می‌کند. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} با template literal مطابقت ندارد.`;

/** Number TypeOfError را به فارسی قالب‌بندی می‌کند. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfError را به فارسی قالب‌بندی می‌کند. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfError را به فارسی قالب‌بندی می‌کند. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfError را به فارسی قالب‌بندی می‌کند. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfError را به فارسی قالب‌بندی می‌کند. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeError را به فارسی قالب‌بندی می‌کند. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `مقدار ${safelyStringifyUnknownValue(error.value)} یک Evolu Type نیست.`;

/** ObjectTagError را به فارسی قالب‌بندی می‌کند. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} دارای object tag مورد انتظار ${safelyStringifyUnknownValue(error.expected)} نیست.`;

/** InstanceOfError را به فارسی قالب‌بندی می‌کند. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} نمونه‌ای از ${error.constructorName} نیست.`;

/** LiteralError را به فارسی قالب‌بندی می‌کند. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} دقیقاً با literal مورد انتظار برابر نیست: ${String(error.expected)}.`;

/** UnionError را به فارسی قالب‌بندی می‌کند. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "مقدار با هیچ‌یک از variantهای مجاز مطابقت ندارد.";

/** DateIsoError را به فارسی قالب‌بندی می‌کند. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ کانونی تاریخ‌وزمان ISO نیست.`;

/** DateIsoFromDateError را به فارسی قالب‌بندی می‌کند. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date را نمی‌توان به‌صورت DateIso نمایش داد.";

/** DecimalStringError را به فارسی قالب‌بندی می‌کند. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی کانونی باشد.`;

/** Int64Error را به فارسی قالب‌بندی می‌کند. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک عدد صحیح ۶۴ بیتی علامت‌دار معتبر (Int64) نیست.`;

/** UInt64Error را به فارسی قالب‌بندی می‌کند. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک عدد صحیح ۶۴ بیتی بدون علامت معتبر (UInt64) نیست.`;

/** Int64StringError را به فارسی قالب‌بندی می‌کند. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ Int64 معتبر نیست.`;

/** CapitalizedError را به فارسی قالب‌بندی می‌کند. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید با حرف بزرگ آغاز شود.`;

/** TrimmedError را به فارسی قالب‌بندی می‌کند. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} نباید در ابتدا یا انتها فاصلهٔ اضافی داشته باشد.`;

/** MinLengthError را به فارسی قالب‌بندی می‌کند. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `طول مقدار ${safelyStringifyUnknownValue(error.value)} باید حداقل ${error.min} باشد.`;

/** MaxLengthError را به فارسی قالب‌بندی می‌کند. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `طول مقدار ${safelyStringifyUnknownValue(error.value)} از حداکثر ${error.max} بیشتر است.`;

/** LengthError را به فارسی قالب‌بندی می‌کند. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `طول مقدار ${safelyStringifyUnknownValue(error.value)} باید دقیقاً ${error.exact} باشد.`;

/** RegexError را به فارسی قالب‌بندی می‌کند. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} با /${error.source}/${error.flags} مطابقت ندارد.`;

/** Base64UrlError را به فارسی قالب‌بندی می‌کند. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ Base64Url معتبر نیست.`;

/** NameError را به فارسی قالب‌بندی می‌کند. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک Name معتبر نیست.`;

/** MnemonicError را به فارسی قالب‌بندی می‌کند. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک عبارت یادسپاری انگلیسی BIP39 معتبر نیست.`;

/** IdError را به فارسی قالب‌بندی می‌کند. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک Id معتبر نیست.`;

/** TableIdError را به فارسی قالب‌بندی می‌کند. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک Id معتبر برای جدول ${error.table} نیست.`;

/** NonNegativeError را به فارسی قالب‌بندی می‌کند. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید نامنفی (>= 0) باشد.`;

/** NonNegativeDecimalStringError را به فارسی قالب‌بندی می‌کند. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی نامنفی باشد.`;

/** PositiveError را به فارسی قالب‌بندی می‌کند. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید مثبت (> 0) باشد.`;

/** PositiveDecimalStringError را به فارسی قالب‌بندی می‌کند. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی مثبت باشد.`;

/** NonPositiveError را به فارسی قالب‌بندی می‌کند. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید نامثبت (<= 0) باشد.`;

/** NonPositiveDecimalStringError را به فارسی قالب‌بندی می‌کند. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی نامثبت باشد.`;

/** NegativeError را به فارسی قالب‌بندی می‌کند. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید منفی (< 0) باشد.`;

/** NegativeDecimalStringError را به فارسی قالب‌بندی می‌کند. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی منفی باشد.`;

/** IntError را به فارسی قالب‌بندی می‌کند. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک عدد صحیح امن باشد.`;

/** GreaterThanError را به فارسی قالب‌بندی می‌کند. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید بزرگ‌تر از ${error.min} باشد.`;

/** GreaterThanOrEqualToError را به فارسی قالب‌بندی می‌کند. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید بزرگ‌تر یا مساوی ${error.min} باشد.`;

/** LessThanError را به فارسی قالب‌بندی می‌کند. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید کوچک‌تر از ${error.max} باشد.`;

/** LessThanOrEqualToError را به فارسی قالب‌بندی می‌کند. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید کوچک‌تر یا مساوی ${error.max} باشد.`;

/** NonNaNError را به فارسی قالب‌بندی می‌کند. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "مقدار نباید NaN باشد.";

/** FiniteError را به فارسی قالب‌بندی می‌کند. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید متناهی باشد.`;

/** MultipleOfError را به فارسی قالب‌بندی می‌کند. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید مضربی از ${error.divisor} باشد.`;

/** BetweenError را به فارسی قالب‌بندی می‌کند. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید بین ${error.min} و ${error.max}، با احتساب هر دو کران، باشد.`;

/** ArrayError را به فارسی قالب‌بندی می‌کند. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک آرایه نیست.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `عنصر آرایه در اندیس ${issue.index} وجود ندارد.`;
    case "Accessor":
      return `عنصر آرایه در اندیس ${issue.index} باید یک data property باشد.`;
    case "ExcessProperty":
      return "وجود property اضافی روی Array مجاز نیست. آن را حذف کنید یا از Type دیگری استفاده کنید.";
    case "Element":
      return `عنصر آرایه در اندیس ${issue.index} نامعتبر است.`;
  }
};

/** SetError را به فارسی قالب‌بندی می‌کند. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک Set نیست.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `property اضافی ${safelyStringifyUnknownValue(issue.key)} روی Set مجاز نیست.`;
    case "Element":
      return `عنصر Set در اندیس ${issue.index} نامعتبر است.`;
  }
};

/** MapError را به فارسی قالب‌بندی می‌کند. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک Map نیست.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `property اضافی ${safelyStringifyUnknownValue(issue.key)} روی Map مجاز نیست.`;
    case "Key":
    case "Value":
      return `عنصر Map در اندیس ${issue.index} نامعتبر است.`;
    case "Collision":
      return `کلیدهای Map یعنی ${safelyStringifyUnknownValue(issue.previousKey)} و ${safelyStringifyUnknownValue(issue.key)} پس از decode به کلید یکسان ${safelyStringifyUnknownValue(issue.outputKey)} تبدیل می‌شوند.`;
  }
};

/** TupleError را به فارسی قالب‌بندی می‌کند. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک Tuple نیست.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple باید دقیقاً ${error.reason.expected} عنصر داشته باشد، اما مقدار دارای ${error.reason.actual} عنصر است.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `عنصر Tuple در اندیس ${issue.index} وجود ندارد.`;
    case "Accessor":
      return `عنصر Tuple در اندیس ${issue.index} باید یک data property باشد.`;
    case "ExcessProperty":
      return "وجود property اضافی روی Tuple مجاز نیست. آن را حذف کنید یا از Type دیگری استفاده کنید.";
    case "Element":
      return `عنصر Tuple در اندیس ${issue.index} نامعتبر است.`;
  }
};

/** RecordError را به فارسی قالب‌بندی می‌کند. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک Record نیست.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "مقدار یک object است، اما خروجی Record باید یک object ساده باشد یا prototype آن null باشد.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `کلید property یعنی ${safelyStringifyUnknownValue(issue.key)} نامعتبر است.`;
    case "Value":
      return `مقدار property ${safelyStringifyUnknownValue(issue.key)} نامعتبر است.`;
    case "Accessor":
      return `property ${safelyStringifyUnknownValue(issue.key)} در Record باید یک data property باشد.`;
    case "NonEnumerable":
      return `property ${safelyStringifyUnknownValue(issue.key)} در Record باید enumerable باشد.`;
    case "Collision":
      return `کلیدهای Record یعنی ${safelyStringifyUnknownValue(issue.previousKey)} و ${safelyStringifyUnknownValue(issue.key)} پس از decode به کلید یکسان ${safelyStringifyUnknownValue(issue.outputKey)} تبدیل می‌شوند.`;
  }
};

/** ObjectError را به فارسی قالب‌بندی می‌کند. */
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
        return "property در Object باید یک data property باشد. پیش از استفاده از این Type، مقادیر accessor را به دادهٔ ساده تبدیل کنید یا از Type دیگری استفاده کنید.";
      case "NonEnumerable":
        return "property در Object باید enumerable باشد. آن را enumerable کنید یا از Type دیگری استفاده کنید.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `property الزامی ${safelyStringifyUnknownValue(key)} وجود ندارد.`;
  }
  if (typeof key === "symbol") {
    return "کلید property در Object باید string باشد. property از نوع symbol را حذف کنید یا از Type دیگری استفاده کنید.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `property ${safelyStringifyUnknownValue(key)} مجاز نیست. آن را حذف کنید یا از Type دیگری استفاده کنید.`;
  }
  return `property ${safelyStringifyUnknownValue(key)} نامعتبر است.`;
};

/** DiscriminatedUnionError را به فارسی قالب‌بندی می‌کند. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `property متمایزکنندهٔ ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} باید یک data property باشد.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} باید property خود شیء باشد.`;
      }
      return `${property} باید enumerable باشد.`;
    }
    case "Discriminator":
      return `property متمایزکنندهٔ ${safelyStringifyUnknownValue(error.reason.key)} دارای مقدار غیرمنتظرهٔ ${safelyStringifyUnknownValue(error.reason.value)} است.`;
    case "Member":
      return `variant انتخاب‌شدهٔ ${safelyStringifyUnknownValue(error.reason.discriminator)} نامعتبر است.`;
  }
};

/** JsonValueError را به فارسی قالب‌بندی می‌کند. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `مقدار ${safelyStringifyUnknownValue(issue.value)} یک مقدار JSON نیست.`;
    case "NonFiniteNumber":
      return "عدد JSON باید متناهی باشد.";
    case "UnexpectedPrototype":
      return "مقدار یک object است، اما object در JsonValue باید یک object ساده باشد یا prototype آن null باشد.";
    case "Accessor":
      return "property در JSON باید یک data property باشد. پیش از استفاده از این Type، مقادیر accessor را به دادهٔ ساده تبدیل کنید یا از Type دیگری استفاده کنید.";
    case "NonEnumerable":
      return "property در object JSON باید enumerable باشد. آن را حذف کنید یا از Type دیگری استفاده کنید.";
    case "SymbolProperty":
      return "کلید property در object JSON باید string باشد. property از نوع symbol را حذف کنید یا از Type دیگری استفاده کنید.";
    case "Hole":
      return "یک عنصر از آرایهٔ JSON وجود ندارد.";
    case "ExcessProperty":
      return "وجود property اضافی روی آرایهٔ JSON مجاز نیست. آن را حذف کنید یا از Type دیگری استفاده کنید.";
    case "CircularReference":
      return "JsonValue نباید شامل ارجاع‌های دوری باشد.";
  }
};

/** JsonError را به فارسی قالب‌بندی می‌کند. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} را نمی‌توان به JsonValue parse کرد.`;
