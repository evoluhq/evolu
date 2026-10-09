/**
 * Persian Evolu Type error formatters.
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

  return `مقدار ${safelyStringifyUnknownValue(error.value)} از نوع ${typeOf} نیست.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `مقدار ${safelyStringifyUnknownValue(reason.value)} یک شیء نیست.`
    : "مقدار یک شیء است، اما خروجی Object باید یک شیء ساده باشد یا prototype آن null باشد.";

/** Formats a NeverError in Persian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} برای Type از نوع Never معتبر نیست.`;

/** Formats a String TypeOfError in Persian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Persian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} با template literal مطابقت ندارد.`;

/** Formats a Number TypeOfError in Persian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Persian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Persian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Persian. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک مقدار بولی نیست. از true یا false استفاده کنید.`;

/** Formats a Symbol TypeOfError in Persian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Persian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Persian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `مقدار ${safelyStringifyUnknownValue(error.value)} یک Evolu Type نیست.`;

/** Formats an ObjectTagError in Persian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} دارای تگ شیء مورد انتظار ${safelyStringifyUnknownValue(error.expected)} نیست.`;

/** Formats a ValidDateError in Persian. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "شیء Date نامعتبر است.";

/** Formats an InstanceOfError in Persian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} نمونه‌ای از ${error.constructorName} نیست.`;

/** Formats a LiteralError in Persian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} دقیقاً با مقدار لفظی مورد انتظار برابر نیست: ${String(error.expected)}.`;

/** Formats a UnionError in Persian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "مقدار با هیچ‌یک از variantهای مجاز مطابقت ندارد.";

/** Formats a DateIsoError in Persian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ کانونی تاریخ‌وزمان ISO نیست.`;

/** Formats a PlainDateIsoError in Persian. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک تاریخ تقویمی معتبر در قالب YYYY-MM-DD نیست.`;

/** Formats a DateIsoFromDateError in Persian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date را نمی‌توان به‌صورت DateIso نمایش داد.";

/** Formats a DateIsoFromRfc3339Error in Persian. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک تاریخ‌وزمان RFC 3339 پشتیبانی‌شده نیست. از مقداری مانند "2024-01-01T12:00:00Z" استفاده کنید.`;

/** Formats a DecimalStringError in Persian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی کانونی باشد.`;

/** Formats an Int64Error in Persian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک عدد صحیح 64 بیتی علامت‌دار معتبر (Int64) نیست.`;

/** Formats a UInt64Error in Persian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک عدد صحیح 64 بیتی بدون علامت معتبر (UInt64) نیست.`;

/** Formats an Int64StringError in Persian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ Int64 معتبر نیست.`;

/** Formats an IdentifierError in Persian. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک شناسه با قالب ${error.casing} نیست.`;

/** Formats a CapitalizedError in Persian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید با حرف بزرگ آغاز شود.`;

/** Formats an UncapitalizedError in Persian. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} نباید با حرف بزرگ شروع شود.`;

/** Formats an UppercasedError in Persian. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید با حروف بزرگ باشد.`;

/** Formats a LowercasedError in Persian. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید با حروف کوچک باشد.`;

/** Formats a TrimmedError in Persian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} نباید در ابتدا یا انتها فاصلهٔ اضافی داشته باشد.`;

/** Formats a WellFormedError in Persian. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک متن Unicode خوش‌ساخت باشد.`;

/** Formats a NormalizedError in Persian. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید در فرم نرمال‌سازی Unicode ${error.form} باشد.`;

/** Formats a StartsWithError in Persian. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید با ${safelyStringifyUnknownValue(error.prefix)} شروع شود.`;

/** Formats an EndsWithError in Persian. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید با ${safelyStringifyUnknownValue(error.suffix)} تمام شود.`;

/** Formats a MinLengthError in Persian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `طول مقدار ${safelyStringifyUnknownValue(error.value)} باید حداقل ${error.min} باشد.`;

/** Formats a MaxLengthError in Persian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `طول مقدار ${safelyStringifyUnknownValue(error.value)} از حداکثر ${error.max} بیشتر است.`;

/** Formats a LengthError in Persian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `طول مقدار ${safelyStringifyUnknownValue(error.value)} باید دقیقاً ${error.exact} باشد.`;

/** Formats a RegexError in Persian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} با /${error.source}/${error.flags} مطابقت ندارد.`;

/** Formats a Base64UrlError in Persian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ Base64Url معتبر نیست.`;

/** Formats a Base64Error in Persian. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ Base64 معتبر نیست.`;

/** Formats a HexError in Persian. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک رشتهٔ شانزده‌شانزدهی با حروف کوچک و تعداد ارقام زوج نیست.`;

/** Formats a NameError in Persian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک Name معتبر نیست.`;

/** Formats an EmailError in Persian. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک نشانی ایمیل معتبر نیست.`;

/** Formats a HostnameError in Persian. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک نام میزبان معتبر با حروف کوچک نیست.`;

/** Formats an Ipv4AddressError in Persian. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک نشانی IPv4 معتبر نیست.`;

/** Formats an Ipv6AddressError in Persian. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک نشانی IPv6 کانونی نیست.`;

/** Formats an Ipv6AddressFromStringError in Persian. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک نشانی IPv6 معتبر نیست.`;

/** Formats a PhoneNumberE164Error in Persian. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک شمارهٔ تلفن در قالب E.164 نیست.`;

/** Formats an IbanError in Persian. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک شمارهٔ IBAN معتبر با حروف بزرگ و بدون فاصله نیست.`;

/** Formats a SimplePasswordError in Persian. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "گذرواژه نباید در ابتدا یا انتها فاصلهٔ اضافی داشته باشد.";
    case "TooLong":
      return "طول گذرواژه از حداکثر 64 بیشتر است.";
    case "TooShort":
      return "طول گذرواژه باید حداقل 8 باشد.";
  }
};

/** Formats a MnemonicError in Persian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "مقدار یک عبارت یادسپاری انگلیسی BIP39 معتبر نیست.";

/** Formats an IdError in Persian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک Id معتبر نیست.`;

/** Formats a TableIdError in Persian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک Id معتبر برای جدول ${error.table} نیست.`;

/** Formats a UuidError in Persian. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک UUID کانونی با حروف کوچک نیست.`;

/** Formats a UuidVersionError in Persian. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک UUID نسخهٔ ${error.version} نیست.`;

/** Formats a NonNegativeError in Persian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید نامنفی (>= 0) باشد.`;

/** Formats a NonNegativeDecimalStringError in Persian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی نامنفی باشد.`;

/** Formats a PositiveError in Persian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید مثبت (> 0) باشد.`;

/** Formats a PositiveDecimalStringError in Persian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی مثبت باشد.`;

/** Formats a NonPositiveError in Persian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید نامثبت (<= 0) باشد.`;

/** Formats a NonPositiveDecimalStringError in Persian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی نامثبت باشد.`;

/** Formats a NegativeError in Persian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید منفی (< 0) باشد.`;

/** Formats a NegativeDecimalStringError in Persian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک رشتهٔ ده‌دهی منفی باشد.`;

/** Formats an IntError in Persian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید یک عدد صحیح امن باشد.`;

/** Formats an IntFromStringError in Persian. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک عدد صحیح ده‌دهی نیست.`;

/** Formats a FiniteNumberFromStringError in Persian. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک عدد ده‌دهی نیست.`;

/** Formats a GreaterThanError in Persian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید بزرگ‌تر از ${error.min} باشد.`;

/** Formats a GreaterThanOrEqualToError in Persian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید بزرگ‌تر یا مساوی ${error.min} باشد.`;

/** Formats a LessThanError in Persian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید کوچک‌تر از ${error.max} باشد.`;

/** Formats a LessThanOrEqualToError in Persian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید کوچک‌تر یا مساوی ${error.max} باشد.`;

/** Formats a NonNaNError in Persian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "مقدار نباید NaN باشد.";

/** Formats a FiniteError in Persian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید متناهی باشد.`;

/** Formats a MultipleOfError in Persian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید مضربی از ${error.divisor} باشد.`;

/** Formats a BetweenError in Persian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید بین ${error.min} و ${error.max}، با احتساب هر دو کران، باشد.`;

/** Formats an ArrayError in Persian. */
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

/** Formats a NonEmptyArrayError in Persian. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} باید دست‌کم یک عنصر داشته باشد.`;

/** Formats a UniqueError in Persian. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} در اندیس‌های ${error.previousIndex} و ${error.index} عناصر برابر دارد.`;

/** Formats a SetError in Persian. */
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

/** Formats a MapError in Persian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک Map نیست.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `property اضافی ${safelyStringifyUnknownValue(issue.key)} روی Map مجاز نیست.`;
    case "Key":
      return `کلید Map در اندیس ${issue.index} نامعتبر است.`;
    case "Value":
      return `مقدار Map در اندیس ${issue.index} نامعتبر است.`;
    case "Collision":
      return `کلیدهای Map در اندیس‌های ${issue.previousIndex} و ${issue.index} پس از decode به کلید یکسان ${safelyStringifyUnknownValue(issue.outputKey)} تبدیل می‌شوند.`;
  }
};

/** Formats a TupleError in Persian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک Tuple نیست.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `طول Tuple باید ${error.reason.expected} باشد، اما طول مقدار ${error.reason.actual} است.`;
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

/** Formats a RecordError in Persian. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `مقدار ${safelyStringifyUnknownValue(error.reason.value)} یک Record نیست.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "مقدار یک شیء است، اما خروجی Record باید یک شیء ساده باشد یا prototype آن null باشد.";
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

/** Formats a MinEntriesError in Persian. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `تعداد ورودی‌های مقدار ${safelyStringifyUnknownValue(error.value)} باید حداقل ${error.min} باشد.`;

/** Formats a MaxEntriesError in Persian. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `تعداد ورودی‌های مقدار ${safelyStringifyUnknownValue(error.value)} از حداکثر ${error.max} بیشتر است.`;

/** Formats an ObjectError in Persian. */
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
    return "کلید property در Object باید رشته باشد. property با کلید symbol را حذف کنید یا از Type دیگری استفاده کنید.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `property ${safelyStringifyUnknownValue(key)} مجاز نیست. آن را حذف کنید یا از Type دیگری استفاده کنید.`;
  }
  return `property ${safelyStringifyUnknownValue(key)} نامعتبر است.`;
};

/** Formats a DiscriminatedUnionError in Persian. */
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

/** Formats a DataError in Persian. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `مقدار ${safelyStringifyUnknownValue(issue.value)} از نوع Data نیست.`;
    case "UnexpectedPrototype":
      return `${issue.container} در Data دارای prototype غیرمنتظره است.`;
    case "Accessor":
      return "property در Data باید یک data property باشد. پیش از استفاده از این Type، مقادیر accessor را به دادهٔ ساده تبدیل کنید یا از Type دیگری استفاده کنید.";
    case "NonEnumerable":
      return "property یک Object در Data باید enumerable باشد. آن را حذف کنید یا از Type دیگری استفاده کنید.";
    case "SymbolProperty":
      return "کلید property یک Object در Data باید رشته باشد. property با کلید symbol را حذف کنید یا از Type دیگری استفاده کنید.";
    case "Hole":
      return "یک عنصر از Array در Data وجود ندارد.";
    case "InvalidUint8Array":
      return "Uint8Array در Data باید از یک ArrayBuffer که detach نشده است استفاده کند و در محدودهٔ آن قرار داشته باشد.";
    case "ExcessProperty":
      return `${issue.container} در Data نباید property اضافیِ متعلق به خود داشته باشد. آن property را حذف کنید یا از Type دیگری استفاده کنید.`;
  }
};

/** Formats a JsonValueError in Persian. */
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
      return "مقدار یک شیء است، اما شیء JsonValue باید یک شیء ساده باشد یا prototype آن null باشد.";
    case "Accessor":
      return "property در JSON باید یک data property باشد. پیش از استفاده از این Type، مقادیر accessor را به دادهٔ ساده تبدیل کنید یا از Type دیگری استفاده کنید.";
    case "NonEnumerable":
      return "property در شیء JSON باید enumerable باشد. آن را حذف کنید یا از Type دیگری استفاده کنید.";
    case "SymbolProperty":
      return "کلید property در شیء JSON باید رشته باشد. property با کلید symbol را حذف کنید یا از Type دیگری استفاده کنید.";
    case "Hole":
      return "یک عنصر از آرایهٔ JSON وجود ندارد.";
    case "ExcessProperty":
      return "وجود property اضافی روی آرایهٔ JSON مجاز نیست. آن را حذف کنید یا از Type دیگری استفاده کنید.";
    case "CircularReference":
      return "JsonValue نباید شامل ارجاع‌های دوری باشد.";
  }
};

/** Formats a JsonError in Persian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} را نمی‌توان به JsonValue parse کرد.`;

/** Formats a ByteSizeLiteralError in Persian. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک مقدار لفظی اندازه بر حسب بایت نیست. از مقداری مانند "512KiB" یا "1MiB" استفاده کنید.`;

/** Formats a ByteLengthError in Persian. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "مقدار -0 یک طول بر حسب بایت نیست. به‌جای آن از 0 استفاده کنید.";

/** Formats a ByteLengthFromStringError in Persian. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک طول بر حسب بایت نیست. از تعداد بایت‌ها یا یک مقدار لفظی مانند 10MiB استفاده کنید.`;

/** Formats a DurationLiteralError in Persian. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک مقدار لفظی مدت زمان نیست. از مقداری مانند "500ms" یا "1.5s" استفاده کنید.`;

/** Formats a PercentageLiteralError in Persian. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `مقدار ${safelyStringifyUnknownValue(error.value)} یک مقدار لفظی درصد نیست. از مقداری مانند "50%" یا "12.5%" استفاده کنید.`;
