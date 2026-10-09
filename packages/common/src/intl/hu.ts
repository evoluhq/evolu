/**
 * Hungarian Evolu Type error formatters.
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

const typeOfNameByExpected = {
  String: "karakterlánc",
  Number: "szám",
  BigInt: "BigInt",
  Boolean: "logikai érték",
  Symbol: "szimbólum",
  Function: "függvény",
} as const;

const formatTypeOfError = (
  error: TypeOfError<keyof typeof typeOfNameByExpected>,
): string =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem ${typeOfNameByExpected[error.expected]}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `A(z) ${safelyStringifyUnknownValue(reason.value)} érték nem objektum.`
    : "Az érték objektum, de az Object Outputnak egyszerű objektumnak kell lennie, vagy null prototípussal kell rendelkeznie.";

/** Formats a NeverError in Hungarian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes a Never típushoz.`;

/** Formats a String TypeOfError in Hungarian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Hungarian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem felel meg a sablonliterálnak.`;

/** Formats a Number TypeOfError in Hungarian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Hungarian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Hungarian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Hungarian. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem logikai érték. Használja a true vagy false értéket.`;

/** Formats a Symbol TypeOfError in Hungarian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Hungarian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Hungarian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem Evolu Type.`;

/** Formats an ObjectTagError in Hungarian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem rendelkezik a várt ${safelyStringifyUnknownValue(error.expected)} objektumcímkével.`;

/** Formats a ValidDateError in Hungarian. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "A Date érvénytelen.";

/** Formats an InstanceOfError in Hungarian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem ${error.constructorName} példány.`;

/** Formats a LiteralError in Hungarian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem szigorúan egyenlő a várt literállal: ${String(error.expected)}.`;

/** Formats a UnionError in Hungarian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Az érték nem felel meg egyik engedélyezett változatnak sem.";

/** Formats a DateIsoError in Hungarian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem kanonikus ISO dátum-idő karakterlánc.`;

/** Formats a PlainDateIsoError in Hungarian. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes naptári dátum YYYY-MM-DD formátumban.`;

/** Formats a DateIsoFromDateError in Hungarian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "A Date nem ábrázolható DateIso-ként.";

/** Formats a DateIsoFromRfc3339Error in Hungarian. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem támogatott, RFC 3339 szerinti dátum-idő. Használjon például "2024-01-01T12:00:00Z" értéket.`;

/** Formats a DecimalStringError in Hungarian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek kanonikus decimális karakterláncnak kell lennie.`;

/** Formats an Int64Error in Hungarian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes előjeles 64 bites egész szám (Int64).`;

/** Formats a UInt64Error in Hungarian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes előjel nélküli 64 bites egész szám (UInt64).`;

/** Formats an Int64StringError in Hungarian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Int64 karakterlánc.`;

/** Formats an IdentifierError in Hungarian. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem ${error.casing} azonosító.`;

/** Formats a CapitalizedError in Hungarian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nagybetűvel kell kezdődnie.`;

/** Formats an UncapitalizedError in Hungarian. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem kezdődhet nagybetűvel.`;

/** Formats an UppercasedError in Hungarian. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nagybetűsnek kell lennie.`;

/** Formats a LowercasedError in Hungarian. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek kisbetűsnek kell lennie.`;

/** Formats a TrimmedError in Hungarian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nem lehetnek kezdő vagy záró szóközei.`;

/** Formats a WellFormedError in Hungarian. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek jól formált Unicode-szövegnek kell lennie.`;

/** Formats a NormalizedError in Hungarian. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek ${error.form} Unicode-normalizálási formában kell lennie.`;

/** Formats a StartsWithError in Hungarian. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek a(z) ${safelyStringifyUnknownValue(error.prefix)} előtaggal kell kezdődnie.`;

/** Formats an EndsWithError in Hungarian. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek a(z) ${safelyStringifyUnknownValue(error.suffix)} utótaggal kell végződnie.`;

/** Formats a MinLengthError in Hungarian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem éri el a(z) ${error.min} minimális hosszúságot.`;

/** Formats a MaxLengthError in Hungarian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték meghaladja a(z) ${error.max} maximális hosszúságot.`;

/** Formats a LengthError in Hungarian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek pontosan ${error.exact} hosszúságúnak kell lennie.`;

/** Formats a RegexError in Hungarian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem felel meg a következő reguláris kifejezésnek: /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Hungarian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Base64Url karakterlánc.`;

/** Formats a Base64Error in Hungarian. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Base64 karakterlánc.`;

/** Formats a HexError in Hungarian. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem páros számú számjegyből álló, kisbetűs hexadecimális karakterlánc.`;

/** Formats a NameError in Hungarian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes név.`;

/** Formats an EmailError in Hungarian. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes e-mail-cím.`;

/** Formats a HostnameError in Hungarian. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes, kisbetűs állomásnév.`;

/** Formats an Ipv4AddressError in Hungarian. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes IPv4-cím.`;

/** Formats an Ipv6AddressError in Hungarian. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem kanonikus IPv6-cím.`;

/** Formats an Ipv6AddressFromStringError in Hungarian. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes IPv6-cím.`;

/** Formats a PhoneNumberE164Error in Hungarian. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem E.164 formátumú telefonszám.`;

/** Formats an IbanError in Hungarian. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes, szóközök nélküli, nagybetűs IBAN.`;

/** Formats a SimplePasswordError in Hungarian. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "A jelszónak nem lehetnek kezdő vagy záró szóközei.";
    case "TooLong":
      return "A jelszó meghaladja a 64 maximális hosszúságot.";
    case "TooShort":
      return "A jelszó nem éri el a 8 minimális hosszúságot.";
  }
};

/** Formats a MnemonicError in Hungarian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Az érték nem érvényes angol BIP39 mnemonikus kifejezés.";

/** Formats an IdError in Hungarian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Id.`;

/** Formats a TableIdError in Hungarian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem érvényes Id a(z) ${error.table} táblához.`;

/** Formats a UuidError in Hungarian. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem kanonikus, kisbetűs UUID.`;

/** Formats a UuidVersionError in Hungarian. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem ${error.version}. verziójú UUID.`;

/** Formats a NonNegativeError in Hungarian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nemnegatívnak kell lennie (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Hungarian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nemnegatív decimális karakterláncnak kell lennie.`;

/** Formats a PositiveError in Hungarian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek pozitívnak kell lennie (> 0).`;

/** Formats a PositiveDecimalStringError in Hungarian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek pozitív decimális karakterláncnak kell lennie.`;

/** Formats a NonPositiveError in Hungarian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nempozitívnak kell lennie (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Hungarian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nempozitív decimális karakterláncnak kell lennie.`;

/** Formats a NegativeError in Hungarian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek negatívnak kell lennie (< 0).`;

/** Formats a NegativeDecimalStringError in Hungarian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek negatív decimális karakterláncnak kell lennie.`;

/** Formats an IntError in Hungarian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek biztonságos egész számnak kell lennie.`;

/** Formats an IntFromStringError in Hungarian. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem decimális egész szám.`;

/** Formats a FiniteNumberFromStringError in Hungarian. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem decimális szám.`;

/** Formats a GreaterThanError in Hungarian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nagyobbnak kell lennie, mint ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Hungarian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek nagyobbnak vagy egyenlőnek kell lennie ${error.min} értéknél.`;

/** Formats a LessThanError in Hungarian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek kisebbnek kell lennie, mint ${error.max}.`;

/** Formats a LessThanOrEqualToError in Hungarian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek kisebbnek vagy egyenlőnek kell lennie ${error.max} értéknél.`;

/** Formats a NonNaNError in Hungarian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Az érték nem lehet NaN.";

/** Formats a FiniteError in Hungarian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek végesnek kell lennie.`;

/** Formats a MultipleOfError in Hungarian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek ${error.divisor} többszörösének kell lennie.`;

/** Formats a BetweenError in Hungarian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek ${error.min} és ${error.max} között kell lennie, a határokat is beleértve.`;

/** Formats an ArrayError in Hungarian. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem tömb.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Hiányzik egy tömbelem a(z) ${issue.index} indexen.`;
    case "Accessor":
      return `A(z) ${issue.index} indexen lévő tömbelemnek adattulajdonságnak kell lennie.`;
    case "ExcessProperty":
      return "Többlet Array-tulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.";
    case "Element":
      return `A(z) ${issue.index} indexen lévő tömbelem érvénytelen.`;
  }
};

/** Formats a NonEmptyArrayError in Hungarian. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} értéknek legalább egy elemet kell tartalmaznia.`;

/** Formats a UniqueError in Hungarian. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték egyenlő elemeket tartalmaz a(z) ${error.previousIndex} és ${error.index} indexen.`;

/** Formats a SetError in Hungarian. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} többlet Set-tulajdonság nem engedélyezett.`;
    case "Element":
      return `A(z) ${issue.index} indexen lévő Set-elem érvénytelen.`;
  }
};

/** Formats a MapError in Hungarian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} többlet Map-tulajdonság nem engedélyezett.`;
    case "Key":
      return `A(z) ${issue.index} indexen lévő Map-kulcs érvénytelen.`;
    case "Value":
      return `A(z) ${issue.index} indexen lévő Map-érték érvénytelen.`;
    case "Collision":
      return `A(z) ${issue.previousIndex} és ${issue.index} indexen lévő Map-kulcsok ugyanarra a(z) ${safelyStringifyUnknownValue(issue.outputKey)} kulcsra dekódolódnak.`;
  }
};

/** Formats a TupleError in Hungarian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `A Tuple-nak ${error.reason.expected} hosszúságúnak kell lennie, de az érték ${error.reason.actual} hosszúságú.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Hiányzik egy Tuple-elem a(z) ${issue.index} indexen.`;
    case "Accessor":
      return `A(z) ${issue.index} indexen lévő Tuple-elemnek adattulajdonságnak kell lennie.`;
    case "ExcessProperty":
      return "Többlet Tuple-tulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.";
    case "Element":
      return `A(z) ${issue.index} indexen lévő Tuple-elem érvénytelen.`;
  }
};

/** Formats a RecordError in Hungarian. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `A(z) ${safelyStringifyUnknownValue(error.reason.value)} érték nem Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Az érték objektum, de a Record Outputnak egyszerű objektumnak kell lennie, vagy null prototípussal kell rendelkeznie.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} tulajdonságkulcs érvénytelen.`;
    case "Value":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} tulajdonság értéke érvénytelen.`;
    case "Accessor":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} Record-tulajdonságnak adattulajdonságnak kell lennie.`;
    case "NonEnumerable":
      return `A(z) ${safelyStringifyUnknownValue(issue.key)} Record-tulajdonságnak felsorolhatónak kell lennie.`;
    case "Collision":
      return `A(z) ${safelyStringifyUnknownValue(issue.previousKey)} és ${safelyStringifyUnknownValue(issue.key)} Record-kulcs ugyanarra a(z) ${safelyStringifyUnknownValue(issue.outputKey)} kulcsra dekódolódik.`;
  }
};

/** Formats a MinEntriesError in Hungarian. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem éri el a(z) ${error.min} minimális bejegyzésszámot.`;

/** Formats a MaxEntriesError in Hungarian. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték meghaladja a(z) ${error.max} maximális bejegyzésszámot.`;

/** Formats an ObjectError in Hungarian. */
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
        return "Egy Object-tulajdonságnak adattulajdonságnak kell lennie. Az accessorértékeket a Type használata előtt alakítsa egyszerű adatokká, vagy használjon másik Type-ot.";
      case "NonEnumerable":
        return "Egy Object-tulajdonságnak felsorolhatónak kell lennie. Tegye felsorolhatóvá, vagy használjon másik Type-ot.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Hiányzik a kötelező ${safelyStringifyUnknownValue(key)} tulajdonság.`;
  }
  if (typeof key === "symbol") {
    return "Egy Object-tulajdonság kulcsának karakterláncnak kell lennie. Távolítsa el a szimbólumtulajdonságot, vagy használjon másik Type-ot.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `A(z) ${safelyStringifyUnknownValue(key)} tulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.`;
  }
  return `A(z) ${safelyStringifyUnknownValue(key)} tulajdonság érvénytelen.`;
};

/** Formats a DiscriminatedUnionError in Hungarian. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `A(z) ${safelyStringifyUnknownValue(error.reason.key)} diszkriminátor-tulajdonságnak`;
      if (error.reason.reason === "Accessor") {
        return `${property} adattulajdonságnak kell lennie.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} saját tulajdonságnak kell lennie.`;
      }
      return `${property} felsorolhatónak kell lennie.`;
    }
    case "Discriminator":
      return `A(z) ${safelyStringifyUnknownValue(error.reason.key)} diszkriminátor-tulajdonság értéke váratlan: ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `A kiválasztott ${safelyStringifyUnknownValue(error.reason.discriminator)} változat érvénytelen.`;
  }
};

/** Formats a DataError in Hungarian. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `A(z) ${safelyStringifyUnknownValue(issue.value)} érték nem Data.`;
    case "UnexpectedPrototype":
      return `Egy Data ${issue.container} prototípusa váratlan.`;
    case "Accessor":
      return "Egy Data-tulajdonságnak adattulajdonságnak kell lennie. Az accessorértékeket a Type használata előtt alakítsa egyszerű adatokká, vagy használjon másik Type-ot.";
    case "NonEnumerable":
      return "Egy Data Object-tulajdonságnak felsorolhatónak kell lennie. Távolítsa el, vagy használjon másik Type-ot.";
    case "SymbolProperty":
      return "Egy Data Object-tulajdonság kulcsának karakterláncnak kell lennie. Távolítsa el a szimbólumtulajdonságot, vagy használjon másik Type-ot.";
    case "Hole":
      return "Hiányzik egy Data Array-elem.";
    case "InvalidUint8Array":
      return "Egy Data Uint8Array csak nem leválasztott ArrayBufferre hivatkozhat, és nem nyúlhat túl annak határain.";
    case "ExcessProperty":
      return `Egy Data ${issue.container} nem rendelkezhet többlet saját tulajdonságokkal. Távolítsa el a tulajdonságot, vagy használjon másik Type-ot.`;
  }
};

/** Formats a JsonValueError in Hungarian. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `A(z) ${safelyStringifyUnknownValue(issue.value)} érték nem JSON-érték.`;
    case "NonFiniteNumber":
      return "Egy JSON-számnak végesnek kell lennie.";
    case "UnexpectedPrototype":
      return "Az érték objektum, de a JsonValue-objektumnak egyszerű objektumnak kell lennie, vagy null prototípussal kell rendelkeznie.";
    case "Accessor":
      return "Egy JSON-tulajdonságnak adattulajdonságnak kell lennie. Az accessorértékeket a Type használata előtt alakítsa egyszerű adatokká, vagy használjon másik Type-ot.";
    case "NonEnumerable":
      return "Egy JSON-objektumtulajdonságnak felsorolhatónak kell lennie. Távolítsa el, vagy használjon másik Type-ot.";
    case "SymbolProperty":
      return "Egy JSON-objektumtulajdonság kulcsának karakterláncnak kell lennie. Távolítsa el a szimbólumtulajdonságot, vagy használjon másik Type-ot.";
    case "Hole":
      return "Hiányzik egy JSON-tömbelem.";
    case "ExcessProperty":
      return "Többlet JSON-tömbtulajdonság nem engedélyezett. Távolítsa el, vagy használjon másik Type-ot.";
    case "CircularReference":
      return "A JsonValue nem tartalmazhat körkörös hivatkozásokat.";
  }
};

/** Formats a JsonError in Hungarian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem elemezhető JsonValue-vá.`;

/** Formats a ByteSizeLiteralError in Hungarian. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem bájtméret-literál. Használjon például "512KiB" vagy "1MiB" értéket.`;

/** Formats a ByteLengthError in Hungarian. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "A -0 érték nem bájthosszúság. Használja helyette a 0 értéket.";

/** Formats a ByteLengthFromStringError in Hungarian. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem bájthosszúság. Használjon bájtszámot vagy literált, például 10MiB értéket.`;

/** Formats a DurationLiteralError in Hungarian. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem időtartam-literál. Használjon például "500ms" vagy "1.5s" értéket.`;

/** Formats a PercentageLiteralError in Hungarian. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `A(z) ${safelyStringifyUnknownValue(error.value)} érték nem százalékliterál. Használjon például "50%" vagy "12.5%" értéket.`;
