/**
 * Bengali Evolu Type error formatters.
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

/** Formats an InstanceOfError in Bengali. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.constructorName}-এর instance নয়।`;

/** Formats a LiteralError in Bengali. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি প্রত্যাশিত literal-এর সঙ্গে strictly equal নয়: ${globalThis.String(error.expected)}।`;

/** Formats a UnionError in Bengali. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "মানটি অনুমোদিত কোনো variant-এর সঙ্গে মেলে না।";

/** Formats a DateIsoError in Bengali. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি canonical ISO date-time string নয়।`;

/** Formats a DateIsoFromDateError in Bengali. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-টিকে DateIso হিসেবে উপস্থাপন করা যায় না।";

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

/** Formats a CapitalizedError in Bengali. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির প্রথম অক্ষর বড় হাতের হতে হবে।`;

/** Formats a TrimmedError in Bengali. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটির শুরু বা শেষে whitespace থাকা যাবে না।`;

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

/** Formats a NameError in Bengali. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ Name নয়।`;

/** Formats a MnemonicError in Bengali. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ ইংরেজি BIP39 mnemonic নয়।`;

/** Formats an IdError in Bengali. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি বৈধ Id নয়।`;

/** Formats a TableIdError in Bengali. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} মানটি ${error.table} table-এর জন্য বৈধ Id নয়।`;

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
  `${safelyStringifyUnknownValue(error.value)} মানটি finite হতে হবে।`;

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
    case "Value":
      return `Map-এর index ${issue.index}-এর element অবৈধ।`;
    case "Collision":
      return `Map key ${safelyStringifyUnknownValue(issue.previousKey)} এবং ${safelyStringifyUnknownValue(issue.key)} decode হয়ে একই key ${safelyStringifyUnknownValue(issue.outputKey)} হয়।`;
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
    return `Tuple-এ ঠিক ${error.reason.expected}টি element থাকতে হবে, কিন্তু মানটিতে ${error.reason.actual}টি আছে।`;
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
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}-এর অপ্রত্যাশিত মান ${safelyStringifyUnknownValue(error.reason.value)}।`;
    case "Member":
      return `নির্বাচিত variant ${safelyStringifyUnknownValue(error.reason.discriminator)} অবৈধ।`;
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
      return "JSON number অবশ্যই finite হতে হবে।";
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
