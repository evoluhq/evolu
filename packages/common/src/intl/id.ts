/**
 * Indonesian Evolu Type error formatters.
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

  return `Nilai ${safelyStringifyUnknownValue(error.value)} bukan ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Nilai ${safelyStringifyUnknownValue(reason.value)} bukan objek.`
    : "Nilai tersebut adalah objek, tetapi Output Object harus berupa objek biasa atau memiliki prototipe null.";

/** Formats a NeverError in Indonesian. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak valid untuk tipe Never.`;

/** Formats a String TypeOfError in Indonesian. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Indonesian. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak cocok dengan literal template.`;

/** Formats a Number TypeOfError in Indonesian. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Indonesian. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Indonesian. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a Symbol TypeOfError in Indonesian. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Indonesian. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Indonesian. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Tipe Evolu.`;

/** Formats an ObjectTagError in Indonesian. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak memiliki tag objek yang diharapkan ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in Indonesian. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan instance dari ${error.constructorName}.`;

/** Formats a LiteralError in Indonesian. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak sama persis dengan literal yang diharapkan: ${globalThis.String(error.expected)}.`;

/** Formats a UnionError in Indonesian. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Nilai tidak cocok dengan varian yang diizinkan mana pun.";

/** Formats a DateIsoError in Indonesian. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan string tanggal-waktu ISO kanonis.`;

/** Formats a DateIsoFromDateError in Indonesian. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date tidak dapat direpresentasikan sebagai DateIso.";

/** Formats a DecimalStringError in Indonesian. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berupa string desimal kanonis.`;

/** Formats an Int64Error in Indonesian. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan bilangan bulat 64-bit bertanda (Int64) yang valid.`;

/** Formats a UInt64Error in Indonesian. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan bilangan bulat 64-bit tak bertanda (UInt64) yang valid.`;

/** Formats an Int64StringError in Indonesian. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan string Int64 yang valid.`;

/** Formats a CapitalizedError in Indonesian. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus menggunakan huruf kapital di awal.`;

/** Formats a TrimmedError in Indonesian. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus dipangkas.`;

/** Formats a MinLengthError in Indonesian. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak memenuhi panjang minimum ${error.min}.`;

/** Formats a MaxLengthError in Indonesian. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} melebihi panjang maksimum ${error.max}.`;

/** Formats a LengthError in Indonesian. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak memiliki panjang yang diperlukan, yaitu ${error.exact}.`;

/** Formats a RegexError in Indonesian. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak cocok dengan /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Indonesian. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan string Base64Url yang valid.`;

/** Formats a NameError in Indonesian. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Name yang valid.`;

/** Formats a MnemonicError in Indonesian. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan mnemonik BIP39 bahasa Inggris yang valid.`;

/** Formats an IdError in Indonesian. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Id yang valid.`;

/** Formats a TableIdError in Indonesian. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} bukan Id yang valid untuk tabel ${error.table}.`;

/** Formats a NonNegativeError in Indonesian. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus non-negatif (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Indonesian. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berupa string desimal non-negatif.`;

/** Formats a PositiveError in Indonesian. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus positif (> 0).`;

/** Formats a PositiveDecimalStringError in Indonesian. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berupa string desimal positif.`;

/** Formats a NonPositiveError in Indonesian. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus non-positif (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Indonesian. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berupa string desimal non-positif.`;

/** Formats a NegativeError in Indonesian. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus negatif (< 0).`;

/** Formats a NegativeDecimalStringError in Indonesian. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berupa string desimal negatif.`;

/** Formats an IntError in Indonesian. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berupa bilangan bulat aman.`;

/** Formats a GreaterThanError in Indonesian. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus lebih besar dari ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Indonesian. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus lebih besar dari atau sama dengan ${error.min}.`;

/** Formats a LessThanError in Indonesian. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus lebih kecil dari ${error.max}.`;

/** Formats a LessThanOrEqualToError in Indonesian. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus lebih kecil dari atau sama dengan ${error.max}.`;

/** Formats a NonNaNError in Indonesian. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Nilai tidak boleh berupa NaN.";

/** Formats a FiniteError in Indonesian. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berhingga.`;

/** Formats a MultipleOfError in Indonesian. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus kelipatan dari ${error.divisor}.`;

/** Formats a BetweenError in Indonesian. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} harus berada antara ${error.min} dan ${error.max}, termasuk batasnya.`;

/** Formats an ArrayError in Indonesian. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Elemen array pada indeks ${issue.index} tidak ada.`;
    case "Accessor":
      return `Elemen array pada indeks ${issue.index} harus berupa properti data.`;
    case "ExcessProperty":
      return "Properti Array berlebih tidak diizinkan. Hapus properti tersebut atau gunakan Tipe lain.";
    case "Element":
      return `Elemen array pada indeks ${issue.index} tidak valid.`;
  }
};

/** Formats a SetError in Indonesian. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Properti Set berlebih ${safelyStringifyUnknownValue(issue.key)} tidak diizinkan.`;
    case "Element":
      return `Elemen Set pada indeks ${issue.index} tidak valid.`;
  }
};

/** Formats a MapError in Indonesian. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Properti Map berlebih ${safelyStringifyUnknownValue(issue.key)} tidak diizinkan.`;
    case "Key":
    case "Value":
      return `Elemen Map pada indeks ${issue.index} tidak valid.`;
    case "Collision":
      return `Kunci Map ${safelyStringifyUnknownValue(issue.previousKey)} dan ${safelyStringifyUnknownValue(issue.key)} didekode menjadi kunci yang sama, ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Indonesian. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple harus berisi tepat ${error.reason.expected} elemen, tetapi nilainya berisi ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Elemen Tuple pada indeks ${issue.index} tidak ada.`;
    case "Accessor":
      return `Elemen Tuple pada indeks ${issue.index} harus berupa properti data.`;
    case "ExcessProperty":
      return "Properti Tuple berlebih tidak diizinkan. Hapus properti tersebut atau gunakan Tipe lain.";
    case "Element":
      return `Elemen Tuple pada indeks ${issue.index} tidak valid.`;
  }
};

/** Formats a RecordError in Indonesian. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Nilai ${safelyStringifyUnknownValue(error.reason.value)} bukan Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Nilai tersebut adalah objek, tetapi Output Record harus berupa objek biasa atau memiliki prototipe null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Kunci properti ${safelyStringifyUnknownValue(issue.key)} tidak valid.`;
    case "Value":
      return `Nilai properti ${safelyStringifyUnknownValue(issue.key)} tidak valid.`;
    case "Accessor":
      return `Properti Record ${safelyStringifyUnknownValue(issue.key)} harus berupa properti data.`;
    case "NonEnumerable":
      return `Properti Record ${safelyStringifyUnknownValue(issue.key)} harus enumerable.`;
    case "Collision":
      return `Kunci Record ${safelyStringifyUnknownValue(issue.previousKey)} dan ${safelyStringifyUnknownValue(issue.key)} didekode menjadi kunci yang sama, ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Indonesian. */
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
        return "Properti Object harus berupa properti data. Wujudkan nilai accessor menjadi data biasa sebelum menggunakan Tipe ini atau gunakan Tipe lain.";
      case "NonEnumerable":
        return "Properti Object harus enumerable. Jadikan properti tersebut enumerable atau gunakan Tipe lain.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Properti wajib ${safelyStringifyUnknownValue(key)} tidak ada.`;
  }
  if (typeof key === "symbol") {
    return "Kunci properti Object harus berupa string. Hapus properti symbol tersebut atau gunakan Tipe lain.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Properti ${safelyStringifyUnknownValue(key)} tidak diizinkan. Hapus properti tersebut atau gunakan Tipe lain.`;
  }
  return `Properti ${safelyStringifyUnknownValue(key)} tidak valid.`;
};

/** Formats a DiscriminatedUnionError in Indonesian. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Properti discriminator ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} harus berupa properti data.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} harus merupakan properti miliknya sendiri.`;
      }
      return `${property} harus enumerable.`;
    }
    case "Discriminator":
      return `Properti discriminator ${safelyStringifyUnknownValue(error.reason.key)} memiliki nilai yang tidak diharapkan ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Varian yang dipilih ${safelyStringifyUnknownValue(error.reason.discriminator)} tidak valid.`;
  }
};

/** Formats a JsonValueError in Indonesian. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Nilai ${safelyStringifyUnknownValue(issue.value)} bukan nilai JSON.`;
    case "NonFiniteNumber":
      return "Angka JSON harus berhingga.";
    case "UnexpectedPrototype":
      return "Nilai tersebut adalah objek, tetapi objek JsonValue harus berupa objek biasa atau memiliki prototipe null.";
    case "Accessor":
      return "Properti JSON harus berupa properti data. Wujudkan nilai accessor menjadi data biasa sebelum menggunakan Tipe ini atau gunakan Tipe lain.";
    case "NonEnumerable":
      return "Properti objek JSON harus enumerable. Hapus properti tersebut atau gunakan Tipe lain.";
    case "SymbolProperty":
      return "Kunci properti objek JSON harus berupa string. Hapus properti symbol tersebut atau gunakan Tipe lain.";
    case "Hole":
      return "Elemen array JSON tidak ada.";
    case "ExcessProperty":
      return "Properti array JSON berlebih tidak diizinkan. Hapus properti tersebut atau gunakan Tipe lain.";
    case "CircularReference":
      return "JsonValue tidak boleh berisi referensi sirkular.";
  }
};

/** Formats a JsonError in Indonesian. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Nilai ${safelyStringifyUnknownValue(error.value)} tidak dapat diurai menjadi JsonValue.`;
