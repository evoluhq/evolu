/**
 * Malay Evolu Type error formatters.
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
  return `Nilai ${safelyStringifyUnknownValue(error.value)} bukan jenis ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Nilai ${safelyStringifyUnknownValue(reason.value)} bukan objek.`
    : "Nilai itu ialah objek, tetapi Output Object mestilah objek biasa atau mempunyai prototaip null.";

/** Formats a NeverError in Malay. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak sah untuk jenis Never.`;
/** Formats a String TypeOfError in Malay. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** Formats a TemplateLiteralError in Malay. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak sepadan dengan literal templat.`;
/** Formats a Number TypeOfError in Malay. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formats a BigInt TypeOfError in Malay. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formats a Boolean TypeOfError in Malay. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formats a Symbol TypeOfError in Malay. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formats a Function TypeOfError in Malay. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** Formats an EvoluTypeError in Malay. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Jenis Evolu.`;
/** Formats an ObjectTagError in Malay. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak mempunyai tag objek yang dijangka ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formats a ValidDateError in Malay. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date tidak sah.";
/** Formats an InstanceOfError in Malay. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan instance ${error.constructorName}.`;
/** Formats a LiteralError in Malay. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak sama secara ketat dengan literal yang dijangka: ${String(error.expected)}.`;
/** Formats a UnionError in Malay. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Nilai tidak sepadan dengan mana-mana varian yang dibenarkan.";
/** Formats a DateIsoError in Malay. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan rentetan tarikh-masa ISO kanonik.`;
/** Formats a PlainDateIsoError in Malay. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan tarikh kalendar yang sah dalam format YYYY-MM-DD.`;
/** Formats a DateIsoFromDateError in Malay. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date tidak boleh diwakili sebagai DateIso.";
/** Formats a DateIsoFromRfc3339Error in Malay. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan tarikh-masa RFC 3339 yang disokong. Gunakan nilai seperti "2024-01-01T12:00:00Z".`;
/** Formats a DecimalStringError in Malay. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah rentetan perpuluhan kanonik.`;
/** Formats an Int64Error in Malay. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan integer 64-bit bertanda (Int64) yang sah.`;
/** Formats a UInt64Error in Malay. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan integer 64-bit tanpa tanda (UInt64) yang sah.`;
/** Formats an Int64StringError in Malay. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan rentetan Int64 yang sah.`;

/** Formats an IdentifierError in Malay. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan pengecam ${error.casing}.`;

/** Formats a CapitalizedError in Malay. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah bermula dengan huruf besar.`;

/** Formats an UncapitalizedError in Malay. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak boleh bermula dengan huruf besar.`;

/** Formats an UppercasedError in Malay. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mesti menggunakan huruf besar.`;

/** Formats a LowercasedError in Malay. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mesti menggunakan huruf kecil.`;
/** Formats a TrimmedError in Malay. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak boleh bermula atau berakhir dengan ruang kosong.`;
/** Formats a WellFormedError in Malay. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah teks Unicode yang terbentuk dengan betul.`;
/** Formats a NormalizedError in Malay. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah dalam bentuk penormalan Unicode ${error.form}.`;
/** Formats a StartsWithError in Malay. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mesti bermula dengan ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Malay. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mesti berakhir dengan ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats a MinLengthError in Malay. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak memenuhi panjang minimum ${error.min}.`;
/** Formats a MaxLengthError in Malay. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} melebihi panjang maksimum ${error.max}.`;
/** Formats a LengthError in Malay. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak mempunyai panjang yang diperlukan, iaitu ${error.exact}.`;
/** Formats a RegexError in Malay. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak sepadan dengan /${error.source}/${error.flags}.`;
/** Formats a Base64UrlError in Malay. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan rentetan Base64Url yang sah.`;
/** Formats a Base64Error in Malay. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan rentetan Base64 yang sah.`;
/** Formats a HexError in Malay. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan rentetan heksadesimal huruf kecil dengan bilangan digit genap.`;
/** Formats a NameError in Malay. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Name yang sah.`;
/** Formats an EmailError in Malay. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan alamat e-mel yang sah.`;
/** Formats a HostnameError in Malay. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan nama hos huruf kecil yang sah.`;
/** Formats an Ipv4AddressError in Malay. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan alamat IPv4 yang sah.`;
/** Formats an Ipv6AddressError in Malay. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan alamat IPv6 kanonik.`;
/** Formats an Ipv6AddressFromStringError in Malay. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan alamat IPv6 yang sah.`;
/** Formats a PhoneNumberE164Error in Malay. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan nombor telefon dalam format E.164.`;
/** Formats an IbanError in Malay. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan IBAN yang sah dalam huruf besar tanpa ruang kosong.`;
/** Formats a SimplePasswordError in Malay. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "Kata laluan tidak boleh bermula atau berakhir dengan ruang kosong.";
    case "TooLong":
      return "Kata laluan melebihi panjang maksimum 64.";
    case "TooShort":
      return "Kata laluan tidak memenuhi panjang minimum 8.";
  }
};
/** Formats a MnemonicError in Malay. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "Nilai bukan mnemonik BIP39 bahasa Inggeris yang sah.";
/** Formats an IdError in Malay. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Id yang sah.`;
/** Formats a TableIdError in Malay. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Id yang sah untuk jadual ${error.table}.`;
/** Formats a UuidError in Malay. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan UUID kanonik dalam huruf kecil.`;
/** Formats a UuidVersionError in Malay. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan UUID versi ${error.version}.`;
/** Formats a NonNegativeError in Malay. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah tidak negatif (>= 0).`;
/** Formats a NonNegativeDecimalStringError in Malay. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah rentetan perpuluhan tidak negatif.`;
/** Formats a PositiveError in Malay. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah positif (> 0).`;
/** Formats a PositiveDecimalStringError in Malay. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah rentetan perpuluhan positif.`;
/** Formats a NonPositiveError in Malay. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah tidak positif (<= 0).`;
/** Formats a NonPositiveDecimalStringError in Malay. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah rentetan perpuluhan tidak positif.`;
/** Formats a NegativeError in Malay. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah negatif (< 0).`;
/** Formats a NegativeDecimalStringError in Malay. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah rentetan perpuluhan negatif.`;
/** Formats an IntError in Malay. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah integer selamat.`;
/** Formats a GreaterThanError in Malay. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah lebih besar daripada ${error.min}.`;
/** Formats a GreaterThanOrEqualToError in Malay. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah lebih besar daripada atau sama dengan ${error.min}.`;
/** Formats a LessThanError in Malay. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah kurang daripada ${error.max}.`;
/** Formats a LessThanOrEqualToError in Malay. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah kurang daripada atau sama dengan ${error.max}.`;
/** Formats a NonNaNError in Malay. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Nilai mestilah bukan NaN.";
/** Formats a FiniteError in Malay. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah terhingga.`;
/** Formats a MultipleOfError in Malay. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah gandaan ${error.divisor}.`;
/** Formats a BetweenError in Malay. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah antara ${error.min} dan ${error.max}, termasuk kedua-dua had.`;

/** Formats a BooleanFromStringError in Malay. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan boolean. Gunakan true atau false.`;

/** Formats an IntFromStringError in Malay. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan integer perpuluhan.`;

/** Formats a FiniteNumberFromStringError in Malay. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan nombor perpuluhan.`;

/** Formats an ArrayError in Malay. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan tatasusunan.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Elemen tatasusunan pada indeks ${issue.index} tiada.`;
    case "Accessor":
      return `Elemen tatasusunan pada indeks ${issue.index} mestilah sifat data.`;
    case "ExcessProperty":
      return "Sifat Array berlebihan tidak dibenarkan. Alih keluarkannya atau gunakan Jenis lain.";
    case "Element":
      return `Elemen tatasusunan pada indeks ${issue.index} tidak sah.`;
  }
};
/** Formats a NonEmptyArrayError in Malay. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mestilah mengandungi sekurang-kurangnya satu elemen.`;
/** Formats a UniqueError in Malay. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} mempunyai elemen yang sama pada indeks ${error.previousIndex} dan ${error.index}.`;
/** Formats a SetError in Malay. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Sifat Set berlebihan ${safelyStringifyUnknownValue(issue.key)} tidak dibenarkan.`;
    case "Element":
      return `Elemen Set pada indeks ${issue.index} tidak sah.`;
  }
};

/** Formats a MapError in Malay. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Sifat Map berlebihan ${safelyStringifyUnknownValue(issue.key)} tidak dibenarkan.`;
    case "Key":
      return `Kunci Map pada indeks ${issue.index} tidak sah.`;
    case "Value":
      return `Nilai Map pada indeks ${issue.index} tidak sah.`;
    case "Collision":
      return `Kunci Map pada indeks ${issue.previousIndex} dan ${issue.index} dinyahkod kepada kunci yang sama, ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};
/** Formats a TupleError in Malay. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan tupel.`;
  if (error.reason.kind === "InvalidLength")
    return `Tupel mestilah mempunyai panjang ${error.reason.expected}, tetapi nilai itu mempunyai panjang ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Elemen Tupel pada indeks ${issue.index} tiada.`;
    case "Accessor":
      return `Elemen Tupel pada indeks ${issue.index} mestilah sifat data.`;
    case "ExcessProperty":
      return "Sifat Tupel berlebihan tidak dibenarkan. Alih keluarkannya atau gunakan Jenis lain.";
    case "Element":
      return `Elemen Tupel pada indeks ${issue.index} tidak sah.`;
  }
};
/** Formats a RecordError in Malay. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan Record.`;
  if (error.reason.kind === "NotPlainRecord")
    return "Nilai itu ialah objek, tetapi Output Record mestilah objek biasa atau mempunyai prototaip null.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `Kunci sifat ${safelyStringifyUnknownValue(issue.key)} tidak sah.`;
    case "Value":
      return `Nilai sifat ${safelyStringifyUnknownValue(issue.key)} tidak sah.`;
    case "Accessor":
      return `Sifat Record ${safelyStringifyUnknownValue(issue.key)} mestilah sifat data.`;
    case "NonEnumerable":
      return `Sifat Record ${safelyStringifyUnknownValue(issue.key)} mestilah boleh dihitung.`;
    case "Collision":
      return `Kunci Record ${safelyStringifyUnknownValue(issue.previousKey)} dan ${safelyStringifyUnknownValue(issue.key)} dinyahkod kepada kunci yang sama, ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};
/** Formats a MinEntriesError in Malay. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak memenuhi bilangan entri minimum ${error.min}.`;
/** Formats a MaxEntriesError in Malay. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} melebihi bilangan entri maksimum ${error.max}.`;
/** Formats an ObjectError in Malay. */
export const formatObjectError: TypeErrorFormatter<ObjectError> = (error) => {
  if (error.reason.kind !== "Properties")
    return formatPlainObjectRootError(error.reason);
  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);
  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "Sifat Object mestilah sifat data. Wujudkan nilai pengakses menjadi data biasa sebelum menggunakan Jenis ini atau gunakan Jenis lain.";
      case "NonEnumerable":
        return "Sifat Object mestilah boleh dihitung. Jadikannya boleh dihitung atau gunakan Jenis lain.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `Sifat yang diperlukan ${safelyStringifyUnknownValue(key)} tiada.`;
  if (typeof key === "symbol")
    return "Kunci sifat Object mestilah rentetan. Alih keluar sifat simbol itu atau gunakan Jenis lain.";
  if (propertyError.type === "ObjectExcessProperty")
    return `Sifat ${safelyStringifyUnknownValue(key)} tidak dibenarkan. Alih keluarkannya atau gunakan Jenis lain.`;
  return `Sifat ${safelyStringifyUnknownValue(key)} tidak sah.`;
};
/** Formats a DiscriminatedUnionError in Malay. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Sifat diskriminator ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} mestilah sifat data.`;
      if (error.reason.reason === "Inherited")
        return `${property} mestilah sifat miliknya sendiri.`;
      return `${property} mestilah boleh dihitung.`;
    }
    case "Discriminator":
      return `Sifat diskriminator ${safelyStringifyUnknownValue(error.reason.key)} mempunyai nilai yang tidak dijangka ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Varian yang dipilih ${safelyStringifyUnknownValue(error.reason.discriminator)} tidak sah.`;
  }
};
/** Formats a DataError in Malay. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Nilai ${safelyStringifyUnknownValue(issue.value)} bukan Data.`;
    case "UnexpectedPrototype":
      return `${issue.container} Data mempunyai prototaip yang tidak dijangka.`;
    case "Accessor":
      return "Sifat Data mestilah sifat data. Wujudkan nilai pengakses menjadi data biasa sebelum menggunakan Jenis ini atau gunakan Jenis lain.";
    case "NonEnumerable":
      return "Sifat Object Data mestilah boleh dihitung. Alih keluarkannya atau gunakan Jenis lain.";
    case "SymbolProperty":
      return "Kunci sifat Object Data mestilah rentetan. Alih keluar sifat simbol itu atau gunakan Jenis lain.";
    case "Hole":
      return "Elemen Array Data tiada.";
    case "InvalidUint8Array":
      return "Uint8Array Data mestilah mempunyai ArrayBuffer yang tidak tertanggal dan mestilah berada dalam batas ArrayBuffer itu.";
    case "ExcessProperty":
      return `${issue.container} Data tidak boleh mempunyai sifat miliknya sendiri yang berlebihan. Alih keluar sifat itu atau gunakan Jenis lain.`;
  }
};

/** Formats a JsonValueError in Malay. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Nilai ${safelyStringifyUnknownValue(issue.value)} bukan nilai JSON.`;
    case "NonFiniteNumber":
      return "Nombor JSON mestilah terhingga.";
    case "UnexpectedPrototype":
      return "Nilai itu ialah objek, tetapi objek JsonValue mestilah objek biasa atau mempunyai prototaip null.";
    case "Accessor":
      return "Sifat JSON mestilah sifat data. Wujudkan nilai pengakses menjadi data biasa sebelum menggunakan Jenis ini atau gunakan Jenis lain.";
    case "NonEnumerable":
      return "Sifat objek JSON mestilah boleh dihitung. Alih keluarkannya atau gunakan Jenis lain.";
    case "SymbolProperty":
      return "Kunci sifat objek JSON mestilah rentetan. Alih keluar sifat simbol itu atau gunakan Jenis lain.";
    case "Hole":
      return "Elemen tatasusunan JSON tiada.";
    case "ExcessProperty":
      return "Sifat tatasusunan JSON berlebihan tidak dibenarkan. Alih keluarkannya atau gunakan Jenis lain.";
    case "CircularReference":
      return "JsonValue tidak boleh mengandungi rujukan bulat.";
  }
};
/** Formats a JsonError in Malay. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak boleh dihuraikan menjadi JsonValue.`;

/** Formats a ByteSizeLiteralError in Malay. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan literal saiz bait. Gunakan nilai seperti "512KiB" atau "1MiB".`;

/** Formats a ByteLengthError in Malay. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Nilai -0 bukan panjang bait. Gunakan 0 sebagai gantinya.";

/** Formats a ByteLengthFromStringError in Malay. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan panjang bait. Gunakan bilangan bait atau literal seperti 10MiB.`;

/** Formats a DurationLiteralError in Malay. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan literal tempoh. Gunakan nilai seperti "500ms" atau "1.5s".`;

/** Formats a PercentageLiteralError in Malay. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan literal peratusan. Gunakan nilai seperti "50%" atau "12.5%".`;
