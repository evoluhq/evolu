/**
 * Filipino Evolu Type error formatters.
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

  return `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Ang halagang ${safelyStringifyUnknownValue(reason.value)} ay hindi object.`
    : "Object ang halaga, ngunit ang Object Output ay dapat plain object o may null prototype.";

/** Formats a NeverError in Filipino. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid para sa type Never.`;

/** Formats a String TypeOfError in Filipino. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Filipino. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi tumutugma sa template literal.`;

/** Formats a Number TypeOfError in Filipino. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Filipino. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Filipino. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Filipino. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi boolean. Gamitin ang true o false.`;

/** Formats a Symbol TypeOfError in Filipino. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Filipino. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Filipino. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi Evolu Type.`;

/** Formats an ObjectTagError in Filipino. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay walang inaasahang object tag na ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Filipino. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Hindi valid ang Date.";

/** Formats an InstanceOfError in Filipino. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi instance ng ${error.constructorName}.`;

/** Formats a LiteralError in Filipino. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi strictly equal sa inaasahang literal: ${String(error.expected)}.`;

/** Formats a UnionError in Filipino. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Ang halaga ay hindi tumutugma sa alinmang pinapayagang variant.";

/** Formats a DateIsoError in Filipino. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi canonical ISO date-time string.`;

/** Formats a PlainDateIsoError in Filipino. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na petsa ng kalendaryo sa format na YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Filipino. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Hindi maire-represent ang Date bilang DateIso.";

/** Formats a DateIsoFromRfc3339Error in Filipino. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi suportadong RFC 3339 date-time. Gumamit ng halagang tulad ng "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Filipino. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat canonical decimal string.`;

/** Formats an Int64Error in Filipino. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na signed 64-bit integer (Int64).`;

/** Formats a UInt64Error in Filipino. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na unsigned 64-bit integer (UInt64).`;

/** Formats an Int64StringError in Filipino. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Int64 string.`;

/** Formats an IdentifierError in Filipino. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi isang ${error.casing} identifier.`;

/** Formats a CapitalizedError in Filipino. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat naka-capitalize.`;

/** Formats an UncapitalizedError in Filipino. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi dapat magsimula sa malaking titik.`;

/** Formats an UppercasedError in Filipino. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat nakasulat sa malalaking titik.`;

/** Formats a LowercasedError in Filipino. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat nakasulat sa maliliit na titik.`;

/** Formats a TrimmedError in Filipino. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat naka-trim.`;

/** Formats a WellFormedError in Filipino. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat well-formed na Unicode text.`;

/** Formats a NormalizedError in Filipino. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat nasa Unicode normalization form na ${error.form}.`;

/** Formats a StartsWithError in Filipino. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat magsimula sa ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Filipino. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat magtapos sa ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats a MinLengthError in Filipino. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi umaabot sa minimum na haba na ${error.min}.`;

/** Formats a MaxLengthError in Filipino. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay lumalampas sa maximum na haba na ${error.max}.`;

/** Formats a LengthError in Filipino. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi tugma sa kinakailangang haba na ${error.exact}.`;

/** Formats a RegexError in Filipino. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi tumutugma sa /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Filipino. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Base64Url string.`;

/** Formats a Base64Error in Filipino. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Base64 string.`;

/** Formats a HexError in Filipino. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi hexadecimal na nasa maliliit na titik at may pares na bilang ng digit.`;

/** Formats a NameError in Filipino. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Name.`;

/** Formats an EmailError in Filipino. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na email address.`;

/** Formats a HostnameError in Filipino. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na hostname na nasa maliliit na titik.`;

/** Formats an Ipv4AddressError in Filipino. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na IPv4 address.`;

/** Formats an Ipv6AddressError in Filipino. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi canonical na IPv6 address.`;

/** Formats an Ipv6AddressFromStringError in Filipino. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na IPv6 address.`;

/** Formats a PhoneNumberE164Error in Filipino. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi numero ng telepono sa format na E.164.`;

/** Formats an IbanError in Filipino. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na IBAN na nasa malalaking titik at walang espasyo.`;

/** Formats a SimplePasswordError in Filipino. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Ang password ay dapat naka-trim.";
    case "TooLong":
      return "Ang password ay lumalampas sa maximum na haba na 64.";
    case "TooShort":
      return "Ang password ay hindi umaabot sa minimum na haba na 8.";
  }
};

/** Formats a MnemonicError in Filipino. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Ang halaga ay hindi valid na English BIP39 mnemonic.";

/** Formats an IdError in Filipino. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Id.`;

/** Formats a TableIdError in Filipino. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Id para sa table na ${error.table}.`;

/** Formats a UuidError in Filipino. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi canonical na UUID na nasa maliliit na titik.`;

/** Formats a UuidVersionError in Filipino. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi UUID na bersyon ${error.version}.`;

/** Formats a NonNegativeError in Filipino. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-negative (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Filipino. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-negative decimal string.`;

/** Formats a PositiveError in Filipino. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat positive (> 0).`;

/** Formats a PositiveDecimalStringError in Filipino. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat positive decimal string.`;

/** Formats a NonPositiveError in Filipino. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-positive (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Filipino. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-positive decimal string.`;

/** Formats a NegativeError in Filipino. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat negative (< 0).`;

/** Formats a NegativeDecimalStringError in Filipino. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat negative decimal string.`;

/** Formats an IntError in Filipino. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat safe integer.`;

/** Formats an IntFromStringError in Filipino. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi decimal integer.`;

/** Formats a FiniteNumberFromStringError in Filipino. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi decimal number.`;

/** Formats a GreaterThanError in Filipino. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas malaki sa ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Filipino. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas malaki sa o katumbas ng ${error.min}.`;

/** Formats a LessThanError in Filipino. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas maliit sa ${error.max}.`;

/** Formats a LessThanOrEqualToError in Filipino. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas maliit sa o katumbas ng ${error.max}.`;

/** Formats a NonNaNError in Filipino. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Ang halaga ay hindi dapat NaN.";

/** Formats a FiniteError in Filipino. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat finite.`;

/** Formats a MultipleOfError in Filipino. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat multiple ng ${error.divisor}.`;

/** Formats a BetweenError in Filipino. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat nasa pagitan ng ${error.min} at ${error.max}, kasama ang mga hangganan.`;

/** Formats an ArrayError in Filipino. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Ang halagang ${safelyStringifyUnknownValue(error.reason.value)} ay hindi array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Nawawala ang array element sa index na ${issue.index}.`;
    case "Accessor":
      return `Ang array element sa index na ${issue.index} ay dapat data property.`;
    case "ExcessProperty":
      return "Hindi pinapayagan ang sobrang Array property. Alisin ito o gumamit ng ibang Type.";
    case "Element":
      return `Hindi valid ang array element sa index na ${issue.index}.`;
  }
};

/** Formats a NonEmptyArrayError in Filipino. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat maglaman ng kahit isang item.`;

/** Formats a UniqueError in Filipino. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay may magkaparehong item sa mga index na ${error.previousIndex} at ${error.index}.`;

/** Formats a SetError in Filipino. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Ang halagang ${safelyStringifyUnknownValue(error.reason.value)} ay hindi Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Hindi pinapayagan ang sobrang Set property na ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `Hindi valid ang Set element sa index na ${issue.index}.`;
  }
};

/** Formats a MapError in Filipino. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Ang halagang ${safelyStringifyUnknownValue(error.reason.value)} ay hindi Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Hindi pinapayagan ang sobrang Map property na ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
      return `Hindi valid ang Map key sa index na ${issue.index}.`;
    case "Value":
      return `Hindi valid ang Map value sa index na ${issue.index}.`;
    case "Collision":
      return `Ang Map keys sa mga index na ${issue.previousIndex} at ${issue.index} ay nade-decode sa iisang key na ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Filipino. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Ang halagang ${safelyStringifyUnknownValue(error.reason.value)} ay hindi tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Ang Tuple ay dapat may haba na ${error.reason.expected}, ngunit ang halaga ay may haba na ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Nawawala ang Tuple element sa index na ${issue.index}.`;
    case "Accessor":
      return `Ang Tuple element sa index na ${issue.index} ay dapat data property.`;
    case "ExcessProperty":
      return "Hindi pinapayagan ang sobrang Tuple property. Alisin ito o gumamit ng ibang Type.";
    case "Element":
      return `Hindi valid ang Tuple element sa index na ${issue.index}.`;
  }
};

/** Formats a RecordError in Filipino. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Ang halagang ${safelyStringifyUnknownValue(error.reason.value)} ay hindi Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Object ang halaga, ngunit ang Record Output ay dapat plain object o may null prototype.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Hindi valid ang property key na ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Value":
      return `Hindi valid ang halaga ng property na ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Accessor":
      return `Ang Record property na ${safelyStringifyUnknownValue(issue.key)} ay dapat data property.`;
    case "NonEnumerable":
      return `Ang Record property na ${safelyStringifyUnknownValue(issue.key)} ay dapat enumerable.`;
    case "Collision":
      return `Ang Record keys na ${safelyStringifyUnknownValue(issue.previousKey)} at ${safelyStringifyUnknownValue(issue.key)} ay nade-decode sa iisang key na ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Filipino. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi umaabot sa minimum na bilang ng entry na ${error.min}.`;

/** Formats a MaxEntriesError in Filipino. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay lumalampas sa maximum na bilang ng entry na ${error.max}.`;

/** Formats an ObjectError in Filipino. */
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
        return "Ang Object property ay dapat data property. I-materialize ang mga accessor value bilang plain data bago gamitin ang Type na ito, o gumamit ng ibang Type.";
      case "NonEnumerable":
        return "Ang Object property ay dapat enumerable. Gawin itong enumerable o gumamit ng ibang Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Nawawala ang kinakailangang property na ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "Ang Object property key ay dapat string. Alisin ang symbol property o gumamit ng ibang Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Hindi pinapayagan ang property na ${safelyStringifyUnknownValue(key)}. Alisin ito o gumamit ng ibang Type.`;
  }
  return `Hindi valid ang property na ${safelyStringifyUnknownValue(key)}.`;
};

/** Formats a DiscriminatedUnionError in Filipino. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Ang discriminator property na ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ay dapat data property.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} ay dapat own property.`;
      }
      return `${property} ay dapat enumerable.`;
    }
    case "Discriminator":
      return `Ang discriminator property na ${safelyStringifyUnknownValue(error.reason.key)} ay may hindi inaasahang halagang ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Hindi valid ang napiling variant na ${safelyStringifyUnknownValue(error.reason.discriminator)}.`;
  }
};

/** Formats a DataError in Filipino. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Ang halagang ${safelyStringifyUnknownValue(issue.value)} ay hindi Data.`;
    case "UnexpectedPrototype":
      return `May hindi inaasahang prototype ang Data ${issue.container}.`;
    case "Accessor":
      return "Ang Data property ay dapat data property. I-materialize ang mga accessor value bilang plain data bago gamitin ang Type na ito, o gumamit ng ibang Type.";
    case "NonEnumerable":
      return "Ang Data Object property ay dapat enumerable. Alisin ito o gumamit ng ibang Type.";
    case "SymbolProperty":
      return "Ang Data Object property key ay dapat string. Alisin ang symbol property o gumamit ng ibang Type.";
    case "Hole":
      return "May nawawalang Data Array element.";
    case "InvalidUint8Array":
      return "Ang Data Uint8Array ay dapat may ArrayBuffer na hindi detached, at dapat itong nasa loob ng hangganan ng ArrayBuffer na iyon.";
    case "ExcessProperty":
      return `Ang Data ${issue.container} ay hindi dapat magkaroon ng sobrang own property. Alisin ang property o gumamit ng ibang Type.`;
  }
};

/** Formats a JsonValueError in Filipino. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Ang halagang ${safelyStringifyUnknownValue(issue.value)} ay hindi JSON value.`;
    case "NonFiniteNumber":
      return "Ang JSON number ay dapat finite.";
    case "UnexpectedPrototype":
      return "Object ang halaga, ngunit ang JsonValue object ay dapat plain object o may null prototype.";
    case "Accessor":
      return "Ang JSON property ay dapat data property. I-materialize ang mga accessor value bilang plain data bago gamitin ang Type na ito, o gumamit ng ibang Type.";
    case "NonEnumerable":
      return "Ang JSON object property ay dapat enumerable. Alisin ito o gumamit ng ibang Type.";
    case "SymbolProperty":
      return "Ang JSON object property key ay dapat string. Alisin ang symbol property o gumamit ng ibang Type.";
    case "Hole":
      return "May nawawalang JSON array element.";
    case "ExcessProperty":
      return "Hindi pinapayagan ang sobrang JSON array property. Alisin ito o gumamit ng ibang Type.";
    case "CircularReference":
      return "Ang JsonValue ay hindi dapat maglaman ng circular references.";
  }
};

/** Formats a JsonError in Filipino. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Hindi ma-parse ang halagang ${safelyStringifyUnknownValue(error.value)} bilang JsonValue.`;

/** Formats a ByteSizeLiteralError in Filipino. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi isang literal ng laki sa byte. Gumamit ng halagang tulad ng "512KiB" o "1MiB".`;

/** Formats a ByteLengthError in Filipino. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () =>
  "Ang halagang -0 ay hindi isang haba sa byte. Gamitin ang 0 sa halip nito.";

/** Formats a ByteLengthFromStringError in Filipino. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi isang haba sa byte. Gumamit ng bilang ng byte o ng literal na tulad ng 10MiB.`;

/** Formats a DurationLiteralError in Filipino. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi isang literal ng tagal. Gumamit ng halagang tulad ng "500ms" o "1.5s".`;

/** Formats a PercentageLiteralError in Filipino. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi isang literal ng porsiyento. Gumamit ng halagang tulad ng "50%" o "12.5%".`;
