/**
 * తెలుగు Evolu Type దోష ఫార్మాటర్లు.
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

  return `విలువ ${safelyStringifyUnknownValue(error.value)} ${typeOf} కాదు.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `విలువ ${safelyStringifyUnknownValue(reason.value)} ఆబ్జెక్ట్ కాదు.`
    : "విలువ ఒక ఆబ్జెక్ట్, కానీ Object Output సాదా ఆబ్జెక్ట్ అయి ఉండాలి లేదా దాని prototype null అయి ఉండాలి.";

/** NeverErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} Never రకానికి చెల్లదు.`;

/** String TypeOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} టెంప్లేట్ లిటరల్‌తో సరిపోలదు.`;

/** Number TypeOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `విలువ ${safelyStringifyUnknownValue(error.value)} Evolu Type కాదు.`;

/** ObjectTagErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} లో ఆశించిన object tag ${safelyStringifyUnknownValue(error.expected)} లేదు.`;

/** InstanceOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ${error.constructorName} యొక్క instance కాదు.`;

/** LiteralErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ఆశించిన literal కు కచ్చితంగా సమానం కాదు: ${globalThis.String(error.expected)}.`;

/** UnionErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "విలువ అనుమతించిన ఏ variant తోనూ సరిపోలదు.";

/** DateIsoErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ప్రామాణిక ISO date-time string కాదు.`;

/** DateIsoFromDateErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date ను DateIso గా సూచించలేము.";

/** DecimalStringErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ప్రామాణిక decimal string అయి ఉండాలి.`;

/** Int64Errorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే signed 64-bit integer (Int64) కాదు.`;

/** UInt64Errorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే unsigned 64-bit integer (UInt64) కాదు.`;

/** Int64StringErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Int64 string కాదు.`;

/** CapitalizedErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పెద్ద అక్షరంతో ప్రారంభం కావాలి.`;

/** TrimmedErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} లో ప్రారంభం లేదా చివర ఖాళీలు ఉండకూడదు.`;

/** MinLengthErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} కనీస పొడవు ${error.min} ను చేరలేదు.`;

/** MaxLengthErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} గరిష్ఠ పొడవు ${error.max} ను మించింది.`;

/** LengthErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} అవసరమైన పొడవు ${error.exact} కలిగి లేదు.`;

/** RegexErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} తో సరిపోలదు.`;

/** Base64UrlErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Base64Url string కాదు.`;

/** NameErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Name కాదు.`;

/** MnemonicErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే ఆంగ్ల BIP39 mnemonic కాదు.`;

/** IdErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Id కాదు.`;

/** TableIdErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పట్టిక ${error.table} కు చెల్లుబాటు అయ్యే Id కాదు.`;

/** NonNegativeErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మకం కాకూడదు (>= 0).`;

/** NonNegativeDecimalStringErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మకం కాని decimal string అయి ఉండాలి.`;

/** PositiveErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మకంగా ఉండాలి (> 0).`;

/** PositiveDecimalStringErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మక decimal string అయి ఉండాలి.`;

/** NonPositiveErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మకం కాకూడదు (<= 0).`;

/** NonPositiveDecimalStringErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మకం కాని decimal string అయి ఉండాలి.`;

/** NegativeErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మకంగా ఉండాలి (< 0).`;

/** NegativeDecimalStringErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మక decimal string అయి ఉండాలి.`;

/** IntErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} సురక్షితమైన integer అయి ఉండాలి.`;

/** GreaterThanErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.min} కంటే ఎక్కువగా ఉండాలి.`;

/** GreaterThanOrEqualToErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.min} కంటే ఎక్కువగా లేదా సమానంగా ఉండాలి.`;

/** LessThanErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.max} కంటే తక్కువగా ఉండాలి.`;

/** LessThanOrEqualToErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.max} కంటే తక్కువగా లేదా సమానంగా ఉండాలి.`;

/** NonNaNErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "విలువ NaN కాకూడదు.";

/** FiniteErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పరిమితంగా ఉండాలి.`;

/** MultipleOfErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.divisor} యొక్క గుణిజం అయి ఉండాలి.`;

/** BetweenErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ${error.min} మరియు ${error.max} మధ్య, సరిహద్దులతో సహా, ఉండాలి.`;

/** ArrayErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `విలువ ${safelyStringifyUnknownValue(error.reason.value)} array కాదు.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `సూచిక ${issue.index} వద్ద array element లేదు.`;
    case "Accessor":
      return `సూచిక ${issue.index} వద్ద array element data property అయి ఉండాలి.`;
    case "ExcessProperty":
      return "అదనపు Array property అనుమతించబడదు. దాన్ని తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "Element":
      return `సూచిక ${issue.index} వద్ద array element చెల్లదు.`;
  }
};

/** SetErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `విలువ ${safelyStringifyUnknownValue(error.reason.value)} Set కాదు.`;
  }
  if (error.reason.kind === "UnexpectedPrototype") {
    return "విలువ Set subclass యొక్క instance, కానీ Set Output నేరుగా Set instance అయి ఉండాలి.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `అదనపు Set property ${safelyStringifyUnknownValue(issue.key)} అనుమతించబడదు.`;
    case "Element":
      return `సూచిక ${issue.index} వద్ద Set element చెల్లదు.`;
  }
};

/** TupleErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `విలువ ${safelyStringifyUnknownValue(error.reason.value)} tuple కాదు.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple లో కచ్చితంగా ${error.reason.expected} elements ఉండాలి, కానీ విలువలో ${error.reason.actual} ఉన్నాయి.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `సూచిక ${issue.index} వద్ద Tuple element లేదు.`;
    case "Accessor":
      return `సూచిక ${issue.index} వద్ద Tuple element data property అయి ఉండాలి.`;
    case "ExcessProperty":
      return "అదనపు Tuple property అనుమతించబడదు. దాన్ని తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "Element":
      return `సూచిక ${issue.index} వద్ద Tuple element చెల్లదు.`;
  }
};

/** RecordErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `విలువ ${safelyStringifyUnknownValue(error.reason.value)} Record కాదు.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "విలువ ఒక ఆబ్జెక్ట్, కానీ Record Output సాదా ఆబ్జెక్ట్ అయి ఉండాలి లేదా దాని prototype null అయి ఉండాలి.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} చెల్లదు.`;
    case "Value":
      return `property ${safelyStringifyUnknownValue(issue.key)} యొక్క విలువ చెల్లదు.`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} data property అయి ఉండాలి.`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable అయి ఉండాలి.`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} మరియు ${safelyStringifyUnknownValue(issue.key)} ఒకే key ${safelyStringifyUnknownValue(issue.outputKey)} కు decode అవుతాయి.`;
  }
};

/** ObjectErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
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
        return "Object property data property అయి ఉండాలి. ఈ Type ను ఉపయోగించే ముందు accessor values ను సాదా data గా మార్చండి లేదా వేరే Type ను ఉపయోగించండి.";
      case "NonEnumerable":
        return "Object property enumerable అయి ఉండాలి. దానిని enumerable గా చేయండి లేదా వేరే Type ను ఉపయోగించండి.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `అవసరమైన property ${safelyStringifyUnknownValue(key)} లేదు.`;
  }
  if (typeof key === "symbol") {
    return "Object property key తప్పనిసరిగా string అయి ఉండాలి. symbol property ను తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `property ${safelyStringifyUnknownValue(key)} అనుమతించబడదు. దాన్ని తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.`;
  }
  return `property ${safelyStringifyUnknownValue(key)} చెల్లదు.`;
};

/** DiscriminatedUnionErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} data property అయి ఉండాలి.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} స్వంత property అయి ఉండాలి.`;
      }
      return `${property} enumerable అయి ఉండాలి.`;
    }
    case "Discriminator":
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} has an unexpected value ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `ఎంచుకున్న variant ${safelyStringifyUnknownValue(error.reason.discriminator)} చెల్లదు.`;
  }
};

/** JsonValueErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `విలువ ${safelyStringifyUnknownValue(issue.value)} JSON value కాదు.`;
    case "NonFiniteNumber":
      return "JSON number పరిమితంగా ఉండాలి.";
    case "UnexpectedPrototype":
      return "విలువ ఒక ఆబ్జెక్ట్, కానీ JsonValue object సాదా ఆబ్జెక్ట్ అయి ఉండాలి లేదా దాని prototype null అయి ఉండాలి.";
    case "Accessor":
      return "JSON property data property అయి ఉండాలి. ఈ Type ను ఉపయోగించే ముందు accessor values ను సాదా data గా మార్చండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "NonEnumerable":
      return "JSON object property enumerable అయి ఉండాలి. దాన్ని తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "SymbolProperty":
      return "JSON object property key తప్పనిసరిగా string అయి ఉండాలి. symbol property ను తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "Hole":
      return "JSON array element లేదు.";
    case "ExcessProperty":
      return "అదనపు JSON array property అనుమతించబడదు. దాన్ని తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "CircularReference":
      return "JsonValue లో వృత్తాకార references ఉండకూడదు.";
  }
};

/** JsonErrorను తెలుగులో ఫార్మాట్ చేస్తుంది. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ను JsonValue గా parse చేయలేము.`;
