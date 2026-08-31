/**
 * Mga formatter ng error ng Evolu Type sa Filipino.
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

  return `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Ang halagang ${safelyStringifyUnknownValue(reason.value)} ay hindi object.`
    : "Object ang halaga, ngunit ang Object Output ay dapat plain object o may null prototype.";

/** Fino-format ang NeverError sa Filipino. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid para sa type Never.`;

/** Fino-format ang String TypeOfError sa Filipino. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Fino-format ang TemplateLiteralError sa Filipino. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi tumutugma sa template literal.`;

/** Fino-format ang Number TypeOfError sa Filipino. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Fino-format ang BigInt TypeOfError sa Filipino. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Fino-format ang Boolean TypeOfError sa Filipino. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Fino-format ang Symbol TypeOfError sa Filipino. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Fino-format ang Function TypeOfError sa Filipino. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Fino-format ang EvoluTypeError sa Filipino. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi Evolu Type.`;

/** Fino-format ang ObjectTagError sa Filipino. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay walang inaasahang object tag na ${safelyStringifyUnknownValue(error.expected)}.`;

/** Fino-format ang InstanceOfError sa Filipino. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi instance ng ${error.constructorName}.`;

/** Fino-format ang LiteralError sa Filipino. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi strictly equal sa inaasahang literal: ${String(error.expected)}.`;

/** Fino-format ang UnionError sa Filipino. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Ang halaga ay hindi tumutugma sa alinmang pinapayagang variant.";

/** Fino-format ang DateIsoError sa Filipino. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi canonical ISO date-time string.`;

/** Fino-format ang DateIsoFromDateError sa Filipino. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Hindi maire-represent ang Date bilang DateIso.";

/** Fino-format ang DecimalStringError sa Filipino. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat canonical decimal string.`;

/** Fino-format ang Int64Error sa Filipino. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na signed 64-bit integer (Int64).`;

/** Fino-format ang UInt64Error sa Filipino. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na unsigned 64-bit integer (UInt64).`;

/** Fino-format ang Int64StringError sa Filipino. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Int64 string.`;

/** Fino-format ang CapitalizedError sa Filipino. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat naka-capitalize.`;

/** Fino-format ang TrimmedError sa Filipino. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat naka-trim.`;

/** Fino-format ang MinLengthError sa Filipino. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi umaabot sa minimum na haba na ${error.min}.`;

/** Fino-format ang MaxLengthError sa Filipino. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay lumalampas sa maximum na haba na ${error.max}.`;

/** Fino-format ang LengthError sa Filipino. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay walang kinakailangang haba na ${error.exact}.`;

/** Fino-format ang RegexError sa Filipino. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi tumutugma sa /${error.source}/${error.flags}.`;

/** Fino-format ang Base64UrlError sa Filipino. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Base64Url string.`;

/** Fino-format ang NameError sa Filipino. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Name.`;

/** Fino-format ang MnemonicError sa Filipino. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na English BIP39 mnemonic.`;

/** Fino-format ang IdError sa Filipino. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Id.`;

/** Fino-format ang TableIdError sa Filipino. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay hindi valid na Id para sa table na ${error.table}.`;

/** Fino-format ang NonNegativeError sa Filipino. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-negative (>= 0).`;

/** Fino-format ang NonNegativeDecimalStringError sa Filipino. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-negative decimal string.`;

/** Fino-format ang PositiveError sa Filipino. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat positive (> 0).`;

/** Fino-format ang PositiveDecimalStringError sa Filipino. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat positive decimal string.`;

/** Fino-format ang NonPositiveError sa Filipino. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-positive (<= 0).`;

/** Fino-format ang NonPositiveDecimalStringError sa Filipino. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat non-positive decimal string.`;

/** Fino-format ang NegativeError sa Filipino. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat negative (< 0).`;

/** Fino-format ang NegativeDecimalStringError sa Filipino. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat negative decimal string.`;

/** Fino-format ang IntError sa Filipino. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat safe integer.`;

/** Fino-format ang GreaterThanError sa Filipino. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas malaki sa ${error.min}.`;

/** Fino-format ang GreaterThanOrEqualToError sa Filipino. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas malaki sa o katumbas ng ${error.min}.`;

/** Fino-format ang LessThanError sa Filipino. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas maliit sa ${error.max}.`;

/** Fino-format ang LessThanOrEqualToError sa Filipino. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat mas maliit sa o katumbas ng ${error.max}.`;

/** Fino-format ang NonNaNError sa Filipino. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Ang halaga ay hindi dapat NaN.";

/** Fino-format ang FiniteError sa Filipino. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat finite.`;

/** Fino-format ang MultipleOfError sa Filipino. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat multiple ng ${error.divisor}.`;

/** Fino-format ang BetweenError sa Filipino. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Ang halagang ${safelyStringifyUnknownValue(error.value)} ay dapat nasa pagitan ng ${error.min} at ${error.max}, kasama ang mga hangganan.`;

/** Fino-format ang ArrayError sa Filipino. */
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

/** Fino-format ang SetError sa Filipino. */
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

/** Fino-format ang MapError sa Filipino. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Ang halagang ${safelyStringifyUnknownValue(error.reason.value)} ay hindi Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Hindi pinapayagan ang sobrang Map property na ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
    case "Value":
      return `Hindi valid ang Map element sa index na ${issue.index}.`;
    case "Collision":
      return `Ang Map keys na ${safelyStringifyUnknownValue(issue.previousKey)} at ${safelyStringifyUnknownValue(issue.key)} ay nade-decode sa iisang key na ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Fino-format ang TupleError sa Filipino. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Ang halagang ${safelyStringifyUnknownValue(error.reason.value)} ay hindi tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Ang Tuple ay dapat may eksaktong ${error.reason.expected} element, ngunit ang halaga ay may ${error.reason.actual}.`;
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

/** Fino-format ang RecordError sa Filipino. */
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

/** Fino-format ang ObjectError sa Filipino. */
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

/** Fino-format ang DiscriminatedUnionError sa Filipino. */
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

/** Fino-format ang JsonValueError sa Filipino. */
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

/** Fino-format ang JsonError sa Filipino. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Hindi ma-parse ang halagang ${safelyStringifyUnknownValue(error.value)} bilang JsonValue.`;
