/**
 * Croatian Evolu Type error formatters.
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
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne odgovara literalu predloška.`;

/** Formats a Number TypeOfError in Croatian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Croatian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Croatian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Croatian. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije logička vrijednost. Upotrijebite true ili false.`;

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

/** Formats a ValidDateError in Croatian. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date nije valjan.";

/** Formats an InstanceOfError in Croatian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije instanca klase ${error.constructorName}.`;

/** Formats a LiteralError in Croatian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije strogo jednaka očekivanom literalu: ${String(error.expected)}.`;

/** Formats a UnionError in Croatian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Vrijednost ne odgovara nijednoj dopuštenoj varijanti.";

/** Formats a DateIsoError in Croatian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije kanonski ISO niz znakova za datum i vrijeme.`;

/** Formats a PlainDateIsoError in Croatian. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani kalendarski datum u formatu YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Croatian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date se ne može predstaviti kao DateIso.";

/** Formats a DateIsoFromRfc3339Error in Croatian. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije datum i vrijeme u podržanom formatu RFC 3339. Upotrijebite vrijednost poput "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Croatian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti kanonski decimalni niz znakova.`;

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
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Int64 niz znakova.`;

/** Formats an IdentifierError in Croatian. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije identifikator u formatu ${error.casing}.`;

/** Formats a CapitalizedError in Croatian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora počinjati velikim slovom.`;

/** Formats an UncapitalizedError in Croatian. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne smije počinjati velikim slovom.`;

/** Formats an UppercasedError in Croatian. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti napisana velikim slovima.`;

/** Formats a LowercasedError in Croatian. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti napisana malim slovima.`;

/** Formats a TrimmedError in Croatian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne smije imati razmake na početku ni na kraju.`;

/** Formats a WellFormedError in Croatian. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti ispravno oblikovan Unicode tekst.`;

/** Formats a NormalizedError in Croatian. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti u Unicode normalizacijskom obliku ${error.form}.`;

/** Formats a StartsWithError in Croatian. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora počinjati s ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Croatian. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora završavati s ${safelyStringifyUnknownValue(error.suffix)}.`;

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
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Base64Url niz znakova.`;

/** Formats a Base64Error in Croatian. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Base64 niz znakova.`;

/** Formats a HexError in Croatian. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije heksadecimalni niz znakova napisan malim slovima s parnim brojem znamenaka.`;

/** Formats a NameError in Croatian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Name.`;

/** Formats an EmailError in Croatian. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjana adresa e-pošte.`;

/** Formats a HostnameError in Croatian. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjano ime hosta napisano malim slovima.`;

/** Formats an Ipv4AddressError in Croatian. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjana IPv4 adresa.`;

/** Formats an Ipv6AddressError in Croatian. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije kanonska IPv6 adresa.`;

/** Formats an Ipv6AddressFromStringError in Croatian. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjana IPv6 adresa.`;

/** Formats a PhoneNumberE164Error in Croatian. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije telefonski broj u formatu E.164.`;

/** Formats an IbanError in Croatian. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani IBAN napisan velikim slovima bez razmaka.`;

/** Formats a MnemonicError in Croatian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjana engleska BIP39 mnemonička fraza.`;

/** Formats an IdError in Croatian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Id.`;

/** Formats a TableIdError in Croatian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije valjani Id za tablicu ${error.table}.`;

/** Formats a UuidError in Croatian. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije kanonski UUID napisan malim slovima.`;

/** Formats a UuidVersionError in Croatian. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije UUID verzije ${error.version}.`;

/** Formats a NonNegativeError in Croatian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativna (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Croatian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nenegativni decimalni niz znakova.`;

/** Formats a PositiveError in Croatian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivna (> 0).`;

/** Formats a PositiveDecimalStringError in Croatian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti pozitivni decimalni niz znakova.`;

/** Formats a NonPositiveError in Croatian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivna (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Croatian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti nepozitivni decimalni niz znakova.`;

/** Formats a NegativeError in Croatian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti negativna (< 0).`;

/** Formats a NegativeDecimalStringError in Croatian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti negativni decimalni niz znakova.`;

/** Formats an IntError in Croatian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora biti siguran cijeli broj.`;

/** Formats an IntFromStringError in Croatian. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije cijeli broj u dekadskom zapisu.`;

/** Formats a FiniteNumberFromStringError in Croatian. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije broj u dekadskom zapisu.`;

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

/** Formats a NonEmptyArrayError in Croatian. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} mora sadržavati barem jedan element.`;

/** Formats a UniqueError in Croatian. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ima jednake elemente na indeksima ${error.previousIndex} i ${error.index}.`;

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
      return `Ključ Map-a na indeksu ${issue.index} nije valjan.`;
    case "Value":
      return `Vrijednost Map-a na indeksu ${issue.index} nije valjana.`;
    case "Collision":
      return `Ključevi Map-a na indeksima ${issue.previousIndex} i ${issue.index} dekodiraju se u isti ključ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
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
    return `Torka mora imati duljinu od ${error.reason.expected}, ali vrijednost ima duljinu od ${error.reason.actual}.`;
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

/** Formats a MinEntriesError in Croatian. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} ne zadovoljava najmanji broj unosa od ${error.min}.`;

/** Formats a MaxEntriesError in Croatian. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} premašuje najveći broj unosa od ${error.max}.`;

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
    return "Ključ svojstva Object-a mora biti niz znakova. Uklonite svojstvo sa simbolom ili upotrijebite drugi Type.";
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

/** Formats a DataError in Croatian. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Vrijednost ${safelyStringifyUnknownValue(issue.value)} nije Data.`;
    case "UnexpectedPrototype":
      return `Data vrijednost tipa ${issue.container} ima neočekivan prototip.`;
    case "Accessor":
      return "Data svojstvo mora biti podatkovno svojstvo. Prije upotrebe ovog Type-a pretvorite vrijednosti pristupnika u obične podatke ili upotrijebite drugi Type.";
    case "NonEnumerable":
      return "Svojstvo Data objekta mora biti nabrojivo. Uklonite ga ili upotrijebite drugi Type.";
    case "SymbolProperty":
      return "Ključ svojstva Data objekta mora biti niz znakova. Uklonite svojstvo sa simbolom ili upotrijebite drugi Type.";
    case "Hole":
      return "Element Data polja nedostaje.";
    case "InvalidUint8Array":
      return "Data Uint8Array mora imati ArrayBuffer koji nije odvojen i mora biti unutar njegovih granica.";
    case "ExcessProperty":
      return `Data vrijednost tipa ${issue.container} ne smije imati dodatna vlastita svojstva. Uklonite svojstvo ili upotrijebite drugi Type.`;
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
      return "Ključ svojstva JSON objekta mora biti niz znakova. Uklonite svojstvo sa simbolom ili upotrijebite drugi Type.";
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

/** Formats a ByteSizeLiteralError in Croatian. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije literal veličine u bajtovima. Upotrijebite vrijednost poput "512KiB" ili "1MiB".`;

/** Formats a ByteLengthError in Croatian. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Vrijednost -0 nije duljina u bajtovima. Umjesto nje upotrijebite 0.";

/** Formats a ByteLengthFromStringError in Croatian. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije duljina u bajtovima. Upotrijebite broj bajtova ili literal poput 10MiB.`;

/** Formats a DurationLiteralError in Croatian. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije literal trajanja. Upotrijebite vrijednost poput "500ms" ili "1.5s".`;

/** Formats a PercentageLiteralError in Croatian. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Vrijednost ${safelyStringifyUnknownValue(error.value)} nije literal postotka. Upotrijebite vrijednost poput "50%" ili "12.5%".`;
