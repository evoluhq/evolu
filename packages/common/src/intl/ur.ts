/**
 * اردو Evolu Type ایرر فارمیٹرز۔
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
  return `قدر ${safelyStringifyUnknownValue(error.value)} ${typeOf} نہیں ہے۔`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `قدر ${safelyStringifyUnknownValue(reason.value)} آبجیکٹ نہیں ہے۔`
    : "قدر ایک آبجیکٹ ہے، لیکن Object Output سادہ آبجیکٹ ہونا چاہیے یا اس کا prototype null ہونا چاہیے۔";

/** NeverError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} قسم Never کے لیے درست نہیں ہے۔`;
/** String TypeOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** TemplateLiteralError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} template literal سے مطابقت نہیں رکھتی۔`;
/** Number TypeOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** BigInt TypeOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Boolean TypeOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Symbol TypeOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Function TypeOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** EvoluTypeError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `قدر ${safelyStringifyUnknownValue(error.value)} Evolu Type نہیں ہے۔`;
/** ObjectTagError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} میں متوقع object tag ${safelyStringifyUnknownValue(error.expected)} نہیں ہے۔`;
/** InstanceOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.constructorName} کی instance نہیں ہے۔`;
/** LiteralError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} متوقع literal کے عین برابر نہیں ہے: ${String(error.expected)}۔`;
/** UnionError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "قدر کسی بھی منظور شدہ variant سے مطابقت نہیں رکھتی۔";
/** DateIsoError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string نہیں ہے۔`;
/** DateIsoFromDateError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date کو DateIso کے طور پر ظاہر نہیں کیا جا سکتا۔";
/** DecimalStringError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} canonical decimal string ہونی چاہیے۔`;
/** Int64Error کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست signed 64-bit integer (Int64) نہیں ہے۔`;
/** UInt64Error کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست unsigned 64-bit integer (UInt64) نہیں ہے۔`;
/** Int64StringError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Int64 string نہیں ہے۔`;
/** CapitalizedError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کا پہلا حرف بڑا ہونا چاہیے۔`;
/** TrimmedError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کے شروع یا آخر میں خالی جگہ نہیں ہونی چاہیے۔`;
/** MinLengthError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کم از کم ${error.min} لمبی ہونی چاہیے۔`;
/** MaxLengthError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کی لمبائی ${error.max} سے زیادہ ہے۔`;
/** LengthError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کی مطلوبہ لمبائی ${error.exact} نہیں ہے۔`;
/** RegexError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} سے مطابقت نہیں رکھتی۔`;
/** Base64UrlError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Base64Url string نہیں ہے۔`;
/** NameError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Name نہیں ہے۔`;
/** MnemonicError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست انگریزی BIP39 mnemonic نہیں ہے۔`;
/** IdError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} درست Id نہیں ہے۔`;
/** TableIdError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} جدول ${error.table} کے لیے درست Id نہیں ہے۔`;
/** NonNegativeError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر منفی (>= 0) ہونی چاہیے۔`;
/** NonNegativeDecimalStringError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر منفی decimal string ہونی چاہیے۔`;
/** PositiveError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} مثبت (> 0) ہونی چاہیے۔`;
/** PositiveDecimalStringError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} مثبت decimal string ہونی چاہیے۔`;
/** NonPositiveError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر مثبت (<= 0) ہونی چاہیے۔`;
/** NonPositiveDecimalStringError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} غیر مثبت decimal string ہونی چاہیے۔`;
/** NegativeError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} منفی (< 0) ہونی چاہیے۔`;
/** NegativeDecimalStringError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} منفی decimal string ہونی چاہیے۔`;
/** IntError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} safe integer ہونی چاہیے۔`;
/** GreaterThanError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} ${error.min} سے بڑی ہونی چاہیے۔`;
/** GreaterThanOrEqualToError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} ${error.min} سے بڑی یا برابر ہونی چاہیے۔`;
/** LessThanError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} ${error.max} سے چھوٹی ہونی چاہیے۔`;
/** LessThanOrEqualToError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} ${error.max} سے چھوٹی یا برابر ہونی چاہیے۔`;
/** NonNaNError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "قدر NaN نہیں ہونی چاہیے۔";
/** FiniteError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} محدود ہونی چاہیے۔`;
/** MultipleOfError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `قدر ${safelyStringifyUnknownValue(error.value)}، ${error.divisor} کا مضرب ہونی چاہیے۔`;
/** BetweenError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} ${error.min} اور ${error.max} کے درمیان، دونوں شامل، ہونی چاہیے۔`;

/** ArrayError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} array نہیں ہے۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} پر array element موجود نہیں ہے۔`;
    case "Accessor":
      return `index ${issue.index} پر array element data property ہونا چاہیے۔`;
    case "ExcessProperty":
      return "اضافی Array property کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "Element":
      return `index ${issue.index} پر array element درست نہیں ہے۔`;
  }
};
/** SetError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} Set نہیں ہے۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `اضافی Set property ${safelyStringifyUnknownValue(issue.key)} کی اجازت نہیں ہے۔`;
    case "Element":
      return `index ${issue.index} پر Set element درست نہیں ہے۔`;
  }
};

/** MapError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} Map نہیں ہے۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `اضافی Map property ${safelyStringifyUnknownValue(issue.key)} کی اجازت نہیں ہے۔`;
    case "Key":
    case "Value":
      return `index ${issue.index} پر Map element درست نہیں ہے۔`;
    case "Collision":
      return `Map keys ${safelyStringifyUnknownValue(issue.previousKey)} اور ${safelyStringifyUnknownValue(issue.key)} decode ہونے کے بعد ایک ہی key ${safelyStringifyUnknownValue(issue.outputKey)} بن جاتے ہیں۔`;
  }
};
/** TupleError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} tuple نہیں ہے۔`;
  if (error.reason.kind === "InvalidLength")
    return `Tuple میں بالکل ${error.reason.expected} elements ہونے چاہئیں، لیکن قدر میں ${error.reason.actual} ہیں۔`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} پر Tuple element موجود نہیں ہے۔`;
    case "Accessor":
      return `index ${issue.index} پر Tuple element data property ہونا چاہیے۔`;
    case "ExcessProperty":
      return "اضافی Tuple property کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "Element":
      return `index ${issue.index} پر Tuple element درست نہیں ہے۔`;
  }
};
/** RecordError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `قدر ${safelyStringifyUnknownValue(error.reason.value)} Record نہیں ہے۔`;
  if (error.reason.kind === "NotPlainRecord")
    return "قدر آبجیکٹ ہے، لیکن Record Output سادہ آبجیکٹ ہونا چاہیے یا اس کا prototype null ہونا چاہیے۔";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `property key ${safelyStringifyUnknownValue(issue.key)} درست نہیں ہے۔`;
    case "Value":
      return `property ${safelyStringifyUnknownValue(issue.key)} کی قدر درست نہیں ہے۔`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} data property ہونی چاہیے۔`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable ہونی چاہیے۔`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} اور ${safelyStringifyUnknownValue(issue.key)} decode ہونے کے بعد ایک ہی key ${safelyStringifyUnknownValue(issue.outputKey)} بن جاتے ہیں۔`;
  }
};
/** ObjectError کو اردو میں فارمیٹ کرتا ہے۔ */
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
        return "Object property data property ہونی چاہیے۔ اس Type کو استعمال کرنے سے پہلے accessor values کو سادہ data میں تبدیل کریں یا مختلف Type استعمال کریں۔";
      case "NonEnumerable":
        return "Object property enumerable ہونی چاہیے۔ اسے enumerable بنائیں یا مختلف Type استعمال کریں۔";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `مطلوبہ property ${safelyStringifyUnknownValue(key)} موجود نہیں ہے۔`;
  if (typeof key === "symbol")
    return "Object property key string ہونی چاہیے۔ symbol property ہٹائیں یا مختلف Type استعمال کریں۔";
  if (propertyError.type === "ObjectExcessProperty")
    return `property ${safelyStringifyUnknownValue(key)} کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔`;
  return `property ${safelyStringifyUnknownValue(key)} درست نہیں ہے۔`;
};
/** DiscriminatedUnionError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} data property ہونی چاہیے۔`;
      if (error.reason.reason === "Inherited")
        return `${property} اپنی property ہونی چاہیے۔`;
      return `${property} enumerable ہونی چاہیے۔`;
    }
    case "Discriminator":
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} کی قدر ${safelyStringifyUnknownValue(error.reason.value)} غیر متوقع ہے۔`;
    case "Member":
      return `منتخب variant ${safelyStringifyUnknownValue(error.reason.discriminator)} درست نہیں ہے۔`;
  }
};
/** JsonValueError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `قدر ${safelyStringifyUnknownValue(issue.value)} JSON value نہیں ہے۔`;
    case "NonFiniteNumber":
      return "JSON number محدود ہونا چاہیے۔";
    case "UnexpectedPrototype":
      return "قدر آبجیکٹ ہے، لیکن JsonValue object سادہ آبجیکٹ ہونا چاہیے یا اس کا prototype null ہونا چاہیے۔";
    case "Accessor":
      return "JSON property data property ہونی چاہیے۔ اس Type کو استعمال کرنے سے پہلے accessor values کو سادہ data میں تبدیل کریں یا مختلف Type استعمال کریں۔";
    case "NonEnumerable":
      return "JSON object property enumerable ہونی چاہیے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "SymbolProperty":
      return "JSON object property key string ہونی چاہیے۔ symbol property ہٹائیں یا مختلف Type استعمال کریں۔";
    case "Hole":
      return "JSON array element موجود نہیں ہے۔";
    case "ExcessProperty":
      return "اضافی JSON array property کی اجازت نہیں ہے۔ اسے ہٹائیں یا مختلف Type استعمال کریں۔";
    case "CircularReference":
      return "JsonValue میں circular references نہیں ہونے چاہئیں۔";
  }
};
/** JsonError کو اردو میں فارمیٹ کرتا ہے۔ */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `قدر ${safelyStringifyUnknownValue(error.value)} کو JsonValue میں parse نہیں کیا جا سکتا۔`;
