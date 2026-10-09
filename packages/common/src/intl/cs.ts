/**
 * Czech Evolu Type error formatters.
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

const formatValueMustBe = (value: unknown, expected: string): string =>
  `Hodnota ${safelyStringifyUnknownValue(value)} musí být ${expected}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Hodnota ${safelyStringifyUnknownValue(reason.value)} není objekt.`
    : "Hodnota je objekt, ale Output typu Object musí být prostý objekt nebo mít prototyp null.";

/** Formats a NeverError in Czech. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} není platná pro typ Never.`;

/** Formats a String TypeOfError in Czech. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> = (
  error,
) => formatValueMustBe(error.value, "text");

/** Formats a TemplateLiteralError in Czech. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} neodpovídá šablonovému řetězci.`;

/** Formats a Number TypeOfError in Czech. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> = (
  error,
) => formatValueMustBe(error.value, "číslo");

/** Formats a BigInt TypeOfError in Czech. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> = (
  error,
) => formatValueMustBe(error.value, "celé číslo typu bigint");

/** Formats a Boolean TypeOfError in Czech. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> = (
  error,
) => formatValueMustBe(error.value, "logická hodnota");

/** Formats a BooleanFromStringError in Czech. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být true nebo false.`;

/** Formats a Symbol TypeOfError in Czech. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> = (
  error,
) => formatValueMustBe(error.value, "symbol");

/** Formats a Function TypeOfError in Czech. */
export const formatFunctionError: TypeErrorFormatter<
  TypeOfError<"Function">
> = (error) => formatValueMustBe(error.value, "funkce");

/** Formats an EvoluTypeError in Czech. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být Evolu Type.`;

/** Formats an ObjectTagError in Czech. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nemá očekávaný tag objektu ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Czech. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Datum je neplatné.";

/** Formats an InstanceOfError in Czech. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být instancí ${error.constructorName}.`;

/** Formats a LiteralError in Czech. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} se musí přesně rovnat očekávanému literálu ${String(error.expected)}.`;

/** Formats a UnionError in Czech. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Hodnota neodpovídá žádné z povolených variant.";

/** Formats a DateIsoError in Czech. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec s datem a časem v kanonickém formátu ISO.`;

/** Formats a PlainDateIsoError in Czech. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné kalendářní datum ve formátu YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Czech. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Datum nelze převést na DateIso.";

/** Formats a DateIsoFromRfc3339Error in Czech. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být datum a čas v podporovaném formátu RFC 3339. Použijte například "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Czech. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být kanonický řetězec představující desetinné číslo.`;

/** Formats an Int64Error in Czech. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné 64bitové celé číslo se znaménkem (Int64).`;

/** Formats a UInt64Error in Czech. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné 64bitové celé číslo bez znaménka (UInt64).`;

/** Formats an Int64StringError in Czech. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný řetězec Int64.`;

/** Formats an IdentifierError in Czech. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} není identifikátor ve formátu ${error.casing}.`;

/** Formats a CapitalizedError in Czech. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí začínat velkým písmenem.`;

/** Formats an UncapitalizedError in Czech. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} nesmí začínat velkým písmenem.`;

/** Formats an UppercasedError in Czech. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být velkými písmeny.`;

/** Formats a LowercasedError in Czech. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být malými písmeny.`;

/** Formats a TrimmedError in Czech. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Text ${safelyStringifyUnknownValue(error.value)} nesmí obsahovat bílé znaky na začátku ani na konci.`;

/** Formats a WellFormedError in Czech. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být správně utvořený text Unicode.`;

/** Formats a NormalizedError in Czech. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být v normalizační formě Unicode ${error.form}.`;

/** Formats a StartsWithError in Czech. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí začínat na ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Czech. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí končit na ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats a MinLengthError in Czech. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  typeof error.value === "string" && error.min === 1
    ? "Text nesmí být prázdný."
    : `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mít délku alespoň ${error.min}.`;

/** Formats a MaxLengthError in Czech. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} smí mít délku nejvýše ${error.max}.`;

/** Formats a LengthError in Czech. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mít délku přesně ${error.exact}.`;

/** Formats a RegexError in Czech. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} neodpovídá regulárnímu výrazu /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Czech. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný řetězec Base64Url.`;

/** Formats a Base64Error in Czech. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný řetězec Base64.`;

/** Formats a HexError in Czech. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být hexadecimální řetězec zapsaný malými písmeny se sudým počtem číslic.`;

/** Formats a NameError in Czech. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný název.`;

/** Formats an EmailError in Czech. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platná e-mailová adresa.`;

/** Formats a HostnameError in Czech. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný název hostitele zapsaný malými písmeny.`;

/** Formats an Ipv4AddressError in Czech. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platná adresa IPv4.`;

/** Formats an Ipv6AddressError in Czech. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být kanonická adresa IPv6.`;

/** Formats an Ipv6AddressFromStringError in Czech. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platná adresa IPv6.`;

/** Formats a PhoneNumberE164Error in Czech. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být telefonní číslo ve formátu E.164.`;

/** Formats an IbanError in Czech. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platný IBAN zapsaný velkými písmeny bez mezer.`;

/** Formats a SimplePasswordError in Czech. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Heslo nesmí obsahovat bílé znaky na začátku ani na konci.";
    case "TooLong":
      return "Heslo smí mít délku nejvýše 64.";
    case "TooShort":
      return "Heslo musí mít délku alespoň 8.";
  }
};

/** Formats a MnemonicError in Czech. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Hodnota musí být platná anglická BIP39 mnemotechnická fráze.";

/** Formats an IdError in Czech. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné Id.`;

/** Formats a TableIdError in Czech. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být platné Id pro tabulku ${safelyStringifyUnknownValue(error.table)}.`;

/** Formats a UuidError in Czech. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být kanonické UUID zapsané malými písmeny.`;

/** Formats a UuidVersionError in Czech. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být UUID verze ${error.version}.`;

/** Formats a NonNegativeError in Czech. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být nezáporná (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Czech. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující nezáporné desetinné číslo.`;

/** Formats a PositiveError in Czech. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být kladná (> 0).`;

/** Formats a PositiveDecimalStringError in Czech. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující kladné desetinné číslo.`;

/** Formats a NonPositiveError in Czech. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být nekladná (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Czech. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující nekladné desetinné číslo.`;

/** Formats a NegativeError in Czech. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být záporná (< 0).`;

/** Formats a NegativeDecimalStringError in Czech. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být řetězec představující záporné desetinné číslo.`;

/** Formats an IntError in Czech. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být bezpečné celé číslo.`;

/** Formats an IntFromStringError in Czech. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být celé číslo v desítkovém zápisu.`;

/** Formats a FiniteNumberFromStringError in Czech. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být číslo v desítkovém zápisu.`;

/** Formats a GreaterThanError in Czech. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být větší než ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Czech. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být větší nebo rovna ${error.min}.`;

/** Formats a LessThanError in Czech. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být menší než ${error.max}.`;

/** Formats a LessThanOrEqualToError in Czech. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být menší nebo rovna ${error.max}.`;

/** Formats a NonNaNError in Czech. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Hodnota nesmí být NaN.";

/** Formats a FiniteError in Czech. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být konečné číslo.`;

/** Formats a MultipleOfError in Czech. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být násobkem čísla ${error.divisor}.`;

/** Formats a BetweenError in Czech. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí být v rozsahu od ${error.min} do ${error.max} včetně.`;

/** Formats an ArrayError in Czech. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není pole.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `V poli chybí prvek na indexu ${issue.index}.`;
    case "Accessor":
      return `Prvek pole na indexu ${issue.index} musí být datová vlastnost.`;
    case "ExcessProperty":
      return "Pole obsahuje nepovolenou vlastní vlastnost. Odstraňte ji nebo použijte jiný Type.";
    case "Element":
      return `Prvek pole na indexu ${issue.index} není platný.`;
  }
};

/** Formats a NonEmptyArrayError in Czech. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí obsahovat alespoň jednu položku.`;

/** Formats a UniqueError in Czech. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} obsahuje shodné položky na indexech ${error.previousIndex} a ${error.index}.`;

/** Formats a SetError in Czech. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Set obsahuje nepovolenou vlastní vlastnost ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `Prvek Setu na indexu ${issue.index} není platný.`;
  }
};

/** Formats a MapError in Czech. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Map obsahuje nepovolenou vlastní vlastnost ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
      return `Klíč Mapu na indexu ${issue.index} není platný.`;
    case "Value":
      return `Hodnota Mapu na indexu ${issue.index} není platná.`;
    case "Collision":
      return `Klíče Mapu na indexech ${issue.previousIndex} a ${issue.index} se dekódují na stejný klíč ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Czech. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple musí mít délku ${error.reason.expected}, ale hodnota má délku ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `V Tuple chybí prvek na indexu ${issue.index}.`;
    case "Accessor":
      return `Prvek Tuple na indexu ${issue.index} musí být datová vlastnost.`;
    case "ExcessProperty":
      return "Tuple obsahuje nepovolenou vlastní vlastnost. Odstraňte ji nebo použijte jiný Type.";
    case "Element":
      return `Prvek Tuple na indexu ${issue.index} není platný.`;
  }
};

/** Formats a RecordError in Czech. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Hodnota ${safelyStringifyUnknownValue(error.reason.value)} není Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Hodnota je objekt, ale Output typu Record musí být prostý objekt nebo mít prototyp null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Klíč vlastnosti ${safelyStringifyUnknownValue(issue.key)} není platný.`;
    case "Value":
      return `Hodnota vlastnosti ${safelyStringifyUnknownValue(issue.key)} není platná.`;
    case "Accessor":
      return `Vlastnost Recordu ${safelyStringifyUnknownValue(issue.key)} musí být datová vlastnost.`;
    case "NonEnumerable":
      return `Vlastnost Recordu ${safelyStringifyUnknownValue(issue.key)} musí být enumerovatelná (enumerable).`;
    case "Collision":
      return `Klíče Recordu ${safelyStringifyUnknownValue(issue.previousKey)} a ${safelyStringifyUnknownValue(issue.key)} se dekódují na stejný klíč ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinEntriesError in Czech. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} musí mít počet položek alespoň ${error.min}.`;

/** Formats a MaxEntriesError in Czech. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} smí mít počet položek nejvýše ${error.max}.`;

/** Formats an ObjectError in Czech. */
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
        return "Vlastnost typu Object musí být datová vlastnost. Před použitím tohoto Type materializujte hodnotu accessoru do prostých dat nebo použijte jiný Type.";
      case "NonEnumerable":
        return "Vlastnost typu Object musí být enumerovatelná (enumerable). Nastavte ji jako enumerovatelnou nebo použijte jiný Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Povinná vlastnost ${safelyStringifyUnknownValue(key)} chybí.`;
  }
  if (typeof key === "symbol") {
    return "Klíč vlastnosti typu Object musí být text. Odstraňte symbolovou vlastnost nebo použijte jiný Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Vlastnost ${safelyStringifyUnknownValue(key)} není povolena. Odstraňte ji nebo použijte jiný Type.`;
  }
  return `Vlastnost ${safelyStringifyUnknownValue(key)} není platná.`;
};

/** Formats a DiscriminatedUnionError in Czech. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Rozlišovací vlastnost ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} musí být datová vlastnost.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} musí být vlastní vlastnost.`;
      }
      return `${property} musí být enumerovatelná (enumerable).`;
    }
    case "Discriminator":
      return `Rozlišovací vlastnost ${safelyStringifyUnknownValue(error.reason.key)} má neočekávanou hodnotu ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Vybraná varianta ${safelyStringifyUnknownValue(error.reason.discriminator)} není platná.`;
  }
};

/** Formats a DataError in Czech. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Hodnota ${safelyStringifyUnknownValue(issue.value)} není Data.`;
    case "UnexpectedPrototype":
      return `Hodnota typu ${issue.container} v Data má neočekávaný prototyp.`;
    case "Accessor":
      return "Vlastnost v Data musí být datová vlastnost. Před použitím tohoto Type materializujte hodnotu accessoru do prostých dat nebo použijte jiný Type.";
    case "NonEnumerable":
      return "Vlastnost objektu v Data musí být enumerovatelná (enumerable). Odstraňte ji nebo použijte jiný Type.";
    case "SymbolProperty":
      return "Klíč vlastnosti objektu v Data musí být text. Odstraňte symbolovou vlastnost nebo použijte jiný Type.";
    case "Hole":
      return "Prvek pole v Data chybí.";
    case "InvalidUint8Array":
      return "Uint8Array v Data musí mít ArrayBuffer, který není odpojený (detached), a musí ležet v jeho mezích.";
    case "ExcessProperty":
      return `Hodnota typu ${issue.container} v Data nesmí mít nadbytečné vlastní vlastnosti. Odstraňte vlastnost nebo použijte jiný Type.`;
  }
};

/** Formats a JsonValueError in Czech. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Hodnota ${safelyStringifyUnknownValue(issue.value)} není JSON hodnota.`;
    case "NonFiniteNumber":
      return "Číslo v JSON musí být konečné.";
    case "UnexpectedPrototype":
      return "Hodnota je objekt, ale objekt v JsonValue musí být prostý objekt nebo mít prototyp null.";
    case "Accessor":
      return "Vlastnost objektu JSON musí být datová vlastnost. Před použitím tohoto Type materializujte hodnotu accessoru do prostých dat nebo použijte jiný Type.";
    case "NonEnumerable":
      return "Vlastnost objektu JSON musí být enumerovatelná (enumerable). Odstraňte ji nebo použijte jiný Type.";
    case "SymbolProperty":
      return "Klíč vlastnosti objektu JSON musí být text. Odstraňte symbolovou vlastnost nebo použijte jiný Type.";
    case "Hole":
      return "V poli JSON chybí prvek.";
    case "ExcessProperty":
      return "Pole JSON obsahuje nepovolenou vlastní vlastnost. Odstraňte ji nebo použijte jiný Type.";
    case "CircularReference":
      return "JsonValue nesmí obsahovat cyklické reference.";
  }
};

/** Formats a JsonError in Czech. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Hodnotu ${safelyStringifyUnknownValue(error.value)} nelze parsovat jako JsonValue.`;

/** Formats a ByteSizeLiteralError in Czech. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} není literál velikosti v bajtech. Použijte například "512KiB" nebo "1MiB".`;

/** Formats a ByteLengthError in Czech. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Hodnota -0 není délka v bajtech. Použijte místo ní 0.";

/** Formats a ByteLengthFromStringError in Czech. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} není délka v bajtech. Použijte počet bajtů nebo literál, například 10MiB.`;

/** Formats a DurationLiteralError in Czech. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} není literál délky trvání. Použijte například "500ms" nebo "1.5s".`;

/** Formats a PercentageLiteralError in Czech. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Hodnota ${safelyStringifyUnknownValue(error.value)} není procentní literál. Použijte například "50%" nebo "12.5%".`;
