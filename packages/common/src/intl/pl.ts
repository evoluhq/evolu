/**
 * Polish Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type * as Type from "../Type.ts";

const formatValueMustBe = (value: unknown, expected: string): string =>
  `Wartość ${safelyStringifyUnknownValue(value)} musi być ${expected}.`;

const formatPlainObjectRootError = (
  reason:
    | Type.ObjectNotObjectError["reason"]
    | Type.ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Wartość ${safelyStringifyUnknownValue(reason.value)} nie jest obiektem.`
    : "Wartość jest obiektem, ale wynik typu Object musi być zwykłym obiektem lub mieć prototyp null.";

/** Formats a NeverError in Polish. */
export const formatNeverError: Type.TypeErrorFormatter<Type.NeverError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowa dla typu Never.`;

/** Formats a String TypeOfError in Polish. */
export const formatStringError: Type.TypeErrorFormatter<
  Type.TypeOfError<"String">
> = (error) => formatValueMustBe(error.value, "tekstem");

/** Formats a TemplateLiteralError in Polish. */
export const formatTemplateLiteralError: Type.TypeErrorFormatter<
  Type.TemplateLiteralError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie pasuje do literału szablonowego.`;

/** Formats a Number TypeOfError in Polish. */
export const formatNumberError: Type.TypeErrorFormatter<
  Type.TypeOfError<"Number">
> = (error) => formatValueMustBe(error.value, "liczbą");

/** Formats a BigInt TypeOfError in Polish. */
export const formatBigIntError: Type.TypeErrorFormatter<
  Type.TypeOfError<"BigInt">
> = (error) => formatValueMustBe(error.value, "liczbą całkowitą typu bigint");

/** Formats a Boolean TypeOfError in Polish. */
export const formatBooleanError: Type.TypeErrorFormatter<
  Type.TypeOfError<"Boolean">
> = (error) => formatValueMustBe(error.value, "wartością logiczną");

/** Formats a Symbol TypeOfError in Polish. */
export const formatSymbolError: Type.TypeErrorFormatter<
  Type.TypeOfError<"Symbol">
> = (error) => formatValueMustBe(error.value, "symbolem");

/** Formats a Function TypeOfError in Polish. */
export const formatFunctionError: Type.TypeErrorFormatter<
  Type.TypeOfError<"Function">
> = (error) => formatValueMustBe(error.value, "funkcją");

/** Formats an EvoluTypeError in Polish. */
export const formatEvoluTypeError: Type.TypeErrorFormatter<
  Type.EvoluTypeError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być Evolu Type.`;

/** Formats an ObjectTagError in Polish. */
export const formatObjectTagError: Type.TypeErrorFormatter<
  Type.ObjectTagError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie ma oczekiwanego znacznika obiektu ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in Polish. */
export const formatInstanceOfError: Type.TypeErrorFormatter<
  Type.InstanceOfError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest instancją ${error.constructorName}.`;

/** Formats a LiteralError in Polish. */
export const formatLiteralError: Type.TypeErrorFormatter<Type.LiteralError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest ściśle równa oczekiwanemu literałowi: ${String(error.expected)}.`;

/** Formats a UnionError in Polish. */
export const formatUnionError: Type.TypeErrorFormatter<Type.UnionError> = () =>
  "Wartość nie pasuje do żadnego z dozwolonych wariantów.";

/** Formats a DateIsoError in Polish. */
export const formatDateIsoError: Type.TypeErrorFormatter<Type.DateIsoError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest kanonicznym łańcuchem daty i czasu ISO.`;

/** Formats a DateIsoFromDateError in Polish. */
export const formatDateIsoFromDateError: Type.TypeErrorFormatter<
  Type.DateIsoFromDateError
> = () => "Daty nie można przedstawić jako DateIso.";

/** Formats a DecimalStringError in Polish. */
export const formatDecimalStringError: Type.TypeErrorFormatter<
  Type.DecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być kanonicznym łańcuchem dziesiętnym.`;

/** Formats an Int64Error in Polish. */
export const formatInt64Error: Type.TypeErrorFormatter<Type.Int64Error> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową 64-bitową liczbą całkowitą ze znakiem (Int64).`;

/** Formats a UInt64Error in Polish. */
export const formatUInt64Error: Type.TypeErrorFormatter<Type.UInt64Error> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową 64-bitową liczbą całkowitą bez znaku (UInt64).`;

/** Formats an Int64StringError in Polish. */
export const formatInt64StringError: Type.TypeErrorFormatter<
  Type.Int64StringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym łańcuchem Int64.`;

/** Formats a CapitalizedError in Polish. */
export const formatCapitalizedError: Type.TypeErrorFormatter<
  Type.CapitalizedError
> = (error) =>
  `Tekst ${safelyStringifyUnknownValue(error.value)} musi zaczynać się wielką literą.`;

/** Formats a TrimmedError in Polish. */
export const formatTrimmedError: Type.TypeErrorFormatter<Type.TrimmedError> = (
  error,
) =>
  `Tekst ${safelyStringifyUnknownValue(error.value)} nie może zawierać białych znaków na początku ani na końcu.`;

/** Formats a MinLengthError in Polish. */
export const formatMinLengthError: Type.TypeErrorFormatter<
  Type.MinLengthError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie spełnia minimalnej długości ${error.min}.`;

/** Formats a MaxLengthError in Polish. */
export const formatMaxLengthError: Type.TypeErrorFormatter<
  Type.MaxLengthError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} przekracza maksymalną długość ${error.max}.`;

/** Formats a LengthError in Polish. */
export const formatLengthError: Type.TypeErrorFormatter<Type.LengthError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie ma wymaganej długości ${error.exact}.`;

/** Formats a RegexError in Polish. */
export const formatRegexError: Type.TypeErrorFormatter<Type.RegexError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie pasuje do /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Polish. */
export const formatBase64UrlError: Type.TypeErrorFormatter<
  Type.Base64UrlError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym łańcuchem Base64Url.`;

/** Formats a NameError in Polish. */
export const formatNameError: Type.TypeErrorFormatter<Type.NameError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową nazwą.`;

/** Formats a MnemonicError in Polish. */
export const formatMnemonicError: Type.TypeErrorFormatter<
  Type.MnemonicError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłową angielską frazą mnemoniczną BIP39.`;

/** Formats an IdError in Polish. */
export const formatIdError: Type.TypeErrorFormatter<Type.IdError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym Id.`;

/** Formats a TableIdError in Polish. */
export const formatTableIdError: Type.TypeErrorFormatter<Type.TableIdError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} nie jest prawidłowym Id tabeli ${error.table}.`;

/** Formats a NonNegativeError in Polish. */
export const formatNonNegativeError: Type.TypeErrorFormatter<
  Type.NonNegativeError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być nieujemna (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Polish. */
export const formatNonNegativeDecimalStringError: Type.TypeErrorFormatter<
  Type.NonNegativeDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być nieujemnym łańcuchem dziesiętnym.`;

/** Formats a PositiveError in Polish. */
export const formatPositiveError: Type.TypeErrorFormatter<
  Type.PositiveError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być dodatnia (> 0).`;

/** Formats a PositiveDecimalStringError in Polish. */
export const formatPositiveDecimalStringError: Type.TypeErrorFormatter<
  Type.PositiveDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być dodatnim łańcuchem dziesiętnym.`;

/** Formats a NonPositiveError in Polish. */
export const formatNonPositiveError: Type.TypeErrorFormatter<
  Type.NonPositiveError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być niedodatnia (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Polish. */
export const formatNonPositiveDecimalStringError: Type.TypeErrorFormatter<
  Type.NonPositiveDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być niedodatnim łańcuchem dziesiętnym.`;

/** Formats a NegativeError in Polish. */
export const formatNegativeError: Type.TypeErrorFormatter<
  Type.NegativeError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być ujemna (< 0).`;

/** Formats a NegativeDecimalStringError in Polish. */
export const formatNegativeDecimalStringError: Type.TypeErrorFormatter<
  Type.NegativeDecimalStringError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być ujemnym łańcuchem dziesiętnym.`;

/** Formats an IntError in Polish. */
export const formatIntError: Type.TypeErrorFormatter<Type.IntError> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być bezpieczną liczbą całkowitą.`;

/** Formats a GreaterThanError in Polish. */
export const formatGreaterThanError: Type.TypeErrorFormatter<
  Type.GreaterThanError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być większa niż ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Polish. */
export const formatGreaterThanOrEqualToError: Type.TypeErrorFormatter<
  Type.GreaterThanOrEqualToError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być większa lub równa ${error.min}.`;

/** Formats a LessThanError in Polish. */
export const formatLessThanError: Type.TypeErrorFormatter<
  Type.LessThanError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być mniejsza niż ${error.max}.`;

/** Formats a LessThanOrEqualToError in Polish. */
export const formatLessThanOrEqualToError: Type.TypeErrorFormatter<
  Type.LessThanOrEqualToError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być mniejsza lub równa ${error.max}.`;

/** Formats a NonNaNError in Polish. */
export const formatNonNaNError: Type.TypeErrorFormatter<
  Type.NonNaNError
> = () => "Wartość nie może być NaN.";

/** Formats a FiniteError in Polish. */
export const formatFiniteError: Type.TypeErrorFormatter<Type.FiniteError> = (
  error,
) => `Wartość ${safelyStringifyUnknownValue(error.value)} musi być skończona.`;

/** Formats a MultipleOfError in Polish. */
export const formatMultipleOfError: Type.TypeErrorFormatter<
  Type.MultipleOfError
> = (error) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi być wielokrotnością ${error.divisor}.`;

/** Formats a BetweenError in Polish. */
export const formatBetweenError: Type.TypeErrorFormatter<Type.BetweenError> = (
  error,
) =>
  `Wartość ${safelyStringifyUnknownValue(error.value)} musi mieścić się w przedziale od ${error.min} do ${error.max}, włącznie.`;

/** Formats an ArrayError in Polish. */
export const formatArrayError: Type.TypeErrorFormatter<Type.ArrayError> = (
  error,
) => {
  if (error.reason.kind === "NotArray")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest tablicą.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Brakuje elementu tablicy o indeksie ${issue.index}.`;
    case "Accessor":
      return `Element tablicy o indeksie ${issue.index} musi być właściwością danych.`;
    case "ExcessProperty":
      return "Nadmiarowa właściwość tablicy jest niedozwolona. Usuń ją lub użyj innego Type.";
    case "Element":
      return `Element tablicy o indeksie ${issue.index} jest nieprawidłowy.`;
  }
};

/** Formats a SetError in Polish. */
export const formatSetError: Type.TypeErrorFormatter<Type.SetError> = (
  error,
) => {
  if (error.reason.kind === "NotSet")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest Setem.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Nadmiarowa właściwość Set ${safelyStringifyUnknownValue(issue.key)} jest niedozwolona.`;
    case "Element":
      return `Element Set o indeksie ${issue.index} jest nieprawidłowy.`;
  }
};

/** Formats a MapError in Polish. */
export const formatMapError: Type.TypeErrorFormatter<Type.MapError> = (
  error,
) => {
  if (error.reason.kind === "NotMap")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest Mapem.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Nadmiarowa właściwość Map ${safelyStringifyUnknownValue(issue.key)} jest niedozwolona.`;
    case "Key":
    case "Value":
      return `Element Map o indeksie ${issue.index} jest nieprawidłowy.`;
    case "Collision":
      return `Klucze Map ${safelyStringifyUnknownValue(issue.previousKey)} i ${safelyStringifyUnknownValue(issue.key)} dekodują się do tego samego klucza ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Polish. */
export const formatTupleError: Type.TypeErrorFormatter<
  Type.TupleError | Type.TupleElementsError<Type.TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest krotką.`;
  if (error.reason.kind === "InvalidLength")
    return `Krotka musi zawierać dokładnie ${error.reason.expected} elementów, ale wartość zawiera ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Brakuje elementu krotki o indeksie ${issue.index}.`;
    case "Accessor":
      return `Element krotki o indeksie ${issue.index} musi być właściwością danych.`;
    case "ExcessProperty":
      return "Nadmiarowa właściwość krotki jest niedozwolona. Usuń ją lub użyj innego Type.";
    case "Element":
      return `Element krotki o indeksie ${issue.index} jest nieprawidłowy.`;
  }
};

/** Formats a RecordError in Polish. */
export const formatRecordError: Type.TypeErrorFormatter<Type.RecordError> = (
  error,
) => {
  if (error.reason.kind === "NotRecord")
    return `Wartość ${safelyStringifyUnknownValue(error.reason.value)} nie jest Recordem.`;
  if (error.reason.kind === "NotPlainRecord")
    return "Wartość jest obiektem, ale wynik typu Record musi być zwykłym obiektem lub mieć prototyp null.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `Klucz właściwości ${safelyStringifyUnknownValue(issue.key)} jest nieprawidłowy.`;
    case "Value":
      return `Wartość właściwości ${safelyStringifyUnknownValue(issue.key)} jest nieprawidłowa.`;
    case "Accessor":
      return `Właściwość Record ${safelyStringifyUnknownValue(issue.key)} musi być właściwością danych.`;
    case "NonEnumerable":
      return `Właściwość Record ${safelyStringifyUnknownValue(issue.key)} musi być wyliczalna.`;
    case "Collision":
      return `Klucze Record ${safelyStringifyUnknownValue(issue.previousKey)} i ${safelyStringifyUnknownValue(issue.key)} dekodują się do tego samego klucza ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Polish. */
export const formatObjectError: Type.TypeErrorFormatter<Type.ObjectError> = (
  error,
) => {
  if (error.reason.kind !== "Properties")
    return formatPlainObjectRootError(error.reason);
  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);
  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as Type.ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "Właściwość Object musi być właściwością danych. Przekształć wartości akcesorów w zwykłe dane przed użyciem tego Type lub użyj innego Type.";
      case "NonEnumerable":
        return "Właściwość Object musi być wyliczalna. Uczyń ją wyliczalną lub użyj innego Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `Brakuje wymaganej właściwości ${safelyStringifyUnknownValue(key)}.`;
  if (typeof key === "symbol")
    return "Klucz właściwości Object musi być tekstem. Usuń właściwość-symbol lub użyj innego Type.";
  if (propertyError.type === "ObjectExcessProperty")
    return `Właściwość ${safelyStringifyUnknownValue(key)} jest niedozwolona. Usuń ją lub użyj innego Type.`;
  return `Właściwość ${safelyStringifyUnknownValue(key)} jest nieprawidłowa.`;
};

/** Formats a DiscriminatedUnionError in Polish. */
export const formatDiscriminatedUnionError: Type.TypeErrorFormatter<
  Type.DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Właściwość dyskryminująca ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} musi być właściwością danych.`;
      if (error.reason.reason === "Inherited")
        return `${property} musi być własną właściwością.`;
      return `${property} musi być wyliczalna.`;
    }
    case "Discriminator":
      return `Właściwość dyskryminująca ${safelyStringifyUnknownValue(error.reason.key)} ma nieoczekiwaną wartość ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Wybrany wariant ${safelyStringifyUnknownValue(error.reason.discriminator)} jest nieprawidłowy.`;
  }
};

/** Formats a JsonValueError in Polish. */
export const formatJsonValueError: Type.TypeErrorFormatter<
  Type.JsonValueError
> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Wartość ${safelyStringifyUnknownValue(issue.value)} nie jest wartością JSON.`;
    case "NonFiniteNumber":
      return "Liczba JSON musi być skończona.";
    case "UnexpectedPrototype":
      return "Wartość jest obiektem, ale obiekt JsonValue musi być zwykłym obiektem lub mieć prototyp null.";
    case "Accessor":
      return "Właściwość JSON musi być właściwością danych. Przekształć wartości akcesorów w zwykłe dane przed użyciem tego Type lub użyj innego Type.";
    case "NonEnumerable":
      return "Właściwość obiektu JSON musi być wyliczalna. Usuń ją lub użyj innego Type.";
    case "SymbolProperty":
      return "Klucz właściwości obiektu JSON musi być tekstem. Usuń właściwość-symbol lub użyj innego Type.";
    case "Hole":
      return "Brakuje elementu tablicy JSON.";
    case "ExcessProperty":
      return "Nadmiarowa właściwość tablicy JSON jest niedozwolona. Usuń ją lub użyj innego Type.";
    case "CircularReference":
      return "JsonValue nie może zawierać odwołań cyklicznych.";
  }
};

/** Formats a JsonError in Polish. */
export const formatJsonError: Type.TypeErrorFormatter<Type.JsonError> = (
  error,
) =>
  `Wartości ${safelyStringifyUnknownValue(error.value)} nie można sparsować jako JsonValue.`;
