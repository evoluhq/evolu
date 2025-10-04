import { assert, expect, expectTypeOf, test } from "vitest";
import { Brand } from "../src/Brand.js";
import { constVoid, exhaustiveCheck } from "../src/Function.js";
import { err, ok } from "../src/Result.js";
import {
  array,
  ArrayError,
  Base64Url,
  base64UrlToUint8Array,
  Between1And10,
  BigIntError,
  Boolean,
  BooleanError,
  brand,
  BrandWithoutRefineError,
  createFormatTypeError,
  createId,
  createIdFromString,
  Date,
  DateIso,
  FiniteError,
  FiniteNumber,
  formatRegexError,
  formatStringError,
  greaterThan,
  greaterThanOrEqualTo,
  Id,
  id,
  IdBytes,
  idBytesToId,
  idToIdBytes,
  InferError,
  InferInput,
  InferParent,
  InferParentError,
  InferType,
  instanceOf,
  InstanceOfError,
  Int,
  Int64,
  Int64Error,
  Int64String,
  IntError,
  isOptionalType,
  isType,
  Json,
  json,
  JsonArray,
  JsonError,
  JsonValue,
  JsonValueError,
  JsonValueInput,
  length,
  LengthError,
  lessThan,
  lessThanOrEqualTo,
  literal,
  LiteralError,
  maxLength,
  MaxLengthError,
  minLength,
  MinLengthError,
  multipleOf,
  MultipleOfError,
  NegativeError,
  NegativeInt,
  NegativeNumber,
  NonEmptyString,
  NonEmptyString100,
  NonEmptyTrimmedString,
  NonEmptyTrimmedString1000,
  NonNaNError,
  NonNaNNumber,
  NonNegativeError,
  NonNegativeInt,
  NonNegativeNumber,
  NonPositiveError,
  NonPositiveInt,
  NonPositiveNumber,
  nullableToOptional,
  NullError,
  nullishOr,
  nullOr,
  Number,
  NumberError,
  object,
  ObjectError,
  ObjectWithRecordError,
  omit,
  optional,
  partial,
  PositiveError,
  PositiveInt,
  PositiveNumber,
  record,
  RecordError,
  recursive,
  regex,
  RegexError,
  SimplePassword,
  String,
  StringError,
  TableIdError,
  trimmed,
  TrimmedError,
  TrimmedString,
  tuple,
  TupleError,
  Type,
  TypeError,
  TypeErrorFormatter,
  TypeErrors,
  uint8ArrayToBase64Url,
  UndefinedError,
  undefinedOr,
  union,
  UnionError,
  Unknown,
  UrlSafeString,
} from "../src/Type.js";
import { testDeps } from "./_deps.js";

test("Base Types", () => {
  expect(Unknown.from(42)).toEqual({ ok: true, value: 42 });
  expect(Unknown.fromUnknown(42)).toEqual({ ok: true, value: 42 });
  expect(Unknown.fromParent(42)).toEqual({ ok: true, value: 42 });
  expect(Unknown.is(42)).toBe(true);
  expect(Unknown.name).toBe("Unknown");
  expect(isType(Unknown)).toBe(true);

  expectTypeOf<InferType<typeof Unknown>>().toEqualTypeOf<unknown>();
  expectTypeOf<InferInput<typeof Unknown>>().toEqualTypeOf<unknown>();
  expectTypeOf<InferError<typeof Unknown>>().toEqualTypeOf<never>();
  expectTypeOf<InferParent<typeof Unknown>>().toEqualTypeOf<unknown>();
  expectTypeOf<InferParentError<typeof Unknown>>().toEqualTypeOf<never>();

  expectTypeOf<typeof Unknown.Type>().toEqualTypeOf<unknown>();
  expectTypeOf<typeof Unknown.Input>().toEqualTypeOf<unknown>();
  expectTypeOf<typeof Unknown.Error>().toEqualTypeOf<never>();
  expectTypeOf<typeof Unknown.Parent>().toEqualTypeOf<unknown>();
  expectTypeOf<typeof Unknown.ParentError>().toEqualTypeOf<never>();

  expect(String.from("world")).toEqual(ok("world"));
  expect(String.fromUnknown("hello")).toEqual(ok("hello"));
  expect(String.fromUnknown(42)).toEqual(
    err<StringError>({ type: "String", value: 42 }),
  );
  expect(String.fromParent("example")).toEqual(ok("example"));
  expect(String.is("valid string")).toBe(true);
  expect(String.is(123)).toBe(false);
  expect(String.name).toBe("String");
  expect(isType(String)).toBe(true);

  expectTypeOf<typeof String.Type>().toEqualTypeOf<string>();
  expectTypeOf<typeof String.Error>().toEqualTypeOf<StringError>();
  expectTypeOf<typeof String.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof String.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof String.ParentError>().toEqualTypeOf<StringError>();

  expect(formatStringError({ type: "String", value: 42 })).toBe(
    "A value 42 is not a string.",
  );

  // TODO: Test other Base Types.
});

test("orThrow", () => {
  expect(PositiveNumber.orThrow(42)).toBe(42);
  expect(() => PositiveNumber.orThrow(-5)).toThrowErrorMatchingInlineSnapshot(
    `[Error: getOrThrow]`,
  );
});

test("brand", () => {
  // It's for fromParent test.
  let trimmedStringRefineCount = 0;

  const TrimmedString = brand("Trimmed", String, (value) => {
    trimmedStringRefineCount++;
    return value.trim().length === value.length
      ? ok(value)
      : err<TrimmedStringError>({ type: "TrimmedString", value });
  });
  type TrimmedString = typeof TrimmedString.Type;
  interface TrimmedStringError extends TypeError {
    type: "TrimmedString";
  }

  expect(TrimmedString.from("a")).toEqual(ok("a"));
  expect(TrimmedString.from(" a")).toEqual(
    err({ type: "TrimmedString", value: " a" }),
  );
  expect(TrimmedString.fromUnknown("a")).toEqual(ok("a"));
  expect(TrimmedString.fromUnknown(" a")).toEqual(
    err({ type: "TrimmedString", value: " a" }),
  );
  expect(TrimmedString.fromParent("a")).toEqual(ok("a"));
  expect(TrimmedString.is("a")).toBe(true);
  expect(TrimmedString.is(123)).toBe(false);
  expect(TrimmedString.name).toBe("Brand");
  expect(TrimmedString.brand).toBe("Trimmed");
  expect(TrimmedString.parentType).toBe(String);
  expectTypeOf<typeof TrimmedString.parentType>().toEqualTypeOf<
    typeof String
  >();
  expect(isType(TrimmedString)).toBe(true);

  expectTypeOf<TrimmedString>().toEqualTypeOf<string & Brand<"Trimmed">>();

  expectTypeOf<typeof TrimmedString.Type>().toEqualTypeOf<
    string & Brand<"Trimmed">
  >();
  expectTypeOf<
    typeof TrimmedString.Error
  >().toEqualTypeOf<TrimmedStringError>();
  expectTypeOf<typeof TrimmedString.Input>().toEqualTypeOf<string>();
  expectTypeOf<
    typeof TrimmedString.Error
  >().toEqualTypeOf<TrimmedStringError>();
  expectTypeOf<typeof TrimmedString.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof TrimmedString.ParentError>().toEqualTypeOf<StringError>();

  const NonEmptyTrimmedString = brand("NonEmpty", TrimmedString, (value) =>
    value.length > 0
      ? ok(value)
      : err<NonEmptyTrimmedStringError>({
          type: "NonEmptyTrimmedString",
          value,
        }),
  );
  type NonEmptyTrimmedString = typeof NonEmptyTrimmedString.Type;
  interface NonEmptyTrimmedStringError extends TypeError {
    type: "NonEmptyTrimmedString";
  }

  expect(NonEmptyTrimmedString.from("a")).toEqual(ok("a"));
  expect(NonEmptyTrimmedString.from(" a")).toEqual(
    err({ type: "TrimmedString", value: " a" }),
  );
  expect(NonEmptyTrimmedString.from("")).toEqual(
    err({ type: "NonEmptyTrimmedString", value: "" }),
  );

  // fromParent skips TrimmedString
  expect(trimmedStringRefineCount).toBe(9);
  expect(NonEmptyTrimmedString.fromParent("a" as TrimmedString)).toEqual(
    ok("a"),
  );
  expect(trimmedStringRefineCount).toBe(9);

  expect(NonEmptyTrimmedString.is("a")).toBe(true);
  expect(NonEmptyTrimmedString.is("")).toBe(false);
  expect(NonEmptyTrimmedString.name).toBe("Brand");
  expect(NonEmptyTrimmedString.brand).toBe("NonEmpty");
  expect(NonEmptyTrimmedString.parentType).toBe(TrimmedString);

  expectTypeOf<typeof NonEmptyTrimmedString.parentType>().toEqualTypeOf<
    typeof TrimmedString
  >();

  expect(isType(NonEmptyTrimmedString)).toBe(true);

  expectTypeOf<NonEmptyTrimmedString>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"NonEmpty">
  >();
  expectTypeOf<typeof NonEmptyTrimmedString.Type>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"NonEmpty">
  >();
  expectTypeOf<typeof NonEmptyTrimmedString.Input>().toEqualTypeOf<string>();
  expectTypeOf<
    typeof NonEmptyTrimmedString.Error
  >().toEqualTypeOf<NonEmptyTrimmedStringError>();
  expectTypeOf<
    typeof NonEmptyTrimmedString.Parent
  >().toEqualTypeOf<TrimmedString>();
  expectTypeOf<typeof NonEmptyTrimmedString.ParentError>().toEqualTypeOf<
    StringError | TrimmedStringError
  >();

  const Form = object({
    password: SimplePassword,
    confirmPassword: SimplePassword,
  });

  const ValidForm = brand("Valid", Form, (value) => {
    if (value.password !== value.confirmPassword)
      return err<ValidFormError>({
        type: "ValidForm",
        value,
        reason: { kind: "PasswordMismatch" },
      });
    return ok(value);
  });
  type ValidForm = typeof ValidForm.Type;

  interface ValidFormError extends TypeError<"ValidForm"> {
    readonly reason: { kind: "PasswordMismatch" };
  }

  const result = ValidForm.from({
    password: "abcde123",
    confirmPassword: "bbcde123",
  });

  const safeForm = (_form: ValidForm) => {
    //
  };

  if (result.ok) {
    safeForm(result.value);
  }

  expect(result).toEqual(
    err({
      type: "ValidForm",
      value: {
        confirmPassword: "bbcde123",
        password: "abcde123",
      },
      reason: {
        kind: "PasswordMismatch",
      },
    }),
  );
});

test("TrimmedString", () => {
  expect(TrimmedString.from("a")).toEqual(ok("a"));
  expect(TrimmedString.from(" a")).toEqual(
    err({ type: "Trimmed", value: " a" }),
  );
  expect(TrimmedString.fromUnknown("a")).toEqual(ok("a"));
  expect(TrimmedString.fromUnknown(" a")).toEqual(
    err({ type: "Trimmed", value: " a" }),
  );
  expect(TrimmedString.fromParent("a")).toEqual(ok("a"));
  expect(TrimmedString.is("a")).toBe(true);
  expect(TrimmedString.is(123)).toBe(false);
  expect(TrimmedString.name).toBe("Brand");
  expect(TrimmedString.brand).toBe("Trimmed");

  expectTypeOf<TrimmedString>().toEqualTypeOf<string & Brand<"Trimmed">>();
  expectTypeOf<typeof TrimmedString.Type>().toEqualTypeOf<
    string & Brand<"Trimmed">
  >();
  expectTypeOf<typeof TrimmedString.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof TrimmedString.Error>().toEqualTypeOf<TrimmedError>();
  expectTypeOf<typeof TrimmedString.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof TrimmedString.ParentError>().toEqualTypeOf<StringError>();

  // Just a string to be trimmed so we can test `trimmed(AString)`
  const AString = brand("A", String, (value) =>
    value.includes("a")
      ? ok(value)
      : err<AStringError>({ type: "AString", value }),
  );
  interface AStringError extends TypeError {
    readonly type: "AString";
  }

  const TrimmedAString = trimmed(AString);
  type TrimmedAString = typeof TrimmedAString.Type;

  expect(TrimmedAString.from("a")).toEqual(ok("a"));
  expect(TrimmedAString.from("b")).toEqual(
    err({ type: "AString", value: "b" }),
  );
  expect(TrimmedAString.from(" a")).toEqual(
    err({ type: "Trimmed", value: " a" }),
  );

  expectTypeOf<typeof TrimmedAString.Type>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"A">
  >();
  expectTypeOf<typeof TrimmedAString.Error>().toEqualTypeOf<TrimmedError>();
  expectTypeOf<typeof TrimmedAString.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof TrimmedAString.Parent>().toEqualTypeOf<
    string & Brand<"A">
  >();
  expectTypeOf<typeof TrimmedAString.ParentError>().toEqualTypeOf<
    AStringError | StringError
  >();
});

// test("trim", () => {
//   // @ts-expect-error Boolean is not allowed
//   trim(Boolean);

//   const TrimString = trim(String);
//   expect(TrimString.from("a ")).toEqual(ok("a"));
//   expect(TrimString.fromParent("a ").value).toEqual("a");

//   const TrimNonEmptyString = trim(NonEmptyString);
//   expect(TrimNonEmptyString.from("a " as NonEmptyString)).toEqual(ok("a"));
//   expect(TrimNonEmptyString.fromParent("a " as NonEmptyString).value).toEqual(
//     "a",
//   );
// });

test("minLength", () => {
  const Min1String = minLength(1)(String);

  expect(Min1String.from("a")).toEqual(ok("a"));
  expect(Min1String.from("")).toEqual(
    err<MinLengthError<1>>({ type: "MinLength", value: "", min: 1 }),
  );

  expect(Min1String.fromUnknown("abc")).toEqual(ok("abc"));
  expect(Min1String.fromUnknown("")).toEqual(
    err<MinLengthError<1>>({ type: "MinLength", value: "", min: 1 }),
  );

  expect(Min1String.fromParent("abc")).toEqual(ok("abc"));
  expect(Min1String.fromParent("")).toEqual(
    err<MinLengthError<1>>({ type: "MinLength", value: "", min: 1 }),
  );

  expect(Min1String.is("abc")).toBe(true);
  expect(Min1String.is("")).toBe(false);

  expect(Min1String.name).toBe("Brand");
  expect(Min1String.brand).toBe("MinLength1");

  expectTypeOf<typeof Min1String.Type>().toEqualTypeOf<
    string & Brand<"MinLength1">
  >();
  expectTypeOf<typeof Min1String.Error>().toEqualTypeOf<MinLengthError<1>>();
  expectTypeOf<typeof Min1String.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof Min1String.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof Min1String.ParentError>().toEqualTypeOf<StringError>();

  // Test chaining with another Type
  const Min1TrimmedString = minLength(1)(TrimmedString);

  expect(Min1TrimmedString.from("a")).toEqual(ok("a"));
  expect(Min1TrimmedString.from(" a")).toEqual(
    err<TrimmedError>({ type: "Trimmed", value: " a" }),
  );
  expect(Min1TrimmedString.from("")).toEqual(
    err<MinLengthError<1>>({ type: "MinLength", value: "", min: 1 }),
  );

  expectTypeOf<typeof Min1TrimmedString.Type>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"MinLength1">
  >();
  expectTypeOf<typeof Min1TrimmedString.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof Min1TrimmedString.Error>().toEqualTypeOf<
    MinLengthError<1>
  >();
  expectTypeOf<typeof Min1TrimmedString.Parent>().toEqualTypeOf<
    string & Brand<"Trimmed">
  >();
  expectTypeOf<typeof Min1TrimmedString.ParentError>().toEqualTypeOf<
    StringError | TrimmedError
  >();
});

test("maxLength", () => {
  const String5 = maxLength(5)(String);

  expect(String5.from("hello")).toEqual(ok("hello"));
  expect(String5.from("hello!")).toEqual(
    err<MaxLengthError<5>>({ type: "MaxLength", value: "hello!", max: 5 }),
  );

  expect(String5.fromUnknown("test")).toEqual(ok("test"));
  expect(String5.fromUnknown("exceeds")).toEqual(
    err<MaxLengthError<5>>({
      type: "MaxLength",
      value: "exceeds",
      max: 5,
    }),
  );

  expect(String5.fromParent("short")).toEqual(ok("short"));
  expect(String5.fromParent("too long")).toEqual(
    err<MaxLengthError<5>>({
      type: "MaxLength",
      value: "too long",
      max: 5,
    }),
  );

  expect(String5.is("short")).toBe(true);
  expect(String5.is("too long")).toBe(false);

  expect(String5.name).toBe("Brand");
  expect(String5.brand).toBe("MaxLength5");

  expectTypeOf<typeof String5.Type>().toEqualTypeOf<
    string & Brand<"MaxLength5">
  >();
  expectTypeOf<typeof String5.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof String5.Error>().toEqualTypeOf<MaxLengthError<5>>();
  expectTypeOf<typeof String5.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof String5.ParentError>().toEqualTypeOf<StringError>();

  // Test chaining with another Type
  const TrimmedString5 = maxLength(5)(TrimmedString);

  expect(TrimmedString5.from("trim")).toEqual(ok("trim"));
  expect(TrimmedString5.from(" too long")).toEqual(
    err<TrimmedError>({ type: "Trimmed", value: " too long" }),
  );
  expect(TrimmedString5.from("toolong")).toEqual(
    err<MaxLengthError<5>>({
      type: "MaxLength",
      value: "toolong",
      max: 5,
    }),
  );

  expectTypeOf<typeof TrimmedString5.Type>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"MaxLength5">
  >();
  expectTypeOf<typeof TrimmedString5.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof TrimmedString5.Error>().toEqualTypeOf<
    MaxLengthError<5>
  >();
  expectTypeOf<typeof TrimmedString5.Parent>().toEqualTypeOf<
    string & Brand<"Trimmed">
  >();
  expectTypeOf<typeof TrimmedString5.ParentError>().toEqualTypeOf<
    StringError | TrimmedError
  >();
});

test("length", () => {
  const Length1String = length(1)(String);

  expect(Length1String.from("a")).toEqual(ok("a"));
  expect(Length1String.from("abc")).toEqual(
    err<LengthError<1>>({ type: "Length", value: "abc", exact: 1 }),
  );

  expect(Length1String.fromUnknown("b")).toEqual(ok("b"));
  expect(Length1String.fromUnknown("too long")).toEqual(
    err<LengthError<1>>({
      type: "Length",
      value: "too long",
      exact: 1,
    }),
  );

  expect(Length1String.fromParent("z")).toEqual(ok("z"));
  expect(Length1String.fromParent("toolong")).toEqual(
    err<LengthError<1>>({ type: "Length", value: "toolong", exact: 1 }),
  );

  expect(Length1String.is("a")).toBe(true);
  expect(Length1String.is("ab")).toBe(false);

  expect(Length1String.name).toBe("Brand");
  expect(Length1String.brand).toBe("Length1");

  expectTypeOf<typeof Length1String.Type>().toEqualTypeOf<
    string & Brand<"Length1">
  >();
  expectTypeOf<typeof Length1String.Error>().toEqualTypeOf<LengthError<1>>();
  expectTypeOf<typeof Length1String.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof Length1String.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof Length1String.ParentError>().toEqualTypeOf<StringError>();

  // Test chaining with another Type
  const Length1TrimmedString = length(1)(TrimmedString);

  expect(Length1TrimmedString.from("x")).toEqual(ok("x"));
  expect(Length1TrimmedString.from(" too long ")).toEqual(
    err<TrimmedError>({ type: "Trimmed", value: " too long " }),
  );
  expect(Length1TrimmedString.from("abc")).toEqual(
    err<LengthError<1>>({ type: "Length", value: "abc", exact: 1 }),
  );

  expectTypeOf<typeof Length1TrimmedString.Type>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"Length1">
  >();
  expectTypeOf<typeof Length1TrimmedString.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof Length1TrimmedString.Error>().toEqualTypeOf<
    LengthError<1>
  >();
  expectTypeOf<typeof Length1TrimmedString.Parent>().toEqualTypeOf<
    string & Brand<"Trimmed">
  >();
  expectTypeOf<typeof Length1TrimmedString.ParentError>().toEqualTypeOf<
    StringError | TrimmedError
  >();
});

test("regex", () => {
  const Alphanumeric = regex("Alphanumeric", /^[a-z0-9]+$/i)(String);

  expect(Alphanumeric.from("abc123")).toEqual(ok("abc123"));
  expect(Alphanumeric.from("ABC123")).toEqual(ok("ABC123"));

  expect(Alphanumeric.from("abc!123")).toEqual(
    err<RegexError<"Alphanumeric">>({
      type: "Regex",
      name: "Alphanumeric",
      value: "abc!123",
      pattern: /^[a-z0-9]+$/i,
    }),
  );
  expect(Alphanumeric.from("!@#$")).toEqual(
    err<RegexError<"Alphanumeric">>({
      type: "Regex",
      name: "Alphanumeric",
      value: "!@#$",
      pattern: /^[a-z0-9]+$/i,
    }),
  );

  expect(Alphanumeric.is("abc123")).toBe(true);
  expect(Alphanumeric.is("abc!123")).toBe(false);

  expect(Alphanumeric.name).toBe("Brand");
  expect(Alphanumeric.brand).toBe("Alphanumeric");

  expectTypeOf<typeof Alphanumeric.Type>().toEqualTypeOf<
    string & Brand<"Alphanumeric">
  >();
  expectTypeOf<typeof Alphanumeric.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof Alphanumeric.Error>().toEqualTypeOf<
    RegexError<"Alphanumeric">
  >();
  expectTypeOf<typeof Alphanumeric.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof Alphanumeric.ParentError>().toEqualTypeOf<StringError>();

  const TrimmedAlphanumeric = regex(
    "Alphanumeric",
    /^[a-z0-9]+$/i,
  )(TrimmedString);

  expect(TrimmedAlphanumeric.from("valid123")).toEqual(ok("valid123"));
  expect(TrimmedAlphanumeric.from(" invalid123 ")).toEqual(
    err<TrimmedError>({ type: "Trimmed", value: " invalid123 " }),
  );
  expect(TrimmedAlphanumeric.from("invalid!")).toEqual(
    err<RegexError<"Alphanumeric">>({
      type: "Regex",
      name: "Alphanumeric",
      value: "invalid!",
      pattern: /^[a-z0-9]+$/i,
    }),
  );

  expectTypeOf<typeof TrimmedAlphanumeric.Type>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"Alphanumeric">
  >();
  expectTypeOf<typeof TrimmedAlphanumeric.Error>().toEqualTypeOf<
    RegexError<"Alphanumeric">
  >();
  expectTypeOf<typeof TrimmedAlphanumeric.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof TrimmedAlphanumeric.Parent>().toEqualTypeOf<
    string & Brand<"Trimmed">
  >();
  expectTypeOf<typeof TrimmedAlphanumeric.ParentError>().toEqualTypeOf<
    StringError | TrimmedError
  >();

  const error: RegexError<"Alphanumeric"> = {
    type: "Regex",
    name: "Alphanumeric",
    value: "invalid!",
    pattern: /^[a-z0-9]+$/i,
  };

  expect(formatRegexError(error)).toBe(
    'Value "invalid!" does not match the pattern for Alphanumeric: /^[a-z0-9]+$/i',
  );

  // regex with global flag (g, y) is stateful
  const GlobalRegex = regex("GlobalRegex", /abc/g)(String);
  expect(GlobalRegex.from("abc")).toEqual(ok("abc"));
  expect(GlobalRegex.from("abc")).toEqual(ok("abc"));
});

test("UrlSafeString", () => {
  expect(UrlSafeString.from("abc123_-")).toEqual(ok("abc123_-"));
  expect(UrlSafeString.from("ABC123_-")).toEqual(ok("ABC123_-"));

  expect(UrlSafeString.from("abc!123")).toEqual(
    err<RegexError<"UrlSafeString">>({
      type: "Regex",
      name: "UrlSafeString",
      value: "abc!123",
      pattern: /^[A-Za-z0-9_-]+$/,
    }),
  );
  expect(UrlSafeString.from("abc/123")).toEqual(
    err<RegexError<"UrlSafeString">>({
      type: "Regex",
      name: "UrlSafeString",
      value: "abc/123",
      pattern: /^[A-Za-z0-9_-]+$/,
    }),
  );

  expect(UrlSafeString.is("abc123_-")).toBe(true);
  expect(UrlSafeString.is("abc/123")).toBe(false);

  expect(UrlSafeString.name).toBe("Brand");
  expect(UrlSafeString.brand).toBe("UrlSafeString");

  expectTypeOf<typeof UrlSafeString.Type>().toEqualTypeOf<
    string & Brand<"UrlSafeString">
  >();
  expectTypeOf<typeof UrlSafeString.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof UrlSafeString.Error>().toEqualTypeOf<
    RegexError<"UrlSafeString">
  >();
  expectTypeOf<typeof UrlSafeString.Parent>().toEqualTypeOf<string>();
});

test("Base64Url", () => {
  const valid = [
    "",
    "ABCD",
    "SGVsbG8g",
    "SGVsbG8",
    uint8ArrayToBase64Url(new Uint8Array([0x00])),
    uint8ArrayToBase64Url(new Uint8Array([0xff])),
    uint8ArrayToBase64Url(new Uint8Array([0x00, 0x00])),
  ];
  for (const v of valid) {
    const r = Base64Url.from(v);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const bytes = base64UrlToUint8Array(r.value);
      expect(uint8ArrayToBase64Url(bytes)).toBe(v);
      expect(Base64Url.is(v)).toBe(true);
    }
  }

  const invalid = ["A", "AB", "AAz"];
  for (const v of invalid) {
    const r = Base64Url.from(v);
    expect(r.ok).toBe(false);
    expect(Base64Url.is(v)).toBe(false);
  }

  expect(Base64Url.name).toBe("Brand");
  expect(Base64Url.brand).toBe("Base64Url");
  expectTypeOf<typeof Base64Url.Type>().toEqualTypeOf<Base64Url>();
  expectTypeOf<typeof Base64Url.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof Base64Url.Parent>().toEqualTypeOf<string>();
});

test("base64UrlToUint8Array/uint8ArrayToBase64Url", () => {
  // Test round-trip conversion
  const originalBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const base64String = uint8ArrayToBase64Url(originalBytes);
  const decodedBytes = base64UrlToUint8Array(base64String);

  expect(decodedBytes).toEqual(originalBytes);
  expect(base64String).toBe("SGVsbG8");

  const testData = [
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([255, 254, 253]),
    new Uint8Array([]),
    new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  ];

  for (const bytes of testData) {
    const encoded = uint8ArrayToBase64Url(bytes);
    expect(Base64Url.is(encoded)).toBe(true);
    const decoded = base64UrlToUint8Array(encoded);
    expect(decoded).toEqual(bytes);
  }

  expectTypeOf(base64String).toEqualTypeOf<Base64Url>();
  expectTypeOf(decodedBytes).toEqualTypeOf<Uint8Array>();
});

test("DateIso", () => {
  const validDates = [
    "0000-01-01T00:00:00.000Z", // Minimum
    "9999-12-31T23:59:59.999Z", // Maximum
    "1970-01-01T00:00:00.000Z", // Unix epoch
    "2000-02-29T23:59:59.999Z", // Leap year
  ];

  for (const date of validDates) {
    const result = DateIso.from(date);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(date);
  }

  const invalidDates = [
    "2022-13-01T00:00:00.000Z", // Invalid month
    "2022-12-32T00:00:00.000Z", // Invalid day
    "2022-12-01T25:00:00.000Z", // Invalid hour
    "2022-12-01T00:00:00.000", // Missing 'Z'
    "2022-12-01T00:00:00.000+01:00", // Timezone offset not allowed
    // This was the failing case from property tests - should be rejected
    `["0 (      ",-100000000]`, // JSON string that Date.parse accepts but isn't ISO format
  ];

  for (const date of invalidDates) {
    const result = DateIso.from(date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe("DateIso");
  }
});

test("SimplePassword", () => {
  expect(SimplePassword.from("validPass123")).toEqual(ok("validPass123"));
  expect(SimplePassword.from("12345678")).toEqual(ok("12345678"));
  expect(SimplePassword.from("abcdefghijk12345678901234567890")).toEqual(
    ok("abcdefghijk12345678901234567890"),
  );

  const shortResult = SimplePassword.from("short");
  expect(shortResult).toEqual(
    err({
      type: "SimplePassword",
      value: "short",
      parentError: {
        type: "MinLength",
        value: "short",
        min: 8,
      },
    }),
  );

  // TODO: use createFormatTypeError for formatSimplePasswordError

  assert(!shortResult.ok);
  // formatSimplePasswordError()
  // expect(formatSimplePasswordError(shortResult.error)).toBe(
  //   'Invalid password: Value "short" does not meet the minimum length of 8.',
  // );

  const spacesResult = SimplePassword.from("   spaces   ");
  expect(spacesResult).toEqual(
    err({
      type: "SimplePassword",
      value: "   spaces   ",
      parentError: { type: "Trimmed", value: "   spaces   " },
    }),
  );

  assert(!spacesResult.ok);
  // expect(formatSimplePasswordError(spacesResult.error)).toBe(
  //   'Invalid password: A value "   spaces   " is not trimmed',
  // );

  expect(
    SimplePassword.from(
      "waytooooooooooooooooolongpasswordwaytoolongpasswordwaytoolongpassword",
    ),
  ).toEqual(
    err({
      type: "SimplePassword",
      value:
        "waytooooooooooooooooolongpasswordwaytoolongpasswordwaytoolongpassword",
      parentError: {
        type: "MaxLength",
        value:
          "waytooooooooooooooooolongpasswordwaytoolongpasswordwaytoolongpassword",
        max: 64,
      },
    }),
  );

  expect(SimplePassword.fromUnknown("validPass123")).toEqual(
    ok("validPass123"),
  );
  expect(SimplePassword.fromUnknown("12345678")).toEqual(ok("12345678"));

  expect(SimplePassword.fromUnknown("short")).toEqual(
    err({
      type: "SimplePassword",
      value: "short",
      parentError: {
        type: "MinLength",
        value: "short",
        min: 8,
      },
    }),
  );

  expect(SimplePassword.fromUnknown("   spaces   ")).toEqual(
    err({
      type: "SimplePassword",
      value: "   spaces   ",
      parentError: { type: "Trimmed", value: "   spaces   " },
    }),
  );

  expect(SimplePassword.is("validPass123")).toBe(true);
  expect(SimplePassword.is("short")).toBe(false);
  expect(SimplePassword.is(12345)).toBe(false);

  expect(SimplePassword.name).toBe("Brand");
  expect(SimplePassword.brand).toBe("SimplePassword");

  expectTypeOf<typeof SimplePassword.Type>().toEqualTypeOf<
    string &
      Brand<"Trimmed"> &
      Brand<"MaxLength64"> &
      Brand<"MinLength8"> &
      Brand<"SimplePassword">
  >();
  expectTypeOf<typeof SimplePassword.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof SimplePassword.Error>().toEqualTypeOf<
    BrandWithoutRefineError<
      "SimplePassword",
      MinLengthError<8> | MaxLengthError<64> | TrimmedError | StringError
    >
  >();
  expectTypeOf<typeof SimplePassword.Parent>().toEqualTypeOf<
    string & Brand<"Trimmed"> & Brand<"MaxLength64"> & Brand<"MinLength8">
  >();
  expectTypeOf<typeof SimplePassword.ParentError>().toEqualTypeOf<never>();
});

test("id", () => {
  const UserId = id("User");
  type UserId = typeof UserId.Type;

  const validId = createId(testDeps);
  expect(UserId.from(validId)).toEqual(ok(validId));
  expect(UserId.fromParent(validId)).toEqual(ok(validId));
  expect(UserId.is(validId)).toBe(true);

  const invalidIdShort = "short";
  const invalidIdLong = "thisidistoolongforthevalidation";
  const invalidIdCharacters = "invalid!@#$%^&*()";

  expect(UserId.from(invalidIdShort)).toEqual(
    err({ type: "TableId", value: invalidIdShort, table: "User" }),
  );
  expect(UserId.from(invalidIdLong)).toEqual(
    err({ type: "TableId", value: invalidIdLong, table: "User" }),
  );
  expect(UserId.from(invalidIdCharacters)).toEqual(
    err({ type: "TableId", value: invalidIdCharacters, table: "User" }),
  );

  expect(UserId.name).toBe("Id");
  expect(UserId.table).toBe("User");
  expect(isType(UserId)).toBe(true);

  expectTypeOf<UserId>().toEqualTypeOf<string & Brand<"Id"> & Brand<"User">>();
  expectTypeOf<typeof UserId.Type>().toEqualTypeOf<
    string & Brand<"Id"> & Brand<"User">
  >();
  expectTypeOf<typeof UserId.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof UserId.Error>().toEqualTypeOf<TableIdError<"User">>();
  expectTypeOf<typeof UserId.Parent>().toEqualTypeOf<string>();
  expectTypeOf<typeof UserId.ParentError>().toEqualTypeOf<StringError>();

  const OrderId = id("Order");
  type OrderId = typeof OrderId.Type;
  expectTypeOf<UserId>().not.toEqualTypeOf<OrderId>();
});

test("createId", () => {
  const id = createId(testDeps);
  expect(id).toMatchInlineSnapshot(`"-7BOfTxCJQQifI1Bv_OErQ"`);

  const _todoId = createId<"Todo">(testDeps);

  expectTypeOf<typeof id>().toEqualTypeOf<Id>();
  expectTypeOf<typeof _todoId>().toEqualTypeOf<Id & Brand<"Todo">>();
});

test("createIdFromString", () => {
  const id = createIdFromString("abc");
  expect(Id.is(id)).toBe(true);
  expect(id).toMatchInlineSnapshot(`"ungWv48Bz-pBQUDeXa4iIw"`);

  const id1 = createIdFromString("user-api-123");
  const id2 = createIdFromString("user-api-123");
  const _todoId = createIdFromString<"Todo">("external-todo-456");

  expect(id1).toBe(id2); // Deterministic
  expectTypeOf<typeof id1>().toEqualTypeOf<Id>();
  expectTypeOf<typeof _todoId>().toEqualTypeOf<Id & Brand<"Todo">>();

  const emptyId = createIdFromString("");
  expect(Id.is(emptyId)).toBe(true);
  expect(emptyId).toHaveLength(22);

  const longString = "a".repeat(1000);
  const longId = createIdFromString(longString);
  expect(Id.is(longId)).toBe(true);
  expect(longId).toHaveLength(22);

  const specialId = createIdFromString("test!@#$%^&*()_+-={}[]|\\:;\"'<>?,./");
  expect(Id.is(specialId)).toBe(true);
  expect(specialId).toHaveLength(22);

  const unicodeId = createIdFromString("测试🚀💡");
  expect(Id.is(unicodeId)).toBe(true);
  expect(unicodeId).toHaveLength(22);

  const id3 = createIdFromString("test1");
  const id4 = createIdFromString("test2");
  expect(id3).not.toBe(id4);
});

test("IdBytes/idToIdBytes/idBytesToId", () => {
  const originalId = createId(testDeps);
  const idBytes = idToIdBytes(originalId);
  expect(IdBytes.is(idBytes)).toBe(true);
  expect(idBytesToId(idBytes)).toBe(originalId);
});

test("PositiveNumber", () => {
  expect(PositiveNumber.from(42)).toEqual(ok(42));
  expect(PositiveNumber.from(0)).toEqual(
    err<PositiveError>({ type: "Positive", value: 0 }),
  );
  expect(PositiveNumber.from(-1)).toEqual(
    err<NonNegativeError>({ type: "NonNegative", value: -1 }),
  );

  expect(PositiveNumber.is(42)).toBe(true);
  expect(PositiveNumber.is(-42)).toBe(false);
  expect(PositiveNumber.is(0)).toBe(false);

  expect(PositiveNumber.name).toBe("Brand");
  expect(PositiveNumber.brand).toBe("Positive");
});

test("NegativeNumber", () => {
  expect(NegativeNumber.from(-1)).toEqual(ok(-1));
  expect(NegativeNumber.from(0)).toEqual(
    err<NegativeError>({ type: "Negative", value: 0 }),
  );
  expect(NegativeNumber.from(1)).toEqual(
    err<NonPositiveError>({ type: "NonPositive", value: 1 }),
  );
});

test("NonPositiveNumber", () => {
  expect(NonPositiveNumber.from(0)).toEqual(ok(0));
  expect(NonPositiveNumber.from(-1)).toEqual(ok(-1));
  expect(NonPositiveNumber.from(1)).toEqual(
    err<NonPositiveError>({ type: "NonPositive", value: 1 }),
  );
});

test("NonNegativeNumber", () => {
  expect(NonNegativeNumber.from(0)).toEqual(ok(0));
  expect(NonNegativeNumber.from(1)).toEqual(ok(1));
  expect(NonNegativeNumber.from(-1)).toEqual(
    err<NonNegativeError>({ type: "NonNegative", value: -1 }),
  );
});

test("Int", () => {
  expect(Int.from(42)).toEqual(ok(42));
  expect(Int.from(42.5)).toEqual(err<IntError>({ type: "Int", value: 42.5 }));
  expectTypeOf<typeof Int.Type>().toEqualTypeOf<number & Brand<"Int">>();
});

test("greaterThanOrEqualTo", () => {
  const GreaterThanOrEqualTo10 = greaterThanOrEqualTo(10)(Number);
  expect(GreaterThanOrEqualTo10.from(10)).toEqual(ok(10));
  expect(GreaterThanOrEqualTo10.from(5)).toEqual(
    err({ type: "GreaterThanOrEqualTo", value: 5, min: 10 }),
  );
  expect(GreaterThanOrEqualTo10.name).toBe("Brand");
  expect(GreaterThanOrEqualTo10.brand).toBe("GreaterThanOrEqualTo10");
});

test("greaterThan", () => {
  const GreaterThan5 = greaterThan(5)(Number);
  expect(GreaterThan5.from(6)).toEqual(ok(6));
  expect(GreaterThan5.from(5)).toEqual(
    err({ type: "GreaterThan", value: 5, min: 5 }),
  );
  expect(GreaterThan5.name).toBe("Brand");
  expect(GreaterThan5.brand).toBe("GreaterThan5");
});

test("lessThan", () => {
  const LessThan10 = lessThan(10)(Number);
  expect(LessThan10.from(9)).toEqual(ok(9));
  expect(LessThan10.from(10)).toEqual(
    err({ type: "LessThan", value: 10, max: 10 }),
  );
  expect(LessThan10.name).toBe("Brand");
  expect(LessThan10.brand).toBe("LessThan10");
});

test("lessThanOrEqualTo", () => {
  const LessThanOrEqualTo10 = lessThanOrEqualTo(10)(Number);
  expect(LessThanOrEqualTo10.from(10)).toEqual(ok(10));
  expect(LessThanOrEqualTo10.from(11)).toEqual(
    err({ type: "LessThanOrEqualTo", value: 11, max: 10 }),
  );
  expect(LessThanOrEqualTo10.name).toBe("Brand");
  expect(LessThanOrEqualTo10.brand).toBe("LessThanOrEqualTo10");
});

test("NonNaNNumber", () => {
  expect(NonNaNNumber.from(42)).toEqual(ok(42));
  expect(NonNaNNumber.from(NaN)).toEqual(
    err<NonNaNError>({ type: "NonNaN", value: NaN }),
  );
});

test("FiniteNumber", () => {
  expect(FiniteNumber.from(42)).toEqual(ok(42));
  expect(FiniteNumber.from(Infinity)).toEqual(
    err<FiniteError>({ type: "Finite", value: Infinity }),
  );
  expectTypeOf<typeof FiniteNumber.Type>().toEqualTypeOf<
    number & Brand<"Finite">
  >();
});

test("multipleOf", () => {
  const MultipleOf3 = multipleOf(3)(Number);

  expect(MultipleOf3.from(9)).toEqual(ok(9));
  expect(MultipleOf3.from(10)).toEqual(
    err<MultipleOfError<3>>({ type: "MultipleOf", value: 10, divisor: 3 }),
  );

  expect(MultipleOf3.name).toBe("Brand");
  expect(MultipleOf3.brand).toBe("MultipleOf3");
});

test("Between1And10", () => {
  const result = Between1And10.from(5);
  expect(result).toEqual(ok(5));

  const tooLow = Between1And10.from(0);
  expect(tooLow).toEqual(err({ type: "Between", value: 0, min: 1, max: 10 }));

  const tooHigh = Between1And10.from(11);
  expect(tooHigh).toEqual(err({ type: "Between", value: 11, min: 1, max: 10 }));

  expect(Between1And10.is(7)).toBe(true);
  expect(Between1And10.is(0)).toBe(false);
  expect(Between1And10.is(11)).toBe(false);
});

test("literal", () => {
  const LiteralHello = literal("Hello");
  const Literal42 = literal(42);
  const LiteralTrue = literal(true);
  const LiteralNull = literal(null);

  expect(LiteralHello.from("Hello")).toEqual(ok("Hello"));
  expect(Literal42.from(42)).toEqual(ok(42));
  expect(LiteralTrue.from(true)).toEqual(ok(true));
  expect(LiteralNull.from(null)).toEqual(ok(null));

  expect(LiteralHello.from("World")).toEqual(
    err({ type: "Literal", value: "World", expected: "Hello" }),
  );
  expect(Literal42.from(43)).toEqual(
    err({ type: "Literal", value: 43, expected: 42 }),
  );
  expect(LiteralTrue.from(false)).toEqual(
    err({ type: "Literal", value: false, expected: true }),
  );
  expect(LiteralNull.fromUnknown(undefined)).toEqual(
    err({ type: "Literal", value: undefined, expected: null }),
  );

  expectTypeOf<typeof LiteralHello.Type>().toEqualTypeOf<"Hello">();
  expectTypeOf<typeof LiteralHello.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof LiteralHello.Error>().toEqualTypeOf<
    LiteralError<"Hello">
  >();
  expectTypeOf<typeof LiteralHello.Parent>().toEqualTypeOf<"Hello">();
  expectTypeOf<typeof LiteralHello.ParentError>().toEqualTypeOf<
    LiteralError<"Hello">
  >();

  expectTypeOf<typeof Literal42.Type>().toEqualTypeOf<42>();
  expectTypeOf<typeof Literal42.Input>().toEqualTypeOf<number>();
  expectTypeOf<typeof Literal42.Error>().toEqualTypeOf<LiteralError<42>>();
  expectTypeOf<typeof Literal42.Parent>().toEqualTypeOf<42>();
  expectTypeOf<typeof Literal42.ParentError>().toEqualTypeOf<
    LiteralError<42>
  >();

  expect(LiteralHello.is("Hello")).toBe(true);
  expect(LiteralHello.is("World")).toBe(false);
  expect(LiteralHello.name).toBe(`Literal`);
  expect(LiteralHello.expected).toBe(`Hello`);

  expect(Literal42.is(42)).toBe(true);
  expect(Literal42.is(43)).toBe(false);
  expect(Literal42.name).toBe(`Literal`);
  expect(LiteralTrue.is(true)).toBe(true);
  expect(LiteralTrue.is(false)).toBe(false);
  expect(LiteralTrue.name).toBe(`Literal`);

  const _BT = literal("a" as NonEmptyString);
  expectTypeOf<typeof _BT.Type>().toEqualTypeOf<string & Brand<"MinLength1">>();
  expectTypeOf<typeof _BT.Input>().toEqualTypeOf<string>();
});

test("array", () => {
  const NumberArray = array(Number);

  expect(NumberArray.element).toBe(Number);

  expect(NumberArray.from([1, 2, 3])).toEqual(ok([1, 2, 3]));

  expect(NumberArray.fromUnknown(["a", 2, 3])).toEqual(
    err<ArrayError<any>>({
      type: "Array",
      value: ["a", 2, 3],
      reason: {
        kind: "Element",
        index: 0,
        error: { type: "Number", value: "a" },
      },
    }),
  );

  expect(NumberArray.fromUnknown("not an array")).toEqual(
    err<ArrayError<any>>({
      type: "Array",
      value: "not an array",
      reason: { kind: "NotArray" },
    }),
  );

  expect(NumberArray.from([])).toEqual(ok([]));

  expect(NumberArray.fromParent([4, 5, 6])).toEqual(ok([4, 5, 6]));

  expectTypeOf<typeof NumberArray.Type>().toEqualTypeOf<
    ReadonlyArray<number>
  >();
  expectTypeOf<typeof NumberArray.Input>().toEqualTypeOf<
    ReadonlyArray<number>
  >();
  expectTypeOf<typeof NumberArray.Error>().toEqualTypeOf<
    ArrayError<NumberError>
  >();
  expectTypeOf<typeof NumberArray.Parent>().toEqualTypeOf<
    ReadonlyArray<number>
  >();
  expectTypeOf<typeof NumberArray.ParentError>().toEqualTypeOf<
    ArrayError<NumberError>
  >();

  const StringArray = array(String);

  expect(StringArray.from(["a", "b", "c"])).toEqual(ok(["a", "b", "c"]));

  expect(StringArray.fromUnknown([1, "b", "c"])).toEqual(
    err<ArrayError<any>>({
      type: "Array",
      value: [1, "b", "c"],
      reason: {
        kind: "Element",
        index: 0,
        error: { type: "String", value: 1 },
      },
    }),
  );

  expect(NumberArray.is([1, 2, 3])).toBe(true);
  expect(NumberArray.is(["a", 2, 3])).toBe(false);
  expect(NumberArray.is("not an array")).toBe(false);

  expect(NumberArray.name).toBe("Array");

  const TrimmedStringArray = array(TrimmedString);
  expect(TrimmedStringArray.element).toBe(TrimmedString);

  expect(TrimmedStringArray.from(["hello", "world"])).toEqual(
    ok(["hello", "world"]),
  );

  expect(TrimmedStringArray.from([" hello", "world"])).toEqual(
    err<ArrayError<TrimmedError>>({
      type: "Array",
      value: [" hello", "world"],
      reason: {
        kind: "Element",
        index: 0,
        error: { type: "Trimmed", value: " hello" },
      },
    }),
  );

  expect(
    TrimmedStringArray.fromParent([
      "test",
      "trimmed",
    ] as unknown as ReadonlyArray<TrimmedString>),
  ).toEqual(ok(["test", "trimmed"]));

  expect(
    TrimmedStringArray.fromParent([
      "valid",
      " invalid",
    ] as unknown as ReadonlyArray<TrimmedString>),
  ).toEqual(
    err<ArrayError<TrimmedError>>({
      type: "Array",
      value: ["valid", " invalid"],
      reason: {
        kind: "Element",
        index: 1,
        error: { type: "Trimmed", value: " invalid" },
      },
    }),
  );

  expect(TrimmedStringArray.is(["trimmed", "values"])).toBe(true);
  expect(TrimmedStringArray.is([" not trimmed", "values"])).toBe(false);
  expect(TrimmedStringArray.is("not an array")).toBe(false);

  expect(TrimmedStringArray.from([])).toEqual(ok([]));

  expect(TrimmedStringArray.name).toBe("Array");

  expectTypeOf<typeof TrimmedStringArray.Type>().toEqualTypeOf<
    ReadonlyArray<TrimmedString>
  >();
  expectTypeOf<typeof TrimmedStringArray.Input>().toEqualTypeOf<
    ReadonlyArray<string>
  >();
  expectTypeOf<typeof TrimmedStringArray.Error>().toEqualTypeOf<
    ArrayError<TrimmedError>
  >();
  expectTypeOf<typeof TrimmedStringArray.Parent>().toEqualTypeOf<
    ReadonlyArray<string>
  >();
  expectTypeOf<typeof TrimmedStringArray.ParentError>().toEqualTypeOf<
    ArrayError<StringError>
  >();
});

test("record", () => {
  const StringToNumber = record(String, Number);

  expect(StringToNumber.from({ a: 1, b: 2 })).toEqual(ok({ a: 1, b: 2 }));
  expect(StringToNumber.fromUnknown({ a: "not a number", b: 2 })).toEqual(
    err({
      type: "Record",
      value: { a: "not a number", b: 2 },
      reason: {
        kind: "Value",
        key: "a",
        error: { type: "Number", value: "not a number" },
      },
    }),
  );
  expect(StringToNumber.fromUnknown(42)).toEqual(
    err({
      type: "Record",
      value: 42,
      reason: { kind: "NotRecord" },
    }),
  );
  expect(StringToNumber.fromParent({ a: 1, b: 2 })).toEqual(ok({ a: 1, b: 2 }));
  expect(StringToNumber.is({ a: 1, b: 2 })).toBe(true);
  expect(StringToNumber.is({ a: "1", b: 2 })).toBe(false);
  expect(StringToNumber.is(42)).toBe(false);
  expect(StringToNumber.name).toBe("Record");
  expect(isType(StringToNumber)).toBe(true);

  expectTypeOf<typeof StringToNumber.Type>().toEqualTypeOf<
    Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof StringToNumber.Input>().toEqualTypeOf<
    Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof StringToNumber.Error>().toEqualTypeOf<
    RecordError<StringError, NumberError>
  >();
  expectTypeOf<typeof StringToNumber.Parent>().toEqualTypeOf<
    Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof StringToNumber.ParentError>().toEqualTypeOf<
    RecordError<StringError, NumberError>
  >();

  const NonEmptyStringToNumber = record(NonEmptyString, Number);

  expect(NonEmptyStringToNumber.from({ key: 42 })).toEqual(ok({ key: 42 }));
  expect(NonEmptyStringToNumber.fromUnknown({ "": 42 })).toEqual(
    err({
      type: "Record",
      value: { "": 42 },
      reason: {
        kind: "Key",
        key: "",
        error: { type: "MinLength", value: "", min: 1 },
      },
    }),
  );
  expect(NonEmptyStringToNumber.fromUnknown({ key: "not a number" })).toEqual(
    err({
      type: "Record",
      value: { key: "not a number" },
      reason: {
        kind: "Value",
        key: "key",
        error: { type: "Number", value: "not a number" },
      },
    }),
  );
  expect(NonEmptyStringToNumber.fromParent({ key: 42 })).toEqual(
    ok({ key: 42 }),
  );
  expect(NonEmptyStringToNumber.is({ key: 42 })).toBe(true);
  expect(NonEmptyStringToNumber.is({ "": 42 })).toBe(false);
  expect(NonEmptyStringToNumber.is({ key: "not a number" })).toBe(false);

  expectTypeOf<typeof NonEmptyStringToNumber.Type>().toEqualTypeOf<
    Readonly<Record<NonEmptyString, number>>
  >();
  expectTypeOf<typeof NonEmptyStringToNumber.Input>().toEqualTypeOf<
    Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof NonEmptyStringToNumber.Error>().toEqualTypeOf<
    RecordError<MinLengthError<1>, NumberError>
  >();
  expectTypeOf<typeof NonEmptyStringToNumber.Parent>().toEqualTypeOf<
    Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof NonEmptyStringToNumber.ParentError>().toEqualTypeOf<
    RecordError<StringError, NumberError>
  >();
});

test("object", () => {
  const User = object({
    name: NonEmptyString,
    age: PositiveNumber,
  });

  expect(User.from({ name: "Alice", age: 30 })).toEqual(
    ok({ name: "Alice", age: 30 }),
  );
  expect(User.from({ name: "", age: 30 })).toEqual(
    err({
      type: "Object",
      value: { name: "", age: 30 },
      reason: {
        kind: "Props",
        errors: {
          name: { type: "MinLength", value: "", min: 1 },
        },
      },
    }),
  );
  expect(User.from({ name: "Alice", age: -1 })).toEqual(
    err({
      type: "Object",
      value: { name: "Alice", age: -1 },
      reason: {
        kind: "Props",
        errors: {
          age: { type: "NonNegative", value: -1 },
        },
      },
    }),
  );
  expect(User.fromUnknown("not an object")).toEqual(
    err({
      type: "Object",
      value: "not an object",
      reason: { kind: "NotObject" },
    }),
  );

  expect(User.name).toBe("Object");
  expect(User.is({ name: "Alice", age: 30 })).toBe(true);
  expect(User.is({ name: "Alice" })).toBe(false);

  expectTypeOf<typeof User.Type>().toEqualTypeOf<{
    readonly name: NonEmptyString;
    readonly age: PositiveNumber;
  }>();
  expectTypeOf<typeof User.Input>().toEqualTypeOf<{
    readonly name: string;
    readonly age: number;
  }>();
  expectTypeOf<typeof User.Error>().toEqualTypeOf<
    ObjectError<{
      name: MinLengthError<1>;
      age: PositiveError;
    }>
  >();
  expectTypeOf<typeof User.Parent>().toEqualTypeOf<{
    readonly name: string;
    readonly age: NonNegativeNumber;
  }>();
  expectTypeOf<typeof User.ParentError>().toEqualTypeOf<
    ObjectError<{
      name: StringError;
      age: NonNegativeError | NumberError;
    }>
  >();

  const StrictUser = object({ name: NonEmptyString, age: PositiveNumber });

  expect(
    StrictUser.fromUnknown({ name: "Alice", age: 30, extraKey: "value" }),
  ).toEqual(
    err({
      type: "Object",
      value: { name: "Alice", age: 30, extraKey: "value" },
      reason: {
        kind: "ExtraKeys",
        extraKeys: ["extraKey"],
      },
    }),
  );

  expect(StrictUser.from({ name: "Alice", age: 30 })).toEqual(
    ok({ name: "Alice", age: 30 }),
  );

  expectTypeOf<typeof StrictUser.Type>().toEqualTypeOf<{
    readonly name: NonEmptyString;
    readonly age: PositiveNumber;
  }>();
  expectTypeOf<typeof StrictUser.Input>().toEqualTypeOf<{
    readonly name: string;
    readonly age: number;
  }>();
  expectTypeOf<typeof StrictUser.Error>().toEqualTypeOf<
    ObjectError<{
      name: MinLengthError<1>;
      age: PositiveError;
    }>
  >();
  expectTypeOf<typeof StrictUser.Parent>().toEqualTypeOf<{
    readonly name: string;
    readonly age: NonNegativeNumber;
  }>();
  expectTypeOf<typeof StrictUser.ParentError>().toEqualTypeOf<
    ObjectError<{
      name: StringError;
      age: NonNegativeError | NumberError;
    }>
  >();

  const NumberDictionary = object({ length: Number }, record(String, Number));

  expect(
    NumberDictionary.from({ length: 3, key1: 1, key2: 2, key3: 3 }),
  ).toEqual(ok({ length: 3, key1: 1, key2: 2, key3: 3 }));

  expect(
    NumberDictionary.fromUnknown({ length: "not a number", key1: 1 }),
  ).toEqual(
    err({
      type: "ObjectWithRecord",
      value: { length: "not a number", key1: 1 },
      reason: {
        kind: "Props",
        errors: {
          length: { type: "Number", value: "not a number" },
        },
      },
    }),
  );

  expect(
    NumberDictionary.fromUnknown({ length: 3, key1: "not a number" }),
  ).toEqual(
    err({
      type: "ObjectWithRecord",
      value: { length: 3, key1: "not a number" },
      reason: {
        kind: "IndexValue",
        key: "key1",
        error: { type: "Number", value: "not a number" },
      },
    }),
  );

  expect(NumberDictionary.fromUnknown(42)).toEqual(
    err({
      type: "ObjectWithRecord",
      value: 42,
      reason: { kind: "NotObject" },
    }),
  );

  expect(NumberDictionary.is({ length: 3, key1: 1, key2: 2 })).toBe(true);
  expect(NumberDictionary.is({ length: "not a number", key1: 1 })).toBe(false);

  expect(NumberDictionary.name).toBe("ObjectWithRecord");

  expectTypeOf<typeof NumberDictionary.Type>().toEqualTypeOf<
    { readonly length: number } & Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof NumberDictionary.Input>().toEqualTypeOf<
    { readonly length: number } & Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof NumberDictionary.Error>().toEqualTypeOf<
    ObjectWithRecordError<{ length: NumberError }, StringError, NumberError>
  >();
  expectTypeOf<typeof NumberDictionary.Parent>().toEqualTypeOf<
    { readonly length: number } & Readonly<Record<string, number>>
  >();
  expectTypeOf<typeof NumberDictionary.ParentError>().toEqualTypeOf<
    ObjectWithRecordError<{ length: NumberError }, StringError, NumberError>
  >();
});

test("union", () => {
  const StringOrNumber = union(String, Number);

  expect(StringOrNumber.from("Hello")).toEqual(ok("Hello"));
  expect(StringOrNumber.from(42)).toEqual(ok(42));

  expect(StringOrNumber.fromUnknown(true)).toEqual(
    err<UnionError<StringError | NumberError>>({
      type: "Union",
      value: true,
      errors: [
        { type: "String", value: true },
        { type: "Number", value: true },
      ],
    }),
  );

  expect(StringOrNumber.is("Hello")).toBe(true);
  expect(StringOrNumber.is(42)).toBe(true);
  expect(StringOrNumber.is(true)).toBe(false);

  expect(StringOrNumber.name).toBe("Union");

  expectTypeOf<typeof StringOrNumber.Type>().toEqualTypeOf<string | number>();
  expectTypeOf<typeof StringOrNumber.Error>().toEqualTypeOf<
    UnionError<StringError | NumberError>
  >();
  expectTypeOf<typeof StringOrNumber.Input>().toEqualTypeOf<string | number>();
  expectTypeOf<typeof StringOrNumber.Parent>().toEqualTypeOf<string | number>();
  expectTypeOf<typeof StringOrNumber.ParentError>().toEqualTypeOf<never>();

  // Nested union
  const StringOrNumberOrBoolean = union(StringOrNumber, literal(true));

  expect(StringOrNumberOrBoolean.from("Hello")).toEqual(ok("Hello"));
  expect(StringOrNumberOrBoolean.from(42)).toEqual(ok(42));
  expect(StringOrNumberOrBoolean.from(true)).toEqual(ok(true));
  expect(StringOrNumberOrBoolean.from(false)).toEqual(
    err({
      type: "Union",
      value: false,
      errors: [
        {
          type: "Union",
          value: false,
          errors: [
            { type: "String", value: false },
            { type: "Number", value: false },
          ],
        },
        { type: "Literal", value: false, expected: true },
      ],
    }),
  );

  expect(StringOrNumberOrBoolean.name).toBe("Union");

  // Type inference checks for nested union
  expectTypeOf<typeof StringOrNumberOrBoolean.Type>().toEqualTypeOf<
    string | number | true
  >();
  expectTypeOf<typeof StringOrNumberOrBoolean.Error>().toEqualTypeOf<
    UnionError<UnionError<StringError | NumberError> | LiteralError<true>>
  >();

  const aOrB = union("a", "b");
  expect(aOrB.from("a")).toEqual(ok("a"));
  expect(aOrB.from("b")).toEqual(ok("b"));
  expect(aOrB.from("c")).toEqual(
    err({
      type: "Union",
      value: "c",
      errors: [
        { type: "Literal", value: "c", expected: "a" },
        { type: "Literal", value: "c", expected: "b" },
      ],
    }),
  );

  expect(aOrB.is("a")).toBe(true);
  expect(aOrB.is("b")).toBe(true);
  expect(aOrB.is("c")).toBe(false);

  expect(aOrB.name).toBe("Union");

  expectTypeOf<typeof aOrB.Type>().toEqualTypeOf<"a" | "b">();
  expectTypeOf<typeof aOrB.Error>().toEqualTypeOf<
    UnionError<LiteralError<"a"> | LiteralError<"b">>
  >();
  expectTypeOf<typeof aOrB.Input>().toEqualTypeOf<string>();

  const aOrBFromArray = union(...(["a", "b"] as const));

  expect(aOrBFromArray.from("a")).toEqual(ok("a"));
  expect(aOrBFromArray.from("b")).toEqual(ok("b"));
  expect(aOrBFromArray.from("c")).toEqual(
    err({
      type: "Union",
      value: "c",
      errors: [
        { type: "Literal", value: "c", expected: "a" },
        { type: "Literal", value: "c", expected: "b" },
      ],
    }),
  );

  expect(aOrBFromArray.is("a")).toBe(true);
  expect(aOrBFromArray.is("b")).toBe(true);
  expect(aOrBFromArray.is("c")).toBe(false);

  expect(aOrBFromArray.name).toBe("Union");

  expectTypeOf<typeof aOrBFromArray.Type>().toEqualTypeOf<"a" | "b">();
  expectTypeOf<typeof aOrBFromArray.Error>().toEqualTypeOf<
    UnionError<LiteralError<"a"> | LiteralError<"b">>
  >();
  expectTypeOf<typeof aOrBFromArray.Input>().toEqualTypeOf<string>();

  // @ts-expect-error Expected at least 2 arguments, but got 1.
  union("a");

  // @ts-expect-error Expected at least 2 arguments, but got 1.
  union(String);
});

test("recursive", () => {
  interface Category {
    readonly name: string;
    readonly subcategories: ReadonlyArray<Category>;
  }

  interface CategoryInput {
    readonly name: string;
    readonly subcategories: ReadonlyArray<CategoryInput>;
  }

  type CategoryError = ObjectError<{
    readonly name: typeof String.Error;
    readonly subcategories: ArrayError<CategoryError>;
  }>;

  const Category = recursive(
    (): Type<"Object", Category, CategoryInput, CategoryError> =>
      object({
        name: String,
        subcategories: array(Category),
      }),
  );

  expect(Category.name).toBe(`Recursive`);
  expect(Category.getParentType().name).toBe("Object");

  expect(isType(Category)).toBe(true);

  const validCategory = {
    name: "Main Category",
    subcategories: [
      {
        name: "Subcategory 1",
        subcategories: [],
      },
      {
        name: "Subcategory 2",
        subcategories: [
          {
            name: "Nested Subcategory",
            subcategories: [],
          },
        ],
      },
    ],
  };

  const validResult = Category.from(validCategory);
  expect(validResult.ok).toBe(true);
  if (validResult.ok) {
    expect(validResult.value).toEqual(validCategory);
  }

  expect(Category.name).toBe("Recursive");

  const invalidResult1 = Category.fromUnknown({ name: 123, subcategories: [] });
  expect(invalidResult1).toEqual(
    err({
      type: "Object",
      value: { name: 123, subcategories: [] },
      reason: {
        kind: "Props",
        errors: {
          name: { type: "String", value: 123 },
        },
      },
    }),
  );
});

test("nullOr", () => {
  const NullOrString = nullOr(String);

  expect(NullOrString.from("hello")).toEqual(ok("hello"));
  expect(NullOrString.from(null)).toEqual(ok(null));
  expect(NullOrString.fromUnknown(42)).toEqual(
    err({
      type: "Union",
      value: 42,
      errors: [
        { type: "Null", value: 42 },
        { type: "String", value: 42 },
      ],
    }),
  );

  expect(NullOrString.is("hello")).toBe(true);
  expect(NullOrString.is(null)).toBe(true);
  expect(NullOrString.is(42)).toBe(false);

  expect(NullOrString.name).toBe("Union");

  expectTypeOf<typeof NullOrString.Type>().toEqualTypeOf<string | null>();
  expectTypeOf<typeof NullOrString.Error>().toEqualTypeOf<
    UnionError<NullError | StringError>
  >();
  expectTypeOf<typeof NullOrString.Input>().toEqualTypeOf<string | null>();
  expectTypeOf<typeof NullOrString.Parent>().toEqualTypeOf<string | null>();
  expectTypeOf<typeof NullOrString.ParentError>().toEqualTypeOf<never>();
});

test("undefinedOr", () => {
  const UndefinedOrString = undefinedOr(String);

  expect(UndefinedOrString.from("world")).toEqual(ok("world"));
  expect(UndefinedOrString.from(undefined)).toEqual(ok());
  expect(UndefinedOrString.fromUnknown(42)).toEqual(
    err({
      type: "Union",
      value: 42,
      errors: [
        { type: "Undefined", value: 42 },
        { type: "String", value: 42 },
      ],
    }),
  );

  expect(UndefinedOrString.is("world")).toBe(true);
  expect(UndefinedOrString.is(undefined)).toBe(true);
  expect(UndefinedOrString.is(42)).toBe(false);

  expect(UndefinedOrString.name).toBe("Union");

  expectTypeOf<typeof UndefinedOrString.Type>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<typeof UndefinedOrString.Error>().toEqualTypeOf<
    UnionError<UndefinedError | StringError>
  >();
  expectTypeOf<typeof UndefinedOrString.Input>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<typeof UndefinedOrString.Parent>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<typeof UndefinedOrString.ParentError>().toEqualTypeOf<never>();
});

test("nullishOr", () => {
  const NullishString = nullishOr(String);

  expect(NullishString.from("test")).toEqual(ok("test"));
  expect(NullishString.from(null)).toEqual(ok(null));
  expect(NullishString.from(undefined)).toEqual(ok());
  expect(NullishString.fromUnknown(42)).toEqual(
    err({
      type: "Union",
      value: 42,
      errors: [
        { type: "Undefined", value: 42 },
        { type: "Null", value: 42 },
        { type: "String", value: 42 },
      ],
    }),
  );

  expect(NullishString.is("test")).toBe(true);
  expect(NullishString.is(null)).toBe(true);
  expect(NullishString.is(undefined)).toBe(true);
  expect(NullishString.is(42)).toBe(false);

  expect(NullishString.name).toBe("Union");

  expectTypeOf<typeof NullishString.Type>().toEqualTypeOf<
    string | null | undefined
  >();
  expectTypeOf<typeof NullishString.Error>().toEqualTypeOf<
    UnionError<NullError | UndefinedError | StringError>
  >();
  expectTypeOf<typeof NullishString.Input>().toEqualTypeOf<
    string | null | undefined
  >();
  expectTypeOf<typeof NullishString.Parent>().toEqualTypeOf<
    string | null | undefined
  >();
  expectTypeOf<typeof NullishString.ParentError>().toEqualTypeOf<never>();
});

test("tuple", () => {
  const TupleOfStringAndNumber = tuple(String, Number);

  expect(TupleOfStringAndNumber.from(["hello", 42])).toEqual(ok(["hello", 42]));

  expect(TupleOfStringAndNumber.fromUnknown(["hello", "world"])).toEqual(
    err({
      type: "Tuple",
      value: ["hello", "world"],
      reason: {
        kind: "Element",
        index: 1,
        error: { type: "Number", value: "world" },
      },
    }),
  );

  expect(TupleOfStringAndNumber.fromUnknown(["hello"])).toEqual(
    err({
      type: "Tuple",
      value: ["hello"],
      reason: { kind: "InvalidLength", expected: 2 },
    }),
  );

  expect(TupleOfStringAndNumber.fromUnknown(["hello", 42, true])).toEqual(
    err({
      type: "Tuple",
      value: ["hello", 42, true],
      reason: { kind: "InvalidLength", expected: 2 },
    }),
  );

  expect(TupleOfStringAndNumber.fromUnknown(["test", 123])).toEqual(
    ok(["test", 123]),
  );

  expect(TupleOfStringAndNumber.fromUnknown([123, "test"])).toEqual(
    err({
      type: "Tuple",
      value: [123, "test"],
      reason: {
        kind: "Element",
        index: 0,
        error: { type: "String", value: 123 },
      },
    }),
  );

  expect(TupleOfStringAndNumber.is(["hello", 42])).toBe(true);
  expect(TupleOfStringAndNumber.is(["hello", "world"])).toBe(false);

  expect(TupleOfStringAndNumber.name).toBe("Tuple");

  expectTypeOf<typeof TupleOfStringAndNumber.Type>().toEqualTypeOf<
    readonly [string, number]
  >();
  expectTypeOf<typeof TupleOfStringAndNumber.Input>().toEqualTypeOf<
    readonly [string, number]
  >();
  expectTypeOf<typeof TupleOfStringAndNumber.Error>().toEqualTypeOf<
    TupleError<StringError | NumberError>
  >();
  expectTypeOf<typeof TupleOfStringAndNumber.Parent>().toEqualTypeOf<
    readonly [string, number]
  >();
  expectTypeOf<typeof TupleOfStringAndNumber.ParentError>().toEqualTypeOf<
    TupleError<StringError | NumberError>
  >();

  const NestedTuple = tuple(String, array(Number), undefinedOr(Boolean));
  expect(NestedTuple.from(["text", [1, 2, 3], true])).toEqual(
    ok(["text", [1, 2, 3], true]),
  );

  expect(NestedTuple.fromUnknown(["text", [1, 2, "invalid"], true])).toEqual(
    err({
      type: "Tuple",
      value: ["text", [1, 2, "invalid"], true],
      reason: {
        kind: "Element",
        index: 1,
        error: {
          type: "Array",
          value: [1, 2, "invalid"],
          reason: {
            kind: "Element",
            index: 2,
            error: { type: "Number", value: "invalid" },
          },
        },
      },
    }),
  );

  expect(NestedTuple.name).toBe("Tuple");
  expectTypeOf<typeof NestedTuple.Type>().toEqualTypeOf<
    readonly [string, ReadonlyArray<number>, boolean | undefined]
  >();

  const _BrandedTuple = tuple(NonEmptyTrimmedString, PositiveNumber);
  expectTypeOf<typeof _BrandedTuple.Type>().toEqualTypeOf<
    readonly [
      string & Brand<"Trimmed"> & Brand<"MinLength1">,
      number & Brand<"Positive"> & Brand<"NonNegative">,
    ]
  >();
});

test("JsonValue", () => {
  const validJsonValues = [
    null,
    true,
    false,
    0,
    42,
    -1,
    "",
    "string",
    [],
    [1, "string", false, null],
    {},
    { key: "value", nested: { number: 42, array: [1, 2, 3] } },
  ];

  for (const value of validJsonValues) {
    expect(JsonValue.from(value)).toEqual(ok(value));
    expect(JsonValue.is(value)).toBe(true);
  }

  const invalidJsonValues = [
    undefined,
    constVoid,
    Symbol("symbol"),
    BigInt(123),
    { circular: undefined },
  ];

  for (const value of invalidJsonValues) {
    expect(JsonValue.is(value)).toBe(false);
  }

  expect(JsonValue.name).toBe("Recursive");

  expectTypeOf<typeof JsonValue.Type>().toEqualTypeOf<JsonValue>();
  expectTypeOf<typeof JsonValue.Input>().toEqualTypeOf<JsonValueInput>();
  expectTypeOf<typeof JsonValue.Error>().toEqualTypeOf<
    UnionError<
      | StringError
      | FiniteError
      | NumberError
      | BooleanError
      | NullError
      | ArrayError<JsonValueError>
      | RecordError<StringError, JsonValueError>
    >
  >();
  expectTypeOf<typeof JsonValue.Parent>().toEqualTypeOf<
    | string
    | number
    | boolean
    | ReadonlyArray<JsonValueInput>
    | Readonly<Record<string, JsonValueInput>>
    | null
  >();
  expectTypeOf<typeof JsonValue.ParentError>().toEqualTypeOf<never>();
});

test("JsonArray", () => {
  const validJsonArrays = [
    [],
    [1, "string", false, null],
    [{ key: "value" }, [42, "nested"]],
    [{ nestedArray: [1, 2, 3], nestedObject: { key: "value" } }],
  ];

  for (const validArray of validJsonArrays) {
    expect(JsonArray.from(validArray)).toEqual(ok(validArray));
    expect(JsonArray.is(validArray)).toBe(true);
  }

  const invalidJsonArrays = [
    undefined,
    constVoid,
    Symbol("symbol"),
    BigInt(123),
    { key: "value" },
    ["valid", undefined],
    [1, "string", constVoid],
    [{ circular: undefined }],
  ];

  for (const invalidArray of invalidJsonArrays) {
    expect(JsonArray.fromUnknown(invalidArray).ok).toBe(false);
    expect(JsonArray.is(invalidArray)).toBe(false);
  }

  expect(JsonArray.name).toBe("Array");

  expectTypeOf<typeof JsonArray.Type>().toEqualTypeOf<JsonArray>();
  expectTypeOf<typeof JsonArray.Input>().toEqualTypeOf<
    ReadonlyArray<JsonValueInput>
  >();
  expectTypeOf<typeof JsonArray.Error>().toEqualTypeOf<
    ArrayError<JsonValueError>
  >();
  expectTypeOf<typeof JsonArray.Parent>().toEqualTypeOf<
    ReadonlyArray<
      | string
      | number
      | boolean
      | ReadonlyArray<JsonValueInput>
      | Readonly<Record<string, JsonValueInput>>
      | null
    >
  >();
  expectTypeOf<typeof JsonArray.ParentError>().toEqualTypeOf<
    ArrayError<never>
  >();
});

test("JsonObject", () => {
  const JsonObject = record(String, JsonValue);

  const validJsonObjects = [
    {},
    { key: "value" },
    { number: 42, boolean: true, nullValue: null },
    { nestedObject: { key: "value" }, nestedArray: [1, 2, 3] },
    {
      deeplyNested: {
        array: [1, { nestedKey: "nestedValue" }, null],
        anotherObject: { key: "value", flag: false },
      },
    },
  ];

  for (const validObject of validJsonObjects) {
    expect(JsonObject.from(validObject)).toEqual(ok(validObject));
    expect(JsonObject.is(validObject)).toBe(true);
  }

  const invalidJsonObjects = [
    undefined,
    null,
    [],
    ["not", "an", "object"],
    42,
    "string",
    BigInt(123),
    constVoid,
    { key: undefined }, // Undefined is not a valid JsonValue
    { validKey: "value", invalidKey: undefined }, // Mixed validity
    { key: Symbol("symbol") }, // Symbol is not valid
    { circular: undefined }, // Undefined inside the object
  ];

  for (const invalidObject of invalidJsonObjects) {
    expect(JsonObject.fromUnknown(invalidObject).ok).toBe(false);
    expect(JsonObject.is(invalidObject)).toBe(false);
  }

  expect(JsonObject.name).toBe("Record");

  expectTypeOf<typeof JsonObject.Type>().toEqualTypeOf<
    Readonly<Record<string, JsonValue>>
  >();
  expectTypeOf<typeof JsonObject.Input>().toEqualTypeOf<
    Readonly<Record<string, JsonValueInput>>
  >();
  expectTypeOf<typeof JsonObject.Error>().toEqualTypeOf<
    RecordError<StringError, JsonValueError>
  >();
  expectTypeOf<typeof JsonObject.Parent>().toEqualTypeOf<
    Readonly<Record<string, JsonValueInput>>
  >();
  expectTypeOf<typeof JsonObject.ParentError>().toEqualTypeOf<
    RecordError<StringError, never>
  >();
});

test("Json", () => {
  expect(Json.from("{}")).toEqual(ok("{}"));
  expect(Json.from(`{"key":"value"}`)).toEqual(ok(`{"key":"value"}`));
  expect(Json.from(`[1,2,3]`)).toEqual(ok(`[1,2,3]`));
  expect(Json.from(`"string"`)).toEqual(ok(`"string"`));
  expect(Json.from(`42`)).toEqual(ok(`42`));
  expect(Json.from(`null`)).toEqual(ok(`null`));
  expect(Json.from(`true`)).toEqual(ok(`true`));
  expect(Json.from(`false`)).toEqual(ok(`false`));

  expect(Json.from(`{"key":}`)).toEqual(
    err({
      type: "Json",
      value: `{"key":}`,
      message: `SyntaxError: Unexpected token '}', "{"key":}" is not valid JSON`,
    }),
  );

  expect(Json.is("{}")).toBe(true);
  expect(Json.is(`{"key":"value"}`)).toBe(true);
  expect(Json.is(`not-json`)).toBe(false);
  expect(Json.is(42)).toBe(false);
  expect(Json.is(null)).toBe(false);

  expect(Json.name).toBe("Brand");
  expect(Json.brand).toBe("Json");

  expectTypeOf<typeof Json.Type>().toEqualTypeOf<string & Brand<"Json">>();
  expectTypeOf<typeof Json.Input>().toEqualTypeOf<string>();
  expectTypeOf<typeof Json.Error>().toEqualTypeOf<JsonError>();
});

test("Json normalization edge cases", () => {
  // These JSON strings are valid but get normalized during parse/stringify
  const normalizedCases = [
    { input: "-0E0", expected: "0" },
    { input: "-0e0", expected: "0" },
    { input: "1E1", expected: "10" },
    { input: "1e+1", expected: "10" },
    { input: "1.0000", expected: "1" },
    { input: "0.10000", expected: "0.1" },
  ];

  for (const { input, expected } of normalizedCases) {
    // Verify the input is valid JSON
    expect(Json.from(input)).toEqual(ok(input));

    // Demonstrate the normalization behavior
    const parsed = JSON.parse(input) as unknown;
    const roundTripped = JSON.stringify(parsed);
    expect(roundTripped).toBe(expected);
    expect(roundTripped).not.toBe(input);

    // This shows why round-trip checks are important in protocol encoding
  }
});

test("Int64", () => {
  const minInt64 = -9223372036854775808n;
  const maxInt64 = 9223372036854775807n;

  expect(Int64.from(0n)).toStrictEqual(ok(0n));

  expect(Int64.from(minInt64)).toStrictEqual(ok(minInt64));
  expect(Int64.from(maxInt64)).toStrictEqual(ok(maxInt64));

  expect(Int64.from(minInt64 - 1n)).toStrictEqual(
    err({ type: "Int64", value: minInt64 - 1n }),
  );

  expect(Int64.from(maxInt64 + 1n)).toStrictEqual(
    err({ type: "Int64", value: maxInt64 + 1n }),
  );

  expect(Int64.fromUnknown(123)).toStrictEqual(
    err({ type: "BigInt", value: 123 }),
  );

  expectTypeOf<typeof Int64.Type>().toEqualTypeOf<bigint & Brand<"Int64">>();
  expectTypeOf<typeof Int64.Input>().toEqualTypeOf<bigint>();
  expectTypeOf<typeof Int64.Error>().toEqualTypeOf<Int64Error>();
  expectTypeOf<typeof Int64.Parent>().toEqualTypeOf<bigint>();
  expectTypeOf<typeof Int64.ParentError>().toEqualTypeOf<BigIntError>();
});

test("Int64String", () => {
  const validInt64String = "9223372036854775807"; // max Int64 as string
  const invalidInt64String = "9223372036854775808"; // exceeds Int64 range
  const nonNumericString = "not-a-number";

  expect(Int64String.from(validInt64String)).toStrictEqual(
    ok(validInt64String),
  );

  expect(Int64String.from(invalidInt64String)).toStrictEqual(
    err({ type: "Int64String", value: invalidInt64String }),
  );

  expect(Int64String.from(nonNumericString)).toStrictEqual(
    err({ type: "Int64String", value: nonNumericString }),
  );
});

test("optional", () => {
  const User = object({
    name: optional(NonEmptyString),
    age: PositiveNumber,
  });

  type User = typeof User.Type;

  expect(User.from({ name: "Alice", age: 30 })).toEqual(
    ok({ name: "Alice", age: 30 }),
  );

  expect(User.from({ age: 30 })).toEqual(ok({ age: 30 }));

  expect(User.fromUnknown({ name: undefined, age: 30 })).toEqual(
    err({
      type: "Object",
      value: { name: undefined, age: 30 },
      reason: {
        kind: "Props",
        errors: {
          name: { type: "String", value: undefined },
        },
      },
    }),
  );

  expect(
    User.fromParent({
      name: "Alice" as NonEmptyString,
      age: 30 as PositiveNumber,
    }),
  ).toEqual(ok({ name: "Alice", age: 30 }));
  expect(User.fromParent({ age: 30 as PositiveNumber })).toEqual(
    ok({ age: 30 }),
  );

  expect(User.is({ name: "Alice", age: 30 })).toBe(true);
  expect(User.is({ age: 30 })).toBe(true);
  expect(User.is({ name: "", age: 30 })).toBe(false);

  const extra = { name: "Alice", age: 30, extra: "foo" };
  expect(User.from(extra)).toEqual(
    err({
      type: "Object",
      value: { name: "Alice", age: 30, extra: "foo" },
      reason: { kind: "ExtraKeys", extraKeys: ["extra"] },
    }),
  );

  expectTypeOf<typeof User.Type>().toEqualTypeOf<
    Readonly<{ age: PositiveNumber; name?: NonEmptyString }>
  >();
});

test("partial", () => {
  const PartialUser = partial({
    name: NonEmptyString,
    age: PositiveNumber,
  });

  expect(PartialUser.from({})).toEqual(ok({}));

  expect(PartialUser.from({ name: "Alice" })).toEqual(ok({ name: "Alice" }));

  expect(PartialUser.from({ age: 30 })).toEqual(ok({ age: 30 }));

  expect(PartialUser.from({ name: "Alice", age: 30 })).toEqual(
    ok({ name: "Alice", age: 30 }),
  );

  expect(PartialUser.from({ name: "", age: 30 })).toEqual(
    err({
      type: "Object",
      value: { name: "", age: 30 },
      reason: {
        kind: "Props",
        errors: {
          name: { type: "MinLength", value: "", min: 1 },
        },
      },
    }),
  );

  const extra = { name: "Alice", age: 30, extra: "unexpected" };
  expect(PartialUser.from(extra)).toEqual(
    err({
      type: "Object",
      value: { name: "Alice", age: 30, extra: "unexpected" },
      reason: { kind: "ExtraKeys", extraKeys: ["extra"] },
    }),
  );

  expect(PartialUser.is({})).toBe(true);
  expect(PartialUser.is({ name: "Alice" })).toBe(true);
  expect(PartialUser.is({ age: 30 })).toBe(true);
  expect(PartialUser.is({ name: "", age: 30 })).toBe(false);

  expectTypeOf<typeof PartialUser.Type>().toEqualTypeOf<
    Readonly<{ age?: PositiveNumber; name?: NonEmptyString }>
  >();
  expectTypeOf<typeof PartialUser.Input>().toEqualTypeOf<
    Readonly<{ age?: number; name?: string }>
  >();
  expectTypeOf<typeof PartialUser.Error>().toEqualTypeOf<
    ObjectError<{
      name: MinLengthError<1>;
      age: PositiveError;
    }>
  >();
  expectTypeOf<typeof PartialUser.Parent>().toEqualTypeOf<
    Readonly<{ name?: string; age?: NonNegativeNumber }>
  >();
  expectTypeOf<typeof PartialUser.ParentError>().toEqualTypeOf<
    ObjectError<{ name: StringError; age: NumberError | NonNegativeError }>
  >();
});

test("nullableToOptional", () => {
  const NullOrString = nullOr(String);
  const User = object({
    name: String,
    age: NullOrString,
  });

  const TransformedUser = nullableToOptional(User.props);

  expectTypeOf<typeof TransformedUser.Type>().toEqualTypeOf<{
    readonly name: string;
    readonly age?: string | null;
  }>();
  expect(TransformedUser.props.name).toBe(String);
  expect(isOptionalType(TransformedUser.props.age)).toBe(true);
});

test("omit - single key", () => {
  // Define a test schema.
  const TestSchema = {
    id: String,
    name: NonEmptyString,
    age: PositiveNumber,
  };
  const TestType = object(TestSchema);
  const Omitted = omit(TestType, "id");

  expectTypeOf<typeof Omitted.Type>().toEqualTypeOf<
    Readonly<{
      name: string & Brand<"MinLength1">;
      age: number & Brand<"NonNegative"> & Brand<"Positive">;
    }>
  >();

  expect(Omitted.from({ name: "Alice", age: 30 })).toEqual(
    ok({ name: "Alice", age: 30 }),
  );

  expect(Omitted.fromUnknown({ id: "123", name: "Alice", age: 30 })).toEqual(
    err({
      type: "Object",
      value: { id: "123", name: "Alice", age: 30 },
      reason: { kind: "ExtraKeys", extraKeys: ["id"] },
    }),
  );
});

test("instanceOf", () => {
  class User {
    constructor(public name: string) {}
  }

  class Admin extends User {}

  const UserType = instanceOf(User);
  const AdminType = instanceOf(Admin);

  expect(UserType.from(new User("Alice"))).toEqual(ok(new User("Alice")));
  expect(AdminType.from(new Admin("Bob"))).toEqual(ok(new Admin("Bob")));

  expect(UserType.fromUnknown({})).toEqual(
    err<InstanceOfError>({
      type: "InstanceOf",
      value: {},
      ctor: "User",
    }),
  );

  expect(UserType.fromUnknown(null)).toEqual(
    err<InstanceOfError>({
      type: "InstanceOf",
      value: null,
      ctor: "User",
    }),
  );

  expect(UserType.fromParent(new User("Alice"))).toEqual(ok(new User("Alice")));
  expect(UserType.is(new User("Alice"))).toBe(true);
  expect(UserType.is({})).toBe(false);
  expect(UserType.name).toBe("InstanceOf");
  expect(UserType.ctor).toBe(User);

  expectTypeOf<typeof UserType.Type>().toEqualTypeOf<User>();
  expectTypeOf<typeof UserType.Input>().toEqualTypeOf<User>();
  expectTypeOf<typeof UserType.Error>().toEqualTypeOf<InstanceOfError>();
  expectTypeOf<typeof UserType.Parent>().toEqualTypeOf<User>();
  expectTypeOf<typeof UserType.ParentError>().toEqualTypeOf<InstanceOfError>();

  expect(Date.from(new globalThis.Date()).ok).toBe(true);
});

test("createFormatTypeError", () => {
  const formatTypeError = createFormatTypeError();

  expectTypeOf<typeof formatTypeError>().toEqualTypeOf<
    TypeErrorFormatter<TypeErrors>
  >();

  expect(formatTypeError({ type: "String", value: 42 })).toBe(
    "A value 42 is not a string.",
  );

  const formatTypeErrorWithCustomMessage = createFormatTypeError<StringError>(
    (error) => {
      switch (error.type) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        case "String":
          return "string";
      }
    },
  );

  const stringResult = String.fromUnknown(1);
  assert(!stringResult.ok);
  expect(formatTypeErrorWithCustomMessage(stringResult.error)).toBe("string");

  const Name = brand("Name", NonEmptyTrimmedString1000);
  type NameError = typeof Name.Error;

  const formatTypeErrorWithCustomError = createFormatTypeError<NameError>(
    (error) => {
      switch (error.type) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        case "Name":
          return "name";
      }
    },
  );

  const nameResult = Name.fromUnknown(1);
  assert(!nameResult.ok);
  expect(formatTypeErrorWithCustomError(nameResult.error)).toBe("name");
});

test("json Type Factory", () => {
  const Person = object({
    name: NonEmptyString100,
    age: PositiveInt,
  });

  const [PersonJson, personToPersonJson, personJsonToPerson] = json(
    Person,
    "PersonJson",
  );
  type PersonJson = typeof PersonJson.Type;
  expectTypeOf<PersonJson>().toEqualTypeOf<string & Brand<"PersonJson">>();

  const person = Person.orThrow({
    name: "Alice",
    age: 30,
  });
  const personJson = personToPersonJson(person);
  expect(personJson).toBe('{"name":"Alice","age":30}');

  expectTypeOf(personJson).toEqualTypeOf<string & Brand<"PersonJson">>();

  expect(personJsonToPerson(personJson)).toEqual(person);

  // Test StringError: input is not a string
  expect(PersonJson.fromUnknown(42)).toEqual(
    err({ type: "String", value: 42 }),
  );

  // Test JsonError: invalid JSON string
  expect(PersonJson.fromUnknown('{"invalid": json}')).toEqual(
    err({
      type: "Json",
      value: '{"invalid": json}',
      message: `SyntaxError: Unexpected token 'j', "{"invalid": json}" is not valid JSON`,
    }),
  );

  // Test Object validation error: valid JSON but invalid Person
  expect(PersonJson.fromUnknown('{"name": "", "age": -1}')).toEqual(
    err({
      type: "Object",
      value: { name: "", age: -1 },
      reason: {
        kind: "Props",
        errors: {
          name: { type: "MinLength", value: "", min: 1 },
          age: { type: "NonNegative", value: -1 },
        },
      },
    }),
  );

  // Test all error types are caught by exhaustive switch
  const testErrorResult = PersonJson.fromUnknown(null);
  if (!testErrorResult.ok) {
    switch (testErrorResult.error.type) {
      case "String":
        break;
      case "Json":
        break;
      case "Object":
        break;
      default:
        exhaustiveCheck(testErrorResult.error);
    }
  }
});

test("Branded numbers relationships", () => {
  expectTypeOf<PositiveNumber>().toExtend<NonNegativeNumber>();
  expectTypeOf<NegativeNumber>().toExtend<NonPositiveNumber>();

  expectTypeOf<PositiveInt>().toExtend<NonNegativeInt>();
  expect(PositiveInt.from(0)).toEqual(err({ type: "Positive", value: 0 }));
  expect(PositiveInt.from(-1)).toEqual(err({ type: "NonNegative", value: -1 }));

  expectTypeOf<NegativeInt>().toExtend<NonPositiveInt>();
  expect(NegativeInt.from(0)).toEqual(err({ type: "Negative", value: 0 }));
  expect(NegativeInt.from(1)).toEqual(err({ type: "NonPositive", value: 1 }));

  expectTypeOf<NonNegativeInt>().toExtend<Int>();
  expect(NonNegativeInt.from(-0.5)).toEqual(err({ type: "Int", value: -0.5 }));
  expect(NonNegativeInt.from(-1)).toEqual(
    err({ type: "NonNegative", value: -1 }),
  );

  expectTypeOf<NonPositiveInt>().toExtend<Int>();
  expect(NonPositiveInt.from(0.5)).toEqual(err({ type: "Int", value: 0.5 }));
  expect(NonPositiveInt.from(1)).toEqual(
    err({ type: "NonPositive", value: 1 }),
  );
});
