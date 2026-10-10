/**
 * Thai Evolu Type error formatters.
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
  BetweenBigIntError,
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
  ExcludesError,
  FiniteError,
  FiniteNumberFromStringError,
  GreaterThanBigIntError,
  GreaterThanError,
  GreaterThanOrEqualToBigIntError,
  GreaterThanOrEqualToError,
  HexColorError,
  HexError,
  HostnameError,
  IbanError,
  IncludesError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
  IdError,
  IpAddressError,
  IpAddressFromStringError,
  Ipv4AddressError,
  Ipv6AddressError,
  Ipv6AddressFromStringError,
  IsbnError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanBigIntError,
  LessThanError,
  LessThanOrEqualToBigIntError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxEntriesError,
  MaxLengthError,
  MaxSizeError,
  MaxUtf8ByteLengthError,
  MinEntriesError,
  MinLengthError,
  MinSizeError,
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
  UlidError,
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

  return `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ชนิด ${typeOf}`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `ค่า ${safelyStringifyUnknownValue(reason.value)} ไม่ใช่ออบเจ็กต์`
    : "ค่านี้เป็นออบเจ็กต์ แต่ Object Output ต้องเป็นออบเจ็กต์ธรรมดาหรือมี null prototype";

/** Formats a NeverError in Thai. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ใช้ไม่ได้กับชนิด Never`;

/** Formats a String TypeOfError in Thai. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Thai. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ตรงกับ template literal`;

/** Formats a Number TypeOfError in Thai. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Thai. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Thai. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Thai. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ค่าบูลีน ใช้ true หรือ false`;

/** Formats a Symbol TypeOfError in Thai. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Thai. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Thai. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Evolu Type`;

/** Formats an ObjectTagError in Thai. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่มี object tag ที่คาดไว้ ${safelyStringifyUnknownValue(error.expected)}`;

/** Formats a ValidDateError in Thai. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date ไม่ถูกต้อง";

/** Formats an InstanceOfError in Thai. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่อินสแตนซ์ของ ${error.constructorName}`;

/** Formats a LiteralError in Thai. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่เท่ากับลิเทอรัลที่คาดไว้แบบเคร่งครัด: ${String(error.expected)}`;

/** Formats a UnionError in Thai. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "ค่าไม่ตรงกับตัวเลือกที่อนุญาตใดเลย";

/** Formats a DateIsoError in Thai. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริงวันที่และเวลา ISO รูปแบบมาตรฐาน`;

/** Formats a PlainDateIsoError in Thai. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่วันที่ตามปฏิทินที่ถูกต้องในรูปแบบ YYYY-MM-DD`;

/** Formats a DateIsoFromDateError in Thai. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "ไม่สามารถแทน Date เป็น DateIso ได้";

/** Formats a DateIsoFromRfc3339Error in Thai. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่วันที่และเวลาแบบ RFC 3339 ที่รองรับ ใช้ค่าเช่น "2024-01-01T12:00:00Z"`;

/** Formats a DecimalStringError in Thai. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมรูปแบบมาตรฐาน`;

/** Formats an Int64Error in Thai. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่จำนวนเต็ม 64 บิตมีเครื่องหมาย (Int64) ที่ถูกต้อง`;

/** Formats a UInt64Error in Thai. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่จำนวนเต็ม 64 บิตไม่มีเครื่องหมาย (UInt64) ที่ถูกต้อง`;

/** Formats an Int64StringError in Thai. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริง Int64 ที่ถูกต้อง`;

/** Formats an IdentifierError in Thai. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ตัวระบุรูปแบบ ${error.casing}`;

/** Formats a CapitalizedError in Thai. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องขึ้นต้นด้วยอักษรตัวพิมพ์ใหญ่`;

/** Formats an UncapitalizedError in Thai. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องไม่ขึ้นต้นด้วยตัวอักษรพิมพ์ใหญ่`;

/** Formats an UppercasedError in Thai. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นตัวพิมพ์ใหญ่`;

/** Formats a LowercasedError in Thai. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นตัวพิมพ์เล็ก`;

/** Formats a TrimmedError in Thai. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องตัดช่องว่างหัวท้ายแล้ว`;

/** Formats a WellFormedError in Thai. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นข้อความ Unicode ที่มีรูปแบบถูกต้อง`;

/** Formats a NormalizedError in Thai. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องอยู่ในรูปแบบการทำให้เป็นมาตรฐานของ Unicode แบบ ${error.form}`;

/** Formats a StartsWithError in Thai. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องขึ้นต้นด้วย ${safelyStringifyUnknownValue(error.prefix)}`;

/** Formats an EndsWithError in Thai. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องลงท้ายด้วย ${safelyStringifyUnknownValue(error.suffix)}`;

/** Formats an IncludesError in Thai. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมี ${safelyStringifyUnknownValue(error.substring)} อยู่`;

/** Formats an ExcludesError in Thai. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องไม่มี ${safelyStringifyUnknownValue(error.substring)} อยู่`;

/** Formats a MinLengthError in Thai. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีความยาวไม่ถึงขั้นต่ำ ${error.min}`;

/** Formats a MaxLengthError in Thai. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีความยาวเกินสูงสุด ${error.max}`;

/** Formats a MaxUtf8ByteLengthError in Thai. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีความยาวเป็นไบต์ UTF-8 เกินสูงสุด ${error.max}`;

/** Formats a LengthError in Thai. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีความยาวไม่เท่ากับ ${error.exact} ที่กำหนด`;

/** Formats a RegexError in Thai. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ตรงกับ /${error.source}/${error.flags}`;

/** Formats a Base64UrlError in Thai. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริง Base64Url ที่ถูกต้อง`;

/** Formats a Base64Error in Thai. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริง Base64 ที่ถูกต้อง`;

/** Formats a HexError in Thai. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริงเลขฐานสิบหกตัวพิมพ์เล็กที่มีจำนวนหลักเป็นเลขคู่`;

/** Formats a HexColorError in Thai. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สีในรูปแบบ #rrggbb ตัวพิมพ์เล็ก`;

/** Formats a NameError in Thai. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Name ที่ถูกต้อง`;

/** Formats an EmailError in Thai. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ที่อยู่อีเมลที่ถูกต้อง`;

/** Formats a HostnameError in Thai. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ชื่อโฮสต์ตัวพิมพ์เล็กที่ถูกต้อง`;

/** Formats an Ipv4AddressError in Thai. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ที่อยู่ IPv4 ที่ถูกต้อง`;

/** Formats an Ipv6AddressError in Thai. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ที่อยู่ IPv6 รูปแบบมาตรฐาน`;

/** Formats an Ipv6AddressFromStringError in Thai. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ที่อยู่ IPv6 ที่ถูกต้อง`;

/** Formats an IpAddressError in Thai. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ที่อยู่ IPv4 ที่ถูกต้องหรือที่อยู่ IPv6 รูปแบบมาตรฐาน`;

/** Formats an IpAddressFromStringError in Thai. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ที่อยู่ IP ที่ถูกต้อง`;

/** Formats a PhoneNumberE164Error in Thai. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่หมายเลขโทรศัพท์ในรูปแบบ E.164`;

/** Formats an IbanError in Thai. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ IBAN ที่ถูกต้องซึ่งเป็นตัวพิมพ์ใหญ่และไม่มีช่องว่าง`;

/** Formats an IsbnError in Thai. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ ISBN 13 หลักที่ถูกต้องซึ่งไม่มีเครื่องหมายขีดกลาง`;

/** Formats a SimplePasswordError in Thai. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "รหัสผ่านต้องตัดช่องว่างหัวท้ายแล้ว";
    case "TooLong":
      return "รหัสผ่านมีความยาวเกินสูงสุด 64";
    case "TooShort":
      return "รหัสผ่านมีความยาวไม่ถึงขั้นต่ำ 8";
  }
};

/** Formats a MnemonicError in Thai. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "ค่านี้ไม่ใช่ mnemonic BIP39 ภาษาอังกฤษที่ถูกต้อง";

/** Formats an IdError in Thai. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Id ที่ถูกต้อง`;

/** Formats a TableIdError in Thai. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Id ที่ถูกต้องสำหรับตาราง ${error.table}`;

/** Formats a UuidError in Thai. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ UUID ตัวพิมพ์เล็กรูปแบบมาตรฐาน`;

/** Formats a UuidVersionError in Thai. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ UUID เวอร์ชัน ${error.version}`;

/** Formats a UlidError in Thai. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ ULID ตัวพิมพ์ใหญ่รูปแบบมาตรฐาน`;

/** Formats a NonNegativeError in Thai. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องไม่เป็นลบ (>= 0)`;

/** Formats a NonNegativeDecimalStringError in Thai. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมที่ไม่เป็นลบ`;

/** Formats a PositiveError in Thai. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นบวก (> 0)`;

/** Formats a PositiveDecimalStringError in Thai. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมบวก`;

/** Formats a NonPositiveError in Thai. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องไม่เป็นบวก (<= 0)`;

/** Formats a NonPositiveDecimalStringError in Thai. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมที่ไม่เป็นบวก`;

/** Formats a NegativeError in Thai. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นลบ (< 0)`;

/** Formats a NegativeDecimalStringError in Thai. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมลบ`;

/** Formats an IntError in Thai. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นจำนวนเต็มปลอดภัย`;

/** Formats an IntFromStringError in Thai. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่จำนวนเต็มฐานสิบ`;

/** Formats a FiniteNumberFromStringError in Thai. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่จำนวนฐานสิบ`;

/** Formats a GreaterThanError in Thai. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมากกว่า ${error.min}`;

/** Formats a GreaterThanOrEqualToError in Thai. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมากกว่าหรือเท่ากับ ${error.min}`;

/** Formats a LessThanError in Thai. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องน้อยกว่า ${error.max}`;

/** Formats a LessThanOrEqualToError in Thai. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องน้อยกว่าหรือเท่ากับ ${error.max}`;

/** Formats a NonNaNError in Thai. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "ค่าต้องไม่เป็น NaN";

/** Formats a FiniteError in Thai. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นจำนวนจำกัด`;

/** Formats a MultipleOfError in Thai. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นพหุคูณของ ${error.divisor}`;

/** Formats a BetweenError in Thai. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องอยู่ระหว่าง ${error.min} และ ${error.max} (รวมขอบเขต)`;

/** Formats a GreaterThanBigIntError in Thai. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมากกว่า ${error.min}`;

/** Formats a GreaterThanOrEqualToBigIntError in Thai. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมากกว่าหรือเท่ากับ ${error.min}`;

/** Formats a LessThanBigIntError in Thai. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องน้อยกว่า ${error.max}`;

/** Formats a LessThanOrEqualToBigIntError in Thai. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องน้อยกว่าหรือเท่ากับ ${error.max}`;

/** Formats a BetweenBigIntError in Thai. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องอยู่ระหว่าง ${error.min} และ ${error.max} (รวมขอบเขต)`;

/** Formats an ArrayError in Thai. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `ค่า ${safelyStringifyUnknownValue(error.reason.value)} ไม่ใช่อาร์เรย์`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `ไม่มีองค์ประกอบอาร์เรย์ที่ดัชนี ${issue.index}`;
    case "Accessor":
      return `องค์ประกอบอาร์เรย์ที่ดัชนี ${issue.index} ต้องเป็น data property`;
    case "ExcessProperty":
      return "ไม่อนุญาตให้มี Array property ส่วนเกิน โปรดลบออกหรือใช้ Type อื่น";
    case "Element":
      return `องค์ประกอบอาร์เรย์ที่ดัชนี ${issue.index} ไม่ถูกต้อง`;
  }
};

/** Formats a NonEmptyArrayError in Thai. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมีอย่างน้อยหนึ่งรายการ`;

/** Formats a UniqueError in Thai. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีรายการที่เท่ากันที่ดัชนี ${error.previousIndex} และ ${error.index}`;

/** Formats a SetError in Thai. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `ค่า ${safelyStringifyUnknownValue(error.reason.value)} ไม่ใช่ Set`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `ไม่อนุญาตให้มี Set property ส่วนเกิน ${safelyStringifyUnknownValue(issue.key)}`;
    case "Element":
      return `องค์ประกอบ Set ที่ดัชนี ${issue.index} ไม่ถูกต้อง`;
  }
};

/** Formats a MapError in Thai. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `ค่า ${safelyStringifyUnknownValue(error.reason.value)} ไม่ใช่ Map`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `ไม่อนุญาตให้มี Map property ส่วนเกิน ${safelyStringifyUnknownValue(issue.key)}`;
    case "Key":
      return `คีย์ Map ที่ดัชนี ${issue.index} ไม่ถูกต้อง`;
    case "Value":
      return `ค่า Map ที่ดัชนี ${issue.index} ไม่ถูกต้อง`;
    case "Collision":
      return `คีย์ Map ที่ดัชนี ${issue.previousIndex} และ ${issue.index} ถอดรหัสเป็นคีย์เดียวกัน ${safelyStringifyUnknownValue(issue.outputKey)}`;
  }
};

/** Formats a MinSizeError in Thai. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `ขนาด ${error.value.size} ไม่ถึงขนาดขั้นต่ำ ${error.min}`;

/** Formats a MaxSizeError in Thai. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `ขนาด ${error.value.size} เกินขนาดสูงสุด ${error.max}`;

/** Formats a TupleError in Thai. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `ค่า ${safelyStringifyUnknownValue(error.reason.value)} ไม่ใช่ทูเพิล`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple ต้องมีความยาว ${error.reason.expected} แต่ค่านี้มีความยาว ${error.reason.actual}`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `ไม่มีองค์ประกอบ Tuple ที่ดัชนี ${issue.index}`;
    case "Accessor":
      return `องค์ประกอบ Tuple ที่ดัชนี ${issue.index} ต้องเป็น data property`;
    case "ExcessProperty":
      return "ไม่อนุญาตให้มี Tuple property ส่วนเกิน โปรดลบออกหรือใช้ Type อื่น";
    case "Element":
      return `องค์ประกอบ Tuple ที่ดัชนี ${issue.index} ไม่ถูกต้อง`;
  }
};

/** Formats a RecordError in Thai. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `ค่า ${safelyStringifyUnknownValue(error.reason.value)} ไม่ใช่ Record`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "ค่านี้เป็นออบเจ็กต์ แต่ Record Output ต้องเป็นออบเจ็กต์ธรรมดาหรือมี null prototype";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `คีย์ property ${safelyStringifyUnknownValue(issue.key)} ไม่ถูกต้อง`;
    case "Value":
      return `ค่าของ property ${safelyStringifyUnknownValue(issue.key)} ไม่ถูกต้อง`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ต้องเป็น data property`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ต้องเป็นแบบ enumerable`;
    case "Collision":
      return `คีย์ Record ${safelyStringifyUnknownValue(issue.previousKey)} และ ${safelyStringifyUnknownValue(issue.key)} ถอดรหัสเป็นคีย์เดียวกัน ${safelyStringifyUnknownValue(issue.outputKey)}`;
  }
};

/** Formats a MinEntriesError in Thai. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีจำนวนรายการไม่ถึงขั้นต่ำ ${error.min}`;

/** Formats a MaxEntriesError in Thai. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีจำนวนรายการเกินสูงสุด ${error.max}`;

/** Formats an ObjectError in Thai. */
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
        return "Object property ต้องเป็น data property แปลงค่า accessor เป็นข้อมูลธรรมดาก่อนใช้ Type นี้ หรือใช้ Type อื่น";
      case "NonEnumerable":
        return "Object property ต้องเป็นแบบ enumerable ตั้งค่าให้เป็นแบบ enumerable หรือใช้ Type อื่น";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `ไม่มี property ที่ต้องมี ${safelyStringifyUnknownValue(key)}`;
  }
  if (typeof key === "symbol") {
    return "คีย์ Object property ต้องเป็นสตริง โปรดลบ symbol property หรือใช้ Type อื่น";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `ไม่อนุญาตให้มี property ${safelyStringifyUnknownValue(key)} โปรดลบออกหรือใช้ Type อื่น`;
  }
  return `property ${safelyStringifyUnknownValue(key)} ไม่ถูกต้อง`;
};

/** Formats a DiscriminatedUnionError in Thai. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ต้องเป็น data property`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} ต้องเป็น own property`;
      }
      return `${property} ต้องเป็นแบบ enumerable`;
    }
    case "Discriminator":
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} มีค่าที่ไม่คาดไว้ ${safelyStringifyUnknownValue(error.reason.value)}`;
    case "Member":
      return `ตัวเลือกที่เลือก ${safelyStringifyUnknownValue(error.reason.discriminator)} ไม่ถูกต้อง`;
  }
};

/** Formats a DataError in Thai. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `ค่า ${safelyStringifyUnknownValue(issue.value)} ไม่ใช่ Data`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} มี prototype ที่ไม่คาดไว้`;
    case "Accessor":
      return "Data property ต้องเป็น data property แปลงค่า accessor เป็นข้อมูลธรรมดาก่อนใช้ Type นี้ หรือใช้ Type อื่น";
    case "NonEnumerable":
      return "Data Object property ต้องเป็นแบบ enumerable โปรดลบออกหรือใช้ Type อื่น";
    case "SymbolProperty":
      return "คีย์ Data Object property ต้องเป็นสตริง โปรดลบ symbol property หรือใช้ Type อื่น";
    case "Hole":
      return "ไม่มีองค์ประกอบของ Data Array";
    case "InvalidUint8Array":
      return "Data Uint8Array ต้องมี ArrayBuffer ที่ยังไม่ถูก detach และต้องอยู่ภายในขอบเขตของ ArrayBuffer นั้น";
    case "ExcessProperty":
      return `Data ${issue.container} ต้องไม่มี own property ส่วนเกิน โปรดลบ property นั้นออกหรือใช้ Type อื่น`;
  }
};

/** Formats a JsonValueError in Thai. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `ค่า ${safelyStringifyUnknownValue(issue.value)} ไม่ใช่ค่า JSON`;
    case "NonFiniteNumber":
      return "ตัวเลข JSON ต้องเป็นจำนวนจำกัด";
    case "UnexpectedPrototype":
      return "ค่านี้เป็นออบเจ็กต์ แต่ JsonValue object ต้องเป็นออบเจ็กต์ธรรมดาหรือมี null prototype";
    case "Accessor":
      return "JSON property ต้องเป็น data property แปลงค่า accessor เป็นข้อมูลธรรมดาก่อนใช้ Type นี้ หรือใช้ Type อื่น";
    case "NonEnumerable":
      return "JSON object property ต้องเป็นแบบ enumerable โปรดลบออกหรือใช้ Type อื่น";
    case "SymbolProperty":
      return "คีย์ JSON object property ต้องเป็นสตริง โปรดลบ symbol property หรือใช้ Type อื่น";
    case "Hole":
      return "ไม่มีองค์ประกอบของ JSON array";
    case "ExcessProperty":
      return "ไม่อนุญาตให้มี JSON array property ส่วนเกิน โปรดลบออกหรือใช้ Type อื่น";
    case "CircularReference":
      return "JsonValue ต้องไม่มีการอ้างอิงแบบวงกลม";
  }
};

/** Formats a JsonError in Thai. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `ไม่สามารถแยกวิเคราะห์ค่า ${safelyStringifyUnknownValue(error.value)} เป็น JsonValue ได้`;

/** Formats a ByteSizeLiteralError in Thai. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ลิเทอรัลขนาดไบต์ ใช้ค่าเช่น "512KiB" หรือ "1MiB"`;

/** Formats a ByteLengthError in Thai. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "ค่า -0 ไม่ใช่ความยาวไบต์ ใช้ 0 แทน";

/** Formats a ByteLengthFromStringError in Thai. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ความยาวไบต์ ใช้จำนวนไบต์หรือลิเทอรัลเช่น 10MiB`;

/** Formats a DurationLiteralError in Thai. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ลิเทอรัลระยะเวลา ใช้ค่าเช่น "500ms" หรือ "1.5s"`;

/** Formats a PercentageLiteralError in Thai. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ลิเทอรัลเปอร์เซ็นต์ ใช้ค่าเช่น "50%" หรือ "12.5%"`;
