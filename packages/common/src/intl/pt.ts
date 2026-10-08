/**
 * Portuguese Evolu Type error formatters.
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

  return `O valor ${safelyStringifyUnknownValue(error.value)} não é do tipo ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `O valor ${safelyStringifyUnknownValue(reason.value)} não é um objeto.`
    : "O valor é um objeto, mas uma saída de Object tem de ser um objeto simples ou ter um protótipo nulo.";

/** Formats a NeverError in Portuguese. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é válido para o tipo Never.`;

/** Formats a String TypeOfError in Portuguese. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Portuguese. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde ao literal de modelo.`;

/** Formats a Number TypeOfError in Portuguese. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formats a BigInt TypeOfError in Portuguese. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formats a Boolean TypeOfError in Portuguese. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formats a Symbol TypeOfError in Portuguese. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formats a Function TypeOfError in Portuguese. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Portuguese. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um booleano. Utilize true ou false.`;

/** Formats an EvoluTypeError in Portuguese. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Type do Evolu.`;
/** Formats an ObjectTagError in Portuguese. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não tem a etiqueta de objeto esperada ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formats an InstanceOfError in Portuguese. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma instância de ${error.constructorName}.`;
/** Formats a LiteralError in Portuguese. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é estritamente igual ao literal esperado: ${String(error.expected)}.`;
/** Formats a UnionError in Portuguese. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Um valor não corresponde a nenhuma variante permitida.";
/** Formats a DateIsoError in Portuguese. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma cadeia de carateres canónica de data e hora ISO.`;
/** Formats a DateIsoFromDateError in Portuguese. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "A Date não pode ser representada como DateIso.";
/** Formats a DecimalStringError in Portuguese. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal canónica.`;
/** Formats an Int64Error in Portuguese. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro com sinal de 64 bits válido (Int64).`;
/** Formats a UInt64Error in Portuguese. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro sem sinal de 64 bits válido (UInt64).`;
/** Formats an Int64StringError in Portuguese. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma cadeia de carateres Int64 válida.`;

/** Formats an IdentifierError in Portuguese. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um identificador ${error.casing}.`;

/** Formats a CapitalizedError in Portuguese. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de começar por maiúscula.`;

/** Formats an UncapitalizedError in Portuguese. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não pode começar por uma letra maiúscula.`;

/** Formats an UppercasedError in Portuguese. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de estar em maiúsculas.`;

/** Formats a LowercasedError in Portuguese. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de estar em minúsculas.`;
/** Formats a TrimmedError in Portuguese. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de estar sem espaços no início ou no fim.`;
/** Formats a StartsWithError in Portuguese. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de começar por ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats a MinLengthError in Portuguese. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não cumpre o comprimento mínimo de ${error.min}.`;
/** Formats a MaxLengthError in Portuguese. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} excede o comprimento máximo de ${error.max}.`;
/** Formats a LengthError in Portuguese. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não tem o comprimento obrigatório de ${error.exact}.`;
/** Formats a RegexError in Portuguese. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde a /${error.source}/${error.flags}.`;
/** Formats a Base64UrlError in Portuguese. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma cadeia de carateres Base64Url válida.`;
/** Formats a NameError in Portuguese. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Name válido.`;
/** Formats an EmailError in Portuguese. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um endereço de e-mail válido.`;
/** Formats a MnemonicError in Portuguese. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma mnemónica BIP39 em inglês válida.`;
/** Formats an IdError in Portuguese. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido.`;
/** Formats a TableIdError in Portuguese. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido para a tabela ${error.table}.`;
/** Formats a UuidError in Portuguese. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um UUID canónico em minúsculas.`;
/** Formats a NonNegativeError in Portuguese. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser não negativo (>= 0).`;
/** Formats a NonNegativeDecimalStringError in Portuguese. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal não negativa.`;
/** Formats a PositiveError in Portuguese. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser positivo (> 0).`;
/** Formats a PositiveDecimalStringError in Portuguese. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal positiva.`;
/** Formats a NonPositiveError in Portuguese. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser não positivo (<= 0).`;
/** Formats a NonPositiveDecimalStringError in Portuguese. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal não positiva.`;
/** Formats a NegativeError in Portuguese. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser negativo (< 0).`;
/** Formats a NegativeDecimalStringError in Portuguese. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser uma cadeia de carateres decimal negativa.`;
/** Formats an IntError in Portuguese. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser um inteiro seguro.`;
/** Formats a GreaterThanError in Portuguese. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser superior a ${error.min}.`;
/** Formats a GreaterThanOrEqualToError in Portuguese. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser superior ou igual a ${error.min}.`;
/** Formats a LessThanError in Portuguese. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser inferior a ${error.max}.`;
/** Formats a LessThanOrEqualToError in Portuguese. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser inferior ou igual a ${error.max}.`;
/** Formats a NonNaNError in Portuguese. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "O valor não pode ser NaN.";
/** Formats a FiniteError in Portuguese. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser finito.`;
/** Formats a MultipleOfError in Portuguese. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de ser múltiplo de ${error.divisor}.`;
/** Formats a BetweenError in Portuguese. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem de estar entre ${error.min} e ${error.max}, inclusive.`;

/** Formats an IntFromStringError in Portuguese. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro decimal.`;

/** Formats an ArrayError in Portuguese. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um array.`;
  }
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Falta um elemento do array no índice ${issue.index}.`;
    case "Accessor":
      return `O elemento do array no índice ${issue.index} tem de ser uma propriedade de dados.`;
    case "ExcessProperty":
      return "Uma propriedade Array excedente não é permitida. Remova-a ou utilize outro Type.";
    case "Element":
      return `O elemento do array no índice ${issue.index} é inválido.`;
  }
};

/** Formats a SetError in Portuguese. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `A propriedade Set excedente ${safelyStringifyUnknownValue(issue.key)} não é permitida.`;
    case "Element":
      return `O elemento de Set no índice ${issue.index} é inválido.`;
  }
};

/** Formats a MapError in Portuguese. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `A propriedade Map excedente ${safelyStringifyUnknownValue(issue.key)} não é permitida.`;
    case "Key":
      return `A chave de Map no índice ${issue.index} é inválida.`;
    case "Value":
      return `O valor de Map no índice ${issue.index} é inválido.`;
    case "Collision":
      return `As chaves de Map nos índices ${issue.previousIndex} e ${issue.index} descodificam para a mesma chave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Portuguese. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é uma tupla.`;
  if (error.reason.kind === "InvalidLength")
    return `Uma Tuple tem de ter um comprimento de ${error.reason.expected}, mas o valor tem um comprimento de ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Falta um elemento de Tuple no índice ${issue.index}.`;
    case "Accessor":
      return `O elemento de Tuple no índice ${issue.index} tem de ser uma propriedade de dados.`;
    case "ExcessProperty":
      return "Uma propriedade Tuple excedente não é permitida. Remova-a ou utilize outro Type.";
    case "Element":
      return `O elemento de Tuple no índice ${issue.index} é inválido.`;
  }
};

/** Formats a RecordError in Portuguese. */
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
      return `A propriedade de Record ${safelyStringifyUnknownValue(issue.key)} tem de ser uma propriedade de dados.`;
    case "NonEnumerable":
      return `A propriedade de Record ${safelyStringifyUnknownValue(issue.key)} tem de ser enumerável.`;
    case "Collision":
      return `As chaves de Record ${safelyStringifyUnknownValue(issue.previousKey)} e ${safelyStringifyUnknownValue(issue.key)} descodificam para a mesma chave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Portuguese. */
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

/** Formats a DiscriminatedUnionError in Portuguese. */
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

/** Formats a DataError in Portuguese. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `O valor ${safelyStringifyUnknownValue(issue.value)} não é um valor Data.`;
    case "UnexpectedPrototype":
      return `Um valor Data do tipo ${issue.container} tem um protótipo inesperado.`;
    case "Accessor":
      return "Uma propriedade Data tem de ser uma propriedade de dados. Materialize os valores de acesso em dados simples antes de utilizar este Type ou utilize outro Type.";
    case "NonEnumerable":
      return "Uma propriedade de objeto Data tem de ser enumerável. Remova-a ou utilize outro Type.";
    case "SymbolProperty":
      return "Uma chave de propriedade de objeto Data tem de ser uma cadeia de carateres. Remova a propriedade de símbolo ou utilize outro Type.";
    case "Hole":
      return "Falta um elemento do array Data.";
    case "InvalidUint8Array":
      return "Um Uint8Array Data tem de ter um ArrayBuffer não desanexado e estar dentro dos seus limites.";
    case "ExcessProperty":
      return `Um valor Data do tipo ${issue.container} não pode ter propriedades próprias excedentes. Remova a propriedade ou utilize outro Type.`;
  }
};

/** Formats a JsonValueError in Portuguese. */
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

/** Formats a JsonError in Portuguese. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não pode ser analisado como JsonValue.`;

/** Formats a ByteSizeLiteralError in Portuguese. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um literal de tamanho em bytes. Utilize um valor como "512KiB" ou "1MiB".`;

/** Formats a ByteLengthError in Portuguese. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "O valor -0 não é um comprimento em bytes. Utilize 0 em vez disso.";

/** Formats a ByteLengthFromStringError in Portuguese. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um comprimento em bytes. Utilize um número de bytes ou um literal como 10MiB.`;

/** Formats a DurationLiteralError in Portuguese. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um literal de duração. Utilize um valor como "500ms" ou "1.5s".`;

/** Formats a PercentageLiteralError in Portuguese. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um literal de percentagem. Utilize um valor como "50%" ou "12.5%".`;
