/**
 * Telugu Evolu Type error formatters.
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

  return `విలువ ${safelyStringifyUnknownValue(error.value)} ${typeOf} కాదు.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `విలువ ${safelyStringifyUnknownValue(reason.value)} ఆబ్జెక్ట్ కాదు.`
    : "విలువ ఒక ఆబ్జెక్ట్, కానీ Object Output సాదా ఆబ్జెక్ట్ అయి ఉండాలి లేదా దాని prototype null అయి ఉండాలి.";

/** Formats a NeverError in Telugu. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} Never రకానికి చెల్లదు.`;

/** Formats a String TypeOfError in Telugu. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Telugu. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} టెంప్లేట్ లిటరల్‌తో సరిపోలదు.`;

/** Formats a Number TypeOfError in Telugu. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Telugu. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Telugu. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Telugu. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} boolean కాదు. true లేదా false ఉపయోగించండి.`;

/** Formats a Symbol TypeOfError in Telugu. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Telugu. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Telugu. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `విలువ ${safelyStringifyUnknownValue(error.value)} Evolu Type కాదు.`;

/** Formats an ObjectTagError in Telugu. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} లో ఆశించిన object tag ${safelyStringifyUnknownValue(error.expected)} లేదు.`;

/** Formats a ValidDateError in Telugu. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date చెల్లదు.";

/** Formats an InstanceOfError in Telugu. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ${error.constructorName} యొక్క instance కాదు.`;

/** Formats a LiteralError in Telugu. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ఆశించిన లిటరల్‌కు కచ్చితంగా సమానం కాదు: ${String(error.expected)}.`;

/** Formats a UnionError in Telugu. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "విలువ అనుమతించిన ఏ variant తోనూ సరిపోలదు.";

/** Formats a DateIsoError in Telugu. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string కాదు.`;

/** Formats a PlainDateIsoError in Telugu. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} YYYY-MM-DD ఆకృతిలో చెల్లుబాటు అయ్యే క్యాలెండర్ తేదీ కాదు.`;

/** Formats a DateIsoFromDateError in Telugu. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date ను DateIso గా సూచించలేము.";

/** Formats a DateIsoFromRfc3339Error in Telugu. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} మద్దతు ఉన్న RFC 3339 date-time కాదు. "2024-01-01T12:00:00Z" వంటి విలువను ఉపయోగించండి.`;

/** Formats a DecimalStringError in Telugu. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} canonical decimal string అయి ఉండాలి.`;

/** Formats an Int64Error in Telugu. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే signed 64-bit integer (Int64) కాదు.`;

/** Formats a UInt64Error in Telugu. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే unsigned 64-bit integer (UInt64) కాదు.`;

/** Formats an Int64StringError in Telugu. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Int64 string కాదు.`;

/** Formats an IdentifierError in Telugu. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ${error.casing} ఐడెంటిఫయర్ కాదు.`;

/** Formats a CapitalizedError in Telugu. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పెద్ద అక్షరంతో ప్రారంభం కావాలి.`;

/** Formats an UncapitalizedError in Telugu. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పెద్ద అక్షరంతో ప్రారంభం కాకూడదు.`;

/** Formats an UppercasedError in Telugu. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పెద్ద అక్షరాలలో ఉండాలి.`;

/** Formats a LowercasedError in Telugu. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చిన్న అక్షరాలలో ఉండాలి.`;

/** Formats a TrimmedError in Telugu. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} లో ప్రారంభం లేదా చివర ఖాళీలు ఉండకూడదు.`;

/** Formats a WellFormedError in Telugu. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} well-formed Unicode టెక్స్ట్ అయి ఉండాలి.`;

/** Formats a NormalizedError in Telugu. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా Unicode నార్మలైజేషన్ ఫారమ్ ${error.form} లో ఉండాలి.`;

/** Formats a StartsWithError in Telugu. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${safelyStringifyUnknownValue(error.prefix)} తో ప్రారంభం కావాలి.`;

/** Formats an EndsWithError in Telugu. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${safelyStringifyUnknownValue(error.suffix)} తో ముగియాలి.`;

/** Formats a MinLengthError in Telugu. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} కనీస పొడవు ${error.min} ను చేరలేదు.`;

/** Formats a MaxLengthError in Telugu. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} గరిష్ఠ పొడవు ${error.max} ను మించింది.`;

/** Formats a LengthError in Telugu. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} అవసరమైన పొడవు ${error.exact} కలిగి లేదు.`;

/** Formats a RegexError in Telugu. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} తో సరిపోలదు.`;

/** Formats a Base64UrlError in Telugu. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Base64Url string కాదు.`;

/** Formats a Base64Error in Telugu. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Base64 string కాదు.`;

/** Formats a HexError in Telugu. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చిన్న అక్షరాలలోని, సరి సంఖ్యలో అంకెలు ఉన్న hexadecimal string కాదు.`;

/** Formats a NameError in Telugu. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Name కాదు.`;

/** Formats an EmailError in Telugu. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే ఇమెయిల్ చిరునామా కాదు.`;

/** Formats a HostnameError in Telugu. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చిన్న అక్షరాలలోని చెల్లుబాటు అయ్యే హోస్ట్ పేరు కాదు.`;

/** Formats an Ipv4AddressError in Telugu. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే IPv4 చిరునామా కాదు.`;

/** Formats an Ipv6AddressError in Telugu. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} canonical IPv6 చిరునామా కాదు.`;

/** Formats an Ipv6AddressFromStringError in Telugu. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే IPv6 చిరునామా కాదు.`;

/** Formats a PhoneNumberE164Error in Telugu. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} E.164 ఆకృతిలో ఉన్న ఫోన్ నంబర్ కాదు.`;

/** Formats an IbanError in Telugu. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పెద్ద అక్షరాలలోని, ఖాళీలు లేని చెల్లుబాటు అయ్యే IBAN కాదు.`;

/** Formats a MnemonicError in Telugu. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే ఆంగ్ల BIP39 mnemonic కాదు.`;

/** Formats an IdError in Telugu. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చెల్లుబాటు అయ్యే Id కాదు.`;

/** Formats a TableIdError in Telugu. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పట్టిక ${error.table} కు చెల్లుబాటు అయ్యే Id కాదు.`;

/** Formats a UuidError in Telugu. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} చిన్న అక్షరాలలోని canonical UUID కాదు.`;

/** Formats a UuidVersionError in Telugu. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} సంస్కరణ ${error.version} UUID కాదు.`;

/** Formats a NonNegativeError in Telugu. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మకం కాకూడదు (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Telugu. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మకం కాని decimal string అయి ఉండాలి.`;

/** Formats a PositiveError in Telugu. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మకంగా ఉండాలి (> 0).`;

/** Formats a PositiveDecimalStringError in Telugu. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మక decimal string అయి ఉండాలి.`;

/** Formats a NonPositiveError in Telugu. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మకం కాకూడదు (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Telugu. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ధనాత్మకం కాని decimal string అయి ఉండాలి.`;

/** Formats a NegativeError in Telugu. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మకంగా ఉండాలి (< 0).`;

/** Formats a NegativeDecimalStringError in Telugu. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} రుణాత్మక decimal string అయి ఉండాలి.`;

/** Formats an IntError in Telugu. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} సురక్షితమైన integer అయి ఉండాలి.`;

/** Formats an IntFromStringError in Telugu. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} దశాంశ పూర్ణాంకం కాదు.`;

/** Formats a FiniteNumberFromStringError in Telugu. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} దశాంశ సంఖ్య కాదు.`;

/** Formats a GreaterThanError in Telugu. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.min} కంటే ఎక్కువగా ఉండాలి.`;

/** Formats a GreaterThanOrEqualToError in Telugu. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.min} కంటే ఎక్కువగా లేదా సమానంగా ఉండాలి.`;

/** Formats a LessThanError in Telugu. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.max} కంటే తక్కువగా ఉండాలి.`;

/** Formats a LessThanOrEqualToError in Telugu. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.max} కంటే తక్కువగా లేదా సమానంగా ఉండాలి.`;

/** Formats a NonNaNError in Telugu. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "విలువ NaN కాకూడదు.";

/** Formats a FiniteError in Telugu. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} పరిమితంగా ఉండాలి.`;

/** Formats a MultipleOfError in Telugu. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.divisor} యొక్క గుణిజం అయి ఉండాలి.`;

/** Formats a BetweenError in Telugu. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} తప్పనిసరిగా ${error.min} మరియు ${error.max} మధ్య, సరిహద్దులతో సహా, ఉండాలి.`;

/** Formats an ArrayError in Telugu. */
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

/** Formats a NonEmptyArrayError in Telugu. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} లో కనీసం ఒక అంశం ఉండాలి.`;

/** Formats a UniqueError in Telugu. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} లో సూచికలు ${error.previousIndex} మరియు ${error.index} వద్ద సమానమైన అంశాలు ఉన్నాయి.`;

/** Formats a SetError in Telugu. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `విలువ ${safelyStringifyUnknownValue(error.reason.value)} Set కాదు.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `అదనపు Set property ${safelyStringifyUnknownValue(issue.key)} అనుమతించబడదు.`;
    case "Element":
      return `సూచిక ${issue.index} వద్ద Set element చెల్లదు.`;
  }
};

/** Formats a MapError in Telugu. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `విలువ ${safelyStringifyUnknownValue(error.reason.value)} Map కాదు.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `అదనపు Map property ${safelyStringifyUnknownValue(issue.key)} అనుమతించబడదు.`;
    case "Key":
      return `సూచిక ${issue.index} వద్ద Map key చెల్లదు.`;
    case "Value":
      return `సూచిక ${issue.index} వద్ద Map విలువ చెల్లదు.`;
    case "Collision":
      return `సూచికలు ${issue.previousIndex} మరియు ${issue.index} వద్ద ఉన్న Map keys ఒకే key ${safelyStringifyUnknownValue(issue.outputKey)} కు decode అవుతాయి.`;
  }
};

/** Formats a TupleError in Telugu. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `విలువ ${safelyStringifyUnknownValue(error.reason.value)} tuple కాదు.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple యొక్క పొడవు ${error.reason.expected} ఉండాలి, కానీ విలువ యొక్క పొడవు ${error.reason.actual} ఉంది.`;
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

/** Formats a RecordError in Telugu. */
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

/** Formats a MinEntriesError in Telugu. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} కనీస ఎంట్రీల సంఖ్య ${error.min} ను చేరలేదు.`;

/** Formats a MaxEntriesError in Telugu. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} గరిష్ఠ ఎంట్రీల సంఖ్య ${error.max} ను మించింది.`;

/** Formats an ObjectError in Telugu. */
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
        return "Object property data property అయి ఉండాలి. ఈ Type ను ఉపయోగించే ముందు accessor విలువలను సాదా data గా మార్చండి లేదా వేరే Type ను ఉపయోగించండి.";
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

/** Formats a DiscriminatedUnionError in Telugu. */
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
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} కు ఊహించని విలువ ${safelyStringifyUnknownValue(error.reason.value)} ఉంది.`;
    case "Member":
      return `ఎంచుకున్న variant ${safelyStringifyUnknownValue(error.reason.discriminator)} చెల్లదు.`;
  }
};

/** Formats a DataError in Telugu. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `విలువ ${safelyStringifyUnknownValue(issue.value)} Data కాదు.`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} కు ఊహించని prototype ఉంది.`;
    case "Accessor":
      return "Data property data property అయి ఉండాలి. ఈ Type ను ఉపయోగించే ముందు accessor విలువలను సాదా data గా మార్చండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "NonEnumerable":
      return "Data Object property enumerable అయి ఉండాలి. దాన్ని తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "SymbolProperty":
      return "Data Object property key తప్పనిసరిగా string అయి ఉండాలి. symbol property ను తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.";
    case "Hole":
      return "Data Array element లేదు.";
    case "InvalidUint8Array":
      return "Data Uint8Array యొక్క ArrayBuffer detach అయి ఉండకూడదు, మరియు Uint8Array ఆ ArrayBuffer పరిధిలోనే ఉండాలి.";
    case "ExcessProperty":
      return `Data ${issue.container} లో అదనపు స్వంత properties ఉండకూడదు. ఆ property ను తొలగించండి లేదా వేరే Type ను ఉపయోగించండి.`;
  }
};

/** Formats a JsonValueError in Telugu. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `విలువ ${safelyStringifyUnknownValue(issue.value)} JSON విలువ కాదు.`;
    case "NonFiniteNumber":
      return "JSON number పరిమితంగా ఉండాలి.";
    case "UnexpectedPrototype":
      return "విలువ ఒక ఆబ్జెక్ట్, కానీ JsonValue ఆబ్జెక్ట్ సాదా ఆబ్జెక్ట్ అయి ఉండాలి లేదా దాని prototype null అయి ఉండాలి.";
    case "Accessor":
      return "JSON property data property అయి ఉండాలి. ఈ Type ను ఉపయోగించే ముందు accessor విలువలను సాదా data గా మార్చండి లేదా వేరే Type ను ఉపయోగించండి.";
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

/** Formats a JsonError in Telugu. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} ను JsonValue గా parse చేయలేము.`;

/** Formats a ByteSizeLiteralError in Telugu. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} బైట్ పరిమాణ లిటరల్ కాదు. "512KiB" లేదా "1MiB" వంటి విలువను ఉపయోగించండి.`;

/** Formats a ByteLengthError in Telugu. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "విలువ -0 బైట్ పొడవు కాదు. దానికి బదులుగా 0 ను ఉపయోగించండి.";

/** Formats a ByteLengthFromStringError in Telugu. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} బైట్ పొడవు కాదు. బైట్‌ల సంఖ్యను లేదా 10MiB వంటి లిటరల్‌ను ఉపయోగించండి.`;

/** Formats a DurationLiteralError in Telugu. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} వ్యవధి లిటరల్ కాదు. "500ms" లేదా "1.5s" వంటి విలువను ఉపయోగించండి.`;

/** Formats a PercentageLiteralError in Telugu. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `విలువ ${safelyStringifyUnknownValue(error.value)} శాతం లిటరల్ కాదు. "50%" లేదా "12.5%" వంటి విలువను ఉపయోగించండి.`;
