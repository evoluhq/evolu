/**
 * Formatadores de erros de Type do Evolu em português.
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

  return `O valor ${safelyStringifyUnknownValue(error.value)} não é do tipo ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `O valor ${safelyStringifyUnknownValue(reason.value)} não é um objeto.`
    : "O valor é um objeto, mas uma saída de Object tem de ser um objeto simples ou ter um protótipo nulo.";

/** Formata um NeverError em português. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é válido para o tipo Never.`;

/** Formata um TypeOfError de String em português. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formata um TemplateLiteralError em português. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde ao literal de modelo.`;

/** Formata um TypeOfError de Number em português. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formata um TypeOfError de BigInt em português. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formata um TypeOfError de Boolean em português. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formata um TypeOfError de Symbol em português. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formata um TypeOfError de Function em português. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formata um EvoluTypeError em português. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Type do Evolu.`;
/** Formata um ObjectTagError em português. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não tem a etiqueta de objeto esperada ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formata um InstanceOfError em português. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma instância de ${error.constructorName}.`;
/** Formata um LiteralError em português. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é estritamente igual ao literal esperado: ${String(error.expected)}.`;
/** Formata um UnionError em português. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Um valor não corresponde a nenhuma variante permitida.";
/** Formata um DateIsoError em português. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma cadeia de carateres canónica de data e hora ISO.`;
/** Formata um DateIsoFromDateError em português. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "A Date não pode ser representada como DateIso.";
/** Formata um DecimalStringError em português. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal canónica.`;
/** Formata um Int64Error em português. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro com sinal de 64 bits válido (Int64).`;
/** Formata um UInt64Error em português. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro sem sinal de 64 bits válido (UInt64).`;
/** Formata um Int64StringError em português. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma cadeia de carateres Int64 válida.`;
/** Formata um CapitalizedError em português. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de começar por maiúscula.`;
/** Formata um TrimmedError em português. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de estar sem espaços no início ou no fim.`;
/** Formata um MinLengthError em português. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não cumpre o comprimento mínimo de ${error.min}.`;
/** Formata um MaxLengthError em português. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} excede o comprimento máximo de ${error.max}.`;
/** Formata um LengthError em português. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não tem o comprimento obrigatório de ${error.exact}.`;
/** Formata um RegexError em português. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde a /${error.source}/${error.flags}.`;
/** Formata um Base64UrlError em português. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma cadeia de carateres Base64Url válida.`;
/** Formata um NameError em português. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Name válido.`;
/** Formata um MnemonicError em português. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma mnemónica BIP39 em inglês válida.`;
/** Formata um IdError em português. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido.`;
/** Formata um TableIdError em português. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido para a tabela ${error.table}.`;
/** Formata um NonNegativeError em português. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser não negativo (>= 0).`;
/** Formata um NonNegativeDecimalStringError em português. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal não negativa.`;
/** Formata um PositiveError em português. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser positivo (> 0).`;
/** Formata um PositiveDecimalStringError em português. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal positiva.`;
/** Formata um NonPositiveError em português. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser não positivo (<= 0).`;
/** Formata um NonPositiveDecimalStringError em português. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal não positiva.`;
/** Formata um NegativeError em português. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser negativo (< 0).`;
/** Formata um NegativeDecimalStringError em português. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal negativa.`;
/** Formata um IntError em português. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser um inteiro seguro.`;
/** Formata um GreaterThanError em português. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser superior a ${error.min}.`;
/** Formata um GreaterThanOrEqualToError em português. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser superior ou igual a ${error.min}.`;
/** Formata um LessThanError em português. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser inferior a ${error.max}.`;
/** Formata um LessThanOrEqualToError em português. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser inferior ou igual a ${error.max}.`;
/** Formata um NonNaNError em português. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "O valor não pode ser NaN.";
/** Formata um FiniteError em português. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser finito.`;
/** Formata um MultipleOfError em português. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser múltiplo de ${error.divisor}.`;
/** Formata um BetweenError em português. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de estar entre ${error.min} e ${error.max}, inclusive.`;

/** Formata um ArrayError em português. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um array.`;
  }
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Falta um elemento do array no índice ${issue.index}.`;
    case "Accessor":
      return `Um elemento do array no índice ${issue.index} tem de ser uma propriedade de dados.`;
    case "ExcessProperty":
      return "Uma propriedade Array excedente não é permitida. Remova-a ou utilize outro Type.";
    case "Element":
      return `Um elemento do array no índice ${issue.index} é inválido.`;
  }
};

/** Formata um SetError em português. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Uma propriedade Set excedente ${safelyStringifyUnknownValue(issue.key)} não é permitida.`;
    case "Element":
      return `Um elemento de Set no índice ${issue.index} é inválido.`;
  }
};

/** Formata um MapError em português. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Uma propriedade Map excedente ${safelyStringifyUnknownValue(issue.key)} não é permitida.`;
    case "Key":
    case "Value":
      return `Um elemento de Map no índice ${issue.index} é inválido.`;
    case "Collision":
      return `As chaves de Map ${safelyStringifyUnknownValue(issue.previousKey)} e ${safelyStringifyUnknownValue(issue.key)} descodificam para a mesma chave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formata um TupleError em português. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é uma tupla.`;
  if (error.reason.kind === "InvalidLength")
    return `Uma Tuple tem de conter exatamente ${error.reason.expected} elementos, mas o valor contém ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Falta um elemento de Tuple no índice ${issue.index}.`;
    case "Accessor":
      return `Um elemento de Tuple no índice ${issue.index} tem de ser uma propriedade de dados.`;
    case "ExcessProperty":
      return "Uma propriedade Tuple excedente não é permitida. Remova-a ou utilize outro Type.";
    case "Element":
      return `Um elemento de Tuple no índice ${issue.index} é inválido.`;
  }
};

/** Formata um RecordError em português. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Record.`;
  if (error.reason.kind === "NotPlainRecord")
    return "O valor é um objeto, mas uma saída de Record tem de ser um objeto simples ou ter um protótipo nulo.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `A chave da propriedade ${safelyStringifyUnknownValue(issue.key)} é inválida.`;
    case "Value":
      return `O valor da propriedade ${safelyStringifyUnknownValue(issue.key)} é inválido.`;
    case "Accessor":
      return `Uma propriedade de Record ${safelyStringifyUnknownValue(issue.key)} tem de ser uma propriedade de dados.`;
    case "NonEnumerable":
      return `Uma propriedade de Record ${safelyStringifyUnknownValue(issue.key)} tem de ser enumerável.`;
    case "Collision":
      return `As chaves de Record ${safelyStringifyUnknownValue(issue.previousKey)} e ${safelyStringifyUnknownValue(issue.key)} descodificam para a mesma chave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formata um ObjectError em português. */
export const formatObjectError: TypeErrorFormatter<ObjectError> = (error) => {
  if (error.reason.kind !== "Properties")
    return formatPlainObjectRootError(error.reason);
  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);
  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "Uma propriedade de Object tem de ser uma propriedade de dados. Materialize os valores de acesso em dados simples antes de utilizar este Type ou utilize outro Type.";
      case "NonEnumerable":
        return "Uma propriedade de Object tem de ser enumerável. Torne-a enumerável ou utilize outro Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `Falta a propriedade obrigatória ${safelyStringifyUnknownValue(key)}.`;
  if (typeof key === "symbol")
    return "Uma chave de propriedade de Object tem de ser uma cadeia de carateres. Remova a propriedade de símbolo ou utilize outro Type.";
  if (propertyError.type === "ObjectExcessProperty")
    return `A propriedade ${safelyStringifyUnknownValue(key)} não é permitida. Remova-a ou utilize outro Type.`;
  return `A propriedade ${safelyStringifyUnknownValue(key)} é inválida.`;
};

/** Formata um DiscriminatedUnionError em português. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `A propriedade discriminadora ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} tem de ser uma propriedade de dados.`;
      if (error.reason.reason === "Inherited")
        return `${property} tem de ser uma propriedade própria.`;
      return `${property} tem de ser enumerável.`;
    }
    case "Discriminator":
      return `A propriedade discriminadora ${safelyStringifyUnknownValue(error.reason.key)} tem o valor inesperado ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `A variante selecionada ${safelyStringifyUnknownValue(error.reason.discriminator)} é inválida.`;
  }
};

/** Formata um JsonValueError em português. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `O valor ${safelyStringifyUnknownValue(issue.value)} não é um valor JSON.`;
    case "NonFiniteNumber":
      return "Um número JSON tem de ser finito.";
    case "UnexpectedPrototype":
      return "O valor é um objeto, mas um objeto JsonValue tem de ser um objeto simples ou ter um protótipo nulo.";
    case "Accessor":
      return "Uma propriedade JSON tem de ser uma propriedade de dados. Materialize os valores de acesso em dados simples antes de utilizar este Type ou utilize outro Type.";
    case "NonEnumerable":
      return "Uma propriedade de objeto JSON tem de ser enumerável. Remova-a ou utilize outro Type.";
    case "SymbolProperty":
      return "Uma chave de propriedade de objeto JSON tem de ser uma cadeia de carateres. Remova a propriedade de símbolo ou utilize outro Type.";
    case "Hole":
      return "Falta um elemento do array JSON.";
    case "ExcessProperty":
      return "Uma propriedade de array JSON excedente não é permitida. Remova-a ou utilize outro Type.";
    case "CircularReference":
      return "Um JsonValue não pode conter referências circulares.";
  }
};

/** Formata um JsonError em português. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não pode ser analisado como JsonValue.`;
