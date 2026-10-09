/**
 * Swedish Evolu Type error formatters.
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

  return `Värdet ${safelyStringifyUnknownValue(error.value)} har inte typen ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Värdet ${safelyStringifyUnknownValue(reason.value)} är inte ett objekt.`
    : "Värdet är ett objekt, men en Object Output måste vara ett vanligt objekt eller ha en null-prototyp.";

/** Formats a NeverError in Swedish. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte giltigt för typen Never.`;

/** Formats a String TypeOfError in Swedish. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Swedish. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} matchar inte mallsträngen.`;

/** Formats a Number TypeOfError in Swedish. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Swedish. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Swedish. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Swedish. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett booleskt värde. Använd true eller false.`;

/** Formats a Symbol TypeOfError in Swedish. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Swedish. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Swedish. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en Evolu Type.`;

/** Formats an ObjectTagError in Swedish. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} har inte den förväntade objekttaggen ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Swedish. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date-värdet är ogiltigt.";

/** Formats an InstanceOfError in Swedish. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en instans av ${error.constructorName}.`;

/** Formats a LiteralError in Swedish. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte strikt lika med det förväntade literalvärdet: ${String(error.expected)}.`;

/** Formats a UnionError in Swedish. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Ett värde matchar ingen tillåten variant.";

/** Formats a DateIsoError in Swedish. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en kanonisk ISO-sträng för datum och tid.`;

/** Formats a PlainDateIsoError in Swedish. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt kalenderdatum i formatet YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Swedish. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date kan inte representeras som DateIso.";

/** Formats a DateIsoFromRfc3339Error in Swedish. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en sträng för datum och tid enligt RFC 3339 som stöds. Använd ett värde som "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Swedish. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en kanonisk decimalsträng.`;

/** Formats an Int64Error in Swedish. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt 64-bitars heltal med tecken (Int64).`;

/** Formats a UInt64Error in Swedish. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt 64-bitars heltal utan tecken (UInt64).`;

/** Formats an Int64StringError in Swedish. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig Int64-sträng.`;

/** Formats an IdentifierError in Swedish. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en ${error.casing}-identifierare.`;

/** Formats a CapitalizedError in Swedish. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste börja med stor bokstav.`;

/** Formats an UncapitalizedError in Swedish. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} får inte börja med en stor bokstav.`;

/** Formats an UppercasedError in Swedish. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara skrivet med stora bokstäver.`;

/** Formats a LowercasedError in Swedish. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara skrivet med små bokstäver.`;

/** Formats a TrimmedError in Swedish. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} får inte ha inledande eller avslutande blanksteg.`;

/** Formats a WellFormedError in Swedish. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara välformad Unicode-text.`;

/** Formats a NormalizedError in Swedish. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara i Unicode-normaliseringsformen ${error.form}.`;

/** Formats a StartsWithError in Swedish. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste börja med ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Swedish. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste sluta med ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats a MinLengthError in Swedish. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} uppfyller inte minimilängden ${error.min}.`;

/** Formats a MaxLengthError in Swedish. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} överskrider maxlängden ${error.max}.`;

/** Formats a LengthError in Swedish. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} har inte den obligatoriska längden ${error.exact}.`;

/** Formats a RegexError in Swedish. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} matchar inte /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Swedish. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig Base64Url-sträng.`;

/** Formats a Base64Error in Swedish. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig Base64-sträng.`;

/** Formats a HexError in Swedish. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte hexadecimalt med små bokstäver och ett jämnt antal siffror.`;

/** Formats a NameError in Swedish. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt Name.`;

/** Formats an EmailError in Swedish. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig e-postadress.`;

/** Formats a HostnameError in Swedish. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt värdnamn med små bokstäver.`;

/** Formats an Ipv4AddressError in Swedish. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig IPv4-adress.`;

/** Formats an Ipv6AddressError in Swedish. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en kanonisk IPv6-adress.`;

/** Formats an Ipv6AddressFromStringError in Swedish. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig IPv6-adress.`;

/** Formats a PhoneNumberE164Error in Swedish. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett telefonnummer i E.164-format.`;

/** Formats an IbanError in Swedish. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt IBAN-nummer med stora bokstäver utan mellanslag.`;

/** Formats a MnemonicError in Swedish. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en giltig engelsk BIP39-mnemonisk fras.`;

/** Formats an IdError in Swedish. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt Id.`;

/** Formats a TableIdError in Swedish. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett giltigt Id för tabellen ${error.table}.`;

/** Formats a UuidError in Swedish. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett kanoniskt UUID med små bokstäver.`;

/** Formats a UuidVersionError in Swedish. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett UUID av version ${error.version}.`;

/** Formats a NonNegativeError in Swedish. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara icke-negativt (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Swedish. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en icke-negativ decimalsträng.`;

/** Formats a PositiveError in Swedish. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara positivt (> 0).`;

/** Formats a PositiveDecimalStringError in Swedish. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en positiv decimalsträng.`;

/** Formats a NonPositiveError in Swedish. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara icke-positivt (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Swedish. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en icke-positiv decimalsträng.`;

/** Formats a NegativeError in Swedish. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara negativt (< 0).`;

/** Formats a NegativeDecimalStringError in Swedish. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en negativ decimalsträng.`;

/** Formats an IntError in Swedish. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara ett säkert heltal.`;

/** Formats an IntFromStringError in Swedish. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett decimalt heltal.`;

/** Formats a FiniteNumberFromStringError in Swedish. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte ett decimaltal.`;

/** Formats a GreaterThanError in Swedish. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara större än ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Swedish. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara större än eller lika med ${error.min}.`;

/** Formats a LessThanError in Swedish. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara mindre än ${error.max}.`;

/** Formats a LessThanOrEqualToError in Swedish. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara mindre än eller lika med ${error.max}.`;

/** Formats a NonNaNError in Swedish. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Värdet får inte vara NaN.";

/** Formats a FiniteError in Swedish. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara ändligt.`;

/** Formats a MultipleOfError in Swedish. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste vara en multipel av ${error.divisor}.`;

/** Formats a BetweenError in Swedish. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste ligga mellan ${error.min} och ${error.max}, inklusive.`;

/** Formats an ArrayError in Swedish. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Ett arrayelement vid index ${issue.index} saknas.`;
    case "Accessor":
      return `Ett arrayelement vid index ${issue.index} måste vara en dataegenskap.`;
    case "ExcessProperty":
      return "En extra Array-egenskap är inte tillåten. Ta bort den eller använd en annan Type.";
    case "Element":
      return `Ett arrayelement vid index ${issue.index} är ogiltigt.`;
  }
};

/** Formats a NonEmptyArrayError in Swedish. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} måste innehålla minst ett element.`;

/** Formats a UniqueError in Swedish. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} har likadana element vid index ${error.previousIndex} och ${error.index}.`;

/** Formats a SetError in Swedish. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Den extra Set-egenskapen ${safelyStringifyUnknownValue(issue.key)} är inte tillåten.`;
    case "Element":
      return `Ett Set-element vid index ${issue.index} är ogiltigt.`;
  }
};

/** Formats a MapError in Swedish. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Den extra Map-egenskapen ${safelyStringifyUnknownValue(issue.key)} är inte tillåten.`;
    case "Key":
      return `En Map-nyckel vid index ${issue.index} är ogiltig.`;
    case "Value":
      return `Ett Map-värde vid index ${issue.index} är ogiltigt.`;
    case "Collision":
      return `Map-nycklarna vid index ${issue.previousIndex} och ${issue.index} avkodas till samma nyckel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Swedish. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `En Tuple måste ha längden ${error.reason.expected}, men värdet har längden ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Ett Tuple-element vid index ${issue.index} saknas.`;
    case "Accessor":
      return `Ett Tuple-element vid index ${issue.index} måste vara en dataegenskap.`;
    case "ExcessProperty":
      return "En extra Tuple-egenskap är inte tillåten. Ta bort den eller använd en annan Type.";
    case "Element":
      return `Ett Tuple-element vid index ${issue.index} är ogiltigt.`;
  }
};

/** Formats a RecordError in Swedish. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Värdet ${safelyStringifyUnknownValue(error.reason.value)} är inte en Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Värdet är ett objekt, men en Record Output måste vara ett vanligt objekt eller ha en null-prototyp.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Egenskapsnyckeln ${safelyStringifyUnknownValue(issue.key)} är ogiltig.`;
    case "Value":
      return `Värdet för egenskapen ${safelyStringifyUnknownValue(issue.key)} är ogiltigt.`;
    case "Accessor":
      return `Record-egenskapen ${safelyStringifyUnknownValue(issue.key)} måste vara en dataegenskap.`;
    case "NonEnumerable":
      return `Record-egenskapen ${safelyStringifyUnknownValue(issue.key)} måste vara uppräkningsbar.`;
    case "Collision":
      return `Record-nycklarna ${safelyStringifyUnknownValue(issue.previousKey)} och ${safelyStringifyUnknownValue(issue.key)} avkodas till samma nyckel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Swedish. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} har färre poster än minimiantalet ${error.min}.`;

/** Formats a MaxEntriesError in Swedish. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} har fler poster än maxantalet ${error.max}.`;

/** Formats an ObjectError in Swedish. */
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
        return "En Object-egenskap måste vara en dataegenskap. Omvandla accessor-värden till vanliga data innan du använder denna Type eller använd en annan Type.";
      case "NonEnumerable":
        return "En Object-egenskap måste vara uppräkningsbar. Gör den uppräkningsbar eller använd en annan Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Den obligatoriska egenskapen ${safelyStringifyUnknownValue(key)} saknas.`;
  }
  if (typeof key === "symbol") {
    return "En Object-egenskapsnyckel måste vara en sträng. Ta bort symbolegenskapen eller använd en annan Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Egenskapen ${safelyStringifyUnknownValue(key)} är inte tillåten. Ta bort den eller använd en annan Type.`;
  }
  return `Egenskapen ${safelyStringifyUnknownValue(key)} är ogiltig.`;
};

/** Formats a DiscriminatedUnionError in Swedish. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Diskriminatoregenskapen ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} måste vara en dataegenskap.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} måste vara en egen egenskap.`;
      }
      return `${property} måste vara uppräkningsbar.`;
    }
    case "Discriminator":
      return `Diskriminatoregenskapen ${safelyStringifyUnknownValue(error.reason.key)} har ett oväntat värde ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Den valda varianten ${safelyStringifyUnknownValue(error.reason.discriminator)} är ogiltig.`;
  }
};

/** Formats a DataError in Swedish. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Värdet ${safelyStringifyUnknownValue(issue.value)} är inte Data.`;
    case "UnexpectedPrototype":
      return `Ett Data-värde av typen ${issue.container} har en oväntad prototyp.`;
    case "Accessor":
      return "En Data-egenskap måste vara en dataegenskap. Omvandla accessor-värden till vanliga data innan du använder denna Type eller använd en annan Type.";
    case "NonEnumerable":
      return "En Data-Object-egenskap måste vara uppräkningsbar. Ta bort den eller använd en annan Type.";
    case "SymbolProperty":
      return "En Data-Object-egenskapsnyckel måste vara en sträng. Ta bort symbolegenskapen eller använd en annan Type.";
    case "Hole":
      return "Ett Data-Array-element saknas.";
    case "InvalidUint8Array":
      return "En Data-Uint8Array måste ligga helt inom en ArrayBuffer som inte är frånkopplad.";
    case "ExcessProperty":
      return `Ett Data-värde av typen ${issue.container} får inte ha extra egna egenskaper. Ta bort egenskapen eller använd en annan Type.`;
  }
};

/** Formats a JsonValueError in Swedish. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Värdet ${safelyStringifyUnknownValue(issue.value)} är inte ett JSON-värde.`;
    case "NonFiniteNumber":
      return "Ett JSON-tal måste vara ändligt.";
    case "UnexpectedPrototype":
      return "Värdet är ett objekt, men ett JsonValue-objekt måste vara ett vanligt objekt eller ha en null-prototyp.";
    case "Accessor":
      return "En JSON-egenskap måste vara en dataegenskap. Omvandla accessor-värden till vanliga data innan du använder denna Type eller använd en annan Type.";
    case "NonEnumerable":
      return "En JSON-objektegenskap måste vara uppräkningsbar. Ta bort den eller använd en annan Type.";
    case "SymbolProperty":
      return "En JSON-objektegenskapsnyckel måste vara en sträng. Ta bort symbolegenskapen eller använd en annan Type.";
    case "Hole":
      return "Ett JSON-arrayelement saknas.";
    case "ExcessProperty":
      return "En extra JSON-arrayegenskap är inte tillåten. Ta bort den eller använd en annan Type.";
    case "CircularReference":
      return "Ett JsonValue får inte innehålla cirkulära referenser.";
  }
};

/** Formats a JsonError in Swedish. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} kan inte tolkas som ett JsonValue.`;

/** Formats a ByteSizeLiteralError in Swedish. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en literal för en storlek i byte. Använd ett värde som "512KiB" eller "1MiB".`;

/** Formats a ByteLengthError in Swedish. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Värdet -0 är inte en längd i byte. Använd 0 istället.";

/** Formats a ByteLengthFromStringError in Swedish. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en längd i byte. Använd ett antal byte eller en literal som 10MiB.`;

/** Formats a DurationLiteralError in Swedish. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en varaktighetsliteral. Använd ett värde som "500ms" eller "1.5s".`;

/** Formats a PercentageLiteralError in Swedish. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Värdet ${safelyStringifyUnknownValue(error.value)} är inte en procentliteral. Använd ett värde som "50%" eller "12.5%".`;
