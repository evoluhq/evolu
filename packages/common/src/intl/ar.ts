/**
 * Arabic Evolu Type error formatters.
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
  return `القيمة ${safelyStringifyUnknownValue(error.value)} ليست من النوع ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `القيمة ${safelyStringifyUnknownValue(reason.value)} ليست كائناً.`
    : "القيمة كائن، لكن مخرج Object يجب أن يكون كائناً عادياً أو أن يكون نموذجه الأولي null.";

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
) => `القيمة ${safelyStringifyUnknownValue(error.value)} ليست Evolu Type.`;
/** Formats an ObjectTagError in Arabic. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تحمل وسم الكائن المتوقع ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Arabic. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "كائن Date غير صالح.";
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
  "القيمة لا تطابق أي بديل مسموح به.";
/** Formats a DateIsoError in Arabic. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست سلسلة تاريخ ووقت ISO معيارية.`;

/** Formats a PlainDateIsoError in Arabic. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست تاريخاً تقويمياً صالحاً بصيغة YYYY-MM-DD.`;
/** Formats a DateIsoFromDateError in Arabic. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "لا يمكن تمثيل Date على أنه DateIso.";

/** Formats a DateIsoFromRfc3339Error in Arabic. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست تاريخاً ووقتاً بصيغة RFC 3339 مدعومة. استخدم قيمة مثل "2024-01-01T12:00:00Z".`;
/** Formats a DecimalStringError in Arabic. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} سلسلة عشرية معيارية.`;
/** Formats an Int64Error in Arabic. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عدداً صحيحاً ذا إشارة صالحاً من 64 بت (Int64).`;
/** Formats a UInt64Error in Arabic. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عدداً صحيحاً بدون إشارة صالحاً من 64 بت (UInt64).`;
/** Formats an Int64StringError in Arabic. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست سلسلة Int64 صالحة.`;

/** Formats an IdentifierError in Arabic. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست معرّفاً بصيغة ${error.casing}.`;

/** Formats a CapitalizedError in Arabic. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `يجب أن تبدأ القيمة ${safelyStringifyUnknownValue(error.value)} بحرف كبير.`;

/** Formats an UncapitalizedError in Arabic. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `يجب ألا تبدأ القيمة ${safelyStringifyUnknownValue(error.value)} بحرف كبير.`;

/** Formats an UppercasedError in Arabic. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} بأحرف كبيرة.`;

/** Formats a LowercasedError in Arabic. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} بأحرف صغيرة.`;
/** Formats a TrimmedError in Arabic. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `يجب إزالة المسافات من بداية القيمة ${safelyStringifyUnknownValue(error.value)} ونهايتها.`;

/** Formats a WellFormedError in Arabic. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} نص Unicode سليم البنية.`;

/** Formats a NormalizedError in Arabic. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} بصيغة تطبيع Unicode ${error.form}.`;
/** Formats a StartsWithError in Arabic. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `يجب أن تبدأ القيمة ${safelyStringifyUnknownValue(error.value)} بـ ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Arabic. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `يجب أن تنتهي القيمة ${safelyStringifyUnknownValue(error.value)} بـ ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Arabic. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `يجب أن تحتوي القيمة ${safelyStringifyUnknownValue(error.value)} على ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Arabic. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `يجب ألا تحتوي القيمة ${safelyStringifyUnknownValue(error.value)} على ${safelyStringifyUnknownValue(error.substring)}.`;

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
/** Formats a MaxUtf8ByteLengthError in Arabic. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} تتجاوز الطول الأقصى بالبايت في ترميز UTF-8 وهو ${error.max}.`;
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

/** Formats a Base64Error in Arabic. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست سلسلة Base64 صالحة.`;

/** Formats a HexError in Arabic. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست سلسلة ست عشرية بأحرف صغيرة وبعدد زوجي من الخانات.`;
/** Formats a HexColorError in Arabic. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست لوناً بصيغة #rrggbb بأحرف صغيرة.`;
/** Formats a NameError in Arabic. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست Name صالحة.`;
/** Formats an EmailError in Arabic. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عنوان بريد إلكتروني صالحاً.`;

/** Formats a HostnameError in Arabic. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست اسم مضيف صالحاً بأحرف صغيرة.`;

/** Formats an Ipv4AddressError in Arabic. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عنوان IPv4 صالحاً.`;

/** Formats an Ipv6AddressError in Arabic. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عنوان IPv6 معيارياً.`;

/** Formats an Ipv6AddressFromStringError in Arabic. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عنوان IPv6 صالحاً.`;

/** Formats an IpAddressError in Arabic. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عنوان IPv4 صالحاً أو عنوان IPv6 معيارياً.`;

/** Formats an IpAddressFromStringError in Arabic. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عنوان IP صالحاً.`;

/** Formats a PhoneNumberE164Error in Arabic. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست رقم هاتف بصيغة E.164.`;

/** Formats an IbanError in Arabic. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست رقم IBAN صالحاً بأحرف كبيرة ودون مسافات.`;
/** Formats an IsbnError in Arabic. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست رقم ISBN صالحاً من 13 رقماً دون شرطات.`;
/** Formats a SimplePasswordError in Arabic. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "يجب إزالة المسافات من بداية كلمة المرور ونهايتها.";
    case "TooLong":
      return "كلمة المرور تتجاوز الطول الأقصى 64.";
    case "TooShort":
      return "كلمة المرور لا تحقق الطول الأدنى 8.";
  }
};
/** Formats a MnemonicError in Arabic. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "القيمة ليست عبارة BIP39 إنجليزية صالحة.";
/** Formats an IdError in Arabic. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست Id صالحة.`;
/** Formats a TableIdError in Arabic. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست Id صالحة للجدول ${error.table}.`;
/** Formats a UuidError in Arabic. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست UUID معيارياً بأحرف صغيرة.`;

/** Formats a UuidVersionError in Arabic. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست UUID من الإصدار ${error.version}.`;
/** Formats a UlidError in Arabic. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست ULID معيارياً بأحرف كبيرة.`;
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
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} بين ${error.min} و${error.max}، بما في ذلك الحدّان.`;

/** Formats a GreaterThanBigIntError in Arabic. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أكبر من ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Arabic. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أكبر من أو تساوي ${error.min}.`;

/** Formats a LessThanBigIntError in Arabic. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أصغر من ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Arabic. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} أصغر من أو تساوي ${error.max}.`;

/** Formats a BetweenBigIntError in Arabic. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `يجب أن تكون القيمة ${safelyStringifyUnknownValue(error.value)} بين ${error.min} و${error.max}، بما في ذلك الحدّان.`;

/** Formats a BooleanFromStringError in Arabic. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست قيمة منطقية. استخدم true أو false.`;

/** Formats an IntFromStringError in Arabic. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عدداً صحيحاً عشرياً.`;

/** Formats a FiniteNumberFromStringError in Arabic. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست عدداً عشرياً.`;

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

/** Formats a NonEmptyArrayError in Arabic. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `يجب أن تحتوي القيمة ${safelyStringifyUnknownValue(error.value)} على عنصر واحد على الأقل.`;

/** Formats a UniqueError in Arabic. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} تحتوي على عناصر متساوية عند الفهرسين ${error.previousIndex} و${error.index}.`;

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
      return `مفتاح Map عند الفهرس ${issue.index} غير صالح.`;
    case "Value":
      return `قيمة Map عند الفهرس ${issue.index} غير صالحة.`;
    case "Collision":
      return `مفتاحا Map عند الفهرسين ${issue.previousIndex} و${issue.index} يُفك ترميزهما إلى المفتاح نفسه ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Arabic. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `الحجم ${error.value.size} لا يحقق الحجم الأدنى ${error.min}.`;

/** Formats a MaxSizeError in Arabic. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `الحجم ${error.value.size} يتجاوز الحجم الأقصى ${error.max}.`;

/** Formats a TupleError in Arabic. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `القيمة ${safelyStringifyUnknownValue(error.reason.value)} ليست tuple.`;
  if (error.reason.kind === "InvalidLength")
    return `يجب أن يكون طول Tuple هو ${error.reason.expected}، لكن طول القيمة هو ${error.reason.actual}.`;
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
    return "القيمة كائن، لكن مخرج Record يجب أن يكون كائناً عادياً أو أن يكون نموذجه الأولي null.";
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

/** Formats a MinEntriesError in Arabic. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} لا تحقق الحد الأدنى لعدد الإدخالات ${error.min}.`;

/** Formats a MaxEntriesError in Arabic. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} تتجاوز الحد الأقصى لعدد الإدخالات ${error.max}.`;

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
      return `البديل المختار ${safelyStringifyUnknownValue(error.reason.discriminator)} غير صالح.`;
  }
};

/** Formats a DataError in Arabic. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `القيمة ${safelyStringifyUnknownValue(issue.value)} ليست Data.`;
    case "UnexpectedPrototype":
      return `النموذج الأولي لـ ${issue.container} في Data غير متوقع.`;
    case "Accessor":
      return "يجب أن تكون خاصية Data خاصية بيانات. حوّل قيم أدوات الوصول إلى بيانات عادية قبل استخدام هذا Type أو استخدم Type مختلفاً.";
    case "NonEnumerable":
      return "يجب أن تكون خاصية Object في Data قابلة للتعداد. أزلها أو استخدم Type مختلفاً.";
    case "SymbolProperty":
      return "يجب أن يكون مفتاح خاصية Object في Data سلسلة نصية. أزل خاصية الرمز أو استخدم Type مختلفاً.";
    case "Hole":
      return "عنصر Array في Data مفقود.";
    case "InvalidUint8Array":
      return "يجب أن يستند Uint8Array في Data إلى ArrayBuffer غير منفصل وأن يقع ضمن حدوده.";
    case "ExcessProperty":
      return `يجب ألا يحتوي ${issue.container} في Data على خصائص مملوكة زائدة. أزل الخاصية أو استخدم Type مختلفاً.`;
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
      return "القيمة كائن، لكن كائن JsonValue يجب أن يكون كائناً عادياً أو أن يكون نموذجه الأولي null.";
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

/** Formats a ByteSizeLiteralError in Arabic. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست قيمة حرفية لحجم بالبايت. استخدم قيمة مثل "512KiB" أو "1MiB".`;

/** Formats a ByteLengthError in Arabic. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "القيمة -0 ليست طولاً بالبايت. استخدم 0 بدلاً منها.";

/** Formats a ByteLengthFromStringError in Arabic. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست طولاً بالبايت. استخدم عدد البايتات أو قيمة حرفية مثل 10MiB.`;

/** Formats a DurationLiteralError in Arabic. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست قيمة حرفية لمدة زمنية. استخدم قيمة مثل "500ms" أو "1.5s".`;

/** Formats a PercentageLiteralError in Arabic. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `القيمة ${safelyStringifyUnknownValue(error.value)} ليست قيمة حرفية لنسبة مئوية. استخدم قيمة مثل "50%" أو "12.5%".`;
