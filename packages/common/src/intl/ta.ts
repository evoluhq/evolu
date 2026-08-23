/**
 * தமிழ் Evolu Type பிழை வடிவமைப்பாளர்கள்.
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

  return `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு ${typeOf} அல்ல.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `மதிப்பு ${safelyStringifyUnknownValue(reason.value)} ஒரு object அல்ல.`
    : "மதிப்பு ஒரு object ஆக உள்ளது, ஆனால் Object Output ஒரு plain object ஆகவோ null prototype உடையதாகவோ இருக்க வேண்டும்.";

/** NeverError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} Never type-க்கு செல்லுபடியாகாது.`;

/** String TypeOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} template literal-உடன் பொருந்தவில்லை.`;

/** Number TypeOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு Evolu Type அல்ல.`;

/** ObjectTagError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்பார்க்கப்பட்ட object tag ${safelyStringifyUnknownValue(error.expected)}-ஐக் கொண்டிருக்கவில்லை.`;

/** InstanceOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.constructorName}-இன் instance அல்ல.`;

/** LiteralError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்பார்க்கப்பட்ட literal-க்கு முற்றிலும் சமமாக இல்லை: ${globalThis.String(error.expected)}.`;

/** UnionError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "மதிப்பு அனுமதிக்கப்பட்ட எந்த variant-உடனும் பொருந்தவில்லை.";

/** DateIsoError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு canonical ISO date-time string அல்ல.`;

/** DateIsoFromDateError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-ஐ DateIso ஆகக் குறிக்க முடியாது.";

/** DecimalStringError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு canonical decimal string ஆக இருக்க வேண்டும்.`;

/** Int64Error-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் signed 64-bit integer (Int64) அல்ல.`;

/** UInt64Error-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் unsigned 64-bit integer (UInt64) அல்ல.`;

/** Int64StringError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Int64 string அல்ல.`;

/** CapitalizedError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} capitalized ஆக இருக்க வேண்டும்.`;

/** TrimmedError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} trim செய்யப்பட்டதாக இருக்க வேண்டும்.`;

/** MinLengthError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} குறைந்தபட்ச நீளமான ${error.min}-ஐப் பூர்த்தி செய்யவில்லை.`;

/** MaxLengthError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} அதிகபட்ச நீளமான ${error.max}-ஐ மீறுகிறது.`;

/** LengthError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} தேவையான நீளமான ${error.exact}-ஐக் கொண்டிருக்கவில்லை.`;

/** RegexError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags}-உடன் பொருந்தவில்லை.`;

/** Base64UrlError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Base64Url string அல்ல.`;

/** NameError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Name அல்ல.`;

/** MnemonicError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் ஆங்கில BIP39 mnemonic அல்ல.`;

/** IdError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} செல்லுபடியாகும் Id அல்ல.`;

/** TableIdError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} table ${error.table}-க்கான செல்லுபடியாகும் Id அல்ல.`;

/** NonNegativeError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்மறையற்றதாக இருக்க வேண்டும் (>= 0).`;

/** NonNegativeDecimalStringError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு எதிர்மறையற்ற decimal string ஆக இருக்க வேண்டும்.`;

/** PositiveError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} நேர்மறையாக இருக்க வேண்டும் (> 0).`;

/** PositiveDecimalStringError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு நேர்மறை decimal string ஆக இருக்க வேண்டும்.`;

/** NonPositiveError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} நேர்மறையற்றதாக இருக்க வேண்டும் (<= 0).`;

/** NonPositiveDecimalStringError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு நேர்மறையற்ற decimal string ஆக இருக்க வேண்டும்.`;

/** NegativeError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} எதிர்மறையாக இருக்க வேண்டும் (< 0).`;

/** NegativeDecimalStringError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு எதிர்மறை decimal string ஆக இருக்க வேண்டும்.`;

/** IntError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ஒரு பாதுகாப்பான integer ஆக இருக்க வேண்டும்.`;

/** GreaterThanError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ${error.min}-ஐ விட அதிகமாக இருக்க வேண்டும்.`;

/** GreaterThanOrEqualToError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ${error.min}-ஐ விட அதிகமாகவோ அல்லது சமமாகவோ இருக்க வேண்டும்.`;

/** LessThanError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ${error.max}-ஐ விடக் குறைவாக இருக்க வேண்டும்.`;

/** LessThanOrEqualToError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} ${error.max}-ஐ விடக் குறைவாகவோ அல்லது சமமாகவோ இருக்க வேண்டும்.`;

/** NonNaNError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "மதிப்பு NaN ஆக இருக்கக் கூடாது.";

/** FiniteError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} முடிவுறுவதாக இருக்க வேண்டும்.`;

/** MultipleOfError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.divisor}-இன் மடங்காக இருக்க வேண்டும்.`;

/** BetweenError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)} என்பது ${error.min} மற்றும் ${error.max}-க்கு இடையில், இரு எல்லைகளையும் உள்ளடக்கியதாக இருக்க வேண்டும்.`;

/** ArrayError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு array அல்ல.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-இல் உள்ள array element காணப்படவில்லை.`;
    case "Accessor":
      return `index ${issue.index}-இல் உள்ள array element ஒரு data property ஆக இருக்க வேண்டும்.`;
    case "ExcessProperty":
      return "கூடுதலான Array property அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "Element":
      return `index ${issue.index}-இல் உள்ள array element செல்லுபடியாகாது.`;
  }
};

/** SetError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு Set அல்ல.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `கூடுதலான Set property ${safelyStringifyUnknownValue(issue.key)} அனுமதிக்கப்படாது.`;
    case "Element":
      return `index ${issue.index}-இல் உள்ள Set element செல்லுபடியாகாது.`;
  }
};

/** MapError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு Map அல்ல.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `கூடுதலான Map property ${safelyStringifyUnknownValue(issue.key)} அனுமதிக்கப்படாது.`;
    case "Key":
    case "Value":
      return `index ${issue.index}-இல் உள்ள Map element செல்லுபடியாகாது.`;
    case "Collision":
      return `Map key-கள் ${safelyStringifyUnknownValue(issue.previousKey)} மற்றும் ${safelyStringifyUnknownValue(issue.key)} ஒரே key ${safelyStringifyUnknownValue(issue.outputKey)}-ஆக decode ஆகின்றன.`;
  }
};

/** TupleError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு tuple அல்ல.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple-ல் துல்லியமாக ${error.reason.expected} element-கள் இருக்க வேண்டும், ஆனால் மதிப்பில் ${error.reason.actual} உள்ளன.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-இல் உள்ள Tuple element காணப்படவில்லை.`;
    case "Accessor":
      return `index ${issue.index}-இல் உள்ள Tuple element ஒரு data property ஆக இருக்க வேண்டும்.`;
    case "ExcessProperty":
      return "கூடுதலான Tuple property அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "Element":
      return `index ${issue.index}-இல் உள்ள Tuple element செல்லுபடியாகாது.`;
  }
};

/** RecordError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)} ஒரு Record அல்ல.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "மதிப்பு ஒரு object ஆக உள்ளது, ஆனால் Record Output ஒரு plain object ஆகவோ null prototype உடையதாகவோ இருக்க வேண்டும்.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `property key ${safelyStringifyUnknownValue(issue.key)} செல்லுபடியாகாது.`;
    case "Value":
      return `property ${safelyStringifyUnknownValue(issue.key)}-இன் மதிப்பு செல்லுபடியாகாது.`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ஒரு data property ஆக இருக்க வேண்டும்.`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable ஆக இருக்க வேண்டும்.`;
    case "Collision":
      return `Record key-கள் ${safelyStringifyUnknownValue(issue.previousKey)} மற்றும் ${safelyStringifyUnknownValue(issue.key)} ஒரே key ${safelyStringifyUnknownValue(issue.outputKey)}-ஆக decode ஆகின்றன.`;
  }
};

/** ObjectError-ஐ தமிழில் வடிவமைக்கிறது. */
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
        return "Object property ஒரு data property ஆக இருக்க வேண்டும். இந்த Type-ஐப் பயன்படுத்தும் முன் accessor மதிப்புகளை எளிய data-ஆக மாற்றவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
      case "NonEnumerable":
        return "Object property enumerable ஆக இருக்க வேண்டும். அதை enumerable ஆக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `தேவையான property ${safelyStringifyUnknownValue(key)} காணப்படவில்லை.`;
  }
  if (typeof key === "symbol") {
    return "Object property key ஒரு string ஆக இருக்க வேண்டும். symbol property-ஐ நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `property ${safelyStringifyUnknownValue(key)} அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.`;
  }
  return `property ${safelyStringifyUnknownValue(key)} செல்லுபடியாகாது.`;
};

/** DiscriminatedUnionError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ஒரு data property ஆக இருக்க வேண்டும்.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} அதற்கே உரிய property ஆக இருக்க வேண்டும்.`;
      }
      return `${property} enumerable ஆக இருக்க வேண்டும்.`;
    }
    case "Discriminator":
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} எதிர்பாராத மதிப்பு ${safelyStringifyUnknownValue(error.reason.value)}-ஐக் கொண்டுள்ளது.`;
    case "Member":
      return `தேர்ந்தெடுக்கப்பட்ட variant ${safelyStringifyUnknownValue(error.reason.discriminator)} செல்லுபடியாகாது.`;
  }
};

/** JsonValueError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `மதிப்பு ${safelyStringifyUnknownValue(issue.value)} ஒரு JSON value அல்ல.`;
    case "NonFiniteNumber":
      return "JSON number முடிவுறுவதாக இருக்க வேண்டும்.";
    case "UnexpectedPrototype":
      return "மதிப்பு ஒரு object ஆக உள்ளது, ஆனால் JsonValue object ஒரு plain object ஆகவோ null prototype உடையதாகவோ இருக்க வேண்டும்.";
    case "Accessor":
      return "JSON property ஒரு data property ஆக இருக்க வேண்டும். இந்த Type-ஐப் பயன்படுத்தும் முன் accessor மதிப்புகளை எளிய data-ஆக மாற்றவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "NonEnumerable":
      return "JSON object property enumerable ஆக இருக்க வேண்டும். அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "SymbolProperty":
      return "JSON object property key ஒரு string ஆக இருக்க வேண்டும். symbol property-ஐ நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "Hole":
      return "JSON array element காணப்படவில்லை.";
    case "ExcessProperty":
      return "கூடுதலான JSON array property அனுமதிக்கப்படாது. அதை நீக்கவும் அல்லது வேறு Type-ஐப் பயன்படுத்தவும்.";
    case "CircularReference":
      return "JsonValue-ல் சுழற்சிக் குறிப்புகள் இருக்கக் கூடாது.";
  }
};

/** JsonError-ஐ தமிழில் வடிவமைக்கிறது. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `மதிப்பு ${safelyStringifyUnknownValue(error.value)}-ஐ JsonValue-ஆக parse செய்ய முடியாது.`;
