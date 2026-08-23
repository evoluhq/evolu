/**
 * Croatian Evolu Type error formatters.
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
  const typeOf = {
    String: "niz znakova",
    Number: "broj",
    BigInt: "bigint",
    Boolean: "logička vrijednost",
    Symbol: "simbol",
    Function: "funkcija",
  }[error.expected];

  return `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Vrijednost ${safelyStringifyUnknownValue(reason.value)} nije objekt.`
    : "Vrijednost je objekt, ali izlaz tipa Object mora biti običan objekt ili imati prototip null.";

/** Formats a NeverError in Croatian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjana za tip Never.`;

/** Formats a String TypeOfError in Croatian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Croatian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne odgovara predlošku stringa.`;

/** Formats a Number TypeOfError in Croatian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Croatian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Croatian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a Symbol TypeOfError in Croatian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Croatian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Croatian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije Evolu Type.`;

/** Formats an ObjectTagError in Croatian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nema očekivanu oznaku objekta ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in Croatian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije instanca klase ${error.constructorName}.`;

/** Formats a LiteralError in Croatian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije strogo jednaka očekivanom literalu: ${globalThis.String(error.expected)}.`;

/** Formats a UnionError in Croatian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Vrijednost ne odgovara nijednoj dopuštenoj varijanti.";

/** Formats a DateIsoError in Croatian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije kanonski ISO niz datuma i vremena.`;

/** Formats a DateIsoFromDateError in Croatian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date se ne može predstaviti kao DateIso.";

/** Formats a DecimalStringError in Croatian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti kanonski decimalni niz.`;

/** Formats an Int64Error in Croatian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani predznačeni 64-bitni cijeli broj (Int64).`;

/** Formats a UInt64Error in Croatian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani nepredznačeni 64-bitni cijeli broj (UInt64).`;

/** Formats an Int64StringError in Croatian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Int64 niz.`;

/** Formats a CapitalizedError in Croatian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora počinjati velikim slovom.`;

/** Formats a TrimmedError in Croatian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne smije imati razmake na početku ni na kraju.`;

/** Formats a MinLengthError in Croatian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne zadovoljava najmanju duljinu od ${error.min}.`;

/** Formats a MaxLengthError in Croatian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} premašuje najveću duljinu od ${error.max}.`;

/** Formats a LengthError in Croatian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nema potrebnu duljinu od ${error.exact}.`;

/** Formats a RegexError in Croatian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne odgovara /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Croatian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Base64Url niz.`;

/** Formats a NameError in Croatian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Name.`;

/** Formats a MnemonicError in Croatian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjana engleska BIP39 mnemonika.`;

/** Formats an IdError in Croatian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Id.`;

/** Formats a TableIdError in Croatian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Id za tablicu ${error.table}.`;

/** Formats a NonNegativeError in Croatian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativna (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Croatian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativni decimalni niz.`;

/** Formats a PositiveError in Croatian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivna (> 0).`;

/** Formats a PositiveDecimalStringError in Croatian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivni decimalni niz.`;

/** Formats a NonPositiveError in Croatian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivna (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Croatian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivni decimalni niz.`;

/** Formats a NegativeError in Croatian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti negativna (< 0).`;

/** Formats a NegativeDecimalStringError in Croatian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti negativni decimalni niz.`;

/** Formats an IntError in Croatian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti siguran cijeli broj.`;

/** Formats a GreaterThanError in Croatian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti veća od ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Croatian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti veća ili jednaka ${error.min}.`;

/** Formats a LessThanError in Croatian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti manja od ${error.max}.`;

/** Formats a LessThanOrEqualToError in Croatian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti manja ili jednaka ${error.max}.`;

/** Formats a NonNaNError in Croatian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Vrijednost ne smije biti NaN.";

/** Formats a FiniteError in Croatian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti konačna.`;

/** Formats a MultipleOfError in Croatian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti višekratnik broja ${error.divisor}.`;

/** Formats a BetweenError in Croatian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti između ${error.min} i ${error.max}, uključujući granice.`;

/** Formats an ArrayError in Croatian. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Vrijednost ${safelyStringifyUnknownValue(error.reason.value)} nije polje.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Element polja na indeksu ${issue.index} nedostaje.`;
    case "Accessor":
      return `Element polja na indeksu ${issue.index} mora biti podatkovno svojstvo.`;
    case "ExcessProperty":
      return "Dodatno svojstvo polja nije dopušteno. Uklonite ga ili upotrijebite drugi Type.";
    case "Element":
      return `Element polja na indeksu ${issue.index} nije valjan.`;
  }
};

/** Formats a SetError in Croatian. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Vrijednost ${safelyStringifyUnknownValue(error.reason.value)} nije Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Dodatno svojstvo Set-a ${safelyStringifyUnknownValue(issue.key)} nije dopušteno.`;
    case "Element":
      return `Element Set-a na indeksu ${issue.index} nije valjan.`;
  }
};

/** Formats a MapError in Croatian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Vrijednost ${safelyStringifyUnknownValue(error.reason.value)} nije Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Dodatno svojstvo Map-a ${safelyStringifyUnknownValue(issue.key)} nije dopušteno.`;
    case "Key":
    case "Value":
      return `Element Map-a na indeksu ${issue.index} nije valjan.`;
    case "Collision":
      return `Ključevi Map-a ${safelyStringifyUnknownValue(issue.previousKey)} i ${safelyStringifyUnknownValue(issue.key)} dekodiraju se u isti ključ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Croatian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Vrijednost ${safelyStringifyUnknownValue(error.reason.value)} nije torka.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Torka mora sadržavati točno ${error.reason.expected} elemenata, ali vrijednost sadrži ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Element torke na indeksu ${issue.index} nedostaje.`;
    case "Accessor":
      return `Element torke na indeksu ${issue.index} mora biti podatkovno svojstvo.`;
    case "ExcessProperty":
      return "Dodatno svojstvo torke nije dopušteno. Uklonite ga ili upotrijebite drugi Type.";
    case "Element":
      return `Element torke na indeksu ${issue.index} nije valjan.`;
  }
};

/** Formats a RecordError in Croatian. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Vrijednost ${safelyStringifyUnknownValue(error.reason.value)} nije Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Vrijednost je objekt, ali izlaz tipa Record mora biti običan objekt ili imati prototip null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Ključ svojstva ${safelyStringifyUnknownValue(issue.key)} nije valjan.`;
    case "Value":
      return `Vrijednost svojstva ${safelyStringifyUnknownValue(issue.key)} nije valjana.`;
    case "Accessor":
      return `Svojstvo Record-a ${safelyStringifyUnknownValue(issue.key)} mora biti podatkovno svojstvo.`;
    case "NonEnumerable":
      return `Svojstvo Record-a ${safelyStringifyUnknownValue(issue.key)} mora biti nabrojivo.`;
    case "Collision":
      return `Ključevi Record-a ${safelyStringifyUnknownValue(issue.previousKey)} i ${safelyStringifyUnknownValue(issue.key)} dekodiraju se u isti ključ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Croatian. */
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
        return "Svojstvo Object-a mora biti podatkovno svojstvo. Prije upotrebe ovog Type-a pretvorite vrijednosti pristupnika u obične podatke ili upotrijebite drugi Type.";
      case "NonEnumerable":
        return "Svojstvo Object-a mora biti nabrojivo. Učinite ga nabrojivim ili upotrijebite drugi Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Obavezno svojstvo ${safelyStringifyUnknownValue(key)} nedostaje.`;
  }
  if (typeof key === "symbol") {
    return "Ključ svojstva Object-a mora biti niz. Uklonite svojstvo sa simbolom ili upotrijebite drugi Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Svojstvo ${safelyStringifyUnknownValue(key)} nije dopušteno. Uklonite ga ili upotrijebite drugi Type.`;
  }
  return `Svojstvo ${safelyStringifyUnknownValue(key)} nije valjano.`;
};

/** Formats a DiscriminatedUnionError in Croatian. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Svojstvo diskriminatora ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} mora biti podatkovno svojstvo.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} mora biti vlastito svojstvo.`;
      }
      return `${property} mora biti nabrojivo.`;
    }
    case "Discriminator":
      return `Svojstvo diskriminatora ${safelyStringifyUnknownValue(error.reason.key)} ima neočekivanu vrijednost ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Odabrana varijanta ${safelyStringifyUnknownValue(error.reason.discriminator)} nije valjana.`;
  }
};

/** Formats a JsonValueError in Croatian. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Vrijednost ${safelyStringifyUnknownValue(issue.value)} nije JSON vrijednost.`;
    case "NonFiniteNumber":
      return "JSON broj mora biti konačan.";
    case "UnexpectedPrototype":
      return "Vrijednost je objekt, ali objekt JsonValue mora biti običan objekt ili imati prototip null.";
    case "Accessor":
      return "JSON svojstvo mora biti podatkovno svojstvo. Prije upotrebe ovog Type-a pretvorite vrijednosti pristupnika u obične podatke ili upotrijebite drugi Type.";
    case "NonEnumerable":
      return "Svojstvo JSON objekta mora biti nabrojivo. Uklonite ga ili upotrijebite drugi Type.";
    case "SymbolProperty":
      return "Ključ svojstva JSON objekta mora biti niz. Uklonite svojstvo sa simbolom ili upotrijebite drugi Type.";
    case "Hole":
      return "Element JSON polja nedostaje.";
    case "ExcessProperty":
      return "Dodatno svojstvo JSON polja nije dopušteno. Uklonite ga ili upotrijebite drugi Type.";
    case "CircularReference":
      return "JsonValue ne smije sadržavati kružne reference.";
  }
};

/** Formats a JsonError in Croatian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne može se analizirati kao JsonValue.`;
