/**
 * Ukrainian Evolu Type error formatters.
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
  TrimmedError,
  TupleElementsError,
  TupleError,
  TypeError,
  TypeErrorFormatter,
  TypeOfError,
  UInt64Error,
  UnionError,
} from "../Type.ts";

const typeOfNames = {
  String: "рядком",
  Number: "числом",
  BigInt: "значенням BigInt",
  Boolean: "логічним значенням",
  Symbol: "символом",
  Function: "функцією",
};

const formatTypeOfError = (
  error: TypeOfError<keyof typeof typeOfNames>,
): string =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є ${typeOfNames[error.expected]}.`;

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Значення ${safelyStringifyUnknownValue(reason.value)} не є об’єктом.`
    : "Значення є об’єктом, але вихідне значення Object має бути простим об’єктом або мати прототип null.";

/** Форматує NeverError українською. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим для типу Never.`;

/** Форматує String TypeOfError українською. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Форматує TemplateLiteralError українською. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не відповідає шаблонному літералу.`;

/** Форматує Number TypeOfError українською. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Форматує BigInt TypeOfError українською. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Форматує Boolean TypeOfError українською. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Форматує BooleanFromStringError українською. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є логічним значенням. Використовуйте true або false.`;

/** Форматує Symbol TypeOfError українською. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Форматує Function TypeOfError українською. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Форматує EvoluTypeError українською. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Значення ${safelyStringifyUnknownValue(error.value)} не є Evolu Type.`;

/** Форматує ObjectTagError українською. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не має очікуваного тегу об’єкта ${safelyStringifyUnknownValue(error.expected)}.`;

/** Форматує InstanceOfError українською. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є екземпляром ${error.constructorName}.`;

/** Форматує LiteralError українською. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не дорівнює строго очікуваному літералу: ${String(error.expected)}.`;

/** Форматує UnionError українською. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Значення не відповідає жодному з допустимих варіантів.";

/** Форматує DateIsoError українською. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є канонічним рядком дати й часу ISO.`;

/** Форматує DateIsoFromDateError українською. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Дату неможливо подати як DateIso.";

/** Форматує DecimalStringError українською. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути канонічним десятковим рядком.`;

/** Форматує Int64Error українською. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим 64-бітним цілим числом зі знаком (Int64).`;

/** Форматує UInt64Error українською. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим 64-бітним цілим числом без знака (UInt64).`;

/** Форматує Int64StringError українською. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим рядком Int64.`;

/** Форматує CapitalizedError українською. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має починатися з великої літери.`;

/** Форматує TrimmedError українською. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не має містити пробілів на початку та в кінці.`;

/** Форматує MinLengthError українською. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} коротше за мінімальну довжину ${error.min}.`;

/** Форматує MaxLengthError українською. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} перевищує максимальну довжину ${error.max}.`;

/** Форматує LengthError українською. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не має необхідної довжини ${error.exact}.`;

/** Форматує RegexError українською. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не відповідає /${error.source}/${error.flags}.`;

/** Форматує Base64UrlError українською. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим рядком Base64Url.`;

/** Форматує NameError українською. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим Name.`;

/** Форматує MnemonicError українською. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимою англійською мнемонічною фразою BIP39.`;

/** Форматує IdError українською. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим Id.`;

/** Форматує TableIdError українською. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є допустимим Id для таблиці ${error.table}.`;

/** Форматує NonNegativeError українською. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути невід’ємним (>= 0).`;

/** Форматує NonNegativeDecimalStringError українською. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути невід’ємним десятковим рядком.`;

/** Форматує PositiveError українською. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути додатним (> 0).`;

/** Форматує PositiveDecimalStringError українською. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути додатним десятковим рядком.`;

/** Форматує NonPositiveError українською. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути недодатним (<= 0).`;

/** Форматує NonPositiveDecimalStringError українською. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути недодатним десятковим рядком.`;

/** Форматує NegativeError українською. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути від’ємним (< 0).`;

/** Форматує NegativeDecimalStringError українською. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути від’ємним десятковим рядком.`;

/** Форматує IntError українською. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути безпечним цілим числом.`;

/** Форматує IntFromStringError українською. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} не є десятковим цілим числом.`;

/** Форматує GreaterThanError українською. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути більшим за ${error.min}.`;

/** Форматує GreaterThanOrEqualToError українською. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути більшим або рівним ${error.min}.`;

/** Форматує LessThanError українською. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути меншим за ${error.max}.`;

/** Форматує LessThanOrEqualToError українською. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути меншим або рівним ${error.max}.`;

/** Форматує NonNaNError українською. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Значення не має бути NaN.";

/** Форматує FiniteError українською. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути скінченним.`;

/** Форматує MultipleOfError українською. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути кратним ${error.divisor}.`;

/** Форматує BetweenError українською. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} має бути в межах від ${error.min} до ${error.max} включно.`;

/** Форматує ArrayError українською. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є масивом.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Елемент масиву з індексом ${issue.index} відсутній.`;
    case "Accessor":
      return `Елемент масиву з індексом ${issue.index} має бути властивістю даних.`;
    case "ExcessProperty":
      return "Зайва властивість Array не допускається. Видаліть її або використайте інший Type.";
    case "Element":
      return `Елемент масиву з індексом ${issue.index} недійсний.`;
  }
};

/** Форматує SetError українською. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Зайва властивість Set ${safelyStringifyUnknownValue(issue.key)} не допускається.`;
    case "Element":
      return `Елемент Set з індексом ${issue.index} недійсний.`;
  }
};

/** Форматує MapError українською. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Зайва властивість Map ${safelyStringifyUnknownValue(issue.key)} не допускається.`;
    case "Key":
    case "Value":
      return `Елемент Map з індексом ${issue.index} недійсний.`;
    case "Collision":
      return `Ключі Map ${safelyStringifyUnknownValue(issue.previousKey)} та ${safelyStringifyUnknownValue(issue.key)} декодуються в той самий ключ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Форматує TupleError українською. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є кортежем.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple має містити рівно ${error.reason.expected} елементів, але значення містить ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Елемент Tuple з індексом ${issue.index} відсутній.`;
    case "Accessor":
      return `Елемент Tuple з індексом ${issue.index} має бути властивістю даних.`;
    case "ExcessProperty":
      return "Зайва властивість Tuple не допускається. Видаліть її або використайте інший Type.";
    case "Element":
      return `Елемент Tuple з індексом ${issue.index} недійсний.`;
  }
};

/** Форматує RecordError українською. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Значення ${safelyStringifyUnknownValue(error.reason.value)} не є Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Значення є об’єктом, але вихідне значення Record має бути простим об’єктом або мати прототип null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Ключ властивості ${safelyStringifyUnknownValue(issue.key)} недійсний.`;
    case "Value":
      return `Значення властивості ${safelyStringifyUnknownValue(issue.key)} недійсне.`;
    case "Accessor":
      return `Властивість Record ${safelyStringifyUnknownValue(issue.key)} має бути властивістю даних.`;
    case "NonEnumerable":
      return `Властивість Record ${safelyStringifyUnknownValue(issue.key)} має бути перелічуваною.`;
    case "Collision":
      return `Ключі Record ${safelyStringifyUnknownValue(issue.previousKey)} та ${safelyStringifyUnknownValue(issue.key)} декодуються в той самий ключ ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Форматує ObjectError українською. */
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
        return "Властивість Object має бути властивістю даних. Матеріалізуйте значення аксесорів у прості дані перед використанням цього Type або використайте інший Type.";
      case "NonEnumerable":
        return "Властивість Object має бути перелічуваною. Зробіть її перелічуваною або використайте інший Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Обов’язкова властивість ${safelyStringifyUnknownValue(key)} відсутня.`;
  }
  if (typeof key === "symbol") {
    return "Ключ властивості Object має бути рядком. Видаліть символьну властивість або використайте інший Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Властивість ${safelyStringifyUnknownValue(key)} не допускається. Видаліть її або використайте інший Type.`;
  }
  return `Властивість ${safelyStringifyUnknownValue(key)} недійсна.`;
};

/** Форматує DiscriminatedUnionError українською. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Властивість-дискримінатор ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} має бути властивістю даних.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} має бути власною властивістю.`;
      }
      return `${property} має бути перелічуваною.`;
    }
    case "Discriminator":
      return `Властивість-дискримінатор ${safelyStringifyUnknownValue(error.reason.key)} має неочікуване значення ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Вибраний варіант ${safelyStringifyUnknownValue(error.reason.discriminator)} недійсний.`;
  }
};

/** Форматує JsonValueError українською. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Значення ${safelyStringifyUnknownValue(issue.value)} не є значенням JSON.`;
    case "NonFiniteNumber":
      return "Число JSON має бути скінченним.";
    case "UnexpectedPrototype":
      return "Значення є об’єктом, але об’єкт JsonValue має бути простим об’єктом або мати прототип null.";
    case "Accessor":
      return "Властивість JSON має бути властивістю даних. Матеріалізуйте значення аксесорів у прості дані перед використанням цього Type або використайте інший Type.";
    case "NonEnumerable":
      return "Властивість об’єкта JSON має бути перелічуваною. Видаліть її або використайте інший Type.";
    case "SymbolProperty":
      return "Ключ властивості об’єкта JSON має бути рядком. Видаліть символьну властивість або використайте інший Type.";
    case "Hole":
      return "Елемент масиву JSON відсутній.";
    case "ExcessProperty":
      return "Зайва властивість масиву JSON не допускається. Видаліть її або використайте інший Type.";
    case "CircularReference":
      return "JsonValue не має містити циклічних посилань.";
  }
};

/** Форматує JsonError українською. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Значення ${safelyStringifyUnknownValue(error.value)} неможливо розібрати як JsonValue.`;
