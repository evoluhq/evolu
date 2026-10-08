/**
 * Korean Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
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
  DecimalStringError,
  DiscriminatedUnionError,
  EmailError,
  EvoluTypeError,
  FiniteError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
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
  UuidError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();

  return `${safelyStringifyUnknownValue(error.value)} 값은 ${typeOf} 타입이 아닙니다.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `${safelyStringifyUnknownValue(reason.value)} 값은 객체가 아닙니다.`
    : "값은 객체이지만 Object Output은 일반 객체이거나 null 프로토타입을 가져야 합니다.";

/** Formats a NeverError in Korean. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 Never 타입에 유효하지 않습니다.`;

/** Formats a String TypeOfError in Korean. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Korean. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 템플릿 리터럴과 일치하지 않습니다.`;

/** Formats a Number TypeOfError in Korean. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Korean. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Korean. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Korean. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 불리언이 아닙니다. true 또는 false를 사용하세요.`;

/** Formats a Symbol TypeOfError in Korean. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Korean. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Korean. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `${safelyStringifyUnknownValue(error.value)} 값은 Evolu Type이 아닙니다.`;

/** Formats an ObjectTagError in Korean. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값에는 예상된 객체 태그 ${safelyStringifyUnknownValue(error.expected)}이(가) 없습니다.`;

/** Formats an InstanceOfError in Korean. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.constructorName}의 인스턴스가 아닙니다.`;

/** Formats a LiteralError in Korean. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 예상된 리터럴과 엄격하게 동일하지 않습니다: ${String(error.expected)}.`;

/** Formats a UnionError in Korean. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "값이 허용된 어떤 변형과도 일치하지 않습니다.";

/** Formats a DateIsoError in Korean. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 정규 ISO 날짜-시간 문자열이 아닙니다.`;

/** Formats a DateIsoFromDateError in Korean. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date를 DateIso로 표현할 수 없습니다.";

/** Formats a DecimalStringError in Korean. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 정규 10진수 문자열이어야 합니다.`;

/** Formats an Int64Error in Korean. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 부호 있는 64비트 정수(Int64)가 아닙니다.`;

/** Formats a UInt64Error in Korean. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 부호 없는 64비트 정수(UInt64)가 아닙니다.`;

/** Formats an Int64StringError in Korean. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Int64 문자열이 아닙니다.`;

/** Formats an IdentifierError in Korean. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.casing} 식별자가 아닙니다.`;

/** Formats a CapitalizedError in Korean. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 첫 글자가 대문자여야 합니다.`;

/** Formats an UncapitalizedError in Korean. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 대문자로 시작해서는 안 됩니다.`;

/** Formats an UppercasedError in Korean. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) => `${safelyStringifyUnknownValue(error.value)} 값은 대문자여야 합니다.`;

/** Formats a LowercasedError in Korean. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) => `${safelyStringifyUnknownValue(error.value)} 값은 소문자여야 합니다.`;

/** Formats a TrimmedError in Korean. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값의 앞뒤 공백이 제거되어 있어야 합니다.`;

/** Formats a StartsWithError in Korean. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${safelyStringifyUnknownValue(error.prefix)}(으)로 시작해야 합니다.`;

/** Formats a MinLengthError in Korean. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 최소 길이 ${error.min}을(를) 충족하지 않습니다.`;

/** Formats a MaxLengthError in Korean. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 최대 길이 ${error.max}을(를) 초과합니다.`;

/** Formats a LengthError in Korean. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값의 길이는 ${error.exact}이어야 합니다.`;

/** Formats a RegexError in Korean. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 /${error.source}/${error.flags}와 일치하지 않습니다.`;

/** Formats a Base64UrlError in Korean. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Base64Url 문자열이 아닙니다.`;

/** Formats a NameError in Korean. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Name이 아닙니다.`;

/** Formats an EmailError in Korean. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 이메일 주소가 아닙니다.`;

/** Formats a MnemonicError in Korean. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 영어 BIP39 니모닉이 아닙니다.`;

/** Formats an IdError in Korean. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Id가 아닙니다.`;

/** Formats a TableIdError in Korean. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.table} 테이블에 유효한 Id가 아닙니다.`;

/** Formats a UuidError in Korean. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 정규 소문자 UUID가 아닙니다.`;

/** Formats a NonNegativeError in Korean. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음수가 아니어야 합니다(>= 0).`;

/** Formats a NonNegativeDecimalStringError in Korean. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음수가 아닌 10진수 문자열이어야 합니다.`;

/** Formats a PositiveError in Korean. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양수여야 합니다(> 0).`;

/** Formats a PositiveDecimalStringError in Korean. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양의 10진수 문자열이어야 합니다.`;

/** Formats a NonPositiveError in Korean. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양수가 아니어야 합니다(<= 0).`;

/** Formats a NonPositiveDecimalStringError in Korean. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양수가 아닌 10진수 문자열이어야 합니다.`;

/** Formats a NegativeError in Korean. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음수여야 합니다(< 0).`;

/** Formats a NegativeDecimalStringError in Korean. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음의 10진수 문자열이어야 합니다.`;

/** Formats an IntError in Korean. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 안전한 정수여야 합니다.`;

/** Formats an IntFromStringError in Korean. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 10진 정수가 아닙니다.`;

/** Formats a GreaterThanError in Korean. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.min}보다 커야 합니다.`;

/** Formats a GreaterThanOrEqualToError in Korean. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.min} 이상이어야 합니다.`;

/** Formats a LessThanError in Korean. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.max}보다 작아야 합니다.`;

/** Formats a LessThanOrEqualToError in Korean. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.max} 이하여야 합니다.`;

/** Formats a NonNaNError in Korean. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "값은 NaN이어서는 안 됩니다.";

/** Formats a FiniteError in Korean. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유한해야 합니다.`;

/** Formats a MultipleOfError in Korean. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.divisor}의 배수여야 합니다.`;

/** Formats a BetweenError in Korean. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.min} 이상 ${error.max} 이하여야 합니다.`;

/** Formats an ArrayError in Korean. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `${safelyStringifyUnknownValue(error.reason.value)} 값은 배열이 아닙니다.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `인덱스 ${issue.index}의 배열 요소가 없습니다.`;
    case "Accessor":
      return `인덱스 ${issue.index}의 배열 요소는 데이터 프로퍼티여야 합니다.`;
    case "ExcessProperty":
      return "불필요한 Array 프로퍼티는 허용되지 않습니다. 해당 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
    case "Element":
      return `인덱스 ${issue.index}의 배열 요소가 유효하지 않습니다.`;
  }
};

/** Formats a SetError in Korean. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `${safelyStringifyUnknownValue(error.reason.value)} 값은 Set이 아닙니다.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `불필요한 Set 프로퍼티 ${safelyStringifyUnknownValue(issue.key)}은(는) 허용되지 않습니다.`;
    case "Element":
      return `인덱스 ${issue.index}의 Set 요소가 유효하지 않습니다.`;
  }
};

/** Formats a MapError in Korean. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `${safelyStringifyUnknownValue(error.reason.value)} 값은 Map이 아닙니다.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `불필요한 Map 프로퍼티 ${safelyStringifyUnknownValue(issue.key)}은(는) 허용되지 않습니다.`;
    case "Key":
      return `인덱스 ${issue.index}의 Map 키가 유효하지 않습니다.`;
    case "Value":
      return `인덱스 ${issue.index}의 Map 값이 유효하지 않습니다.`;
    case "Collision":
      return `인덱스 ${issue.previousIndex} 및 ${issue.index}의 Map 키는 디코딩하면 동일한 키 ${safelyStringifyUnknownValue(issue.outputKey)}이(가) 됩니다.`;
  }
};

/** Formats a TupleError in Korean. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `${safelyStringifyUnknownValue(error.reason.value)} 값은 튜플이 아닙니다.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple의 길이는 ${error.reason.expected}이어야 하지만 값의 길이는 ${error.reason.actual}입니다.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `인덱스 ${issue.index}의 Tuple 요소가 없습니다.`;
    case "Accessor":
      return `인덱스 ${issue.index}의 Tuple 요소는 데이터 프로퍼티여야 합니다.`;
    case "ExcessProperty":
      return "불필요한 Tuple 프로퍼티는 허용되지 않습니다. 해당 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
    case "Element":
      return `인덱스 ${issue.index}의 Tuple 요소가 유효하지 않습니다.`;
  }
};

/** Formats a RecordError in Korean. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `${safelyStringifyUnknownValue(error.reason.value)} 값은 Record가 아닙니다.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "값은 객체이지만 Record Output은 일반 객체이거나 null 프로토타입을 가져야 합니다.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `프로퍼티 키 ${safelyStringifyUnknownValue(issue.key)}이(가) 유효하지 않습니다.`;
    case "Value":
      return `프로퍼티 ${safelyStringifyUnknownValue(issue.key)}의 값이 유효하지 않습니다.`;
    case "Accessor":
      return `Record 프로퍼티 ${safelyStringifyUnknownValue(issue.key)}은(는) 데이터 프로퍼티여야 합니다.`;
    case "NonEnumerable":
      return `Record 프로퍼티 ${safelyStringifyUnknownValue(issue.key)}은(는) 열거 가능해야 합니다.`;
    case "Collision":
      return `Record 키 ${safelyStringifyUnknownValue(issue.previousKey)}와(과) ${safelyStringifyUnknownValue(issue.key)}은(는) 디코딩하면 동일한 키 ${safelyStringifyUnknownValue(issue.outputKey)}이(가) 됩니다.`;
  }
};

/** Formats an ObjectError in Korean. */
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
        return "Object 프로퍼티는 데이터 프로퍼티여야 합니다. 이 Type을 사용하기 전에 접근자 값을 일반 데이터로 구체화하거나 다른 Type을 사용하세요.";
      case "NonEnumerable":
        return "Object 프로퍼티는 열거 가능해야 합니다. 열거 가능하게 만들거나 다른 Type을 사용하세요.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `필수 프로퍼티 ${safelyStringifyUnknownValue(key)}이(가) 없습니다.`;
  }
  if (typeof key === "symbol") {
    return "Object 프로퍼티 키는 문자열이어야 합니다. symbol 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `프로퍼티 ${safelyStringifyUnknownValue(key)}은(는) 허용되지 않습니다. 해당 프로퍼티를 제거하거나 다른 Type을 사용하세요.`;
  }
  return `프로퍼티 ${safelyStringifyUnknownValue(key)}이(가) 유효하지 않습니다.`;
};

/** Formats a DiscriminatedUnionError in Korean. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `판별자 프로퍼티 ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property}은(는) 데이터 프로퍼티여야 합니다.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property}은(는) 자체 프로퍼티여야 합니다.`;
      }
      return `${property}은(는) 열거 가능해야 합니다.`;
    }
    case "Discriminator":
      return `판별자 프로퍼티 ${safelyStringifyUnknownValue(error.reason.key)}에 예상하지 못한 값 ${safelyStringifyUnknownValue(error.reason.value)}이(가) 있습니다.`;
    case "Member":
      return `선택된 변형 ${safelyStringifyUnknownValue(error.reason.discriminator)}이(가) 유효하지 않습니다.`;
  }
};

/** Formats a DataError in Korean. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `${safelyStringifyUnknownValue(issue.value)} 값은 Data가 아닙니다.`;
    case "UnexpectedPrototype":
      return `Data ${issue.container}에 예기치 않은 프로토타입이 있습니다.`;
    case "Accessor":
      return "Data 프로퍼티는 데이터 프로퍼티여야 합니다. 이 Type을 사용하기 전에 접근자 값을 일반 데이터로 구체화하거나 다른 Type을 사용하세요.";
    case "NonEnumerable":
      return "Data Object 프로퍼티는 열거 가능해야 합니다. 해당 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
    case "SymbolProperty":
      return "Data Object 프로퍼티 키는 문자열이어야 합니다. symbol 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
    case "Hole":
      return "Data Array 요소가 없습니다.";
    case "InvalidUint8Array":
      return "Data Uint8Array는 분리되지 않은 ArrayBuffer를 참조하고 그 범위 안에 있어야 합니다.";
    case "ExcessProperty":
      return `Data ${issue.container}에는 불필요한 자체 프로퍼티가 있으면 안 됩니다. 해당 프로퍼티를 제거하거나 다른 Type을 사용하세요.`;
  }
};

/** Formats a JsonValueError in Korean. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `${safelyStringifyUnknownValue(issue.value)} 값은 JSON 값이 아닙니다.`;
    case "NonFiniteNumber":
      return "JSON 숫자는 유한해야 합니다.";
    case "UnexpectedPrototype":
      return "값은 객체이지만 JsonValue 객체는 일반 객체이거나 null 프로토타입을 가져야 합니다.";
    case "Accessor":
      return "JSON 프로퍼티는 데이터 프로퍼티여야 합니다. 이 Type을 사용하기 전에 접근자 값을 일반 데이터로 구체화하거나 다른 Type을 사용하세요.";
    case "NonEnumerable":
      return "JSON 객체 프로퍼티는 열거 가능해야 합니다. 해당 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
    case "SymbolProperty":
      return "JSON 객체 프로퍼티 키는 문자열이어야 합니다. symbol 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
    case "Hole":
      return "JSON 배열 요소가 없습니다.";
    case "ExcessProperty":
      return "불필요한 JSON 배열 프로퍼티는 허용되지 않습니다. 해당 프로퍼티를 제거하거나 다른 Type을 사용하세요.";
    case "CircularReference":
      return "JsonValue에는 순환 참조가 포함되어서는 안 됩니다.";
  }
};

/** Formats a JsonError in Korean. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값을 JsonValue로 파싱할 수 없습니다.`;

/** Formats a ByteSizeLiteralError in Korean. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 바이트 크기 리터럴이 아닙니다. "512KiB" 또는 "1MiB" 같은 값을 사용하세요.`;

/** Formats a ByteLengthError in Korean. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "-0 값은 바이트 길이가 아닙니다. 대신 0을 사용하세요.";

/** Formats a ByteLengthFromStringError in Korean. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 바이트 길이가 아닙니다. 바이트 수 또는 10MiB 같은 리터럴을 사용하세요.`;

/** Formats a DurationLiteralError in Korean. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 기간 리터럴이 아닙니다. "500ms" 또는 "1.5s" 같은 값을 사용하세요.`;

/** Formats a PercentageLiteralError in Korean. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 백분율 리터럴이 아닙니다. "50%" 또는 "12.5%" 같은 값을 사용하세요.`;
