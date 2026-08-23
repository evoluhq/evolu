/**
 * מעצבי הודעות שגיאה של Evolu Type בעברית.
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

  return `הערך ${safelyStringifyUnknownValue(error.value)} אינו מסוג ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `הערך ${safelyStringifyUnknownValue(reason.value)} אינו אובייקט.`
    : "הערך הוא אובייקט, אך פלט של Object חייב להיות אובייקט פשוט או בעל אב־טיפוס null.";

/** מעצב שגיאת NeverError בעברית. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו חוקי עבור הטיפוס Never.`;

/** מעצב שגיאת String TypeOfError בעברית. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** מעצב שגיאת TemplateLiteralError בעברית. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו תואם ל-template literal.`;

/** מעצב שגיאת Number TypeOfError בעברית. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** מעצב שגיאת BigInt TypeOfError בעברית. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** מעצב שגיאת Boolean TypeOfError בעברית. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** מעצב שגיאת Symbol TypeOfError בעברית. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** מעצב שגיאת Function TypeOfError בעברית. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** מעצב שגיאת EvoluTypeError בעברית. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `הערך ${safelyStringifyUnknownValue(error.value)} אינו Evolu Type.`;

/** מעצב שגיאת ObjectTagError בעברית. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `לערך ${safelyStringifyUnknownValue(error.value)} אין את תג האובייקט הצפוי ${safelyStringifyUnknownValue(error.expected)}.`;

/** מעצב שגיאת InstanceOfError בעברית. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מופע של ${error.constructorName}.`;

/** מעצב שגיאת LiteralError בעברית. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו שווה באופן מחמיר לליטרל הצפוי: ${globalThis.String(error.expected)}.`;

/** מעצב שגיאת UnionError בעברית. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "הערך אינו תואם לאף וריאנט מותר.";

/** מעצב שגיאת DateIsoError בעברית. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת תאריך ושעה קנונית בתקן ISO.`;

/** מעצב שגיאת DateIsoFromDateError בעברית. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "לא ניתן לייצג את ה-Date כ-DateIso.";

/** מעצב שגיאת DecimalStringError בעברית. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית קנונית.`;

/** מעצב שגיאת Int64Error בעברית. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר שלם חוקי עם סימן ברוחב 64 סיביות (Int64).`;

/** מעצב שגיאת UInt64Error בעברית. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מספר שלם חוקי ללא סימן ברוחב 64 סיביות (UInt64).`;

/** מעצב שגיאת Int64StringError בעברית. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת Int64 חוקית.`;

/** מעצב שגיאת CapitalizedError בעברית. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) => `הערך ${safelyStringifyUnknownValue(error.value)} חייב להתחיל באות גדולה.`;

/** מעצב שגיאת TrimmedError בעברית. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `יש להסיר רווחים מיותרים מתחילת הערך ${safelyStringifyUnknownValue(error.value)} ומסופו.`;

/** מעצב שגיאת MinLengthError בעברית. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו עומד באורך המינימלי של ${error.min}.`;

/** מעצב שגיאת MaxLengthError בעברית. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חורג מהאורך המרבי של ${error.max}.`;

/** מעצב שגיאת LengthError בעברית. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `האורך של הערך ${safelyStringifyUnknownValue(error.value)} אינו האורך הנדרש, ${error.exact}.`;

/** מעצב שגיאת RegexError בעברית. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו תואם ל-/${error.source}/${error.flags}.`;

/** מעצב שגיאת Base64UrlError בעברית. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מחרוזת Base64Url חוקית.`;

/** מעצב שגיאת NameError בעברית. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו Name חוקי.`;

/** מעצב שגיאת MnemonicError בעברית. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו מנמוניקת BIP39 חוקית באנגלית.`;

/** מעצב שגיאת IdError בעברית. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו Id חוקי.`;

/** מעצב שגיאת TableIdError בעברית. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} אינו Id חוקי עבור הטבלה ${error.table}.`;

/** מעצב שגיאת NonNegativeError בעברית. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות אי-שלילי (>= 0).`;

/** מעצב שגיאת NonNegativeDecimalStringError בעברית. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית אי-שלילית.`;

/** מעצב שגיאת PositiveError בעברית. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות חיובי (> 0).`;

/** מעצב שגיאת PositiveDecimalStringError בעברית. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית חיובית.`;

/** מעצב שגיאת NonPositiveError בעברית. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות אי-חיובי (<= 0).`;

/** מעצב שגיאת NonPositiveDecimalStringError בעברית. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית אי-חיובית.`;

/** מעצב שגיאת NegativeError בעברית. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות שלילי (< 0).`;

/** מעצב שגיאת NegativeDecimalStringError בעברית. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מחרוזת עשרונית שלילית.`;

/** מעצב שגיאת IntError בעברית. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות מספר שלם בטוח.`;

/** מעצב שגיאת GreaterThanError בעברית. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות גדול מ-${error.min}.`;

/** מעצב שגיאת GreaterThanOrEqualToError בעברית. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות גדול מ-${error.min} או שווה לו.`;

/** מעצב שגיאת LessThanError בעברית. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות קטן מ-${error.max}.`;

/** מעצב שגיאת LessThanOrEqualToError בעברית. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות קטן מ-${error.max} או שווה לו.`;

/** מעצב שגיאת NonNaNError בעברית. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "הערך אינו יכול להיות NaN.";

/** מעצב שגיאת FiniteError בעברית. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות סופי.`;

/** מעצב שגיאת MultipleOfError בעברית. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות כפולה של ${error.divisor}.`;

/** מעצב שגיאת BetweenError בעברית. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `הערך ${safelyStringifyUnknownValue(error.value)} חייב להיות בין ${error.min} ל-${error.max}, כולל הגבולות.`;

/** מעצב שגיאת ArrayError בעברית. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו מערך.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `חסר איבר במערך באינדקס ${issue.index}.`;
    case "Accessor":
      return `איבר המערך באינדקס ${issue.index} חייב להיות מאפיין נתונים.`;
    case "ExcessProperty":
      return "מאפיין עודף של Array אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "Element":
      return `איבר המערך באינדקס ${issue.index} אינו חוקי.`;
  }
};

/** מעצב שגיאת SetError בעברית. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `מאפיין Set העודף ${safelyStringifyUnknownValue(issue.key)} אינו מותר.`;
    case "Element":
      return `איבר Set באינדקס ${issue.index} אינו חוקי.`;
  }
};

/** מעצב שגיאת MapError בעברית. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `מאפיין Map העודף ${safelyStringifyUnknownValue(issue.key)} אינו מותר.`;
    case "Key":
    case "Value":
      return `איבר Map באינדקס ${issue.index} אינו חוקי.`;
    case "Collision":
      return `המפתחות ${safelyStringifyUnknownValue(issue.previousKey)} ו-${safelyStringifyUnknownValue(issue.key)} של Map מפוענחים לאותו מפתח ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** מעצב שגיאת TupleError בעברית. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple חייב להכיל בדיוק ${error.reason.expected} איברים, אך הערך מכיל ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `חסר איבר Tuple באינדקס ${issue.index}.`;
    case "Accessor":
      return `איבר Tuple באינדקס ${issue.index} חייב להיות מאפיין נתונים.`;
    case "ExcessProperty":
      return "מאפיין עודף של Tuple אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "Element":
      return `איבר Tuple באינדקס ${issue.index} אינו חוקי.`;
  }
};

/** מעצב שגיאת RecordError בעברית. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `הערך ${safelyStringifyUnknownValue(error.reason.value)} אינו Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "הערך הוא אובייקט, אך פלט של Record חייב להיות אובייקט פשוט או בעל אב־טיפוס null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `מפתח המאפיין ${safelyStringifyUnknownValue(issue.key)} אינו חוקי.`;
    case "Value":
      return `הערך של המאפיין ${safelyStringifyUnknownValue(issue.key)} אינו חוקי.`;
    case "Accessor":
      return `המאפיין ${safelyStringifyUnknownValue(issue.key)} של Record חייב להיות מאפיין נתונים.`;
    case "NonEnumerable":
      return `המאפיין ${safelyStringifyUnknownValue(issue.key)} של Record חייב להיות enumerable.`;
    case "Collision":
      return `המפתחות ${safelyStringifyUnknownValue(issue.previousKey)} ו-${safelyStringifyUnknownValue(issue.key)} של Record מפוענחים לאותו מפתח ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** מעצב שגיאת ObjectError בעברית. */
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
        return "מאפיין של Object חייב להיות מאפיין נתונים. יש להמיר ערכי accessor לנתונים פשוטים לפני השימוש ב-Type זה, או להשתמש ב-Type אחר.";
      case "NonEnumerable":
        return "מאפיין של Object חייב להיות enumerable. יש להפוך אותו ל-enumerable או להשתמש ב-Type אחר.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `המאפיין הנדרש ${safelyStringifyUnknownValue(key)} חסר.`;
  }
  if (typeof key === "symbol") {
    return "מפתח מאפיין של Object חייב להיות מחרוזת. יש להסיר את מאפיין ה-symbol או להשתמש ב-Type אחר.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `המאפיין ${safelyStringifyUnknownValue(key)} אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.`;
  }
  return `המאפיין ${safelyStringifyUnknownValue(key)} אינו חוקי.`;
};

/** מעצב שגיאת DiscriminatedUnionError בעברית. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `מאפיין ה-discriminator ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} חייב להיות מאפיין נתונים.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} חייב להיות מאפיין עצמי.`;
      }
      return `${property} חייב להיות enumerable.`;
    }
    case "Discriminator":
      return `למאפיין ה-discriminator ${safelyStringifyUnknownValue(error.reason.key)} יש ערך בלתי צפוי ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `הווריאנט שנבחר ${safelyStringifyUnknownValue(error.reason.discriminator)} אינו חוקי.`;
  }
};

/** מעצב שגיאת JsonValueError בעברית. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `הערך ${safelyStringifyUnknownValue(issue.value)} אינו ערך JSON.`;
    case "NonFiniteNumber":
      return "מספר JSON חייב להיות סופי.";
    case "UnexpectedPrototype":
      return "הערך הוא אובייקט, אך אובייקט JsonValue חייב להיות אובייקט פשוט או בעל אב־טיפוס null.";
    case "Accessor":
      return "מאפיין JSON חייב להיות מאפיין נתונים. יש להמיר ערכי accessor לנתונים פשוטים לפני השימוש ב-Type זה, או להשתמש ב-Type אחר.";
    case "NonEnumerable":
      return "מאפיין של אובייקט JSON חייב להיות enumerable. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "SymbolProperty":
      return "מפתח מאפיין של אובייקט JSON חייב להיות מחרוזת. יש להסיר את מאפיין ה-symbol או להשתמש ב-Type אחר.";
    case "Hole":
      return "חסר איבר במערך JSON.";
    case "ExcessProperty":
      return "מאפיין עודף של מערך JSON אינו מותר. יש להסיר אותו או להשתמש ב-Type אחר.";
    case "CircularReference":
      return "JsonValue אינו יכול להכיל הפניות מעגליות.";
  }
};

/** מעצב שגיאת JsonError בעברית. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `לא ניתן לנתח את הערך ${safelyStringifyUnknownValue(error.value)} ל-JsonValue.`;
