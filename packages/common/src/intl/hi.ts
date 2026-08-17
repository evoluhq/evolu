/**
 * हिंदी Evolu Type त्रुटि फ़ॉर्मेटर।
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

  return `मान ${safelyStringifyUnknownValue(error.value)} ${typeOf} नहीं है।`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `मान ${safelyStringifyUnknownValue(reason.value)} object नहीं है।`
    : "मान एक object है, लेकिन Object Output को plain object होना चाहिए या उसका prototype null होना चाहिए।";

/** NeverError को हिंदी में format करता है। */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} Never प्रकार के लिए मान्य नहीं है।`;

/** String TypeOfError को हिंदी में format करता है। */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralError को हिंदी में format करता है। */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} template literal से मेल नहीं खाता।`;

/** Number TypeOfError को हिंदी में format करता है। */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfError को हिंदी में format करता है। */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfError को हिंदी में format करता है। */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfError को हिंदी में format करता है। */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfError को हिंदी में format करता है। */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeError को हिंदी में format करता है। */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `मान ${safelyStringifyUnknownValue(error.value)} Evolu Type नहीं है।`;

/** ObjectTagError को हिंदी में format करता है। */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} में अपेक्षित object tag ${safelyStringifyUnknownValue(error.expected)} नहीं है।`;

/** InstanceOfError को हिंदी में format करता है। */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.constructorName} का instance नहीं है।`;

/** LiteralError को हिंदी में format करता है। */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} अपेक्षित literal के strictly बराबर नहीं है: ${globalThis.String(error.expected)}।`;

/** UnionError को हिंदी में format करता है। */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "मान किसी भी अनुमत variant से मेल नहीं खाता।";

/** DateIsoError को हिंदी में format करता है। */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string नहीं है।`;

/** DateIsoFromDateError को हिंदी में format करता है। */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date को DateIso के रूप में दर्शाया नहीं जा सकता।";

/** DecimalStringError को हिंदी में format करता है। */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} canonical decimal string होना चाहिए।`;

/** Int64Error को हिंदी में format करता है। */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य signed 64-bit integer (Int64) नहीं है।`;

/** UInt64Error को हिंदी में format करता है। */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य unsigned 64-bit integer (UInt64) नहीं है।`;

/** Int64StringError को हिंदी में format करता है। */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Int64 string नहीं है।`;

/** CapitalizedError को हिंदी में format करता है। */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} का पहला अक्षर बड़ा होना चाहिए।`;

/** TrimmedError को हिंदी में format करता है। */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} के आरंभ और अंत से whitespace हटाया हुआ होना चाहिए।`;

/** MinLengthError को हिंदी में format करता है। */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की लंबाई न्यूनतम ${error.min} होनी चाहिए।`;

/** MaxLengthError को हिंदी में format करता है। */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की लंबाई अधिकतम ${error.max} हो सकती है।`;

/** LengthError को हिंदी में format करता है। */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} की आवश्यक लंबाई ${error.exact} होनी चाहिए।`;

/** RegexError को हिंदी में format करता है। */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} से मेल नहीं खाता।`;

/** Base64UrlError को हिंदी में format करता है। */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Base64Url string नहीं है।`;

/** NameError को हिंदी में format करता है। */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Name नहीं है।`;

/** MnemonicError को हिंदी में format करता है। */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य अंग्रेज़ी BIP39 mnemonic नहीं है।`;

/** IdError को हिंदी में format करता है। */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} मान्य Id नहीं है।`;

/** TableIdError को हिंदी में format करता है। */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} table ${error.table} के लिए मान्य Id नहीं है।`;

/** NonNegativeError को हिंदी में format करता है। */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ऋणात्मक नहीं होना चाहिए (>= 0)।`;

/** NonNegativeDecimalStringError को हिंदी में format करता है। */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} non-negative decimal string होना चाहिए।`;

/** PositiveError को हिंदी में format करता है। */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} धनात्मक होना चाहिए (> 0)।`;

/** PositiveDecimalStringError को हिंदी में format करता है। */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} positive decimal string होना चाहिए।`;

/** NonPositiveError को हिंदी में format करता है। */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} धनात्मक नहीं होना चाहिए (<= 0)।`;

/** NonPositiveDecimalStringError को हिंदी में format करता है। */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} non-positive decimal string होना चाहिए।`;

/** NegativeError को हिंदी में format करता है। */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ऋणात्मक होना चाहिए (< 0)।`;

/** NegativeDecimalStringError को हिंदी में format करता है। */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} negative decimal string होना चाहिए।`;

/** IntError को हिंदी में format करता है। */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} safe integer होना चाहिए।`;

/** GreaterThanError को हिंदी में format करता है। */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.min} से बड़ा होना चाहिए।`;

/** GreaterThanOrEqualToError को हिंदी में format करता है। */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.min} से बड़ा या उसके बराबर होना चाहिए।`;

/** LessThanError को हिंदी में format करता है। */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.max} से छोटा होना चाहिए।`;

/** LessThanOrEqualToError को हिंदी में format करता है। */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.max} से छोटा या उसके बराबर होना चाहिए।`;

/** NonNaNError को हिंदी में format करता है। */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "मान NaN नहीं होना चाहिए।";

/** FiniteError को हिंदी में format करता है। */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} परिमित होना चाहिए।`;

/** MultipleOfError को हिंदी में format करता है। */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.divisor} का गुणज होना चाहिए।`;

/** BetweenError को हिंदी में format करता है। */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} ${error.min} और ${error.max} के बीच, दोनों सीमाओं सहित, होना चाहिए।`;

/** ArrayError को हिंदी में format करता है। */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} array नहीं है।`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} पर array element मौजूद नहीं है।`;
    case "Accessor":
      return `index ${issue.index} पर array element data property होना चाहिए।`;
    case "ExcessProperty":
      return "अतिरिक्त Array property की अनुमति नहीं है। उसे हटाएँ या कोई अलग Type उपयोग करें।";
    case "Element":
      return `index ${issue.index} पर array element अमान्य है।`;
  }
};

/** SetError को हिंदी में format करता है। */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} Set नहीं है।`;
  }
  if (error.reason.kind === "UnexpectedPrototype") {
    return "मान Set subclass का instance है, लेकिन Set Output को सीधे Set का instance होना चाहिए।";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `अतिरिक्त Set property ${safelyStringifyUnknownValue(issue.key)} की अनुमति नहीं है।`;
    case "Element":
      return `index ${issue.index} पर Set element अमान्य है।`;
  }
};

/** TupleError को हिंदी में format करता है। */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} tuple नहीं है।`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple में ठीक ${error.reason.expected} elements होने चाहिए, लेकिन मान में ${error.reason.actual} हैं।`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} पर Tuple element मौजूद नहीं है।`;
    case "Accessor":
      return `index ${issue.index} पर Tuple element data property होना चाहिए।`;
    case "ExcessProperty":
      return "अतिरिक्त Tuple property की अनुमति नहीं है। उसे हटाएँ या कोई अलग Type उपयोग करें।";
    case "Element":
      return `index ${issue.index} पर Tuple element अमान्य है।`;
  }
};

/** RecordError को हिंदी में format करता है। */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `मान ${safelyStringifyUnknownValue(error.reason.value)} Record नहीं है।`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "मान एक object है, लेकिन Record Output को plain object होना चाहिए या उसका prototype null होना चाहिए।";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} अमान्य है।`;
    case "Value":
      return `Property ${safelyStringifyUnknownValue(issue.key)} का मान अमान्य है।`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} data property होनी चाहिए।`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable होनी चाहिए।`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} और ${safelyStringifyUnknownValue(issue.key)} decode होकर एक ही key ${safelyStringifyUnknownValue(issue.outputKey)} बनती हैं।`;
  }
};

/** ObjectError को हिंदी में format करता है। */
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
        return "Object property data property होनी चाहिए। इस Type का उपयोग करने से पहले accessor values को plain data में materialize करें या कोई अलग Type उपयोग करें।";
      case "NonEnumerable":
        return "Object property enumerable होनी चाहिए। उसे enumerable बनाएँ या कोई अलग Type उपयोग करें।";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `आवश्यक property ${safelyStringifyUnknownValue(key)} मौजूद नहीं है।`;
  }
  if (typeof key === "symbol") {
    return "Object property key string होनी चाहिए। symbol property हटाएँ या कोई अलग Type उपयोग करें।";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Property ${safelyStringifyUnknownValue(key)} की अनुमति नहीं है। उसे हटाएँ या कोई अलग Type उपयोग करें।`;
  }
  return `Property ${safelyStringifyUnknownValue(key)} अमान्य है।`;
};

/** DiscriminatedUnionError को हिंदी में format करता है। */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} data property होनी चाहिए।`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} own property होनी चाहिए।`;
      }
      return `${property} enumerable होनी चाहिए।`;
    }
    case "Discriminator":
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)} का मान ${safelyStringifyUnknownValue(error.reason.value)} अपेक्षित नहीं है।`;
    case "Member":
      return `चुना गया variant ${safelyStringifyUnknownValue(error.reason.discriminator)} अमान्य है।`;
  }
};

/** JsonValueError को हिंदी में format करता है। */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `मान ${safelyStringifyUnknownValue(issue.value)} JSON value नहीं है।`;
    case "NonFiniteNumber":
      return "JSON number परिमित होना चाहिए।";
    case "UnexpectedPrototype":
      return "मान एक object है, लेकिन JsonValue object को plain object होना चाहिए या उसका prototype null होना चाहिए।";
    case "Accessor":
      return "JSON property data property होनी चाहिए। इस Type का उपयोग करने से पहले accessor values को plain data में materialize करें या कोई अलग Type उपयोग करें।";
    case "NonEnumerable":
      return "JSON object property enumerable होनी चाहिए। उसे हटाएँ या कोई अलग Type उपयोग करें।";
    case "SymbolProperty":
      return "JSON object property key string होनी चाहिए। symbol property हटाएँ या कोई अलग Type उपयोग करें।";
    case "Hole":
      return "JSON array element मौजूद नहीं है।";
    case "ExcessProperty":
      return "अतिरिक्त JSON array property की अनुमति नहीं है। उसे हटाएँ या कोई अलग Type उपयोग करें।";
    case "CircularReference":
      return "JsonValue में circular references नहीं होने चाहिए।";
  }
};

/** JsonError को हिंदी में format करता है। */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `मान ${safelyStringifyUnknownValue(error.value)} को JsonValue में parse नहीं किया जा सकता।`;
