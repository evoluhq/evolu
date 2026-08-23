/**
 * 한국어 Evolu Type 오류 포매터.
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

  return `${safelyStringifyUnknownValue(error.value)} 값은 ${typeOf} 타입이 아닙니다.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `${safelyStringifyUnknownValue(reason.value)} 값은 객체가 아닙니다.`
    : "값은 객체이지만 Object Output은 일반 객체이거나 null 프로토타입을 가져야 합니다.";

/** NeverError를 한국어로 포맷합니다. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 Never 타입에 유효하지 않습니다.`;

/** String TypeOfError를 한국어로 포맷합니다. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralError를 한국어로 포맷합니다. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 템플릿 리터럴과 일치하지 않습니다.`;

/** Number TypeOfError를 한국어로 포맷합니다. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfError를 한국어로 포맷합니다. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfError를 한국어로 포맷합니다. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfError를 한국어로 포맷합니다. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfError를 한국어로 포맷합니다. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeError를 한국어로 포맷합니다. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `${safelyStringifyUnknownValue(error.value)} 값은 Evolu Type이 아닙니다.`;

/** ObjectTagError를 한국어로 포맷합니다. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값에는 예상된 객체 태그 ${safelyStringifyUnknownValue(error.expected)}가 없습니다.`;

/** InstanceOfError를 한국어로 포맷합니다. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.constructorName}의 인스턴스가 아닙니다.`;

/** LiteralError를 한국어로 포맷합니다. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 예상된 리터럴과 엄격하게 동일하지 않습니다: ${globalThis.String(error.expected)}.`;

/** UnionError를 한국어로 포맷합니다. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "값이 허용된 어떤 variant와도 일치하지 않습니다.";

/** DateIsoError를 한국어로 포맷합니다. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 정규 ISO 날짜-시간 문자열이 아닙니다.`;

/** DateIsoFromDateError를 한국어로 포맷합니다. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date를 DateIso로 표현할 수 없습니다.";

/** DecimalStringError를 한국어로 포맷합니다. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 정규 10진수 문자열이어야 합니다.`;

/** Int64Error를 한국어로 포맷합니다. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 부호 있는 64비트 정수(Int64)가 아닙니다.`;

/** UInt64Error를 한국어로 포맷합니다. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 부호 없는 64비트 정수(UInt64)가 아닙니다.`;

/** Int64StringError를 한국어로 포맷합니다. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Int64 문자열이 아닙니다.`;

/** CapitalizedError를 한국어로 포맷합니다. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 첫 글자가 대문자여야 합니다.`;

/** TrimmedError를 한국어로 포맷합니다. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값의 앞뒤 공백이 제거되어 있어야 합니다.`;

/** MinLengthError를 한국어로 포맷합니다. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 최소 길이 ${error.min}을 충족하지 않습니다.`;

/** MaxLengthError를 한국어로 포맷합니다. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 최대 길이 ${error.max}을 초과합니다.`;

/** LengthError를 한국어로 포맷합니다. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값의 길이는 ${error.exact}이어야 합니다.`;

/** RegexError를 한국어로 포맷합니다. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 /${error.source}/${error.flags}와 일치하지 않습니다.`;

/** Base64UrlError를 한국어로 포맷합니다. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Base64Url 문자열이 아닙니다.`;

/** NameError를 한국어로 포맷합니다. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Name이 아닙니다.`;

/** MnemonicError를 한국어로 포맷합니다. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 영어 BIP39 니모닉이 아닙니다.`;

/** IdError를 한국어로 포맷합니다. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유효한 Id가 아닙니다.`;

/** TableIdError를 한국어로 포맷합니다. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.table} 테이블에 유효한 Id가 아닙니다.`;

/** NonNegativeError를 한국어로 포맷합니다. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음수가 아니어야 합니다(>= 0).`;

/** NonNegativeDecimalStringError를 한국어로 포맷합니다. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음수가 아닌 10진수 문자열이어야 합니다.`;

/** PositiveError를 한국어로 포맷합니다. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양수여야 합니다(> 0).`;

/** PositiveDecimalStringError를 한국어로 포맷합니다. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양의 10진수 문자열이어야 합니다.`;

/** NonPositiveError를 한국어로 포맷합니다. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양수가 아니어야 합니다(<= 0).`;

/** NonPositiveDecimalStringError를 한국어로 포맷합니다. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 양수가 아닌 10진수 문자열이어야 합니다.`;

/** NegativeError를 한국어로 포맷합니다. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음수여야 합니다(< 0).`;

/** NegativeDecimalStringError를 한국어로 포맷합니다. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 음의 10진수 문자열이어야 합니다.`;

/** IntError를 한국어로 포맷합니다. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 안전한 정수여야 합니다.`;

/** GreaterThanError를 한국어로 포맷합니다. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.min}보다 커야 합니다.`;

/** GreaterThanOrEqualToError를 한국어로 포맷합니다. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.min} 이상이어야 합니다.`;

/** LessThanError를 한국어로 포맷합니다. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.max}보다 작아야 합니다.`;

/** LessThanOrEqualToError를 한국어로 포맷합니다. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.max} 이하여야 합니다.`;

/** NonNaNError를 한국어로 포맷합니다. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "값은 NaN이어서는 안 됩니다.";

/** FiniteError를 한국어로 포맷합니다. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 유한해야 합니다.`;

/** MultipleOfError를 한국어로 포맷합니다. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.divisor}의 배수여야 합니다.`;

/** BetweenError를 한국어로 포맷합니다. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값은 ${error.min} 이상 ${error.max} 이하여야 합니다.`;

/** ArrayError를 한국어로 포맷합니다. */
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

/** SetError를 한국어로 포맷합니다. */
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

/** MapError를 한국어로 포맷합니다. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `${safelyStringifyUnknownValue(error.reason.value)} 값은 Map이 아닙니다.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `불필요한 Map 프로퍼티 ${safelyStringifyUnknownValue(issue.key)}은(는) 허용되지 않습니다.`;
    case "Key":
    case "Value":
      return `인덱스 ${issue.index}의 Map 요소가 유효하지 않습니다.`;
    case "Collision":
      return `Map 키 ${safelyStringifyUnknownValue(issue.previousKey)}와(과) ${safelyStringifyUnknownValue(issue.key)}은(는) 디코딩하면 동일한 키 ${safelyStringifyUnknownValue(issue.outputKey)}이(가) 됩니다.`;
  }
};

/** TupleError를 한국어로 포맷합니다. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `${safelyStringifyUnknownValue(error.reason.value)} 값은 튜플이 아닙니다.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple에는 정확히 ${error.reason.expected}개의 요소가 있어야 하지만 값에는 ${error.reason.actual}개의 요소가 있습니다.`;
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

/** RecordError를 한국어로 포맷합니다. */
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

/** ObjectError를 한국어로 포맷합니다. */
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

/** DiscriminatedUnionError를 한국어로 포맷합니다. */
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
      return `선택된 variant ${safelyStringifyUnknownValue(error.reason.discriminator)}이(가) 유효하지 않습니다.`;
  }
};

/** JsonValueError를 한국어로 포맷합니다. */
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

/** JsonError를 한국어로 포맷합니다. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `${safelyStringifyUnknownValue(error.value)} 값을 JsonValue로 파싱할 수 없습니다.`;
