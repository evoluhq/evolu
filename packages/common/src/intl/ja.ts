/**
 * Evolu Type エラーの日本語フォーマッター。
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

  return `値 ${safelyStringifyUnknownValue(error.value)} は ${typeOf} 型ではありません。`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `値 ${safelyStringifyUnknownValue(reason.value)} はオブジェクトではありません。`
    : "値はオブジェクトですが、Object Output はプレーンオブジェクトであるか、null プロトタイプを持つ必要があります。";

/** NeverError を日本語でフォーマットします。 */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は型 Never では無効です。`;

/** String TypeOfError を日本語でフォーマットします。 */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralError を日本語でフォーマットします。 */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はテンプレートリテラルに一致しません。`;

/** Number TypeOfError を日本語でフォーマットします。 */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfError を日本語でフォーマットします。 */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfError を日本語でフォーマットします。 */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfError を日本語でフォーマットします。 */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfError を日本語でフォーマットします。 */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeError を日本語でフォーマットします。 */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は Evolu Type ではありません。`;

/** ObjectTagError を日本語でフォーマットします。 */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} には、期待されるオブジェクトタグ ${safelyStringifyUnknownValue(error.expected)} がありません。`;

/** InstanceOfError を日本語でフォーマットします。 */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.constructorName} のインスタンスではありません。`;

/** LiteralError を日本語でフォーマットします。 */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は、期待されるリテラル ${globalThis.String(error.expected)} と厳密に等しくありません。`;

/** UnionError を日本語でフォーマットします。 */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "値はいずれの許可されたバリアントにも一致しません。";

/** DateIsoError を日本語でフォーマットします。 */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正規形式の ISO 日時文字列ではありません。`;

/** DateIsoFromDateError を日本語でフォーマットします。 */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date を DateIso として表現できません。";

/** DecimalStringError を日本語でフォーマットします。 */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正規形式の10進数文字列である必要があります。`;

/** Int64Error を日本語でフォーマットします。 */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な符号付き64ビット整数 (Int64) ではありません。`;

/** UInt64Error を日本語でフォーマットします。 */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な符号なし64ビット整数 (UInt64) ではありません。`;

/** Int64StringError を日本語でフォーマットします。 */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Int64 文字列ではありません。`;

/** CapitalizedError を日本語でフォーマットします。 */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は先頭が大文字である必要があります。`;

/** TrimmedError を日本語でフォーマットします。 */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は前後の空白が除去されている必要があります。`;

/** MinLengthError を日本語でフォーマットします。 */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は最小長 ${error.min} を満たしていません。`;

/** MaxLengthError を日本語でフォーマットします。 */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は最大長 ${error.max} を超えています。`;

/** LengthError を日本語でフォーマットします。 */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} の長さは必要な ${error.exact} ではありません。`;

/** RegexError を日本語でフォーマットします。 */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は /${error.source}/${error.flags} に一致しません。`;

/** Base64UrlError を日本語でフォーマットします。 */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Base64Url 文字列ではありません。`;

/** NameError を日本語でフォーマットします。 */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Name ではありません。`;

/** MnemonicError を日本語でフォーマットします。 */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な英語の BIP39 ニーモニックではありません。`;

/** IdError を日本語でフォーマットします。 */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有効な Id ではありません。`;

/** TableIdError を日本語でフォーマットします。 */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} はテーブル ${error.table} の有効な Id ではありません。`;

/** NonNegativeError を日本語でフォーマットします。 */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以上 (>= 0) である必要があります。`;

/** NonNegativeDecimalStringError を日本語でフォーマットします。 */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以上の10進数文字列である必要があります。`;

/** PositiveError を日本語でフォーマットします。 */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正 (> 0) である必要があります。`;

/** PositiveDecimalStringError を日本語でフォーマットします。 */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は正の10進数文字列である必要があります。`;

/** NonPositiveError を日本語でフォーマットします。 */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以下 (<= 0) である必要があります。`;

/** NonPositiveDecimalStringError を日本語でフォーマットします。 */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は 0 以下の10進数文字列である必要があります。`;

/** NegativeError を日本語でフォーマットします。 */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は負 (< 0) である必要があります。`;

/** NegativeDecimalStringError を日本語でフォーマットします。 */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は負の10進数文字列である必要があります。`;

/** IntError を日本語でフォーマットします。 */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は安全な整数である必要があります。`;

/** GreaterThanError を日本語でフォーマットします。 */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} より大きい必要があります。`;

/** GreaterThanOrEqualToError を日本語でフォーマットします。 */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} 以上である必要があります。`;

/** LessThanError を日本語でフォーマットします。 */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.max} より小さい必要があります。`;

/** LessThanOrEqualToError を日本語でフォーマットします。 */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.max} 以下である必要があります。`;

/** NonNaNError を日本語でフォーマットします。 */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "値は NaN であってはなりません。";

/** FiniteError を日本語でフォーマットします。 */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は有限値である必要があります。`;

/** MultipleOfError を日本語でフォーマットします。 */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.divisor} の倍数である必要があります。`;

/** BetweenError を日本語でフォーマットします。 */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} は ${error.min} 以上 ${error.max} 以下である必要があります。`;

/** ArrayError を日本語でフォーマットします。 */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} は配列ではありません。`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `インデックス ${issue.index} の配列要素が欠落しています。`;
    case "Accessor":
      return `インデックス ${issue.index} の配列要素はデータプロパティである必要があります。`;
    case "ExcessProperty":
      return "余分な Array プロパティは許可されていません。削除するか、別の Type を使用してください。";
    case "Element":
      return `インデックス ${issue.index} の配列要素が無効です。`;
  }
};

/** SetError を日本語でフォーマットします。 */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} は Set ではありません。`;
  }
  if (error.reason.kind === "UnexpectedPrototype") {
    return "値は Set のサブクラスのインスタンスですが、Set Output は Set 自体のインスタンスである必要があります。";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `余分な Set プロパティ ${safelyStringifyUnknownValue(issue.key)} は許可されていません。`;
    case "Element":
      return `インデックス ${issue.index} の Set 要素が無効です。`;
  }
};

/** TupleError を日本語でフォーマットします。 */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} はタプルではありません。`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple は正確に ${error.reason.expected} 個の要素を含む必要がありますが、値には ${error.reason.actual} 個の要素があります。`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `インデックス ${issue.index} の Tuple 要素が欠落しています。`;
    case "Accessor":
      return `インデックス ${issue.index} の Tuple 要素はデータプロパティである必要があります。`;
    case "ExcessProperty":
      return "余分な Tuple プロパティは許可されていません。削除するか、別の Type を使用してください。";
    case "Element":
      return `インデックス ${issue.index} の Tuple 要素が無効です。`;
  }
};

/** RecordError を日本語でフォーマットします。 */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `値 ${safelyStringifyUnknownValue(error.reason.value)} は Record ではありません。`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "値はオブジェクトですが、Record Output はプレーンオブジェクトであるか、null プロトタイプを持つ必要があります。";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `プロパティキー ${safelyStringifyUnknownValue(issue.key)} が無効です。`;
    case "Value":
      return `プロパティ ${safelyStringifyUnknownValue(issue.key)} の値が無効です。`;
    case "Accessor":
      return `Record プロパティ ${safelyStringifyUnknownValue(issue.key)} はデータプロパティである必要があります。`;
    case "NonEnumerable":
      return `Record プロパティ ${safelyStringifyUnknownValue(issue.key)} は列挙可能である必要があります。`;
    case "Collision":
      return `Record キー ${safelyStringifyUnknownValue(issue.previousKey)} と ${safelyStringifyUnknownValue(issue.key)} は、デコードすると同じキー ${safelyStringifyUnknownValue(issue.outputKey)} になります。`;
  }
};

/** ObjectError を日本語でフォーマットします。 */
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
        return "Object プロパティはデータプロパティである必要があります。アクセサーの値をプレーンデータとして実体化してからこの Type を使用するか、別の Type を使用してください。";
      case "NonEnumerable":
        return "Object プロパティは列挙可能である必要があります。列挙可能にするか、別の Type を使用してください。";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `必須プロパティ ${safelyStringifyUnknownValue(key)} がありません。`;
  }
  if (typeof key === "symbol") {
    return "Object プロパティキーは文字列である必要があります。symbol プロパティを削除するか、別の Type を使用してください。";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `プロパティ ${safelyStringifyUnknownValue(key)} は許可されていません。削除するか、別の Type を使用してください。`;
  }
  return `プロパティ ${safelyStringifyUnknownValue(key)} が無効です。`;
};

/** DiscriminatedUnionError を日本語でフォーマットします。 */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `判別子プロパティ ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} はデータプロパティである必要があります。`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} は自身のプロパティである必要があります。`;
      }
      return `${property} は列挙可能である必要があります。`;
    }
    case "Discriminator":
      return `判別子プロパティ ${safelyStringifyUnknownValue(error.reason.key)} の値 ${safelyStringifyUnknownValue(error.reason.value)} は予期されていません。`;
    case "Member":
      return `選択されたバリアント ${safelyStringifyUnknownValue(error.reason.discriminator)} が無効です。`;
  }
};

/** JsonValueError を日本語でフォーマットします。 */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `値 ${safelyStringifyUnknownValue(issue.value)} は JSON 値ではありません。`;
    case "NonFiniteNumber":
      return "JSON の数値は有限値である必要があります。";
    case "UnexpectedPrototype":
      return "値はオブジェクトですが、JsonValue オブジェクトはプレーンオブジェクトであるか、null プロトタイプを持つ必要があります。";
    case "Accessor":
      return "JSON プロパティはデータプロパティである必要があります。アクセサーの値をプレーンデータとして実体化してからこの Type を使用するか、別の Type を使用してください。";
    case "NonEnumerable":
      return "JSON オブジェクトのプロパティは列挙可能である必要があります。列挙不可のプロパティを削除するか、別の Type を使用してください。";
    case "SymbolProperty":
      return "JSON オブジェクトのプロパティキーは文字列である必要があります。symbol プロパティを削除するか、別の Type を使用してください。";
    case "Hole":
      return "JSON 配列の要素が欠落しています。";
    case "ExcessProperty":
      return "余分な JSON 配列プロパティは許可されていません。削除するか、別の Type を使用してください。";
    case "CircularReference":
      return "JsonValue に循環参照を含んではなりません。";
  }
};

/** JsonError を日本語でフォーマットします。 */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `値 ${safelyStringifyUnknownValue(error.value)} を JsonValue として解析できません。`;
