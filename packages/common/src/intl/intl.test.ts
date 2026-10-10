import { describe, test } from "node:test";
import {
  assert,
  assertEqual,
  assertErr,
  assertLength,
  assertNotUndefined,
  assertTrue,
} from "../Assert.ts";
import * as en from "./_en.ts";
import {
  ar,
  bn,
  ca,
  cs,
  da,
  de,
  el,
  es,
  fa,
  fi,
  fil,
  fr,
  he,
  hi,
  hr,
  hu,
  id,
  it,
  ja,
  ko,
  ml,
  mr,
  ms,
  nb,
  nl,
  pa,
  pl,
  pt,
  ptBR,
  ro,
  sk,
  sl,
  sv,
  sw,
  ta,
  te,
  th,
  tr,
  uk,
  ur,
  vi,
  zhCN,
  zhTW,
} from "@evolu/common/intl";

import * as Type from "../Type.ts";
import { DurationLiteral } from "../Time.ts";
import { PercentageLiteral } from "../Number.ts";
import { ByteSizeLiteral } from "../Bytes.ts";
import { ok, type Result } from "../Result.ts";
import { mapObject, objectToEntries } from "../Object.ts";

const Created = Type.typed("Created", { value: Type.String });
const Deleted = Type.typed("Deleted", { value: Type.String });
const Between1And2 = Type.between(1, 2)(Type.Number);
const LowercaseString = Type.transform(
  "LowercaseString",
  Type.String,
  Type.String,
  {
    from: (value) => ok(value.toLowerCase()),
    to: (value) => value,
  },
);

const StartsWithEscaped = Type.startsWith('APP_"\\\n')(Type.String);

const locales = {
  ar,
  bn,
  ca,
  cs,
  da,
  de,
  el,
  es,
  fa,
  fi,
  fil,
  fr,
  he,
  hi,
  hr,
  hu,
  id,
  it,
  ja,
  ko,
  ml,
  mr,
  ms,
  nb,
  nl,
  pa,
  pl,
  pt,
  ptBR,
  ro,
  sk,
  sl,
  sv,
  sw,
  ta,
  te,
  th,
  tr,
  uk,
  ur,
  vi,
  zhCN,
  zhTW,
};

// The parameter type requires every English formatter, so a locale that misses
// a translation or translates it with an incompatible type fails to compile.
const formattersFor = (locale: typeof en) => ({
  Array: locale.formatArrayError,
  Base64: locale.formatBase64Error,
  Base64Url: locale.formatBase64UrlError,
  [Between1And2.name]: locale.formatBetweenError,
  "Between-2147483648-2147483647": locale.formatBetweenError,
  "Between1n-2n": locale.formatBetweenBigIntError,
  BigInt: locale.formatBigIntError,
  Boolean: locale.formatBooleanError,
  BooleanFromString: locale.formatBooleanFromStringError,
  CamelCaseIdentifier: locale.formatIdentifierError,
  PascalCaseIdentifier: locale.formatIdentifierError,
  SnakeCaseIdentifier: locale.formatIdentifierError,
  KebabCaseIdentifier: locale.formatIdentifierError,
  ConstantCaseIdentifier: locale.formatIdentifierError,
  Capitalized: locale.formatCapitalizedError,
  Uncapitalized: locale.formatUncapitalizedError,
  Uppercased: locale.formatUppercasedError,
  Lowercased: locale.formatLowercasedError,
  DateIso: locale.formatDateIsoError,
  DateIsoFromDate: locale.formatDateIsoFromDateError,
  DateIsoFromRfc3339: locale.formatDateIsoFromRfc3339Error,
  DecimalString: locale.formatDecimalStringError,
  DiscriminatedUnion: locale.formatDiscriminatedUnionError,
  Email: locale.formatEmailError,
  "EndsWith.json": locale.formatEndsWithError,
  EvoluType: locale.formatEvoluTypeError,
  "Excludes,": locale.formatExcludesError,
  Finite: locale.formatFiniteError,
  FiniteNumberFromString: locale.formatFiniteNumberFromStringError,
  Function: locale.formatFunctionError,
  GreaterThan1: locale.formatGreaterThanError,
  GreaterThan1n: locale.formatGreaterThanBigIntError,
  GreaterThanOrEqualTo1: locale.formatGreaterThanOrEqualToError,
  GreaterThanOrEqualTo1n: locale.formatGreaterThanOrEqualToBigIntError,
  Hex: locale.formatHexError,
  HexColor: locale.formatHexColorError,
  Hostname: locale.formatHostnameError,
  Iban: locale.formatIbanError,
  Id: locale.formatIdError,
  "Includes@": locale.formatIncludesError,
  InstanceOf: locale.formatInstanceOfError,
  Int: locale.formatIntError,
  IntFromString: locale.formatIntFromStringError,
  Int64: locale.formatInt64Error,
  Int64String: locale.formatInt64StringError,
  IpAddress: locale.formatIpAddressError,
  IpAddressFromString: locale.formatIpAddressFromStringError,
  Ipv4Address: locale.formatIpv4AddressError,
  Ipv6Address: locale.formatIpv6AddressError,
  Ipv6AddressFromString: locale.formatIpv6AddressFromStringError,
  Isbn: locale.formatIsbnError,
  Json: locale.formatJsonError,
  JsonValue: locale.formatJsonValueError,
  Length2: locale.formatLengthError,
  Length16: locale.formatLengthError,
  LessThan1: locale.formatLessThanError,
  LessThan1n: locale.formatLessThanBigIntError,
  LessThan200: locale.formatLessThanError,
  LessThanOrEqualTo1: locale.formatLessThanOrEqualToError,
  LessThanOrEqualTo1n: locale.formatLessThanOrEqualToBigIntError,
  LessThanOrEqualTo4294967295: locale.formatLessThanOrEqualToError,
  Literal: locale.formatLiteralError,
  Map: locale.formatMapError,
  MaxEntries2: locale.formatMaxEntriesError,
  MaxLength2: locale.formatMaxLengthError,
  MaxLength100: locale.formatMaxLengthError,
  MaxLength1000: locale.formatMaxLengthError,
  MaxSize2: locale.formatMaxSizeError,
  MaxUtf8ByteLength2: locale.formatMaxUtf8ByteLengthError,
  MinEntries1: locale.formatMinEntriesError,
  MinLength1: locale.formatMinLengthError,
  MinLength2: locale.formatMinLengthError,
  MinSize1: locale.formatMinSizeError,
  Mnemonic: locale.formatMnemonicError,
  MultipleOf2: locale.formatMultipleOfError,
  Name: locale.formatNameError,
  Negative: locale.formatNegativeError,
  NegativeDecimalString: locale.formatNegativeDecimalStringError,
  Never: locale.formatNeverError,
  NonEmptyArray: locale.formatNonEmptyArrayError,
  NonNaN: locale.formatNonNaNError,
  NonNegative: locale.formatNonNegativeError,
  NonNegativeDecimalString: locale.formatNonNegativeDecimalStringError,
  NonPositive: locale.formatNonPositiveError,
  NonPositiveDecimalString: locale.formatNonPositiveDecimalStringError,
  NormalizedNFC: locale.formatNormalizedError,
  Number: locale.formatNumberError,
  Object: locale.formatObjectError,
  ObjectTag: locale.formatObjectTagError,
  PhoneNumberE164: locale.formatPhoneNumberE164Error,
  PlainDateIso: locale.formatPlainDateIsoError,
  Positive: locale.formatPositiveError,
  PositiveDecimalString: locale.formatPositiveDecimalStringError,
  Record: locale.formatRecordError,
  RecordKey: locale.formatRegexError,
  Regex: locale.formatRegexError,
  Set: locale.formatSetError,
  SimplePassword: locale.formatSimplePasswordError,
  StartsWithAPP_: locale.formatStartsWithError,
  [StartsWithEscaped.name]: locale.formatStartsWithError,
  String: locale.formatStringError,
  Symbol: locale.formatSymbolError,
  TableId: locale.formatTableIdError,
  TemplateLiteral: locale.formatTemplateLiteralError,
  Trimmed: locale.formatTrimmedError,
  Tuple: locale.formatTupleError,
  UInt64: locale.formatUInt64Error,
  Ulid: locale.formatUlidError,
  Union: locale.formatUnionError,
  Unique: locale.formatUniqueError,
  UrlSafeString: locale.formatRegexError,
  Uuid: locale.formatUuidError,
  UuidV4: locale.formatUuidVersionError,
  UuidV7: locale.formatUuidVersionError,
  ValidDate: locale.formatValidDateError,
  WellFormed: locale.formatWellFormedError,
});

// A locale must not keep a formatter that English no longer has.
Type.assertType<
  {
    [Locale in keyof typeof locales]: Exclude<
      keyof (typeof locales)[Locale],
      keyof typeof en
    >;
  }[keyof typeof locales],
  never
>();

const typesByLocale = Type.localizeTypes(
  {
    Age: Type.Age,
    ArrayBuffer: Type.ArrayBuffer,
    Base64: Type.Base64,
    Base64Url: Type.Base64Url,
    BigInt: Type.BigInt,
    Boolean: Type.Boolean,
    BooleanFromString: Type.BooleanFromString,
    CamelCaseIdentifier: Type.CamelCaseIdentifier,
    PascalCaseIdentifier: Type.PascalCaseIdentifier,
    SnakeCaseIdentifier: Type.SnakeCaseIdentifier,
    KebabCaseIdentifier: Type.KebabCaseIdentifier,
    ConstantCaseIdentifier: Type.ConstantCaseIdentifier,
    CapitalizedString: Type.CapitalizedString,
    UncapitalizedString: Type.UncapitalizedString,
    UppercasedString: Type.UppercasedString,
    LowercasedString: Type.LowercasedString,
    Date: Type.Date,
    DateIso: Type.DateIso,
    DateIsoFromDate: Type.DateIsoFromDate,
    DateIsoFromRfc3339: Type.DateIsoFromRfc3339,
    DecimalString: Type.DecimalString,
    Digit: Type.Digit,
    Digit1To6: Type.Digit1To6,
    Digit1To9: Type.Digit1To9,
    Digit1To23: Type.Digit1To23,
    Digit1To51: Type.Digit1To51,
    Digit1To59: Type.Digit1To59,
    Digit1To99: Type.Digit1To99,
    Email: Type.Email,
    EndsWith: Type.endsWith(".json")(Type.String),
    EvoluType: Type.EvoluType,
    FiniteNumber: Type.FiniteNumber,
    FiniteNumberFromString: Type.FiniteNumberFromString,
    Function: Type.Function,
    Hex: Type.Hex,
    HexColor: Type.HexColor,
    Hostname: Type.Hostname,
    Iban: Type.Iban,
    Id: Type.Id,
    IdBytes: Type.IdBytes,
    Int: Type.Int,
    IntFromString: Type.IntFromString,
    Int32: Type.Int32,
    Int64: Type.Int64,
    Int64FromInt64String: Type.Int64FromInt64String,
    Int64String: Type.Int64String,
    IpAddress: Type.IpAddress,
    IpAddressFromString: Type.IpAddressFromString,
    Ipv4Address: Type.Ipv4Address,
    Ipv6Address: Type.Ipv6Address,
    Ipv6AddressFromString: Type.Ipv6AddressFromString,
    Isbn: Type.Isbn,
    Json: Type.Json,
    JsonArray: Type.JsonArray,
    JsonObject: Type.JsonObject,
    JsonValue: Type.JsonValue,
    JsonValueFromJson: Type.JsonValueFromJson,
    Literal: Type.literal("yes"),
    Mnemonic: Type.Mnemonic,
    Name: Type.Name,
    NegativeDecimalString: Type.NegativeDecimalString,
    NegativeInt: Type.NegativeInt,
    NegativeNumber: Type.NegativeNumber,
    Never: Type.Never,
    NonEmptyTrimmedString: Type.NonEmptyTrimmedString,
    NonEmptyTrimmedString100: Type.NonEmptyTrimmedString100,
    NonEmptyTrimmedString1000: Type.NonEmptyTrimmedString1000,
    NonNaNNumber: Type.NonNaNNumber,
    NonNegativeDecimalString: Type.NonNegativeDecimalString,
    NonNegativeFiniteNumber: Type.NonNegativeFiniteNumber,
    NonNegativeInt: Type.NonNegativeInt,
    NonNegativeNumber: Type.NonNegativeNumber,
    NonPositiveDecimalString: Type.NonPositiveDecimalString,
    NonPositiveInt: Type.NonPositiveInt,
    NonPositiveNumber: Type.NonPositiveNumber,
    Normalized: Type.normalized("NFC")(Type.String),
    Null: Type.Null,
    Number: Type.Number,
    Object: Type.Object,
    PhoneNumberE164: Type.PhoneNumberE164,
    PlainDateIso: Type.PlainDateIso,
    PositiveDecimalString: Type.PositiveDecimalString,
    PositiveFiniteNumber: Type.PositiveFiniteNumber,
    PositiveInt: Type.PositiveInt,
    PositiveNumber: Type.PositiveNumber,
    Ratio: Type.Ratio,
    SimplePassword: Type.SimplePassword,
    StartsWith: Type.startsWith("APP_")(Type.String),
    StartsWithEscaped,
    String: Type.String,
    Symbol: Type.Symbol,
    TrimmedString: Type.TrimmedString,
    UInt32: Type.UInt32,
    UInt64: Type.UInt64,
    Uint8Array: Type.Uint8Array,
    Uint8ArrayFromBase64: Type.Uint8ArrayFromBase64,
    Uint8ArrayFromBase64Url: Type.Uint8ArrayFromBase64Url,
    Uint8ArrayFromHex: Type.Uint8ArrayFromHex,
    Ulid: Type.Ulid,
    Undefined: Type.Undefined,
    Unknown: Type.Unknown,
    UnknownNextResult: Type.UnknownNextResult,
    UnknownResult: Type.UnknownResult,
    UrlSafeString: Type.UrlSafeString,
    Uuid: Type.Uuid,
    UuidV4: Type.UuidV4,
    UuidV7: Type.UuidV7,
    ValidDate: Type.ValidDate,
    WellFormedString: Type.WellFormedString,
    Array: Type.array(Type.String),
    Between: Between1And2,
    BetweenBigInt: Type.betweenBigInt(1n, 2n)(Type.BigInt),
    DiscriminatedUnion: Type.discriminatedUnion(Created, Deleted),
    Excludes: Type.excludes(",")(Type.String),
    GreaterThan: Type.greaterThan(1)(Type.Number),
    GreaterThanBigInt: Type.greaterThanBigInt(1n)(Type.BigInt),
    GreaterThanOrEqualTo: Type.greaterThanOrEqualTo(1)(Type.Number),
    GreaterThanOrEqualToBigInt: Type.greaterThanOrEqualToBigInt(1n)(
      Type.BigInt,
    ),
    Includes: Type.includes("@")(Type.String),
    InstanceOf: Type.instanceOf(Date),
    Length: Type.length(2)(Type.String),
    LessThan: Type.lessThan(1)(Type.Number),
    LessThanBigInt: Type.lessThanBigInt(1n)(Type.BigInt),
    LessThanOrEqualTo: Type.lessThanOrEqualTo(1)(Type.Number),
    LessThanOrEqualToBigInt: Type.lessThanOrEqualToBigInt(1n)(Type.BigInt),
    Map: Type.map(Type.String, Type.String),
    MaxEntries: Type.maxEntries(2)(Type.record(Type.String, Type.String)),
    MaxLength: Type.maxLength(2)(Type.String),
    MaxSize: Type.maxSize(2)(Type.map(Type.String, Type.String)),
    MaxUtf8ByteLength: Type.maxUtf8ByteLength(2)(Type.String),
    MinEntries: Type.minEntries(1)(Type.record(Type.String, Type.String)),
    MinLength: Type.minLength(2)(Type.String),
    MinSize: Type.minSize(1)(Type.set(Type.String)),
    MultipleOf: Type.multipleOf("2")(Type.Number),
    NonEmptyArray: Type.nonEmptyArray(Type.array(Type.String)),
    ObjectFactory: Type.object({ value: Type.String }),
    Record: Type.record(Type.String, Type.String),
    RecordWithCollision: Type.record(LowercaseString, Type.String),
    RecordWithKey: Type.record(
      Type.regex("RecordKey", /^valid$/u)(Type.String),
      Type.String,
    ),
    Regex: Type.regex("Regex", /^x$/u)(Type.String),
    Set: Type.set(Type.String),
    TableId: Type.id("Todo"),
    TemplateLiteral: Type.templateLiteral("prefix:", Type.String),
    Tuple: Type.tuple(Type.String, Type.Number),
    Union: Type.union(Type.String, Type.Number),
    Unique: Type.unique(Type.array(Type.String)),
  },
  mapObject(locales, formattersFor),
);

const failure = <E>(result: Result<unknown, E>): E => {
  assertErr(result);
  return result.error;
};

const dataError = (issue: Type.DataIssue): Type.DataError => ({
  type: "Data",
  reason: { kind: "Issues", issues: [issue] },
});

const jsonValueError = (issue: Type.JsonValueIssue): Type.JsonValueError => ({
  type: "JsonValue",
  reason: { kind: "Issues", issues: [issue] },
});

const withAccessorAt = <T extends object>(value: T, key: PropertyKey): T =>
  Object.defineProperty(value, key, { get: () => "x", enumerable: true });

const withNonEnumerable = <T extends object>(value: T, key: PropertyKey): T =>
  Object.defineProperty(value, key, { value: "x", enumerable: false });

const StringArray = Type.array(Type.String);
const StringSet = Type.set(Type.String);
const StringMap = Type.map(Type.String, Type.String);
const StringTuple = Type.tuple(Type.String, Type.Number);
const StringRecord = Type.record(Type.String, Type.String);
const ValueObject = Type.object({ value: Type.String });
const CreatedOrDeleted = Type.discriminatedUnion(Created, Deleted);

// One message for every branch of every formatter. English and each locale
// render the same errors.
const messageCases: ReadonlyArray<(formatters: typeof en) => string> = [
  (f) => f.formatNeverError({ type: "Never", value: 1 }),
  (f) => f.formatStringError({ type: "TypeOf", expected: "String", value: 1 }),
  (f) =>
    f.formatNumberError({ type: "TypeOf", expected: "Number", value: "1" }),
  (f) => f.formatBigIntError({ type: "TypeOf", expected: "BigInt", value: 1 }),
  (f) =>
    f.formatBooleanError({
      type: "TypeOf",
      expected: "Boolean",
      value: "true",
    }),
  (f) =>
    f.formatSymbolError({ type: "TypeOf", expected: "Symbol", value: "s" }),
  (f) =>
    f.formatFunctionError({ type: "TypeOf", expected: "Function", value: 1 }),
  (f) => f.formatTemplateLiteralError({ type: "TemplateLiteral", value: "x" }),
  (f) =>
    f.formatBooleanFromStringError({ type: "BooleanFromString", value: "yes" }),
  (f) => f.formatEvoluTypeError({ type: "EvoluType", value: 1 }),
  (f) =>
    f.formatObjectTagError({ type: "ObjectTag", expected: "Date", value: 1 }),
  (f) =>
    f.formatValidDateError({ type: "ValidDate", value: new Date(Number.NaN) }),
  (f) =>
    f.formatInstanceOfError({
      type: "InstanceOf",
      constructorName: "Date",
      value: 1,
    }),
  (f) =>
    f.formatLiteralError({ type: "Literal", expected: "yes", value: "no" }),
  (f) =>
    f.formatUnionError(
      failure(Type.union(Type.String, Type.Number).fromUnknown(false)),
    ),
  (f) => f.formatDateIsoError({ type: "DateIso", value: "2024-01-01" }),
  (f) =>
    f.formatPlainDateIsoError({ type: "PlainDateIso", value: "2023-02-29" }),
  (f) =>
    f.formatDateIsoFromDateError({
      type: "DateIsoFromDate",
      value: new Date(Number.NaN),
    }),
  (f) =>
    f.formatDateIsoFromRfc3339Error({
      type: "DateIsoFromRfc3339",
      value: "2024-01-01 12:00:00Z",
    }),
  (f) => f.formatDecimalStringError({ type: "DecimalString", value: "01.50" }),
  (f) => f.formatInt64Error({ type: "Int64", value: 2n ** 63n }),
  (f) => f.formatUInt64Error({ type: "UInt64", value: -1n }),
  (f) => f.formatInt64StringError({ type: "Int64String", value: "x" }),
  ...(
    [
      ["CamelCaseIdentifier", "camelCase"],
      ["PascalCaseIdentifier", "PascalCase"],
      ["SnakeCaseIdentifier", "snake_case"],
      ["KebabCaseIdentifier", "kebab-case"],
      ["ConstantCaseIdentifier", "CONSTANT_CASE"],
    ] as const
  ).map(
    ([type, casing]) =>
      (f: typeof en) =>
        f.formatIdentifierError({ type, value: "bad value", casing }),
  ),
  (f) => f.formatCapitalizedError({ type: "Capitalized", value: "abc" }),
  (f) => f.formatUncapitalizedError({ type: "Uncapitalized", value: "Abc" }),
  (f) => f.formatUppercasedError({ type: "Uppercased", value: "abc" }),
  (f) => f.formatLowercasedError({ type: "Lowercased", value: "ABC" }),
  (f) => f.formatTrimmedError({ type: "Trimmed", value: " a " }),
  (f) => f.formatWellFormedError({ type: "WellFormed", value: "\uD800" }),
  (f) =>
    f.formatNormalizedError({
      type: "NormalizedNFC",
      value: "e\u0301",
      form: "NFC",
    }),
  (f) =>
    f.formatStartsWithError({
      type: "StartsWithAPP_",
      value: "OTHER",
      prefix: "APP_",
    }),
  (f) =>
    f.formatEndsWithError({
      type: "EndsWith.json",
      value: "config.txt",
      suffix: ".json",
    }),
  (f) =>
    f.formatIncludesError({
      type: "Includes@",
      value: "ada.example.com",
      substring: "@",
    }),
  (f) =>
    f.formatExcludesError({
      type: "Excludes,",
      value: "a,b",
      substring: ",",
    }),
  (f) => f.formatMinLengthError({ type: "MinLength3", value: "ab", min: 3 }),
  (f) => f.formatMaxLengthError({ type: "MaxLength4", value: "abcde", max: 4 }),
  (f) =>
    f.formatMaxUtf8ByteLengthError({
      type: "MaxUtf8ByteLength6",
      value: "abcdefg",
      max: 6,
    }),
  (f) => f.formatLengthError({ type: "Length5", value: "abc", exact: 5 }),
  (f) =>
    f.formatRegexError({
      type: "Regex",
      value: "y",
      source: "^x$",
      flags: "u",
    }),
  (f) => f.formatBase64UrlError({ type: "Base64Url", value: "+/" }),
  (f) => f.formatBase64Error({ type: "Base64", value: "AB==" }),
  (f) => f.formatHexError({ type: "Hex", value: "0xff" }),
  (f) => f.formatHexColorError({ type: "HexColor", value: "#FFF" }),
  (f) => f.formatNameError({ type: "Name", value: "bad name" }),
  (f) => f.formatEmailError({ type: "Email", value: "x" }),
  (f) => f.formatHostnameError({ type: "Hostname", value: "Example.com" }),
  (f) => f.formatIpv4AddressError({ type: "Ipv4Address", value: "01.2.3.4" }),
  (f) =>
    f.formatIpv6AddressError({ type: "Ipv6Address", value: "2001:DB8::1" }),
  (f) =>
    f.formatIpv6AddressFromStringError({
      type: "Ipv6AddressFromString",
      value: "fe80::1%eth0",
    }),
  (f) => f.formatIpAddressError({ type: "IpAddress", value: "2001:DB8::1" }),
  (f) =>
    f.formatIpAddressFromStringError({
      type: "IpAddressFromString",
      value: "1.2.3.4:80",
    }),
  (f) =>
    f.formatPhoneNumberE164Error({
      type: "PhoneNumberE164",
      value: "+1 415 555 2671",
    }),
  (f) => f.formatIbanError({ type: "Iban", value: "GB82WEST12345698765433" }),
  (f) => f.formatIsbnError({ type: "Isbn", value: "978-0-306-40615-7" }),
  (f) => f.formatMnemonicError({ type: "Mnemonic" }),
  ...(["Untrimmed", "TooLong", "TooShort"] as const).map(
    (reason) => (f: typeof en) =>
      f.formatSimplePasswordError({ type: "SimplePassword", reason }),
  ),
  (f) => f.formatIdError({ type: "Id", value: "x" }),
  (f) => f.formatTableIdError({ type: "TableId", table: "Todo", value: "x" }),
  (f) => f.formatUuidError({ type: "Uuid", value: "x" }),
  (f) =>
    f.formatUuidVersionError({
      type: "UuidV7",
      value: "20354d7a-e4fe-47af-8ff6-187bca92f3f9",
      version: 7,
    }),
  (f) =>
    f.formatUlidError({ type: "Ulid", value: "01arz3ndektsv4rrffq69g5fav" }),
  (f) => f.formatNonNegativeError({ type: "NonNegative", value: -1 }),
  (f) =>
    f.formatNonNegativeDecimalStringError({
      type: "NonNegativeDecimalString",
      value: "-1",
    }),
  (f) => f.formatPositiveError({ type: "Positive", value: 0 }),
  (f) =>
    f.formatPositiveDecimalStringError({
      type: "PositiveDecimalString",
      value: "0",
    }),
  (f) => f.formatNonPositiveError({ type: "NonPositive", value: 1 }),
  (f) =>
    f.formatNonPositiveDecimalStringError({
      type: "NonPositiveDecimalString",
      value: "1",
    }),
  (f) => f.formatNegativeError({ type: "Negative", value: 0 }),
  (f) =>
    f.formatNegativeDecimalStringError({
      type: "NegativeDecimalString",
      value: "0",
    }),
  (f) => f.formatIntError({ type: "Int", value: 1.5 }),
  (f) => f.formatIntFromStringError({ type: "IntFromString", value: "1.5" }),
  (f) =>
    f.formatFiniteNumberFromStringError({
      type: "FiniteNumberFromString",
      value: ".5",
    }),
  (f) => f.formatGreaterThanError({ type: "GreaterThan6", value: 0, min: 6 }),
  (f) =>
    f.formatGreaterThanOrEqualToError({
      type: "GreaterThanOrEqualTo7",
      value: 0,
      min: 7,
    }),
  (f) => f.formatLessThanError({ type: "LessThan8", value: 9, max: 8 }),
  (f) =>
    f.formatLessThanOrEqualToError({
      type: "LessThanOrEqualTo8",
      value: 9,
      max: 8,
    }),
  (f) => f.formatNonNaNError({ type: "NonNaN", value: Number.NaN }),
  (f) => f.formatFiniteError({ type: "Finite", value: Infinity }),
  (f) =>
    f.formatMultipleOfError({ type: "MultipleOf3", value: 4, divisor: "3" }),
  (f) => f.formatBetweenError({ type: "Between1-2", value: 3, min: 1, max: 2 }),
  (f) =>
    f.formatGreaterThanBigIntError({
      type: "GreaterThan10n",
      value: 10n,
      min: 10n,
    }),
  (f) =>
    f.formatGreaterThanOrEqualToBigIntError({
      type: "GreaterThanOrEqualTo11n",
      value: 10n,
      min: 11n,
    }),
  (f) =>
    f.formatLessThanBigIntError({ type: "LessThan12n", value: 12n, max: 12n }),
  (f) =>
    f.formatLessThanOrEqualToBigIntError({
      type: "LessThanOrEqualTo18446744073709551615n",
      value: 18446744073709551616n,
      max: 18446744073709551615n,
    }),
  (f) =>
    f.formatBetweenBigIntError({
      type: "Between3n-4n",
      value: 5n,
      min: 3n,
      max: 4n,
    }),
  (f) => f.formatArrayError(failure(StringArray.fromUnknown(1))),
  // eslint-disable-next-line no-sparse-arrays
  (f) => f.formatArrayError(failure(StringArray.fromUnknown([, "a"]))),
  (f) =>
    f.formatArrayError(
      failure(StringArray.fromUnknown(withAccessorAt(["a"], 0))),
    ),
  (f) =>
    f.formatArrayError(
      failure(StringArray.fromUnknown(Object.assign(["a"], { extra: 1 }))),
    ),
  (f) => f.formatArrayError(failure(StringArray.fromUnknown(["a", 1]))),
  (f) => f.formatNonEmptyArrayError({ type: "NonEmptyArray", value: [] }),
  (f) =>
    f.formatUniqueError({
      type: "Unique",
      value: ["a", "b", "a"],
      index: 2,
      previousIndex: 0,
    }),
  (f) => f.formatSetError(failure(StringSet.fromUnknown(1))),
  (f) =>
    f.formatSetError(
      failure(
        StringSet.fromUnknown(Object.assign(new Set(["a"]), { extra: 1 })),
      ),
    ),
  (f) => f.formatSetError(failure(StringSet.fromUnknown(new Set(["a", 1])))),
  (f) => f.formatMapError(failure(StringMap.fromUnknown(1))),
  (f) =>
    f.formatMapError(
      failure(
        StringMap.fromUnknown(
          Object.assign(new Map([["a", "b"]]), { extra: 1 }),
        ),
      ),
    ),
  (f) =>
    f.formatMapError(
      failure(
        StringMap.fromUnknown(
          new Map<unknown, unknown>([
            ["a", "b"],
            [1, "c"],
          ]),
        ),
      ),
    ),
  (f) =>
    f.formatMapError(
      failure(
        StringMap.fromUnknown(
          new Map<unknown, unknown>([
            ["a", "b"],
            ["c", 1],
          ]),
        ),
      ),
    ),
  (f) =>
    f.formatMapError(
      failure(
        Type.map(LowercaseString, Type.String).fromUnknown(
          new Map([
            ["b", "x"],
            ["A", "y"],
            ["a", "z"],
          ]),
        ),
      ),
    ),
  (f) =>
    f.formatMinSizeError({ type: "MinSize2", value: new Set(["a"]), min: 2 }),
  (f) =>
    f.formatMaxSizeError({
      type: "MaxSize1",
      value: new Map([
        ["a", "x"],
        ["b", "y"],
      ]),
      max: 1,
    }),
  (f) => f.formatTupleError(failure(StringTuple.fromUnknown(1))),
  (f) => f.formatTupleError(failure(StringTuple.fromUnknown(["a", 1, 2]))),
  // eslint-disable-next-line no-sparse-arrays
  (f) => f.formatTupleError(failure(StringTuple.fromUnknown(["a", ,]))),
  (f) =>
    f.formatTupleError(
      failure(StringTuple.fromUnknown(withAccessorAt(["a", 1], 1))),
    ),
  (f) =>
    f.formatTupleError(
      failure(StringTuple.fromUnknown(Object.assign(["a", 1], { extra: 1 }))),
    ),
  (f) => f.formatTupleError(failure(StringTuple.fromUnknown(["a", "b"]))),
  (f) => f.formatRecordError(failure(StringRecord.fromUnknown(1))),
  (f) => f.formatRecordError(failure(StringRecord.fromUnknown(new Date(0)))),
  (f) =>
    f.formatRecordError(
      failure(
        Type.record(
          Type.regex("RecordKey", /^valid$/u)(Type.String),
          Type.String,
        ).fromUnknown({ bad: "x" }),
      ),
    ),
  (f) => f.formatRecordError(failure(StringRecord.fromUnknown({ a: 1 }))),
  (f) =>
    f.formatRecordError(
      failure(StringRecord.fromUnknown(withAccessorAt({}, "a"))),
    ),
  (f) =>
    f.formatRecordError(
      failure(StringRecord.fromUnknown(withNonEnumerable({}, "a"))),
    ),
  (f) =>
    f.formatRecordError(
      failure(
        Type.record(LowercaseString, Type.String).fromUnknown({
          A: "x",
          a: "y",
        }),
      ),
    ),
  (f) =>
    f.formatMinEntriesError({
      type: "MinEntries2",
      value: { a: "x" },
      min: 2,
    }),
  (f) =>
    f.formatMaxEntriesError({
      type: "MaxEntries1",
      value: { a: "x", b: "y" },
      max: 1,
    }),
  (f) => f.formatObjectError(failure(ValueObject.fromUnknown(1))),
  (f) => f.formatObjectError(failure(ValueObject.fromUnknown(new Date(0)))),
  (f) =>
    f.formatObjectError(
      failure(ValueObject.fromUnknown(withAccessorAt({}, "value"))),
    ),
  (f) =>
    f.formatObjectError(
      failure(ValueObject.fromUnknown(withNonEnumerable({}, "value"))),
    ),
  (f) => f.formatObjectError(failure(ValueObject.fromUnknown({}))),
  (f) =>
    f.formatObjectError({
      type: "Object",
      reason: {
        kind: "Properties",
        errors: { [Symbol("key")]: { type: "ObjectExcessProperty" } },
      },
    }),
  (f) =>
    f.formatObjectError(
      failure(ValueObject.fromUnknown({ value: "a", extra: 1 })),
    ),
  (f) => f.formatObjectError(failure(ValueObject.fromUnknown({ value: 1 }))),
  (f) =>
    f.formatDiscriminatedUnionError(failure(CreatedOrDeleted.fromUnknown(1))),
  (f) =>
    f.formatDiscriminatedUnionError(
      failure(CreatedOrDeleted.fromUnknown(new Date(0))),
    ),
  ...(["Accessor", "Inherited", "NonEnumerable"] as const).map(
    (reason) => (f: typeof en) =>
      f.formatDiscriminatedUnionError({
        type: "DiscriminatedUnion",
        reason: { kind: "PropertyAccess", key: "type", reason },
      }),
  ),
  (f) =>
    f.formatDiscriminatedUnionError(
      failure(CreatedOrDeleted.fromUnknown({ type: "Other", value: "x" })),
    ),
  (f) =>
    f.formatDiscriminatedUnionError(
      failure(CreatedOrDeleted.fromUnknown({ type: "Created", value: 1 })),
    ),
  (f) =>
    f.formatJsonValueError(
      jsonValueError({ kind: "InvalidType", path: [], value: undefined }),
    ),
  (f) =>
    f.formatJsonValueError(
      jsonValueError({ kind: "NonFiniteNumber", path: [], value: Infinity }),
    ),
  (f) =>
    f.formatJsonValueError(
      jsonValueError({
        kind: "UnexpectedPrototype",
        path: [],
        container: "Object",
        value: new Date(0),
      }),
    ),
  ...(
    [
      "Accessor",
      "NonEnumerable",
      "SymbolProperty",
      "Hole",
      "ExcessProperty",
    ] as const
  ).map(
    (kind) => (f: typeof en) =>
      f.formatJsonValueError(jsonValueError({ kind, path: [] })),
  ),
  (f) =>
    f.formatJsonValueError(
      jsonValueError({ kind: "CircularReference", path: [], ancestorPath: [] }),
    ),
  (f) => f.formatJsonError({ type: "Json", value: "{" }),
  (f) =>
    f.formatDataError(
      dataError({ kind: "InvalidType", path: [], value: undefined }),
    ),
  (f) =>
    f.formatDataError(
      dataError({
        kind: "UnexpectedPrototype",
        path: [],
        container: "Object",
        value: new Date(0),
      }),
    ),
  ...(["Accessor", "NonEnumerable", "SymbolProperty", "Hole"] as const).map(
    (kind) => (f: typeof en) =>
      f.formatDataError(dataError({ kind, path: [] })),
  ),
  (f) =>
    f.formatDataError(
      dataError({
        kind: "InvalidUint8Array",
        path: [],
        value: new Uint8Array(),
      }),
    ),
  ...(["Array", "Set", "Map"] as const).map(
    (container) => (f: typeof en) =>
      f.formatDataError(
        dataError({ kind: "ExcessProperty", path: [], container }),
      ),
  ),
  (f) =>
    f.formatByteSizeLiteralError({ type: "ByteSizeLiteral", value: "1MB" }),
  (f) =>
    f.formatDurationLiteralError({ type: "DurationLiteral", value: "1 sec" }),
  (f) =>
    f.formatPercentageLiteralError({ type: "PercentageLiteral", value: "50" }),
  (f) => f.formatByteLengthError({ type: "ByteLength", value: -0 }),
  (f) =>
    f.formatByteLengthFromStringError({
      type: "ByteLengthFromString",
      value: "1MB",
    }),
];

describe("Type localization", () => {
  test("renders different English messages differently in every locale", () => {
    for (const [name, locale] of objectToEntries(locales)) {
      const englishByMessage = new Map<string, string>();
      for (const format of messageCases) {
        const english = format(en);
        const message = format(locale);
        assert(message !== english, `${name} leaves "${english}" in English.`);
        const previous = englishByMessage.get(message);
        assert(
          previous === undefined || previous === english,
          `${name} renders "${previous}" and "${english}" as "${message}".`,
        );
        englishByMessage.set(message, english);
      }
    }
  });

  test("keeps the quoted values and numbers of English messages in every locale", () => {
    for (const [name, locale] of objectToEntries(locales)) {
      for (const format of messageCases) {
        const english = format(en);
        const message = format(locale);
        for (const token of english.match(/"(?:[^"\\]|\\.)*"|\b\d+\b/gu) ??
          []) {
          assert(
            message.includes(token),
            `${name} drops ${token} from "${english}": "${message}".`,
          );
        }
      }
    }
  });

  test("localizes domain literal errors in every locale without expanding their causes", () => {
    const value = 'invalid"\\\\';
    const result = ByteSizeLiteral.fromUnknown(value);
    assertErr(result);
    const duration = DurationLiteral.fromUnknown(value);
    const percentage = PercentageLiteral.fromUnknown(value);
    assertErr(duration);
    assertErr(percentage);
    const english = ByteSizeLiteral.formatError(result.error);
    for (const [, locale] of objectToEntries(locales)) {
      const { localized: types } = Type.localizeTypes(
        { ByteSizeLiteral, DurationLiteral, PercentageLiteral },
        {
          localized: {
            ByteSizeLiteral: locale.formatByteSizeLiteralError,
            DurationLiteral: locale.formatDurationLiteralError,
            PercentageLiteral: locale.formatPercentageLiteralError,
          },
        },
      );
      for (const [message, original, examples] of [
        [
          types.DurationLiteral.formatError(duration.error),
          DurationLiteral.formatError(duration.error),
          ['"500ms"', '"1.5s"'],
        ],
        [
          types.PercentageLiteral.formatError(percentage.error),
          PercentageLiteral.formatError(percentage.error),
          ['"50%"', '"12.5%"'],
        ],
      ] as const) {
        assertTrue(message !== original);
        assertTrue(message.includes(JSON.stringify(value)));
        for (const example of examples) assertTrue(message.includes(example));
        assertTrue(!message.includes("\n"));
      }
      const message = types.ByteSizeLiteral.formatError(result.error);
      assertTrue(message !== english);
      assertTrue(message.includes(JSON.stringify(value)));
      assertTrue(message.includes('"512KiB"'));
      assertTrue(message.includes('"1MiB"'));
      assertTrue(!message.includes("\n"));
      assertEqual(Type.typeErrorToIssues(types.ByteSizeLiteral, result.error), [
        { path: [], message },
      ]);
    }
  });

  test("includes localized Union member failures in every locale", () => {
    for (const [, types] of objectToEntries(typesByLocale)) {
      const result = types.Union.fromUnknown(false, { errors: "all" });
      const stringResult = types.Union.members[0].fromUnknown(false);
      const numberResult = types.Union.members[1].fromUnknown(false);
      assertErr(result);
      assertErr(stringResult);
      assertErr(numberResult);
      const message = types.Union.formatError(result.error);
      assertTrue(
        message.includes(
          `- 0: String: ${types.Union.members[0].formatError(stringResult.error)}`,
        ),
      );
      assertTrue(
        message.includes(
          `- 1: Number: ${types.Union.members[1].formatError(numberResult.error)}`,
        ),
      );
      assertEqual(Type.typeErrorToIssues(types.Union, result.error), [
        { path: [], message },
      ]);
    }
  });

  test("localizes parameterized startsWith errors", () => {
    const prefix = 'APP_"\\\n';
    const value = 'OTHER_"\\\n';
    const Prefixed = Type.startsWith(prefix)(Type.String);
    const result = Prefixed.fromUnknown(value);
    assertErr(result);
    const error: Type.StartsWithError<typeof prefix> = {
      type: Prefixed.name,
      value,
      prefix,
    };
    const expected =
      'The value "OTHER_\\\"\\\\\\n" must start with "APP_\\\"\\\\\\n".';

    assertEqual(Prefixed.formatError(error), expected);

    const { en: english } = Type.localizeTypes(
      { Prefixed },
      {
        en: {
          [Prefixed.name]: en.formatStartsWithError,
          String: en.formatStringError,
        },
      },
    );
    assertEqual(english.Prefixed.formatError(error), expected);
  });

  test("localizes escaped startsWith values and prefixes in every locale", () => {
    const prefix = 'APP_"\\\n';
    const value = 'OTHER"\\\n';

    for (const [name, locale] of objectToEntries(locales)) {
      const { StartsWithEscaped } = typesByLocale[name];
      const result = StartsWithEscaped.fromUnknown(value);
      assertErr(result);
      const { error } = result;
      assert(error.type !== "TypeOf", "Expected a startsWith error.");
      const message = StartsWithEscaped.formatError(error);

      assertEqual(message, locale.formatStartsWithError(error));
      assertTrue(message.includes(JSON.stringify(value)));
      assertTrue(message.includes(JSON.stringify(prefix)));
    }
  });

  test("renders every UUID version and normalization form in every locale", () => {
    for (const [name, locale] of objectToEntries(locales)) {
      for (const version of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        const message = locale.formatUuidVersionError({
          type: `UuidV${version}`,
          value: "x",
          version,
        });
        assert(
          message.includes(String(version)),
          `${name} drops UUID version ${version}: "${message}".`,
        );
      }
      for (const form of ["NFC", "NFD", "NFKC", "NFKD"] as const) {
        const message = locale.formatNormalizedError({
          type: `Normalized${form}`,
          value: "x",
          form,
        });
        assert(
          message.includes(form),
          `${name} drops normalization form ${form}: "${message}".`,
        );
      }
    }
  });

  test("defines localized types", () => {
    assertNotUndefined(typesByLocale);
    assertLength(Object.keys(typesByLocale), 43);
  });
});
