/**
 * Slovene Evolu Type error formatters.
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

  return `Vrednost ${safelyStringifyUnknownValue(error.value)} ni ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Vrednost ${safelyStringifyUnknownValue(reason.value)} ni objekt.`
    : "Vrednost je objekt, vendar mora biti izhod tipa Object navaden objekt ali imeti prototip null.";

/** Formats a NeverError in Slovene. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavna za tip Never.`;

/** Formats a String TypeOfError in Slovene. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Slovene. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se ne ujema z dobesedno predlogo.`;

/** Formats a Number TypeOfError in Slovene. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Slovene. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Slovene. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a Symbol TypeOfError in Slovene. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Slovene. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Slovene. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Vrednost ${safelyStringifyUnknownValue(error.value)} ni Evolu Type.`;

/** Formats an ObjectTagError in Slovene. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} nima pričakovane oznake objekta ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in Slovene. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni primerek ${error.constructorName}.`;

/** Formats a LiteralError in Slovene. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni strogo enaka pričakovanemu literalu: ${globalThis.String(error.expected)}.`;

/** Formats a UnionError in Slovene. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Vrednost se ne ujema z nobeno dovoljeno različico.";

/** Formats a DateIsoError in Slovene. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni kanonični niz datuma in časa ISO.`;

/** Formats a DateIsoFromDateError in Slovene. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Datuma ni mogoče predstaviti kot DateIso.";

/** Formats a DecimalStringError in Slovene. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti kanonični decimalni niz.`;

/** Formats an Int64Error in Slovene. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavno 64-bitno celo število s predznakom (Int64).`;

/** Formats a UInt64Error in Slovene. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavno 64-bitno celo število brez predznaka (UInt64).`;

/** Formats an Int64StringError in Slovene. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven niz Int64.`;

/** Formats a CapitalizedError in Slovene. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se mora začeti z veliko začetnico.`;

/** Formats a TrimmedError in Slovene. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti brez presledkov na začetku in koncu.`;

/** Formats a MinLengthError in Slovene. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ne dosega najmanjše dolžine ${error.min}.`;

/** Formats a MaxLengthError in Slovene. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} presega največjo dolžino ${error.max}.`;

/** Formats a LengthError in Slovene. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} nima zahtevane dolžine ${error.exact}.`;

/** Formats a RegexError in Slovene. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} se ne ujema z /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Slovene. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven niz Base64Url.`;

/** Formats a NameError in Slovene. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljavno ime.`;

/** Formats a MnemonicError in Slovene. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven angleški mnemonik BIP39.`;

/** Formats an IdError in Slovene. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven Id.`;

/** Formats a TableIdError in Slovene. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} ni veljaven Id za tabelo ${error.table}.`;

/** Formats a NonNegativeError in Slovene. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativna (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Slovene. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativni decimalni niz.`;

/** Formats a PositiveError in Slovene. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivna (> 0).`;

/** Formats a PositiveDecimalStringError in Slovene. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivni decimalni niz.`;

/** Formats a NonPositiveError in Slovene. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivna (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Slovene. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivni decimalni niz.`;

/** Formats a NegativeError in Slovene. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti negativna (< 0).`;

/** Formats a NegativeDecimalStringError in Slovene. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti negativni decimalni niz.`;

/** Formats an IntError in Slovene. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti varno celo število.`;

/** Formats a GreaterThanError in Slovene. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večja od ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Slovene. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večja ali enaka ${error.min}.`;

/** Formats a LessThanError in Slovene. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti manjša od ${error.max}.`;

/** Formats a LessThanOrEqualToError in Slovene. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti manjša ali enaka ${error.max}.`;

/** Formats a NonNaNError in Slovene. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Vrednost ne sme biti NaN.";

/** Formats a FiniteError in Slovene. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti končna.`;

/** Formats a MultipleOfError in Slovene. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti večkratnik števila ${error.divisor}.`;

/** Formats a BetweenError in Slovene. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Vrednost ${safelyStringifyUnknownValue(error.value)} mora biti med ${error.min} in ${error.max}, vključno.`;

/** Formats an ArrayError in Slovene. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni polje.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Element polja na indeksu ${issue.index} manjka.`;
    case "Accessor":
      return `Element polja na indeksu ${issue.index} mora biti podatkovna lastnost.`;
    case "ExcessProperty":
      return "Dodatna lastnost polja ni dovoljena. Odstranite jo ali uporabite drug Type.";
    case "Element":
      return `Element polja na indeksu ${issue.index} ni veljaven.`;
  }
};

/** Formats a SetError in Slovene. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Dodatna lastnost Set ${safelyStringifyUnknownValue(issue.key)} ni dovoljena.`;
    case "Element":
      return `Element Set na indeksu ${issue.index} ni veljaven.`;
  }
};

/** Formats a MapError in Slovene. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Dodatna lastnost Map ${safelyStringifyUnknownValue(issue.key)} ni dovoljena.`;
    case "Key":
    case "Value":
      return `Element Map na indeksu ${issue.index} ni veljaven.`;
    case "Collision":
      return `Ključa Map ${safelyStringifyUnknownValue(issue.previousKey)} in ${safelyStringifyUnknownValue(issue.key)} se dekodirata v isti ključ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Slovene. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni terka.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Terka mora vsebovati natanko ${error.reason.expected} elementov, vendar jih vrednost vsebuje ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Element terke na indeksu ${issue.index} manjka.`;
    case "Accessor":
      return `Element terke na indeksu ${issue.index} mora biti podatkovna lastnost.`;
    case "ExcessProperty":
      return "Dodatna lastnost terke ni dovoljena. Odstranite jo ali uporabite drug Type.";
    case "Element":
      return `Element terke na indeksu ${issue.index} ni veljaven.`;
  }
};

/** Formats a RecordError in Slovene. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Vrednost ${safelyStringifyUnknownValue(error.reason.value)} ni Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Vrednost je objekt, vendar mora biti izhod tipa Record navaden objekt ali imeti prototip null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Ključ lastnosti ${safelyStringifyUnknownValue(issue.key)} ni veljaven.`;
    case "Value":
      return `Vrednost lastnosti ${safelyStringifyUnknownValue(issue.key)} ni veljavna.`;
    case "Accessor":
      return `Lastnost Record ${safelyStringifyUnknownValue(issue.key)} mora biti podatkovna lastnost.`;
    case "NonEnumerable":
      return `Lastnost Record ${safelyStringifyUnknownValue(issue.key)} mora biti naštevna.`;
    case "Collision":
      return `Ključa Record ${safelyStringifyUnknownValue(issue.previousKey)} in ${safelyStringifyUnknownValue(issue.key)} se dekodirata v isti ključ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Slovene. */
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
        return "Lastnost Object mora biti podatkovna lastnost. Pred uporabo tega Type pretvorite vrednosti dostopnikov v navadne podatke ali uporabite drug Type.";
      case "NonEnumerable":
        return "Lastnost Object mora biti naštevna. Naredite jo naštevno ali uporabite drug Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Zahtevana lastnost ${safelyStringifyUnknownValue(key)} manjka.`;
  }
  if (typeof key === "symbol") {
    return "Ključ lastnosti Object mora biti niz. Odstranite lastnost s simbolom ali uporabite drug Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Lastnost ${safelyStringifyUnknownValue(key)} ni dovoljena. Odstranite jo ali uporabite drug Type.`;
  }
  return `Lastnost ${safelyStringifyUnknownValue(key)} ni veljavna.`;
};

/** Formats a DiscriminatedUnionError in Slovene. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Razločevalna lastnost ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} mora biti podatkovna lastnost.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} mora biti lastna lastnost.`;
      }
      return `${property} mora biti naštevna.`;
    }
    case "Discriminator":
      return `Razločevalna lastnost ${safelyStringifyUnknownValue(error.reason.key)} ima nepričakovano vrednost ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Izbrana različica ${safelyStringifyUnknownValue(error.reason.discriminator)} ni veljavna.`;
  }
};

/** Formats a JsonValueError in Slovene. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Vrednost ${safelyStringifyUnknownValue(issue.value)} ni vrednost JSON.`;
    case "NonFiniteNumber":
      return "Število JSON mora biti končno.";
    case "UnexpectedPrototype":
      return "Vrednost je objekt, vendar mora biti objekt JsonValue navaden objekt ali imeti prototip null.";
    case "Accessor":
      return "Lastnost JSON mora biti podatkovna lastnost. Pred uporabo tega Type pretvorite vrednosti dostopnikov v navadne podatke ali uporabite drug Type.";
    case "NonEnumerable":
      return "Lastnost objekta JSON mora biti naštevna. Odstranite jo ali uporabite drug Type.";
    case "SymbolProperty":
      return "Ključ lastnosti objekta JSON mora biti niz. Odstranite lastnost s simbolom ali uporabite drug Type.";
    case "Hole":
      return "Element polja JSON manjka.";
    case "ExcessProperty":
      return "Dodatna lastnost polja JSON ni dovoljena. Odstranite jo ali uporabite drug Type.";
    case "CircularReference":
      return "JsonValue ne sme vsebovati krožnih sklicev.";
  }
};

/** Formats a JsonError in Slovene. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Vrednosti ${safelyStringifyUnknownValue(error.value)} ni mogoče razčleniti v JsonValue.`;
