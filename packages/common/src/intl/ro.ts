/**
 * Formatatoare românești pentru erorile Evolu Type.
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

  return `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este de tipul ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Valoarea ${safelyStringifyUnknownValue(reason.value)} nu este un obiect.`
    : "Valoarea este un obiect, dar un Output Object trebuie să fie un obiect simplu sau să aibă un prototip null.";

/** Formatează un NeverError în română. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este validă pentru tipul Never.`;

/** Formatează un String TypeOfError în română. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formatează un TemplateLiteralError în română. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu corespunde șablonului literal.`;

/** Formatează un Number TypeOfError în română. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formatează un BigInt TypeOfError în română. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formatează un Boolean TypeOfError în română. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formatează un Symbol TypeOfError în română. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formatează un Function TypeOfError în română. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formatează un EvoluTypeError în română. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Evolu Type.`;

/** Formatează un ObjectTagError în română. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu are eticheta de obiect așteptată ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formatează un InstanceOfError în română. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o instanță a ${error.constructorName}.`;

/** Formatează un LiteralError în română. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este strict egală cu literalul așteptat: ${globalThis.String(error.expected)}.`;

/** Formatează un UnionError în română. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "O valoare nu corespunde niciunei variante permise.";

/** Formatează un DateIsoError în română. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir canonic de dată și oră ISO.`;

/** Formatează un DateIsoFromDateError în română. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date nu poate fi reprezentat ca DateIso.";

/** Formatează un DecimalStringError în română. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal canonic.`;

/** Formatează un Int64Error în română. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un număr întreg cu semn valid pe 64 de biți (Int64).`;

/** Formatează un UInt64Error în română. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un număr întreg fără semn valid pe 64 de biți (UInt64).`;

/** Formatează un Int64StringError în română. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir Int64 valid.`;

/** Formatează un CapitalizedError în română. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să înceapă cu literă mare.`;

/** Formatează un TrimmedError în română. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie fără spații la început sau la sfârșit.`;

/** Formatează un MinLengthError în română. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu îndeplinește lungimea minimă de ${error.min}.`;

/** Formatează un MaxLengthError în română. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} depășește lungimea maximă de ${error.max}.`;

/** Formatează un LengthError în română. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu are lungimea necesară de ${error.exact}.`;

/** Formatează un RegexError în română. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu corespunde cu /${error.source}/${error.flags}.`;

/** Formatează un Base64UrlError în română. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un șir Base64Url valid.`;

/** Formatează un NameError în română. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Name valid.`;

/** Formatează un MnemonicError în română. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este o frază mnemonică BIP39 în engleză validă.`;

/** Formatează un IdError în română. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Id valid.`;

/** Formatează un TableIdError în română. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu este un Id valid pentru tabelul ${error.table}.`;

/** Formatează un NonNegativeError în română. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie nenegativă (>= 0).`;

/** Formatează un NonNegativeDecimalStringError în română. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal nenegativ.`;

/** Formatează un PositiveError în română. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie pozitivă (> 0).`;

/** Formatează un PositiveDecimalStringError în română. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal pozitiv.`;

/** Formatează un NonPositiveError în română. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie nepozitivă (<= 0).`;

/** Formatează un NonPositiveDecimalStringError în română. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal nepozitiv.`;

/** Formatează un NegativeError în română. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie negativă (< 0).`;

/** Formatează un NegativeDecimalStringError în română. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un șir zecimal negativ.`;

/** Formatează un IntError în română. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un număr întreg sigur.`;

/** Formatează un GreaterThanError în română. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mare decât ${error.min}.`;

/** Formatează un GreaterThanOrEqualToError în română. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mare sau egală cu ${error.min}.`;

/** Formatează un LessThanError în română. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mică decât ${error.max}.`;

/** Formatează un LessThanOrEqualToError în română. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie mai mică sau egală cu ${error.max}.`;

/** Formatează un NonNaNError în română. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Valoarea nu trebuie să fie NaN.";

/** Formatează un FiniteError în română. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie finită.`;

/** Formatează un MultipleOfError în română. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie un multiplu de ${error.divisor}.`;

/** Formatează un BetweenError în română. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} trebuie să fie între ${error.min} și ${error.max}, inclusiv.`;

/** Formatează un ArrayError în română. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un tablou.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Lipsește un element al tabloului la indexul ${issue.index}.`;
    case "Accessor":
      return `Elementul tabloului de la indexul ${issue.index} trebuie să fie o proprietate de date.`;
    case "ExcessProperty":
      return "O proprietate Array în exces nu este permisă. Eliminați-o sau utilizați un Type diferit.";
    case "Element":
      return `Elementul tabloului de la indexul ${issue.index} nu este valid.`;
  }
};

/** Formatează un SetError în română. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `O proprietate Set în exces ${safelyStringifyUnknownValue(issue.key)} nu este permisă.`;
    case "Element":
      return `Elementul Set de la indexul ${issue.index} nu este valid.`;
  }
};

/** Formatează un MapError în română. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `O proprietate Map în exces ${safelyStringifyUnknownValue(issue.key)} nu este permisă.`;
    case "Key":
    case "Value":
      return `Elementul Map de la indexul ${issue.index} nu este valid.`;
    case "Collision":
      return `Cheile Map ${safelyStringifyUnknownValue(issue.previousKey)} și ${safelyStringifyUnknownValue(issue.key)} se decodează la aceeași cheie ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formatează un TupleError în română. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un tuplu.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Un Tuple trebuie să conțină exact ${error.reason.expected} elemente, dar valoarea conține ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Lipsește un element Tuple la indexul ${issue.index}.`;
    case "Accessor":
      return `Elementul Tuple de la indexul ${issue.index} trebuie să fie o proprietate de date.`;
    case "ExcessProperty":
      return "O proprietate Tuple în exces nu este permisă. Eliminați-o sau utilizați un Type diferit.";
    case "Element":
      return `Elementul Tuple de la indexul ${issue.index} nu este valid.`;
  }
};

/** Formatează un RecordError în română. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Valoarea ${safelyStringifyUnknownValue(error.reason.value)} nu este un Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Valoarea este un obiect, dar un Output Record trebuie să fie un obiect simplu sau să aibă un prototip null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Cheia proprietății ${safelyStringifyUnknownValue(issue.key)} nu este validă.`;
    case "Value":
      return `Valoarea proprietății ${safelyStringifyUnknownValue(issue.key)} nu este validă.`;
    case "Accessor":
      return `Proprietatea Record ${safelyStringifyUnknownValue(issue.key)} trebuie să fie o proprietate de date.`;
    case "NonEnumerable":
      return `Proprietatea Record ${safelyStringifyUnknownValue(issue.key)} trebuie să fie enumerabilă.`;
    case "Collision":
      return `Cheile Record ${safelyStringifyUnknownValue(issue.previousKey)} și ${safelyStringifyUnknownValue(issue.key)} se decodează la aceeași cheie ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formatează un ObjectError în română. */
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
        return "O proprietate Object trebuie să fie o proprietate de date. Materializați valorile accesorilor în date simple înainte de a utiliza acest Type sau utilizați un Type diferit.";
      case "NonEnumerable":
        return "O proprietate Object trebuie să fie enumerabilă. Faceți-o enumerabilă sau utilizați un Type diferit.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Lipsește proprietatea obligatorie ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "Cheia unei proprietăți Object trebuie să fie un șir. Eliminați proprietatea simbol sau utilizați un Type diferit.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Proprietatea ${safelyStringifyUnknownValue(key)} nu este permisă. Eliminați-o sau utilizați un Type diferit.`;
  }
  return `Proprietatea ${safelyStringifyUnknownValue(key)} nu este validă.`;
};

/** Formatează un DiscriminatedUnionError în română. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Proprietatea discriminator ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} trebuie să fie o proprietate de date.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} trebuie să fie o proprietate proprie.`;
      }
      return `${property} trebuie să fie enumerabilă.`;
    }
    case "Discriminator":
      return `Proprietatea discriminator ${safelyStringifyUnknownValue(error.reason.key)} are valoarea neașteptată ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Varianta selectată ${safelyStringifyUnknownValue(error.reason.discriminator)} nu este validă.`;
  }
};

/** Formatează un JsonValueError în română. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Valoarea ${safelyStringifyUnknownValue(issue.value)} nu este o valoare JSON.`;
    case "NonFiniteNumber":
      return "Un număr JSON trebuie să fie finit.";
    case "UnexpectedPrototype":
      return "Valoarea este un obiect, dar un obiect JsonValue trebuie să fie un obiect simplu sau să aibă un prototip null.";
    case "Accessor":
      return "O proprietate JSON trebuie să fie o proprietate de date. Materializați valorile accesorilor în date simple înainte de a utiliza acest Type sau utilizați un Type diferit.";
    case "NonEnumerable":
      return "O proprietate a unui obiect JSON trebuie să fie enumerabilă. Eliminați-o sau utilizați un Type diferit.";
    case "SymbolProperty":
      return "Cheia unei proprietăți a unui obiect JSON trebuie să fie un șir. Eliminați proprietatea simbol sau utilizați un Type diferit.";
    case "Hole":
      return "Lipsește un element al unui tablou JSON.";
    case "ExcessProperty":
      return "O proprietate a unui tablou JSON în exces nu este permisă. Eliminați-o sau utilizați un Type diferit.";
    case "CircularReference":
      return "Un JsonValue nu trebuie să conțină referințe circulare.";
  }
};

/** Formatează un JsonError în română. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Valoarea ${safelyStringifyUnknownValue(error.value)} nu poate fi analizată ca JsonValue.`;
