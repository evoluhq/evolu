/**
 * Dutch Evolu Type error formatters.
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

  return `De waarde ${safelyStringifyUnknownValue(error.value)} is niet van het type ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `De waarde ${safelyStringifyUnknownValue(reason.value)} is geen object.`
    : "De waarde is een object, maar een Object Output moet een gewoon object zijn of een null-prototype hebben.";

/** Formats a NeverError in Dutch. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is niet geldig voor het type Never.`;

/** Formats a String TypeOfError in Dutch. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Dutch. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} komt niet overeen met de template literal.`;

/** Formats a Number TypeOfError in Dutch. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Dutch. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Dutch. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Dutch. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen booleaanse waarde. Gebruik true of false.`;

/** Formats a Symbol TypeOfError in Dutch. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Dutch. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Dutch. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen Evolu Type.`;

/** Formats an ObjectTagError in Dutch. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} heeft niet de verwachte objecttag ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Dutch. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "De Date is ongeldig.";

/** Formats an InstanceOfError in Dutch. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen instantie van ${error.constructorName}.`;

/** Formats a LiteralError in Dutch. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is niet strikt gelijk aan het verwachte literal: ${String(error.expected)}.`;

/** Formats a UnionError in Dutch. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Een waarde komt niet overeen met een van de toegestane varianten.";

/** Formats a DateIsoError in Dutch. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen canonieke ISO-datum-tijdtekenreeks.`;

/** Formats a PlainDateIsoError in Dutch. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige kalenderdatum in het formaat YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Dutch. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "De Date kan niet als DateIso worden weergegeven.";

/** Formats a DateIsoFromRfc3339Error in Dutch. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen ondersteunde datum-tijdtekenreeks volgens RFC 3339. Gebruik een waarde zoals "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Dutch. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een canonieke decimale tekenreeks zijn.`;

/** Formats an Int64Error in Dutch. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig 64-bits geheel getal met teken (Int64).`;

/** Formats a UInt64Error in Dutch. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig 64-bits geheel getal zonder teken (UInt64).`;

/** Formats an Int64StringError in Dutch. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Int64-tekenreeks.`;

/** Formats an IdentifierError in Dutch. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen ${error.casing}-identifier.`;

/** Formats a CapitalizedError in Dutch. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet met een hoofdletter beginnen.`;

/** Formats an UncapitalizedError in Dutch. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} mag niet met een hoofdletter beginnen.`;

/** Formats an UppercasedError in Dutch. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet in hoofdletters staan.`;

/** Formats a LowercasedError in Dutch. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet in kleine letters staan.`;

/** Formats a TrimmedError in Dutch. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} mag geen witruimte aan het begin of einde bevatten.`;

/** Formats a WellFormedError in Dutch. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet welgevormde Unicode-tekst zijn.`;

/** Formats a NormalizedError in Dutch. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet in Unicode-normalisatievorm ${error.form} zijn.`;

/** Formats a StartsWithError in Dutch. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet beginnen met ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Dutch. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet eindigen op ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats a MinLengthError in Dutch. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} voldoet niet aan de minimale lengte van ${error.min}.`;

/** Formats a MaxLengthError in Dutch. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} overschrijdt de maximale lengte van ${error.max}.`;

/** Formats a LengthError in Dutch. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} heeft niet de vereiste lengte van ${error.exact}.`;

/** Formats a RegexError in Dutch. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} komt niet overeen met /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Dutch. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Base64Url-tekenreeks.`;

/** Formats a Base64Error in Dutch. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Base64-tekenreeks.`;

/** Formats a HexError in Dutch. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen hexadecimale tekenreeks in kleine letters met een even aantal cijfers.`;

/** Formats a NameError in Dutch. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Name.`;

/** Formats an EmailError in Dutch. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig e-mailadres.`;

/** Formats a HostnameError in Dutch. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige hostnaam in kleine letters.`;

/** Formats an Ipv4AddressError in Dutch. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig IPv4-adres.`;

/** Formats an Ipv6AddressError in Dutch. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen canoniek IPv6-adres.`;

/** Formats an Ipv6AddressFromStringError in Dutch. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig IPv6-adres.`;

/** Formats a PhoneNumberE164Error in Dutch. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen telefoonnummer in E.164-formaat.`;

/** Formats an IbanError in Dutch. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig IBAN-nummer in hoofdletters zonder spaties.`;

/** Formats a MnemonicError in Dutch. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Engelse BIP39-mnemonic.`;

/** Formats an IdError in Dutch. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Id.`;

/** Formats a TableIdError in Dutch. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Id voor tabel ${error.table}.`;

/** Formats a UuidError in Dutch. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen canonieke UUID in kleine letters.`;

/** Formats a UuidVersionError in Dutch. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen UUID van versie ${error.version}.`;

/** Formats a NonNegativeError in Dutch. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet niet-negatief zijn (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Dutch. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een niet-negatieve decimale tekenreeks zijn.`;

/** Formats a PositiveError in Dutch. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet positief zijn (> 0).`;

/** Formats a PositiveDecimalStringError in Dutch. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een positieve decimale tekenreeks zijn.`;

/** Formats a NonPositiveError in Dutch. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet niet-positief zijn (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Dutch. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een niet-positieve decimale tekenreeks zijn.`;

/** Formats a NegativeError in Dutch. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet negatief zijn (< 0).`;

/** Formats a NegativeDecimalStringError in Dutch. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een negatieve decimale tekenreeks zijn.`;

/** Formats an IntError in Dutch. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een veilig geheel getal zijn.`;

/** Formats an IntFromStringError in Dutch. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen decimaal geheel getal.`;

/** Formats a FiniteNumberFromStringError in Dutch. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen decimaal getal.`;

/** Formats a GreaterThanError in Dutch. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet groter zijn dan ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Dutch. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet groter zijn dan of gelijk aan ${error.min}.`;

/** Formats a LessThanError in Dutch. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet kleiner zijn dan ${error.max}.`;

/** Formats a LessThanOrEqualToError in Dutch. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet kleiner zijn dan of gelijk aan ${error.max}.`;

/** Formats a NonNaNError in Dutch. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "De waarde mag geen NaN zijn.";

/** Formats a FiniteError in Dutch. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet eindig zijn.`;

/** Formats a MultipleOfError in Dutch. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een veelvoud van ${error.divisor} zijn.`;

/** Formats a BetweenError in Dutch. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet tussen ${error.min} en ${error.max} liggen, inclusief.`;

/** Formats an ArrayError in Dutch. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `De waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Een array-element op index ${issue.index} ontbreekt.`;
    case "Accessor":
      return `Een array-element op index ${issue.index} moet een data-eigenschap zijn.`;
    case "ExcessProperty":
      return "Een overbodige Array-eigenschap is niet toegestaan. Verwijder deze of gebruik een ander Type.";
    case "Element":
      return `Een array-element op index ${issue.index} is ongeldig.`;
  }
};

/** Formats a NonEmptyArrayError in Dutch. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet ten minste één element bevatten.`;

/** Formats a UniqueError in Dutch. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} heeft gelijke elementen op de indexen ${error.previousIndex} en ${error.index}.`;

/** Formats a SetError in Dutch. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `De waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `De overbodige Set-eigenschap ${safelyStringifyUnknownValue(issue.key)} is niet toegestaan.`;
    case "Element":
      return `Een Set-element op index ${issue.index} is ongeldig.`;
  }
};

/** Formats a MapError in Dutch. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `De waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `De overbodige Map-eigenschap ${safelyStringifyUnknownValue(issue.key)} is niet toegestaan.`;
    case "Key":
      return `Een Map-sleutel op index ${issue.index} is ongeldig.`;
    case "Value":
      return `Een Map-waarde op index ${issue.index} is ongeldig.`;
    case "Collision":
      return `Map-sleutels op de indexen ${issue.previousIndex} en ${issue.index} decoderen naar dezelfde sleutel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Dutch. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `De waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Een Tuple moet een lengte van ${error.reason.expected} hebben, maar de waarde heeft een lengte van ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Een Tuple-element op index ${issue.index} ontbreekt.`;
    case "Accessor":
      return `Een Tuple-element op index ${issue.index} moet een data-eigenschap zijn.`;
    case "ExcessProperty":
      return "Een overbodige Tuple-eigenschap is niet toegestaan. Verwijder deze of gebruik een ander Type.";
    case "Element":
      return `Een Tuple-element op index ${issue.index} is ongeldig.`;
  }
};

/** Formats a RecordError in Dutch. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `De waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "De waarde is een object, maar een Record Output moet een gewoon object zijn of een null-prototype hebben.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Eigenschapssleutel ${safelyStringifyUnknownValue(issue.key)} is ongeldig.`;
    case "Value":
      return `De waarde van eigenschap ${safelyStringifyUnknownValue(issue.key)} is ongeldig.`;
    case "Accessor":
      return `De Record-eigenschap ${safelyStringifyUnknownValue(issue.key)} moet een data-eigenschap zijn.`;
    case "NonEnumerable":
      return `De Record-eigenschap ${safelyStringifyUnknownValue(issue.key)} moet opsombaar zijn.`;
    case "Collision":
      return `Record-sleutels ${safelyStringifyUnknownValue(issue.previousKey)} en ${safelyStringifyUnknownValue(issue.key)} decoderen naar dezelfde sleutel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Dutch. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} voldoet niet aan het minimale aantal vermeldingen van ${error.min}.`;

/** Formats a MaxEntriesError in Dutch. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} overschrijdt het maximale aantal vermeldingen van ${error.max}.`;

/** Formats an ObjectError in Dutch. */
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
        return "Een Object-eigenschap moet een data-eigenschap zijn. Materialiseer accessorwaarden naar gewone gegevens voordat u dit Type gebruikt of gebruik een ander Type.";
      case "NonEnumerable":
        return "Een Object-eigenschap moet opsombaar zijn. Maak deze opsombaar of gebruik een ander Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `De vereiste eigenschap ${safelyStringifyUnknownValue(key)} ontbreekt.`;
  }
  if (typeof key === "symbol") {
    return "Een Object-eigenschapssleutel moet een tekenreeks zijn. Verwijder de symbooleigenschap of gebruik een ander Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `De eigenschap ${safelyStringifyUnknownValue(key)} is niet toegestaan. Verwijder deze of gebruik een ander Type.`;
  }
  return `De eigenschap ${safelyStringifyUnknownValue(key)} is ongeldig.`;
};

/** Formats a DiscriminatedUnionError in Dutch. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `De discriminerende eigenschap ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} moet een data-eigenschap zijn.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} moet een eigen eigenschap zijn.`;
      }
      return `${property} moet opsombaar zijn.`;
    }
    case "Discriminator":
      return `De discriminerende eigenschap ${safelyStringifyUnknownValue(error.reason.key)} heeft de onverwachte waarde ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `De geselecteerde variant ${safelyStringifyUnknownValue(error.reason.discriminator)} is ongeldig.`;
  }
};

/** Formats a DataError in Dutch. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `De waarde ${safelyStringifyUnknownValue(issue.value)} is geen Data.`;
    case "UnexpectedPrototype":
      return `Een Data-${issue.container} heeft een onverwacht prototype.`;
    case "Accessor":
      return "Een Data-eigenschap moet een data-eigenschap zijn. Materialiseer accessorwaarden naar gewone gegevens voordat u dit Type gebruikt of gebruik een ander Type.";
    case "NonEnumerable":
      return "Een Data-Object-eigenschap moet opsombaar zijn. Verwijder deze of gebruik een ander Type.";
    case "SymbolProperty":
      return "Een Data-Object-eigenschapssleutel moet een tekenreeks zijn. Verwijder de symbooleigenschap of gebruik een ander Type.";
    case "Hole":
      return "Een Data-Array-element ontbreekt.";
    case "InvalidUint8Array":
      return "Een Data-Uint8Array moet een niet-ontkoppelde ArrayBuffer hebben en binnen de grenzen ervan liggen.";
    case "ExcessProperty":
      return `Een Data-${issue.container} mag geen overbodige eigen eigenschappen hebben. Verwijder de eigenschap of gebruik een ander Type.`;
  }
};

/** Formats a JsonValueError in Dutch. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `De waarde ${safelyStringifyUnknownValue(issue.value)} is geen JSON-waarde.`;
    case "NonFiniteNumber":
      return "Een JSON-getal moet eindig zijn.";
    case "UnexpectedPrototype":
      return "De waarde is een object, maar een JsonValue-object moet een gewoon object zijn of een null-prototype hebben.";
    case "Accessor":
      return "Een JSON-eigenschap moet een data-eigenschap zijn. Materialiseer accessorwaarden naar gewone gegevens voordat u dit Type gebruikt of gebruik een ander Type.";
    case "NonEnumerable":
      return "Een JSON-objecteigenschap moet opsombaar zijn. Verwijder deze of gebruik een ander Type.";
    case "SymbolProperty":
      return "Een JSON-objecteigenschapssleutel moet een tekenreeks zijn. Verwijder de symbooleigenschap of gebruik een ander Type.";
    case "Hole":
      return "Een JSON-arrayelement ontbreekt.";
    case "ExcessProperty":
      return "Een overbodige JSON-arrayeigenschap is niet toegestaan. Verwijder deze of gebruik een ander Type.";
    case "CircularReference":
      return "Een JsonValue mag geen circulaire verwijzingen bevatten.";
  }
};

/** Formats a JsonError in Dutch. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} kan niet worden geparseerd naar een JsonValue.`;

/** Formats a ByteSizeLiteralError in Dutch. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen bytegrootteliteral. Gebruik een waarde zoals "512KiB" of "1MiB".`;

/** Formats a ByteLengthError in Dutch. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "De waarde -0 is geen bytelengte. Gebruik in plaats daarvan 0.";

/** Formats a ByteLengthFromStringError in Dutch. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen bytelengte. Gebruik een aantal bytes of een literal zoals 10MiB.`;

/** Formats a DurationLiteralError in Dutch. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen duurliteral. Gebruik een waarde zoals "500ms" of "1.5s".`;

/** Formats a PercentageLiteralError in Dutch. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen percentageliteral. Gebruik een waarde zoals "50%" of "12.5%".`;
