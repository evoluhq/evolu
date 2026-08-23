/**
 * Formatadores de erros do Evolu Type em português brasileiro.
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
    : "O valor é um objeto, mas uma saída de Object deve ser um objeto simples ou ter um protótipo nulo.";

/** Formata um NeverError em português brasileiro. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é válido para o tipo Never.`;

/** Formata um TypeOfError de String em português brasileiro. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formata um TemplateLiteralError em português brasileiro. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde ao literal de modelo.`;

/** Formata um TypeOfError de Number em português brasileiro. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formata um TypeOfError de BigInt em português brasileiro. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formata um TypeOfError de Boolean em português brasileiro. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formata um TypeOfError de Symbol em português brasileiro. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formata um TypeOfError de Function em português brasileiro. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formata um EvoluTypeError em português brasileiro. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `O valor ${safelyStringifyUnknownValue(error.value)} não é um Evolu Type.`;

/** Formata um ObjectTagError em português brasileiro. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não possui a tag de objeto esperada ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formata um InstanceOfError em português brasileiro. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma instância de ${error.constructorName}.`;

/** Formata um LiteralError em português brasileiro. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é estritamente igual ao literal esperado: ${globalThis.String(error.expected)}.`;

/** Formata um UnionError em português brasileiro. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Um valor não corresponde a nenhuma variante permitida.";

/** Formata um DateIsoError em português brasileiro. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma string de data e hora ISO canônica.`;

/** Formata um DateIsoFromDateError em português brasileiro. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date não pode ser representado como DateIso.";

/** Formata um DecimalStringError em português brasileiro. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal canônica.`;

/** Formata um Int64Error em português brasileiro. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro com sinal de 64 bits (Int64) válido.`;

/** Formata um UInt64Error em português brasileiro. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro sem sinal de 64 bits (UInt64) válido.`;

/** Formata um Int64StringError em português brasileiro. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma string Int64 válida.`;

/** Formata um CapitalizedError em português brasileiro. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve começar com letra maiúscula.`;

/** Formata um TrimmedError em português brasileiro. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar sem espaços nas extremidades.`;

/** Formata um MinLengthError em português brasileiro. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não atende ao comprimento mínimo de ${error.min}.`;

/** Formata um MaxLengthError em português brasileiro. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} excede o comprimento máximo de ${error.max}.`;

/** Formata um LengthError em português brasileiro. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não tem o comprimento exigido de ${error.exact}.`;

/** Formata um RegexError em português brasileiro. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde a /${error.source}/${error.flags}.`;

/** Formata um Base64UrlError em português brasileiro. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma string Base64Url válida.`;

/** Formata um NameError em português brasileiro. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Name válido.`;

/** Formata um MnemonicError em português brasileiro. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma mnemônica BIP39 em inglês válida.`;

/** Formata um IdError em português brasileiro. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido.`;

/** Formata um TableIdError em português brasileiro. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido para a tabela ${error.table}.`;

/** Formata um NonNegativeError em português brasileiro. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser não negativo (>= 0).`;

/** Formata um NonNegativeDecimalStringError em português brasileiro. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal não negativa.`;

/** Formata um PositiveError em português brasileiro. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser positivo (> 0).`;

/** Formata um PositiveDecimalStringError em português brasileiro. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal positiva.`;

/** Formata um NonPositiveError em português brasileiro. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser não positivo (<= 0).`;

/** Formata um NonPositiveDecimalStringError em português brasileiro. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal não positiva.`;

/** Formata um NegativeError em português brasileiro. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser negativo (< 0).`;

/** Formata um NegativeDecimalStringError em português brasileiro. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal negativa.`;

/** Formata um IntError em português brasileiro. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser um inteiro seguro.`;

/** Formata um GreaterThanError em português brasileiro. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser maior que ${error.min}.`;

/** Formata um GreaterThanOrEqualToError em português brasileiro. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser maior ou igual a ${error.min}.`;

/** Formata um LessThanError em português brasileiro. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser menor que ${error.max}.`;

/** Formata um LessThanOrEqualToError em português brasileiro. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser menor ou igual a ${error.max}.`;

/** Formata um NonNaNError em português brasileiro. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "O valor não deve ser NaN.";

/** Formata um FiniteError em português brasileiro. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser finito.`;

/** Formata um MultipleOfError em português brasileiro. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser múltiplo de ${error.divisor}.`;

/** Formata um BetweenError em português brasileiro. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar entre ${error.min} e ${error.max}, inclusive.`;

/** Formata um ArrayError em português brasileiro. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um array.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Falta um elemento do array no índice ${issue.index}.`;
    case "Accessor":
      return `O elemento do array no índice ${issue.index} deve ser uma propriedade de dados.`;
    case "ExcessProperty":
      return "Uma propriedade extra de Array não é permitida. Remova-a ou use outro Type.";
    case "Element":
      return `O elemento do array no índice ${issue.index} é inválido.`;
  }
};

/** Formata um SetError em português brasileiro. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `A propriedade extra de Set ${safelyStringifyUnknownValue(issue.key)} não é permitida.`;
    case "Element":
      return `O elemento de Set no índice ${issue.index} é inválido.`;
  }
};

/** Formata um MapError em português brasileiro. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `A propriedade extra de Map ${safelyStringifyUnknownValue(issue.key)} não é permitida.`;
    case "Key":
    case "Value":
      return `O elemento de Map no índice ${issue.index} é inválido.`;
    case "Collision":
      return `As chaves de Map ${safelyStringifyUnknownValue(issue.previousKey)} e ${safelyStringifyUnknownValue(issue.key)} decodificam para a mesma chave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formata um TupleError em português brasileiro. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é uma tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Uma Tuple deve conter exatamente ${error.reason.expected} elementos, mas o valor contém ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Falta um elemento de Tuple no índice ${issue.index}.`;
    case "Accessor":
      return `O elemento de Tuple no índice ${issue.index} deve ser uma propriedade de dados.`;
    case "ExcessProperty":
      return "Uma propriedade extra de Tuple não é permitida. Remova-a ou use outro Type.";
    case "Element":
      return `O elemento de Tuple no índice ${issue.index} é inválido.`;
  }
};

/** Formata um RecordError em português brasileiro. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "O valor é um objeto, mas uma saída de Record deve ser um objeto simples ou ter um protótipo nulo.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `A chave de propriedade ${safelyStringifyUnknownValue(issue.key)} é inválida.`;
    case "Value":
      return `O valor da propriedade ${safelyStringifyUnknownValue(issue.key)} é inválido.`;
    case "Accessor":
      return `A propriedade de Record ${safelyStringifyUnknownValue(issue.key)} deve ser uma propriedade de dados.`;
    case "NonEnumerable":
      return `A propriedade de Record ${safelyStringifyUnknownValue(issue.key)} deve ser enumerável.`;
    case "Collision":
      return `As chaves de Record ${safelyStringifyUnknownValue(issue.previousKey)} e ${safelyStringifyUnknownValue(issue.key)} decodificam para a mesma chave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formata um ObjectError em português brasileiro. */
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
        return "Uma propriedade de Object deve ser uma propriedade de dados. Materialize os valores de acesso em dados simples antes de usar este Type ou use outro Type.";
      case "NonEnumerable":
        return "Uma propriedade de Object deve ser enumerável. Torne-a enumerável ou use outro Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Falta a propriedade obrigatória ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "Uma chave de propriedade de Object deve ser uma string. Remova a propriedade symbol ou use outro Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `A propriedade ${safelyStringifyUnknownValue(key)} não é permitida. Remova-a ou use outro Type.`;
  }
  return `A propriedade ${safelyStringifyUnknownValue(key)} é inválida.`;
};

/** Formata um DiscriminatedUnionError em português brasileiro. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `A propriedade discriminadora ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} deve ser uma propriedade de dados.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} deve ser uma propriedade própria.`;
      }
      return `${property} deve ser enumerável.`;
    }
    case "Discriminator":
      return `A propriedade discriminadora ${safelyStringifyUnknownValue(error.reason.key)} tem um valor inesperado ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `A variante selecionada ${safelyStringifyUnknownValue(error.reason.discriminator)} é inválida.`;
  }
};

/** Formata um JsonValueError em português brasileiro. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `O valor ${safelyStringifyUnknownValue(issue.value)} não é um valor JSON.`;
    case "NonFiniteNumber":
      return "Um número JSON deve ser finito.";
    case "UnexpectedPrototype":
      return "O valor é um objeto, mas um objeto JsonValue deve ser um objeto simples ou ter um protótipo nulo.";
    case "Accessor":
      return "Uma propriedade JSON deve ser uma propriedade de dados. Materialize os valores de acesso em dados simples antes de usar este Type ou use outro Type.";
    case "NonEnumerable":
      return "Uma propriedade de objeto JSON deve ser enumerável. Remova-a ou use outro Type.";
    case "SymbolProperty":
      return "Uma chave de propriedade de objeto JSON deve ser uma string. Remova a propriedade symbol ou use outro Type.";
    case "Hole":
      return "Falta um elemento do array JSON.";
    case "ExcessProperty":
      return "Uma propriedade extra de array JSON não é permitida. Remova-a ou use outro Type.";
    case "CircularReference":
      return "Um JsonValue não deve conter referências circulares.";
  }
};

/** Formata um JsonError em português brasileiro. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não pode ser analisado como um JsonValue.`;
