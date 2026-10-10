/**
 * Brazilian Portuguese Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
  Base64Error,
  Base64UrlError,
  BooleanFromStringError,
  BetweenBigIntError,
  BetweenError,
  IdentifierError,
  CapitalizedError,
  DataError,
  UncapitalizedError,
  UppercasedError,
  LowercasedError,
  DateIsoError,
  DateIsoFromDateError,
  DateIsoFromRfc3339Error,
  DecimalStringError,
  DiscriminatedUnionError,
  EmailError,
  EndsWithError,
  EvoluTypeError,
  ExcludesError,
  FiniteError,
  FiniteNumberFromStringError,
  GreaterThanBigIntError,
  GreaterThanError,
  GreaterThanOrEqualToBigIntError,
  GreaterThanOrEqualToError,
  HexColorError,
  HexError,
  HostnameError,
  IbanError,
  IncludesError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
  IdError,
  IpAddressError,
  IpAddressFromStringError,
  Ipv4AddressError,
  Ipv6AddressError,
  Ipv6AddressFromStringError,
  IsbnError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanBigIntError,
  LessThanError,
  LessThanOrEqualToBigIntError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxEntriesError,
  MaxLengthError,
  MaxSizeError,
  MaxUtf8ByteLengthError,
  MinEntriesError,
  MinLengthError,
  MinSizeError,
  MnemonicError,
  MultipleOfError,
  NegativeDecimalStringError,
  NegativeError,
  NameError,
  NeverError,
  NonEmptyArrayError,
  NonNaNError,
  NonNegativeDecimalStringError,
  NonNegativeError,
  NonPositiveDecimalStringError,
  NonPositiveError,
  NormalizedError,
  ObjectError,
  ObjectNotObjectError,
  ObjectPropertyAccessError,
  ObjectTagError,
  ObjectUnexpectedPrototypeError,
  PhoneNumberE164Error,
  PlainDateIsoError,
  PositiveDecimalStringError,
  PositiveError,
  RecordError,
  RedactedError,
  RegexError,
  SetError,
  SimplePasswordError,
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
  UlidError,
  UnionError,
  UniqueError,
  UuidError,
  UuidVersionError,
  ValidDateError,
  WellFormedError,
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

/** Formats a NeverError in Brazilian Portuguese. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é válido para o tipo Never.`;

/** Formats a String TypeOfError in Brazilian Portuguese. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Brazilian Portuguese. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde ao literal de modelo.`;

/** Formats a Number TypeOfError in Brazilian Portuguese. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Brazilian Portuguese. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Brazilian Portuguese. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Brazilian Portuguese. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um booleano. Use true ou false.`;

/** Formats a Symbol TypeOfError in Brazilian Portuguese. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Brazilian Portuguese. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Brazilian Portuguese. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `O valor ${safelyStringifyUnknownValue(error.value)} não é um Evolu Type.`;

/** Formats an ObjectTagError in Brazilian Portuguese. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não possui a tag de objeto esperada ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats a ValidDateError in Brazilian Portuguese. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "O objeto Date é inválido.";

/** Formats an InstanceOfError in Brazilian Portuguese. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma instância de ${error.constructorName}.`;

/** Formats a LiteralError in Brazilian Portuguese. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é estritamente igual ao literal esperado: ${String(error.expected)}.`;

/** Formats a UnionError in Brazilian Portuguese. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Um valor não corresponde a nenhuma variante permitida.";

/** Formats a DateIsoError in Brazilian Portuguese. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma string de data e hora ISO canônica.`;

/** Formats a PlainDateIsoError in Brazilian Portuguese. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma data de calendário válida no formato YYYY-MM-DD.`;

/** Formats a DateIsoFromDateError in Brazilian Portuguese. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "O objeto Date não pode ser representado como DateIso.";

/** Formats a DateIsoFromRfc3339Error in Brazilian Portuguese. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma data e hora RFC 3339 suportada. Use um valor como "2024-01-01T12:00:00Z".`;

/** Formats a DecimalStringError in Brazilian Portuguese. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal canônica.`;

/** Formats an Int64Error in Brazilian Portuguese. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro com sinal de 64 bits (Int64) válido.`;

/** Formats a UInt64Error in Brazilian Portuguese. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro sem sinal de 64 bits (UInt64) válido.`;

/** Formats an Int64StringError in Brazilian Portuguese. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma string Int64 válida.`;

/** Formats an IdentifierError in Brazilian Portuguese. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um identificador ${error.casing}.`;

/** Formats a CapitalizedError in Brazilian Portuguese. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve começar com letra maiúscula.`;

/** Formats an UncapitalizedError in Brazilian Portuguese. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não deve começar com uma letra maiúscula.`;

/** Formats an UppercasedError in Brazilian Portuguese. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar em letras maiúsculas.`;

/** Formats a LowercasedError in Brazilian Portuguese. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar em letras minúsculas.`;

/** Formats a TrimmedError in Brazilian Portuguese. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar sem espaços nas extremidades.`;

/** Formats a WellFormedError in Brazilian Portuguese. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser um texto Unicode bem formado.`;

/** Formats a NormalizedError in Brazilian Portuguese. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar na forma de normalização Unicode ${error.form}.`;

/** Formats a StartsWithError in Brazilian Portuguese. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve começar com ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats an EndsWithError in Brazilian Portuguese. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve terminar com ${safelyStringifyUnknownValue(error.suffix)}.`;

/** Formats an IncludesError in Brazilian Portuguese. */
export const formatIncludesError: TypeErrorFormatter<IncludesError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve conter ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats an ExcludesError in Brazilian Portuguese. */
export const formatExcludesError: TypeErrorFormatter<ExcludesError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não deve conter ${safelyStringifyUnknownValue(error.substring)}.`;

/** Formats a MinLengthError in Brazilian Portuguese. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não atende ao comprimento mínimo de ${error.min}.`;

/** Formats a MaxLengthError in Brazilian Portuguese. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} excede o comprimento máximo de ${error.max}.`;

/** Formats a MaxUtf8ByteLengthError in Brazilian Portuguese. */
export const formatMaxUtf8ByteLengthError: TypeErrorFormatter<
  MaxUtf8ByteLengthError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} excede o comprimento máximo em bytes UTF-8 de ${error.max}.`;

/** Formats a LengthError in Brazilian Portuguese. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não tem o comprimento exigido de ${error.exact}.`;

/** Formats a RegexError in Brazilian Portuguese. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não corresponde a /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Brazilian Portuguese. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma string Base64Url válida.`;

/** Formats a Base64Error in Brazilian Portuguese. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma string Base64 válida.`;

/** Formats a HexError in Brazilian Portuguese. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é hexadecimal em minúsculas com um número par de dígitos.`;

/** Formats a HexColorError in Brazilian Portuguese. */
export const formatHexColorError: TypeErrorFormatter<HexColorError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é uma cor no formato #rrggbb em minúsculas.`;

/** Formats a NameError in Brazilian Portuguese. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Name válido.`;

/** Formats an EmailError in Brazilian Portuguese. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um endereço de e-mail válido.`;

/** Formats a HostnameError in Brazilian Portuguese. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um nome de host em minúsculas válido.`;

/** Formats an Ipv4AddressError in Brazilian Portuguese. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um endereço IPv4 válido.`;

/** Formats an Ipv6AddressError in Brazilian Portuguese. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um endereço IPv6 canônico.`;

/** Formats an Ipv6AddressFromStringError in Brazilian Portuguese. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um endereço IPv6 válido.`;

/** Formats an IpAddressError in Brazilian Portuguese. */
export const formatIpAddressError: TypeErrorFormatter<IpAddressError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um endereço IPv4 válido nem um endereço IPv6 canônico.`;

/** Formats an IpAddressFromStringError in Brazilian Portuguese. */
export const formatIpAddressFromStringError: TypeErrorFormatter<
  IpAddressFromStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um endereço IP válido.`;

/** Formats a PhoneNumberE164Error in Brazilian Portuguese. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um número de telefone no formato E.164.`;

/** Formats an IbanError in Brazilian Portuguese. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um IBAN válido em letras maiúsculas e sem espaços.`;

/** Formats an IsbnError in Brazilian Portuguese. */
export const formatIsbnError: TypeErrorFormatter<IsbnError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um ISBN válido de 13 dígitos sem hifens.`;

/** Formats a SimplePasswordError in Brazilian Portuguese. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "A senha deve estar sem espaços nas extremidades.";
    case "TooLong":
      return "A senha excede o comprimento máximo de 64.";
    case "TooShort":
      return "A senha não atende ao comprimento mínimo de 8.";
  }
};

/** Formats a MnemonicError in Brazilian Portuguese. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "O valor não é uma mnemônica BIP39 em inglês válida.";

/** Formats a RedactedError in Brazilian Portuguese. */
export const formatRedactedError: TypeErrorFormatter<RedactedError> = () =>
  "O segredo deve ser uma string.";

/** Formats an IdError in Brazilian Portuguese. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido.`;

/** Formats a TableIdError in Brazilian Portuguese. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um Id válido para a tabela ${error.table}.`;

/** Formats a UuidError in Brazilian Portuguese. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um UUID canônico em minúsculas.`;

/** Formats a UuidVersionError in Brazilian Portuguese. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um UUID da versão ${error.version}.`;

/** Formats a UlidError in Brazilian Portuguese. */
export const formatUlidError: TypeErrorFormatter<UlidError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um ULID canônico em maiúsculas.`;

/** Formats a NonNegativeError in Brazilian Portuguese. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser não negativo (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Brazilian Portuguese. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal não negativa.`;

/** Formats a PositiveError in Brazilian Portuguese. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser positivo (> 0).`;

/** Formats a PositiveDecimalStringError in Brazilian Portuguese. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal positiva.`;

/** Formats a NonPositiveError in Brazilian Portuguese. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser não positivo (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Brazilian Portuguese. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal não positiva.`;

/** Formats a NegativeError in Brazilian Portuguese. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser negativo (< 0).`;

/** Formats a NegativeDecimalStringError in Brazilian Portuguese. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser uma string decimal negativa.`;

/** Formats an IntError in Brazilian Portuguese. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser um inteiro seguro.`;

/** Formats an IntFromStringError in Brazilian Portuguese. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um inteiro decimal.`;

/** Formats a FiniteNumberFromStringError in Brazilian Portuguese. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um número decimal.`;

/** Formats a GreaterThanError in Brazilian Portuguese. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser maior que ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Brazilian Portuguese. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser maior ou igual a ${error.min}.`;

/** Formats a LessThanError in Brazilian Portuguese. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser menor que ${error.max}.`;

/** Formats a LessThanOrEqualToError in Brazilian Portuguese. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser menor ou igual a ${error.max}.`;

/** Formats a NonNaNError in Brazilian Portuguese. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "O valor não deve ser NaN.";

/** Formats a FiniteError in Brazilian Portuguese. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser finito.`;

/** Formats a MultipleOfError in Brazilian Portuguese. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser múltiplo de ${error.divisor}.`;

/** Formats a BetweenError in Brazilian Portuguese. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar entre ${error.min} e ${error.max}, inclusive.`;

/** Formats a GreaterThanBigIntError in Brazilian Portuguese. */
export const formatGreaterThanBigIntError: TypeErrorFormatter<
  GreaterThanBigIntError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser maior que ${error.min}.`;

/** Formats a GreaterThanOrEqualToBigIntError in Brazilian Portuguese. */
export const formatGreaterThanOrEqualToBigIntError: TypeErrorFormatter<
  GreaterThanOrEqualToBigIntError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser maior ou igual a ${error.min}.`;

/** Formats a LessThanBigIntError in Brazilian Portuguese. */
export const formatLessThanBigIntError: TypeErrorFormatter<
  LessThanBigIntError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser menor que ${error.max}.`;

/** Formats a LessThanOrEqualToBigIntError in Brazilian Portuguese. */
export const formatLessThanOrEqualToBigIntError: TypeErrorFormatter<
  LessThanOrEqualToBigIntError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve ser menor ou igual a ${error.max}.`;

/** Formats a BetweenBigIntError in Brazilian Portuguese. */
export const formatBetweenBigIntError: TypeErrorFormatter<
  BetweenBigIntError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve estar entre ${error.min} e ${error.max}, inclusive.`;

/** Formats an ArrayError in Brazilian Portuguese. */
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

/** Formats a NonEmptyArrayError in Brazilian Portuguese. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} deve conter pelo menos um item.`;

/** Formats a UniqueError in Brazilian Portuguese. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} tem itens iguais nos índices ${error.previousIndex} e ${error.index}.`;

/** Formats a SetError in Brazilian Portuguese. */
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

/** Formats a MapError in Brazilian Portuguese. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é um Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `A propriedade extra de Map ${safelyStringifyUnknownValue(issue.key)} não é permitida.`;
    case "Key":
      return `A chave de Map no índice ${issue.index} é inválida.`;
    case "Value":
      return `O valor de Map no índice ${issue.index} é inválido.`;
    case "Collision":
      return `As chaves de Map nos índices ${issue.previousIndex} e ${issue.index} decodificam para a mesma chave ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a MinSizeError in Brazilian Portuguese. */
export const formatMinSizeError: TypeErrorFormatter<MinSizeError> = (error) =>
  `O tamanho ${error.value.size} não atende ao tamanho mínimo de ${error.min}.`;

/** Formats a MaxSizeError in Brazilian Portuguese. */
export const formatMaxSizeError: TypeErrorFormatter<MaxSizeError> = (error) =>
  `O tamanho ${error.value.size} excede o tamanho máximo de ${error.max}.`;

/** Formats a TupleError in Brazilian Portuguese. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `O valor ${safelyStringifyUnknownValue(error.reason.value)} não é uma tupla.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Uma Tuple deve ter um comprimento de ${error.reason.expected}, mas o valor tem um comprimento de ${error.reason.actual}.`;
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

/** Formats a RecordError in Brazilian Portuguese. */
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

/** Formats a MinEntriesError in Brazilian Portuguese. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não atende ao número mínimo de entradas, que é ${error.min}.`;

/** Formats a MaxEntriesError in Brazilian Portuguese. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} excede o número máximo de entradas, que é ${error.max}.`;

/** Formats an ObjectError in Brazilian Portuguese. */
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

/** Formats a DiscriminatedUnionError in Brazilian Portuguese. */
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

/** Formats a DataError in Brazilian Portuguese. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `O valor ${safelyStringifyUnknownValue(issue.value)} não é um valor Data.`;
    case "UnexpectedPrototype":
      return `Um valor Data do tipo ${issue.container} tem um protótipo inesperado.`;
    case "Accessor":
      return "Uma propriedade Data deve ser uma propriedade de dados. Materialize os valores de acesso em dados simples antes de usar este Type ou use outro Type.";
    case "NonEnumerable":
      return "Uma propriedade de objeto Data deve ser enumerável. Remova-a ou use outro Type.";
    case "SymbolProperty":
      return "Uma chave de propriedade de objeto Data deve ser uma string. Remova a propriedade symbol ou use outro Type.";
    case "Hole":
      return "Falta um elemento do array Data.";
    case "InvalidUint8Array":
      return "Um Uint8Array Data deve ter um ArrayBuffer não desanexado e estar dentro de seus limites.";
    case "ExcessProperty":
      return `Um valor Data do tipo ${issue.container} não deve ter propriedades próprias extras. Remova a propriedade ou use outro Type.`;
  }
};

/** Formats a JsonValueError in Brazilian Portuguese. */
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

/** Formats a JsonError in Brazilian Portuguese. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não pode ser analisado como um JsonValue.`;

/** Formats a ByteSizeLiteralError in Brazilian Portuguese. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um literal de tamanho em bytes. Use um valor como "512KiB" ou "1MiB".`;

/** Formats a ByteLengthError in Brazilian Portuguese. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "O valor -0 não é um comprimento em bytes. Use 0 em vez disso.";

/** Formats a ByteLengthFromStringError in Brazilian Portuguese. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um comprimento em bytes. Use um número de bytes ou um literal como 10MiB.`;

/** Formats a DurationLiteralError in Brazilian Portuguese. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um literal de duração. Use um valor como "500ms" ou "1.5s".`;

/** Formats a PercentageLiteralError in Brazilian Portuguese. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `O valor ${safelyStringifyUnknownValue(error.value)} não é um literal de porcentagem. Use um valor como "50%" ou "12.5%".`;
