/**
 * Nederlandse Evolu Type-foutformatteerders.
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

  return `Een waarde ${safelyStringifyUnknownValue(error.value)} is geen ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Een waarde ${safelyStringifyUnknownValue(reason.value)} is geen object.`
    : "De waarde is een object, maar een Object Output moet een gewoon object zijn of een null-prototype hebben.";

/** Formatteert een NeverError in het Nederlands. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Een waarde ${safelyStringifyUnknownValue(error.value)} is niet geldig voor type Never.`;

/** Formatteert een String TypeOfError in het Nederlands. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formatteert een TemplateLiteralError in het Nederlands. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} komt niet overeen met de template literal.`;

/** Formatteert een Number TypeOfError in het Nederlands. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formatteert een BigInt TypeOfError in het Nederlands. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formatteert een Boolean TypeOfError in het Nederlands. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formatteert een Symbol TypeOfError in het Nederlands. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formatteert een Function TypeOfError in het Nederlands. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formatteert een EvoluTypeError in het Nederlands. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Een waarde ${safelyStringifyUnknownValue(error.value)} is geen Evolu Type.`;

/** Formatteert een ObjectTagError in het Nederlands. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Een waarde ${safelyStringifyUnknownValue(error.value)} heeft niet de verwachte objecttag ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formatteert een InstanceOfError in het Nederlands. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Een waarde ${safelyStringifyUnknownValue(error.value)} is geen instantie van ${error.constructorName}.`;

/** Formatteert een LiteralError in het Nederlands. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is niet strikt gelijk aan het verwachte literal: ${String(error.expected)}.`;

/** Formatteert een UnionError in het Nederlands. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Een waarde komt niet overeen met een van de toegestane varianten.";

/** Formatteert een DateIsoError in het Nederlands. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen canonieke ISO-datum-tijdtekenreeks.`;

/** Formatteert een DateIsoFromDateError in het Nederlands. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "De Date kan niet als DateIso worden weergegeven.";

/** Formatteert een DecimalStringError in het Nederlands. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een canonieke decimale tekenreeks zijn.`;

/** Formatteert een Int64Error in het Nederlands. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig ondertekend 64-bits geheel getal (Int64).`;

/** Formatteert een UInt64Error in het Nederlands. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldig niet-ondertekend 64-bits geheel getal (UInt64).`;

/** Formatteert een Int64StringError in het Nederlands. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Int64-tekenreeks.`;

/** Formatteert een CapitalizedError in het Nederlands. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet met een hoofdletter beginnen.`;

/** Formatteert een TrimmedError in het Nederlands. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} mag geen witruimte aan het begin of einde bevatten.`;

/** Formatteert een MinLengthError in het Nederlands. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} voldoet niet aan de minimale lengte van ${error.min}.`;

/** Formatteert een MaxLengthError in het Nederlands. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} overschrijdt de maximale lengte van ${error.max}.`;

/** Formatteert een LengthError in het Nederlands. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} heeft niet de vereiste lengte van ${error.exact}.`;

/** Formatteert een RegexError in het Nederlands. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} komt niet overeen met /${error.source}/${error.flags}.`;

/** Formatteert een Base64UrlError in het Nederlands. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Base64Url-tekenreeks.`;

/** Formatteert een NameError in het Nederlands. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Name.`;

/** Formatteert een MnemonicError in het Nederlands. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Engelse BIP39-mnemonic.`;

/** Formatteert een IdError in het Nederlands. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Id.`;

/** Formatteert een TableIdError in het Nederlands. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} is geen geldige Id voor tabel ${error.table}.`;

/** Formatteert een NonNegativeError in het Nederlands. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet niet-negatief zijn (>= 0).`;

/** Formatteert een NonNegativeDecimalStringError in het Nederlands. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een niet-negatieve decimale tekenreeks zijn.`;

/** Formatteert een PositiveError in het Nederlands. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet positief zijn (> 0).`;

/** Formatteert een PositiveDecimalStringError in het Nederlands. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een positieve decimale tekenreeks zijn.`;

/** Formatteert een NonPositiveError in het Nederlands. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet niet-positief zijn (<= 0).`;

/** Formatteert een NonPositiveDecimalStringError in het Nederlands. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een niet-positieve decimale tekenreeks zijn.`;

/** Formatteert een NegativeError in het Nederlands. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet negatief zijn (< 0).`;

/** Formatteert een NegativeDecimalStringError in het Nederlands. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een negatieve decimale tekenreeks zijn.`;

/** Formatteert een IntError in het Nederlands. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een veilig geheel getal zijn.`;

/** Formatteert een GreaterThanError in het Nederlands. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet groter zijn dan ${error.min}.`;

/** Formatteert een GreaterThanOrEqualToError in het Nederlands. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet groter zijn dan of gelijk aan ${error.min}.`;

/** Formatteert een LessThanError in het Nederlands. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet kleiner zijn dan ${error.max}.`;

/** Formatteert een LessThanOrEqualToError in het Nederlands. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet kleiner zijn dan of gelijk aan ${error.max}.`;

/** Formatteert een NonNaNError in het Nederlands. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "De waarde mag geen NaN zijn.";

/** Formatteert een FiniteError in het Nederlands. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet eindig zijn.`;

/** Formatteert een MultipleOfError in het Nederlands. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet een veelvoud van ${error.divisor} zijn.`;

/** Formatteert een BetweenError in het Nederlands. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} moet tussen ${error.min} en ${error.max} liggen, inclusief.`;

/** Formatteert een ArrayError in het Nederlands. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Een waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen array.`;
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

/** Formatteert een SetError in het Nederlands. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Een waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Een overbodige Set-eigenschap ${safelyStringifyUnknownValue(issue.key)} is niet toegestaan.`;
    case "Element":
      return `Een Set-element op index ${issue.index} is ongeldig.`;
  }
};

/** Formatteert een MapError in het Nederlands. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Een waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Een overbodige Map-eigenschap ${safelyStringifyUnknownValue(issue.key)} is niet toegestaan.`;
    case "Key":
    case "Value":
      return `Een Map-element op index ${issue.index} is ongeldig.`;
    case "Collision":
      return `Map-sleutels ${safelyStringifyUnknownValue(issue.previousKey)} en ${safelyStringifyUnknownValue(issue.key)} decoderen naar dezelfde sleutel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formatteert een TupleError in het Nederlands. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Een waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Een Tuple moet precies ${error.reason.expected} elementen bevatten, maar de waarde bevat ${error.reason.actual}.`;
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

/** Formatteert een RecordError in het Nederlands. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Een waarde ${safelyStringifyUnknownValue(error.reason.value)} is geen Record.`;
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
      return `Een Record-eigenschap ${safelyStringifyUnknownValue(issue.key)} moet een data-eigenschap zijn.`;
    case "NonEnumerable":
      return `Een Record-eigenschap ${safelyStringifyUnknownValue(issue.key)} moet opsombaar zijn.`;
    case "Collision":
      return `Record-sleutels ${safelyStringifyUnknownValue(issue.previousKey)} en ${safelyStringifyUnknownValue(issue.key)} decoderen naar dezelfde sleutel ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formatteert een ObjectError in het Nederlands. */
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

/** Formatteert een DiscriminatedUnionError in het Nederlands. */
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

/** Formatteert een JsonValueError in het Nederlands. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Een waarde ${safelyStringifyUnknownValue(issue.value)} is geen JSON-waarde.`;
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

/** Formatteert een JsonError in het Nederlands. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `De waarde ${safelyStringifyUnknownValue(error.value)} kan niet worden geparseerd naar een JsonValue.`;
