/**
 * Turkish Evolu Type error formatters.
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

const formatValueMustBe = (value: unknown, expected: string): string =>
  `Değer ${safelyStringifyUnknownValue(value)} ${expected} olmalıdır.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Değer ${safelyStringifyUnknownValue(reason.value)} bir nesne değildir.`
    : "Değer bir nesnedir, ancak bir Object Output düz nesne olmalı veya null prototipine sahip olmalıdır.";

/** Formats a NeverError in Turkish. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} Never türü için geçerli değildir.`;

/** Formats a String TypeOfError in Turkish. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> = (
  error,
) => formatValueMustBe(error.value, "bir metin");

/** Formats a TemplateLiteralError in Turkish. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} şablon değişmezine uymuyor.`;

/** Formats a Number TypeOfError in Turkish. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> = (
  error,
) => formatValueMustBe(error.value, "bir sayı");

/** Formats a BigInt TypeOfError in Turkish. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> = (
  error,
) => formatValueMustBe(error.value, "bir bigint tamsayısı");

/** Formats a Boolean TypeOfError in Turkish. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> = (
  error,
) => formatValueMustBe(error.value, "bir mantıksal değer");

/** Formats a Symbol TypeOfError in Turkish. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> = (
  error,
) => formatValueMustBe(error.value, "bir sembol");

/** Formats a Function TypeOfError in Turkish. */
export const formatFunctionError: TypeErrorFormatter<
  TypeOfError<"Function">
> = (error) => formatValueMustBe(error.value, "bir işlev");

/** Formats an EvoluTypeError in Turkish. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} bir Evolu Type olmalıdır.`;

/** Formats an ObjectTagError in Turkish. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} beklenen nesne etiketine sahip değil: ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in Turkish. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.constructorName} örneği değildir.`;

/** Formats a LiteralError in Turkish. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} beklenen değişmezle kesin olarak eşit değildir: ${globalThis.String(error.expected)}.`;

/** Formats a UnionError in Turkish. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Değer izin verilen varyantların hiçbirine uymuyor.";

/** Formats a DateIsoError in Turkish. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} kurallı bir ISO tarih-saat dizgesi değildir.`;

/** Formats a DateIsoFromDateError in Turkish. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date, DateIso olarak temsil edilemez.";

/** Formats a DecimalStringError in Turkish. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} kurallı bir ondalık dizgesi olmalıdır.`;

/** Formats an Int64Error in Turkish. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} geçerli bir işaretli 64 bit tamsayı (Int64) değildir.`;

/** Formats a UInt64Error in Turkish. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} geçerli bir işaretsiz 64 bit tamsayı (UInt64) değildir.`;

/** Formats an Int64StringError in Turkish. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} geçerli bir Int64 dizgesi değildir.`;

/** Formats a CapitalizedError in Turkish. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Metin ${safelyStringifyUnknownValue(error.value)} büyük harfle başlamalıdır.`;

/** Formats a TrimmedError in Turkish. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Metin ${safelyStringifyUnknownValue(error.value)} başında veya sonunda boşluk içermemelidir.`;

/** Formats a MinLengthError in Turkish. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} en az ${error.min} uzunluğunda olmalıdır.`;

/** Formats a MaxLengthError in Turkish. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} en fazla ${error.max} uzunluğunda olmalıdır.`;

/** Formats a LengthError in Turkish. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} tam olarak ${error.exact} uzunluğunda olmalıdır.`;

/** Formats a RegexError in Turkish. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags} düzenli ifadesiyle eşleşmiyor.`;

/** Formats a Base64UrlError in Turkish. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} geçerli bir Base64Url dizgesi değildir.`;

/** Formats a NameError in Turkish. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} geçerli bir Name değildir.`;

/** Formats a MnemonicError in Turkish. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} geçerli bir İngilizce BIP39 anımsatıcı değildir.`;

/** Formats an IdError in Turkish. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} geçerli bir Id değildir.`;

/** Formats a TableIdError in Turkish. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.table} tablosu için geçerli bir Id değildir.`;

/** Formats a NonNegativeError in Turkish. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} negatif olmayan (>= 0) bir sayı olmalıdır.`;

/** Formats a NonNegativeDecimalStringError in Turkish. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} negatif olmayan bir ondalık dizgesi olmalıdır.`;

/** Formats a PositiveError in Turkish. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} pozitif (> 0) olmalıdır.`;

/** Formats a PositiveDecimalStringError in Turkish. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} pozitif bir ondalık dizgesi olmalıdır.`;

/** Formats a NonPositiveError in Turkish. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} pozitif olmayan (<= 0) bir sayı olmalıdır.`;

/** Formats a NonPositiveDecimalStringError in Turkish. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} pozitif olmayan bir ondalık dizgesi olmalıdır.`;

/** Formats a NegativeError in Turkish. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} negatif (< 0) olmalıdır.`;

/** Formats a NegativeDecimalStringError in Turkish. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} negatif bir ondalık dizgesi olmalıdır.`;

/** Formats an IntError in Turkish. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} güvenli bir tamsayı olmalıdır.`;

/** Formats a GreaterThanError in Turkish. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.min} değerinden büyük olmalıdır.`;

/** Formats a GreaterThanOrEqualToError in Turkish. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.min} değerine büyük veya eşit olmalıdır.`;

/** Formats a LessThanError in Turkish. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.max} değerinden küçük olmalıdır.`;

/** Formats a LessThanOrEqualToError in Turkish. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.max} değerine küçük veya eşit olmalıdır.`;

/** Formats a NonNaNError in Turkish. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Değer NaN olmamalıdır.";

/** Formats a FiniteError in Turkish. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} sonlu olmalıdır.`;

/** Formats a MultipleOfError in Turkish. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.divisor} sayısının katı olmalıdır.`;

/** Formats a BetweenError in Turkish. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} ${error.min} ile ${error.max} arasında, sınırlar dahil, olmalıdır.`;

/** Formats an ArrayError in Turkish. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Değer ${safelyStringifyUnknownValue(error.reason.value)} bir dizi değildir.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `${issue.index} dizinindeki dizi öğesi eksik.`;
    case "Accessor":
      return `${issue.index} dizinindeki dizi öğesi bir veri özelliği olmalıdır.`;
    case "ExcessProperty":
      return "Fazladan bir Array özelliğine izin verilmez. Onu kaldırın veya farklı bir Type kullanın.";
    case "Element":
      return `${issue.index} dizinindeki dizi öğesi geçersiz.`;
  }
};

/** Formats a SetError in Turkish. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Değer ${safelyStringifyUnknownValue(error.reason.value)} bir Set değildir.`;
  }
  if (error.reason.kind === "UnexpectedPrototype") {
    return "Değer bir Set alt sınıfının örneğidir, ancak bir Set Output doğrudan bir Set örneği olmalıdır.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Fazladan Set özelliğine ${safelyStringifyUnknownValue(issue.key)} izin verilmez.`;
    case "Element":
      return `${issue.index} dizinindeki Set öğesi geçersiz.`;
  }
};

/** Formats a TupleError in Turkish. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Değer ${safelyStringifyUnknownValue(error.reason.value)} bir tuple değildir.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Bir Tuple tam olarak ${error.reason.expected} öğe içermelidir, ancak değer ${error.reason.actual} öğe içeriyor.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `${issue.index} dizinindeki Tuple öğesi eksik.`;
    case "Accessor":
      return `${issue.index} dizinindeki Tuple öğesi bir veri özelliği olmalıdır.`;
    case "ExcessProperty":
      return "Fazladan bir Tuple özelliğine izin verilmez. Onu kaldırın veya farklı bir Type kullanın.";
    case "Element":
      return `${issue.index} dizinindeki Tuple öğesi geçersiz.`;
  }
};

/** Formats a RecordError in Turkish. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Değer ${safelyStringifyUnknownValue(error.reason.value)} bir Record değildir.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Değer bir nesnedir, ancak bir Record Output düz nesne olmalı veya null prototipine sahip olmalıdır.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Özellik anahtarı ${safelyStringifyUnknownValue(issue.key)} geçersiz.`;
    case "Value":
      return `Özellik ${safelyStringifyUnknownValue(issue.key)} değeri geçersiz.`;
    case "Accessor":
      return `Record özelliği ${safelyStringifyUnknownValue(issue.key)} bir veri özelliği olmalıdır.`;
    case "NonEnumerable":
      return `Record özelliği ${safelyStringifyUnknownValue(issue.key)} numaralandırılabilir olmalıdır.`;
    case "Collision":
      return `Record anahtarları ${safelyStringifyUnknownValue(issue.previousKey)} ve ${safelyStringifyUnknownValue(issue.key)}, aynı ${safelyStringifyUnknownValue(issue.outputKey)} anahtarına çözümleniyor.`;
  }
};

/** Formats an ObjectError in Turkish. */
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
        return "Bir Object özelliği veri özelliği olmalıdır. Bu Type'ı kullanmadan önce erişimci değerlerini düz verilere dönüştürün veya farklı bir Type kullanın.";
      case "NonEnumerable":
        return "Bir Object özelliği numaralandırılabilir olmalıdır. Onu numaralandırılabilir yapın veya farklı bir Type kullanın.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Zorunlu özellik ${safelyStringifyUnknownValue(key)} eksik.`;
  }
  if (typeof key === "symbol") {
    return "Bir Object özellik anahtarı bir dizge olmalıdır. Sembol özelliğini kaldırın veya farklı bir Type kullanın.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Özellik ${safelyStringifyUnknownValue(key)} için izin verilmez. Onu kaldırın veya farklı bir Type kullanın.`;
  }
  return `Özellik ${safelyStringifyUnknownValue(key)} geçersiz.`;
};

/** Formats a DiscriminatedUnionError in Turkish. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Ayırt edici özellik ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} bir veri özelliği olmalıdır.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} kendi özelliği olmalıdır.`;
      }
      return `${property} numaralandırılabilir olmalıdır.`;
    }
    case "Discriminator":
      return `Ayırt edici özellik ${safelyStringifyUnknownValue(error.reason.key)} beklenmeyen ${safelyStringifyUnknownValue(error.reason.value)} değerine sahip.`;
    case "Member":
      return `Seçilen varyant ${safelyStringifyUnknownValue(error.reason.discriminator)} geçersiz.`;
  }
};

/** Formats a JsonValueError in Turkish. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Değer ${safelyStringifyUnknownValue(issue.value)} bir JSON değeri değildir.`;
    case "NonFiniteNumber":
      return "Bir JSON sayısı sonlu olmalıdır.";
    case "UnexpectedPrototype":
      return "Değer bir nesnedir, ancak bir JsonValue nesnesi düz nesne olmalı veya null prototipine sahip olmalıdır.";
    case "Accessor":
      return "Bir JSON özelliği veri özelliği olmalıdır. Bu Type'ı kullanmadan önce erişimci değerlerini düz verilere dönüştürün veya farklı bir Type kullanın.";
    case "NonEnumerable":
      return "Bir JSON nesnesi özelliği numaralandırılabilir olmalıdır. Onu kaldırın veya farklı bir Type kullanın.";
    case "SymbolProperty":
      return "Bir JSON nesnesi özellik anahtarı bir dizge olmalıdır. Sembol özelliğini kaldırın veya farklı bir Type kullanın.";
    case "Hole":
      return "Bir JSON dizi öğesi eksik.";
    case "ExcessProperty":
      return "Fazladan bir JSON dizi özelliğine izin verilmez. Onu kaldırın veya farklı bir Type kullanın.";
    case "CircularReference":
      return "Bir JsonValue döngüsel başvurular içermemelidir.";
  }
};

/** Formats a JsonError in Turkish. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Değer ${safelyStringifyUnknownValue(error.value)} bir JsonValue olarak ayrıştırılamaz.`;
