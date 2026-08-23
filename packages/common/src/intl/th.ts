/**
 * ตัวจัดรูปแบบข้อผิดพลาด Evolu Type ภาษาไทย
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

  return `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ ${typeOf}`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `ค่า ${safelyStringifyUnknownValue(reason.value)} ไม่ใช่ออบเจ็กต์`
    : "ค่านี้เป็นออบเจ็กต์ แต่ Object Output ต้องเป็นออบเจ็กต์ธรรมดาหรือมี null prototype";

/** จัดรูปแบบ NeverError เป็นภาษาไทย */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ใช้ไม่ได้กับชนิด Never`;

/** จัดรูปแบบ String TypeOfError เป็นภาษาไทย */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** จัดรูปแบบ TemplateLiteralError เป็นภาษาไทย */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ตรงกับ template literal`;

/** จัดรูปแบบ Number TypeOfError เป็นภาษาไทย */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** จัดรูปแบบ BigInt TypeOfError เป็นภาษาไทย */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** จัดรูปแบบ Boolean TypeOfError เป็นภาษาไทย */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** จัดรูปแบบ Symbol TypeOfError เป็นภาษาไทย */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** จัดรูปแบบ Function TypeOfError เป็นภาษาไทย */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** จัดรูปแบบ EvoluTypeError เป็นภาษาไทย */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Evolu Type`;

/** จัดรูปแบบ ObjectTagError เป็นภาษาไทย */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่มี object tag ที่คาดไว้ ${safelyStringifyUnknownValue(error.expected)}`;

/** จัดรูปแบบ InstanceOfError เป็นภาษาไทย */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่อินสแตนซ์ของ ${error.constructorName}`;

/** จัดรูปแบบ LiteralError เป็นภาษาไทย */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่เท่ากับลิเทอรัลที่คาดไว้แบบเคร่งครัด: ${globalThis.String(error.expected)}`;

/** จัดรูปแบบ UnionError เป็นภาษาไทย */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "ค่าไม่ตรงกับตัวเลือกที่อนุญาตใดเลย";

/** จัดรูปแบบ DateIsoError เป็นภาษาไทย */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริงวันที่และเวลา ISO รูปแบบมาตรฐาน`;

/** จัดรูปแบบ DateIsoFromDateError เป็นภาษาไทย */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "ไม่สามารถแทน Date เป็น DateIso ได้";

/** จัดรูปแบบ DecimalStringError เป็นภาษาไทย */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมรูปแบบมาตรฐาน`;

/** จัดรูปแบบ Int64Error เป็นภาษาไทย */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่จำนวนเต็ม 64 บิตมีเครื่องหมาย (Int64) ที่ถูกต้อง`;

/** จัดรูปแบบ UInt64Error เป็นภาษาไทย */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่จำนวนเต็ม 64 บิตไม่มีเครื่องหมาย (UInt64) ที่ถูกต้อง`;

/** จัดรูปแบบ Int64StringError เป็นภาษาไทย */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริง Int64 ที่ถูกต้อง`;

/** จัดรูปแบบ CapitalizedError เป็นภาษาไทย */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องขึ้นต้นด้วยอักษรตัวพิมพ์ใหญ่`;

/** จัดรูปแบบ TrimmedError เป็นภาษาไทย */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องตัดช่องว่างหัวท้ายแล้ว`;

/** จัดรูปแบบ MinLengthError เป็นภาษาไทย */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีความยาวไม่ถึงขั้นต่ำ ${error.min}`;

/** จัดรูปแบบ MaxLengthError เป็นภาษาไทย */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีความยาวเกินสูงสุด ${error.max}`;

/** จัดรูปแบบ LengthError เป็นภาษาไทย */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} มีความยาวไม่เท่ากับ ${error.exact} ที่กำหนด`;

/** จัดรูปแบบ RegexError เป็นภาษาไทย */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ตรงกับ /${error.source}/${error.flags}`;

/** จัดรูปแบบ Base64UrlError เป็นภาษาไทย */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่สตริง Base64Url ที่ถูกต้อง`;

/** จัดรูปแบบ NameError เป็นภาษาไทย */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Name ที่ถูกต้อง`;

/** จัดรูปแบบ MnemonicError เป็นภาษาไทย */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ mnemonic BIP39 ภาษาอังกฤษที่ถูกต้อง`;

/** จัดรูปแบบ IdError เป็นภาษาไทย */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Id ที่ถูกต้อง`;

/** จัดรูปแบบ TableIdError เป็นภาษาไทย */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ไม่ใช่ Id ที่ถูกต้องสำหรับตาราง ${error.table}`;

/** จัดรูปแบบ NonNegativeError เป็นภาษาไทย */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องไม่เป็นลบ (>= 0)`;

/** จัดรูปแบบ NonNegativeDecimalStringError เป็นภาษาไทย */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมที่ไม่เป็นลบ`;

/** จัดรูปแบบ PositiveError เป็นภาษาไทย */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นบวก (> 0)`;

/** จัดรูปแบบ PositiveDecimalStringError เป็นภาษาไทย */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมบวก`;

/** จัดรูปแบบ NonPositiveError เป็นภาษาไทย */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องไม่เป็นบวก (<= 0)`;

/** จัดรูปแบบ NonPositiveDecimalStringError เป็นภาษาไทย */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมที่ไม่เป็นบวก`;

/** จัดรูปแบบ NegativeError เป็นภาษาไทย */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นลบ (< 0)`;

/** จัดรูปแบบ NegativeDecimalStringError เป็นภาษาไทย */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นสตริงเลขทศนิยมลบ`;

/** จัดรูปแบบ IntError เป็นภาษาไทย */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นจำนวนเต็มปลอดภัย`;

/** จัดรูปแบบ GreaterThanError เป็นภาษาไทย */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) => `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมากกว่า ${error.min}`;

/** จัดรูปแบบ GreaterThanOrEqualToError เป็นภาษาไทย */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องมากกว่าหรือเท่ากับ ${error.min}`;

/** จัดรูปแบบ LessThanError เป็นภาษาไทย */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องน้อยกว่า ${error.max}`;

/** จัดรูปแบบ LessThanOrEqualToError เป็นภาษาไทย */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องน้อยกว่าหรือเท่ากับ ${error.max}`;

/** จัดรูปแบบ NonNaNError เป็นภาษาไทย */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "ค่าต้องไม่เป็น NaN";

/** จัดรูปแบบ FiniteError เป็นภาษาไทย */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นจำนวนจำกัด`;

/** จัดรูปแบบ MultipleOfError เป็นภาษาไทย */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องเป็นพหุคูณของ ${error.divisor}`;

/** จัดรูปแบบ BetweenError เป็นภาษาไทย */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `ค่า ${safelyStringifyUnknownValue(error.value)} ต้องอยู่ระหว่าง ${error.min} และ ${error.max} (รวมขอบเขต)`;

/** จัดรูปแบบ ArrayError เป็นภาษาไทย */
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

/** จัดรูปแบบ SetError เป็นภาษาไทย */
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

/** จัดรูปแบบ MapError เป็นภาษาไทย */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `ค่า ${safelyStringifyUnknownValue(error.reason.value)} ไม่ใช่ Map`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `ไม่อนุญาตให้มี Map property ส่วนเกิน ${safelyStringifyUnknownValue(issue.key)}`;
    case "Key":
    case "Value":
      return `องค์ประกอบ Map ที่ดัชนี ${issue.index} ไม่ถูกต้อง`;
    case "Collision":
      return `คีย์ Map ${safelyStringifyUnknownValue(issue.previousKey)} และ ${safelyStringifyUnknownValue(issue.key)} ถอดรหัสเป็นคีย์เดียวกัน ${safelyStringifyUnknownValue(issue.outputKey)}`;
  }
};

/** จัดรูปแบบ TupleError เป็นภาษาไทย */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `ค่า ${safelyStringifyUnknownValue(error.reason.value)} ไม่ใช่ทูเพิล`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple ต้องมีองค์ประกอบ ${error.reason.expected} รายการพอดี แต่ค่านี้มี ${error.reason.actual} รายการ`;
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

/** จัดรูปแบบ RecordError เป็นภาษาไทย */
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
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ต้อง enumerable ได้`;
    case "Collision":
      return `คีย์ Record ${safelyStringifyUnknownValue(issue.previousKey)} และ ${safelyStringifyUnknownValue(issue.key)} ถอดรหัสเป็นคีย์เดียวกัน ${safelyStringifyUnknownValue(issue.outputKey)}`;
  }
};

/** จัดรูปแบบ ObjectError เป็นภาษาไทย */
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
        return "Object property ต้อง enumerable ได้ ตั้งค่าให้ enumerable หรือใช้ Type อื่น";
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

/** จัดรูปแบบ DiscriminatedUnionError เป็นภาษาไทย */
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
      return `${property} ต้อง enumerable ได้`;
    }
    case "Discriminator":
      return `discriminator property ${safelyStringifyUnknownValue(error.reason.key)} มีค่าที่ไม่คาดไว้ ${safelyStringifyUnknownValue(error.reason.value)}`;
    case "Member":
      return `ตัวเลือกที่เลือก ${safelyStringifyUnknownValue(error.reason.discriminator)} ไม่ถูกต้อง`;
  }
};

/** จัดรูปแบบ JsonValueError เป็นภาษาไทย */
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
      return "JSON object property ต้อง enumerable ได้ โปรดลบออกหรือใช้ Type อื่น";
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

/** จัดรูปแบบ JsonError เป็นภาษาไทย */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `ไม่สามารถแยกวิเคราะห์ค่า ${safelyStringifyUnknownValue(error.value)} เป็น JsonValue ได้`;
