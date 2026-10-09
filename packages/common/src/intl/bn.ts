/**
 * Bengali Evolu Type error formatters.
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

  return `${safelyStringifyUnknownValue(error.value)} মানটি ${typeOf} নয়।`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `${safelyStringifyUnknownValue(reason.value)} মানটি object নয়।`
    : "মানটি object, কিন্তু Object Output অবশ্যই plain object হতে হবে অথবা এর prototype null হতে হবে।";

/** Formats a NeverError in Bengali. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি Never টাইপের জন্য বৈধ নয়।`;

/** Formats a String TypeOfError in Bengali. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Bengali. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি template literal-এর সঙ্গে মেলে না।`;

/** Formats a Number TypeOfError in Bengali. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Bengali. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Bengali. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Bengali. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি boolean নয়। true বা false ব্যবহার করুন।`;

/** Formats a Symbol TypeOfError in Bengali. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Bengali. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Bengali. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `${safelyStringifyUnknownValue(error.value)} মানটি Evolu Type নয়।`;

/** Formats an ObjectTagError in Bengali. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটিতে প্রত্যাশিত object tag ${safelyStringifyUnknownValue(error.expected)} নেই।`;

/** Formats a ValidDateError in Bengali. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date-টি অবৈধ।";

/** Formats an InstanceOfError in Bengali. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.constructorName}-এর instance নয়।`;

/** Formats a LiteralError in Bengali. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি প্রত্যাশিত literal-এর সঙ্গে strictly equal নয়: ${String(error.expected)}।`;

/** Formats a UnionError in Bengali. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "মানটি অনুমোদিত কোনো variant-এর সঙ্গে মেলে না।";

/** Formats a DateIsoError in Bengali. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি canonical ISO date-time string নয়।`;

/** Formats a PlainDateIsoError in Bengali. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি YYYY-MM-DD ফরম্যাটে লেখা বৈধ ক্যালেন্ডার তারিখ নয়।`;

/** Formats a DateIsoFromDateError in Bengali. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-টিকে DateIso হিসেবে উপস্থাপন করা যায় না।";

/** Formats a DateIsoFromRfc3339Error in Bengali. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি সমর্থিত RFC 3339 date-time নয়। "2024-01-01T12:00:00Z"-এর মতো একটি মান ব্যবহার করুন।`;

/** Formats a DecimalStringError in Bengali. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি canonical decimal string হতে হবে।`;

/** Formats an Int64Error in Bengali. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ signed 64-bit integer (Int64) নয়।`;

/** Formats a UInt64Error in Bengali. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ unsigned 64-bit integer (UInt64) নয়।`;

/** Formats an Int64StringError in Bengali. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) => `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ Int64 string নয়।`;

/** Formats an IdentifierError in Bengali. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.casing} শনাক্তকারী নয়।`;

/** Formats a CapitalizedError in Bengali. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির প্রথম অক্ষর বড় হাতের হতে হবে।`;

/** Formats an UncapitalizedError in Bengali. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বড় হাতের অক্ষর দিয়ে শুরু হওয়া চলবে না।`;

/** Formats an UppercasedError in Bengali. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি অবশ্যই বড় হাতের অক্ষরে লেখা হতে হবে।`;

/** Formats a LowercasedError in Bengali. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি অবশ্যই ছোট হাতের অক্ষরে লেখা হতে হবে।`;

/** Formats a TrimmedError in Bengali. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির শুরু বা শেষে whitespace থাকা যাবে না।`;

/** Formats a WellFormedError in Bengali. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি অবশ্যই well-formed Unicode টেক্সট হতে হবে।`;

/** Formats a NormalizedError in Bengali. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি অবশ্যই Unicode নর্মালাইজেশন ফর্ম ${error.form}-এ থাকতে হবে।`;

/** Formats a StartsWithError in Bengali. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি অবশ্যই ${safelyStringifyUnknownValue(error.prefix)} দিয়ে শুরু হতে হবে।`;

/** Formats an EndsWithError in Bengali. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি অবশ্যই ${safelyStringifyUnknownValue(error.suffix)} দিয়ে শেষ হতে হবে।`;

/** Formats a MinLengthError in Bengali. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির দৈর্ঘ্য অন্তত ${error.min} হতে হবে।`;

/** Formats a MaxLengthError in Bengali. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির দৈর্ঘ্য সর্বোচ্চ ${error.max} হতে পারে।`;

/** Formats a LengthError in Bengali. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির দৈর্ঘ্য ${error.exact} হতে হবে।`;

/** Formats a RegexError in Bengali. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি /${error.source}/${error.flags}-এর সঙ্গে মেলে না।`;

/** Formats a Base64UrlError in Bengali. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ Base64Url string নয়।`;

/** Formats a Base64Error in Bengali. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ Base64 string নয়।`;

/** Formats a HexError in Bengali. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ছোট হাতের অক্ষরে লেখা এবং জোড় সংখ্যক অঙ্কবিশিষ্ট hexadecimal string নয়।`;

/** Formats a NameError in Bengali. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ Name নয়।`;

/** Formats an EmailError in Bengali. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ ইমেল ঠিকানা নয়।`;

/** Formats a HostnameError in Bengali. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ছোট হাতের অক্ষরে লেখা বৈধ হোস্টনেম নয়।`;

/** Formats an Ipv4AddressError in Bengali. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) => `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ IPv4 ঠিকানা নয়।`;

/** Formats an Ipv6AddressError in Bengali. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি canonical IPv6 ঠিকানা নয়।`;

/** Formats an Ipv6AddressFromStringError in Bengali. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ IPv6 ঠিকানা নয়।`;

/** Formats a PhoneNumberE164Error in Bengali. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি E.164 ফরম্যাটে লেখা ফোন নম্বর নয়।`;

/** Formats an IbanError in Bengali. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বড় হাতের অক্ষরে ও ফাঁকা স্থান ছাড়া লেখা বৈধ IBAN নয়।`;

/** Formats a MnemonicError in Bengali. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ ইংরেজি BIP39 mnemonic নয়।`;

/** Formats an IdError in Bengali. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ Id নয়।`;

/** Formats a TableIdError in Bengali. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.table} table-এর জন্য বৈধ Id নয়।`;

/** Formats a UuidError in Bengali. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ছোট হাতের অক্ষরে লেখা canonical UUID নয়।`;

/** Formats a UuidVersionError in Bengali. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি সংস্করণ ${error.version}-এর UUID নয়।`;

/** Formats a NonNegativeError in Bengali. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ঋণাত্মক হতে পারবে না (>= 0)।`;

/** Formats a NonNegativeDecimalStringError in Bengali. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ঋণাত্মক নয় এমন decimal string হতে হবে।`;

/** Formats a PositiveError in Bengali. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ধনাত্মক হতে হবে (> 0)।`;

/** Formats a PositiveDecimalStringError in Bengali. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ধনাত্মক decimal string হতে হবে।`;

/** Formats a NonPositiveError in Bengali. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ধনাত্মক হতে পারবে না (<= 0)।`;

/** Formats a NonPositiveDecimalStringError in Bengali. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ধনাত্মক নয় এমন decimal string হতে হবে।`;

/** Formats a NegativeError in Bengali. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ঋণাত্মক হতে হবে (< 0)।`;

/** Formats a NegativeDecimalStringError in Bengali. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ঋণাত্মক decimal string হতে হবে।`;

/** Formats an IntError in Bengali. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি safe integer হতে হবে।`;

/** Formats an IntFromStringError in Bengali. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি দশমিক পূর্ণসংখ্যা নয়।`;

/** Formats a FiniteNumberFromStringError in Bengali. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি দশমিক সংখ্যা নয়।`;

/** Formats a GreaterThanError in Bengali. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.min}-এর চেয়ে বড় হতে হবে।`;

/** Formats a GreaterThanOrEqualToError in Bengali. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.min}-এর চেয়ে বড় বা সমান হতে হবে।`;

/** Formats a LessThanError in Bengali. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.max}-এর চেয়ে ছোট হতে হবে।`;

/** Formats a LessThanOrEqualToError in Bengali. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.max}-এর চেয়ে ছোট বা সমান হতে হবে।`;

/** Formats a NonNaNError in Bengali. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "মানটি NaN হওয়া চলবে না।";

/** Formats a FiniteError in Bengali. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি সসীম হতে হবে।`;

/** Formats a MultipleOfError in Bengali. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.divisor}-এর গুণিতক হতে হবে।`;

/** Formats a BetweenError in Bengali. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.min} থেকে ${error.max}-এর মধ্যে, দুই প্রান্তসহ, হতে হবে।`;

/** Formats an ArrayError in Bengali. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `${safelyStringifyUnknownValue(error.reason.value)} মানটি array নয়।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `array-এর index ${issue.index}-এ element অনুপস্থিত।`;
    case "Accessor":
      return `array-এর index ${issue.index}-এর element অবশ্যই data property হতে হবে।`;
    case "ExcessProperty":
      return "অতিরিক্ত Array property অনুমোদিত নয়। এটি সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
    case "Element":
      return `array-এর index ${issue.index}-এর element অবৈধ।`;
  }
};

/** Formats a NonEmptyArrayError in Bengali. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটিতে অন্তত একটি আইটেম থাকতে হবে।`;

/** Formats a UniqueError in Bengali. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির index ${error.previousIndex} এবং ${error.index}-এর আইটেম দুটি সমান।`;

/** Formats a SetError in Bengali. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `${safelyStringifyUnknownValue(error.reason.value)} মানটি Set নয়।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `অতিরিক্ত Set property ${safelyStringifyUnknownValue(issue.key)} অনুমোদিত নয়।`;
    case "Element":
      return `Set-এর index ${issue.index}-এর element অবৈধ।`;
  }
};

/** Formats a MapError in Bengali. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `${safelyStringifyUnknownValue(error.reason.value)} মানটি Map নয়।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `অতিরিক্ত Map property ${safelyStringifyUnknownValue(issue.key)} অনুমোদিত নয়।`;
    case "Key":
      return `Map-এর index ${issue.index}-এর key অবৈধ।`;
    case "Value":
      return `Map-এর index ${issue.index}-এর মান অবৈধ।`;
    case "Collision":
      return `Map-এর index ${issue.previousIndex} এবং ${issue.index}-এর key দুটি decode হয়ে একই key ${safelyStringifyUnknownValue(issue.outputKey)} হয়।`;
  }
};

/** Formats a TupleError in Bengali. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `${safelyStringifyUnknownValue(error.reason.value)} মানটি tuple নয়।`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple-এর দৈর্ঘ্য ${error.reason.expected} হতে হবে, কিন্তু মানটির দৈর্ঘ্য ${error.reason.actual}।`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Tuple-এর index ${issue.index}-এ element অনুপস্থিত।`;
    case "Accessor":
      return `Tuple-এর index ${issue.index}-এর element অবশ্যই data property হতে হবে।`;
    case "ExcessProperty":
      return "অতিরিক্ত Tuple property অনুমোদিত নয়। এটি সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
    case "Element":
      return `Tuple-এর index ${issue.index}-এর element অবৈধ।`;
  }
};

/** Formats a RecordError in Bengali. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `${safelyStringifyUnknownValue(error.reason.value)} মানটি Record নয়।`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "মানটি object, কিন্তু Record Output অবশ্যই plain object হতে হবে অথবা এর prototype null হতে হবে।";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} অবৈধ।`;
    case "Value":
      return `Property ${safelyStringifyUnknownValue(issue.key)}-এর মান অবৈধ।`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} অবশ্যই data property হতে হবে।`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} অবশ্যই enumerable হতে হবে।`;
    case "Collision":
      return `Record key ${safelyStringifyUnknownValue(issue.previousKey)} এবং ${safelyStringifyUnknownValue(issue.key)} decode হয়ে একই key ${safelyStringifyUnknownValue(issue.outputKey)} হয়।`;
  }
};

/** Formats a MinEntriesError in Bengali. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির এন্ট্রির সংখ্যা অন্তত ${error.min} হতে হবে।`;

/** Formats a MaxEntriesError in Bengali. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির এন্ট্রির সংখ্যা সর্বোচ্চ ${error.max} হতে পারে।`;

/** Formats an ObjectError in Bengali. */
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
        return "Object property অবশ্যই data property হতে হবে। এই Type ব্যবহার করার আগে accessor value-গুলোকে plain data-তে materialize করুন, অথবা অন্য Type ব্যবহার করুন।";
      case "NonEnumerable":
        return "Object property অবশ্যই enumerable হতে হবে। এটিকে enumerable করুন অথবা অন্য Type ব্যবহার করুন।";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `প্রয়োজনীয় property ${safelyStringifyUnknownValue(key)} অনুপস্থিত।`;
  }
  if (typeof key === "symbol") {
    return "Object property key অবশ্যই string হতে হবে। symbol property সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Property ${safelyStringifyUnknownValue(key)} অনুমোদিত নয়। এটি সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।`;
  }
  return `Property ${safelyStringifyUnknownValue(key)} অবৈধ।`;
};

/** Formats a DiscriminatedUnionError in Bengali. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} অবশ্যই data property হতে হবে।`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} অবশ্যই own property হতে হবে।`;
      }
      return `${property} অবশ্যই enumerable হতে হবে।`;
    }
    case "Discriminator":
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}-এর মান ${safelyStringifyUnknownValue(error.reason.value)} অপ্রত্যাশিত।`;
    case "Member":
      return `নির্বাচিত variant ${safelyStringifyUnknownValue(error.reason.discriminator)} অবৈধ।`;
  }
};

/** Formats a DataError in Bengali. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `${safelyStringifyUnknownValue(issue.value)} মানটি Data নয়।`;
    case "UnexpectedPrototype":
      return `Data ${issue.container}-এর prototype অপ্রত্যাশিত।`;
    case "Accessor":
      return "Data property অবশ্যই data property হতে হবে। এই Type ব্যবহার করার আগে accessor value-গুলোকে plain data-তে materialize করুন, অথবা অন্য Type ব্যবহার করুন।";
    case "NonEnumerable":
      return "Data Object property অবশ্যই enumerable হতে হবে। এটি সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
    case "SymbolProperty":
      return "Data Object property key অবশ্যই string হতে হবে। symbol property সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
    case "Hole":
      return "Data Array-এর একটি element অনুপস্থিত।";
    case "InvalidUint8Array":
      return "Data Uint8Array-এর ArrayBuffer detached হওয়া চলবে না, এবং Uint8Array-কে অবশ্যই সেই ArrayBuffer-এর সীমার মধ্যে থাকতে হবে।";
    case "ExcessProperty":
      return `Data ${issue.container}-এ অতিরিক্ত own property থাকা চলবে না। property-টি সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।`;
  }
};

/** Formats a JsonValueError in Bengali. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `${safelyStringifyUnknownValue(issue.value)} মানটি JSON value নয়।`;
    case "NonFiniteNumber":
      return "JSON number অবশ্যই সসীম হতে হবে।";
    case "UnexpectedPrototype":
      return "মানটি object, কিন্তু JsonValue object অবশ্যই plain object হতে হবে অথবা এর prototype null হতে হবে।";
    case "Accessor":
      return "JSON property অবশ্যই data property হতে হবে। এই Type ব্যবহার করার আগে accessor value-গুলোকে plain data-তে materialize করুন, অথবা অন্য Type ব্যবহার করুন।";
    case "NonEnumerable":
      return "JSON object property অবশ্যই enumerable হতে হবে। এটি সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
    case "SymbolProperty":
      return "JSON object property key অবশ্যই string হতে হবে। symbol property সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
    case "Hole":
      return "JSON array-এর একটি element অনুপস্থিত।";
    case "ExcessProperty":
      return "অতিরিক্ত JSON array property অনুমোদিত নয়। এটি সরিয়ে দিন অথবা অন্য Type ব্যবহার করুন।";
    case "CircularReference":
      return "JsonValue-এ circular reference থাকা চলবে না।";
  }
};

/** Formats a JsonError in Bengali. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটিকে JsonValue হিসেবে parse করা যায় না।`;

/** Formats a ByteSizeLiteralError in Bengali. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বাইট আকারের literal নয়। "512KiB" বা "1MiB"-এর মতো একটি মান ব্যবহার করুন।`;

/** Formats a ByteLengthError in Bengali. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "-0 মানটি বাইট দৈর্ঘ্য নয়। এর পরিবর্তে 0 ব্যবহার করুন।";

/** Formats a ByteLengthFromStringError in Bengali. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বাইট দৈর্ঘ্য নয়। বাইটের সংখ্যা বা 10MiB-এর মতো একটি literal ব্যবহার করুন।`;

/** Formats a DurationLiteralError in Bengali. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি সময়কালের literal নয়। "500ms" বা "1.5s"-এর মতো একটি মান ব্যবহার করুন।`;

/** Formats a PercentageLiteralError in Bengali. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি শতাংশের literal নয়। "50%" বা "12.5%"-এর মতো একটি মান ব্যবহার করুন।`;
