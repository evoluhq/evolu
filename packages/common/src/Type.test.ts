import nodeAssert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createMutableArray, type NonEmptyReadonlyArray } from "./Array.ts";
import type { Brand } from "./Brand.ts";
import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";
import * as cs from "./intl/cs.ts";
import {
  allResult,
  err,
  flatMapResult,
  getOrThrow,
  ok,
  type Result,
} from "./Result.ts";
import { testCreateDeps } from "./Task.ts";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  Age,
  array,
  ArrayBuffer,
  assertType,
  Base64Url,
  base64UrlToUint8Array,
  between,
  BigInt,
  Boolean,
  brand,
  capitalized,
  CapitalizedString,
  instanceOf,
  objectTag,
  createId,
  createIdAsUuidv7,
  createIdFromString,
  createType,
  Data,
  Date,
  DateIso,
  DateIsoFromDate,
  DecimalString,
  Digit,
  Digit1To6,
  Digit1To9,
  Digit1To23,
  Digit1To51,
  Digit1To59,
  Digit1To99,
  discriminatedUnion,
  EvoluType,
  finite,
  FiniteNumber,
  Function,
  greaterThan,
  greaterThanOrEqualTo,
  int,
  Int,
  Int64,
  Int64FromInt64String,
  Int64String,
  Id,
  IdBytes,
  idBytesToId,
  idBytesTypeValueLength,
  id,
  idToIdBytes,
  json,
  Json,
  JsonArray,
  JsonObject,
  jsonToJsonValue,
  JsonValue,
  JsonValueFromJson,
  jsonValueToJson,
  lazy,
  length,
  lessThan,
  lessThanOrEqualTo,
  literal,
  localizeTypes,
  maxLength,
  maxPositiveInt,
  map,
  minLength,
  Mnemonic,
  multipleOf,
  negative,
  negativeDecimalString,
  NegativeDecimalString,
  NegativeInt,
  NegativeNumber,
  Never,
  Name,
  NonEmptyTrimmedString,
  NonEmptyTrimmedString100,
  NonEmptyTrimmedString1000,
  nonNaN,
  NonNaNNumber,
  nonNegative,
  nonNegativeDecimalString,
  NonNegativeDecimalString,
  NonNegativeFiniteNumber,
  NonNegativeInt,
  NonNegativeNumber,
  nonPositive,
  nonPositiveDecimalString,
  NonPositiveDecimalString,
  NonPositiveInt,
  NonPositiveNumber,
  Null,
  nullishOr,
  nullOr,
  nullableToOptional,
  Number,
  Object,
  object,
  omit,
  onePositiveInt,
  optional,
  partial,
  positive,
  positiveDecimalString,
  PositiveDecimalString,
  PositiveFiniteNumber,
  PositiveInt,
  PositiveNumber,
  Ratio,
  record,
  regex,
  result,
  nextResult,
  set,
  String,
  Symbol,
  SimplePassword,
  testName,
  templateLiteral,
  templateLiteralParser,
  transform,
  trim,
  trimmed,
  TrimmedString,
  tuple,
  typed,
  UInt64,
  Uint8Array,
  Undefined,
  undefinedOr,
  union,
  Unknown,
  UnknownNextResult,
  UnknownResult,
  uint8ArrayToBase64Url,
  UrlSafeString,
  zeroNonNegativeInt,
  type AnyType,
  type ArrayElementIssue,
  type ArrayElementsError,
  type ArrayError,
  type ArrayExcessPropertyIssue,
  type ArrayIssue,
  type ArrayItemsError,
  type ArrayType,
  type BrandFactory,
  type BrandType,
  type Base64UrlError,
  type CapitalizedError,
  type DataError,
  type DataIssue,
  type DataType,
  type DateIsoError,
  type DateIsoFromDateError,
  type DecimalStringError,
  type DiscriminatedUnionError,
  type DiscriminatedUnionMemberError,
  type DiscriminatedUnionMemberIssue,
  type DiscriminatedUnionType,
  type EvoluTypeError,
  type ExtractTyped,
  type FiniteError,
  type GreaterThanError,
  type InferErrors,
  type InferType,
  type InstanceConstructor,
  type IsData,
  type InstanceOfError,
  type InstanceOfType,
  type Int64Error,
  type Int64StringError,
  type IntError,
  type IdError,
  type JsonArrayInput,
  type JsonError,
  type JsonObjectInput,
  type JsonObjectType,
  type JsonValueError,
  type JsonValueInput,
  type JsonValueIssue,
  type JsonValueType,
  type LazyType,
  type LessThanOrEqualToError,
  type LiteralError,
  type LiteralType,
  type MaxLengthError,
  type MapEntriesError,
  type MapError,
  type MapExcessPropertyIssue,
  type MapIssue,
  type MapKeyCollisionIssue,
  type MapKeyIssue,
  type MapNotMapError,
  type MapType,
  type MapValueIssue,
  type MinLengthError,
  type MnemonicError,
  type NameError,
  type NegativeDecimalStringError,
  type NegativeError,
  type NeverError,
  type NullableToOptionalProps,
  type NonNaNError,
  type NonNegativeError,
  type NonNegativeDecimalStringError,
  type NonPositiveDecimalStringError,
  type NonPositiveError,
  type ObjectError,
  type ObjectExcessPropertyError,
  type ObjectMissingPropertyError,
  type ObjectTag,
  type ObjectTagError,
  type ObjectTagType,
  type ObjectPropertiesError,
  type ObjectPropertyAccessError,
  type ObjectType,
  type OptionalProperty,
  type PartialObjectProps,
  type PositiveDecimalStringError,
  type PositiveError,
  type RecordAccessorIssue,
  type RecordCollisionIssue,
  type RecordEntriesError,
  type RecordError,
  type RecordIssue,
  type RecordKeyIssue,
  type RecordNonEnumerableIssue,
  type RecordNotPlainRecordError,
  type RecordNotRecordError,
  type RecordType,
  type RecordValueIssue,
  type SetElementIssue,
  type SetElementsError,
  type SetError,
  type SetExcessPropertyIssue,
  type SetItemsError,
  type SetNotSetError,
  type SetType,
  type TemplateLiteralError,
  type TemplateLiteralParserType,
  type TemplateLiteralType,
  type TransformError,
  type TransformOutputError,
  type TransformType,
  type TrimmedError,
  type TupleElementIssue,
  type TupleElementsError,
  type TupleError,
  type TupleExcessPropertyIssue,
  type TupleIssue,
  type TupleItemsError,
  type TupleType,
  type Type,
  type Typed,
  type TypedType,
  type TypeError,
  type TypeErrorFormatter,
  type TypeName,
  type TypeNode,
  type TypeOfError,
  type TypeValueError,
  type TableIdError,
  type UInt64Error,
  type UnionError,
  type UnionInputType,
  type UnionMemberError,
  type UnionType,
  type ValidationOptions,
} from "./Type.ts";

const createNullRecord = <T extends object>(entries: T): T =>
  globalThis.Object.assign(globalThis.Object.create(null) as T, entries);

const formatTestTypeError: TypeErrorFormatter<TypeError> = (error) =>
  error.type;

// Preserves a public Type property while erasing its concrete generic
// information.
type FormattableTypeNode = TypeNode & { readonly formatError: unknown };

type ExpectedStrictObject<
  Required,
  Optional = Readonly<Record<never, never>>,
> = {
  readonly [Key in keyof Required]: Required[Key];
} & {
  readonly [Key in keyof Optional]?: Optional[Key];
};

interface NumberFromStringError extends TypeError<"NumberFromString"> {
  readonly value: string;
}

const setupNumberFromString = () =>
  transform(
    "NumberFromString",
    String,
    Number,
    {
      from: (value): Result<number, NumberFromStringError> => {
        const number = globalThis.Number(value);

        return value === "NaN"
          ? ok(globalThis.Number.NaN)
          : value !== "" && !globalThis.Number.isNaN(number)
            ? ok(number)
            : err({ type: "NumberFromString", value });
      },
      to: (value) =>
        globalThis.Object.is(value, -0) ? "-0" : globalThis.String(value),
    },
    (error) => `The value ${error.value} is not a number.`,
  );

const setupLowercaseFromString = () => {
  const Lowercase = brand(
    "Lowercase",
    String,
    (value) =>
      value === value.toLowerCase() ? ok() : err({ type: "Lowercase", value }),
    formatTestTypeError,
  );
  const LowercaseFromString = transform(
    "LowercaseFromString",
    String,
    Lowercase,
    {
      from: (value) => ok(value.toLowerCase()),
      to: (value) => value,
    },
  );

  return { Lowercase, LowercaseFromString };
};

const setupUnexpectedPrototypeValues = (): ReadonlyArray<
  Readonly<Record<string, string>>
> => {
  class NullBase extends null {}

  return [
    globalThis.Object.assign(
      globalThis.Object.create({
        constructor: globalThis.Object,
        inherited: "rich",
      }) as Record<string, string>,
      { type: "Created", name: "Ada" },
    ),
    globalThis.Object.assign(
      globalThis.Object.create(
        globalThis.Object.create(null) as object,
      ) as Record<string, string>,
      { type: "Created", name: "Ada" },
    ),
    globalThis.Object.assign(
      globalThis.Object.create(NullBase.prototype) as Record<string, string>,
      { type: "Created", name: "Ada" },
    ),
  ];
};

const assertAssertionError = (
  operation: () => unknown,
  message: string,
  cause: unknown,
): void => {
  const error = assertThrowsInstanceOf(operation, Error);
  assertEqual(error.message, message);
  assertEqual(error.cause, cause);
};

describe("Type", () => {
  it("extracts an object Output for an interface", () => {
    const User = object({ name: String });
    interface User extends InferType<typeof User> {}

    assertType<User extends typeof User.Output ? true : false, true>();
    assertType<typeof User.Output extends User ? true : false, true>();
  });

  it("exposes every non-Lazy Type name through introspection", () => {
    type TypeModule = typeof import("./Type.ts");
    type ExportedTypeKey = {
      readonly [Key in keyof TypeModule]: TypeModule[Key] extends TypeNode
        ? Key
        : never;
    }[keyof TypeModule];
    type PropertyType<Property> =
      Property extends OptionalProperty<infer T extends TypeNode>
        ? T
        : Property extends TypeNode
          ? Property
          : never;
    type IntrospectedTypeNames<T> = T extends TypeNode
      ? | T["name"]
        | IntrospectedTypeNames<T["parent"]>
        | (T extends { readonly element: infer Element }
            ? IntrospectedTypeNames<Element>
            : never)
        | (T extends {
            readonly elements: infer Elements extends ReadonlyArray<unknown>;
          }
            ? IntrospectedTypeNames<Elements[number]>
            : never)
        | (T extends { readonly key: infer Key }
            ? IntrospectedTypeNames<Key>
            : never)
        | (T extends { readonly value: infer Value }
            ? IntrospectedTypeNames<Value>
            : never)
        | (T extends {
            readonly props: infer Props extends Readonly<
              Record<string, unknown>
            >;
          }
            ? IntrospectedTypeNames<PropertyType<Props[keyof Props]>>
            : never)
        | (T extends { readonly record: infer Rest }
            ? IntrospectedTypeNames<Rest>
            : never)
        | (T extends {
            readonly members: infer Members extends ReadonlyArray<unknown>;
          }
            ? IntrospectedTypeNames<Members[number]>
            : never)
        | (T extends { readonly output: infer Output }
            ? IntrospectedTypeNames<Output>
            : never)
      : never;

    const exportedTypes = {
      Age,
      ArrayBuffer,
      Base64Url,
      BigInt,
      Boolean,
      CapitalizedString,
      Data,
      Date,
      DateIso,
      DateIsoFromDate,
      DecimalString,
      Digit,
      Digit1To6,
      Digit1To9,
      Digit1To23,
      Digit1To51,
      Digit1To59,
      Digit1To99,
      EvoluType,
      FiniteNumber,
      Function,
      Id,
      IdBytes,
      Int,
      Int64,
      Int64FromInt64String,
      Int64String,
      Json,
      JsonArray,
      JsonObject,
      JsonValue,
      JsonValueFromJson,
      NegativeDecimalString,
      NegativeInt,
      NegativeNumber,
      Never,
      Mnemonic,
      Name,
      NonEmptyTrimmedString,
      NonEmptyTrimmedString100,
      NonEmptyTrimmedString1000,
      NonNaNNumber,
      NonNegativeDecimalString,
      NonNegativeFiniteNumber,
      NonNegativeInt,
      NonNegativeNumber,
      NonPositiveDecimalString,
      NonPositiveInt,
      NonPositiveNumber,
      Null,
      Number,
      Object,
      PositiveDecimalString,
      PositiveFiniteNumber,
      PositiveInt,
      PositiveNumber,
      Ratio,
      SimplePassword,
      String,
      Symbol,
      TrimmedString,
      UInt64,
      Uint8Array,
      Undefined,
      Unknown,
      UnknownNextResult,
      UnknownResult,
      UrlSafeString,
    } as const satisfies Readonly<Record<ExportedTypeKey, TypeNode>>;

    const IntrospectionRoot = createType(
      "IntrospectionRoot",
      ok,
      formatTestTypeError,
    );
    const IntrospectionChild = brand("IntrospectionChild", IntrospectionRoot);
    const IntrospectionA = typed("IntrospectionA", { value: String });
    const IntrospectionB = typed("IntrospectionB", { value: Number });
    const NumberFromString = setupNumberFromString();
    const combinations = tuple(
      IntrospectionChild,
      capitalized(String),
      trimmed(String),
      minLength(2)(String),
      maxLength(3)(String),
      length(4)(String),
      regex("IntrospectionRegex", /introspection/u)(String),
      nonNegative(Number),
      positive(Number),
      nonPositive(Number),
      negative(Number),
      int(Number),
      greaterThan(1)(Number),
      greaterThanOrEqualTo(2)(Number),
      lessThan(3)(Number),
      lessThanOrEqualTo(4)(Number),
      nonNaN(Number),
      finite(Number),
      multipleOf("5")(Number),
      between(6, 7)(Number),
      literal("IntrospectionLiteral"),
      undefinedOr(String),
      nullOr(String),
      nullishOr(String),
      union(String, Number),
      array(minLength(2)(String)),
      tuple(String, NumberFromString),
      map(String, Number),
      record(regex("IntrospectionKey", /^key/u)(String), NumberFromString),
      set(minLength(2)(String)),
      object(
        {
          required: String,
          optional: optional(NumberFromString),
        },
        record(String, Unknown),
      ),
      IntrospectionA,
      discriminatedUnion(IntrospectionA, IntrospectionB),
      NumberFromString,
      // oxlint-disable-next-line typescript/no-extraneous-class
      instanceOf(class IntrospectionInstance {}),
    );
    const allTypes = [
      ...globalThis.Object.values(exportedTypes),
      combinations,
    ] as const;
    const expectedNames = [
      "Age",
      "Array",
      "ArrayBuffer",
      "Base64Url",
      "Between6-7",
      "BigInt",
      "Boolean",
      "Capitalized",
      "Data",
      "Date",
      "DateIso",
      "DateIsoFromDate",
      "DecimalString",
      "DiscriminatedUnion",
      "EvoluType",
      "Finite",
      "Function",
      "GreaterThan1",
      "GreaterThanOrEqualTo2",
      "Id",
      "IdBytes",
      "InstanceOf",
      "Int",
      "Int64",
      "Int64FromInt64String",
      "Int64String",
      "IntrospectionChild",
      "IntrospectionKey",
      "IntrospectionRegex",
      "IntrospectionRoot",
      "Json",
      "JsonValue",
      "JsonValueFromJson",
      "Length16",
      "Length4",
      "LessThan200",
      "LessThan3",
      "LessThanOrEqualTo1",
      "LessThanOrEqualTo4",
      "Literal",
      "Map",
      "MaxLength100",
      "MaxLength1000",
      "MaxLength3",
      "MaxLength64",
      "MinLength1",
      "MinLength2",
      "MinLength8",
      "Mnemonic",
      "MultipleOf5",
      "Name",
      "Negative",
      "NegativeDecimalString",
      "Never",
      "NonNaN",
      "NonNegative",
      "NonNegativeDecimalString",
      "NonPositive",
      "NonPositiveDecimalString",
      "Number",
      "NumberFromString",
      "Object",
      "Positive",
      "PositiveDecimalString",
      "Ratio",
      "Record",
      "Set",
      "SimplePassword",
      "String",
      "Symbol",
      "TemplateLiteral",
      "Trimmed",
      "Tuple",
      "UInt64",
      "Uint8Array",
      "Union",
      "Unknown",
      "UrlSafeString",
    ] as const;

    assertType<
      IntrospectedTypeNames<(typeof allTypes)[number]>,
      (typeof expectedNames)[number]
    >();

    interface RuntimeIntrospection extends TypeNode {
      readonly element?: TypeNode;
      readonly elements?: ReadonlyArray<TypeNode>;
      readonly key?: string | TypeNode;
      readonly members?: ReadonlyArray<TypeNode>;
      readonly output?: TypeNode;
      readonly props?: Readonly<
        Record<string, TypeNode | { readonly type: TypeNode }>
      >;
      readonly record?: TypeNode;
      readonly value?: TypeNode;
    }

    const isTypeNode = (value: unknown): value is TypeNode =>
      EvoluType.is(value);
    const names = new Set<TypeName>();
    const visited = new Set<TypeNode>();
    const visit = (type: TypeNode): void => {
      if (visited.has(type)) return;
      visited.add(type);
      names.add(type.name);

      if (type.parent) visit(type.parent);

      const introspection = type as RuntimeIntrospection;
      if (introspection.element) visit(introspection.element);
      for (const element of introspection.elements ?? []) visit(element);
      if (isTypeNode(introspection.key)) visit(introspection.key);
      if (introspection.value) visit(introspection.value);
      if (introspection.record) visit(introspection.record);
      for (const member of introspection.members ?? []) visit(member);
      if (introspection.output) visit(introspection.output);

      for (const property of globalThis.Object.values(
        introspection.props ?? {},
      )) {
        visit(isTypeNode(property) ? property : property.type);
      }
    };

    for (const type of allTypes) visit(type);

    assertEqual([...names].toSorted(), expectedNames);
  });

  it("is nominal", () => {
    const Answer = literal(42);
    // The private symbol makes TypeNode nominal.
    type StructuralAnswer = Omit<typeof Answer, symbol>;

    assertType<typeof Answer extends TypeNode ? true : false, true>();
    assertType<StructuralAnswer extends TypeNode ? true : false, false>();
  });

  it("exposes its typed default error formatter", () => {
    assertEqual(
      String.formatError({ type: "TypeOf", expected: "String", value: 42 }),
      "A value 42 is not a string.",
    );
    assertType<
      Parameters<typeof String.formatError>[0],
      TypeOfError<"String">
    >();
  });

  it("does not expose error formatting through TypeNode", () => {
    assertType<"formatError" extends keyof TypeNode ? true : false, false>();
  });

  it("does not expose encoding through TypeNode", () => {
    assertType<"to" extends keyof TypeNode ? true : false, false>();
  });

  it("encodes validation-only Types without changing their values", () => {
    const dateIso = getOrThrow(DateIso.from.parent("2024-01-01T00:00:00.000Z"));

    assertEqual(String.to("value"), "value");
    assertEqual(DateIso.to(dateIso), "2024-01-01T00:00:00.000Z");
    {
      const actual = DateIso.to(dateIso);
      assertType<typeof actual, DateIso>();
    }
  });

  it("exposes partial encoding operations for every parent boundary", () => {
    const A = brand("OperationA", String);
    const B = brand("OperationB", A);
    const value = B.orThrow("value");
    const bToParent = B.to.parent;

    assertEqual(B.to(value), "value");
    assertEqual(B.to.parent(value), "value");
    assertEqual(B.to.parent.parent(value), "value");
    {
      const actual = B.to.parent(value);
      assertType<typeof actual, typeof A.Output>();
    }
    {
      const actual = B.to.parent.parent(value);
      assertType<typeof actual, string>();
    }
    assertFalse("parent" in B.to.parent.parent);

    brand("OperationC", B);

    assertSame(B.to.parent, bToParent);
    assertFalse("parent" in B.to.parent.parent);
    assertFalse("parent" in String.to);
  });

  describe("variance", () => {
    interface BroadError extends TypeError<"Variance"> {
      readonly value: unknown;
    }
    interface NarrowError extends BroadError {
      readonly value: "narrow";
    }

    type VarianceType<
      Name extends Capitalize<string> = "Variance",
      Input = unknown,
      Output = unknown,
      Error extends TypeError = never,
      Parent extends TypeNode | null = null,
      Errors extends TypeError = never,
    > = Type<Name, Input, Output, Error, Parent, Errors>;

    type NarrowName = VarianceType;
    type BroadName = VarianceType<Capitalize<string>>;
    type NarrowOutput = VarianceType<"Variance", unknown, "narrow">;
    type BroadOutput = VarianceType<"Variance", unknown, string>;
    type NarrowOwnError = VarianceType<
      "Variance",
      unknown,
      unknown,
      NarrowError,
      null,
      TypeError
    >;
    type BroadOwnError = VarianceType<
      "Variance",
      unknown,
      unknown,
      BroadError,
      null,
      TypeError
    >;
    type NarrowInput = VarianceType<"Variance", "narrow", string>;
    type BroadInput = VarianceType<"Variance", string, string>;
    type NarrowErrors = VarianceType<
      "Variance",
      unknown,
      unknown,
      never,
      null,
      NarrowError
    >;
    type BroadErrors = VarianceType<
      "Variance",
      unknown,
      unknown,
      never,
      null,
      BroadError
    >;
    type Root = VarianceType<"Root">;
    type NarrowParent = VarianceType<"Parent", unknown, "narrow", never, Root>;
    type BroadParent = VarianceType<"Parent", unknown, string, never, Root>;
    type WithNarrowParent = VarianceType<
      "Child",
      unknown,
      unknown,
      never,
      NarrowParent
    >;
    type WithBroadParent = VarianceType<
      "Child",
      unknown,
      unknown,
      never,
      BroadParent
    >;

    it("makes Name and Error covariant", () => {
      assertType<NarrowName extends BroadName ? true : false, true>();
      assertType<BroadName extends NarrowName ? true : false, false>();
      assertType<NarrowOwnError extends BroadOwnError ? true : false, true>();
      assertType<BroadOwnError extends NarrowOwnError ? true : false, false>();
    });

    it("makes Input, Output, Parent, and Errors invariant", () => {
      assertType<NarrowInput extends BroadInput ? true : false, false>();
      assertType<BroadInput extends NarrowInput ? true : false, false>();
      assertType<NarrowOutput extends BroadOutput ? true : false, false>();
      assertType<BroadOutput extends NarrowOutput ? true : false, false>();
      assertType<NarrowErrors extends BroadErrors ? true : false, false>();
      assertType<BroadErrors extends NarrowErrors ? true : false, false>();
      assertType<
        WithNarrowParent extends WithBroadParent ? true : false,
        false
      >();
      assertType<
        WithBroadParent extends WithNarrowParent ? true : false,
        false
      >();
    });
  });
});

describe("Type operations", () => {
  it("assert each selected boundary with its name and structured error", () => {
    const positiveError = { type: "Positive", value: 0 } as const;
    const nonNegativeError = { type: "NonNegative", value: -1 } as const;
    const numberError = {
      type: "TypeOf",
      expected: "Number",
      value: "1",
    } as const;

    for (const [operation, message, cause] of [
      [
        () => PositiveNumber.from(0 as PositiveNumber),
        "Expected Positive.",
        positiveError,
      ],
      [
        () => PositiveNumber.from.parent(-1 as unknown as NonNegativeNumber),
        "Expected NonNegative.",
        nonNegativeError,
      ],
      [
        () => PositiveNumber.from.parent.parent("1" as unknown as number),
        "Expected Number.",
        numberError,
      ],
      [
        () => PositiveNumber.to(0 as PositiveNumber),
        "Expected Positive.",
        positiveError,
      ],
      [
        () => PositiveNumber.orThrow("1" as unknown as number),
        "Expected Number.",
        numberError,
      ],
      [
        () => PositiveNumber.orNull("1" as unknown as number),
        "Expected Number.",
        numberError,
      ],
    ] as const) {
      assertAssertionError(operation, message, cause);
    }
  });

  it("map only errors returned after the typed Input boundary", () => {
    const error = { type: "Positive", value: 0 } as const;

    assertAssertionError(() => PositiveNumber.orThrow(0), "getOrThrow", error);
    assertSame(PositiveNumber.orNull(0), null);
  });
});

describe("Standard Schema", () => {
  it("infers the exact Input and Output", () => {
    const _NumberFromString = setupNumberFromString();

    assertType<StandardSchemaV1.InferInput<typeof _NumberFromString>, string>();
    assertType<
      StandardSchemaV1.InferOutput<typeof _NumberFromString>,
      number
    >();
  });

  it("decodes synchronously through transformations", async () => {
    const NumberFromString = setupNumberFromString();
    const result = NumberFromString["~standard"].validate("42");

    assertFalse(result instanceof Promise);
    assertEqual(await result, { value: 42 });
  });

  it("returns every nested Object and Array issue with its path", async () => {
    const Model = object({
      labels: array(String),
      count: Number,
      required: String,
    });
    const result = await Model["~standard"].validate({
      labels: [1, 2],
      count: "1",
      excess: true,
    });

    assertEqual(result, {
      issues: [
        { message: "A value 1 is not a string.", path: ["labels", 0] },
        { message: "A value 2 is not a string.", path: ["labels", 1] },
        { message: 'A value "1" is not a number.', path: ["count"] },
        {
          message: 'The required property "required" is missing.',
          path: ["required"],
        },
        {
          message:
            'The property "excess" is not allowed. Remove it or use a different Type.',
          path: ["excess"],
        },
      ],
    });
  });

  it("locates Array holes, accessors, and excess properties", async () => {
    const symbol = globalThis.Symbol("metadata");
    const value = createMutableArray<unknown>(3);
    globalThis.Object.defineProperty(value, 0, {
      enumerable: true,
      get: () => "accessor",
    });
    value[2] = "value";
    globalThis.Object.defineProperty(value, "metadata", {
      enumerable: true,
      value: "metadata",
    });
    globalThis.Object.defineProperty(value, symbol, {
      enumerable: true,
      value: "metadata",
    });

    const result = await array(String)["~standard"].validate(value);

    assertEqual(result, {
      issues: [
        {
          message:
            "An excess Array property is not allowed. Remove it or use a different Type.",
          path: ["metadata"],
        },
        {
          message:
            "An excess Array property is not allowed. Remove it or use a different Type.",
          path: [symbol],
        },
        {
          message: "An array element at index 0 must be a data property.",
          path: [0],
        },
        {
          message: "An array element at index 1 is missing.",
          path: [1],
        },
      ],
    });
  });

  it("locates Tuple issues", async () => {
    const result = await tuple(String, Number)["~standard"].validate([1, "2"]);

    assertEqual(result, {
      issues: [
        { message: "A value 1 is not a string.", path: [0] },
        { message: 'A value "2" is not a number.', path: [1] },
      ],
    });
  });

  it("locates Tuple structural issues", async () => {
    const value = ["value", 1];
    globalThis.Object.defineProperty(value, 0, {
      enumerable: true,
      get: () => "value",
    });
    globalThis.Object.defineProperty(value, "metadata", {
      enumerable: true,
      value: true,
    });

    const result = await tuple(String, Number)["~standard"].validate(value);

    assertEqual(result, {
      issues: [
        {
          message:
            "An excess Tuple property is not allowed. Remove it or use a different Type.",
          path: ["metadata"],
        },
        {
          message: "A Tuple element at index 0 must be a data property.",
          path: [0],
        },
      ],
    });
  });

  it("locates Record key, value, and structural issues", async () => {
    const Values = record(regex("RecordKey", /^value/u)(String), Number);
    const input = { invalid: 1, value: "1" };
    globalThis.Object.defineProperty(input, "hidden", {
      enumerable: false,
      value: 1,
    });
    const result = await Values["~standard"].validate(input);

    assertEqual(result, {
      issues: [
        {
          message: 'The value "invalid" does not match /^value/u.',
          path: ["invalid"],
        },
        { message: 'A value "1" is not a number.', path: ["value"] },
        {
          message: 'The value "hidden" does not match /^value/u.',
          path: ["hidden"],
        },
        {
          message: 'A Record property "hidden" must be enumerable.',
          path: ["hidden"],
        },
      ],
    });
  });

  it("locates Map key, value, and structural issues", async () => {
    const Values = map(String, Number);
    const input = new Map<unknown, unknown>([[1, "1"]]);
    globalThis.Object.defineProperty(input, "metadata", {
      enumerable: true,
      value: true,
    });

    assertEqual(await Values["~standard"].validate(input), {
      issues: [
        {
          message: 'An excess Map property "metadata" is not allowed.',
          path: ["metadata"],
        },
        { message: "A value 1 is not a string.", path: [0, "key"] },
        { message: 'A value "1" is not a number.', path: [0, "value"] },
      ],
    });

    const NumberFromString = setupNumberFromString();
    assertEqual(
      await map(NumberFromString, Number)["~standard"].validate(
        new Map([
          ["01", 1],
          ["1", 2],
        ]),
      ),
      {
        issues: [
          {
            message: "Map keys at indexes 0 and 1 decode to the same key 1.",
            path: [1],
          },
        ],
      },
    );
  });

  it("does not duplicate Object Record property paths", async () => {
    const Model = object(
      { fixed: array(Number) },
      record(String, array(Number)),
    );
    const result = await Model["~standard"].validate({
      fixed: [1],
      values: ["1"],
    });

    assertEqual(result, {
      issues: [
        { message: 'A value "1" is not a number.', path: ["values", 0] },
      ],
    });
  });

  it("returns one Union issue at the current path", async () => {
    const Model = object({ value: union(String, Number) });
    const result = await Model["~standard"].validate({ value: null });

    assertEqual(result, {
      issues: [
        {
          message: "A value does not match any allowed variant.",
          path: ["value"],
        },
      ],
    });
  });

  it("locates DiscriminatedUnion routing and member issues", async () => {
    const Created = typed("Created", { value: String });
    const Deleted = typed("Deleted", { reason: Number });
    const Event = discriminatedUnion(Created, Deleted);

    assertEqual(await Event["~standard"].validate({ type: "Unknown" }), {
      issues: [
        {
          message:
            'The discriminator property "type" has an unexpected value "Unknown".',
          path: ["type"],
        },
      ],
    });
    assertEqual(
      await Event["~standard"].validate({ type: "Created", value: 1 }),
      {
        issues: [{ message: "A value 1 is not a string.", path: ["value"] }],
      },
    );
  });

  it("locates transformation output issues", async () => {
    const PositiveFromString = transform(
      "PositiveFromString",
      String,
      positive(Number),
      {
        from: (value) => ok(globalThis.Number(value)),
        to: globalThis.String,
      },
    );
    const Model = object({ value: PositiveFromString });
    const result = await Model["~standard"].validate({ value: "0" });

    assertEqual(result, {
      issues: [
        {
          message: "The value 0 must be positive (> 0).",
          path: ["value"],
        },
      ],
    });
  });

  it("locates directly recursive Lazy issues", async () => {
    interface Tree {
      readonly value: string;
      readonly children: ReadonlyArray<Tree>;
    }
    interface TreeError extends ObjectError<{
      readonly value: TypeOfError<"String">;
      readonly children: ArrayError<TreeError>;
    }> {}
    const Tree: LazyType<Tree, Tree, never, TreeError, TreeError> = lazy(() =>
      object({ value: String, children: array(Tree) }),
    );
    const result = await Tree["~standard"].validate({
      value: "root",
      children: [{ value: 1, children: [] }],
    });

    assertEqual(result, {
      issues: [
        {
          message: "A value 1 is not a string.",
          path: ["children", 0, "value"],
        },
      ],
    });
  });

  it("locates mutually recursive Lazy issues", async () => {
    interface Left {
      readonly label: string;
      readonly right?: Right;
    }
    interface Right {
      readonly count: number;
      readonly left?: Left;
    }
    interface LeftError extends ObjectError<{
      readonly label: TypeOfError<"String">;
      readonly right?: RightError;
    }> {}
    interface RightError extends ObjectError<{
      readonly count: TypeOfError<"Number">;
      readonly left?: LeftError;
    }> {}
    const Left: LazyType<Left, Left, never, LeftError, LeftError> = lazy(() =>
      object({ label: String, right: optional(Right) }),
    );
    const Right: LazyType<Right, Right, never, RightError, RightError> = lazy(
      () => object({ count: Number, left: optional(Left) }),
    );
    const result = await Left["~standard"].validate({
      label: "left",
      right: { count: 1, left: { label: 1 } },
    });

    assertEqual(result, {
      issues: [
        {
          message: "A value 1 is not a string.",
          path: ["right", "left", "label"],
        },
      ],
    });
  });

  it("uses localized messages without changing paths", async () => {
    const Label = minLength(1)(String);
    const Model = object({ labels: array(Label) });
    const LocalizedModel = localizeTypes(
      { Model },
      {
        cs: {
          Array: cs.formatArrayError,
          MinLength1: cs.formatMinLengthError,
          Object: cs.formatObjectError,
          String: cs.formatStringError,
        },
      },
    ).cs.Model;
    const result = await LocalizedModel["~standard"].validate({
      labels: [1, ""],
    });

    assertEqual(result, {
      issues: [
        { message: "Hodnota 1 musí být text.", path: ["labels", 0] },
        { message: "Text nesmí být prázdný.", path: ["labels", 1] },
      ],
    });
  });

  it("uses JsonValue issue paths", async () => {
    const result = await JsonValue["~standard"].validate({
      values: [1, globalThis.Number.POSITIVE_INFINITY],
    });

    assertEqual(result, {
      issues: [
        {
          message: "A JSON number must be finite.",
          path: ["values", 1],
        },
      ],
    });
  });

  it("uses Data issue paths", async () => {
    const result = await Data["~standard"].validate({
      first: /first/u,
      second: /second/u,
    });

    assertEqual(result, {
      issues: [
        {
          message: "A Data Object has an unexpected prototype.",
          path: ["first"],
        },
        {
          message: "A Data Object has an unexpected prototype.",
          path: ["second"],
        },
      ],
    });
  });
});

describe("assertType", () => {
  it("asserts compiler-identical types", () => {
    assertType<string, string>();
    assertType<unknown, unknown>();
    assertType<never, never>();
    assertType<{ readonly value?: string }, { readonly value?: string }>();

    const compileTimeAssertions = () => {
      // @ts-expect-error ⛔ assertType error: Actual and expected types must be identical
      assertType<"value", string>();
      // @ts-expect-error ⛔ assertType error: Actual and expected types must be identical
      assertType<any, unknown>();
      // @ts-expect-error ⛔ assertType error: Actual and expected types must be identical
      assertType<{ readonly value: string }, { value: string }>();
      // @ts-expect-error ⛔ assertType error: Actual and expected types must be identical
      assertType<
        { readonly value?: string },
        { readonly value: string | undefined }
      >();
    };
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("narrows values that satisfy a Type Output", () => {
    const value: unknown = 42;

    assertType(Number, value);

    assertType<typeof value, number>();
  });

  it("rejects values that satisfy only a transformed Type Input", () => {
    nodeAssert.throws(
      () => {
        assertType(Int64FromInt64String, "42");
      },
      (error: unknown) => {
        nodeAssert.ok(error instanceof nodeAssert.AssertionError);
        nodeAssert.equal(error.message, "Expected Int64FromInt64String.");
        nodeAssert.deepEqual(error.cause, {
          type: "Int64FromInt64String",
          outputError: {
            type: "TypeOf",
            expected: "BigInt",
            value: "42",
          },
        });
        return true;
      },
    );
  });

  it("validates a Type Output exactly once", () => {
    let calls = 0;
    const Flaky = createType(
      "Flaky",
      (value) => (++calls === 1 ? err({ type: "Flaky" }) : ok(value)),
      () => "flaky",
    );

    nodeAssert.throws(() => assertType(Flaky, 42));
    assertEqual(calls, 1);
  });
});

describe("localizeTypes", () => {
  it("creates localized Type collections for every locale", () => {
    const Label = minLength(1)(String);
    const typesByLocale = localizeTypes(
      { Label },
      {
        cs: {
          MinLength1: (error) => {
            assertType<typeof error, MinLengthError<1>>();
            return "Text nesmí být prázdný.";
          },
          String: (error) => {
            assertType<typeof error, TypeOfError<"String">>();
            return "Hodnota musí být text.";
          },
        },
        en: {
          MinLength1: () => "Text must not be empty.",
          String: () => "The value must be text.",
        },
      },
    );

    assertType<keyof typeof typesByLocale, "cs" | "en">();
    assertType<typeof typesByLocale.cs.Label, typeof Label>();
    assertFalse(globalThis.Object.is(typesByLocale.cs.Label, Label));

    const invalidType = typesByLocale.cs.Label.fromUnknown(1);
    assertErr(invalidType);
    assertEqual(
      typesByLocale.cs.Label.formatError(invalidType.error),
      "Hodnota musí být text.",
    );

    const invalidLength = typesByLocale.cs.Label.fromUnknown("");
    assertErr(invalidLength);
    assertEqual(
      typesByLocale.cs.Label.formatError(invalidLength.error),
      "Text nesmí být prázdný.",
    );
    assertEqual(
      typesByLocale.en.Label.formatError(invalidLength.error),
      "Text must not be empty.",
    );
    assertEqual(
      Label.formatError(invalidLength.error),
      'The value "" does not meet the minimum length of 1.',
    );
  });

  it("shares a locale registry across composed Types", () => {
    const Label = minLength(1)(String);
    const Labels = array(Label);
    const Model = object({ labels: Labels });
    const types = localizeTypes(
      { Label, Labels, Model, String },
      {
        test: {
          Array: () => "Localized Array.",
          MinLength1: () => "Localized MinLength1.",
          Object: () => "Localized Object.",
          String: () => "Localized String.",
        },
      },
    ).test;

    assertSame(types.Label.parent, types.String);

    for (const [value, message] of [
      [null, "Localized Object."],
      [{ labels: null }, "Localized Array."],
      [{ labels: [1] }, "Localized String."],
      [{ labels: [""] }, "Localized MinLength1."],
    ] as const) {
      const result = types.Model.fromUnknown(value);
      assertErr(result);
      assertSame(types.Model.formatError(result.error), message);
    }

    const labelResult = types.Label.fromUnknown(1);
    assertErr(labelResult);
    assertSame(labelResult.error.type, "TypeOf");
    assertEqual(
      types.Label.formatError(labelResult.error),
      "Localized String.",
    );
    assertEqual(
      types.Label.parent.formatError(labelResult.error),
      "Localized String.",
    );
  });

  it("localizes reflected Type graphs", () => {
    const NumberFromString = setupNumberFromString();
    const Pair = tuple(String, Number);
    const StringSet = set(String);
    const Strings = array(String);
    const Value = union(String, Number);
    const Values = record(String, String);
    const User = object({ name: String, nickname: optional(String) }, Values);
    // Composite Types come first to prove their reflected children populate the
    // same cache later used for explicitly selected leaf Types.
    const types = localizeTypes(
      {
        NumberFromString,
        Pair,
        StringSet,
        Strings,
        User,
        Value,
        Values,
        Number,
        String,
      },
      {
        test: {
          Array: () => "Localized Array.",
          Number: () => "Localized Number.",
          NumberFromString: () => "Localized NumberFromString.",
          Object: () => "Localized Object.",
          Record: () => "Localized Record.",
          Set: () => "Localized Set.",
          String: () => "Localized String.",
          Tuple: () => "Localized Tuple.",
          Union: () => "Localized Union.",
        },
      },
    ).test;

    assertSame(types.NumberFromString.parent, types.String);
    assertSame(types.NumberFromString.output, types.Number);
    assertEqual(types.Pair.elements, [types.String, types.Number]);
    assertSame(types.StringSet.element, types.String);
    assertSame(types.Strings.element, types.String);
    assertSame(types.User.props.name, types.String);
    assertSame(types.User.props.nickname.type, types.String);
    assertSame(types.User.record, types.Values);
    assertEqual(types.Value.members, [types.String, types.Number]);
    assertSame(types.Values.key, types.String);
    assertSame(types.Values.value, types.String);

    const ReflectedStrings = array(types.User.props.name);
    const result = ReflectedStrings.fromUnknown([1]);

    assertErr(result);
    assertEqual(
      ReflectedStrings.formatError(result.error),
      "Localized String.",
    );
  });

  it("preserves localized child errors when composed afterward", async () => {
    const LocalizedString = localizeTypes(
      { String },
      { test: { String: () => "Localized String." } },
    ).test.String;
    const Prefixed = templateLiteralParser("prefix-", LocalizedString);
    const Strings = array(LocalizedString);
    const NonEmptyString = minLength(1)(LocalizedString);
    const stringsResult = Strings.fromUnknown([1]);
    const nonEmptyStringResult = NonEmptyString.fromUnknown(1);

    assertErr(stringsResult);
    assertEqual(Strings.formatError(stringsResult.error), "Localized String.");
    assertEqual(await Strings["~standard"].validate([1]), {
      issues: [{ message: "Localized String.", path: [0] }],
    });
    assertOk(Prefixed.fromUnknown("prefix-value"), ["value"]);
    assertType<typeof Prefixed.Output, readonly [string]>();
    assertType<typeof Prefixed.CanonicalInput, `prefix-${string}`>();

    assertErr(nonEmptyStringResult);
    assertEqual(
      NonEmptyString.formatError(nonEmptyStringResult.error),
      "Localized String.",
    );
  });

  it("does not depend on selected Type or formatter order", async () => {
    const Label = minLength(1)(String);
    const labelFirstTypes = localizeTypes(
      { Label, Int64, String },
      {
        test: {
          BigInt: () => "Localized BigInt.",
          Int64: () => "Localized Int64.",
          MinLength1: () => "Localized MinLength1.",
          String: () => "Localized String.",
        },
      },
    ).test;
    const stringFirstTypes = localizeTypes(
      { String, Int64, Label },
      {
        test: {
          String: () => "Localized String.",
          MinLength1: () => "Localized MinLength1.",
          Int64: () => "Localized Int64.",
          BigInt: () => "Localized BigInt.",
        },
      },
    ).test;

    for (const types of [labelFirstTypes, stringFirstTypes]) {
      assertSame(types.Label.parent, types.String);

      const labelTypeResult = types.Label.fromUnknown(1);
      assertErr(labelTypeResult);
      assertEqual(
        types.Label.formatError(labelTypeResult.error),
        "Localized String.",
      );

      const labelLengthResult = types.Label.fromUnknown("");
      assertErr(labelLengthResult);
      assertEqual(
        types.Label.formatError(labelLengthResult.error),
        "Localized MinLength1.",
      );

      const int64TypeResult = types.Int64.fromUnknown(1);
      assertErr(int64TypeResult);
      assertEqual(
        types.Int64.formatError(int64TypeResult.error),
        "Localized BigInt.",
      );

      const int64RangeResult = types.Int64.fromUnknown(1n << 63n);
      assertErr(int64RangeResult);
      assertEqual(
        types.Int64.formatError(int64RangeResult.error),
        "Localized Int64.",
      );

      assertEqual(await types.Label["~standard"].validate(1), {
        issues: [{ message: "Localized String.", path: [] }],
      });
      assertEqual(await types.Int64["~standard"].validate(1n << 63n), {
        issues: [{ message: "Localized Int64.", path: [] }],
      });
    }
  });

  it("requires only the Object formatter for the predefined Object", async () => {
    const LocalizedObject = localizeTypes(
      { Object },
      { test: { Object: () => "Localized Object." } },
    ).test.Object;
    const symbol = globalThis.Symbol("metadata");
    const result = LocalizedObject.fromUnknown({ [symbol]: true });

    assertErr(result);
    assertEqual(LocalizedObject.formatError(result.error), "Localized Object.");
    assertEqual(
      await LocalizedObject["~standard"].validate({ [symbol]: true }),
      {
        issues: [{ message: "Localized Object.", path: [symbol] }],
      },
    );
  });

  it("preserves Type APIs without localizing typed boundary assertions", () => {
    const Strings = array(String);
    const types = localizeTypes(
      { PositiveNumber, String, Strings },
      {
        test: {
          Array: () => "Localized Array.",
          NonNegative: () => "Localized NonNegative.",
          Number: () => "Localized Number.",
          Positive: () => "Localized Positive.",
          String: () => "Localized String.",
        },
      },
    ).test;

    assertType<typeof types.Strings, typeof Strings>();
    assertSame(types.Strings.element, types.String);
    assertEqual(types.Strings.to(["Evolu"]), ["Evolu"]);

    const positiveError = { type: "Positive", value: 0 } as const;
    for (const operation of [
      () => types.PositiveNumber.from(0 as PositiveNumber),
      () => types.PositiveNumber.to(0 as PositiveNumber),
    ]) {
      assertAssertionError(operation, "Expected Positive.", positiveError);
    }

    const numberError = {
      type: "TypeOf",
      expected: "Number",
      value: "1",
    } as const;
    for (const operation of [
      () => types.PositiveNumber.from.parent.parent("1" as unknown as number),
      () => types.PositiveNumber.orThrow("1" as unknown as number),
      () => types.PositiveNumber.orNull("1" as unknown as number),
    ]) {
      assertAssertionError(operation, "Expected Number.", numberError);
    }
  });

  it("routes Tuple and Record child errors", () => {
    const Pair = tuple(String, Number);
    const Values = record(String, Number);
    const KeyedValues = record(regex("RecordKey", /^value$/u)(String), Number);
    const Model = object({ fixed: String }, record(String, String));
    const types = localizeTypes(
      { KeyedValues, Model, Pair, Values },
      {
        test: {
          Number: () => "Localized Number.",
          Object: () => "Localized Object.",
          Record: () => "Localized Record.",
          RecordKey: () => "Localized RecordKey.",
          String: () => "Localized String.",
          Tuple: () => "Localized Tuple.",
        },
      },
    ).test;

    const notTuple = types.Pair.fromUnknown(null);
    assertErr(notTuple);
    assertEqual(types.Pair.formatError(notTuple.error), "Localized Tuple.");

    const invalidTupleElement = types.Pair.fromUnknown(["value", false]);
    assertErr(invalidTupleElement);
    assertEqual(
      types.Pair.formatError(invalidTupleElement.error),
      "Localized Number.",
    );

    const notRecord = types.Values.fromUnknown(null);
    assertErr(notRecord);
    assertEqual(types.Values.formatError(notRecord.error), "Localized Record.");

    const invalidRecordValue = types.Values.fromUnknown({ value: false });
    assertErr(invalidRecordValue);
    assertEqual(
      types.Values.formatError(invalidRecordValue.error),
      "Localized Number.",
    );

    const invalidRecordKey = types.KeyedValues.fromUnknown({ invalid: 1 });
    assertErr(invalidRecordKey);
    assertEqual(
      types.KeyedValues.formatError(invalidRecordKey.error),
      "Localized RecordKey.",
    );

    const invalidObjectRest = types.Model.fromUnknown({
      fixed: "fixed",
      value: false,
    });
    assertErr(invalidObjectRest);
    assertEqual(
      types.Model.formatError(invalidObjectRest.error),
      "Localized String.",
    );
  });

  it("routes Set child errors and requires both formatters", () => {
    const Strings = set(String);
    const types = localizeTypes(
      { Strings },
      {
        test: {
          Set: () => "Localized Set.",
          String: () => "Localized String.",
        },
      },
    ).test;

    const notSet = types.Strings.fromUnknown(null);
    assertErr(notSet);
    assertEqual(types.Strings.formatError(notSet.error), "Localized Set.");

    const invalidElement = types.Strings.fromUnknown(new Set([1]));
    assertErr(invalidElement);
    assertEqual(
      types.Strings.formatError(invalidElement.error),
      "Localized String.",
    );

    const compileTimeAssertions = () => {
      localizeTypes(
        { Strings },
        {
          // @ts-expect-error String is missing.
          missingString: { Set: () => "Set." },
        },
      );
      localizeTypes(
        { Strings },
        {
          // @ts-expect-error Set is missing.
          missingSet: { String: () => "String." },
        },
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("lets a Union own its complete failure and localizes its members", () => {
    const Value = union(String, Number);
    const types = localizeTypes(
      { Value },
      {
        test: {
          Number: () => "Localized Number.",
          String: () => "Localized String.",
          Union: () => "Localized Union.",
        },
      },
    ).test;
    const result = types.Value.fromUnknown(null);
    const stringResult = types.Value.members[0].fromUnknown(1);

    assertErr(result);
    assertEqual(types.Value.formatError(result.error), "Localized Union.");
    assertFalse(globalThis.Object.is(types.Value.members[0], String));
    assertFalse(globalThis.Object.is(types.Value.members[1], Number));
    assertErr(stringResult);
    assertEqual(
      types.Value.members[0].formatError(stringResult.error),
      "Localized String.",
    );

    const compileTimeAssertions = () => {
      localizeTypes(
        { Value },
        {
          // @ts-expect-error Reflected Union members require their formatters.
          test: { Union: () => "Union." },
        },
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("localizes TemplateLiteral captures and their reflected Tuple", () => {
    const Part = literal("a");
    const Value = templateLiteralParser(Part);
    const types = localizeTypes(
      { Value },
      {
        test: {
          Literal: () => "Localized Literal.",
          String: () => "Localized String.",
          TemplateLiteral: () => "Localized TemplateLiteral.",
          Tuple: () => "Localized Tuple.",
        },
      },
    ).test;
    const result = types.Value.parts[0].fromUnknown("b");

    assertFalse(globalThis.Object.is(types.Value.parts[0], Part));
    assertSame(types.Value.output.elements[0], types.Value.parts[0]);
    assertSame(types.Value.parent.output, types.Value.output);
    assertSame(types.Value.parent.parts[0], types.Value.parts[0]);
    assertErr(result);
    assertEqual(
      types.Value.parts[0].formatError(result.error),
      "Localized Literal.",
    );

    const compileTimeAssertions = () => {
      localizeTypes(
        { Value },
        {
          // @ts-expect-error Reflected TemplateLiteral captures require their formatters.
          test: {
            String: () => "String.",
            TemplateLiteral: () => "TemplateLiteral.",
            Tuple: () => "Tuple.",
          },
        },
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("localizes fallible members of an infallible Union", () => {
    const Value = union(String, Unknown);
    const types = localizeTypes(
      { Value },
      { test: { String: () => "Localized String." } },
    ).test;
    const result = types.Value.members[0].fromUnknown(1);

    assertType<typeof types.Value.Error, never>();
    assertFalse(globalThis.Object.is(types.Value.members[0], String));
    assertFalse(globalThis.Object.is(types.Value.members[1], Unknown));
    assertErr(result);
    assertEqual(
      types.Value.members[0].formatError(result.error),
      "Localized String.",
    );

    const compileTimeAssertions = () => {
      localizeTypes(
        { Value },
        {
          // @ts-expect-error The reflected String member requires its formatter.
          test: {},
        },
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires fallible Types reachable only through reflection", () => {
    const Value = union(String, Unknown);
    const Values = array(Value);
    const NonEmptyValues = minLength(1)(Values);
    const Model = object({
      value: Value,
      optionalValue: optional(Value),
    });
    const types = localizeTypes(
      { Model, NonEmptyValues },
      {
        test: {
          Array: () => "Localized Array.",
          MinLength1: () => "Localized MinLength1.",
          Object: () => "Localized Object.",
          String: () => "Localized String.",
        },
      },
    ).test;

    assertSame(types.Model.props.value, types.NonEmptyValues.parent.element);
    assertSame(
      types.Model.props.optionalValue.type,
      types.NonEmptyValues.parent.element,
    );

    const result = types.Model.props.value.members[0].fromUnknown(1);
    assertErr(result);
    assertEqual(
      types.Model.props.value.members[0].formatError(result.error),
      "Localized String.",
    );

    const compileTimeAssertions = () => {
      localizeTypes(
        { Model, NonEmptyValues },
        {
          // @ts-expect-error Reflected String is reachable through the Object property and Array parent.
          test: {
            Array: () => "Array.",
            MinLength1: () => "MinLength1.",
            Object: () => "Object.",
          },
        },
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("routes DiscriminatedUnion member errors", () => {
    const Created = typed("Created", { value: String });
    const Deleted = typed("Deleted", { reason: Number });
    const Event = discriminatedUnion(Created, Deleted);
    const types = localizeTypes(
      { Event },
      {
        test: {
          DiscriminatedUnion: () => "Localized DiscriminatedUnion.",
          Literal: () => "Localized Literal.",
          Number: () => "Localized Number.",
          Object: () => "Localized Object.",
          String: () => "Localized String.",
        },
      },
    ).test;

    for (const [value, message] of [
      [null, "Localized DiscriminatedUnion."],
      [{ type: "Created" }, "Localized Object."],
      [{ type: "Created", value: 1 }, "Localized String."],
      [{ type: "Deleted", reason: false }, "Localized Number."],
    ] as const) {
      const result = types.Event.fromUnknown(value);
      assertErr(result);
      assertSame(types.Event.formatError(result.error), message);
    }
  });

  it("uses a custom root error type as its formatter key", () => {
    interface RootError extends TypeError<"RootError"> {
      readonly value: unknown;
    }
    const Root = createType(
      "Root",
      (value): Result<string, RootError> =>
        typeof value === "string"
          ? ok(value)
          : err({ type: "RootError", value }),
      () => "Root error.",
    );
    const types = localizeTypes(
      { Root },
      { test: { RootError: () => "Localized RootError." } },
    ).test;
    const result = types.Root.fromUnknown(1);

    assertErr(result);
    assertEqual(types.Root.formatError(result.error), "Localized RootError.");
  });

  it("does not treat an arbitrary outputError property as transparent", async () => {
    interface RefinedError extends TypeError<"Refined"> {
      readonly outputError: TypeOfError<"String">;
    }
    const Refined = createType(
      "Refined",
      (value): Result<string, RefinedError> =>
        err({
          type: "Refined",
          outputError: { type: "TypeOf", expected: "String", value },
        }),
      () => "Refined error.",
    );
    const LocalizedRefined = localizeTypes(
      { Refined },
      {
        test: {
          Refined: (error) => {
            assertType<typeof error, RefinedError>();
            return "Localized Refined.";
          },
        },
      },
    ).test.Refined;
    const result = LocalizedRefined.fromUnknown("value");
    const compileTimeAssertions = () => {
      localizeTypes(
        { Refined },
        {
          // @ts-expect-error Refined is required; outputError is not transparent.
          test: { String: () => "Localized String." },
        },
      );
    };

    assertErr(result);
    assertEqual(
      LocalizedRefined.formatError(result.error),
      "Localized Refined.",
    );
    assertEqual(await LocalizedRefined["~standard"].validate("value"), {
      issues: [{ message: "Localized Refined.", path: [] }],
    });
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("routes custom root TypeOf errors by their expected Types", async () => {
    const Text = createType(
      "Text",
      (value): Result<string, TypeOfError<"String">> =>
        typeof value === "string"
          ? ok(value)
          : err({ type: "TypeOf", expected: "String", value }),
      () => "Text error.",
    );
    const LocalizedText = localizeTypes(
      { Text },
      {
        test: {
          String: (error) => {
            assertType<typeof error, TypeOfError<"String">>();
            return "Localized String.";
          },
        },
      },
    ).test.Text;
    const BigInteger = createType(
      "BigInteger",
      (value): Result<bigint, TypeOfError<"BigInt">> =>
        typeof value === "bigint"
          ? ok(value)
          : err({ type: "TypeOf", expected: "BigInt", value }),
      () => "BigInteger error.",
    );
    const LocalizedBigInteger = localizeTypes(
      { BigInteger },
      {
        test: {
          BigInt: (error) => {
            assertType<typeof error, TypeOfError<"BigInt">>();
            return "Localized BigInt.";
          },
        },
      },
    ).test.BigInteger;
    const textResult = LocalizedText.fromUnknown(1);
    const bigIntegerResult = LocalizedBigInteger.fromUnknown(1);

    assertErr(textResult);
    assertEqual(
      LocalizedText.formatError(textResult.error),
      "Localized String.",
    );
    assertEqual(await LocalizedText["~standard"].validate(1), {
      issues: [{ message: "Localized String.", path: [] }],
    });
    assertErr(bigIntegerResult);
    assertEqual(
      LocalizedBigInteger.formatError(bigIntegerResult.error),
      "Localized BigInt.",
    );
    assertEqual(await LocalizedBigInteger["~standard"].validate(1), {
      issues: [{ message: "Localized BigInt.", path: [] }],
    });
  });

  it("routes parent, own, and output transformation errors", async () => {
    const NumberFromString = setupNumberFromString();
    const PositiveFromString = transform(
      "PositiveFromString",
      String,
      positive(Number),
      {
        from: (value) => ok(globalThis.Number(value)),
        to: globalThis.String,
      },
    );
    const types = localizeTypes(
      { NumberFromString, PositiveFromString },
      {
        test: {
          Number: () => "Localized Number.",
          NumberFromString: () => "Localized NumberFromString.",
          Positive: () => "Localized Positive.",
          String: () => "Localized String.",
        },
      },
    ).test;

    for (const [value, message] of [
      [null, "Localized String."],
      ["invalid", "Localized NumberFromString."],
    ] as const) {
      const result = types.NumberFromString.fromUnknown(value);
      assertErr(result);
      assertSame(types.NumberFromString.formatError(result.error), message);
    }

    const invalidOutput = types.PositiveFromString.fromUnknown("0");
    assertErr(invalidOutput);
    assertEqual(
      types.PositiveFromString.formatError(invalidOutput.error),
      "Localized Positive.",
    );
    assertEqual(await types.PositiveFromString["~standard"].validate("0"), {
      issues: [{ message: "Localized Positive.", path: [] }],
    });
  });

  it("infers formatters through directly recursive Lazy errors", () => {
    interface Tree {
      readonly value: string;
      readonly children: ReadonlyArray<Tree>;
    }
    interface TreeError extends ObjectError<{
      readonly value: TypeOfError<"String">;
      readonly children: ArrayError<TreeError>;
    }> {}
    const Tree: LazyType<Tree, Tree, never, TreeError, TreeError> = lazy(() =>
      object({ value: String, children: array(Tree) }),
    );
    const formatters = {
      Array: () => "Localized Array.",
      Object: () => "Localized Object.",
      String: () => "Localized String.",
    };
    const types = localizeTypes({ Tree }, { test: formatters }).test;
    const inputTypes = localizeTypes(
      { TreeInput: Tree.parent },
      { test: formatters },
    ).test;
    const result = types.Tree.fromUnknown({
      value: "root",
      children: [{ value: 1, children: [] }],
    });

    assertErr(result);
    assertEqual(types.Tree.formatError(result.error), "Localized String.");

    const inputResult = inputTypes.TreeInput.fromUnknown({
      value: 1,
      children: [],
    });
    assertErr(inputResult);
    assertEqual(
      inputTypes.TreeInput.formatError(inputResult.error),
      "Localized String.",
    );
  });

  it("infers formatters through mutually recursive Lazy errors", () => {
    interface Left {
      readonly label: string;
      readonly right?: Right;
    }
    interface Right {
      readonly count: number;
      readonly left?: Left;
    }
    interface LeftError extends ObjectError<{
      readonly label: TypeOfError<"String">;
      readonly right?: RightError;
    }> {}
    interface RightError extends ObjectError<{
      readonly count: TypeOfError<"Number">;
      readonly left?: LeftError;
    }> {}
    const Left: LazyType<Left, Left, never, LeftError, LeftError> = lazy(() =>
      object({ label: String, right: optional(Right) }),
    );
    const Right: LazyType<Right, Right, never, RightError, RightError> = lazy(
      () => object({ count: Number, left: optional(Left) }),
    );
    const types = localizeTypes(
      { Left, Right },
      {
        test: {
          Number: () => "Localized Number.",
          Object: () => "Localized Object.",
          String: () => "Localized String.",
        },
      },
    ).test;
    const result = types.Left.fromUnknown({
      label: "left",
      right: { count: "invalid" },
    });

    assertErr(result);
    assertEqual(types.Left.formatError(result.error), "Localized Number.");
  });

  it("snapshots each locale formatter set", () => {
    const formatters = { String: () => "First formatter." };
    const types = localizeTypes(
      { String, Text: String },
      { test: formatters },
    ).test;

    formatters.String = () => "Replacement formatter.";

    const result = types.String.fromUnknown(1);
    assertErr(result);
    assertEqual(types.String.formatError(result.error), "First formatter.");
    assertSame(types.Text, types.String);
  });

  it("requires plain string-keyed maps", () => {
    const selected = globalThis.Symbol("selected");
    const locale = globalThis.Symbol("locale");
    const compileTimeAssertions = () => {
      localizeTypes(
        // @ts-expect-error Selected Type names must be strings.
        { [selected]: String },
        { en: { String: () => "String." } },
      );
      localizeTypes(
        { String },
        // @ts-expect-error Locale names must be strings.
        { [locale]: { String: () => "String." } },
      );
    };

    const selectedByName = { [selected]: String } as unknown as {
      readonly String: typeof String;
    };
    const selectedMapError = assertThrowsInstanceOf(
      () =>
        localizeTypes(selectedByName, {
          en: { String: () => "String." },
        }),
      Error,
    );
    assertTrue(
      selectedMapError.message.includes(
        "localizeTypes maps must be plain objects with own enumerable string-keyed data properties.",
      ),
    );

    const formatters = { String: () => "String." };
    const formattersByLocale = globalThis.Object.defineProperty({}, "en", {
      value: formatters,
      enumerable: false,
    }) as { readonly en: typeof formatters };
    const localeMapError = assertThrowsInstanceOf(
      () => localizeTypes({ String }, formattersByLocale),
      Error,
    );
    assertTrue(
      localeMapError.message.includes(
        "localizeTypes maps must be plain objects with own enumerable string-keyed data properties.",
      ),
    );

    let reads = 0;
    const accessorFormatters = globalThis.Object.defineProperty({}, "String", {
      enumerable: true,
      get: () => {
        reads++;
        return () => "String.";
      },
    }) as { readonly String: () => string };
    const accessorMapError = assertThrowsInstanceOf(
      () => localizeTypes({ String }, { en: accessorFormatters }),
      Error,
    );
    assertTrue(
      accessorMapError.message.includes(
        "localizeTypes maps must be plain objects with own enumerable string-keyed data properties.",
      ),
    );
    assertEqual(reads, 0);

    class EnglishFormatters {
      String(): string {
        return "String.";
      }
    }
    const prototypeMapError = assertThrowsInstanceOf(
      () => localizeTypes({ String }, { en: new EnglishFormatters() }),
      Error,
    );
    assertTrue(
      prototypeMapError.message.includes(
        "localizeTypes maps must be plain objects with own enumerable string-keyed data properties.",
      ),
    );

    const customRoot = globalThis.Object.create(null) as object;
    const customPrototypeFormatters = globalThis.Object.assign(
      globalThis.Object.create(customRoot) as object,
      { String: () => "String." },
    ) as { readonly String: () => string };
    const customPrototypeMapError = assertThrowsInstanceOf(
      () => localizeTypes({ String }, { en: customPrototypeFormatters }),
      Error,
    );
    assertTrue(
      customPrototypeMapError.message.includes(
        "localizeTypes maps must be plain objects with own enumerable string-keyed data properties.",
      ),
    );

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires exactly the reachable formatters", () => {
    const Label = minLength(1)(String);
    // A stored map bypasses TypeScript's object-literal excess-property check.
    const formatters = {
      MinLength1: () => "MinLength1.",
      String: () => "String.",
    };
    const excessFormatters = {
      ...formatters,
      Number: () => "Number.",
    };
    const compileTimeAssertions = () => {
      localizeTypes({ Label }, { valid: formatters });
      localizeTypes(
        { Label },
        {
          // @ts-expect-error String is missing.
          missing: { MinLength1: () => "Missing String." },
        },
      );
      localizeTypes(
        { Label },
        // @ts-expect-error Number is not reachable.
        {
          excess: {
            MinLength1: () => "MinLength1.",
            String: () => "String.",
            Number: () => "Number.",
          },
        },
      );
      localizeTypes(
        { Label },
        // @ts-expect-error Number is not reachable through a stored formatter map.
        {
          excessStored: excessFormatters,
        },
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires formatters for every union-typed selection branch", () => {
    type Selected =
      { readonly String: typeof String } | { readonly Number: typeof Number };
    const localize = (selected: Selected) =>
      localizeTypes(selected, {
        test: {
          Number: () => "Localized Number.",
          String: () => "Localized String.",
        },
      }).test;

    const StringTypes = localize({ String });
    assert("String" in StringTypes, "Expected localized String Types.");
    const stringResult = StringTypes.String.fromUnknown(1);
    assertErr(stringResult);
    assertEqual(
      StringTypes.String.formatError(stringResult.error),
      "Localized String.",
    );

    const NumberTypes = localize({ Number });
    assert("Number" in NumberTypes, "Expected localized Number Types.");
    const numberResult = NumberTypes.Number.fromUnknown("1");
    assertErr(numberResult);
    assertEqual(
      NumberTypes.Number.formatError(numberResult.error),
      "Localized Number.",
    );

    const compileTimeAssertions = (selected: Selected) => {
      localizeTypes(selected, {
        // @ts-expect-error Every possible selection branch requires its formatter.
        test: {},
      });
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });
});

describe("createType", () => {
  it("creates a root Type", () => {
    interface AnswerError extends TypeError<"Answer"> {
      readonly value: unknown;
    }

    const Answer = createType(
      "Answer",
      (value): Result<42, AnswerError> =>
        value === 42 ? ok(value) : err({ type: "Answer", value }),
      () => "The answer must be 42.",
    );
    type Answer = typeof Answer.Output;

    const answer: Answer = 42;

    assertEqual(Answer.fromUnknown(answer), ok(42));
    assertEqual(Answer.fromUnknown(41), err({ type: "Answer", value: 41 }));
    assertEqual(
      Answer.formatError({ type: "Answer", value: 41 }),
      "The answer must be 42.",
    );

    const invalid = 41 as 42;
    const cause = { type: "Answer", value: 41 };

    for (const operation of [
      () => Answer.from(invalid),
      () => Answer.to(invalid),
      () => Answer.orThrow(invalid),
      () => Answer.orNull(invalid),
    ]) {
      assertAssertionError(operation, "Expected Answer.", cause);
    }
  });

  it("creates a child Type with inherited errors", () => {
    const NonEmptyString = createType(
      "NonEmptyString",
      String,
      (value): Result<string, NonEmptyStringError> =>
        value.length > 0 ? ok(value) : err({ type: "NonEmptyString", value }),
      (error) => {
        assertType<typeof error, NonEmptyStringError>();
        return "Enter some text.";
      },
    );

    interface NonEmptyStringError extends TypeError<"NonEmptyString"> {
      readonly value: string;
    }

    assertSame(NonEmptyString.parent, String);
    assertType<typeof NonEmptyString.parent, typeof String>();
    assertType<typeof NonEmptyString.Input, string>();
    assertType<typeof NonEmptyString.Output, string>();
    assertType<typeof NonEmptyString.Error, NonEmptyStringError>();

    assertEqual(NonEmptyString.fromUnknown("Evolu"), ok("Evolu"));
    assertEqual(
      NonEmptyString.fromUnknown(42),
      err({ type: "TypeOf", expected: "String", value: 42 }),
    );
    assertEqual(
      NonEmptyString.fromUnknown(""),
      err({ type: "NonEmptyString", value: "" }),
    );
    assertEqual(
      NonEmptyString.from.parent(""),
      err({ type: "NonEmptyString", value: "" }),
    );
    assertEqual(
      NonEmptyString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
      "A value 42 is not a string.",
    );
    assertEqual(
      NonEmptyString.formatError({ type: "NonEmptyString", value: "" }),
      "Enter some text.",
    );
  });

  it("asserts that validation callbacks preserve identity", () => {
    const Model = object({ value: Number });
    const Invalid = createType("InvalidRefinement", Model, (value) =>
      ok({ ...value }),
    );
    const InvalidRoot = createType(
      "InvalidRootRefinement",
      (value): Result<object> => ok({ ...(value as object) }),
      () => "",
    );
    const value = { value: 1 };

    const rootError = assertThrowsInstanceOf(
      () => InvalidRoot.fromUnknown(value),
      Error,
    );
    assertTrue(
      rootError.message.includes("A Type refinement must return its input."),
    );
    const fromUnknownError = assertThrowsInstanceOf(
      () => Invalid.fromUnknown(value),
      Error,
    );
    assertTrue(
      fromUnknownError.message.includes(
        "A Type refinement must return its input.",
      ),
    );
    const parentError = assertThrowsInstanceOf(
      () => Invalid.from.parent(value),
      Error,
    );
    assertTrue(
      parentError.message.includes("A Type refinement must return its input."),
    );
  });

  it("requires a child Output to narrow its parent Output", () => {
    interface FortyTwoError extends TypeError<"FortyTwo"> {
      readonly value: number;
    }

    interface FallibleLengthError extends TypeError<"FallibleLength"> {
      readonly value: string;
    }

    const FortyTwo = createType(
      "FortyTwo",
      Number,
      (value): Result<42, FortyTwoError> =>
        value === 42 ? ok(value) : err({ type: "FortyTwo", value }),
      () => "Enter 42.",
    );

    assertEqual(FortyTwo.from(42), ok(42));
    assertType<typeof FortyTwo.Output, 42>();

    const compileTimeAssertions = () => {
      createType(
        "Length",
        String,
        // @ts-expect-error A child Type cannot change its parent's representation.
        (value) => ok(value.length),
      );
      createType(
        "FallibleLength",
        String,
        (value): Result<number, FallibleLengthError> =>
          // @ts-expect-error A child Type cannot change its parent's representation.
          value.length > 0
            ? ok(value.length)
            : err({ type: "FallibleLength", value }),
        () => "Enter some text.",
      );
      createType(
        "FortyTwo",
        Number,
        (_value): Result<42> => ok(42),
        // @ts-expect-error An infallible child Type must not provide a formatter.
        () => "Unreachable.",
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires a formatter for root and fallible child Types", () => {
    interface ChildWithoutFormatterError extends TypeError<"ChildWithoutFormatter"> {
      readonly value: string;
    }

    const fromChildWithoutFormatter = (
      value: string,
    ): Result<never, ChildWithoutFormatterError> =>
      err({ type: "ChildWithoutFormatter", value });

    const compileTimeAssertions = () => {
      // @ts-expect-error A root Type must format its validation errors.
      createType("RootWithoutFormatter", (_value): Result<never, TypeError> =>
        err({ type: "RootWithoutFormatter" }),
      );
      // @ts-expect-error A fallible child Type must format its own error.
      createType("ChildWithoutFormatter", String, fromChildWithoutFormatter);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("inherits the parent formatter when a child is infallible", () => {
    const IdentityString = createType("IdentityString", String, ok);

    assertType<typeof IdentityString.Error, never>();
    assertType<InferErrors<typeof IdentityString>, TypeOfError<"String">>();
    assertSame(IdentityString.formatError, String.formatError);
    assertType<
      Parameters<typeof IdentityString.formatError>[0],
      TypeOfError<"String">
    >();
  });

  it("does not widen its error from a broad formatter", () => {
    interface RefinedStringError extends TypeError<"RefinedString"> {
      readonly value: string;
    }

    const RefinedString = createType(
      "RefinedString",
      String,
      (value): Result<string, RefinedStringError> =>
        err({ type: "RefinedString", value }),
      formatTestTypeError,
    );

    assertType<typeof RefinedString.Error, RefinedStringError>();
    assertType<
      InferErrors<typeof RefinedString>,
      TypeOfError<"String"> | RefinedStringError
    >();
    assertEqual(
      RefinedString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
      "A value 42 is not a string.",
    );
    assertEqual(
      RefinedString.formatError({ type: "RefinedString", value: "value" }),
      "RefinedString",
    );
  });

  it("rejects an error type inherited from the parent Type", () => {
    interface DuplicateTypeOfError extends TypeError<"TypeOf"> {
      readonly value: string;
    }

    const compileTimeAssertions = () => {
      createType(
        "TypeOf",
        // @ts-expect-error A child error type must not duplicate an inherited error type.
        String,
        (value: string): Result<string, DuplicateTypeOfError> =>
          err({ type: "TypeOf", value }),
        () => "Duplicate TypeOf error.",
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires one concrete name for a fallible child Type", () => {
    interface AError extends TypeError<"A"> {
      readonly value: string;
    }

    const unionName = "A" as "A" | "B";
    const broadName = "A" as Capitalize<string>;
    const patternedName = "A" as `A${string}`;
    const from = (value: string): Result<string, AError> =>
      err({ type: "A", value });
    const formatError = () => "A error.";

    const compileTimeAssertions = () => {
      // @ts-expect-error A union does not identify one concrete Type name.
      createType(unionName, String, from, formatError);
      // @ts-expect-error A widened string does not identify one concrete Type name.
      createType(broadName, String, from, formatError);
      // @ts-expect-error A template pattern does not identify one concrete Type name.
      createType(patternedName, String, from, formatError);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires one concrete name for root and infallible child Types", () => {
    const unionName = "A" as "A" | "B";
    const broadName = "A" as Capitalize<string>;
    const patternedName = "A" as `A${string}`;
    const genericCompileTimeAssertion = <Name extends "A" | "B">(
      name: Name,
    ): Name => {
      // @ts-expect-error An unresolved generic root name might be a union.
      createType(name, ok, () => "Generic root error.");
      // @ts-expect-error An unresolved generic child name might be a union.
      createType(name, String, ok);
      return name;
    };
    const compileTimeAssertions = () => {
      // @ts-expect-error A union does not identify one concrete root Type name.
      createType(unionName, ok, () => "Root error.");
      // @ts-expect-error A widened string does not identify one concrete root Type name.
      createType(broadName, ok, () => "Root error.");
      // @ts-expect-error A template pattern does not identify one concrete root Type name.
      createType(patternedName, ok, () => "Root error.");
      // @ts-expect-error A union does not identify one concrete child Type name.
      createType(unionName, String, ok);
      // @ts-expect-error A widened string does not identify one concrete child Type name.
      createType(broadName, String, ok);
      // @ts-expect-error A template pattern does not identify one concrete child Type name.
      createType(patternedName, String, ok);
    };

    assertType<
      typeof genericCompileTimeAssertion extends (
        ...args: Array<never>
      ) => unknown
        ? true
        : false,
      true
    >();
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects a parent with erased concrete Type information", () => {
    const erased: FormattableTypeNode = brand("ErasedParent", String);

    const compileTimeAssertions = <
      Parent extends typeof String | typeof Number,
    >(
      parent: Parent,
    ): Parent => {
      // @ts-expect-error A parent must preserve its concrete Type.
      createType("Child", erased, ok);
      // @ts-expect-error An unresolved generic parent might be a union.
      createType("GenericChild", parent, ok);
      return parent;
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires a child error type matching the child name", () => {
    interface DifferentNameError extends TypeError<"DifferentName"> {
      readonly value: string;
    }

    const compileTimeAssertions = () => {
      createType(
        "ChildName",
        String,
        // @ts-expect-error A child error type must match the child Type name.
        (value: string): Result<string, DifferentNameError> =>
          err({ type: "DifferentName", value }),
        () => "Different name error.",
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  describe("Type", () => {
    describe("Unknown", () => {
      it("has the expected root Type definition", () => {
        assertEqual(Unknown.name, "Unknown");
        assertType<typeof Unknown.name, "Unknown">();
        assertType<typeof Unknown.Input, unknown>();
        assertType<typeof Unknown.Output, unknown>();
        assertType<typeof Unknown.Error, never>();
        assertType<typeof Unknown.parent, null>();
      });

      it("accepts every value without changing it", () => {
        const values: ReadonlyArray<unknown> = [
          undefined,
          null,
          "value",
          42,
          42n,
          true,
          globalThis.Symbol("value"),
          () => undefined,
          {},
        ];

        for (const value of values) {
          const result = Unknown.fromUnknown(value);

          assertOk(result);
          assertSame(result.value, value);
          assertTrue(Unknown.is(value));
        }
      });

      it("cannot return a validation error", () => {
        assertType<ReturnType<typeof Unknown.fromUnknown>, Result<unknown>>();
        assertType<Parameters<typeof Unknown.formatError>[0], never>();
      });
    });

    describe("EvoluType", () => {
      it("has the expected root Type definition", () => {
        assertEqual(EvoluType.name, "EvoluType");
        assertType<
          typeof EvoluType,
          Type<"EvoluType", AnyType, AnyType, EvoluTypeError>
        >();
        assertType<
          EvoluTypeError extends TypeValueError<"EvoluType"> ? true : false,
          true
        >();
      });

      it("recognizes root, composed, and localized Types", () => {
        const LocalizedString = localizeTypes(
          { String },
          { test: { String: () => "Localized String." } },
        ).test.String;
        const types: ReadonlyArray<AnyType> = [
          String,
          NonEmptyTrimmedString,
          array(String),
          union(String, Number),
          LocalizedString,
          EvoluType,
        ];

        for (const type of types) {
          assertTrue(EvoluType.is(type));
          assertEqual(EvoluType.fromUnknown(type), ok(type));
        }
      });

      it("rejects values without the Type instance identity", () => {
        const values: ReadonlyArray<unknown> = [
          undefined,
          null,
          "Type",
          () => undefined,
          {},
          { "~evolu/instance": "Other" },
        ];

        for (const value of values) {
          assertFalse(EvoluType.is(value));
          assertEqual(
            EvoluType.fromUnknown(value),
            err({ type: "EvoluType", value }),
          );
        }
      });

      it("formats its validation error", () => {
        assertEqual(
          EvoluType.formatError({ type: "EvoluType", value: "Type" }),
          'A value "Type" is not an Evolu Type.',
        );
      });

      it("asserts an unknown value as a composable Type", () => {
        const value: unknown = String;

        assertType(EvoluType, value);
        assertType<typeof value, AnyType>();

        const Values = array(value);
        assertEqual(Values.fromUnknown(["value"]), ok(["value"]));
      });
    });

    describe("Never", () => {
      it("has the expected root Type definition", () => {
        assertEqual(Never.name, "Never");
        assertType<typeof Never.name, "Never">();
        assertType<typeof Never.Input, never>();
        assertType<typeof Never.Output, never>();
        assertType<typeof Never.Error, NeverError>();
        assertType<
          NeverError extends TypeValueError<"Never"> ? true : false,
          true
        >();
        assertType<typeof Never.parent, null>();
      });

      it("rejects every value with a Never error containing the rejected value", () => {
        const values: ReadonlyArray<unknown> = [
          undefined,
          null,
          "value",
          42,
          42n,
          true,
          globalThis.Symbol("value"),
          () => undefined,
          {},
        ];

        for (const value of values) {
          assertEqual(Never.fromUnknown(value), err({ type: "Never", value }));
          assertFalse(Never.is(value));
        }
      });

      it("cannot return a validated value", () => {
        assertType<
          ReturnType<typeof Never.fromUnknown>,
          Result<never, NeverError>
        >();
      });

      it("formats its validation error", () => {
        assertEqual(
          Never.formatError({ type: "Never", value: 42 }),
          "A value 42 is not valid for type Never.",
        );
      });
    });
  });
});

describe("transform", () => {
  it("creates a Type between encoded and output Types", () => {
    const NumberFromString = setupNumberFromString();

    assertSame(NumberFromString.parent, String);
    assertSame(NumberFromString.output, Number);
    assertType<
      typeof NumberFromString,
      TransformType<
        typeof String,
        typeof Number,
        "NumberFromString",
        NumberFromStringError
      >
    >();
    assertType<typeof NumberFromString.Input, string>();
    assertType<typeof NumberFromString.Output, number>();
    assertType<
      typeof NumberFromString.Error,
      TransformError<"NumberFromString", NumberFromStringError, never>
    >();
    assertType<
      InferErrors<typeof NumberFromString>,
      | TypeOfError<"String">
      | TransformError<"NumberFromString", NumberFromStringError, never>
    >();
  });

  it("transforms from its parent Output to its own Output", () => {
    const NumberFromString = setupNumberFromString();

    assertEqual(NumberFromString.fromUnknown("42"), ok(42));
    assertEqual(NumberFromString.from.parent("42"), ok(42));
    assertEqual(
      NumberFromString.fromUnknown(42),
      err({ type: "TypeOf", expected: "String", value: 42 }),
    );
    assertEqual(
      NumberFromString.from.parent("not a number"),
      err({
        type: "NumberFromString",
        value: "not a number",
      }),
    );
  });

  it("satisfies Output round-tripping and stable Input normalization", () => {
    const NumberFromString = setupNumberFromString();
    const outputs = [
      1.5,
      -0,
      globalThis.Number.NaN,
      globalThis.Number.POSITIVE_INFINITY,
      globalThis.Number.NEGATIVE_INFINITY,
    ];

    for (const output of outputs) {
      const encoded = NumberFromString.to(output);
      const decoded = getOrThrow(NumberFromString.from.parent(encoded));

      assertSame(decoded, output);
    }

    const normalized = NumberFromString.to(
      getOrThrow(NumberFromString.from.parent("01")),
    );

    assertEqual(normalized, "1");
    assertSame(
      NumberFromString.to(getOrThrow(NumberFromString.from.parent(normalized))),
      normalized,
    );
    {
      const actual = NumberFromString.to(42);
      assertType<typeof actual, string>();
    }
  });

  it("round-trips Boolean and yes/no representations", () => {
    const YesOrNo = union(literal("yes"), literal("no"));
    const YesOrNoFromBoolean = transform(
      "YesOrNoFromBoolean",
      Boolean,
      YesOrNo,
      {
        from: (value) => ok(value ? "yes" : "no"),
        to: (value) => value === "yes",
      },
    );

    assertEqual(YesOrNoFromBoolean.fromUnknown(true), ok("yes"));
    assertEqual(YesOrNoFromBoolean.fromUnknown(false), ok("no"));
    assertTrue(YesOrNoFromBoolean.to("yes"));
    assertFalse(YesOrNoFromBoolean.to("no"));
    assertType<typeof YesOrNoFromBoolean.Input, boolean>();
    assertType<typeof YesOrNoFromBoolean.Output, "yes" | "no">();
  });

  it("narrows unknown values on the output side", () => {
    const NumberFromString = setupNumberFromString();
    const value: unknown = 42;

    assert(NumberFromString.is(value), "Expected NumberFromString.");
    assertFalse(NumberFromString.is("42"));
    assertType<typeof value, number>();
  });

  it("runs and formats the complete output Type pipeline", () => {
    interface PositiveNumberError extends TypeError<"PositiveNumber"> {
      readonly value: number;
    }

    interface PositiveNumberFromStringError extends TypeError<"PositiveNumberFromString"> {
      readonly value: string;
    }

    const PositiveNumber = brand(
      "PositiveNumber",
      Number,
      (value) =>
        value > 0
          ? ok()
          : err<PositiveNumberError>({ type: "PositiveNumber", value }),
      () => "Enter a positive number.",
    );
    const PositiveNumberFromString = transform(
      "PositiveNumberFromString",
      String,
      PositiveNumber,
      {
        from: (value): Result<number, PositiveNumberFromStringError> => {
          const number = globalThis.Number(value);
          return globalThis.Number.isFinite(number)
            ? ok(number)
            : err({ type: "PositiveNumberFromString", value });
        },
        to: globalThis.String,
      },
      () => "Enter a number.",
    );

    assertType<
      typeof PositiveNumberFromString.Error,
      TransformError<
        "PositiveNumberFromString",
        PositiveNumberFromStringError,
        PositiveNumberError
      >
    >();

    assertEqual(
      PositiveNumberFromString.from.parent("-1"),
      err({
        type: "PositiveNumberFromString",
        outputError: { type: "PositiveNumber", value: -1 },
      }),
    );
    assertEqual(
      PositiveNumberFromString.formatError({
        type: "PositiveNumberFromString",
        outputError: { type: "PositiveNumber", value: -1 },
      }),
      "Enter a positive number.",
    );
    assertTrue(PositiveNumberFromString.is(1));
    assertFalse(PositiveNumberFromString.is(-1));
  });

  it("composes Object parent and output pipelines", () => {
    const NumberFromString = setupNumberFromString();
    const Positive = brand(
      "Positive",
      Number,
      (value) => (value > 0 ? ok() : err({ type: "Positive", value })),
      formatTestTypeError,
    );

    const EncodedModel = object({
      value: NumberFromString,
      note: optional(String),
    });
    const OutputModel = object({
      value: Positive,
      note: optional(String),
    });
    const PositiveModelFromStrings = transform(
      "PositiveModelFromStrings",
      EncodedModel,
      OutputModel,
      { from: ok, to: (value) => value },
    );
    const encoded = { value: "42", note: "answer" };
    const output = {
      value: 42 as typeof Positive.Output,
      note: "answer",
    };
    const result = PositiveModelFromStrings.from.parent.parent(encoded);
    const orThrowResult = PositiveModelFromStrings.orThrow(encoded);
    const orNullResult = PositiveModelFromStrings.orNull(encoded);

    assertOk(result, output);
    assertFalse(globalThis.Object.is(result.value, encoded));
    assertEqual(orThrowResult, output);
    assertEqual(orNullResult, output);
    assertSame(PositiveModelFromStrings.orNull({ value: "-1" }), null);
    assertType<
      Parameters<typeof PositiveModelFromStrings.orThrow>[0],
      typeof PositiveModelFromStrings.Input
    >();
    assertType<typeof orThrowResult, typeof PositiveModelFromStrings.Output>();
    assertType<
      typeof orNullResult,
      typeof PositiveModelFromStrings.Output | null
    >();
    assertEqual(PositiveModelFromStrings.to(output), encoded);
    assertEqual(
      PositiveModelFromStrings.from.parent.parent({ value: "no" }),
      err({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            value: { type: "NumberFromString", value: "no" },
          },
        },
      }),
    );
    const outputResult = PositiveModelFromStrings.from.parent.parent({
      value: "-1",
    });

    assertEqual(
      outputResult,
      err({
        type: "PositiveModelFromStrings",
        outputError: {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: { type: "Positive", value: -1 },
            },
          },
        },
      }),
    );
    assertType<
      typeof outputResult,
      Result<
        typeof PositiveModelFromStrings.Output,
        typeof EncodedModel.Error | typeof PositiveModelFromStrings.Error
      >
    >();
    assertType<
      typeof PositiveModelFromStrings.Error,
      TransformError<
        "PositiveModelFromStrings",
        never,
        typeof OutputModel.Error
      >
    >();
  });

  it("composes total encoding through its output Type", () => {
    const NumberFromString = setupNumberFromString();
    const ReencodedNumber = transform(
      "ReencodedNumber",
      String,
      NumberFromString,
      { from: ok, to: (value) => value },
    );

    assertEqual(ReencodedNumber.from.parent("42"), ok(42));
    assertEqual(ReencodedNumber.to(1.5), "1.5");
  });

  it("stops encoding at each typed parent boundary", () => {
    const NumberFromString = setupNumberFromString();
    const BooleanFromNumberString = transform(
      "BooleanFromNumberString",
      NumberFromString,
      Boolean,
      {
        from: (value) => ok(value !== 0),
        to: (value) => (value ? 1 : 0),
      },
    );

    assertEqual(BooleanFromNumberString.to(true), "1");
    assertEqual(BooleanFromNumberString.to.parent(true), 1);
    assertEqual(BooleanFromNumberString.to.parent.parent(true), "1");
    {
      const actual = BooleanFromNumberString.to.parent(true);
      assertType<typeof actual, typeof NumberFromString.Output>();
    }
    {
      const actual = BooleanFromNumberString.to.parent.parent(true);
      assertType<typeof actual, string>();
    }
    assertFalse("parent" in BooleanFromNumberString.to.parent.parent);

    const Values = array(BooleanFromNumberString);
    const values = [true, false];

    assertEqual(Values.to(values), ["1", "0"]);
    assertEqual(Values.to.parent(values), [1, 0]);
    assertEqual(Values.to.parent.parent(values), ["1", "0"]);
    {
      const actual = Values.to.parent(values);
      assertType<typeof actual, ReadonlyArray<number>>();
    }
    {
      const actual = Values.to.parent.parent(values);
      assertType<typeof actual, ReadonlyArray<string>>();
    }
  });

  it("formats inherited and own transformation errors", () => {
    const NumberFromString = setupNumberFromString();

    assertEqual(
      NumberFromString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
      "A value 42 is not a string.",
    );
    assertEqual(
      NumberFromString.formatError({
        type: "NumberFromString",
        value: "no",
      }),
      "The value no is not a number.",
    );
  });

  it("preserves callback errors containing an Output-shaped reason", () => {
    interface DecodeReason extends TypeError<"DecodeReason"> {
      readonly kind: "Output";
      readonly message: string;
    }

    interface NumberFromTextError extends TypeError<"NumberFromText"> {
      readonly reason: DecodeReason;
    }

    const decodeNumber = (value: string): Result<number, NumberFromTextError> =>
      err({
        type: "NumberFromText",
        reason: {
          type: "DecodeReason",
          kind: "Output",
          message: `The value ${value} cannot be decoded.`,
        },
      });
    const NumberFromText = transform(
      "NumberFromText",
      String,
      Number,
      { from: decodeNumber, to: globalThis.String },
      () => "Enter a number.",
    );
    const error: NumberFromTextError = {
      type: "NumberFromText",
      reason: {
        type: "DecodeReason",
        kind: "Output",
        message: "The value no cannot be decoded.",
      },
    };

    assertEqual(NumberFromText.from.parent("no"), err(error));
    assertEqual(NumberFromText.formatError(error), "Enter a number.");
  });

  it("composes total encoding through refinements", () => {
    const NumberFromString = setupNumberFromString();
    const PositiveNumber = brand(
      "PositiveNumber",
      NumberFromString,
      (value) => (value > 0 ? ok() : err({ type: "PositiveNumber", value })),
      formatTestTypeError,
    );

    const positive = getOrThrow(PositiveNumber.from.parent.parent("42"));
    const positiveNonInteger = getOrThrow(
      PositiveNumber.from.parent.parent("1.5"),
    );

    assertEqual(PositiveNumber.to(positive), "42");
    assertEqual(PositiveNumber.to(positiveNonInteger), "1.5");
  });

  it("composes decoding and encoding transformations", () => {
    const NumberFromString = setupNumberFromString();
    const BooleanFromNumberString = transform(
      "BooleanFromNumberString",
      NumberFromString,
      Boolean,
      {
        from: (value) => ok(value !== 0),
        to: (value) => (value ? 1 : 0),
      },
    );

    assertEqual(BooleanFromNumberString.from.parent.parent("1"), ok(true));
    assertEqual(BooleanFromNumberString.from.parent(0), ok(false));
    assertEqual(BooleanFromNumberString.to(true), "1");
  });

  it("requires a formatter exactly when decoding adds an own error", () => {
    const compileTimeAssertions = () => {
      interface MissingFormatterError extends TypeError<"MissingFormatter"> {
        readonly value: string;
      }

      transform("MissingFormatter", String, Number, {
        from: (value): Result<number, MissingFormatterError> =>
          // @ts-expect-error A fallible transformation must format its own errors.
          err({ type: "MissingFormatter", value }),
        to: globalThis.String,
      });
      transform(
        "UnnecessaryFormatter",
        String,
        Number,
        {
          from: () => ok(42),
          to: () => "42",
        },
        // @ts-expect-error An infallible transformation has no own error to format.
        formatTestTypeError,
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires callbacks to return their declared boundary types", () => {
    const compileTimeAssertions = () => {
      transform("InvalidOutput", String, Number, {
        // @ts-expect-error A callback must return the output Type Input.
        from: () => ok("not a number"),
        to: globalThis.String,
      });
      transform("InvalidInput", String, Number, {
        from: () => ok(42),
        // @ts-expect-error An encoder must return the parent Type Output.
        to: () => 42,
      });
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("asserts successful decoding callback results", () => {
    const Invalid = transform("InvalidTransformFrom", String, Number, {
      from: () => ok("not a number" as unknown as number),
      to: globalThis.String,
    });

    const cause = {
      type: "TypeOf",
      expected: "Number",
      value: "not a number",
    } as const;

    assertAssertionError(
      () => Invalid.fromUnknown("value"),
      "Expected Number.",
      cause,
    );
    assertAssertionError(
      () => Invalid.from.parent("value"),
      "Expected Number.",
      cause,
    );
  });

  it("asserts encoding inputs and callback results", () => {
    const NumberFromString = setupNumberFromString();
    const Invalid = transform("InvalidTransformTo", String, Number, {
      from: () => ok(42),
      to: () => 42 as unknown as string,
    });

    assertEqual(NumberFromString.fromUnknown("42"), ok(42));
    assertAssertionError(
      () => NumberFromString.to("42" as unknown as number),
      "Expected NumberFromString.",
      {
        type: "NumberFromString",
        outputError: {
          type: "TypeOf",
          expected: "Number",
          value: "42",
        },
      },
    );
    assertAssertionError(
      () => NumberFromString.to.parent("42" as unknown as number),
      "Expected NumberFromString.",
      {
        type: "NumberFromString",
        outputError: {
          type: "TypeOf",
          expected: "Number",
          value: "42",
        },
      },
    );
    assertAssertionError(() => Invalid.to(42), "Expected String.", {
      type: "TypeOf",
      expected: "String",
      value: 42,
    });
    assertAssertionError(() => Invalid.to.parent(42), "Expected String.", {
      type: "TypeOf",
      expected: "String",
      value: 42,
    });
  });

  it("rejects fallible parent and output Types with erased concrete information", () => {
    const PositiveNumber = brand(
      "PositiveNumber",
      Number,
      (value) => (value > 0 ? ok() : err({ type: "PositiveNumber", value })),
      () => "Enter a positive number.",
    );
    const erased: FormattableTypeNode = PositiveNumber;

    const compileTimeAssertions = () => {
      // @ts-expect-error A parent must preserve its concrete Type.
      transform("ErasedParent", erased, Number, {
        from: () => ok(42),
        to: () => 42,
      });
      // @ts-expect-error An output Type must preserve its concrete Type.
      transform("ErasedOutput", String, erased, {
        from: () => ok(-1),
        to: globalThis.String,
      });
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects unresolved generic parent and output Types", () => {
    const _A = literal("a");
    const _B = literal("b");

    const compileTimeAssertions = <
      Parent extends typeof String | typeof Number,
      Output extends typeof _A | typeof _B,
    >(
      parent: Parent,
      output: Output,
    ): readonly [Parent, Output] => {
      // @ts-expect-error An unresolved generic parent might be a union.
      transform("GenericParent", parent, Number, {
        from: () => ok(1),
        to: () => "1",
      });
      // @ts-expect-error An unresolved generic output might be a union.
      transform("GenericOutput", String, output, {
        from: (value) => ok(value),
        to: (value) => value,
      });
      return [parent, output];
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires an own error to use the transformation name", () => {
    interface OtherError extends TypeError<"Other"> {
      readonly value: string;
    }

    const compileTimeAssertions = () => {
      transform(
        "NumberFromString",
        String,
        Number,
        {
          from: (value): Result<number, OtherError> =>
            // @ts-expect-error An own error must use the transformation name.
            err({ type: "Other", value }),
          to: globalThis.String,
        },
        formatTestTypeError,
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("reserves outputError for errors from the output Type", () => {
    interface InvalidError extends TypeError<"NumberFromString"> {
      readonly outputError: TypeOfError<"Number">;
    }

    const compileTimeAssertions = () => {
      transform(
        "NumberFromString",
        String,
        Number,
        {
          from: (value): Result<number, InvalidError> =>
            // @ts-expect-error Own errors cannot use the reserved outputError property.
            err({
              type: "NumberFromString",
              outputError: {
                type: "TypeOf",
                expected: "Number",
                value,
              },
            }),
          to: globalThis.String,
        },
        formatTestTypeError,
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("does not widen its own errors from a broad formatter", () => {
    const _NumberFromString = transform(
      "NumberFromString",
      String,
      Number,
      {
        from: (value): Result<number, NumberFromStringError> =>
          err({ type: "NumberFromString", value }),
        to: globalThis.String,
      },
      formatTestTypeError,
    );

    assertType<
      typeof _NumberFromString.Error,
      TransformError<"NumberFromString", NumberFromStringError, never>
    >();
  });
});

describe("TypeOf", () => {
  const types = [String, Number, BigInt, Boolean, Symbol, Function] as const;

  it("Types have the expected root definitions", () => {
    assertType<
      typeof String,
      Type<"String", string, string, TypeOfError<"String">>
    >();
    assertType<
      typeof Number,
      Type<"Number", number, number, TypeOfError<"Number">>
    >();
    assertType<
      typeof BigInt,
      Type<"BigInt", bigint, bigint, TypeOfError<"BigInt">>
    >();
    assertType<
      typeof Boolean,
      Type<"Boolean", boolean, boolean, TypeOfError<"Boolean">>
    >();
    assertType<
      typeof Symbol,
      Type<"Symbol", symbol, symbol, TypeOfError<"Symbol">>
    >();
    assertType<
      typeof Function,
      Type<
        "Function",
        globalThis.Function,
        globalThis.Function,
        TypeOfError<"Function">
      >
    >();
    assertType<
      TypeOfError<"String"> extends TypeValueError<"TypeOf"> ? true : false,
      true
    >();
    assertType<TypeOfError<"String">["expected"], "String">();
  });

  describe("Type", () => {
    for (const type of types) {
      const name = type.name;

      describe(name, () => {
        it("preserves matching values", () => {
          const value = globalThis[name](0);
          const result = type.fromUnknown(value);

          assertOk(result);
          assertSame(result.value, value);
        });

        it("reports the expected Type and rejected value", () => {
          const value: unknown = null;

          assertEqual(
            type.fromUnknown(value),
            err({
              type: "TypeOf",
              expected: name,
              value,
            }),
          );
        });
      });
    }
  });
});

describe("objectTag", () => {
  const DateFromFactory = objectTag("Date");
  const builtInTypes = [
    {
      name: "Date",
      type: Date,
      value: new globalThis.Date(0),
    },
    {
      name: "Uint8Array",
      type: Uint8Array,
      value: new globalThis.Uint8Array(0),
    },
    {
      name: "ArrayBuffer",
      type: ArrayBuffer,
      value: new globalThis.ArrayBuffer(0),
    },
  ] as const;

  it("creates the predefined built-in Types", () => {
    assertType<
      typeof DateFromFactory,
      Type<"Date", globalThis.Date, globalThis.Date, ObjectTagError<"Date">>
    >();
    assertType<
      typeof Date,
      Type<"Date", globalThis.Date, globalThis.Date, ObjectTagError<"Date">>
    >();
    assertType<
      typeof Uint8Array,
      Type<
        "Uint8Array",
        globalThis.Uint8Array,
        globalThis.Uint8Array,
        ObjectTagError<"Uint8Array">
      >
    >();
    assertType<
      typeof ArrayBuffer,
      Type<
        "ArrayBuffer",
        globalThis.ArrayBuffer,
        globalThis.ArrayBuffer,
        ObjectTagError<"ArrayBuffer">
      >
    >();
    assertType<
      globalThis.Uint8Array<SharedArrayBuffer> extends typeof Uint8Array.Output
        ? true
        : false,
      true
    >();

    for (const { name, type, value } of builtInTypes) {
      assertSame(type.name, name);
      assertSame(type.parent, null);
      const result = type.fromUnknown(value);
      assertOk(result);
      assertSame(result.value, value);
      assertTrue(type.is(value));
      assertSame(type.to(value as never), value);
    }
  });

  it("trusts reported object tags without verifying native internal slots", () => {
    const forgedDate = { [globalThis.Symbol.toStringTag]: "Date" };
    const sabotagedSet = globalThis.Object.create(
      Set.prototype,
    ) as ReadonlySet<string>;

    const result = Date.fromUnknown(forgedDate);
    assertOk(result);
    assertSame(result.value, forgedDate);
    assertThrowsInstanceOf(
      () => globalThis.Date.prototype.getTime.call(forgedDate),
      TypeError,
    );
    assertThrowsInstanceOf(
      () => set(String).fromUnknown(sabotagedSet),
      TypeError,
    );
  });

  it("refines a supplied Type with nominal object-tag evidence", () => {
    class TaggedValue {
      readonly tag: string;

      constructor(tag: string) {
        this.tag = tag;
      }

      get [globalThis.Symbol.toStringTag](): string {
        return this.tag;
      }
    }

    const TaggedValueInstance = instanceOf(TaggedValue);
    const Tagged = objectTag("Tagged", TaggedValueInstance);
    const TaggedValueFromString = transform(
      "TaggedValueFromString",
      String,
      TaggedValueInstance,
      {
        from: (value) => ok(new TaggedValue(value)),
        to: (value) => value.tag,
      },
    );
    const TaggedFromString = objectTag("Tagged", TaggedValueFromString);
    const value = new TaggedValue("Tagged");
    const result = Tagged.fromUnknown(value);
    const fromParentResult = Tagged.from.parent(value);
    const transformedResult = TaggedFromString.fromUnknown("Tagged");
    const wrongTag = new TaggedValue("Other");
    const compileTimeAssertions = () => {
      // @ts-expect-error A raw parent Output has no validated object-tag evidence.
      Tagged.to(value);
    };

    assertType<
      typeof Tagged,
      ObjectTagType<"Tagged", typeof TaggedValueInstance>
    >();
    assertType<typeof Tagged.Output, TaggedValue & ObjectTag<"Tagged">>();
    assertEqual(Tagged.name, "ObjectTag");
    assertEqual(Tagged.expected, "Tagged");
    assertSame(Tagged.parent, TaggedValueInstance);
    assertOk(result, value);
    assertOk(fromParentResult, value);
    assertSame(Tagged.to(result.value), value);
    assertType<typeof TaggedFromString.Input, string>();
    assertType<
      typeof TaggedFromString.Output,
      TaggedValue & ObjectTag<"Tagged">
    >();
    assertOk(transformedResult);
    assertInstanceOf(transformedResult.value, TaggedValue);
    assertEqual(TaggedFromString.to(transformedResult.value), "Tagged");
    assertEqual(
      Tagged.fromUnknown(wrongTag),
      err<ObjectTagError<"Tagged">>({
        type: "ObjectTag",
        expected: "Tagged",
        value: wrongTag,
      }),
    );
    const forgedTag = { [globalThis.Symbol.toStringTag]: "Tagged" };
    assertEqual(
      Tagged.fromUnknown(forgedTag),
      err<InstanceOfError>({
        type: "InstanceOf",
        constructorName: "TaggedValue",
        value: forgedTag,
      }),
    );
    assertEqual(
      Tagged.formatError({
        type: "ObjectTag",
        expected: "Tagged",
        value: wrongTag,
      }),
      'A value {"tag":"Other"} does not have the expected object tag "Tagged".',
    );
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires one concrete tag name and a Type for custom tags", () => {
    class TaggedValue {
      readonly [globalThis.Symbol.toStringTag] = "Tagged";
    }
    class OtherValue {
      readonly [globalThis.Symbol.toStringTag] = "Other";
    }

    const TaggedValueInstance = instanceOf(TaggedValue);
    const _OtherValueInstance = instanceOf(OtherValue);
    const unionName = "Tagged" as "Tagged" | "Other";
    const builtInUnionName = "Date" as "Date" | "Uint8Array";
    const broadName = "Tagged" as TypeName;
    const patternedName = "Tagged" as `Tagged${string}`;
    const outputType = TaggedValueInstance as
      typeof TaggedValueInstance | typeof _OtherValueInstance;
    const erasedOutputType: TypeNode = TaggedValueInstance;
    const genericNameAssertion = <Name extends "Tagged" | "Other">(
      name: Name,
    ): Name => {
      // @ts-expect-error An unresolved generic could be instantiated with a tag union.
      objectTag(name, TaggedValueInstance);
      return name;
    };
    const genericOutputAssertion = <
      OutputType extends
        typeof TaggedValueInstance | typeof _OtherValueInstance,
    >(
      outputType: OutputType,
    ): OutputType => {
      // @ts-expect-error An unresolved generic could be instantiated with an output Type union.
      objectTag("Tagged", outputType);
      return outputType;
    };
    const compileTimeAssertions = () => {
      // @ts-expect-error A union does not identify one concrete object tag.
      objectTag(unionName, TaggedValueInstance);
      // @ts-expect-error A union does not identify one predefined object tag.
      objectTag(builtInUnionName);
      // @ts-expect-error A widened name does not identify one concrete object tag.
      objectTag(broadName, TaggedValueInstance);
      // @ts-expect-error A template pattern does not identify one concrete object tag.
      objectTag(patternedName, TaggedValueInstance);
      // @ts-expect-error A custom Object Tag requires an output Type.
      objectTag("Tagged");
      // @ts-expect-error The output Type must produce objects.
      objectTag("Tagged", String);
      // @ts-expect-error The output must use one concrete Type node.
      objectTag("Tagged", outputType);
      // @ts-expect-error The output Type must retain its concrete information.
      objectTag("Tagged", erasedOutputType);
    };

    assertType<
      typeof genericNameAssertion extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
    assertType<
      typeof genericOutputAssertion extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects an ObjectTag error inherited from the output Type", () => {
    class TaggedValue {
      readonly [globalThis.Symbol.toStringTag] = "Tagged";
    }

    const Tagged = objectTag("Tagged", instanceOf(TaggedValue));
    const compileTimeAssertions = () => {
      objectTag(
        "Other",
        // @ts-expect-error An ObjectTag error must not duplicate one inherited from the output Type.
        Tagged,
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("infers ObjectTag localization", () => {
    const types = localizeTypes(
      { Date },
      {
        test: {
          ObjectTag: (error) => {
            assertType<typeof error, ObjectTagError<"Date">>();
            return "Localized ObjectTag.";
          },
        },
      },
    ).test;
    const result = types.Date.fromUnknown({});

    assertErr(result);
    assertEqual(types.Date.formatError(result.error), "Localized ObjectTag.");
  });
});

describe("instanceOf", () => {
  class User {
    readonly name: string;

    constructor(name: string) {
      this.name = name;
    }
  }

  class Admin extends User {}

  const SameName = class User {
    readonly name: string;

    constructor(name: string) {
      this.name = name;
    }
  };

  const UserInstance = instanceOf(User);
  it("creates the expected root Type", () => {
    assertType<
      typeof User extends InstanceConstructor<User> ? true : false,
      true
    >();
    assertType<typeof UserInstance, InstanceOfType<typeof User>>();
    assertType<typeof UserInstance.Input, User>();
    assertType<typeof UserInstance.Output, User>();
    assertType<typeof UserInstance.Error, InstanceOfError>();
    assertType<
      InstanceOfError extends TypeValueError<"InstanceOf"> ? true : false,
      true
    >();
    assertType<typeof UserInstance.parent, null>();
    assertEqual(UserInstance.name, "InstanceOf");
    assertSame(UserInstance.constructor, User);
    assertSame(UserInstance.parent, null);
  });

  it("requires one concrete constructor", () => {
    class _Session {
      readonly id = "session";
    }

    type Constructor = typeof User | typeof _Session;
    type ConstructorParameter = Parameters<typeof instanceOf<Constructor>>[0];
    type ErasedConstructor = InstanceConstructor<User>;
    type ErasedConstructorParameter = Parameters<
      typeof instanceOf<ErasedConstructor>
    >[0];
    const compileTimeAssertions = (
      constructor: Constructor,
      erasedConstructor: ErasedConstructor,
    ) => {
      // @ts-expect-error An Instance Type requires one concrete constructor.
      instanceOf(constructor);
      // @ts-expect-error An Instance Type requires concrete constructor information.
      instanceOf(erasedConstructor);
    };
    const genericCompileTimeAssertion = <C extends Constructor>(
      constructor: C,
    ): C => {
      // @ts-expect-error An unresolved generic could be instantiated with a constructor union.
      instanceOf(constructor);
      return constructor;
    };

    assertType<
      Constructor extends ConstructorParameter ? true : false,
      false
    >();
    assertType<
      ErasedConstructor extends ErasedConstructorParameter ? true : false,
      false
    >();
    assertType<
      ConstructorParameter,
      "⛔ Type error: Constructor must preserve one concrete constructor. Create a Union Type from separate Instance Types instead of passing a union or erased constructor."
    >();
    assertType<ErasedConstructorParameter, ConstructorParameter>();
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
    assertType<
      typeof genericCompileTimeAssertion extends (
        ...args: Array<never>
      ) => unknown
        ? true
        : false,
      true
    >();
  });

  it("composes multiple constructors through one Union Type", () => {
    class Session {
      readonly id = "session";
    }

    const Instance = union(instanceOf(User), instanceOf(Session));
    const user = new User("Ada");
    const session = new Session();

    assertEqual(Instance.fromUnknown(user), ok(user));
    assertEqual(Instance.fromUnknown(session), ok(session));
    assertType<typeof Instance.Output, User | Session>();
  });

  it("preserves instances accepted by the constructor", () => {
    const user = new User("Ada");
    const admin = new Admin("Grace");

    for (const value of [user, admin]) {
      const result = UserInstance.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertTrue(UserInstance.is(value));
    }

    assertEqual(UserInstance.from(user), ok(user));
    {
      const actual = UserInstance.from(user);
      assertType<typeof actual, Result<User>>();
    }
    assertSame(UserInstance.to(user), user);
    assertSame(UserInstance.orThrow(user), user);
    assertSame(UserInstance.orNull(user), user);
  });

  it("ignores overridden Symbol.hasInstance", () => {
    class Overridden {
      readonly kind = "Overridden";

      static [globalThis.Symbol.hasInstance](value: unknown): boolean {
        return value === 42;
      }
    }

    const OverriddenInstance = instanceOf(Overridden);
    const instance = new Overridden();

    assertTrue(Overridden[globalThis.Symbol.hasInstance](42));
    assertFalse(instance instanceof Overridden);
    assertEqual(
      OverriddenInstance.fromUnknown(42),
      err({
        type: "InstanceOf",
        constructorName: "Overridden",
        value: 42,
      }),
    );
    assertFalse(OverriddenInstance.is(42));
    assertOk(OverriddenInstance.fromUnknown(instance), instance);
    assertTrue(OverriddenInstance.is(instance));
  });

  it("asserts structurally typed values that are not instances", () => {
    const value: User = { name: "Ada" };
    const error = {
      type: "InstanceOf",
      constructorName: "User",
      value,
    } as const;
    const operations = [
      () => UserInstance.from(value),
      () => UserInstance.to(value),
      () => UserInstance.orThrow(value),
      () => UserInstance.orNull(value),
    ];

    for (const operation of operations) {
      assertAssertionError(operation, "Expected InstanceOf.", error);
    }
  });

  it("rejects structurally equivalent values with different constructor identities", () => {
    const plain: unknown = { name: "Ada" };
    const sameName: unknown = new SameName("Ada");

    for (const value of [plain, sameName]) {
      assertEqual(
        UserInstance.fromUnknown(value),
        err({
          type: "InstanceOf",
          constructorName: "User",
          value,
        }),
      );
      assertFalse(UserInstance.is(value));
    }
  });

  it("formats the rejected value and expected constructor", () => {
    assertEqual(
      UserInstance.formatError({
        type: "InstanceOf",
        constructorName: "User",
        value: {},
      }),
      "A value {} is not an instance of User.",
    );
  });
});

describe("literal", () => {
  const Hello = literal("Hello");

  it("creates a Literal Type with its primitive Type as parent", () => {
    assertEqual(Hello.name, "Literal");
    assertEqual(Hello.expected, "Hello");
    assertSame(Hello.parent, String);
    assertType<typeof Hello, LiteralType<"Hello">>();
    assertType<typeof Hello.Input, string>();
    assertType<typeof Hello.Output, "Hello">();
    assertType<typeof Hello.Error, LiteralError<"Hello">>();
    assertType<
      LiteralError<"Hello"> extends TypeValueError<"Literal"> ? true : false,
      true
    >();
    assertType<typeof Hello.parent, typeof String>();
    assertTrue("parent" in Hello.from);
    assertType<"parent" extends keyof typeof Hello.from ? true : false, true>();
  });

  it("validates unknown and widened input at their respective boundaries", () => {
    const expectedError = err({
      type: "Literal",
      expected: "Hello",
      value: "World",
    });

    assertEqual(Hello.fromUnknown("Hello"), ok("Hello"));
    assertEqual(Hello.fromUnknown("World"), expectedError);
    assertEqual(
      Hello.fromUnknown(42),
      err({ type: "TypeOf", expected: "String", value: 42 }),
    );
    assertEqual(Hello.from("Hello"), ok("Hello"));
    assertEqual(Hello.from.parent("World"), expectedError);
    {
      const actual = Hello.fromUnknown("Hello");
      assertType<
        typeof actual,
        Result<"Hello", TypeOfError<"String"> | LiteralError<"Hello">>
      >();
    }
    assertType<Parameters<typeof Hello.from>[0], "Hello">();
    {
      const actual = Hello.from("Hello");
      assertType<typeof actual, Result<"Hello">>();
    }
    {
      const actual = Hello.from.parent("Hello");
      assertType<typeof actual, Result<"Hello", LiteralError<"Hello">>>();
    }
  });

  it("narrows values and validates convenience operations", () => {
    const value: unknown = "Hello";

    assert(Hello.is(value), "Expected Hello.");
    assertFalse(Hello.is("World"));
    assertType<typeof value, "Hello">();

    assertEqual(Hello.orThrow("Hello"), "Hello");
    const error = assertThrowsInstanceOf(() => Hello.orThrow("World"), Error);
    assertTrue(error.message.includes("getOrThrow"));
    assertEqual(Hello.orNull("Hello"), "Hello");
    assertSame(Hello.orNull("World"), null);
  });

  it("supports every literal primitive", () => {
    const FortyTwo = literal(42);
    const FortyTwoBigInt = literal(42n);
    const True = literal(true);

    assertSame(FortyTwo.parent, Number);
    assertSame(FortyTwoBigInt.parent, BigInt);
    assertSame(True.parent, Boolean);
    assertEqual(FortyTwo.from(42), ok(42));
    assertEqual(FortyTwoBigInt.from(42n), ok(42n));
    assertEqual(True.from(true), ok(true));
    assertEqual(literal(undefined).from(undefined), ok(undefined));
    assertEqual(literal(null).from(null), ok(null));
  });

  it("distinguishes primitive type errors from Literal value errors", () => {
    const FortyTwo = literal(42);

    assertEqual(
      FortyTwo.fromUnknown("42"),
      err({ type: "TypeOf", expected: "Number", value: "42" }),
    );
    assertEqual(
      FortyTwo.fromUnknown(43),
      err({ type: "Literal", expected: 42, value: 43 }),
    );
    {
      const actual = FortyTwo.fromUnknown(42);
      assertType<
        typeof actual,
        Result<42, TypeOfError<"Number"> | LiteralError<42>>
      >();
    }
  });

  it("formats its own and inherited errors", () => {
    assertEqual(
      Hello.formatError({
        type: "Literal",
        expected: "Hello",
        value: "World",
      }),
      'The value "World" is not strictly equal to the expected literal: Hello.',
    );
    assertEqual(
      Hello.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
      "A value 42 is not a string.",
    );
    assertType<
      Parameters<typeof Hello.formatError>[0],
      TypeOfError<"String"> | LiteralError<"Hello">
    >();
  });

  it("uses JavaScript strict equality without replacing the accepted value", () => {
    const result = literal(0).from.parent(-0);

    assertOk(result, -0);
    assertSame(result.value, -0);
  });

  it("rejects values without one exact literal type", () => {
    const stringValue = "Hello" as string;
    const numberValue = 42 as number;
    const bigintValue = 42n as bigint;
    const booleanValue = true as boolean;
    const unionValue = "Hello" as "Hello" | "World";
    const patternedString = "user-1" as `user-${string}`;
    const UserId = brand("UserId", String);
    const userId = getOrThrow(UserId.from.parent("id"));
    const Amount = brand("Amount", Number);
    const amount = getOrThrow(Amount.from.parent(42));

    const compileTimeAssertions = () => {
      // @ts-expect-error A widened string does not identify one literal.
      literal(stringValue);
      // @ts-expect-error A widened number does not identify one literal.
      literal(numberValue);
      // @ts-expect-error A widened bigint does not identify one literal.
      literal(bigintValue);
      // @ts-expect-error A widened boolean does not identify one literal.
      literal(booleanValue);
      // @ts-expect-error A union does not identify one literal.
      literal(unionValue);
      // @ts-expect-error A template pattern can identify many strings.
      literal(patternedString);
      // @ts-expect-error A branded string can contain many values.
      literal(userId);
      // @ts-expect-error A branded number can contain many values.
      literal(amount);
      // @ts-expect-error Infinity has the widened `number` type.
      literal(globalThis.Number.POSITIVE_INFINITY);
      // @ts-expect-error NaN has the widened `number` type.
      literal(globalThis.Number.NaN);
    };
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  describe("Type", () => {
    describe("Undefined", () => {
      it("is the Literal Type for undefined", () => {
        assertEqual(Undefined.name, "Literal");
        assertSame(Undefined.expected, undefined);
        assertSame(Undefined.parent, null);
        assertType<typeof Undefined, LiteralType<undefined>>();
        {
          const actual = Undefined.from(undefined);
          assertType<typeof actual, Result<undefined>>();
        }
      });

      it("accepts undefined and rejects other values", () => {
        assertEqual(Undefined.fromUnknown(undefined), ok(undefined));
        assertEqual(
          Undefined.fromUnknown(null),
          err({ type: "Literal", expected: undefined, value: null }),
        );
      });
    });

    describe("Null", () => {
      it("is the Literal Type for null", () => {
        assertEqual(Null.name, "Literal");
        assertSame(Null.expected, null);
        assertSame(Null.parent, null);
        assertType<typeof Null, LiteralType<null>>();
        {
          const actual = Null.from(null);
          assertType<typeof actual, Result<null>>();
        }
      });

      it("accepts null and rejects other values", () => {
        assertEqual(Null.fromUnknown(null), ok(null));
        assertEqual(
          Null.fromUnknown(undefined),
          err({ type: "Literal", expected: null, value: undefined }),
        );
      });
    });
  });
});

describe("union", () => {
  const StringOrNumber = union(String, Number);
  const DraftOrPublished = union("draft", "published");
  type StringOrNumberError = UnionError<
    TypeOfError<"String"> | TypeOfError<"Number">,
    | UnionMemberError<TypeOfError<"String">, 0>
    | UnionMemberError<TypeOfError<"Number">, 1>
  >;

  it("creates a root boundary for its encoded member Inputs", () => {
    assertEqual(StringOrNumber.name, "Union");
    assertEqual(StringOrNumber.parent.name, "Union");
    assertSame(StringOrNumber.parent.parent, null);
    assertEqual(StringOrNumber.members, [String, Number]);
    assertSame(StringOrNumber.members[0], String);
    assertSame(StringOrNumber.members[1], Number);
    assertType<
      typeof StringOrNumber,
      UnionType<readonly [typeof String, typeof Number]>
    >();
    assertType<
      typeof StringOrNumber.parent,
      UnionInputType<string | number, StringOrNumberError>
    >();
    assertType<typeof StringOrNumber.Input, string | number>();
    assertType<typeof StringOrNumber.Output, string | number>();
    assertType<typeof StringOrNumber.Error, StringOrNumberError>();
    assertType<InferErrors<typeof StringOrNumber>, StringOrNumberError>();
    assertType<
      typeof StringOrNumber.parent.Input,
      typeof StringOrNumber.Input
    >();
    assertType<
      typeof StringOrNumber.parent.Output,
      typeof StringOrNumber.Input
    >();
    assertType<typeof StringOrNumber.parent.Error, StringOrNumberError>();
    assertType<
      StringOrNumberError extends TypeValueError ? true : false,
      false
    >();
    assertEqual(StringOrNumber.parent.fromUnknown("value"), ok("value"));
    assertEqual(StringOrNumber.parent.fromUnknown(42), ok(42));
    assertEqual(
      StringOrNumber.parent.fromUnknown(true),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: { type: "TypeOf", expected: "String", value: true },
          },
        ],
      }),
    );
    assertTrue("parent" in StringOrNumber.from);
    assertType<
      "parent" extends keyof typeof StringOrNumber.from ? true : false,
      true
    >();
  });

  it("asserts exact member Outputs at both Union boundaries", () => {
    const invalid = true as unknown as typeof StringOrNumber.Output;
    const cause = {
      type: "Union",
      errors: [
        {
          index: 0,
          error: { type: "TypeOf", expected: "String", value: true },
        },
      ],
    } as const;

    assertAssertionError(
      () => StringOrNumber.from(invalid),
      "Expected Union.",
      cause,
    );
    assertAssertionError(
      () => StringOrNumber.from.parent(invalid),
      "Expected Union.",
      cause,
    );
  });

  it("accepts ordinary root Record members through typed operations", () => {
    const Value = union(record(String, Number), String);
    const input = { count: 1 };
    const fromUnknownResult = Value.parent.fromUnknown(input);

    assertOk(fromUnknownResult, input);
    assertSame(fromUnknownResult.value, input);
    assertTrue(Value.parent.is(input));

    const fromResult = Value.from.parent(input);
    assertOk(fromResult, input);
    assertSame(fromResult.value, input);
    assertTrue(Value.is(fromResult.value));
    assertSame(Value.orThrow(input), input);
    assertSame(Value.orNull(input), input);
  });

  it("accepts ordinary root Union members through Array", () => {
    const Value = union(record(String, Number), String);
    const Values = array(Value);
    const input = [{ count: 1 }];
    const result = Values.from.parent(input);

    assertOk(result, input);
    assertSame(result.value, input);
    assertSame(result.value[0], input[0]);
    assertTrue(Values.parent.is(result.value));
  });

  it("does not select a root that can only decode the typed value", () => {
    class Input {
      readonly count = 1;
    }

    interface RejectedObjectError extends TypeError<"RejectedObject"> {
      readonly value: Input;
    }

    const Values = object({ count: Number });
    const RejectedObject = brand(
      "RejectedObject",
      instanceOf(Input),
      (value): Result<void, RejectedObjectError> =>
        err({ type: "RejectedObject", value }),
      formatTestTypeError,
    );
    const valuesFromUnknown = Values.fromUnknown;
    let rootDecodings = 0;
    globalThis.Object.defineProperty(Values, "fromUnknown", {
      value: (
        value: unknown,
        options?: Parameters<typeof Values.fromUnknown>[1],
      ) => {
        rootDecodings++;
        return valuesFromUnknown(value, options);
      },
    });
    const Value = union(Values, RejectedObject);
    const input = new Input();

    assertFalse(Values.is(input));
    assertTrue(Value.parent.is(input));

    assertEqual(
      Value.from.parent(input, { errors: "all" }),
      err({
        type: "Union",
        errors: [
          {
            index: 1,
            error: { type: "RejectedObject", value: input },
          },
        ],
      }),
    );
    assertEqual(rootDecodings, 0);
  });

  it("normalizes literal-only members behind a Union input boundary", () => {
    assertEqual(DraftOrPublished.parent.name, "Union");
    assertSame(DraftOrPublished.parent.parent, null);
    assertFalse(globalThis.Object.is(DraftOrPublished.parent, String));
    assertEqual(DraftOrPublished.members[0].expected, "draft");
    assertEqual(DraftOrPublished.members[1].expected, "published");
    assertType<
      typeof DraftOrPublished,
      UnionType<readonly [LiteralType<"draft">, LiteralType<"published">]>
    >();
    assertType<typeof DraftOrPublished.Output, "draft" | "published">();
    assertType<
      typeof DraftOrPublished.Error,
      UnionError<
        | TypeOfError<"String">
        | LiteralError<"draft">
        | LiteralError<"published">,
        | UnionMemberError<TypeOfError<"String"> | LiteralError<"draft">, 0>
        | UnionMemberError<TypeOfError<"String"> | LiteralError<"published">, 1>
      >
    >();
    assertType<typeof DraftOrPublished.parent.Output, string>();
    assertType<
      typeof DraftOrPublished.parent,
      UnionInputType<string, UnionError<TypeOfError<"String">>>
    >();
    assertEqual(DraftOrPublished.parent.fromUnknown("other"), ok("other"));
    assertEqual(
      DraftOrPublished.parent.fromUnknown(42),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: { type: "TypeOf", expected: "String", value: 42 },
          },
        ],
      }),
    );
  });

  it("accepts an explicit Union Type as one concrete member", () => {
    const AOrOne = union(literal("a"), literal(1));
    const AOrOneOrBoolean = union(AOrOne, Boolean);
    const BOrAOrOne = union("b", AOrOne);

    assertSame(AOrOneOrBoolean.members[0], AOrOne);
    assertSame(BOrAOrOne.members[1], AOrOne);
    assertType<
      typeof AOrOneOrBoolean,
      UnionType<readonly [typeof AOrOne, typeof Boolean]>
    >();
    assertType<
      typeof BOrAOrOne,
      UnionType<readonly [LiteralType<"b">, typeof AOrOne]>
    >();
    assertEqual(AOrOneOrBoolean.fromUnknown(1), ok(1));
    assertEqual(BOrAOrOne.fromUnknown("a"), ok("a"));
  });

  it("keeps a Union input boundary for repeated parentless Literal Types", () => {
    const Value = union(Null, Null);

    assertType<
      typeof Value.parent,
      UnionInputType<null, UnionError<LiteralError<null>>>
    >();
    assertEqual(Value.parent.name, "Union");
    assertSame(Value.parent.parent, null);
    assertEqual(
      Value.parent.fromUnknown(undefined),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: {
              type: "Literal",
              expected: null,
              value: undefined,
            },
          },
        ],
      }),
    );
  });

  it("normalizes mixed literal and Type members in any position", () => {
    const DraftOrNumber = union("draft", Number);
    const NumberOrDraft = union(Number, "draft");

    assertEqual(DraftOrNumber.members[0].expected, "draft");
    assertSame(DraftOrNumber.members[1], Number);
    assertSame(NumberOrDraft.members[0], Number);
    assertEqual(NumberOrDraft.members[1].expected, "draft");
    assertType<
      typeof DraftOrNumber,
      UnionType<readonly [LiteralType<"draft">, typeof Number]>
    >();
    assertType<
      typeof NumberOrDraft,
      UnionType<readonly [typeof Number, LiteralType<"draft">]>
    >();
    assertEqual(DraftOrNumber.fromUnknown("draft"), ok("draft"));
    assertEqual(DraftOrNumber.fromUnknown(42), ok(42));
    assertEqual(NumberOrDraft.fromUnknown("draft"), ok("draft"));
  });

  it("validates literal values with the same Union behavior", () => {
    const value: unknown = "published";
    const result = DraftOrPublished.fromUnknown(value);

    assertOk(result, value);
    assertSame(result.value, value);
    assertEqual(
      DraftOrPublished.fromUnknown("other"),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: {
              type: "Literal",
              expected: "draft",
              value: "other",
            },
          },
        ],
      }),
    );
    assertEqual(
      DraftOrPublished.fromUnknown("other", { errors: "all" }),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: {
              type: "Literal",
              expected: "draft",
              value: "other",
            },
          },
          {
            index: 1,
            error: {
              type: "Literal",
              expected: "published",
              value: "other",
            },
          },
        ],
      }),
    );
  });

  it("supports every literal primitive", () => {
    const Values = union("value", 42, 42n, true, null, undefined);

    assertEqual(
      Values.members.map((member) => member.expected),
      ["value", 42, 42n, true, null, undefined],
    );
    assertType<
      typeof Values.Output,
      "value" | 42 | 42n | true | null | undefined
    >();
  });

  it("returns the original value from the first successful member", () => {
    const DateOrUint8Array = union(Date, Uint8Array);
    const value: unknown = new globalThis.Uint8Array([1, 2]);
    const result = DateOrUint8Array.fromUnknown(value);

    assertOk(result, value);
    assertSame(result.value, value);
    assertType<
      typeof result.value,
      typeof Date.Output | typeof Uint8Array.Output
    >();
  });

  it("tries later members after a member fails and stops after success", () => {
    const validations: Array<string> = [];
    const First = createType(
      "First",
      (value): Result<never, FirstError> => {
        validations.push("First");
        return err({ type: "First", value });
      },
      formatTestTypeError,
    );
    interface FirstError extends TypeError<"First"> {
      readonly value: unknown;
    }
    const Second = createType(
      "Second",
      (value): Result<"value", SecondError> => {
        validations.push("Second");
        return value === "value" ? ok(value) : err({ type: "Second", value });
      },
      formatTestTypeError,
    );
    interface SecondError extends TypeError<"Second"> {
      readonly value: unknown;
    }
    const Third = createType(
      "Third",
      (value): Result<never, ThirdError> => {
        validations.push("Third");
        return err({ type: "Third", value });
      },
      formatTestTypeError,
    );
    interface ThirdError extends TypeError<"Third"> {
      readonly value: unknown;
    }
    const Type = union(First, Second, Third);

    assertEqual(Type.fromUnknown("value"), ok("value"));
    assertEqual(validations, ["First", "Second"]);
  });

  it("retains the first member error by default", () => {
    const result = StringOrNumber.fromUnknown(true);

    assertEqual(
      result,
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: { type: "TypeOf", expected: "String", value: true },
          },
        ],
      }),
    );
    assertType<typeof result, Result<string | number, StringOrNumberError>>();
  });

  it("retains every member error in all-errors mode", () => {
    const result = StringOrNumber.fromUnknown(true, { errors: "all" });

    assertErr(result, {
      type: "Union",
      errors: [
        {
          index: 0,
          error: { type: "TypeOf", expected: "String", value: true },
        },
        {
          index: 1,
          error: { type: "TypeOf", expected: "Number", value: true },
        },
      ],
    });
    const memberError = result.error.errors[0];

    assertType<
      typeof memberError,
      | {
          readonly index: 0;
          readonly error: TypeOfError<"String">;
        }
      | {
          readonly index: 1;
          readonly error: TypeOfError<"Number">;
        }
    >();

    if (memberError.index === 0) {
      assertType<typeof memberError.error, TypeOfError<"String">>();
    } else {
      assertType<typeof memberError.index, 1>();
      assertType<typeof memberError.error, TypeOfError<"Number">>();
    }
  });

  it("formats one message without enumerating member errors", () => {
    const result = StringOrNumber.fromUnknown(true, { errors: "all" });

    assertErr(result, {
      type: "Union",
      errors: [
        {
          index: 0,
          error: { type: "TypeOf", expected: "String", value: true },
        },
        {
          index: 1,
          error: { type: "TypeOf", expected: "Number", value: true },
        },
      ],
    });

    assertEqual(
      StringOrNumber.formatError(result.error),
      "A value does not match any allowed variant.",
    );
    assertType<
      Parameters<typeof StringOrNumber.formatError>[0],
      StringOrNumberError
    >();
  });

  it("cannot fail when one member is infallible", () => {
    const StringOrUnknown = union(String, Unknown);
    const result = StringOrUnknown.fromUnknown(true);

    assertType<typeof StringOrUnknown.Error, never>();
    assertType<typeof StringOrUnknown.parent.Error, never>();
    assertType<InferErrors<typeof StringOrUnknown>, never>();
    assertType<typeof result, Result<unknown>>();
    assertOk(result, true);
    assertOk(StringOrUnknown.parent.fromUnknown(true), true);
  });

  it("requires every member slot to preserve one concrete Type", () => {
    const uncertain = String as typeof String | typeof Number;
    const possiblyInfallible = String as typeof String | typeof Unknown;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error A member must use one concrete Type node.
      union(uncertain, Boolean).to(42);
      // @ts-expect-error A member must preserve its concrete Type information.
      union(erased, Boolean).to(true);
      // @ts-expect-error Mixed shorthand members must also be concrete.
      union("draft", uncertain).to(42);
      // @ts-expect-error Mixed shorthand members must preserve concrete information.
      union("draft", erased).to(true);
      // @ts-expect-error Infallibility must not depend on a runtime member choice.
      union(possiblyInfallible, Number).to(true);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("forwards all-errors mode to member Types", () => {
    const StringArrayOrNumberArray = union(array(String), array(Number));

    assertEqual(
      StringArrayOrNumberArray.fromUnknown([true, false], { errors: "all" }),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: {
              type: "Array",
              reason: {
                kind: "Items",
                issues: [
                  {
                    kind: "Element",
                    index: 0,
                    error: {
                      type: "TypeOf",
                      expected: "String",
                      value: true,
                    },
                  },
                  {
                    kind: "Element",
                    index: 1,
                    error: {
                      type: "TypeOf",
                      expected: "String",
                      value: false,
                    },
                  },
                ],
              },
            },
          },
          {
            index: 1,
            error: {
              type: "Array",
              reason: {
                kind: "Items",
                issues: [
                  {
                    kind: "Element",
                    index: 0,
                    error: {
                      type: "TypeOf",
                      expected: "Number",
                      value: true,
                    },
                  },
                  {
                    kind: "Element",
                    index: 1,
                    error: {
                      type: "TypeOf",
                      expected: "Number",
                      value: false,
                    },
                  },
                ],
              },
            },
          },
        ],
      }),
    );
  });

  it("transforms the first successful member while decoding", () => {
    interface BooleanFromStringError extends TypeError<"BooleanFromString"> {
      readonly value: string;
    }

    const NumberFromString = setupNumberFromString();
    const BooleanFromString = transform(
      "BooleanFromString",
      String,
      Boolean,
      {
        from: (value): Result<boolean, BooleanFromStringError> =>
          value === "true"
            ? ok(true)
            : value === "false"
              ? ok(false)
              : err({ type: "BooleanFromString", value }),
        to: (value) => (value ? "true" : "false"),
      },
      (error) => `The value ${error.value} is not a boolean.`,
    );
    const Value = union(NumberFromString, BooleanFromString);

    assertEqual(Value.from.parent("42"), ok(42));
    assertEqual(Value.from.parent("true"), ok(true));
    assertEqual(Value.to(42), "42");
    assertEqual(Value.to(true), "true");
    assertTrue(Value.is(42));
    assertTrue(Value.is(true));
    assertFalse(Value.is("42"));
    assertType<typeof Value.Input, string>();
    assertType<typeof Value.Output, number | boolean>();
    assertType<typeof Value.parent.Output, string>();
    assertEqual(
      Value.parent.fromUnknown("not a number or boolean"),
      ok("not a number or boolean"),
    );
  });

  it("encodes with the first member matching the Output", () => {
    const attempts: Array<"First" | "Second"> = [];
    const First = transform("FirstNumberFromString", String, Number, {
      from: (value) => ok(globalThis.Number(value)),
      to: (value) => {
        attempts.push("First");
        return globalThis.String(value);
      },
    });
    const Second = transform("SecondNumberFromString", String, Number, {
      from: (value) => ok(globalThis.Number(value)),
      to: (value) => {
        attempts.push("Second");
        return globalThis.String(value);
      },
    });
    const Value = union(First, Second);

    assertEqual(Value.to(42), "42");
    assertEqual(attempts, ["First"]);
  });

  it("encodes ordinary Record Outputs through direct and nested members", () => {
    const Values = record(String, Number);
    const Direct = union(Values, String);
    const List = union(array(Values), String);
    const Model = union(object({ values: Values }), String);
    const direct = { count: 1 };
    const list = [direct];
    const model = { values: direct };

    assertSame(Direct.to(direct), direct);
    assertSame(List.to(list), list);
    assertSame(Model.to(model), model);

    const canonical = globalThis.Object.assign(
      globalThis.Object.create(null) as Record<string, number>,
      { count: 1 },
    );
    const canonicalList = [canonical];
    const canonicalModel = { values: canonical };

    assertSame(Direct.to(canonical), canonical);
    assertSame(List.to(canonicalList), canonicalList);
    assertSame(Model.to(canonicalModel), canonicalModel);
  });

  it("can be unlawful when encoded member representations overlap", () => {
    interface BooleanFromStringError extends TypeError<"BooleanFromString"> {
      readonly value: string;
    }

    const BooleanFromString = transform(
      "BooleanFromString",
      String,
      Boolean,
      {
        from: (value): Result<boolean, BooleanFromStringError> =>
          value === "1"
            ? ok(true)
            : value === "0"
              ? ok(false)
              : err({ type: "BooleanFromString", value }),
        to: (value) => (value ? "1" : "0"),
      },
      formatTestTypeError,
    );
    const NumberFromString = setupNumberFromString();
    const Value = union(BooleanFromString, NumberFromString);
    const encodedNumber = Value.to(1);
    const decodedAgain = Value.from.parent(encodedNumber);

    // The Number member encodes 1 as "1", but the earlier Boolean member
    // captures that representation while decoding it.
    assertEqual(encodedNumber, "1");
    assertEqual(decodedAgain, ok(true));
  });

  it("accepts its own member Outputs through from", () => {
    assertEqual(StringOrNumber.from("value"), ok("value"));
    assertEqual(StringOrNumber.from(42), ok(42));
    assertType<Parameters<typeof StringOrNumber.from>[0], string | number>();
    assertType<
      ReturnType<typeof StringOrNumber.from>,
      Result<string | number>
    >();
  });

  it("runs only matching roots when selecting through from.parent", () => {
    const Value = union(literal("Hello"), Number);
    const input: typeof Value.parent.Output = "World";

    assertEqual(
      Value.from.parent(input, { errors: "all" }),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: {
              type: "Literal",
              expected: "Hello",
              value: input,
            },
          },
        ],
      }),
    );
    assertSame(Value.orNull(input), null);
    const error = assertThrowsInstanceOf(() => Value.orThrow(input), Error);
    assertTrue(error.message.includes("getOrThrow"));
  });

  it("validates only the remaining Type after a validated Union through from.parent", () => {
    const HelloOrNumber = union(literal("Hello"), Number);
    const validations: Array<unknown> = [];
    const Value = brand("Value", HelloOrNumber, (value) => {
      validations.push(value);
      return ok();
    });
    const value = getOrThrow(HelloOrNumber.fromUnknown(42));

    assertEqual(Value.from.parent(value), ok(42));
    assertEqual(validations, [42]);
    {
      const actual = Value.from.parent(value);
      assertType<typeof actual, Result<typeof Value.Output>>();
    }
  });

  it("composes with Array validation and nested error collection", () => {
    const HelloOrNumber = union(literal("Hello"), Number);
    const Values = array(HelloOrNumber);
    const value: ReadonlyArray<string | number> = ["Hello", 42];
    const result = Values.from.parent(value);

    assertSame(Values.parent, array(HelloOrNumber.parent));
    assertType<typeof Values.parent.Output, typeof Values.Input>();
    assertEqual(
      Values.parent.fromUnknown(["World", "No"]),
      ok(["World", "No"]),
    );
    assertType<
      typeof result,
      Result<typeof Values.Output, typeof Values.Error>
    >();
    assertOk(result, value);
    assertSame(result.value, value);
    assertEqual(
      Values.fromUnknown(["World", "No"], { errors: "all" }),
      err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 0,
              error: {
                type: "Union",
                errors: [
                  {
                    index: 0,
                    error: {
                      type: "Literal",
                      expected: "Hello",
                      value: "World",
                    },
                  },
                  {
                    index: 1,
                    error: {
                      type: "TypeOf",
                      expected: "Number",
                      value: "World",
                    },
                  },
                ],
              },
            },
            {
              kind: "Element",
              index: 1,
              error: {
                type: "Union",
                errors: [
                  {
                    index: 0,
                    error: {
                      type: "Literal",
                      expected: "Hello",
                      value: "No",
                    },
                  },
                  {
                    index: 1,
                    error: {
                      type: "TypeOf",
                      expected: "Number",
                      value: "No",
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    );
  });

  it("composes discriminated Object members with transformed and optional properties", () => {
    const NumberFromString = setupNumberFromString();
    const Count = object({
      kind: literal("count"),
      value: NumberFromString,
    });
    const Label = object({
      kind: literal("label"),
      value: String,
      note: optional(String),
    });
    const Value = union(Count, Label);
    const encoded = { kind: "count" as const, value: "42" };
    const output = { kind: "count" as const, value: 42 };
    const result = Value.fromUnknown(encoded);

    assertOk(result, output);
    assertFalse(globalThis.Object.is(result.value, encoded));
    assertEqual(Value.to(output), encoded);
    assertEqual(Value.to({ kind: "label", value: "answer" }), {
      kind: "label",
      value: "answer",
    });
    const invalidResult = Value.fromUnknown(
      { kind: "count", value: "no" },
      { errors: "all" },
    );

    assertType<
      typeof invalidResult,
      Result<typeof Value.Output, typeof Value.Error>
    >();
    assertEqual(
      invalidResult,
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: {
              type: "Object",
              reason: {
                kind: "Properties",
                errors: {
                  value: { type: "NumberFromString", value: "no" },
                },
              },
            },
          },
          {
            index: 1,
            error: {
              type: "Object",
              reason: {
                kind: "Properties",
                errors: {
                  kind: {
                    type: "Literal",
                    expected: "label",
                    value: "count",
                  },
                },
              },
            },
          },
        ],
      }),
    );
  });

  it("requires at least two members and concrete shorthand literals", () => {
    const stringValue = "draft" as string;
    const unionValue = "draft" as "draft" | "published";

    const compileTimeAssertions = () => {
      // @ts-expect-error A Union requires at least two member Types.
      union();
      // @ts-expect-error A Union requires at least two member Types.
      union(String);
      // @ts-expect-error A Union requires at least two literal values.
      union("draft");
      // @ts-expect-error A widened value does not identify one literal.
      union(stringValue, "published");
      // @ts-expect-error A union does not identify one literal.
      union(unionValue, "archived");
      // @ts-expect-error A widened value does not identify one literal.
      union(Number, stringValue);
      // @ts-expect-error A union does not identify one literal.
      union(Number, unionValue);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });
});

describe("undefinedOr", () => {
  it("creates a Union with the supplied Type before Undefined", () => {
    const UndefinedOrString = undefinedOr(String);
    const StringOrNumber = union(String, Number);
    const UndefinedOrStringOrNumber = undefinedOr(StringOrNumber);

    assertEqual(UndefinedOrString.members, [String, Undefined]);
    assertSame(UndefinedOrStringOrNumber.members[0], StringOrNumber);
    assertType<
      typeof UndefinedOrString,
      UnionType<readonly [typeof String, typeof Undefined]>
    >();
    assertType<typeof UndefinedOrString.Output, string | undefined>();
    assertEqual(
      UndefinedOrString.fromUnknown(42),
      err({
        type: "Union",
        errors: [
          {
            index: 0,
            error: { type: "TypeOf", expected: "String", value: 42 },
          },
        ],
      }),
    );
  });

  it("rejects an uncertain supplied Type", () => {
    type Value = typeof String | typeof Number;
    const value = String as Value;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error The supplied Type must use one concrete Type node.
      undefinedOr(value);
      // @ts-expect-error The supplied Type must preserve its concrete information.
      undefinedOr(erased);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });
});

describe("nullOr", () => {
  it("creates a Union with the supplied Type before Null", () => {
    const NullOrString = nullOr(String);
    const StringOrNumber = union(String, Number);
    const NullOrStringOrNumber = nullOr(StringOrNumber);

    assertEqual(NullOrString.members, [String, Null]);
    assertSame(NullOrStringOrNumber.members[0], StringOrNumber);
    assertType<
      typeof NullOrString,
      UnionType<readonly [typeof String, typeof Null]>
    >();
    assertType<typeof NullOrString.Output, string | null>();
  });

  it("rejects an uncertain supplied Type", () => {
    type Value = typeof String | typeof Number;
    const value = String as Value;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error The supplied Type must use one concrete Type node.
      nullOr(value);
      // @ts-expect-error The supplied Type must preserve its concrete information.
      nullOr(erased);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });
});

describe("nullishOr", () => {
  it("creates a Union with the supplied Type before Null and Undefined", () => {
    const NullishOrString = nullishOr(String);
    const StringOrNumber = union(String, Number);
    const NullishOrStringOrNumber = nullishOr(StringOrNumber);

    assertEqual(NullishOrString.members, [String, Null, Undefined]);
    assertSame(NullishOrStringOrNumber.members[0], StringOrNumber);
    assertType<
      typeof NullishOrString,
      UnionType<readonly [typeof String, typeof Null, typeof Undefined]>
    >();
    assertType<typeof NullishOrString.Output, string | null | undefined>();
  });

  it("rejects an uncertain supplied Type", () => {
    type Value = typeof String | typeof Number;
    const value = String as Value;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error The supplied Type must use one concrete Type node.
      nullishOr(value);
      // @ts-expect-error The supplied Type must preserve its concrete information.
      nullishOr(erased);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });
});

describe("templateLiteralParser", () => {
  it("accepts opaque root Types canonically encoded as strings", () => {
    interface TextError extends TypeError<"Text"> {
      readonly value: unknown;
    }
    const Text = createType(
      "Text",
      (value): Result<string, TextError> =>
        typeof value === "string" ? ok(value) : err({ type: "Text", value }),
      () => "Expected text.",
    );
    const Value = templateLiteralParser("x:", Text);
    const _UnframedValue = templateLiteralParser(Text);

    assertType<typeof Value.Output, readonly [string]>();
    assertType<typeof Value.CanonicalInput, `x:${string}`>();
    assertType<InferErrors<typeof _UnframedValue>, TypeOfError<"String">>();
    assertOk(Value.fromUnknown("x:value"), ["value"]);
    assertEqual(Value.to(["value"]), "x:value");
  });

  it("returns opaque root capture errors from untrusted substrings", () => {
    interface AError extends TypeError<"A"> {
      readonly value: unknown;
    }
    const A = createType(
      "A",
      (value): Result<"a", AError> =>
        value === "a" ? ok(value) : err({ type: "A", value }),
      () => "Expected a.",
    );
    const Value = templateLiteralParser(A);
    const result = Value.fromUnknown("b");

    assertType<
      typeof result,
      Result<
        readonly ["a"],
        | TypeOfError<"String">
        | TransformOutputError<"TemplateLiteral", TupleElementsError<AError>>
      >
    >();
    assertErr(result, {
      type: "TemplateLiteral",
      outputError: {
        type: "Tuple",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 0,
              error: { type: "A", value: "b" },
            },
          ],
        },
      },
    });
  });

  it("keeps String-rooted capture errors staged", () => {
    const A = literal("a");
    const Value = templateLiteralParser(A);
    const result = Value.fromUnknown("b");

    assertType<
      typeof result,
      Result<
        readonly ["a"],
        | TypeOfError<"String">
        | TemplateLiteralError
        | TransformOutputError<
            "TemplateLiteral",
            TupleElementsError<LiteralError<"a">>
          >
      >
    >();
    assertErr(result, {
      type: "TemplateLiteral",
      outputError: {
        type: "Tuple",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 0,
              error: { type: "Literal", expected: "a", value: "b" },
            },
          ],
        },
      },
    });
  });

  it("treats opaque Type names independently of built-in framing", () => {
    interface OpaqueLiteralError extends TypeError<"Literal"> {
      readonly value: unknown;
    }
    const OpaqueLiteral = globalThis.Object.assign(
      createType(
        "Literal",
        (value): Result<string, OpaqueLiteralError> =>
          typeof value === "string"
            ? ok(value)
            : err({ type: "Literal", value }),
        () => "Expected text.",
      ),
      { expected: "a" as const },
    );
    const Value = templateLiteralParser(OpaqueLiteral);

    assertOk(Value.fromUnknown("value"), ["value"]);
    assertEqual(Value.to(["value"]), "value");
  });

  it("does not infer built-in framing from custom child reflection", () => {
    const CustomLiteral = globalThis.Object.assign(
      createType("Literal", String, ok),
      { expected: "a" as const },
    );
    const Value = templateLiteralParser(CustomLiteral);
    const encoded = Value.to(["long"]);

    assertType<InferErrors<typeof Value>, TypeOfError<"String">>();
    assertEqual(encoded, "long");
    assertOk(Value.fromUnknown(encoded), ["long"]);
  });

  it("omits impossible framing errors", () => {
    const Value = templateLiteralParser(String);

    assertType<InferErrors<typeof Value>, TypeOfError<"String">>();
    assertOk(Value.fromUnknown("anything"), ["anything"]);
  });

  it("creates a transforming Type with an exact canonical template string", () => {
    const B = literal("b");
    const Value = templateLiteralParser("a", B, "c");

    assertEqual(Value.name, "TemplateLiteral");
    assertEqual(Value.parent.name, "TemplateLiteral");
    assertSame(Value.parent.parent, String);
    assertEqual(Value.parts, ["a", B, "c"]);
    assertType<
      typeof Value,
      TemplateLiteralParserType<readonly ["a", typeof B, "c"]>
    >();
    assertType<typeof Value.Input, string>();
    assertType<typeof Value.CanonicalInput, "abc">();
    assertType<typeof Value.Output, readonly ["b"]>();
    assertOk(Value.fromUnknown("abc"), ["b"]);
    assertOk(Value.from.parent("abc"), ["b"]);
    assertOk(Value.from(["b"]), ["b"]);
    assertTrue(Value.is(["b"]));
    assertFalse(Value.is("abc"));
    assertEqual(Value.to(["b"]), "abc");
  });

  it("infers the capture Tuple and exact canonical template string", () => {
    const Digit = union("0", "1", "2");
    const Value = templateLiteralParser("user-", Digit);

    assertEqual(Value.parts, ["user-", Digit]);
    assertType<typeof Value.Output, readonly ["0" | "1" | "2"]>();
    assertType<typeof Value.CanonicalInput, "user-0" | "user-1" | "user-2">();
    assertOk(Value.fromUnknown("user-1"), ["1"]);
    assertEqual(Value.to(["2"]), "user-2");
  });

  it("omits raw framing strings from the capture Tuple", () => {
    const A = literal("a");
    const One = literal("1");
    const Value = templateLiteralParser("(", A, ":", One, ")");

    assertType<typeof Value.Output, readonly ["a", "1"]>();
    assertType<typeof Value.CanonicalInput, "(a:1)">();
    assertOk(Value.fromUnknown("(a:1)"), ["a", "1"]);
    assertEqual(Value.to(["a", "1"]), "(a:1)");
  });

  it("distributes fixed-width capture unions in CanonicalInput", () => {
    const Letter = union("a", "b");
    const Digit = union("1", "2");
    const Value = templateLiteralParser(Letter, Digit);

    assertEqual(Value.parts, [Letter, Digit]);
    assertType<typeof Value.Output, readonly ["a" | "b", "1" | "2"]>();
    assertType<typeof Value.CanonicalInput, "a1" | "a2" | "b1" | "b2">();
    assertOk(Value.fromUnknown("b2"), ["b", "2"]);
    assertEqual(Value.to(["a", "1"]), "a1");
  });

  it("frames variable-width and fixed-width Unicode captures", () => {
    const Unicode = templateLiteralParser("🙂", String, "✓");
    const Fixed = templateLiteralParser(literal("🙂"), literal("✓"));

    assertType<typeof Unicode.Output, readonly [string]>();
    assertType<typeof Unicode.CanonicalInput, `🙂${string}✓`>();
    assertOk(Unicode.fromUnknown("🙂value✓"), ["value"]);
    assertOk(Unicode.fromUnknown("🙂✓"), [""]);
    assertEqual(Unicode.to(["🙂value"]), "🙂🙂value✓");
    assertOk(Fixed.fromUnknown("🙂✓"), ["🙂", "✓"]);
    assertEqual(Fixed.to(["🙂", "✓"]), "🙂✓");
    assertErr(Unicode.fromUnknown("🙂value"), {
      type: "TemplateLiteral",
      value: "🙂value",
    });
  });

  it("uses Unicode code-point widths consistently", () => {
    const FixedWidth = union("🙂", "a");
    const VariableWidth = union("🙂", "ab");
    const Value = templateLiteralParser(FixedWidth, String);
    const compileTimeAssertions = () => {
      // @ts-expect-error At most one Type capture can have a variable-width string representation.
      templateLiteralParser(VariableWidth, String);
    };

    assertOk(Value.fromUnknown("🙂value"), ["🙂", "value"]);
    assertOk(Value.fromUnknown("avalue"), ["a", "value"]);
    void compileTimeAssertions;
  });

  it("rejects surrogate pairs formed across part boundaries", () => {
    const HighSurrogate = literal("\uD83D");
    const LowSurrogate = literal("\uDE42");
    const HighSurrogateOrEmoji = union("\uD83D", "🙂");
    const createFromCaptureAndFraming = () =>
      templateLiteralParser(HighSurrogate, "\uDE42");
    const createFromFramingAndCapture = () =>
      templateLiteralParser("\uD83D", LowSurrogate);
    const createAcrossEmptyCapture = () =>
      templateLiteralParser(HighSurrogate, literal(""), "\uDE42");
    const createFromCaptureLanguages = () =>
      templateLiteralParser(HighSurrogateOrEmoji, String);

    for (const create of [
      createFromCaptureAndFraming,
      createFromFramingAndCapture,
      createAcrossEmptyCapture,
      createFromCaptureLanguages,
    ]) {
      const error = assertThrowsInstanceOf(create, Error);
      assertTrue(
        error.message.includes(
          "A TemplateLiteral cannot form a Unicode surrogate pair across part boundaries.",
        ),
      );
    }
  });

  it("does not interpret custom Type names as built-in framing", () => {
    const LiteralName = brand("Literal", String);
    const UnionName = brand("Union", String);
    const TemplateLiteralName = brand("TemplateLiteral", String);
    const StringName = brand("String", literal("a"));
    const LiteralValue = templateLiteralParser(LiteralName);
    const UnionValue = templateLiteralParser(UnionName);
    const TemplateLiteralValue = templateLiteralParser(TemplateLiteralName);
    const StringValue = templateLiteralParser(StringName, String);

    assertOk(LiteralValue.fromUnknown("value"), ["value"]);
    assertOk(UnionValue.fromUnknown("value"), ["value"]);
    assertOk(TemplateLiteralValue.fromUnknown("value"), ["value"]);
    assertOk(StringValue.fromUnknown("avalue"), ["a", "value"]);
  });

  it("preserves built-in framing metadata through localization", () => {
    const A = literal("a");
    const LocalizedA = localizeTypes(
      { A },
      {
        test: {
          Literal: () => "Localized Literal.",
          String: () => "Localized String.",
        },
      },
    ).test.A;
    const Value = templateLiteralParser(LocalizedA, String);

    assertOk(Value.fromUnknown("avalue"), ["a", "value"]);
  });

  it("decodes and encodes a branded string capture", () => {
    const DecimalText = templateLiteralParser(
      "decimal:",
      NonNegativeDecimalString,
    );
    type DecimalLiteral = typeof DecimalText.parent.Output;
    const zero = NonNegativeDecimalString.orThrow("0");
    const value = NonNegativeDecimalString.orThrow("10.5");
    const encoded = DecimalText.to([value]);

    assertType<
      typeof DecimalText.Output,
      readonly [NonNegativeDecimalString]
    >();
    assertType<DecimalLiteral, `decimal:${NonNegativeDecimalString}`>();
    assertType<typeof encoded, DecimalLiteral>();
    assertOk(DecimalText.fromUnknown("decimal:0"), [zero]);
    assertOk(DecimalText.fromUnknown("decimal:10.5"), [value]);
    assertEqual(encoded, "decimal:10.5");
  });

  it("decodes transformations and encodes their canonical strings", () => {
    const NumberFromString = setupNumberFromString();
    const NumberValue = templateLiteralParser("number:", NumberFromString);
    type NumberLiteral = typeof NumberValue.parent.Output;
    type NumberShape = `number:${string}`;
    const encoded = NumberValue.to([42]);

    assertType<typeof NumberValue.Output, readonly [number]>();
    assertType<NumberLiteral extends NumberShape ? true : false, true>();
    assertType<NumberShape extends NumberLiteral ? true : false, false>();
    assertType<typeof encoded, NumberLiteral>();
    assertOk(NumberValue.fromUnknown("number:42"), [42]);
    assertEqual(encoded, "number:42");
    assertTrue(NumberValue.parent.is(encoded));
    assertFalse(NumberValue.parent.is("number:not-a-number"));
    assertOk(NumberValue.from.parent(encoded), [42]);

    const compileTimeAssertions = () => {
      // @ts-expect-error A matching string is not necessarily canonical.
      const validLooking: NumberLiteral = "number:42";
      // @ts-expect-error An invalid string is not canonical.
      const invalid: NumberLiteral = "number:not-a-number";
      return [validLooking, invalid];
    };
    void compileTimeAssertions;
  });

  it("distinguishes transforming templates with the same string shape", () => {
    const NumberFromString = setupNumberFromString();
    const BooleanFromString = transform(
      "BooleanFromString",
      String,
      Boolean,
      {
        from: (value) =>
          value === "true"
            ? ok(true)
            : value === "false"
              ? ok(false)
              : err({ type: "BooleanFromString", value }),
        // Widen the return type so both transformations expose the same shape.
        to: (value): string => globalThis.String(value),
      },
      (error) => `The value ${error.value} is not a boolean.`,
    );
    const NumberValue = templateLiteralParser("value:", NumberFromString);
    const BooleanValue = templateLiteralParser("value:", BooleanFromString);
    type NumberLiteral = typeof NumberValue.parent.Output;
    type BooleanLiteral = typeof BooleanValue.parent.Output;
    const numberLiteral = NumberValue.to([1.5]);
    const booleanLiteral = BooleanValue.to([true]);

    assertType<NumberLiteral extends `value:${string}` ? true : false, true>();
    assertType<BooleanLiteral extends `value:${string}` ? true : false, true>();
    assertType<NumberLiteral extends BooleanLiteral ? true : false, false>();
    assertType<BooleanLiteral extends NumberLiteral ? true : false, false>();
    assertEqual(numberLiteral, "value:1.5");
    assertEqual(booleanLiteral, "value:true");
    assertOk(NumberValue.fromUnknown(numberLiteral), [1.5]);
    assertOk(BooleanValue.fromUnknown(booleanLiteral), [true]);
  });

  it("normalizes a capture once and encodes its canonical value", () => {
    const { Lowercase, LowercaseFromString } = setupLowercaseFromString();
    const Value = templateLiteralParser("tag:", LowercaseFromString);
    type ValueLiteral = typeof Value.parent.Output;
    const lowercase = Lowercase.orThrow("evolu");
    const encoded = Value.to([lowercase]);

    assertType<ValueLiteral extends `tag:${string}` ? true : false, true>();
    assertType<`tag:${string}` extends ValueLiteral ? true : false, false>();
    assertOk(Value.fromUnknown("tag:EVOLU"), [lowercase]);
    assertType<typeof encoded, ValueLiteral>();
    assertEqual(encoded, "tag:evolu");
  });

  it("uses the final framing position without delimiter backtracking", () => {
    const Value = templateLiteralParser(String, "::");

    assertOk(Value.fromUnknown("a::::"), ["a::"]);
    assertEqual(Value.to(["a::"]), "a::::");
  });

  it("rejects ambiguous variable-width captures statically", () => {
    const VariableUnion = union("a", "bb");
    const Inner = templateLiteralParser("<", String, ">");
    const compileTimeAssertions = () => {
      // @ts-expect-error At most one Type capture can have a variable-width string representation.
      templateLiteralParser(String, ":", String);
      // @ts-expect-error At most one Type capture can have a variable-width string representation.
      templateLiteralParser(VariableUnion, String);
      // @ts-expect-error At most one Type capture can have a variable-width string representation.
      templateLiteralParser(Inner, String);
    };

    void compileTimeAssertions;
  });

  it("requires a capture and canonically string-encoded concrete parts", () => {
    const widened = "value" as string;
    const uncertain = String as typeof String | typeof Number;
    const parts: ReadonlyArray<typeof String> = [String];
    const compileTimeAssertions = () => {
      // @ts-expect-error At least one part must be a Type capture.
      templateLiteralParser("value");
      // @ts-expect-error Part must be a raw string literal or a Type canonically encoded as a string.
      templateLiteralParser(1, String);
      // @ts-expect-error Part must be a raw string literal or a Type canonically encoded as a string.
      templateLiteralParser(literal(1));
      // @ts-expect-error Expected must be one concrete literal value.
      templateLiteralParser(widened, String);
      // @ts-expect-error Part must be a raw string literal or a Type canonically encoded as a string.
      templateLiteralParser(Number);
      // @ts-expect-error Part must be a raw string literal or a Type canonically encoded as a string.
      templateLiteralParser(uncertain);
      // @ts-expect-error Parts must use one concrete finite non-empty tuple.
      templateLiteralParser(...parts);
    };

    void compileTimeAssertions;
  });

  it("decodes every capture exactly once", () => {
    let calls = 0;
    const Capture = brand("TemplateLiteralCapture", String, () => {
      calls++;
      return ok();
    });
    const Value = templateLiteralParser("<", Capture, ">");

    assertOk(Value.fromUnknown("<value>"), ["value"]);
    assertEqual(calls, 1);
  });

  it("composes nested transforming TemplateLiteral captures", () => {
    const Inner = templateLiteralParser("a", literal("b"));
    const Value = templateLiteralParser("<", Inner, ">");
    type ValueLiteral = typeof Value.parent.Output;
    const encoded = Value.to([["b"]]);

    assertType<typeof Inner.Output, readonly ["b"]>();
    assertType<typeof Value.Output, readonly [readonly ["b"]]>();
    assertType<ValueLiteral extends "<ab>" ? true : false, true>();
    assertType<"<ab>" extends ValueLiteral ? true : false, false>();
    assertType<typeof encoded, ValueLiteral>();
    assertOk(Value.fromUnknown("<ab>"), [["b"]]);
    assertEqual(encoded, "<ab>");
  });

  it("composes canonical literal parents as fixed-width captures", () => {
    const A = templateLiteralParser(literal("a")).parent;
    const B = templateLiteralParser(literal("b")).parent;
    const Value = templateLiteralParser(A, B);

    assertType<typeof Value.Output, readonly ["a", "b"]>();
    assertType<typeof Value.CanonicalInput, "ab">();
    assertOk(Value.fromUnknown("ab"), ["a", "b"]);
    assertEqual(Value.to(["a", "b"]), "ab");
  });

  it("distinguishes input, framing, and capture errors", () => {
    const Value = templateLiteralParser("<", PositiveDecimalString, ">");
    const inputResult = Value.fromUnknown(1);
    const captureResult = Value.fromUnknown("<0>");

    assertEqual(
      inputResult,
      err({ type: "TypeOf", expected: "String", value: 1 }),
    );
    assertEqual(
      Value.fromUnknown("10"),
      err({ type: "TemplateLiteral", value: "10" }),
    );
    assertEqual(
      Value.fromUnknown(""),
      err({ type: "TemplateLiteral", value: "" }),
    );
    assertEqual(
      captureResult,
      err({
        type: "TemplateLiteral",
        outputError: {
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "PositiveDecimalString", value: "0" },
              },
            ],
          },
        },
      }),
    );
    assertErr(inputResult);
    assertEqual(
      Value.formatError(inputResult.error),
      "A value 1 is not a string.",
    );
    assertErr(captureResult);
    assertEqual(
      Value.formatError(captureResult.error),
      'The value "0" must be a positive decimal string.',
    );
    {
      const actual = Value.fromUnknown("<1>");
      assertType<
        typeof actual,
        Result<typeof Value.Output, InferErrors<typeof Value>>
      >();
    }
  });

  it("formats and localizes TemplateLiteral errors", () => {
    const Value = templateLiteralParser("a", literal("b"));
    const Localized = localizeTypes(
      { Value },
      {
        cs: {
          Literal: () => "Literál.",
          String: cs.formatStringError,
          TemplateLiteral: cs.formatTemplateLiteralError,
          Tuple: () => "N-tice.",
        },
      },
    ).cs.Value;

    assertEqual(
      Value.formatError({ type: "TemplateLiteral", value: "b" }),
      'The value "b" does not match the template literal.',
    );
    assertEqual(
      Localized.formatError({ type: "TemplateLiteral", value: "b" }),
      'Hodnota "b" neodpovídá šablonovému řetězci.',
    );
    assertEqual(
      Localized.parent.formatError({ type: "TemplateLiteral", value: "b" }),
      'Hodnota "b" neodpovídá šablonovému řetězci.',
    );
  });

  it("keeps fixed-width union combinations symbolic at runtime", () => {
    const Bit = union("0", "1");
    const Value = templateLiteralParser(Bit, Bit, Bit, Bit);

    assertEqual(Value.parts, [Bit, Bit, Bit, Bit]);
    assertOk(Value.fromUnknown("0101"), ["0", "1", "0", "1"]);
    assertType<
      typeof Value.CanonicalInput,
      | "0000"
      | "0001"
      | "0010"
      | "0011"
      | "0100"
      | "0101"
      | "0110"
      | "0111"
      | "1000"
      | "1001"
      | "1010"
      | "1011"
      | "1100"
      | "1101"
      | "1110"
      | "1111"
    >();
  });

  it("models the Percentage capture and canonical string directly", () => {
    const Digit1To99 = union("1", "9", "10", "99");
    const Percentage = templateLiteralParser(Digit1To99, "%");
    type PercentageLiteral = typeof Percentage.parent.Output;
    const percentage: PercentageLiteral = "10%";

    assertType<typeof Percentage.Output, readonly ["1" | "9" | "10" | "99"]>();
    assertType<PercentageLiteral, "1%" | "9%" | "10%" | "99%">();
    assertEqual(percentage, "10%");
    assertOk(Percentage.fromUnknown("99%"), ["99"]);
    assertEqual(Percentage.to(["10"]), "10%");
  });

  it("preserves exact syntax through an outer application transform", () => {
    const PixelDigits = union("0", "1", "2");
    const PixelsSyntax = templateLiteralParser(PixelDigits, "px");
    const PixelsValue = brand("Pixels", union(0, 1, 2));
    const Pixels = transform("PixelsFromString", PixelsSyntax, PixelsValue, {
      from: ([digits]) => ok(digits === "0" ? 0 : digits === "1" ? 1 : 2),
      to: (pixels) => [pixels === 0 ? "0" : pixels === 1 ? "1" : "2"] as const,
    });
    type Pixels = typeof Pixels.Output;
    type PixelsLiteral = typeof Pixels.CanonicalInput;
    const literal: PixelsLiteral = "2px";
    const two = PixelsValue.orThrow(2);

    assertType<Pixels, typeof PixelsValue.Output>();
    assertType<PixelsLiteral, "0px" | "1px" | "2px">();
    assertOk(Pixels.fromUnknown(literal), two);
    assertEqual(Pixels.to(two), "2px");
  });

  it("stages canonical string validation before capture parsing", () => {
    const Language = union("en", "cs");
    const Region = union("US", "CZ");
    const SupportedLocale = templateLiteralParser(Language, "-", Region);
    type SupportedLocale = typeof SupportedLocale.Output;
    type SupportedLocaleLiteral = typeof SupportedLocale.parent.Output;
    const locale: SupportedLocale = ["cs", "CZ"];
    const input: unknown = "cs-CZ";

    assertEqual(SupportedLocale.name, "TemplateLiteral");
    assertEqual(SupportedLocale.parent.name, "TemplateLiteral");
    assertSame(SupportedLocale.parent.parent, String);
    assertType<
      typeof SupportedLocale,
      TemplateLiteralParserType<readonly [typeof Language, "-", typeof Region]>
    >();
    assertType<typeof SupportedLocale.Input, string>();
    assertType<SupportedLocaleLiteral, "en-US" | "en-CZ" | "cs-US" | "cs-CZ">();
    assertType<SupportedLocale, readonly ["en" | "cs", "US" | "CZ"]>();
    assertType<typeof SupportedLocale.CanonicalInput, SupportedLocaleLiteral>();

    assert(
      SupportedLocale.parent.is(input),
      "Expected SupportedLocale.parent.",
    );
    assertType<typeof input, SupportedLocaleLiteral>();
    assertFalse(SupportedLocale.parent.is("fr-CZ"));
    assertOk(SupportedLocale.parent.fromUnknown("cs-CZ"), "cs-CZ");
    assertErr(SupportedLocale.fromUnknown(null), {
      type: "TypeOf",
      expected: "String",
      value: null,
    });
    assertOk(SupportedLocale.fromUnknown("cs-CZ"), locale);
    assertOk(SupportedLocale.from.parent("cs-CZ"), locale);
    assertOk(SupportedLocale.from.parent.parent("cs-CZ"), locale);
    const invalidResult = SupportedLocale.from.parent.parent("fr-CZ");
    assertErr(invalidResult);
    assertEqual(invalidResult.error.type, "TemplateLiteral");
    assertAssertionError(
      () => SupportedLocale.from.parent("fr-CZ" as SupportedLocaleLiteral),
      "Expected TemplateLiteral.",
      {
        type: "TemplateLiteral",
        outputError: {
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: {
                  type: "Union",
                  errors: [
                    {
                      index: 0,
                      error: {
                        type: "Literal",
                        expected: "en",
                        value: "fr",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    );
    assertEqual(SupportedLocale.to(["en", "US"]), "en-US");

    const compileTimeAssertions = () => {
      const supported: SupportedLocaleLiteral = "cs-CZ";
      // @ts-expect-error Unsupported language.
      const unsupported: SupportedLocaleLiteral = "fr-CZ";
      return [supported, unsupported];
    };
    void compileTimeAssertions;
  });

  it("normalizes broader capture input into a canonical literal", () => {
    const { Lowercase, LowercaseFromString } = setupLowercaseFromString();
    const Tag = templateLiteralParser("tag:", LowercaseFromString);
    type TagLiteral = typeof Tag.parent.Output;
    const lowercase = Lowercase.orThrow("evolu");

    assertType<typeof Tag.Output, readonly [string & Brand<"Lowercase">]>();
    assertFalse(Tag.parent.is(null));
    assertTrue(Tag.parent.is("tag:evolu"));
    assertFalse(Tag.parent.is("tag:EVOLU"));
    assertErr(Tag.parent.fromUnknown(null), {
      type: "TypeOf",
      expected: "String",
      value: null,
    });
    assertOk(Tag.parent.fromUnknown("tag:EVOLU"), "tag:evolu");
    assertOk(Tag.fromUnknown("tag:EVOLU"), [lowercase]);
    assertOk(Tag.from.parent.parent("tag:EVOLU"), [lowercase]);
    assertAssertionError(
      () => Tag.from.parent("tag:EVOLU" as TagLiteral),
      "Expected TemplateLiteral.",
      { type: "TemplateLiteral", value: "tag:EVOLU" },
    );
    assertEqual(Tag.to([lowercase]), "tag:evolu");

    const compileTimeAssertions = () => {
      // @ts-expect-error Encoding requires a lowercase branded Output.
      Tag.to(["EVOLU"]);
    };
    void compileTimeAssertions;
  });

  it("exposes canonical and parsed Standard Schema stages", async () => {
    const { Lowercase, LowercaseFromString } = setupLowercaseFromString();
    const Tag = templateLiteralParser("tag:", LowercaseFromString);
    const lowercase = Lowercase.orThrow("evolu");

    assertEqual(await Tag.parent["~standard"].validate("tag:EVOLU"), {
      value: "tag:evolu",
    });
    assertEqual(await Tag["~standard"].validate("tag:EVOLU"), {
      value: [lowercase],
    });
  });

  it("runs only the capture operations required at each boundary", () => {
    let decodeCalls = 0;
    let encodeCalls = 0;
    const Capture = transform("TemplateLiteralCapture", String, String, {
      from: (value) => {
        decodeCalls++;
        return ok(value);
      },
      to: (value) => {
        encodeCalls++;
        return value;
      },
    });
    const Value = templateLiteralParser("<", Capture, ">");

    assertOk(Value.fromUnknown("<value>"), ["value"]);
    assertEqual(decodeCalls, 1);
    assertEqual(encodeCalls, 0);

    decodeCalls = 0;
    encodeCalls = 0;
    const canonical = Value.parent.orThrow("<value>");
    assertEqual(decodeCalls, 1);
    assertEqual(encodeCalls, 1);

    decodeCalls = 0;
    encodeCalls = 0;
    assertOk(Value.from.parent(canonical), ["value"]);
    assertEqual(decodeCalls, 1);
    assertEqual(encodeCalls, 1);

    decodeCalls = 0;
    encodeCalls = 0;
    assertOk(Value.from.parent.parent("<value>"), ["value"]);
    assertEqual(decodeCalls, 1);
    assertEqual(encodeCalls, 0);

    decodeCalls = 0;
    encodeCalls = 0;
    assertEqual(Value.to(["value"]), "<value>");
    assertEqual(decodeCalls, 0);
    assertEqual(encodeCalls, 1);
  });
});

describe("templateLiteral", () => {
  it("creates the canonical string Type directly", () => {
    const B = literal("b");
    const Value = templateLiteral("a", B, "c");

    assertEqual(Value.name, "TemplateLiteral");
    assertSame(Value.parent, String);
    assertEqual(Value.parts, ["a", B, "c"]);
    assertType<
      typeof Value,
      TemplateLiteralType<readonly ["a", typeof B, "c"]>
    >();
    assertType<typeof Value.Input, string>();
    assertType<typeof Value.CanonicalInput, "abc">();
    assertType<typeof Value.Output, "abc">();
    assertOk(Value.fromUnknown("abc"), "abc");
    assertTrue(Value.is("abc"));
    assertFalse(Value.is("adc"));
    assertFalse(Value.is(["b"]));
  });

  it("uses the same reversible framing rules as templateLiteralParser", () => {
    const Value = templateLiteral(String, "::");
    const Parser = templateLiteralParser(String, "::");
    const compileTimeAssertions = () => {
      // @ts-expect-error At most one Type capture can have a variable-width string representation.
      templateLiteral(String, ":", String);
    };

    assertOk(Value.fromUnknown("a::::"), "a::::");
    assertSame(Value.is("a::::"), Parser.parent.is("a::::"));
    void compileTimeAssertions;
  });
});

describe("brand", () => {
  const setupLabel = () => {
    const validations: Array<string> = [];

    const TrimmedString = brand(
      "TrimmedString",
      String,
      (value) => {
        validations.push("TrimmedString");
        return value === value.trim()
          ? ok()
          : err({ type: "TrimmedString", value });
      },
      formatTestTypeError,
    );

    type TrimmedString = typeof TrimmedString.Output;

    const NonEmptyString = brand(
      "NonEmptyString",
      TrimmedString,
      (value) => {
        validations.push("NonEmptyString");
        return value.length > 0 ? ok() : err({ type: "NonEmptyString", value });
      },
      formatTestTypeError,
    );

    type NonEmptyString = typeof NonEmptyString.Output;

    const MaxLengthString = brand(
      "MaxLengthString",
      NonEmptyString,
      (value) => {
        validations.push("MaxLengthString");
        return value.length <= 5
          ? ok()
          : err({
              type: "MaxLengthString",
              maxLength: 5,
              value,
            });
      },
      formatTestTypeError,
    );

    type MaxLengthString = typeof MaxLengthString.Output;

    const Label = brand("Label", MaxLengthString);

    type Label = typeof Label.Output;

    return {
      Label,
      MaxLengthString,
      NonEmptyString,
      TrimmedString,
      validations,
    };
  };

  it("adds a semantic brand without adding a refinement error", () => {
    const UserId = brand("UserId", String);
    const result = UserId.from.parent("id");

    assertEqual(UserId.name, "UserId");
    assertType<typeof UserId.name, "UserId">();
    assertSame(UserId.parent, String);
    assertType<typeof UserId, BrandType<typeof String, "UserId", never>>();
    assertType<typeof UserId.Input, string>();
    assertType<typeof UserId.Error, never>();
    assertType<typeof UserId.parent, typeof String>();
    assertType<typeof result, Result<typeof UserId.Output>>();
    assertOk(result, "id");
    assertSame(UserId.formatError, String.formatError);
    assertType<
      Parameters<typeof UserId.formatError>[0],
      TypeOfError<"String">
    >();
  });

  it("rejects an unresolved generic infallible name", () => {
    const compileTimeAssertions = <Name extends "A" | "B">(
      name: Name,
    ): Name => {
      // @ts-expect-error An unresolved generic name might be a union.
      brand<Name, typeof String>(name, String);
      return name;
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects a union of parent Types", () => {
    type Parent = typeof String | typeof Number;
    type ParentParameter = Parameters<
      typeof brand<"StringOrNumber", Parent>
    >[1];

    assertType<Parent extends ParentParameter ? true : false, false>();
    assertType<
      ParentParameter,
      "⛔ Type error: Parent must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
    >();
  });

  it("rejects a parent with erased concrete Type information", () => {
    const erased: FormattableTypeNode = brand("Erased", String);

    const compileTimeAssertions = () => {
      // @ts-expect-error A parent must preserve its concrete Type.
      brand("Wrapped", erased);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("inherits the parent formatter when validation is infallible", () => {
    const Validated = brand("Validated", String, () => ok());

    assertSame(Validated.formatError, String.formatError);
    assertType<typeof Validated.Error, never>();
  });

  it("requires a formatter when a brand adds a validation error", () => {
    interface ValidatedWithoutFormatterError extends TypeError<"ValidatedWithoutFormatter"> {
      readonly value: string;
    }

    const validateWithoutFormatter = (
      value: string,
    ): Result<void, ValidatedWithoutFormatterError> =>
      err({ type: "ValidatedWithoutFormatter", value });

    const compileTimeAssertions = () => {
      // @ts-expect-error A fallible brand must format its own error.
      brand("ValidatedWithoutFormatter", String, validateWithoutFormatter);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires one concrete name when validation is fallible", () => {
    interface AError extends TypeError<"A"> {
      readonly value: string;
    }

    const unionName = "A" as "A" | "B";
    const broadName = "A" as Capitalize<string>;
    const patternedName = "A" as `A${string}`;
    const validate = (value: string): Result<void, AError> =>
      err({ type: "A", value });
    const formatError = () => "A error.";

    const compileTimeAssertions = () => {
      // @ts-expect-error A union does not identify one concrete Brand name.
      brand(unionName, String, validate, formatError);
      // @ts-expect-error A widened string does not identify one concrete Brand name.
      brand(broadName, String, validate, formatError);
      // @ts-expect-error A template pattern does not identify one concrete Brand name.
      brand(patternedName, String, validate, formatError);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects an error type inherited from the parent Type", () => {
    interface DuplicateTypeOfError extends TypeError<"TypeOf"> {
      readonly value: string;
    }

    const compileTimeAssertions = () => {
      brand(
        "TypeOf",
        // @ts-expect-error A Brand error must not duplicate an inherited error type.
        String,
        (value: string): Result<void, DuplicateTypeOfError> =>
          err({ type: "TypeOf", value }),
        () => "Duplicate TypeOf error.",
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires a brand error type matching the brand name", () => {
    interface DifferentNameError extends TypeError<"DifferentName"> {
      readonly value: string;
    }

    const compileTimeAssertions = () => {
      brand(
        "BrandName",
        String,
        // @ts-expect-error A brand error type must match the brand name.
        (value: string): Result<void, DifferentNameError> =>
          err({ type: "DifferentName", value }),
        () => "Different name error.",
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("requires validation to report success without replacing the parent value", () => {
    const compileTimeAssertions = () => {
      brand(
        "Lowercase",
        String,
        // @ts-expect-error A Brand validation cannot replace the parent value.
        (value) => ok(value.toLowerCase()),
        formatTestTypeError,
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("validates only the brand after a validated Literal parent through from.parent", () => {
    const Hello = literal("Hello");
    const Greeting = brand("Greeting", Hello);
    const hello = getOrThrow(Hello.from("Hello"));
    const greeting = getOrThrow(Greeting.from.parent(hello));

    assertSame(Greeting.parent, Hello);
    assertSame(Greeting.parent.parent, String);
    assertEqual(Greeting.from(greeting), ok("Hello"));
    assertEqual(
      Greeting.from.parent.parent("World"),
      err({ type: "Literal", expected: "Hello", value: "World" }),
    );
    assertEqual(Greeting.from.parent(hello), ok("Hello"));
    {
      const actual = Greeting.from(greeting);
      assertType<typeof actual, Result<typeof Greeting.Output>>();
    }
    {
      const actual = Greeting.from.parent(hello);
      assertType<typeof actual, Result<typeof Greeting.Output>>();
    }
  });

  it("accumulates every brand in its Output type", () => {
    const { Label: _Label } = setupLabel();

    assertType<
      typeof _Label.Output,
      string &
        Brand<"TrimmedString"> &
        Brand<"NonEmptyString"> &
        Brand<"MaxLengthString"> &
        Brand<"Label">
    >();
  });

  it("exposes every preceding Type through parent", () => {
    const { Label, MaxLengthString, NonEmptyString, TrimmedString } =
      setupLabel();

    assertSame(Label.parent, MaxLengthString);
    assertSame(Label.parent.parent, NonEmptyString);
    assertSame(Label.parent.parent.parent, TrimmedString);
    assertSame(Label.parent.parent.parent.parent, String);
  });

  it("moves the output target toward the root through Type.parent", () => {
    const {
      Label,
      MaxLengthString: _MaxLengthString,
      validations,
    } = setupLabel();
    const value = Label.parent.orThrow("value");
    validations.length = 0;
    const result = Label.parent.from(value);

    assertType<typeof result, Result<typeof _MaxLengthString.Output>>();
    assertOk(result, "value");
    assertEqual(validations, [
      "TrimmedString",
      "NonEmptyString",
      "MaxLengthString",
    ]);
  });

  describe("fromUnknown", () => {
    it("validates every Type and returns the final branded value", () => {
      const { Label, validations } = setupLabel();
      const result = Label.fromUnknown("value");

      assertOk(result, "value");
      assertType<typeof result.value, typeof Label.Output>();
      assertEqual(validations, [
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);
    });

    it("returns the first failing Type error", () => {
      {
        const { Label, validations } = setupLabel();

        assertEqual(
          Label.fromUnknown(42),
          err({ type: "TypeOf", expected: "String", value: 42 }),
        );
        assertEqual(validations, []);
      }

      {
        const { Label, validations } = setupLabel();

        assertEqual(
          Label.fromUnknown(" value "),
          err({ type: "TrimmedString", value: " value " }),
        );
        assertEqual(validations, ["TrimmedString"]);
      }

      {
        const { Label, validations } = setupLabel();

        assertEqual(
          Label.fromUnknown(""),
          err({ type: "NonEmptyString", value: "" }),
        );
        assertEqual(validations, ["TrimmedString", "NonEmptyString"]);
      }

      {
        const { Label, validations } = setupLabel();

        assertEqual(
          Label.fromUnknown("longer"),
          err({
            type: "MaxLengthString",
            maxLength: 5,
            value: "longer",
          }),
        );
        assertEqual(validations, [
          "TrimmedString",
          "NonEmptyString",
          "MaxLengthString",
        ]);
      }
    });

    it("infers every reachable validation error", () => {
      const {
        Label,
        MaxLengthString: _MaxLengthString,
        NonEmptyString: _NonEmptyString,
        TrimmedString: _TrimmedString,
      } = setupLabel();
      type Errors =
        | TypeOfError<"String">
        | typeof _TrimmedString.Error
        | typeof _NonEmptyString.Error
        | typeof _MaxLengthString.Error;

      {
        const actual = Label.fromUnknown("value");
        assertType<typeof actual, Result<typeof Label.Output, Errors>>();
      }
      assertType<InferErrors<typeof Label>, Errors>();
    });
  });

  describe("is", () => {
    it("a type guard that validates the whole chain and narrows to the final Output", () => {
      const { Label, validations } = setupLabel();
      const value: unknown = "value";

      assert(Label.is(value), "Expected value to be a Label.");

      assertType<typeof value, typeof Label.Output>();
      assertEqual(validations, [
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      const invalid = setupLabel();
      assertFalse(invalid.Label.is(" value "));
      assertEqual(invalid.validations, ["TrimmedString"]);
    });
  });

  describe("from", () => {
    it("asserts its own Output", () => {
      const { Label, validations } = setupLabel();
      const value = Label.orThrow("value");
      validations.length = 0;

      assertEqual(Label.from(value), ok("value"));
      assertType<Parameters<typeof Label.from>[0], typeof Label.Output>();
      assertEqual(validations, [
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);
    });

    it("cannot return a validation error", () => {
      const { Label } = setupLabel();

      assertType<ReturnType<typeof Label.from>, Result<typeof Label.Output>>();
    });
  });

  describe("from.parent", () => {
    it("accepts the parent Output and preserves the final output target", () => {
      const { Label, MaxLengthString } = setupLabel();
      const value = MaxLengthString.orThrow("value");
      const result = Label.from.parent(value);

      assertEqual(result, ok("value"));
      assertType<
        Parameters<typeof Label.from.parent>[0],
        typeof MaxLengthString.Output
      >();
      assertType<typeof result, Result<typeof Label.Output>>();
    });

    it("infers only errors after the selected input boundary", () => {
      const {
        Label,
        MaxLengthString: _MaxLengthString,
        NonEmptyString: _NonEmptyString,
        TrimmedString: _TrimmedString,
      } = setupLabel();

      assertType<
        ReturnType<typeof Label.from.parent>,
        Result<typeof Label.Output>
      >();
      assertType<
        ReturnType<typeof Label.from.parent.parent>,
        Result<typeof Label.Output, typeof _MaxLengthString.Error>
      >();
      assertType<
        ReturnType<typeof Label.from.parent.parent.parent>,
        Result<
          typeof Label.Output,
          typeof _NonEmptyString.Error | typeof _MaxLengthString.Error
        >
      >();
      assertType<
        ReturnType<typeof Label.from.parent.parent.parent.parent>,
        Result<
          typeof Label.Output,
          | typeof _TrimmedString.Error
          | typeof _NonEmptyString.Error
          | typeof _MaxLengthString.Error
        >
      >();
      assertType<
        Parameters<typeof Label.from.parent>[0],
        typeof _MaxLengthString.Output
      >();
      assertType<
        Parameters<typeof Label.from.parent.parent>[0],
        typeof _NonEmptyString.Output
      >();
      assertType<
        Parameters<typeof Label.from.parent.parent.parent>[0],
        typeof _TrimmedString.Output
      >();
      assertType<
        Parameters<typeof Label.from.parent.parent.parent.parent>[0],
        typeof String.Output
      >();
    });

    it("asserts the selected boundary and validates the remaining Types", () => {
      const {
        Label,
        MaxLengthString,
        NonEmptyString,
        TrimmedString,
        validations,
      } = setupLabel();

      const maxLength = MaxLengthString.orThrow("value");
      validations.length = 0;
      assertEqual(Label.from.parent(maxLength), ok("value"));
      assertEqual(validations, [
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      const nonEmpty = NonEmptyString.orThrow("value");
      validations.length = 0;
      assertEqual(Label.from.parent.parent(nonEmpty), ok("value"));
      assertEqual(validations, [
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      const trimmed = TrimmedString.orThrow("value");
      validations.length = 0;
      assertEqual(Label.from.parent.parent.parent(trimmed), ok("value"));
      assertEqual(validations, [
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      validations.length = 0;
      assertEqual(Label.from.parent.parent.parent.parent("value"), ok("value"));
      assertEqual(validations, [
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);
    });

    it("ends when the input boundary reaches the root", () => {
      const { Label } = setupLabel();
      const deepest = Label.from.parent.parent.parent.parent;

      assertFalse("parent" in deepest);
      assertType<"parent" extends keyof typeof deepest ? true : false, false>();
    });
  });

  describe("orThrow", () => {
    it("converts a typed Input or throws the first failing Type error", () => {
      const { Label, validations } = setupLabel();
      const value = Label.orThrow("value");

      assertEqual(value, "value");
      assertType<typeof value, typeof Label.Output>();
      assertType<Parameters<typeof Label.orThrow>[0], typeof Label.Input>();
      validations.length = 0;
      assertAssertionError(() => Label.orThrow(" value "), "getOrThrow", {
        type: "TrimmedString",
        value: " value ",
      });
      assertEqual(validations, ["TrimmedString"]);
    });
  });

  describe("orNull", () => {
    it("converts a typed Input or returns null for the first failing Type", () => {
      const { Label, validations } = setupLabel();
      const value = Label.orNull("value");

      assertEqual(value, "value");
      assertType<typeof value, typeof Label.Output | null>();
      assertType<Parameters<typeof Label.orNull>[0], typeof Label.Input>();
      validations.length = 0;
      assertSame(Label.orNull(" value "), null);
      assertEqual(validations, ["TrimmedString"]);
    });
  });

  it("does not expose parent input boundaries through convenience operations", () => {
    const { Label } = setupLabel();

    assertFalse("parent" in Label.orThrow);
    assertType<
      "parent" extends keyof typeof Label.orThrow ? true : false,
      false
    >();
    assertFalse("parent" in Label.orNull);
    assertType<
      "parent" extends keyof typeof Label.orNull ? true : false,
      false
    >();
  });

  describe("Type", () => {
    describe("DateIso", () => {
      it("is branded from String", () => {
        assertEqual(DateIso.name, "DateIso");
        assertSame(DateIso.parent, String);
        assertType<
          typeof DateIso,
          BrandType<typeof String, "DateIso", DateIsoError>
        >();
        assertType<typeof DateIso.Input, string>();
        assertType<typeof DateIso.Output, string & Brand<"DateIso">>();
        assertType<typeof DateIso.Error, DateIsoError>();
        assertType<
          DateIsoError extends TypeValueError<"DateIso"> ? true : false,
          true
        >();
      });

      it("accepts canonical ISO 8601 date-time strings", () => {
        const values = [
          "0000-01-01T00:00:00.000Z",
          "2023-01-01T12:00:00.000Z",
          "9999-12-31T23:59:59.999Z",
        ];

        for (const value of values) {
          assertEqual(DateIso.from.parent(value), ok(value));
        }
      });

      it("returns a DateIso error for invalid or non-canonical date-time strings", () => {
        const values = [
          "",
          "2023-01-01",
          "2023-02-30T00:00:00.000Z",
          "2023-01-01t00:00:00.000z",
          "2023-01-01T00:00:00+01:00",
          "2023-06-30T23:59:60.000Z",
          "10000-01-01T00:00:00.000Z",
        ];

        for (const value of values) {
          assertEqual(
            DateIso.from.parent(value),
            err({ type: "DateIso", value }),
          );
        }
      });

      it("returns the parent TypeOf error for a non-string unknown value", () => {
        const value: unknown = 42;

        assertEqual(
          DateIso.fromUnknown(value),
          err({ type: "TypeOf", expected: "String", value }),
        );
      });

      it("formats its own and inherited errors", () => {
        assertEqual(
          DateIso.formatError({ type: "DateIso", value: "2023-01-01" }),
          'The value "2023-01-01" is not a canonical ISO date-time string.',
        );
        assertEqual(
          DateIso.formatError({
            type: "TypeOf",
            expected: "String",
            value: 42,
          }),
          "A value 42 is not a string.",
        );
        assertType<
          Parameters<typeof DateIso.formatError>[0],
          TypeOfError<"String"> | DateIsoError
        >();
      });
    });

    describe("DateIsoFromDate", () => {
      it("safely transforms a Date to DateIso and back", () => {
        const value = new globalThis.Date("2023-01-01T12:00:00.000Z");
        const result = DateIsoFromDate.from.parent(value);

        type ExpectedResult = Result<
          DateIso,
          | DateIsoFromDateError
          | TransformOutputError<"DateIsoFromDate", DateIsoError>
        >;
        assertType<typeof result, ExpectedResult>();
        assertOk(result, "2023-01-01T12:00:00.000Z");
        assertEqual(DateIsoFromDate.to(result.value), value);
        {
          const actual = DateIsoFromDate.to(result.value);
          assertType<typeof actual, globalThis.Date>();
        }
      });

      it("maps a thrown toISOString error", () => {
        const value = new globalThis.Date(globalThis.Number.NaN);

        assertEqual(
          DateIsoFromDate.from.parent(value),
          err({ type: "DateIsoFromDate", value }),
        );
        assertEqual(
          DateIsoFromDate.formatError({ type: "DateIsoFromDate", value }),
          "The Date cannot be represented as DateIso.",
        );
      });

      it("rejects a Date whose ISO text is not canonical DateIso", () => {
        const value = new globalThis.Date("+010000-01-01T00:00:00.000Z");

        assertEqual(
          DateIsoFromDate.from.parent(value),
          err({
            type: "DateIsoFromDate",
            outputError: {
              type: "DateIso",
              value: "+010000-01-01T00:00:00.000Z",
            },
          }),
        );
      });
    });

    describe("Int64", () => {
      it("is branded from BigInt", () => {
        assertEqual(Int64.name, "Int64");
        assertSame(Int64.parent, BigInt);
        assertType<
          typeof Int64,
          BrandType<typeof BigInt, "Int64", Int64Error>
        >();
        assertType<typeof Int64.Input, bigint>();
        assertType<typeof Int64.Output, bigint & Brand<"Int64">>();
        assertType<typeof Int64.Error, Int64Error>();
        assertType<
          Int64Error extends TypeValueError<"Int64"> ? true : false,
          true
        >();
      });

      it("accepts signed 64-bit boundary values", () => {
        const values = [-9223372036854775808n, 0n, 9223372036854775807n];

        for (const value of values) {
          assertEqual(Int64.from.parent(value), ok(value));
        }
      });

      it("returns an Int64 error for bigint values outside the signed 64-bit range", () => {
        const values = [-9223372036854775809n, 9223372036854775808n];

        for (const value of values) {
          assertEqual(Int64.from.parent(value), err({ type: "Int64", value }));
        }
      });

      it("formats its own and inherited errors", () => {
        assertEqual(
          Int64.formatError({ type: "Int64", value: 9223372036854775808n }),
          "The value 9223372036854775808 is not a valid signed 64-bit integer (Int64).",
        );
        assertEqual(
          Int64.formatError({
            type: "TypeOf",
            expected: "BigInt",
            value: 42,
          }),
          "A value 42 is not a bigint.",
        );
        assertType<
          Parameters<typeof Int64.formatError>[0],
          TypeOfError<"BigInt"> | Int64Error
        >();
      });
    });

    describe("UInt64", () => {
      it("is branded from BigInt", () => {
        assertEqual(UInt64.name, "UInt64");
        assertSame(UInt64.parent, BigInt);
        assertType<
          typeof UInt64,
          BrandType<typeof BigInt, "UInt64", UInt64Error>
        >();
        assertType<typeof UInt64.Input, bigint>();
        assertType<typeof UInt64.Output, bigint & Brand<"UInt64">>();
        assertType<typeof UInt64.Error, UInt64Error>();
        assertType<
          UInt64Error extends TypeValueError<"UInt64"> ? true : false,
          true
        >();
      });

      it("accepts unsigned 64-bit boundary values", () => {
        const values = [0n, 18_446_744_073_709_551_615n];

        for (const value of values) {
          assertEqual(UInt64.from.parent(value), ok(value));
        }
      });

      it("returns a UInt64 error for bigint values outside the unsigned 64-bit range", () => {
        const values = [-1n, 18_446_744_073_709_551_616n];

        for (const value of values) {
          assertEqual(
            UInt64.from.parent(value),
            err({ type: "UInt64", value }),
          );
        }
      });

      it("formats its own and inherited errors", () => {
        assertEqual(
          UInt64.formatError({
            type: "UInt64",
            value: 18_446_744_073_709_551_616n,
          }),
          "The value 18446744073709551616 is not a valid unsigned 64-bit integer (UInt64).",
        );
        assertEqual(
          UInt64.formatError({
            type: "TypeOf",
            expected: "BigInt",
            value: 42,
          }),
          "A value 42 is not a bigint.",
        );
        assertType<
          Parameters<typeof UInt64.formatError>[0],
          TypeOfError<"BigInt"> | UInt64Error
        >();
      });
    });
  });
});

describe("BrandFactory", () => {
  interface NonEmptyError extends TypeError<"NonEmpty"> {
    readonly value: { readonly length: number };
  }

  const createNonEmpty = () => {
    const validations: Array<{ readonly length: number }> = [];
    const nonEmpty: BrandFactory<
      "NonEmpty",
      { readonly length: number },
      NonEmptyError
    > = (parent) =>
      brand(
        "NonEmpty",
        parent,
        (value) => {
          validations.push(value);

          return value.length > 0 ? ok() : err({ type: "NonEmpty", value });
        },
        () => "The value must not be empty.",
      );

    return { nonEmpty, validations };
  };

  it("infers a reusable factory and preserves the exact parent Type", () => {
    const { nonEmpty } = createNonEmpty();
    const NonEmptyTrimmedString = nonEmpty(TrimmedString);

    assertType<
      typeof nonEmpty,
      BrandFactory<
        "NonEmpty",
        { readonly length: number },
        typeof NonEmptyTrimmedString.Error
      >
    >();
    assertType<
      typeof NonEmptyTrimmedString,
      BrandType<
        typeof TrimmedString,
        "NonEmpty",
        typeof NonEmptyTrimmedString.Error
      >
    >();
    assertType<
      typeof NonEmptyTrimmedString.Output,
      string & Brand<"Trimmed"> & Brand<"NonEmpty">
    >();
    assertSame(NonEmptyTrimmedString.parent, TrimmedString);
  });

  it("validates values and routes own and inherited errors", () => {
    const { nonEmpty, validations } = createNonEmpty();
    const NonEmptyString = nonEmpty(String);

    assertEqual(NonEmptyString.from.parent("value"), ok("value"));
    assertEqual(
      NonEmptyString.from.parent(""),
      err({ type: "NonEmpty", value: "" }),
    );
    assertEqual(validations, ["value", ""]);
    assertEqual(
      NonEmptyString.formatError({ type: "NonEmpty", value: "" }),
      "The value must not be empty.",
    );
    assertEqual(
      NonEmptyString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 1,
      }),
      "A value 1 is not a string.",
    );
  });

  it("preserves typed input boundaries", () => {
    const { nonEmpty, validations } = createNonEmpty();
    const NonEmptyTrimmedString = nonEmpty(TrimmedString);
    const trimmedString = TrimmedString.orThrow("Ada");

    validations.length = 0;
    const result = NonEmptyTrimmedString.from.parent(trimmedString);

    assertType<
      typeof result,
      Result<
        typeof NonEmptyTrimmedString.Output,
        typeof NonEmptyTrimmedString.Error
      >
    >();
    assertOk(result, "Ada");
    assertEqual(validations, ["Ada"]);
    assertType<
      Parameters<typeof NonEmptyTrimmedString.from.parent>[0],
      typeof TrimmedString.Output
    >();
  });

  it("returns the original parent value after successful validation", () => {
    const { nonEmpty } = createNonEmpty();
    const NonEmptyNumbers = nonEmpty(array(Number));
    const values: ReadonlyArray<number> = [1, 2];
    const result = NonEmptyNumbers.from.parent(values);

    assertOk(result, values);
    assertSame(result.value, values);
  });

  it("supports factory creators with literal parameters", () => {
    interface MaxLengthError<
      Max extends number,
    > extends TypeError<`MaxLength${Max}`> {
      readonly max: Max;
      readonly value: { readonly length: number };
    }

    const createMaxLengthFactory: <const Max extends number>(
      max: Max,
    ) => BrandFactory<
      `MaxLength${Max}`,
      { readonly length: number },
      MaxLengthError<Max>
    > = (max) => (parent) => {
      const name = `MaxLength${max}` as const;

      return brand(
        name,
        parent,
        (value) =>
          value.length <= max
            ? ok()
            : err({
                type: name,
                max,
                value,
              }),
        (error) => `The value must have at most ${error.max} items.`,
      );
    };

    const maxLength2 = createMaxLengthFactory(2);
    const MaxLength2String = maxLength2(String);

    assertType<typeof MaxLength2String.Output, string & Brand<"MaxLength2">>();
    assertType<typeof MaxLength2String.Error, MaxLengthError<2>>();
    assertEqual(MaxLength2String.from.parent("ab"), ok("ab"));
    assertEqual(
      MaxLength2String.from.parent("abc"),
      err({ type: "MaxLength2", max: 2, value: "abc" }),
    );
  });

  it("accepts one Union Type node as a parent", () => {
    const OneOrTwo = union(literal(1), literal(2));
    const PositiveOneOrTwo = positive(OneOrTwo);

    assertEqual(PositiveOneOrTwo.fromUnknown(1), ok(1));
    assertEqual(PositiveOneOrTwo.fromUnknown(2), ok(2));
    assertType<typeof PositiveOneOrTwo.parent, typeof OneOrTwo>();
  });

  it("rejects a union of parent Types with compatible Outputs", () => {
    const _NumberFromString = setupNumberFromString();
    const _NumberFromBoolean = transform("NumberFromBoolean", Boolean, Number, {
      from: (value) => ok(value ? 1 : 0),
      to: (value) => value !== 0,
    });
    type Parent = typeof _NumberFromString | typeof _NumberFromBoolean;
    type ParentParameter = Parameters<typeof positive<Parent>>[0];

    const compileTimeAssertions = (parent: Parent) => {
      // @ts-expect-error A Brand Factory requires one concrete parent Type.
      positive(parent);
    };

    assertType<Parent extends ParentParameter ? true : false, false>();
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects incompatible and erased parents", () => {
    const { nonEmpty } = createNonEmpty();
    const erased: FormattableTypeNode = String;

    const compileTimeAssertions = () => {
      // @ts-expect-error The parent Output must have a length.
      nonEmpty(Number);
      // @ts-expect-error The parent must preserve its concrete Type information.
      nonEmpty(erased);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects a parent that already exposes the factory error type", () => {
    const { nonEmpty } = createNonEmpty();
    const NonEmptyString = nonEmpty(String);

    const compileTimeAssertions = () => {
      // @ts-expect-error A Brand Factory error must not duplicate an inherited error type.
      nonEmpty(NonEmptyString);
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  describe("ValidateBrandFactoryNumber", () => {
    it("rejects widened, union, and branded numeric parameters", () => {
      const value = globalThis.Number(1);
      const unionValue = 1 as 1 | 2;
      const nonNegativeInt = NonNegativeInt.orThrow(1);
      const compileTimeAssertions = () => {
        // @ts-expect-error Numeric Brand parameters must not widen to number.
        minLength(1 + 1);
        // @ts-expect-error Numeric Brand parameters must not be widened.
        maxLength(value);
        // @ts-expect-error Numeric Brand parameters must not widen to number.
        greaterThan(1 + 1);
        // @ts-expect-error Numeric Brand parameters must not be widened.
        lessThan(value);
        // @ts-expect-error Numeric Brand parameters must not widen to number.
        lessThanOrEqualTo(1 + 1);
        // @ts-expect-error Both range parameters must not widen to number.
        between(1, 1 + 1);
        // @ts-expect-error Numeric Brand parameters must not use a union.
        minLength(unionValue);
        // @ts-expect-error A branded runtime number does not identify one literal.
        maxLength(nonNegativeInt);
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("Type Factory", () => {
    describe("capitalized", () => {
      it("is a reusable Brand Factory", () => {
        assertType<
          typeof capitalized,
          BrandFactory<"Capitalized", string, CapitalizedError>
        >();
      });

      describe("Type", () => {
        describe("CapitalizedString", () => {
          it("accepts only capitalized strings", () => {
            assertEqual(CapitalizedString.from.parent("Evolu"), ok("Evolu"));
            assertEqual(
              CapitalizedString.from.parent("evolu"),
              err({ type: "Capitalized", value: "evolu" }),
            );
            assertEqual(CapitalizedString.from.parent("𐐀x"), ok("𐐀x"));
            assertEqual(
              CapitalizedString.from.parent("𐐨x"),
              err({ type: "Capitalized", value: "𐐨x" }),
            );
            assertEqual(
              CapitalizedString.formatError({
                type: "Capitalized",
                value: "evolu",
              }),
              'The value "evolu" must be capitalized.',
            );
            assertType<
              typeof CapitalizedString.Output,
              string & Brand<"Capitalized">
            >();
          });
        });
      });
    });

    describe("trimmed", () => {
      it("is a reusable Brand Factory", () => {
        assertType<
          typeof trimmed,
          BrandFactory<"Trimmed", string, TrimmedError>
        >();
      });

      describe("Type", () => {
        describe("TrimmedString", () => {
          it("accepts only strings without surrounding whitespace", () => {
            assertEqual(TrimmedString.from.parent("Evolu"), ok("Evolu"));
            assertEqual(
              TrimmedString.from.parent(" Evolu "),
              err({ type: "Trimmed", value: " Evolu " }),
            );
            assertEqual(
              TrimmedString.formatError({
                type: "Trimmed",
                value: " Evolu ",
              }),
              'The value " Evolu " must be trimmed.',
            );
            assertType<
              typeof TrimmedString.Output,
              string & Brand<"Trimmed">
            >();
          });
        });
      });
    });

    describe("trim", () => {
      it("returns a TrimmedString", () => {
        const value = trim(" Evolu ");

        assertEqual(value, "Evolu");
        assertType<typeof value, TrimmedString>();
      });
    });

    describe("minLength", () => {
      it("creates a Brand Factory requiring a minimum length", () => {
        const min = 2;
        const MinLength2 = minLength(min)(TrimmedString);

        assertEqual(MinLength2.from.parent.parent("ab"), ok("ab"));
        assertEqual(
          MinLength2.from.parent.parent("a"),
          err({ type: "MinLength2", value: "a", min: 2 }),
        );
        assertEqual(
          MinLength2.from.parent.parent(" a"),
          err({ type: "Trimmed", value: " a" }),
        );
        assertEqual(
          MinLength2.formatError({ type: "MinLength2", value: "a", min: 2 }),
          'The value "a" does not meet the minimum length of 2.',
        );
        assertType<
          typeof MinLength2.Output,
          string & Brand<"Trimmed"> & Brand<"MinLength2">
        >();
        assertType<typeof MinLength2.Error, MinLengthError<2>>();
      });

      it("returns a Brand Factory that accepts the parent separately", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Parameterized Brand Factories accept their parent separately.
          minLength(1, String);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });

      describe("Type", () => {
        it("does not predefine NonEmptyString", () => {
          type TypeExports = keyof typeof import("./Type.ts");
          type RemovedStringExports = Extract<TypeExports, "NonEmptyString">;

          assertType<RemovedStringExports, never>();
        });

        describe("NonEmptyTrimmedString", () => {
          it("requires a non-empty TrimmedString", () => {
            assertEqual(
              NonEmptyTrimmedString.from.parent.parent("Evolu"),
              ok("Evolu"),
            );
            assertEqual(
              NonEmptyTrimmedString.from.parent.parent(" Evolu "),
              err({ type: "Trimmed", value: " Evolu " }),
            );
            assertEqual(
              NonEmptyTrimmedString.from.parent.parent(""),
              err({ type: "MinLength1", value: "", min: 1 }),
            );
          });
        });
      });
    });

    describe("maxLength", () => {
      it("creates a Brand Factory requiring a maximum length", () => {
        const MaxLength2 = maxLength(2)(array(Number));
        const numbers = [1, 2] as const;
        const result = MaxLength2.from.parent(numbers);

        assertOk(result, numbers);
        assertSame(result.value, numbers);
        assertEqual(
          MaxLength2.from.parent([1, 2, 3]),
          err({ type: "MaxLength2", value: [1, 2, 3], max: 2 }),
        );
        assertEqual(
          MaxLength2.formatError({
            type: "MaxLength2",
            value: [1, 2, 3],
            max: 2,
          }),
          "The value [1,2,3] exceeds the maximum length of 2.",
        );
        assertType<
          typeof MaxLength2.Output,
          ReadonlyArray<number> & Brand<"MaxLength2">
        >();
      });

      it("requires a parent value with a length", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Length constraints require a value with a length.
          maxLength(1)(Number);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });

      describe("Type", () => {
        it("exports only the recommended bounded String Types", () => {
          type TypeExports = keyof typeof import("./Type.ts");
          type RemovedBoundedStringExports = Extract<
            TypeExports,
            | "String100"
            | "String1000"
            | "NonEmptyString100"
            | "NonEmptyString1000"
            | "TrimmedString100"
            | "TrimmedString1000"
          >;

          assertType<RemovedBoundedStringExports, never>();
        });

        describe("NonEmptyTrimmedString100", () => {
          it("validates maximum length after NonEmptyTrimmedString", () => {
            const value = NonEmptyTrimmedString.orThrow("a".repeat(101));

            assertEqual(
              NonEmptyTrimmedString100.from.parent(value),
              err({ type: "MaxLength100", value, max: 100 }),
            );
            assertEqual(NonEmptyTrimmedString100.name, "MaxLength100");
            assertSame(NonEmptyTrimmedString100.parent, NonEmptyTrimmedString);
            assertType<
              typeof NonEmptyTrimmedString100.parent,
              typeof NonEmptyTrimmedString
            >();
            assertType<
              typeof NonEmptyTrimmedString100.Error,
              MaxLengthError<100>
            >();
            assertType<
              Parameters<typeof NonEmptyTrimmedString100.from.parent>[0],
              typeof NonEmptyTrimmedString.Output
            >();
            assertType<
              typeof NonEmptyTrimmedString100.Output,
              string &
                Brand<"Trimmed"> &
                Brand<"MinLength1"> &
                Brand<"MaxLength100">
            >();
          });
        });

        describe("NonEmptyTrimmedString1000", () => {
          it("validates maximum length after NonEmptyTrimmedString", () => {
            const value = NonEmptyTrimmedString.orThrow("a".repeat(1001));

            assertEqual(
              NonEmptyTrimmedString1000.from.parent(value),
              err({ type: "MaxLength1000", value, max: 1000 }),
            );
            assertEqual(NonEmptyTrimmedString1000.name, "MaxLength1000");
            assertSame(NonEmptyTrimmedString1000.parent, NonEmptyTrimmedString);
            assertType<
              typeof NonEmptyTrimmedString1000.parent,
              typeof NonEmptyTrimmedString
            >();
            assertType<
              typeof NonEmptyTrimmedString1000.Error,
              MaxLengthError<1000>
            >();
            assertType<
              Parameters<typeof NonEmptyTrimmedString1000.from.parent>[0],
              typeof NonEmptyTrimmedString.Output
            >();
            assertType<
              typeof NonEmptyTrimmedString1000.Output,
              string &
                Brand<"Trimmed"> &
                Brand<"MinLength1"> &
                Brand<"MaxLength1000">
            >();
          });
        });
      });
    });

    describe("length", () => {
      it("creates a Brand Factory requiring an exact length", () => {
        const Length2 = length(2)(String);

        assertEqual(Length2.from.parent("ab"), ok("ab"));
        assertEqual(
          Length2.from.parent("abc"),
          err({ type: "Length2", value: "abc", exact: 2 }),
        );
        assertEqual(
          Length2.formatError({ type: "Length2", value: "abc", exact: 2 }),
          'The value "abc" does not have the required length of 2.',
        );
        assertType<typeof Length2.Output, string & Brand<"Length2">>();
      });

      it("requires one concrete parent Type", () => {
        const parent = String as typeof String | typeof Number;
        const compileTimeAssertions = () => {
          // @ts-expect-error A constraint requires one concrete parent Type.
          length(1)(parent);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });
    });

    describe("regex", () => {
      it("requires one concrete name", () => {
        const unionName = "Pattern" as "Pattern" | "Other";
        const broadName = "Pattern" as TypeName;
        const patternedName = "Pattern" as `Pattern${string}`;
        const compileTimeAssertions = () => {
          // @ts-expect-error A union does not identify one concrete Regex name.
          regex(unionName, /./u);
          // @ts-expect-error A widened string does not identify one concrete Regex name.
          regex(broadName, /./u);
          // @ts-expect-error A template pattern does not identify one concrete Regex name.
          regex(patternedName, /./u);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });

      it("keeps stateful matching private and returns immutable pattern data", () => {
        const RepeatedA = regex("RepeatedA", /a+/gu)(String);
        const failure = RepeatedA.from.parent("bbb");

        assertErr(failure, {
          type: "RepeatedA",
          value: "bbb",
          source: "a+",
          flags: "gu",
        });

        assertEqual(RepeatedA.from.parent("aaa"), ok("aaa"));
        assertEqual(RepeatedA.from.parent("aaa"), ok("aaa"));
        assertEqual(failure.error, {
          type: "RepeatedA",
          value: "bbb",
          source: "a+",
          flags: "gu",
        });
        assertEqual(
          RepeatedA.from.parent("bbb"),
          err({
            type: "RepeatedA",
            value: "bbb",
            source: "a+",
            flags: "gu",
          }),
        );
        assertEqual(
          RepeatedA.formatError({
            type: "RepeatedA",
            value: "bbb",
            source: "a+",
            flags: "gu",
          }),
          'The value "bbb" does not match /a+/gu.',
        );
        assertType<typeof failure.error.source, string>();
        assertType<typeof failure.error.flags, string>();

        const compileTimeAssertions = () => {
          // @ts-expect-error Regex errors do not expose the live matcher.
          failure.error.pattern.test = () => true; // oxlint-disable-line typescript/no-unsafe-member-access -- The unavailable matcher access is intentionally rejected above.
          // @ts-expect-error Pattern data is readonly.
          failure.error.source = ".*";
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });

      it("requires a string parent Output", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Regex constraints require string Outputs.
          regex("NumberPattern", /1/u)(Number);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });

      describe("Type", () => {
        describe("UrlSafeString", () => {
          it("accepts only non-empty URL-safe strings", () => {
            assertEqual(
              UrlSafeString.from.parent("abc-123_DEF"),
              ok("abc-123_DEF"),
            );
            assertEqual(
              UrlSafeString.from.parent("not safe"),
              err({
                type: "UrlSafeString",
                value: "not safe",
                source: "^[A-Za-z0-9_-]+$",
                flags: "u",
              }),
            );
            assertType<
              typeof UrlSafeString.Output,
              string & Brand<"UrlSafeString">
            >();
          });
        });
      });
    });

    describe("Domain Types", () => {
      describe("Base64Url", () => {
        it("validates canonical unpadded text and converts bytes losslessly", () => {
          const values = [
            new globalThis.Uint8Array(),
            new globalThis.Uint8Array([0]),
            new globalThis.Uint8Array([255]),
            new globalThis.Uint8Array([72, 101, 108, 108, 111]),
          ];

          for (const value of values) {
            const encoded = uint8ArrayToBase64Url(value);

            assertEqual(Base64Url.from.parent(encoded), ok(encoded));
            assertEqualBytes(base64UrlToUint8Array(encoded), value);
          }
          assertEqual(uint8ArrayToBase64Url(values[3]), "SGVsbG8");
          {
            const actual = uint8ArrayToBase64Url(values[0]);
            assertType<typeof actual, Base64Url>();
          }
          {
            const actual = base64UrlToUint8Array(Base64Url.orThrow(""));
            assertType<typeof actual, globalThis.Uint8Array>();
          }
        });

        it("rejects non-canonical text", () => {
          for (const value of ["A", "AB", "AAz", "*"]) {
            assertEqual(
              Base64Url.from.parent(value),
              err({ type: "Base64Url", value }),
            );
          }
          assertEqual(
            Base64Url.formatError({ type: "Base64Url", value: "*" }),
            'The value "*" is not a valid Base64Url string.',
          );
          assertType<typeof Base64Url.Error, Base64UrlError>();
        });
      });

      describe("Name", () => {
        it("accepts bounded URL-safe names", () => {
          assertEqual(Name.fromUnknown("valid_name-1"), ok("valid_name-1"));
          assertFalse(Name.fromUnknown("not valid").ok);

          const value = "a".repeat(65);
          assertEqual(Name.fromUnknown(value), err({ type: "Name", value }));
          assertSame(
            Name.formatError({ type: "Name", value }),
            `The value "${value}" is not a valid Name.`,
          );
          assertEqual(testName, "Name");
          assertType<typeof Name.Error, NameError>();
        });
      });

      describe("SimplePassword", () => {
        it("requires trimmed text containing between 8 and 64 characters", () => {
          assertEqual(
            SimplePassword.fromUnknown("validPass123"),
            ok("validPass123"),
          );
          assertEqual(
            SimplePassword.fromUnknown("short"),
            err({ type: "MinLength8", value: "short", min: 8 }),
          );
          const long = "a".repeat(65);
          assertEqual(
            SimplePassword.fromUnknown(long),
            err({ type: "MaxLength64", value: long, max: 64 }),
          );
          assertEqual(
            SimplePassword.fromUnknown(" validPass123 "),
            err({ type: "Trimmed", value: " validPass123 " }),
          );
        });
      });

      describe("Mnemonic", () => {
        it("validates English BIP39 mnemonics", () => {
          const value =
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

          assertEqual(Mnemonic.fromUnknown(value), ok(value));
          assertEqual(
            Mnemonic.fromUnknown("abandon abandon abandon"),
            err({
              type: "Mnemonic",
              value: "abandon abandon abandon",
            }),
          );
          assertEqual(
            Mnemonic.formatError({
              type: "Mnemonic",
              value: "abandon abandon abandon",
            }),
            'The value "abandon abandon abandon" is not a valid English BIP39 mnemonic.',
          );
          assertType<typeof Mnemonic.Error, MnemonicError>();
        });
      });

      describe("Id", () => {
        it("creates random, deterministic, and UUID v7-layout Ids", () => {
          const deps = testCreateDeps();
          const random = createId(deps);
          const deterministic = createIdFromString("external-id");
          const sameDeterministic = createIdFromString("external-id");
          const uuidv7 = createIdAsUuidv7(deps);
          const todoRandom = createId<"Todo">(deps);
          const todoDeterministic = createIdFromString<"Todo">("todo");
          const todoUuidv7 = createIdAsUuidv7<"Todo">(deps);

          for (const value of [
            random,
            deterministic,
            uuidv7,
            todoRandom,
            todoDeterministic,
            todoUuidv7,
          ]) {
            assertTrue(Id.is(value));
            assertLength(value, 22);
          }
          assertSame(deterministic, sameDeterministic);
          assertEqual(idToIdBytes(uuidv7)[6] >> 4, 0x7);
          assertEqual(idToIdBytes(uuidv7)[8] & 0xc0, 0x80);
          assertType<typeof random, Id>();
          assertType<typeof deterministic, Id>();
          assertType<typeof uuidv7, Id>();
          assertType<typeof todoRandom, Id & Brand<"Todo">>();
          assertType<typeof todoDeterministic, Id & Brand<"Todo">>();
          assertType<typeof todoUuidv7, Id & Brand<"Todo">>();

          const _unionBrand = "Todo" as "Todo" | "User";
          const _broadBrand = "Todo" as string;
          const _patternedBrand = "Todo" as `Todo${string}`;
          const genericBrandAssertion = <B extends "Todo" | "User">(
            brand: B,
          ): B => {
            // @ts-expect-error An unresolved generic brand might be a union.
            createId<B>(deps);
            return brand;
          };

          const compileTimeAssertions = () => {
            // @ts-expect-error A union would assign multiple brands to one Id.
            createId<typeof _unionBrand>(deps);
            // @ts-expect-error Every Id creator rejects union brands.
            createIdFromString<typeof _unionBrand>("todo");
            // @ts-expect-error Every Id creator rejects union brands.
            createIdAsUuidv7<typeof _unionBrand>(deps);
            // @ts-expect-error A widened string does not identify one Id brand.
            createId<typeof _broadBrand>(deps);
            // @ts-expect-error A template pattern does not identify one Id brand.
            createId<typeof _patternedBrand>(deps);
            // @ts-expect-error A raw Id has no table identity.
            const _todoId: Id & Brand<"Todo"> = random;
            // @ts-expect-error A Todo Id must not satisfy a User Id API.
            const _userId: Id & Brand<"User"> = todoRandom;
          };

          assertType<
            typeof genericBrandAssertion extends (
              ...args: Array<never>
            ) => unknown
              ? true
              : false,
            true
          >();
          assertType<
            typeof compileTimeAssertions extends (
              ...args: Array<never>
            ) => unknown
              ? true
              : false,
            true
          >();
        });

        it("validates the encoded representation", () => {
          const valid = createIdFromString("valid");

          assertEqual(Id.fromUnknown(valid), ok(valid));
          assertEqual(
            Id.fromUnknown("short"),
            err({ type: "Id", value: "short" }),
          );
          const invalid = "*".repeat(22);
          assertEqual(
            Id.fromUnknown(invalid),
            err({ type: "Id", value: invalid }),
          );
          assertEqual(
            Id.formatError({ type: "Id", value: "short" }),
            'The value "short" is not a valid Id.',
          );
          assertType<typeof Id.Error, IdError>();
        });

        it("creates table-specific Id Types", () => {
          const TodoId = id("Todo");
          const rawValue = createIdFromString("todo");
          const value = TodoId.orThrow(rawValue);

          assertEqual(TodoId.fromUnknown(rawValue), ok(value));
          assertEqual(
            TodoId.fromUnknown("invalid"),
            err({ type: "TableId", table: "Todo", value: "invalid" }),
          );
          assertEqual(
            TodoId.formatError({
              type: "TableId",
              table: "Todo",
              value: "invalid",
            }),
            'The value "invalid" is not a valid Id for table Todo.',
          );
          assertEqual(TodoId.table, "Todo");
          assertType<typeof TodoId.Output, Id & Brand<"Todo">>();
          assertType<typeof TodoId.Error, TableIdError<"Todo">>();
          assertType<typeof value, Id & Brand<"Todo">>();

          const compileTimeAssertions = () => {
            // @ts-expect-error A Todo Id must not satisfy a User Id API.
            const _userId: Id & Brand<"User"> = value;
          };

          assertType<
            typeof compileTimeAssertions extends (
              ...args: Array<never>
            ) => unknown
              ? true
              : false,
            true
          >();
        });

        it("requires one concrete table name", () => {
          const unionTable = "Todo" as "Todo" | "User";
          const broadTable = "Todo" as TypeName;
          const patternedTable = "Todo" as `Todo${string}`;
          const genericTableAssertion = <Table extends "Todo" | "User">(
            table: Table,
          ): Table => {
            // @ts-expect-error An unresolved generic table might be a union.
            id(table);
            return table;
          };
          const compileTimeAssertions = () => {
            // @ts-expect-error A union would assign multiple table brands to one Id.
            id(unionTable);
            // @ts-expect-error A widened TypeName does not identify one table.
            id(broadTable);
            // @ts-expect-error A template pattern does not identify one table.
            id(patternedTable);
          };

          assertType<
            typeof genericTableAssertion extends (
              ...args: Array<never>
            ) => unknown
              ? true
              : false,
            true
          >();
          assertType<
            typeof compileTimeAssertions extends (
              ...args: Array<never>
            ) => unknown
              ? true
              : false,
            true
          >();
        });

        it("converts to and from its 16-byte representation", () => {
          const value = createIdFromString("bytes");
          const bytes = idToIdBytes(value);

          assertTrue(IdBytes.is(bytes));
          assertLength(bytes, 16);
          assertEqual(idBytesTypeValueLength, 16);
          assertSame(idBytesToId(bytes), value);
        });
      });

      describe("Int64String", () => {
        it("accepts only canonical decimal strings in the signed 64-bit range", () => {
          for (const value of [
            "-9223372036854775808",
            "-1",
            "0",
            "1",
            "9223372036854775807",
          ]) {
            assertEqual(Int64String.fromUnknown(value), ok(value));
          }
          for (const value of [
            "-9223372036854775809",
            "9223372036854775808",
            "0x10",
            "+1",
            "01",
            "-0",
            "not-a-number",
          ]) {
            assertEqual(
              Int64String.fromUnknown(value),
              err({ type: "Int64String", value }),
            );
          }
          assertEqual(
            Int64String.formatError({
              type: "Int64String",
              value: "not-a-number",
            }),
            'The value "not-a-number" is not a valid Int64 string.',
          );
          assertType<typeof Int64String.Error, Int64StringError>();
        });

        it("rejects excessive decimal strings before parsing them as BigInt", () => {
          const value = "9".repeat(1000);
          const bigInt = mock.method(globalThis, "BigInt", () => {
            throw new Error("BigInt must not be called.");
          });

          try {
            assertEqual(
              Int64String.fromUnknown(value),
              err({ type: "Int64String", value }),
            );
            assertEqual(bigInt.mock.callCount(), 0);
          } finally {
            bigInt.mock.restore();
          }
        });
      });

      describe("Int64FromInt64String", () => {
        it("transforms canonical decimal strings to Int64 and back", () => {
          const values = [
            ["-9223372036854775808", -9223372036854775808n],
            ["0", 0n],
            ["9223372036854775807", 9223372036854775807n],
          ] as const;

          assertType<
            typeof Int64FromInt64String,
            TransformType<
              typeof Int64String,
              typeof Int64,
              "Int64FromInt64String",
              never
            >
          >();

          for (const [string, bigint] of values) {
            const input = Int64String.orThrow(string);
            const output = Int64.orThrow(bigint);

            assertEqual(Int64FromInt64String.from.parent(input), ok(output));
            assertSame(Int64FromInt64String.to(output), input);
            {
              const actual = Int64FromInt64String.to(output);
              assertType<typeof actual, Int64String>();
            }
          }
        });
      });
    });

    describe("nonNegative", () => {
      it("creates a reusable Brand Factory accepting zero and positive numbers", () => {
        const NonNegative = nonNegative(Number);

        assertEqual(NonNegative.from.parent(0), ok(0));
        assertEqual(
          NonNegative.from.parent(-1),
          err({ type: "NonNegative", value: -1 }),
        );
        assertEqual(
          NonNegative.formatError({ type: "NonNegative", value: -1 }),
          "The value -1 must be non-negative (>= 0).",
        );
        assertType<
          typeof nonNegative,
          BrandFactory<"NonNegative", number, NonNegativeError>
        >();
      });

      describe("Type", () => {
        describe("NonNegativeNumber", () => {
          it("accepts zero", () => {
            assertEqual(NonNegativeNumber.from.parent(0), ok(0));
          });
        });
      });
    });

    describe("positive", () => {
      it("creates a reusable Brand Factory accepting positive numbers", () => {
        const Positive = positive(Number);

        assertEqual(Positive.from.parent(1), ok(1));
        assertEqual(
          Positive.from.parent(0),
          err({ type: "Positive", value: 0 }),
        );
        assertEqual(
          Positive.formatError({ type: "Positive", value: 0 }),
          "The value 0 must be positive (> 0).",
        );
        assertType<
          typeof positive,
          BrandFactory<"Positive", number, PositiveError>
        >();
      });

      describe("Type", () => {
        describe("PositiveNumber", () => {
          it("accepts positive numbers", () => {
            assertEqual(PositiveNumber.from.parent.parent(1), ok(1));
          });
        });
      });
    });

    describe("nonPositive", () => {
      it("creates a reusable Brand Factory accepting zero and negative numbers", () => {
        const NonPositive = nonPositive(Number);

        assertEqual(NonPositive.from.parent(0), ok(0));
        assertEqual(
          NonPositive.from.parent(1),
          err({ type: "NonPositive", value: 1 }),
        );
        assertEqual(
          NonPositive.formatError({ type: "NonPositive", value: 1 }),
          "The value 1 must be non-positive (<= 0).",
        );
        assertType<
          typeof nonPositive,
          BrandFactory<"NonPositive", number, NonPositiveError>
        >();
      });

      describe("Type", () => {
        describe("NonPositiveNumber", () => {
          it("accepts zero", () => {
            assertEqual(NonPositiveNumber.from.parent(0), ok(0));
          });
        });
      });
    });

    describe("negative", () => {
      it("creates a reusable Brand Factory accepting negative numbers", () => {
        const Negative = negative(Number);

        assertEqual(Negative.from.parent(-1), ok(-1));
        assertEqual(
          Negative.from.parent(0),
          err({ type: "Negative", value: 0 }),
        );
        assertEqual(
          Negative.formatError({ type: "Negative", value: 0 }),
          "The value 0 must be negative (< 0).",
        );
        assertType<
          typeof negative,
          BrandFactory<"Negative", number, NegativeError>
        >();
      });

      describe("Type", () => {
        describe("NegativeNumber", () => {
          it("accepts negative numbers", () => {
            assertEqual(NegativeNumber.from.parent.parent(-1), ok(-1));
          });
        });
      });
    });

    describe("int", () => {
      it("creates a reusable Brand Factory accepting only safe integers", () => {
        const SafeInt = int(Number);

        assertEqual(SafeInt.from.parent(42), ok(42));
        assertEqual(SafeInt.from.parent(1.5), err({ type: "Int", value: 1.5 }));
        assertEqual(
          SafeInt.formatError({ type: "Int", value: 1.5 }),
          "The value 1.5 must be a safe integer.",
        );
        assertType<typeof int, BrandFactory<"Int", number, IntError>>();
      });

      describe("Type", () => {
        describe("Int", () => {
          it("accepts only safe integers", () => {
            assertEqual(
              Int.fromUnknown(globalThis.Number.NaN),
              err({ type: "NonNaN", value: globalThis.Number.NaN }),
            );
            assertEqual(
              Int.fromUnknown(globalThis.Number.POSITIVE_INFINITY),
              err({
                type: "Finite",
                value: globalThis.Number.POSITIVE_INFINITY,
              }),
            );
            assertEqual(Int.fromUnknown(1.5), err({ type: "Int", value: 1.5 }));
            assertType<
              typeof Int.Output,
              number & Brand<"NonNaN"> & Brand<"Finite"> & Brand<"Int">
            >();

            assertEqual(Int.from.parent.parent.parent(42), ok(42));
            assertEqual(
              Int.from.parent.parent.parent(1.5),
              err({ type: "Int", value: 1.5 }),
            );
          });
        });

        describe("NonNegativeInt", () => {
          it("accepts zero and provides its minimum value", () => {
            assertEqual(
              NonNegativeInt.from.parent.parent.parent.parent(0),
              ok(0),
            );
            assertEqual(zeroNonNegativeInt, 0);
          });
        });

        describe("PositiveInt", () => {
          it("has the expected brands and boundary values", () => {
            assertEqual(
              PositiveInt.from.parent.parent.parent.parent.parent(1),
              ok(1),
            );
            assertEqual(onePositiveInt, 1);
            assertSame(maxPositiveInt, globalThis.Number.MAX_SAFE_INTEGER);
            assertType<
              typeof PositiveInt.Output,
              number &
                Brand<"NonNaN"> &
                Brand<"Finite"> &
                Brand<"Int"> &
                Brand<"NonNegative"> &
                Brand<"Positive">
            >();
          });
        });

        describe("NonPositiveInt", () => {
          it("accepts zero", () => {
            assertEqual(
              NonPositiveInt.from.parent.parent.parent.parent(0),
              ok(0),
            );
          });
        });

        describe("NegativeInt", () => {
          it("accepts negative integers", () => {
            assertEqual(
              NegativeInt.from.parent.parent.parent.parent.parent(-1),
              ok(-1),
            );
          });
        });
      });
    });

    describe("greaterThan", () => {
      it("creates a Brand Factory requiring a number greater than its minimum", () => {
        const GreaterThan5 = greaterThan(5)(Number);

        assertEqual(GreaterThan5.from.parent(6), ok(6));
        assertEqual(
          GreaterThan5.from.parent(5),
          err({ type: "GreaterThan5", value: 5, min: 5 }),
        );
        assertEqual(
          GreaterThan5.formatError({
            type: "GreaterThan5",
            value: 5,
            min: 5,
          }),
          "The value 5 must be greater than 5.",
        );
        assertType<typeof GreaterThan5.Error, GreaterThanError<5>>();
      });
    });

    describe("greaterThanOrEqualTo", () => {
      it("creates a Brand Factory requiring a number at or above its minimum", () => {
        const AtLeast5 = greaterThanOrEqualTo(5)(Number);

        assertEqual(AtLeast5.from.parent(5), ok(5));
        assertEqual(
          AtLeast5.from.parent(4),
          err({ type: "GreaterThanOrEqualTo5", value: 4, min: 5 }),
        );
        assertEqual(
          AtLeast5.formatError({
            type: "GreaterThanOrEqualTo5",
            value: 4,
            min: 5,
          }),
          "The value 4 must be greater than or equal to 5.",
        );
      });
    });

    describe("lessThan", () => {
      it("creates a Brand Factory requiring a number less than its maximum", () => {
        const max = 5;
        const LessThan5 = lessThan(max)(Number);

        assertEqual(LessThan5.from.parent(4), ok(4));
        assertEqual(
          LessThan5.from.parent(5),
          err({ type: "LessThan5", value: 5, max: 5 }),
        );
        assertEqual(
          LessThan5.formatError({ type: "LessThan5", value: 5, max: 5 }),
          "The value 5 must be less than 5.",
        );
      });

      it("requires a number parent Output", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Numeric constraints require number Outputs.
          lessThan(1)(String);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });
    });

    describe("lessThanOrEqualTo", () => {
      it("creates a Brand Factory requiring a number at or below its maximum", () => {
        const AtMost5 = lessThanOrEqualTo(5)(Number);

        assertEqual(AtMost5.from.parent(5), ok(5));
        assertEqual(
          AtMost5.from.parent(6),
          err({ type: "LessThanOrEqualTo5", value: 6, max: 5 }),
        );
        assertEqual(
          AtMost5.formatError({
            type: "LessThanOrEqualTo5",
            value: 6,
            max: 5,
          }),
          "The value 6 must be less than or equal to 5.",
        );
        assertType<
          typeof AtMost5.Output,
          number & Brand<"LessThanOrEqualTo5">
        >();
      });

      it("composes with PositiveInt into a branded Score", () => {
        const Score = brand("Score", lessThanOrEqualTo(99)(PositiveInt));
        type Score = typeof Score.Output;
        const positiveInt = PositiveInt.orThrow(42);
        const result = Score.from.parent.parent(positiveInt);

        assertEqual(
          Score.from.parent.parent.parent.parent.parent.parent.parent(1),
          ok(1),
        );
        assertEqual(
          Score.from.parent.parent.parent.parent.parent.parent.parent(99),
          ok(99),
        );
        assertEqual(
          Score.from.parent.parent.parent.parent.parent.parent.parent(0),
          err({ type: "Positive", value: 0 }),
        );
        assertEqual(
          Score.from.parent.parent.parent.parent.parent.parent.parent(100),
          err({ type: "LessThanOrEqualTo99", value: 100, max: 99 }),
        );
        assertType<typeof result, Result<Score, LessThanOrEqualToError<99>>>();
        assertOk(result, 42);
        assertType<
          Score,
          number &
            Brand<"NonNaN"> &
            Brand<"Finite"> &
            Brand<"Int"> &
            Brand<"NonNegative"> &
            Brand<"Positive"> &
            Brand<"LessThanOrEqualTo99"> &
            Brand<"Score">
        >();
      });
    });

    describe("nonNaN", () => {
      it("is a reusable Brand Factory", () => {
        assertType<
          typeof nonNaN,
          BrandFactory<"NonNaN", number, NonNaNError>
        >();
      });

      describe("Type", () => {
        describe("NonNaNNumber", () => {
          it("rejects NaN", () => {
            assertEqual(
              NonNaNNumber.from.parent(globalThis.Number.NaN),
              err({ type: "NonNaN", value: globalThis.Number.NaN }),
            );
            assertEqual(
              NonNaNNumber.formatError({
                type: "NonNaN",
                value: globalThis.Number.NaN,
              }),
              "The value must not be NaN.",
            );
          });
        });
      });
    });

    describe("finite", () => {
      it("is a reusable Brand Factory", () => {
        assertType<
          typeof finite,
          BrandFactory<"Finite", number, FiniteError>
        >();
      });

      describe("Type", () => {
        describe("FiniteNumber", () => {
          it("rejects infinities", () => {
            assertEqual(
              FiniteNumber.from.parent.parent(
                globalThis.Number.POSITIVE_INFINITY,
              ),
              err({
                type: "Finite",
                value: globalThis.Number.POSITIVE_INFINITY,
              }),
            );
            assertEqual(
              FiniteNumber.formatError({
                type: "Finite",
                value: globalThis.Number.POSITIVE_INFINITY,
              }),
              "The value Infinity must be finite.",
            );
          });
        });

        describe("NonNegativeFiniteNumber", () => {
          it("accepts zero", () => {
            assertEqual(
              NonNegativeFiniteNumber.from.parent.parent.parent(0),
              ok(0),
            );
          });
        });

        describe("PositiveFiniteNumber", () => {
          it("accepts positive finite numbers", () => {
            assertEqual(
              PositiveFiniteNumber.from.parent.parent.parent.parent(0.1),
              ok(0.1),
            );
            assertEqual(
              PositiveFiniteNumber.from.parent.parent.parent.parent(0),
              err({ type: "Positive", value: 0 }),
            );
            assertType<
              typeof PositiveFiniteNumber.Output,
              number &
                Brand<"NonNaN"> &
                Brand<"Finite"> &
                Brand<"NonNegative"> &
                Brand<"Positive">
            >();
          });
        });
      });
    });

    describe("Domain Types", () => {
      describe("Age", () => {
        it("accepts non-negative safe integers below 200", () => {
          assertEqual(Age.fromUnknown(0), ok(0));
          assertEqual(Age.fromUnknown(122), ok(122));
          assertEqual(Age.fromUnknown(199), ok(199));
          assertEqual(
            Age.fromUnknown(-1),
            err({ type: "NonNegative", value: -1 }),
          );
          assertEqual(Age.fromUnknown(1.5), err({ type: "Int", value: 1.5 }));
          assertEqual(
            Age.fromUnknown(200),
            err({ type: "LessThan200", value: 200, max: 200 }),
          );
          assertType<
            typeof Age.Output,
            number &
              Brand<"NonNaN"> &
              Brand<"Finite"> &
              Brand<"Int"> &
              Brand<"NonNegative"> &
              Brand<"LessThan200"> &
              Brand<"Age">
          >();
        });
      });

      describe("Ratio", () => {
        it("accepts finite numbers from zero to one", () => {
          assertEqual(Ratio.from.parent.parent.parent.parent.parent(0), ok(0));
          assertEqual(Ratio.from.parent.parent.parent.parent.parent(1), ok(1));
          assertEqual(
            Ratio.from.parent.parent.parent.parent.parent(1.1),
            err({ type: "LessThanOrEqualTo1", value: 1.1, max: 1 }),
          );
          assertEqual(
            Ratio.from.parent.parent.parent.parent.parent(-0.1),
            err({ type: "NonNegative", value: -0.1 }),
          );
        });
      });

      describe("DecimalString", () => {
        it("accepts one canonical spelling of every signed decimal", () => {
          for (const value of [
            "-25",
            "-10.25",
            "-0.3",
            "-0.01",
            "0",
            "0.01",
            "0.3",
            "10.25",
            "25",
          ]) {
            assertEqual(DecimalString.from.parent(value), ok(value));
          }
        });

        it("rejects non-canonical decimal spellings", () => {
          for (const value of [
            "",
            "-0",
            "+0.3",
            ".3",
            "-.3",
            "0.",
            "0.0",
            "0.30",
            "00",
            "00.3",
            "-00.3",
            "3e-1",
          ]) {
            assertEqual(
              DecimalString.from.parent(value),
              err({ type: "DecimalString", value }),
            );
          }
        });

        it("is branded from String", () => {
          assertEqual(DecimalString.name, "DecimalString");
          assertSame(DecimalString.parent, String);
          assertType<
            typeof DecimalString,
            BrandType<typeof String, "DecimalString", DecimalStringError>
          >();
          assertType<
            typeof DecimalString.Output,
            string & Brand<"DecimalString">
          >();
        });

        it("formats its validation error", () => {
          assertEqual(
            DecimalString.formatError({
              type: "DecimalString",
              value: "0.30",
            }),
            'The value "0.30" must be a canonical decimal string.',
          );
        });
      });

      describe("nonNegativeDecimalString", () => {
        it("creates a reusable Brand Factory", () => {
          const NonNegative = nonNegativeDecimalString(DecimalString);
          const negativeValue = DecimalString.orThrow("-0.1");

          assertEqual(
            NonNegative.from.parent(DecimalString.orThrow("0")),
            ok("0"),
          );
          assertEqual(
            NonNegative.from.parent(negativeValue),
            err({ type: "NonNegativeDecimalString", value: "-0.1" }),
          );
          assertEqual(
            NonNegative.formatError({
              type: "NonNegativeDecimalString",
              value: "-0.1",
            }),
            'The value "-0.1" must be a non-negative decimal string.',
          );
          assertType<
            typeof nonNegativeDecimalString,
            BrandFactory<
              "NonNegativeDecimalString",
              DecimalString,
              NonNegativeDecimalStringError
            >
          >();
        });

        it("requires a DecimalString parent", () => {
          const compileTimeAssertions = () => {
            // @ts-expect-error The parent must output DecimalString.
            nonNegativeDecimalString(String);
          };

          assertType<
            typeof compileTimeAssertions extends (
              ...args: Array<never>
            ) => unknown
              ? true
              : false,
            true
          >();
        });

        describe("Type", () => {
          describe("NonNegativeDecimalString", () => {
            it("is branded from DecimalString", () => {
              assertSame(NonNegativeDecimalString.parent, DecimalString);
              assertType<
                typeof NonNegativeDecimalString,
                BrandType<
                  typeof DecimalString,
                  "NonNegativeDecimalString",
                  NonNegativeDecimalStringError
                >
              >();
              assertType<
                typeof NonNegativeDecimalString.Output,
                string &
                  Brand<"DecimalString"> &
                  Brand<"NonNegativeDecimalString">
              >();
              assertType<
                NonNegativeDecimalString extends DecimalString ? true : false,
                true
              >();
            });

            it("inherits canonical syntax and rejects negative decimals", () => {
              assertEqual(
                NonNegativeDecimalString.fromUnknown("0.3"),
                ok("0.3"),
              );
              assertEqual(
                NonNegativeDecimalString.fromUnknown("-0.3"),
                err({ type: "NonNegativeDecimalString", value: "-0.3" }),
              );
              assertEqual(
                NonNegativeDecimalString.fromUnknown("0.30"),
                err({ type: "DecimalString", value: "0.30" }),
              );
            });
          });
        });
      });

      describe("positiveDecimalString", () => {
        it("creates a reusable Brand Factory", () => {
          const Positive = positiveDecimalString(DecimalString);

          assertEqual(
            Positive.from.parent(DecimalString.orThrow("-0.1")),
            err({ type: "PositiveDecimalString", value: "-0.1" }),
          );
          assertEqual(
            Positive.formatError({
              type: "PositiveDecimalString",
              value: "0",
            }),
            'The value "0" must be a positive decimal string.',
          );
          assertType<
            typeof positiveDecimalString,
            BrandFactory<
              "PositiveDecimalString",
              DecimalString,
              PositiveDecimalStringError
            >
          >();
        });

        describe("Type", () => {
          describe("PositiveDecimalString", () => {
            it("also satisfies NonNegativeDecimalString", () => {
              assertSame(
                PositiveDecimalString.parent,
                NonNegativeDecimalString,
              );
              assertType<
                typeof PositiveDecimalString.Output,
                string &
                  Brand<"DecimalString"> &
                  Brand<"NonNegativeDecimalString"> &
                  Brand<"PositiveDecimalString">
              >();
              assertType<
                PositiveDecimalString extends NonNegativeDecimalString
                  ? true
                  : false,
                true
              >();
            });

            it("accepts positive decimals and rejects zero", () => {
              assertEqual(PositiveDecimalString.fromUnknown("0.3"), ok("0.3"));
              assertEqual(
                PositiveDecimalString.fromUnknown("0"),
                err({ type: "PositiveDecimalString", value: "0" }),
              );
            });
          });
        });
      });

      describe("nonPositiveDecimalString", () => {
        it("creates a reusable Brand Factory", () => {
          assertEqual(
            NonPositiveDecimalString.formatError({
              type: "NonPositiveDecimalString",
              value: "0.1",
            }),
            'The value "0.1" must be a non-positive decimal string.',
          );
          assertType<
            typeof nonPositiveDecimalString,
            BrandFactory<
              "NonPositiveDecimalString",
              DecimalString,
              NonPositiveDecimalStringError
            >
          >();
        });

        describe("Type", () => {
          describe("NonPositiveDecimalString", () => {
            it("accepts negative decimals and zero", () => {
              assertEqual(
                NonPositiveDecimalString.fromUnknown("-0.3"),
                ok("-0.3"),
              );
              assertEqual(NonPositiveDecimalString.fromUnknown("0"), ok("0"));
              assertEqual(
                NonPositiveDecimalString.fromUnknown("0.3"),
                err({ type: "NonPositiveDecimalString", value: "0.3" }),
              );
              assertType<
                NonPositiveDecimalString extends DecimalString ? true : false,
                true
              >();
            });
          });
        });
      });

      describe("negativeDecimalString", () => {
        it("creates a reusable Brand Factory", () => {
          assertEqual(
            NegativeDecimalString.formatError({
              type: "NegativeDecimalString",
              value: "0",
            }),
            'The value "0" must be a negative decimal string.',
          );
          assertType<
            typeof negativeDecimalString,
            BrandFactory<
              "NegativeDecimalString",
              DecimalString,
              NegativeDecimalStringError
            >
          >();
        });

        describe("Type", () => {
          describe("NegativeDecimalString", () => {
            it("also satisfies NonPositiveDecimalString", () => {
              assertSame(
                NegativeDecimalString.parent,
                NonPositiveDecimalString,
              );
              assertType<
                typeof NegativeDecimalString.Output,
                string &
                  Brand<"DecimalString"> &
                  Brand<"NonPositiveDecimalString"> &
                  Brand<"NegativeDecimalString">
              >();
              assertType<
                NegativeDecimalString extends NonPositiveDecimalString
                  ? true
                  : false,
                true
              >();
            });

            it("accepts negative decimals and rejects zero", () => {
              assertEqual(
                NegativeDecimalString.fromUnknown("-0.3"),
                ok("-0.3"),
              );
              assertEqual(
                NegativeDecimalString.fromUnknown("0"),
                err({ type: "NegativeDecimalString", value: "0" }),
              );
            });
          });
        });
      });
    });

    describe("multipleOf", () => {
      it("accepts a canonical positive decimal string literal", () => {
        const MultipleOf3 = multipleOf("3")(Number);
        const Tenths = multipleOf("0.1")(Number);

        assertType<typeof MultipleOf3.name, "MultipleOf3">();
        assertType<typeof Tenths.name, "MultipleOf0.1">();
        assertEqual(Tenths.from.parent(0.3), ok(0.3));
        assertEqual(
          Tenths.from.parent(0.31),
          err({ type: "MultipleOf0.1", value: 0.31, divisor: "0.1" }),
        );
      });

      it("rejects non-canonical and non-literal divisors at compile time", () => {
        const value = globalThis.String("0.1");
        const unionValue = "0.1" as "0.1" | "0.2";
        const positiveDecimalString = PositiveDecimalString.orThrow("0.1");
        const compileTimeAssertions = () => {
          // @ts-expect-error The divisor must be an exact decimal string.
          multipleOf(0.1);
          // @ts-expect-error Arithmetic expressions are numbers, not exact decimal strings.
          multipleOf(0.1 + 0.2);
          // @ts-expect-error Zero is not a positive divisor.
          multipleOf("0");
          // @ts-expect-error Negative decimal strings are not positive.
          multipleOf("-0.1");
          // @ts-expect-error Trailing fractional zeroes are not canonical.
          multipleOf("0.10");
          // @ts-expect-error Exponent notation is not canonical.
          multipleOf("1e-1");
          // @ts-expect-error A runtime string cannot produce one concrete Brand name.
          multipleOf(value);
          // @ts-expect-error A divisor must not be a union.
          multipleOf(unionValue);
          // @ts-expect-error A validated runtime string still has no literal value.
          multipleOf(positiveDecimalString);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });

      it("creates a Brand Factory requiring an exact multiple", () => {
        const MultipleOf3 = multipleOf("3")(Number);

        assertEqual(MultipleOf3.from.parent(6), ok(6));
        assertEqual(
          MultipleOf3.from.parent(5),
          err({ type: "MultipleOf3", value: 5, divisor: "3" }),
        );
        assertEqual(
          MultipleOf3.formatError({
            type: "MultipleOf3",
            value: 5,
            divisor: "3",
          }),
          "The value 5 must be a multiple of 3.",
        );
      });

      it("uses exact base-10 semantics for decimal multiples", () => {
        const Tenths = multipleOf("0.1")(Number);
        const Fifths = multipleOf("0.2")(Number);
        const Thirds = multipleOf("0.3")(Number);
        const TwoFifths = multipleOf("0.4")(Number);
        const Quarters = multipleOf("0.25")(Number);
        const TenMillionths = multipleOf("0.0000001")(Number);
        const Thousands = multipleOf("1000")(Number);

        for (const value of [0, -0, 0.3, -0.3, 1.5]) {
          assertEqual(Tenths.from.parent(value), ok(value));
        }
        assertEqual(
          Tenths.from.parent(0.31),
          err({ type: "MultipleOf0.1", value: 0.31, divisor: "0.1" }),
        );
        assertEqual(
          Tenths.from.parent(0.1 + 0.2),
          err({
            type: "MultipleOf0.1",
            value: 0.1 + 0.2,
            divisor: "0.1",
          }),
        );
        assertEqual(Fifths.from.parent(1), ok(1));
        assertEqual(
          Thirds.from.parent(1),
          err({ type: "MultipleOf0.3", value: 1, divisor: "0.3" }),
        );
        assertEqual(
          TwoFifths.from.parent(1),
          err({ type: "MultipleOf0.4", value: 1, divisor: "0.4" }),
        );
        assertEqual(
          Quarters.from.parent(0.1),
          err({ type: "MultipleOf0.25", value: 0.1, divisor: "0.25" }),
        );
        assertEqual(Quarters.from.parent(0.5), ok(0.5));
        assertEqual(TenMillionths.from.parent(3e-7), ok(3e-7));
        assertEqual(
          TenMillionths.from.parent(3.1e-7),
          err({
            type: "MultipleOf0.0000001",
            value: 3.1e-7,
            divisor: "0.0000001",
          }),
        );
        assertEqual(Thousands.from.parent(1e21), ok(1e21));
        assertEqual(
          Thousands.from.parent(1),
          err({ type: "MultipleOf1000", value: 1, divisor: "1000" }),
        );
      });

      it("rejects non-finite numbers", () => {
        const MultipleOf1 = multipleOf("1")(Number);

        for (const value of [globalThis.Number.NaN, Infinity, -Infinity]) {
          assertEqual(
            MultipleOf1.from.parent(value),
            err({ type: "MultipleOf1", value, divisor: "1" }),
          );
        }
      });
    });

    describe("between", () => {
      it("creates a Brand Factory requiring an inclusive range", () => {
        const Between1And3 = between(1, 3)(Number);

        assertEqual(Between1And3.from.parent(2), ok(2));
        assertEqual(
          Between1And3.from.parent(0),
          err({ type: "Between1-3", value: 0, min: 1, max: 3 }),
        );
        assertEqual(
          Between1And3.from.parent(4),
          err({ type: "Between1-3", value: 4, min: 1, max: 3 }),
        );
        assertEqual(
          Between1And3.formatError({
            type: "Between1-3",
            value: 4,
            min: 1,
            max: 3,
          }),
          "The value 4 must be between 1 and 3, inclusive.",
        );
      });

      it("returns a Brand Factory that accepts the parent separately", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Parameterized Brand Factories accept their parent separately.
          between(1, 2, Number);
        };

        assertType<
          typeof compileTimeAssertions extends (
            ...args: Array<never>
          ) => unknown
            ? true
            : false,
          true
        >();
      });
    });
  });
});

describe("array", () => {
  const setupUserIds = () => {
    const validations: Array<number> = [];

    const PositiveInt = brand(
      "PositiveInt",
      Number,
      (value) => {
        validations.push(value);
        return globalThis.Number.isInteger(value) && value > 0
          ? ok()
          : err({ type: "PositiveInt", value });
      },
      formatTestTypeError,
    );

    const UserId = brand("UserId", PositiveInt);
    const UserIds = array(UserId);

    return { PositiveInt, UserId, UserIds, validations };
  };

  const setupValidatedNumbers = () => {
    const validations: Array<readonly [string, number]> = [];

    const Positive = brand(
      "Positive",
      Number,
      (value) => {
        validations.push(["Positive", value]);
        return value > 0 ? ok() : err({ type: "Positive", value });
      },
      formatTestTypeError,
    );

    const Even = brand(
      "Even",
      Positive,
      (value) => {
        validations.push(["Even", value]);
        return value % 2 === 0 ? ok() : err({ type: "Even", value });
      },
      formatTestTypeError,
    );

    const MaxTen = brand(
      "MaxTen",
      Even,
      (value) => {
        validations.push(["MaxTen", value]);
        return value <= 10 ? ok() : err({ type: "MaxTen", value });
      },
      formatTestTypeError,
    );

    return { Positive, Even, MaxTenValues: array(MaxTen), validations };
  };

  describe("construction", () => {
    it("mirrors its element Type chain", () => {
      const { PositiveInt, UserId, UserIds } = setupUserIds();

      assertEqual(UserIds.name, "Array");
      assertSame(UserIds.element, UserId);
      assertSame(UserIds.element.parent, PositiveInt);
      assertSame(UserIds.parent.element, PositiveInt);
      assertSame(UserIds.parent.element, UserIds.element.parent);
      assertSame(UserIds.parent.parent.element, Number);
      assertSame(UserIds.parent.parent.parent, null);
      assertType<typeof UserIds, ArrayType<typeof UserId>>();
      assertType<typeof UserIds.Input, ReadonlyArray<number>>();
      assertType<typeof UserIds.Output, ReadonlyArray<typeof UserId.Output>>();
      assertType<typeof UserIds.Error, never>();
      assertType<
        InferErrors<typeof UserIds>,
        ArrayError<TypeOfError<"Number"> | typeof PositiveInt.Error>
      >();
      assertType<
        InferErrors<typeof UserIds> extends TypeValueError ? true : false,
        false
      >();
      assertType<
        ArrayItemsError<
          TypeOfError<"Number"> | typeof PositiveInt.Error
        >["reason"]["issues"][number],
        ArrayIssue<TypeOfError<"Number"> | typeof PositiveInt.Error>
      >();
      assertType<
        ArrayElementsError<
          TypeOfError<"Number"> | typeof PositiveInt.Error
        >["reason"]["issues"][number],
        | ArrayElementIssue<TypeOfError<"Number">>
        | ArrayElementIssue<typeof PositiveInt.Error>
      >();
      assertType<ArrayElementIssue<never>, never>();
      assertType<
        ArrayExcessPropertyIssue extends ArrayItemsError<
          TypeOfError<"Number">
        >["reason"]["issues"][number]
          ? true
          : false,
        true
      >();
      assertType<
        ArrayExcessPropertyIssue extends ArrayElementsError<
          TypeOfError<"Number">
        >["reason"]["issues"][number]
          ? true
          : false,
        false
      >();
      assertType<ArrayExcessPropertyIssue["key"], string | symbol>();
    });

    it("reuses an Array Type by element Type identity", () => {
      const { PositiveInt, UserId, UserIds } = setupUserIds();
      const OtherUserId = brand("UserId", PositiveInt);

      assertSame(array(UserId), UserIds);
      assertSame(UserIds.parent, array(PositiveInt));
      assertSame(UserIds.parent.parent, array(Number));
      assertFalse(globalThis.Object.is(array(OtherUserId), UserIds));
      assertSame(array(array(Number)), array(array(Number)));
    });

    it("allows heterogeneous element issues in one error", () => {
      interface AError extends TypeError<"A"> {
        readonly value: number;
      }

      interface BError extends TypeError<"B"> {
        readonly value: string;
      }

      const mixed: ArrayElementsError<AError | BError> = {
        type: "Array",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 0,
              error: { type: "A", value: 1 },
            },
            {
              kind: "Element",
              index: 1,
              error: { type: "B", value: "x" },
            },
          ],
        },
      };

      assertEqual(mixed.reason.issues, [
        { kind: "Element", index: 0, error: { type: "A", value: 1 } },
        { kind: "Element", index: 1, error: { type: "B", value: "x" } },
      ]);
    });

    it("rejects a union of element Types", () => {
      type Element = typeof String | typeof Number;
      type ElementParameter = Parameters<typeof array<Element>>[0];

      assertType<Element extends ElementParameter ? true : false, false>();
      assertType<
        ElementParameter,
        "⛔ Type error: Element must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
      >();
    });

    it("rejects an unresolved generic element Type", () => {
      const compileTimeAssertions = <
        Element extends typeof String | typeof Number,
      >(
        element: Element,
      ): Element => {
        // @ts-expect-error An unresolved generic element might be a union.
        array(element);
        return element;
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("rejects an element with erased concrete Type information", () => {
      const erased: FormattableTypeNode = brand("Erased", String);

      const compileTimeAssertions = () => {
        // @ts-expect-error An element must preserve its concrete Type.
        array(erased);
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("formatError", () => {
    it("formats its own error or the first nested error without a path", () => {
      const Strings = array(String);

      assertEqual(
        Strings.formatError({
          type: "Array",
          reason: { kind: "NotArray", value: null },
        }),
        "A value null is not an array.",
      );
      assertEqual(
        Strings.formatError({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 2,
                error: { type: "TypeOf", expected: "String", value: 42 },
              },
              {
                kind: "Element",
                index: 4,
                error: { type: "TypeOf", expected: "String", value: true },
              },
            ],
          },
        }),
        "A value 42 is not a string.",
      );
      assertEqual(
        Strings.formatError({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 2 }],
          },
        }),
        "An array element at index 2 is missing.",
      );
      assertEqual(
        Strings.formatError({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Accessor", index: 2 }],
          },
        }),
        "An array element at index 2 must be a data property.",
      );
      assertEqual(
        Strings.formatError({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "ExcessProperty", key: "metadata" }],
          },
        }),
        "An excess Array property is not allowed. Remove it or use a different Type.",
      );
      assertType<
        Parameters<typeof Strings.formatError>[0],
        ArrayError<TypeOfError<"String">>
      >();
    });
  });

  describe("composition", () => {
    it("decodes and encodes elements", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);
      const encoded = ["1", "2"] as const;
      const output = [1, 2] as const;

      const fromResult = Numbers.from.parent(encoded);
      const toResult = Numbers.to(output);

      assertOk(fromResult, [1, 2]);
      assertFalse(globalThis.Object.is(fromResult.value, encoded));
      assertEqual(toResult, ["1", "2"]);
      assertFalse(globalThis.Object.is(toResult, output));
      assertTrue(Numbers.is([1, 2]));
      assertFalse(Numbers.is(["1", "2"]));
      assertType<typeof Numbers.Input, ReadonlyArray<string>>();
      assertType<typeof Numbers.Output, ReadonlyArray<number>>();
    });

    it("rejects excess properties instead of discarding them during transformations", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);
      const input = globalThis.Object.assign(["1"], {
        metadata: "important",
      });
      const output = globalThis.Object.assign([1], {
        metadata: "important",
      });
      const cause = {
        type: "Array",
        reason: {
          kind: "Items",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      } as const;
      assertFalse(Numbers.is(output));
      assertEqual(Numbers.fromUnknown(input), err(cause));
      assertAssertionError(
        () => Numbers.from.parent(input),
        "Expected Array.",
        cause,
      );
      assertAssertionError(() => Numbers.to(output), "Expected Array.", cause);
    });

    it("rejects excess properties even when element encoding is identity", () => {
      const Numbers = array(Number);
      const value = globalThis.Object.assign([1], {
        metadata: "important",
      });
      const cause = {
        type: "Array",
        reason: {
          kind: "Items",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      } as const;
      assertFalse(Numbers.is(value));
      assertEqual(Numbers.fromUnknown(value), err(cause));
      assertAssertionError(() => Numbers.from(value), "Expected Array.", cause);
      assertAssertionError(() => Numbers.to(value), "Expected Array.", cause);
    });

    it("rejects non-enumerable and symbol properties without reading them", () => {
      const Numbers = array(Number);
      const symbol = globalThis.Symbol("metadata");
      let reads = 0;
      const value = [1];
      globalThis.Object.defineProperty(value, "hidden", {
        value: true,
        enumerable: false,
      });
      globalThis.Object.defineProperty(value, symbol, {
        enumerable: true,
        get: () => {
          reads++;
          return true;
        },
      });

      assertFalse(Numbers.is(value));
      assertEqual(
        Numbers.fromUnknown(value, { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              { kind: "ExcessProperty", key: "hidden" },
              { kind: "ExcessProperty", key: symbol },
            ],
          },
        }),
      );
      assertEqual(reads, 0);
    });

    it("accepts ordinary Record elements through typed operations", () => {
      const Values = array(record(String, Number));
      const input = [{ value: 1 }];
      const fromUnknownResult = Values.fromUnknown(input);

      assertOk(fromUnknownResult, input);
      const output = fromUnknownResult.value;
      assertSame(Values.parent, null);
      assertFalse("parent" in Values.from);
      assertTrue(Values.is(input));
      assertSame(output, input);
      assertTrue(Values.is(output));
      assertEqual(Values.from(input), ok(input));
      assertSame(Values.to(input), input);
      assertSame(Values.orThrow(input), input);
      assertSame(Values.orNull(input), input);
    });

    it("rejects holes independently of the element Type", () => {
      const Strings = array(String);
      const Undefineds = array(Undefined);
      const Unknowns = array(Unknown);
      const sparse = createMutableArray<unknown>(1);
      const error = err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: [{ kind: "Hole", index: 0 }],
        },
      });

      assertFalse(Strings.is(sparse));
      assertEqual(Strings.fromUnknown(sparse), error);
      assertFalse(Undefineds.is(sparse));
      assertEqual(Undefineds.fromUnknown(sparse), error);
      assertFalse(Unknowns.is(sparse));
      assertEqual(Unknowns.fromUnknown(sparse), error);
      {
        const actual = Unknowns.fromUnknown(sparse);
        assertType<
          typeof actual,
          Result<ReadonlyArray<unknown>, ArrayError<never>>
        >();
      }
    });

    it("reports inherited elements as holes without reading them", () => {
      const Strings = array(String);
      let reads = 0;
      const prototype = globalThis.Object.create(null) as object;
      globalThis.Object.defineProperty(prototype, 0, {
        get: () => {
          reads++;
          return "inherited";
        },
      });
      const sparseStrings = createMutableArray<string>(1);
      globalThis.Object.setPrototypeOf(sparseStrings, prototype);

      assertFalse(Strings.is(sparseStrings));
      assertEqual(
        Strings.fromUnknown(sparseStrings),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 0 }],
          },
        }),
      );
      assertEqual(reads, 0);
    });

    it("locates decoding transformation errors by element", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);

      assertEqual(
        Numbers.from.parent(["1", "no"]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: {
                  type: "NumberFromString",
                  value: "no",
                },
              },
            ],
          },
        }),
      );
    });

    it("validates Literal elements through from.parent", () => {
      const Hello = literal("Hello");
      const Hellos = array(Hello);

      assertSame(Hellos.parent, array(String));
      assertSame(Hellos.parent.parent, null);
      assertEqual(
        Hellos.from.parent(["Hello", "Hello"]),
        ok(["Hello", "Hello"]),
      );
      assertEqual(
        Hellos.from.parent(["Hello", "World"]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: {
                  type: "Literal",
                  expected: "Hello",
                  value: "World",
                },
              },
            ],
          },
        }),
      );
      {
        const actual = Hellos.from.parent(["Hello"]);
        assertType<
          typeof actual,
          Result<
            ReadonlyArray<"Hello">,
            ArrayElementsError<LiteralError<"Hello">>
          >
        >();
      }
    });

    it("validates only the remaining element Types through from.parent", () => {
      const Hello = literal("Hello");
      const validations: Array<string> = [];
      const Greeting = brand("Greeting", Hello, (value) => {
        validations.push(value);
        return ok();
      });
      const Greetings = array(Greeting);
      const hello = getOrThrow(Hello.from("Hello"));

      assertEqual(Greetings.from.parent([hello]), ok(["Hello"]));
      assertEqual(validations, ["Hello"]);
      {
        const actual = Greetings.from.parent([hello]);
        assertType<
          typeof actual,
          Result<ReadonlyArray<typeof Greeting.Output>>
        >();
      }
    });

    it("composes Object elements with transformed and optional properties", () => {
      const NumberFromString = setupNumberFromString();
      const Item = object({
        value: NumberFromString,
        note: optional(String),
      });
      const Items = array(Item);
      const encoded = [{ value: "1" }, { value: "2", note: "two" }];
      const output = [{ value: 1 }, { value: 2, note: "two" }];
      const result = Items.from.parent(encoded);

      assertOk(result, output);
      assertFalse(globalThis.Object.is(result.value, encoded));
      assertEqual(Items.to(output), encoded);
      assertEqual(
        Items.from.parent([{ value: "1" }, { value: "no" }], { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: {
                  type: "Object",
                  reason: {
                    kind: "Properties",
                    errors: {
                      value: { type: "NumberFromString", value: "no" },
                    },
                  },
                },
              },
            ],
          },
        }),
      );
      assertType<
        typeof Items.Input,
        ReadonlyArray<
          ExpectedStrictObject<
            { readonly value: string },
            { readonly note: string }
          >
        >
      >();
      assertType<
        typeof Items.Output,
        ReadonlyArray<
          ExpectedStrictObject<
            { readonly value: number },
            { readonly note: string }
          >
        >
      >();
    });

    it("preserves ordinary root Record properties through Object elements", () => {
      const Items = array(object({ values: record(String, Number) }));
      const input = [{ values: { one: 1 } }];
      const result = Items.fromUnknown(input);

      assertOk(result, input);
      assertSame(result.value, input);
      assertSame(result.value[0], input[0]);
      assertSame(result.value[0].values, input[0].values);
      assertTrue(Items.is(result.value));
    });
  });

  it("exposes error collection options only on operations that preserve errors", () => {
    const { UserIds } = setupUserIds();

    assertType<
      Parameters<typeof UserIds.fromUnknown>[1],
      ValidationOptions | undefined
    >();
    assertType<
      Parameters<typeof UserIds.from>[1],
      ValidationOptions | undefined
    >();
    assertType<
      Parameters<typeof UserIds.from.parent>[1],
      ValidationOptions | undefined
    >();
    assertType<
      Parameters<typeof UserIds.orThrow>[1],
      ValidationOptions | undefined
    >();
    assertType<Parameters<typeof UserIds.is>, [unknown]>();
    assertType<Parameters<typeof UserIds.orNull>, [ReadonlyArray<number>]>();

    const compileTimeAssertions = () => {
      // @ts-expect-error Error collection is not observable through `is`.
      UserIds.is([], { errors: "all" });
      // @ts-expect-error Error collection is not observable through `orNull`.
      UserIds.orNull([], { errors: "all" });
    };
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  describe("is", () => {
    it("a type guard that narrows unknown values", () => {
      const { UserIds } = setupUserIds();
      const value: unknown = [1, 2];

      assert(UserIds.is(value), "Expected value to be UserIds.");

      assertType<typeof value, typeof UserIds.Output>();
      assertFalse(UserIds.is([0]));
      assertFalse(UserIds.is(null));
    });

    it("rejects accessor elements without invoking them", () => {
      const Strings = array(String);
      let reads = 0;
      const value: Array<unknown> = [];
      globalThis.Object.defineProperty(value, 0, {
        enumerable: true,
        get: () => {
          reads++;
          return "value";
        },
      });

      assertFalse(Strings.is(value));
      assertEqual(reads, 0);
    });
  });

  describe("fromUnknown", () => {
    it("accepts an empty array in both error collection modes", () => {
      const { UserIds, validations } = setupUserIds();
      const value: unknown = [];
      const first = UserIds.fromUnknown(value);
      const all = UserIds.fromUnknown(value, { errors: "all" });

      assertOk(first, value);
      assertSame(first.value, value);
      assertOk(all, value);
      assertSame(all.value, value);
      assertEqual(validations, []);
    });

    it("validates every element without changing the array", () => {
      const { UserIds, validations } = setupUserIds();
      const value: unknown = [1, 2];
      const result = UserIds.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertEqual(validations, [1, 2]);
      assertType<typeof result.value, typeof UserIds.Output>();
    });

    it("rejects accessor elements without invoking them", () => {
      const Strings = array(String);
      let reads = 0;
      const value: Array<unknown> = [];
      globalThis.Object.defineProperty(value, 0, {
        enumerable: true,
        get: () => {
          reads++;
          return "value";
        },
      });

      const result = Strings.fromUnknown(value);

      assertEqual(
        result,
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Accessor", index: 0 }],
          },
        }),
      );
      assertEqual(reads, 0);
    });

    it("wraps a primitive parent error for an invalid Literal element", () => {
      const Hello = literal("Hello");
      const Hellos = array(Hello);
      const value: unknown = [42];

      assertEqual(
        Hellos.fromUnknown(value),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "TypeOf", expected: "String", value: 42 },
              },
            ],
          },
        }),
      );
      {
        const actual = Hellos.fromUnknown(value);
        assertType<
          typeof actual,
          Result<
            ReadonlyArray<"Hello">,
            ArrayError<TypeOfError<"String"> | LiteralError<"Hello">>
          >
        >();
      }
    });

    it("returns a NotArray error regardless of error collection mode", () => {
      const { PositiveInt: _PositiveInt, UserIds } = setupUserIds();
      const value: unknown = null;
      const expected = err({
        type: "Array",
        reason: { kind: "NotArray", value },
      });

      assertEqual(UserIds.fromUnknown(value), expected);
      assertEqual(UserIds.fromUnknown(value, { errors: "all" }), expected);
      {
        const actual = UserIds.fromUnknown(value);
        assertType<
          typeof actual,
          Result<
            typeof UserIds.Output,
            ArrayError<TypeOfError<"Number"> | typeof _PositiveInt.Error>
          >
        >();
      }
    });

    it("returns only the first failing element error by default", () => {
      const { UserIds } = setupUserIds();

      assertEqual(
        UserIds.fromUnknown([1, "2", 3]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: { type: "TypeOf", expected: "Number", value: "2" },
              },
            ],
          },
        }),
      );
      assertEqual(
        UserIds.fromUnknown([1, -2, 3]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: { type: "PositiveInt", value: -2 },
              },
            ],
          },
        }),
      );
    });

    it("returns the first invalid element across validation levels", () => {
      const { UserIds } = setupUserIds();

      assertEqual(
        UserIds.fromUnknown([-1, "x"]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "PositiveInt", value: -1 },
              },
            ],
          },
        }),
      );
    });

    it("supports explicit first-error collection", () => {
      const { MaxTenValues, validations } = setupValidatedNumbers();

      assertEqual(
        MaxTenValues.fromUnknown([1, -2], { errors: "first" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
            ],
          },
        }),
      );
      assertEqual(validations, [
        ["Positive", 1],
        ["Even", 1],
      ]);
    });

    it("collects one error from every invalid element in index order", () => {
      const { MaxTenValues, validations } = setupValidatedNumbers();

      assertEqual(
        MaxTenValues.fromUnknown([1, "x", -2, 12], { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
              {
                kind: "Element",
                index: 1,
                error: { type: "TypeOf", expected: "Number", value: "x" },
              },
              {
                kind: "Element",
                index: 2,
                error: { type: "Positive", value: -2 },
              },
              {
                kind: "Element",
                index: 3,
                error: { type: "MaxTen", value: 12 },
              },
            ],
          },
        }),
      );
      assertEqual(validations, [
        ["Positive", 1],
        ["Even", 1],
        ["Positive", -2],
        ["Positive", 12],
        ["Even", 12],
        ["MaxTen", 12],
      ]);
    });

    it("collects structural and invalid element issues in index order", () => {
      const Strings = array(String);
      let reads = 0;
      const value = createMutableArray<unknown>(5);
      value[0] = 0;
      globalThis.Object.defineProperty(value, 1, {
        enumerable: true,
        get: () => {
          reads++;
          return "value";
        },
      });
      value[3] = false;

      assertEqual(
        Strings.fromUnknown(value, { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "TypeOf", expected: "String", value: 0 },
              },
              { kind: "Accessor", index: 1 },
              { kind: "Hole", index: 2 },
              {
                kind: "Element",
                index: 3,
                error: {
                  type: "TypeOf",
                  expected: "String",
                  value: false,
                },
              },
              { kind: "Hole", index: 4 },
            ],
          },
        }),
      );
      assertEqual(reads, 0);
    });

    it("does not construct transformed output after collecting an issue", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);
      const value = createMutableArray<unknown>(2);
      value[1] = "1";

      assertEqual(
        Numbers.fromUnknown(value, { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 0 }],
          },
        }),
      );
    });

    it("composes with another Array Type", () => {
      const Matrix = array(array(Number));
      const value: unknown = [
        [1, 2],
        [3, 4],
      ];
      const result = Matrix.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertType<typeof result.value, ReadonlyArray<ReadonlyArray<number>>>();
      assertEqual(
        Matrix.fromUnknown([[1, "2"]]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: {
                  type: "Array",
                  reason: {
                    kind: "Items",
                    issues: [
                      {
                        kind: "Element",
                        index: 1,
                        error: {
                          type: "TypeOf",
                          expected: "Number",
                          value: "2",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it("collects nested Array errors recursively", () => {
      const Matrix = array(array(Number));

      assertEqual(
        Matrix.fromUnknown(
          [
            ["a", "b"],
            [1, "c"],
            [2, 3],
          ],
          { errors: "all" },
        ),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: {
                  type: "Array",
                  reason: {
                    kind: "Items",
                    issues: [
                      {
                        kind: "Element",
                        index: 0,
                        error: {
                          type: "TypeOf",
                          expected: "Number",
                          value: "a",
                        },
                      },
                      {
                        kind: "Element",
                        index: 1,
                        error: {
                          type: "TypeOf",
                          expected: "Number",
                          value: "b",
                        },
                      },
                    ],
                  },
                },
              },
              {
                kind: "Element",
                index: 1,
                error: {
                  type: "Array",
                  reason: {
                    kind: "Items",
                    issues: [
                      {
                        kind: "Element",
                        index: 1,
                        error: {
                          type: "TypeOf",
                          expected: "Number",
                          value: "c",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it("forwards error collection through a child of an Array Type", () => {
      const { UserIds } = setupUserIds();
      const ImportedUserIds = brand("ImportedUserIds", UserIds);

      assertEqual(
        ImportedUserIds.fromUnknown([0, -1], { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "PositiveInt", value: 0 },
              },
              {
                kind: "Element",
                index: 1,
                error: { type: "PositiveInt", value: -1 },
              },
            ],
          },
        }),
      );
    });
  });

  describe("to", () => {
    it("asserts its own Output", () => {
      const Values = array(Number);
      const sparse = createMutableArray<number>(1);

      assertAssertionError(() => Values.to(sparse), "Expected Array.", {
        type: "Array",
        reason: { kind: "Items", issues: [{ kind: "Hole", index: 0 }] },
      });
    });
  });

  describe("from", () => {
    it("asserts its own Output", () => {
      const Values = array(Number);
      const sparse = createMutableArray<number>(1);

      assertAssertionError(() => Values.from(sparse), "Expected Array.", {
        type: "Array",
        reason: { kind: "Items", issues: [{ kind: "Hole", index: 0 }] },
      });
    });

    it("asserts its own Output elements", () => {
      const { UserIds, validations } = setupUserIds();
      const value = UserIds.orThrow([1, 2]);
      validations.length = 0;
      const result = UserIds.from(value);

      assertType<typeof result, Result<typeof UserIds.Output>>();
      assertOk(result, value);
      assertSame(result.value, value);
      assertEqual(validations, [1, 2]);
      assertType<Parameters<typeof UserIds.from>[0], typeof UserIds.Output>();
    });

    it("validates root element Outputs at the deepest boundary", () => {
      const {
        PositiveInt: _PositiveInt,
        UserIds,
        validations,
      } = setupUserIds();
      const value: ReadonlyArray<number> = [1, 2];
      const result = UserIds.from.parent.parent(value);

      assertType<
        typeof result,
        Result<
          typeof UserIds.Output,
          ArrayElementsError<typeof _PositiveInt.Error>
        >
      >();
      assertOk(result, value);
      assertSame(result.value, value);
      assertEqual(validations, [1, 2]);
      assertType<
        Parameters<typeof UserIds.from.parent.parent>[0],
        ReadonlyArray<number>
      >();
    });

    it("returns the first failing element index and refinement error", () => {
      const { UserIds } = setupUserIds();

      assertEqual(
        UserIds.from.parent.parent([1, -2, 3]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: { type: "PositiveInt", value: -2 },
              },
            ],
          },
        }),
      );
    });

    it("returns the first invalid element across remaining validation levels", () => {
      const { MaxTenValues } = setupValidatedNumbers();

      assertEqual(
        MaxTenValues.from.parent.parent.parent([1, -2]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
            ],
          },
        }),
      );
    });

    it("collects mixed remaining validation errors from every invalid element", () => {
      const { MaxTenValues, validations } = setupValidatedNumbers();

      assertEqual(
        MaxTenValues.from.parent.parent.parent([1, -2, 12, 4], {
          errors: "all",
        }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
              {
                kind: "Element",
                index: 1,
                error: { type: "Positive", value: -2 },
              },
              {
                kind: "Element",
                index: 2,
                error: { type: "MaxTen", value: 12 },
              },
            ],
          },
        }),
      );
      assertEqual(validations, [
        ["Positive", 1],
        ["Even", 1],
        ["Positive", -2],
        ["Positive", 12],
        ["Even", 12],
        ["MaxTen", 12],
        ["Positive", 4],
        ["Even", 4],
        ["MaxTen", 4],
      ]);
    });

    it("forwards error collection through a child of an Array Type", () => {
      const { UserIds } = setupUserIds();
      const ImportedUserIds = brand("ImportedUserIds", UserIds);

      assertEqual(
        ImportedUserIds.from.parent.parent.parent([0, -1], {
          errors: "all",
        }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "PositiveInt", value: 0 },
              },
              {
                kind: "Element",
                index: 1,
                error: { type: "PositiveInt", value: -1 },
              },
            ],
          },
        }),
      );
    });

    it("preserves heterogeneous errors through a child of an Array Type", () => {
      const {
        Positive: _Positive,
        Even: _Even,
        MaxTenValues,
      } = setupValidatedNumbers();
      const Imported = brand("Imported", MaxTenValues);
      const result = Imported.from.parent.parent.parent.parent([1, -2, 12], {
        errors: "all",
      });
      const Reimported = brand("Reimported", Imported);
      const reimportedResult =
        Reimported.from.parent.parent.parent.parent.parent([1, -2, 12], {
          errors: "all",
        });
      type Error = ArrayElementsError<
        | typeof _Positive.Error
        | typeof _Even.Error
        | typeof MaxTenValues.element.Error
      >;

      assertType<typeof result, Result<typeof Imported.Output, Error>>();
      assertType<
        typeof reimportedResult,
        Result<typeof Reimported.Output, Error>
      >();
      assertType<
        ReturnType<typeof Imported.from.parent>,
        Result<typeof Imported.Output>
      >();
      assertType<
        ReturnType<typeof Imported.from.parent.parent>,
        Result<typeof Imported.Output, typeof MaxTenValues.Error>
      >();
      const expected = err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: [
            { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
            {
              kind: "Element",
              index: 1,
              error: { type: "Positive", value: -2 },
            },
            {
              kind: "Element",
              index: 2,
              error: { type: "MaxTen", value: 12 },
            },
          ],
        },
      });

      assertEqual(result, expected);
      assertEqual(reimportedResult, expected);
    });

    it("preserves heterogeneous errors through createType and transform children", () => {
      const {
        Positive: _Positive,
        Even: _Even,
        MaxTenValues,
      } = setupValidatedNumbers();
      const Imported = createType("Imported", MaxTenValues, ok);
      const Revalidated = transform("Revalidated", MaxTenValues, MaxTenValues, {
        from: (value) => ok(MaxTenValues.to(value)),
        to: MaxTenValues.orThrow,
      });
      const importedResult = Imported.from.parent.parent.parent.parent(
        [1, -2, 12],
        { errors: "all" },
      );
      const revalidatedResult = Revalidated.from.parent.parent.parent.parent(
        [1, -2, 12],
        { errors: "all" },
      );
      type ElementError =
        | typeof _Positive.Error
        | typeof _Even.Error
        | typeof MaxTenValues.element.Error;
      type ParentError = ArrayElementsError<ElementError>;

      assertType<
        typeof importedResult,
        Result<typeof Imported.Output, ParentError>
      >();
      assertType<
        typeof revalidatedResult,
        Result<
          typeof Revalidated.Output,
          ParentError | TransformError<"Revalidated", never, ParentError>
        >
      >();

      const expected = err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: [
            { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
            {
              kind: "Element",
              index: 1,
              error: { type: "Positive", value: -2 },
            },
            {
              kind: "Element",
              index: 2,
              error: { type: "MaxTen", value: 12 },
            },
          ],
        },
      });

      assertEqual(importedResult, expected);
      assertEqual(revalidatedResult, expected);
    });

    it("keeps a fallible createType child error outside inherited Array errors", () => {
      const {
        Positive: _Positive,
        Even: _Even,
        MaxTenValues,
      } = setupValidatedNumbers();

      interface AtLeastFourValuesError extends TypeError<"AtLeastFourValues"> {
        readonly value: typeof MaxTenValues.Output;
      }

      const AtLeastFourValues = createType(
        "AtLeastFourValues",
        MaxTenValues,
        (value): Result<typeof MaxTenValues.Output, AtLeastFourValuesError> =>
          value.length >= 4
            ? ok(value)
            : err({ type: "AtLeastFourValues", value }),
        formatTestTypeError,
      );
      const inheritedResult =
        AtLeastFourValues.from.parent.parent.parent.parent([1, -2, 12], {
          errors: "all",
        });
      const ownResult = AtLeastFourValues.from.parent.parent.parent.parent(
        [2, 4],
        { errors: "all" },
      );
      type Error =
        | AtLeastFourValuesError
        | ArrayElementsError<
            | typeof _Positive.Error
            | typeof _Even.Error
            | typeof MaxTenValues.element.Error
          >;

      assertType<
        typeof inheritedResult,
        Result<typeof AtLeastFourValues.Output, Error>
      >();
      assertType<
        typeof ownResult,
        Result<typeof AtLeastFourValues.Output, Error>
      >();
      assertEqual(
        inheritedResult,
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
              {
                kind: "Element",
                index: 1,
                error: { type: "Positive", value: -2 },
              },
              {
                kind: "Element",
                index: 2,
                error: { type: "MaxTen", value: 12 },
              },
            ],
          },
        }),
      );
      assertEqual(ownResult, err({ type: "AtLeastFourValues", value: [2, 4] }));
    });
  });

  describe("from.parent", () => {
    it("asserts the selected parent Output", () => {
      const Values = array(literal(1));
      const sparse = createMutableArray<number>(1);

      assertAssertionError(
        () => Values.from.parent(sparse),
        "Expected Array.",
        {
          type: "Array",
          reason: { kind: "Items", issues: [{ kind: "Hole", index: 0 }] },
        },
      );
    });

    it("consumes the Output produced by the parent Array Type", () => {
      const { UserIds, validations } = setupUserIds();
      const value: unknown = [1, 2];
      const parentResult = UserIds.parent.fromUnknown(value);

      assertOk(parentResult, value);
      assertSame(parentResult.value, value);
      assertEqual(validations, [1, 2]);

      validations.length = 0;
      const result = UserIds.from.parent(parentResult.value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertEqual(validations, [1, 2]);
      assertType<
        Parameters<typeof UserIds.from.parent>[0],
        typeof UserIds.parent.Output
      >();
    });

    it("preserves unchanged elements before the first converted element", () => {
      const NumberFromString = setupNumberFromString();
      const Values = array(union(Number, NumberFromString));
      const input: typeof Values.parent.Output = [1, "2"];
      const result = Values.from.parent(input);

      assertOk(result, [1, 2]);
      assertFalse(globalThis.Object.is(result.value, input));
    });

    it("asserts parent element Outputs and validates later Types", () => {
      const { Even, MaxTenValues, validations } = setupValidatedNumbers();
      const values = [Even.orThrow(2), Even.orThrow(4)];
      validations.length = 0;
      const result = MaxTenValues.from.parent(values);

      assertType<
        typeof result,
        Result<typeof MaxTenValues.Output, typeof MaxTenValues.Error>
      >();
      assertOk(result, values);
      assertSame(result.value, values);
      assertEqual(validations, [
        ["Positive", 2],
        ["Even", 2],
        ["Positive", 4],
        ["Even", 4],
        ["MaxTen", 2],
        ["MaxTen", 4],
      ]);
      assertType<
        Parameters<typeof MaxTenValues.from.parent>[0],
        ReadonlyArray<typeof Even.Output>
      >();
    });

    it("collects errors from every invalid immediate-parent Output", () => {
      const { Even, MaxTenValues, validations } = setupValidatedNumbers();
      const values = [Even.orThrow(12), Even.orThrow(14)];
      validations.length = 0;

      assertEqual(
        MaxTenValues.from.parent(values, { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "MaxTen", value: 12 },
              },
              {
                kind: "Element",
                index: 1,
                error: { type: "MaxTen", value: 14 },
              },
            ],
          },
        }),
      );
      assertEqual(validations, [
        ["Positive", 12],
        ["Even", 12],
        ["Positive", 14],
        ["Even", 14],
        ["MaxTen", 12],
        ["MaxTen", 14],
      ]);
    });

    it("ends when the input boundary reaches the root Array Type", () => {
      const { UserIds } = setupUserIds();
      const deepest = UserIds.from.parent.parent;

      assertFalse("parent" in deepest);
      assertType<"parent" extends keyof typeof deepest ? true : false, false>();
    });

    it("supports deeper input boundaries and remaining validation levels", () => {
      const {
        Positive,
        Even: _Even,
        MaxTenValues,
        validations,
      } = setupValidatedNumbers();
      const values = [Positive.orThrow(2), Positive.orThrow(12)];
      validations.length = 0;
      const result = MaxTenValues.from.parent.parent(values);

      assertEqual(
        result,
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: { type: "MaxTen", value: 12 },
              },
            ],
          },
        }),
      );
      assertEqual(validations, [
        ["Positive", 2],
        ["Positive", 12],
        ["Even", 2],
        ["MaxTen", 2],
        ["Even", 12],
        ["MaxTen", 12],
      ]);
      assertType<
        typeof result,
        Result<
          typeof MaxTenValues.Output,
          ArrayElementsError<
            typeof _Even.Error | typeof MaxTenValues.element.Error
          >
        >
      >();
      assertType<
        Parameters<typeof MaxTenValues.from.parent.parent>[0],
        ReadonlyArray<typeof Positive.Output>
      >();
    });

    it("collects mixed errors across a deeper input boundary", () => {
      const { Positive, MaxTenValues, validations } = setupValidatedNumbers();
      const values = [
        Positive.orThrow(1),
        Positive.orThrow(12),
        Positive.orThrow(4),
        Positive.orThrow(3),
      ];
      validations.length = 0;

      assertEqual(
        MaxTenValues.from.parent.parent(values, { errors: "all" }),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              { kind: "Element", index: 0, error: { type: "Even", value: 1 } },
              {
                kind: "Element",
                index: 1,
                error: { type: "MaxTen", value: 12 },
              },
              { kind: "Element", index: 3, error: { type: "Even", value: 3 } },
            ],
          },
        }),
      );
      assertEqual(validations, [
        ["Positive", 1],
        ["Positive", 12],
        ["Positive", 4],
        ["Positive", 3],
        ["Even", 1],
        ["Even", 12],
        ["MaxTen", 12],
        ["Even", 4],
        ["MaxTen", 4],
        ["Even", 3],
      ]);
    });
  });

  describe("orThrow", () => {
    it("asserts its typed Input boundary", () => {
      const Values = array(literal(1));
      const sparse = createMutableArray<number>(1);

      assertAssertionError(() => Values.orThrow(sparse), "Expected Array.", {
        type: "Array",
        reason: { kind: "Items", issues: [{ kind: "Hole", index: 0 }] },
      });
    });

    it("returns the same array or throws the first failing element error", () => {
      const { UserIds } = setupUserIds();
      const value: ReadonlyArray<number> = [1, 2];

      assertSame(UserIds.orThrow(value), value);
      assertAssertionError(() => UserIds.orThrow([1, -2, 3]), "getOrThrow", {
        type: "Array",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 1,
              error: { type: "PositiveInt", value: -2 },
            },
          ],
        },
      });
    });

    it("throws every collected element error", () => {
      const { UserIds } = setupUserIds();
      assertAssertionError(
        () => UserIds.orThrow([0, -1], { errors: "all" }),
        "getOrThrow",
        {
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "PositiveInt", value: 0 },
              },
              {
                kind: "Element",
                index: 1,
                error: { type: "PositiveInt", value: -1 },
              },
            ],
          },
        },
      );
    });
  });

  describe("orNull", () => {
    it("does not convert a typed Input assertion into null", () => {
      const Values = array(literal(1));
      const sparse = createMutableArray<number>(1);

      assertAssertionError(() => Values.orNull(sparse), "Expected Array.", {
        type: "Array",
        reason: { kind: "Items", issues: [{ kind: "Hole", index: 0 }] },
      });
    });

    it("returns the same array or null for a failing element", () => {
      const { UserIds } = setupUserIds();
      const value: ReadonlyArray<number> = [1, 2];

      assertSame(UserIds.orNull(value), value);
      assertSame(UserIds.orNull([0]), null);
    });
  });
});

describe("set", () => {
  it("constructs and caches a Set Type", () => {
    const Strings = set(String);

    assertEqual(Strings.name, "Set");
    assertSame(Strings.element, String);
    assertSame(set(String), Strings);
    assertType<typeof Strings.Output, ReadonlySet<string>>();
    assertType<typeof Strings.Input, ReadonlySet<string>>();

    const uncertain = Math.random() ? String : Number;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error An element must use one concrete Type node.
      set(uncertain);
      // @ts-expect-error An element must preserve its concrete Type.
      set(erased);
    };
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("validates the Set boundary and elements", () => {
    const Strings = set(String);
    const value = new Set(["a", "b"]);
    const result = Strings.fromUnknown(value);

    assertOk(result, value);
    assertSame(result.value, value);
    assertEqual(
      Strings.fromUnknown(["a", "b"]),
      err({ type: "Set", reason: { kind: "NotSet", value: ["a", "b"] } }),
    );

    const withProperty = globalThis.Object.assign(new Set<unknown>([1]), {
      metadata: true,
    });
    assertEqual(
      Strings.fromUnknown(withProperty, { errors: "all" }),
      err<SetItemsError<TypeOfError<"String">>>({
        type: "Set",
        reason: {
          kind: "Items",
          issues: [
            { kind: "ExcessProperty", key: "metadata" },
            {
              kind: "Element",
              index: 0,
              error: { type: "TypeOf", expected: "String", value: 1 },
            },
          ],
        },
      }),
    );
    assertEqual(
      Strings.fromUnknown(withProperty),
      err<SetItemsError<TypeOfError<"String">>>({
        type: "Set",
        reason: {
          kind: "Items",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      }),
    );
  });

  it("supports element decoding, parent operations, and encoding", () => {
    const NumbersFromStrings = set(setupNumberFromString());
    const input = new Set(["1", "2"]);
    const output = new Set([1, 2]);

    assertOk(NumbersFromStrings.fromUnknown(input), output);
    assertEqual(NumbersFromStrings.to(output), input);
    assertTrue(NumbersFromStrings.is(output));
    assertFalse(NumbersFromStrings.is(input));

    const NumbersOrNumbersFromStrings = set(
      union(Number, setupNumberFromString()),
    );
    const unchanged = new Set([1, 2]);
    assertSame(NumbersOrNumbersFromStrings.to(unchanged), unchanged);

    const LongStrings = set(minLength(2)(String));
    const valid = new Set(["ok"]);
    const invalid = new Set(["x"]);
    const validResult = LongStrings.from.parent(valid);

    assertOk(validResult, valid);
    assertSame(validResult.value, valid);
    assertEqual(
      LongStrings.from.parent(invalid),
      err<SetElementsError<MinLengthError<2>>>({
        type: "Set",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 0,
              error: { type: "MinLength2", value: "x", min: 2 },
            },
          ],
        },
      }),
    );
    assertType<typeof LongStrings, SetType<typeof LongStrings.element>>();
  });

  it("checks exact Output representation", () => {
    const Strings = set(String);
    const value = new Set(["a"]);
    const withProperty = globalThis.Object.assign(new Set(["a"]), {
      metadata: true,
    });

    assertTrue(Strings.is(value));
    assertFalse(Strings.is("a"));
    assertFalse(Strings.is(withProperty));
    assertFalse(Strings.is(new Set([1])));
    assertSame(Strings.to(value), value);
  });

  it("formats structural and nested errors", () => {
    const Strings = set(String);

    assertEqual(
      Strings.formatError({
        type: "Set",
        reason: { kind: "NotSet", value: null },
      }),
      "A value null is not a Set.",
    );
    assertEqual(
      Strings.formatError({
        type: "Set",
        reason: {
          kind: "Items",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      }),
      'An excess Set property "metadata" is not allowed.',
    );
    assertEqual(
      Strings.formatError({
        type: "Set",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 0,
              error: { type: "TypeOf", expected: "String", value: 1 },
            },
          ],
        },
      }),
      "A value 1 is not a string.",
    );

    assertType<
      SetError<TypeOfError<"String">>,
      SetNotSetError | SetItemsError<TypeOfError<"String">>
    >();
    assertType<
      SetElementIssue<TypeOfError<"String">>,
      {
        readonly kind: "Element";
        readonly index: number;
        readonly error: TypeOfError<"String">;
      }
    >();
    assertType<
      SetExcessPropertyIssue,
      {
        readonly kind: "ExcessProperty";
        readonly key: string | symbol;
      }
    >();
  });
});

describe("map", () => {
  it("constructs and caches a Map Type", () => {
    const Scores = map(String, Number);

    assertEqual(Scores.name, "Map");
    assertSame(Scores.key, String);
    assertSame(Scores.value, Number);
    assertSame(map(String, Number), Scores);
    assertType<typeof Scores.Output, ReadonlyMap<string, number>>();
    assertType<typeof Scores.Input, ReadonlyMap<string, number>>();
    assertType<
      typeof Scores.Error,
      MapError<TypeOfError<"String">, TypeOfError<"Number">, never>
    >();
    assertType<
      typeof Scores.from,
      (
        value: ReadonlyMap<string, number>,
        options?: ValidationOptions,
      ) => Result<ReadonlyMap<string, number>>
    >();

    const uncertain = Math.random() ? String : Number;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error Map key must use one concrete Type node. Pass a Union Type node instead of a union of Type nodes.
      map(uncertain, Number);
      // @ts-expect-error Map value must use one concrete Type node. Pass a Union Type node instead of a union of Type nodes.
      map(String, uncertain);
      // @ts-expect-error A key must preserve its concrete Type.
      map(erased, Number);
      // @ts-expect-error A value must preserve its concrete Type.
      map(String, erased);
    };
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("validates the Map boundary, structure, keys, and values", () => {
    const Scores = map(String, Number);
    const value = new Map<string, number>([
      ["Ada", 10],
      ["Grace", 20],
    ]);
    const result = Scores.fromUnknown(value);

    assertOk(result, value);
    assertSame(result.value, value);
    assertEqual(
      Scores.fromUnknown({ Ada: 10 }),
      err({ type: "Map", reason: { kind: "NotMap", value: { Ada: 10 } } }),
    );

    const withProperty = globalThis.Object.assign(
      new Map<unknown, unknown>([[1, "bad"]]),
      { metadata: true },
    );
    assertEqual(
      Scores.fromUnknown(withProperty, { errors: "all" }),
      err({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            { kind: "ExcessProperty", key: "metadata" },
            {
              kind: "Key",
              index: 0,
              key: 1,
              error: { type: "TypeOf", expected: "String", value: 1 },
            },
            {
              kind: "Value",
              index: 0,
              key: 1,
              error: {
                type: "TypeOf",
                expected: "Number",
                value: "bad",
              },
            },
          ],
        },
      }),
    );
    assertEqual(
      Scores.fromUnknown(withProperty),
      err({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      }),
    );
    assertEqual(
      Scores.fromUnknown(new Map([[1, 10]])),
      err({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Key",
              index: 0,
              key: 1,
              error: { type: "TypeOf", expected: "String", value: 1 },
            },
          ],
        },
      }),
    );
    assertEqual(
      Scores.fromUnknown(new Map([["Ada", "bad"]])),
      err({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Value",
              index: 0,
              key: "Ada",
              error: {
                type: "TypeOf",
                expected: "Number",
                value: "bad",
              },
            },
          ],
        },
      }),
    );
    assertEqual(
      Scores.fromUnknown(
        new Map<unknown, unknown>([
          ["Ada", "bad"],
          ["Grace", 20],
        ]),
        { errors: "all" },
      ),
      err({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Value",
              index: 0,
              key: "Ada",
              error: {
                type: "TypeOf",
                expected: "Number",
                value: "bad",
              },
            },
          ],
        },
      }),
    );
  });

  it("supports key and value decoding, parent operations, and encoding", () => {
    const NumberFromString = setupNumberFromString();
    const Counts = map(NumberFromString, NumberFromString);
    const input = new Map([["1", "2"]]);
    const output = new Map([[1, 2]]);

    assertOk(Counts.fromUnknown(input), output);
    assertEqual(Counts.to(output), input);
    assertTrue(Counts.is(output));
    assertFalse(Counts.is(input));
    assertSame(Counts.parent, map(String, String));
    assertOk(Counts.from.parent(input), output);
    assertType<
      typeof Counts,
      MapType<typeof Counts.key, typeof Counts.value>
    >();
    assertType<typeof Counts.Input, ReadonlyMap<string, string>>();
    assertType<typeof Counts.Output, ReadonlyMap<number, number>>();
    assertType<
      typeof Counts.Error,
      MapEntriesError<NumberFromStringError, NumberFromStringError>
    >();

    const Values = map(String, NumberFromString);
    assertEqual(Values.to(new Map([["one", 1]])), new Map([["one", "1"]]));

    const TransparentNumber = transform("TransparentNumber", Number, Number, {
      from: ok,
      to: (value) => value,
    });
    const unchanged = new Map([["one", 1]]);
    assertSame(map(String, TransparentNumber).to(unchanged), unchanged);
  });

  it("rejects decoded key collisions and invalid encoding collisions", () => {
    const NumberFromString = setupNumberFromString();
    const Counts = map(NumberFromString, Number);
    const input = new Map<string, number>([
      ["01", 1],
      ["1", 2],
    ]);

    assertEqual(
      Counts.fromUnknown(input),
      err({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Collision",
              index: 1,
              key: "1",
              previousIndex: 0,
              previousKey: "01",
              outputKey: 1,
            },
          ],
        },
      }),
    );
    assertEqual(
      Counts.fromUnknown(input, { errors: "all" }),
      err({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Collision",
              index: 1,
              key: "1",
              previousIndex: 0,
              previousKey: "01",
              outputKey: 1,
            },
          ],
        },
      }),
    );

    const InvalidKeyEncoding = transform("InvalidKeyEncoding", String, Number, {
      from: (value) => ok(globalThis.Number(value)),
      to: () => "same",
    });
    const InvalidMap = map(InvalidKeyEncoding, String);

    const error = assertThrowsInstanceOf(
      () =>
        InvalidMap.to(
          new Map([
            [1, "one"],
            [2, "two"],
          ]),
        ),
      Error,
    );
    assertTrue(
      error.message.includes(
        "Map key Type encoding must not produce duplicate keys.",
      ),
    );
  });

  it("checks exact Output representation", () => {
    const Scores = map(String, Number);
    const value = new Map([["Ada", 10]]);
    const withProperty = globalThis.Object.assign(new Map([["Ada", 10]]), {
      metadata: true,
    });

    assertTrue(Scores.is(value));
    assertFalse(Scores.is({ Ada: 10 }));
    assertFalse(Scores.is(withProperty));
    assertFalse(Scores.is(new Map([[1, 10]])));
    assertFalse(Scores.is(new Map([["Ada", "10"]])));
    assertSame(Scores.to(value), value);
    assertAssertionError(
      () =>
        Scores.from(
          new Map([[1, 10]]) as unknown as ReadonlyMap<string, number>,
        ),
      "Expected Map.",
      {
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Key",
              index: 0,
              key: 1,
              error: { type: "TypeOf", expected: "String", value: 1 },
            },
          ],
        },
      },
    );
  });

  it("formats structural and nested errors", () => {
    const Scores = map(String, Number);

    assertEqual(
      Scores.formatError({
        type: "Map",
        reason: { kind: "NotMap", value: null },
      }),
      "A value null is not a Map.",
    );
    assertEqual(
      Scores.formatError({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      }),
      'An excess Map property "metadata" is not allowed.',
    );
    assertEqual(
      Scores.formatError({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Key",
              index: 0,
              key: 1,
              error: { type: "TypeOf", expected: "String", value: 1 },
            },
          ],
        },
      }),
      "A value 1 is not a string.",
    );
    assertEqual(
      Scores.formatError({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Value",
              index: 0,
              key: "Ada",
              error: { type: "TypeOf", expected: "Number", value: "10" },
            },
          ],
        },
      }),
      'A value "10" is not a number.',
    );
    assertEqual(
      map(setupNumberFromString(), Number).formatError({
        type: "Map",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Collision",
              index: 1,
              key: "1",
              previousIndex: 0,
              previousKey: "01",
              outputKey: 1,
            },
          ],
        },
      }),
      "Map keys at indexes 0 and 1 decode to the same key 1.",
    );

    assertType<
      MapError<TypeOfError<"String">, TypeOfError<"Number">>,
      | MapNotMapError
      | MapEntriesError<
          TypeOfError<"String">,
          TypeOfError<"Number">,
          MapKeyCollisionIssue | MapExcessPropertyIssue
        >
    >();
    assertType<
      MapIssue<TypeOfError<"String">, TypeOfError<"Number">>,
      | MapKeyIssue<TypeOfError<"String">>
      | MapValueIssue<TypeOfError<"Number">>
      | MapKeyCollisionIssue
    >();
  });

  it("localizes structural, key, and value errors", () => {
    const Scores = map(String, Number);
    const LocalizedScores = localizeTypes(
      { Scores },
      {
        test: {
          Map: () => "Localized Map.",
          Number: () => "Localized Number.",
          String: () => "Localized String.",
        },
      },
    ).test.Scores;
    const formatError = (value: unknown): string => {
      const result = LocalizedScores.fromUnknown(value);
      assertErr(result);
      return LocalizedScores.formatError(result.error);
    };

    assertEqual(formatError(new Map([[1, 10]])), "Localized String.");
    assertEqual(formatError(new Map([["Ada", "bad"]])), "Localized Number.");
    assertEqual(formatError(null), "Localized Map.");

    const compileTimeAssertions = () => {
      localizeTypes(
        { Scores },
        {
          // @ts-expect-error Map is missing.
          missingMap: {
            Number: () => "Number.",
            String: () => "String.",
          },
        },
      );
      localizeTypes(
        { Scores },
        {
          // @ts-expect-error Number is missing.
          missingNumber: {
            Map: () => "Map.",
            String: () => "String.",
          },
        },
      );
      localizeTypes(
        { Scores },
        {
          // @ts-expect-error String is missing.
          missingString: {
            Map: () => "Map.",
            Number: () => "Number.",
          },
        },
      );
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });
});

describe("tuple", () => {
  const setupEntryElements = () => {
    const NumberFromString = setupNumberFromString();
    const Positive = brand(
      "Positive",
      Number,
      (value) => (value > 0 ? ok() : err({ type: "Positive", value })),
      formatTestTypeError,
    );

    return { NumberFromString, Positive };
  };

  const setupEntry = () => {
    const { NumberFromString, Positive } = setupEntryElements();
    const Entry = tuple(String, NumberFromString, Positive);

    return { Entry, NumberFromString, Positive };
  };

  describe("construction", () => {
    it("creates a fixed heterogeneous Type and collapses element roots into one parent", () => {
      const { Entry, NumberFromString, Positive } = setupEntry();

      assertEqual(Entry.name, "Tuple");
      assertEqual(Entry.elements, [String, NumberFromString, Positive]);
      assertEqual(Entry.parent.elements, [String, String, Number]);
      assertSame(Entry.parent.parent, null);
      assertType<
        typeof Entry,
        TupleType<
          readonly [typeof String, typeof NumberFromString, typeof Positive]
        >
      >();
      assertType<typeof Entry.Input, readonly [string, string, number]>();
      assertType<
        typeof Entry.Output,
        readonly [string, number, typeof Positive.Output]
      >();
      assertType<
        typeof Entry.Error,
        TupleElementsError<NumberFromStringError | typeof Positive.Error>
      >();
      assertType<
        InferErrors<typeof Entry>,
        TupleError<
          | TypeOfError<"String">
          | TypeOfError<"Number">
          | NumberFromStringError
          | typeof Positive.Error
        >
      >();
    });

    it("creates a root Tuple without a parent", () => {
      const Pair = tuple(String, Number);

      assertSame(Pair.parent, null);
      assertType<
        typeof Pair.Error,
        TupleError<TypeOfError<"String"> | TypeOfError<"Number">>
      >();
      assertType<
        typeof Pair.from,
        (
          value: readonly [string, number],
          options?: ValidationOptions,
        ) => Result<readonly [string, number]>
      >();
    });

    it("exposes exact structural and typed element issue types", () => {
      type ElementError = TypeOfError<"String"> | TypeOfError<"Number">;

      assertType<
        TupleItemsError<ElementError>["reason"]["issues"][number],
        TupleIssue<ElementError>
      >();
      assertType<
        TupleElementsError<ElementError>["reason"]["issues"][number],
        | TupleElementIssue<TypeOfError<"String">>
        | TupleElementIssue<TypeOfError<"Number">>
      >();
      assertType<TupleElementIssue<never>, never>();
      assertType<
        TupleExcessPropertyIssue extends TupleItemsError<ElementError>["reason"]["issues"][number]
          ? true
          : false,
        true
      >();
      assertType<
        TupleExcessPropertyIssue extends TupleElementsError<ElementError>["reason"]["issues"][number]
          ? true
          : false,
        false
      >();
      assertType<TupleExcessPropertyIssue["key"], string | symbol>();
    });

    it("requires one concrete finite non-empty tuple of concrete Types", () => {
      const uncertain: FormattableTypeNode = String;
      const widened: NonEmptyReadonlyArray<typeof String> = [String];

      const validateUnionElement = <
        Element extends typeof String | typeof Number,
      >(
        element: Element,
      ): Element => {
        // @ts-expect-error An unresolved element might be a union of Types.
        tuple(element);
        return element;
      };
      const validateTupleSchema = <
        Elements extends
          readonly [typeof String] | readonly [typeof String, typeof Number],
      >(
        elements: Elements,
      ): Elements => {
        // @ts-expect-error A union of Tuple schemas is not one concrete schema.
        tuple(...elements);
        return elements;
      };

      const compileTimeAssertions = () => {
        // @ts-expect-error A Tuple must contain at least one Type.
        tuple();
        // @ts-expect-error An element must preserve its concrete Type.
        tuple(uncertain);
        // @ts-expect-error A widened array is not a finite Tuple schema.
        tuple(...widened);
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
      assertType<
        typeof validateUnionElement extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
      assertType<
        typeof validateTupleSchema extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("formatError", () => {
    it("formats structural errors and the first nested element error", () => {
      const Pair = tuple(String, Number);

      assertEqual(
        Pair.formatError({
          type: "Tuple",
          reason: { kind: "NotArray", value: null },
        }),
        "A value null is not a tuple.",
      );
      assertEqual(
        Pair.formatError({
          type: "Tuple",
          reason: { kind: "InvalidLength", expected: 2, actual: 1 },
        }),
        "A Tuple must contain exactly 2 elements, but the value contains 1.",
      );
      assertEqual(
        Pair.formatError({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 0 }],
          },
        }),
        "A Tuple element at index 0 is missing.",
      );
      assertEqual(
        Pair.formatError({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "Accessor", index: 0 }],
          },
        }),
        "A Tuple element at index 0 must be a data property.",
      );
      assertEqual(
        Pair.formatError({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "ExcessProperty", key: "metadata" }],
          },
        }),
        "An excess Tuple property is not allowed. Remove it or use a different Type.",
      );
      assertEqual(
        Pair.formatError({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: { type: "TypeOf", expected: "Number", value: "1" },
              },
            ],
          },
        }),
        'A value "1" is not a number.',
      );
    });
  });

  describe("fromUnknown", () => {
    it("preserves a valid root Tuple and materializes transformed elements only when necessary", () => {
      const Pair = tuple(String, Number);
      const rootValue = ["count", 1] as const;
      const { Entry, Positive } = setupEntry();
      const input = ["count", "1", 2] as const;

      const rootResult = Pair.fromUnknown(rootValue);
      const result = Entry.fromUnknown(input);

      assertOk(rootResult, rootValue);
      assertSame(rootResult.value, rootValue);
      assertOk(result, ["count", 1, Positive.orThrow(2)]);
      assertFalse(globalThis.Object.is(result.value, input));
      assertSame(result.value[0], input[0]);
      assertTrue(Entry.is(result.value));
    });

    it("rejects non-arrays and wrong lengths", () => {
      const Pair = tuple(String, Number);

      assertEqual(
        Pair.fromUnknown(null),
        err({
          type: "Tuple",
          reason: { kind: "NotArray", value: null },
        }),
      );
      assertEqual(
        Pair.fromUnknown(["count"]),
        err({
          type: "Tuple",
          reason: { kind: "InvalidLength", expected: 2, actual: 1 },
        }),
      );
      assertFalse(Pair.is(null));
      assertFalse(Pair.is(["count"]));
    });

    it("returns the first element error by default and every error on request", () => {
      const Pair = tuple(String, Number);
      const value = [42, "1"];

      assertEqual(
        Pair.fromUnknown(value),
        err({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "TypeOf", expected: "String", value: 42 },
              },
            ],
          },
        }),
      );
      assertEqual(
        Pair.fromUnknown(value, { errors: "all" }),
        err({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: { type: "TypeOf", expected: "String", value: 42 },
              },
              {
                kind: "Element",
                index: 1,
                error: { type: "TypeOf", expected: "Number", value: "1" },
              },
            ],
          },
        }),
      );
    });

    it("rejects holes and accessors without invoking them", () => {
      const Pair = tuple(String, Number);
      const value = createMutableArray<unknown>(2);
      let reads = 0;
      globalThis.Object.defineProperty(value, 1, {
        enumerable: true,
        get: () => {
          reads++;
          return 1;
        },
      });

      assertEqual(
        Pair.fromUnknown(value, { errors: "all" }),
        err({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              { kind: "Hole", index: 0 },
              { kind: "Accessor", index: 1 },
            ],
          },
        }),
      );
      assertEqual(
        Pair.fromUnknown(createMutableArray<unknown>(2)),
        err({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 0 }],
          },
        }),
      );
      assertFalse(Pair.is(value));
      assertEqual(reads, 0);
    });

    it("rejects named, non-enumerable, and symbol properties without reading them", () => {
      const Pair = tuple(String, Number);
      const symbol = globalThis.Symbol("metadata");
      const value: Array<unknown> = ["count", 1];
      let reads = 0;
      globalThis.Object.defineProperty(value, "hidden", {
        value: true,
        enumerable: false,
      });
      globalThis.Object.defineProperty(value, symbol, {
        enumerable: true,
        get: () => {
          reads++;
          return true;
        },
      });

      assertEqual(
        Pair.fromUnknown(value, { errors: "all" }),
        err({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              { kind: "ExcessProperty", key: "hidden" },
              { kind: "ExcessProperty", key: symbol },
            ],
          },
        }),
      );
      assertFalse(Pair.is(value));
      assertEqual(reads, 0);
    });
  });

  describe("typed operations", () => {
    it("runs every remaining element pipeline from the collapsed root parent", () => {
      const { NumberFromString, Positive } = setupEntryElements();
      const Entry = tuple(NumberFromString, Positive);
      const input = ["1", 2] as const;
      const result = Entry.from.parent(input);

      assertType<
        typeof result,
        Result<
          typeof Entry.Output,
          TupleElementsError<NumberFromStringError | typeof Positive.Error>
        >
      >();
      assertType<
        Parameters<typeof Entry.from.parent>[0],
        readonly [string, number]
      >();
      assertType<
        "parent" extends keyof typeof Entry.from.parent ? true : false,
        false
      >();
      assertOk(result, [1, Positive.orThrow(2)]);
      assertFalse(globalThis.Object.is(result.value, input));
    });

    it("collects errors from different element pipelines", () => {
      const { NumberFromString, Positive } = setupEntryElements();
      const Entry = tuple(NumberFromString, Positive);

      assertEqual(
        Entry.from.parent(["not a number", -1], { errors: "all" }),
        err({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 0,
                error: {
                  type: "NumberFromString",
                  value: "not a number",
                },
              },
              {
                kind: "Element",
                index: 1,
                error: { type: "Positive", value: -1 },
              },
            ],
          },
        }),
      );
    });

    it("encodes every element and preserves identity when all encoders do", () => {
      const NumberFromString = setupNumberFromString();
      const Encoded = tuple(String, NumberFromString);
      const output = ["count", 1] as const;
      const encoded = Encoded.to(output);
      const Pair = tuple(String, Number);
      const rootOutput = ["count", 1] as const;
      const StringOrNumberFromString = tuple(union(String, NumberFromString));
      const unchanged = ["count"] as const;

      assertEqual(encoded, ["count", "1"]);
      assertFalse(globalThis.Object.is(encoded, output));
      assertTrue(Encoded.parent.is(encoded));
      assertSame(Pair.to(rootOutput), rootOutput);
      assertSame(StringOrNumberFromString.to(unchanged), unchanged);
    });

    it("asserts structural contract violations at from and to boundaries", () => {
      const Pair = tuple(String, Number);
      const excess: typeof Pair.Output = ["count", 1];
      const invalidElement: typeof Pair.Output = ["count", 1];
      globalThis.Object.defineProperty(excess, "metadata", {
        value: true,
      });
      globalThis.Object.defineProperty(invalidElement, 1, {
        value: "1",
        enumerable: true,
      });
      const excessResult = Pair.fromUnknown(excess);
      const invalidElementResult = Pair.fromUnknown(invalidElement);

      assertErr(excessResult, {
        type: "Tuple",
        reason: {
          kind: "Items",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      });
      assertErr(invalidElementResult, {
        type: "Tuple",
        reason: {
          kind: "Items",
          issues: [
            {
              kind: "Element",
              index: 1,
              error: { type: "TypeOf", expected: "Number", value: "1" },
            },
          ],
        },
      });
      assertAssertionError(
        () => Pair.from(excess),
        "Expected Tuple.",
        excessResult.error,
      );
      assertAssertionError(
        () => Pair.to(excess),
        "Expected Tuple.",
        excessResult.error,
      );
      assertAssertionError(
        () => Pair.from(invalidElement),
        "Expected Tuple.",
        invalidElementResult.error,
      );
    });

    it("asserts the root parent representation before reading elements", () => {
      const NumberFromString = setupNumberFromString();
      const Entry = tuple(NumberFromString, Number);
      const input: typeof Entry.parent.Output = ["1", 2];
      let reads = 0;
      globalThis.Object.defineProperty(input, 0, {
        enumerable: true,
        get: () => {
          reads++;
          return "1";
        },
      });

      const result = Entry.parent.fromUnknown(input);

      assertErr(result, {
        type: "Tuple",
        reason: {
          kind: "Items",
          issues: [{ kind: "Accessor", index: 0 }],
        },
      });
      assertAssertionError(
        () => Entry.from.parent(input),
        "Expected Tuple.",
        result.error,
      );
      assertEqual(reads, 0);
    });
  });

  describe("composition", () => {
    it("composes as an Array element Type", () => {
      const NumberFromString = setupNumberFromString();
      const Entries = array(tuple(String, NumberFromString));
      const input = [
        ["first", "1"],
        ["second", "2"],
      ] as const;

      assertOk(Entries.fromUnknown(input), [
        ["first", 1],
        ["second", 2],
      ]);
      assertTrue(
        Entries.is([
          ["first", 1],
          ["second", 2],
        ]),
      );
    });

    it("guards recursive Lazy validation by consuming one Tuple element", () => {
      interface StringListNode extends Readonly<[string, StringList]> {}
      type StringList = StringListNode | null;
      type StringListTupleError = TupleError<
        TypeOfError<"String"> | StringListError
      >;
      interface StringListError extends TypeError<"Union"> {
        readonly errors: NonEmptyReadonlyArray<
          | { readonly index: 0; readonly error: StringListTupleError }
          | { readonly index: 1; readonly error: LiteralError<null> }
        >;
      }

      const StringList: LazyType<
        StringList,
        StringList,
        StringListError,
        StringListError,
        StringListError
      > = lazy(() => union(tuple(String, StringList), Null));
      const value: StringList = ["first", ["second", null]];

      assertEqual(StringList.fromUnknown(value), ok(value));
      assertTrue(StringList.is(value));
      assertEqual(
        StringList.fromUnknown(["first", [42, null]]),
        err({
          type: "Union",
          errors: [
            {
              index: 0,
              error: {
                type: "Tuple",
                reason: {
                  kind: "Items",
                  issues: [
                    {
                      kind: "Element",
                      index: 1,
                      error: {
                        type: "Union",
                        errors: [
                          {
                            index: 0,
                            error: {
                              type: "Tuple",
                              reason: {
                                kind: "Items",
                                issues: [
                                  {
                                    kind: "Element",
                                    index: 0,
                                    error: {
                                      type: "TypeOf",
                                      expected: "String",
                                      value: 42,
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      );
    });
  });
});

describe("digit Types", () => {
  it("Digit", () => {
    assertType<
      typeof Digit.Output,
      "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
    >();
    assertTrue(Digit.is("0"));
    assertFalse(Digit.is("10"));
  });

  it("Digit1To9", () => {
    assertType<
      typeof Digit1To9.Output,
      "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
    >();
    assertTrue(Digit1To9.is("1"));
    assertFalse(Digit1To9.is("0"));
  });

  it("Digit1To6", () => {
    assertType<typeof Digit1To6.Output, "1" | "2" | "3" | "4" | "5" | "6">();
    assertTrue(Digit1To6.is("6"));
    assertFalse(Digit1To6.is("7"));
  });

  it("Digit1To23", () => {
    assertType<"1" extends typeof Digit1To23.Output ? true : false, true>();
    assertType<"9" extends typeof Digit1To23.Output ? true : false, true>();
    assertType<"10" extends typeof Digit1To23.Output ? true : false, true>();
    assertType<"19" extends typeof Digit1To23.Output ? true : false, true>();
    assertType<"20" extends typeof Digit1To23.Output ? true : false, true>();
    assertType<"23" extends typeof Digit1To23.Output ? true : false, true>();
    assertType<"0" extends typeof Digit1To23.Output ? true : false, false>();
    assertType<"24" extends typeof Digit1To23.Output ? true : false, false>();
    assertType<"01" extends typeof Digit1To23.Output ? true : false, false>();
    assertTrue(Digit1To23.is("23"));
    assertFalse(Digit1To23.is("24"));
  });

  it("Digit1To51", () => {
    assertType<"1" extends typeof Digit1To51.Output ? true : false, true>();
    assertType<"9" extends typeof Digit1To51.Output ? true : false, true>();
    assertType<"10" extends typeof Digit1To51.Output ? true : false, true>();
    assertType<"49" extends typeof Digit1To51.Output ? true : false, true>();
    assertType<"50" extends typeof Digit1To51.Output ? true : false, true>();
    assertType<"51" extends typeof Digit1To51.Output ? true : false, true>();
    assertType<"0" extends typeof Digit1To51.Output ? true : false, false>();
    assertType<"52" extends typeof Digit1To51.Output ? true : false, false>();
    assertType<"01" extends typeof Digit1To51.Output ? true : false, false>();
    assertTrue(Digit1To51.is("51"));
    assertFalse(Digit1To51.is("52"));
  });

  it("Digit1To99", () => {
    assertType<"1" extends typeof Digit1To99.Output ? true : false, true>();
    assertType<"9" extends typeof Digit1To99.Output ? true : false, true>();
    assertType<"10" extends typeof Digit1To99.Output ? true : false, true>();
    assertType<"50" extends typeof Digit1To99.Output ? true : false, true>();
    assertType<"99" extends typeof Digit1To99.Output ? true : false, true>();
    assertType<"0" extends typeof Digit1To99.Output ? true : false, false>();
    assertType<"100" extends typeof Digit1To99.Output ? true : false, false>();
    assertType<"01" extends typeof Digit1To99.Output ? true : false, false>();
    assertTrue(Digit1To99.is("99"));
    assertFalse(Digit1To99.is("100"));
  });

  it("Digit1To59", () => {
    assertType<"1" extends typeof Digit1To59.Output ? true : false, true>();
    assertType<"9" extends typeof Digit1To59.Output ? true : false, true>();
    assertType<"10" extends typeof Digit1To59.Output ? true : false, true>();
    assertType<"50" extends typeof Digit1To59.Output ? true : false, true>();
    assertType<"59" extends typeof Digit1To59.Output ? true : false, true>();
    assertType<"0" extends typeof Digit1To59.Output ? true : false, false>();
    assertType<"60" extends typeof Digit1To59.Output ? true : false, false>();
    assertType<"99" extends typeof Digit1To59.Output ? true : false, false>();
    assertTrue(Digit1To59.is("59"));
    assertFalse(Digit1To59.is("60"));
  });
});

describe("Object", () => {
  it("has the expected root definition", () => {
    assertType<
      typeof Object,
      Type<
        "Object",
        Readonly<Record<string, unknown>>,
        Readonly<Record<string, unknown>>,
        ObjectError<
          Readonly<Record<never, never>>,
          ObjectPropertyAccessError | ObjectExcessPropertyError
        >
      >
    >();
    assertSame(Object.parent, null);
  });

  it("accepts ordinary and null prototypes without copying", () => {
    const ordinary: unknown = { name: "Ada" };
    const nullPrototype: unknown = globalThis.Object.assign(
      globalThis.Object.create(null) as Record<string, unknown>,
      { name: "Ada" },
    );
    for (const value of [ordinary, nullPrototype]) {
      const result = Object.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertTrue(Object.is(value));
    }

    const typed: typeof Object.Output = { name: "Ada" };
    assertEqual(Object.from(typed), ok(typed));
    assertSame(Object.to(typed), typed);
  });

  it("rejects non-objects, instances, and custom prototype chains", () => {
    class Example {
      readonly value = 1;
    }

    for (const value of [null, 42, "value", () => undefined]) {
      assertEqual(
        Object.fromUnknown(value),
        err({ type: "Object", reason: { kind: "NotObject", value } }),
      );
      assertFalse(Object.is(value));
    }

    for (const value of [
      [],
      new globalThis.Date(),
      new Example(),
      ...setupUnexpectedPrototypeValues(),
    ]) {
      assertEqual(
        Object.fromUnknown(value),
        err({
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value },
        }),
      );
      assertFalse(Object.is(value));
    }
  });

  it("rejects accessors, non-enumerable properties, and symbol keys without reading values", () => {
    let reads = 0;
    const symbol = globalThis.Symbol("metadata");
    const value = globalThis.Object.defineProperties(
      {},
      {
        accessor: {
          enumerable: true,
          get: () => {
            reads++;
            return "value";
          },
        },
        hidden: { enumerable: false, value: "value" },
        [symbol]: {
          enumerable: true,
          get: () => {
            reads++;
            return "value";
          },
        },
      },
    );

    const result = Object.fromUnknown(value, { errors: "all" });
    assertErr(result);
    assertSame(result.error.reason.kind, "Properties");
    const { errors } = result.error.reason;
    assertEqual(Reflect.ownKeys(errors), ["accessor", "hidden", symbol]);
    assertEqual(errors.accessor, {
      type: "ObjectPropertyAccess",
      reason: "Accessor",
    });
    assertEqual(errors.hidden, {
      type: "ObjectPropertyAccess",
      reason: "NonEnumerable",
    });
    assertEqual(errors[symbol], { type: "ObjectExcessProperty" });
    assertFalse(Object.is(value));
    assertEqual(reads, 0);
  });

  it("does not read Symbol.toStringTag", () => {
    let reads = 0;
    const value = globalThis.Object.defineProperty(
      {},
      globalThis.Symbol.toStringTag,
      {
        enumerable: true,
        get: () => {
          reads++;
          return "Object";
        },
      },
    );

    const result = Object.fromUnknown(value);
    assertErr(result);
    assertSame(result.error.reason.kind, "Properties");
    assertEqual(Reflect.ownKeys(result.error.reason.errors), [
      globalThis.Symbol.toStringTag,
    ]);
    assertEqual(result.error.reason.errors[globalThis.Symbol.toStringTag], {
      type: "ObjectExcessProperty",
    });
    assertEqual(reads, 0);
  });

  it("formats structural failures with developer guidance", () => {
    assertEqual(
      Object.formatError({
        type: "Object",
        reason: { kind: "NotObject", value: null },
      }),
      "A value null is not an object.",
    );
    assertEqual(
      Object.formatError({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            value: { type: "ObjectPropertyAccess", reason: "Accessor" },
          },
        },
      }),
      "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
    );
    assertEqual(
      Object.formatError({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            value: {
              type: "ObjectPropertyAccess",
              reason: "NonEnumerable",
            },
          },
        },
      }),
      "An Object property must be enumerable. Make it enumerable or use a different Type.",
    );
    assertEqual(
      Object.formatError({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            [globalThis.Symbol.iterator]: {
              type: "ObjectExcessProperty",
            },
          },
        },
      }),
      "An Object property key must be a string. Remove the symbol property or use a different Type.",
    );
  });

  it("asserts invalid typed representations with the same structured error", () => {
    const value = globalThis.Object.defineProperty({}, "name", {
      enumerable: true,
      get: () => "Ada",
    });
    const result = Object.fromUnknown(value);

    assertErr(result, {
      type: "Object",
      reason: {
        kind: "Properties",
        errors: {
          name: {
            type: "ObjectPropertyAccess",
            reason: "Accessor",
          },
        },
      },
    });

    const typed = value as typeof Object.Output;
    assertAssertionError(
      () => Object.from(typed),
      "Expected Object.",
      result.error,
    );
    assertAssertionError(
      () => Object.to(typed),
      "Expected Object.",
      result.error,
    );
  });

  it("retains every invalid typed representation error when requested", () => {
    const value = globalThis.Object.defineProperties(
      {},
      {
        name: {
          enumerable: true,
          get: () => "Ada",
        },
        hidden: {
          enumerable: false,
          value: "value",
        },
      },
    );
    const result = Object.fromUnknown(value, { errors: "all" });

    assertErr(result, {
      type: "Object",
      reason: {
        kind: "Properties",
        errors: {
          name: {
            type: "ObjectPropertyAccess",
            reason: "Accessor",
          },
          hidden: {
            type: "ObjectPropertyAccess",
            reason: "NonEnumerable",
          },
        },
      },
    });

    const typed = value as typeof Object.Output;
    assertAssertionError(
      () => Object.from(typed, { errors: "all" }),
      "Expected Object.",
      result.error,
    );
    assertAssertionError(
      () => Object.orThrow(typed, { errors: "all" }),
      "Expected Object.",
      result.error,
    );
  });
});

describe("record", () => {
  const setupTransformedRecord = () => {
    const Lowercase = brand(
      "Lowercase",
      String,
      (value) =>
        value === value.toLowerCase()
          ? ok()
          : err({ type: "Lowercase", value }),
      formatTestTypeError,
    );
    const LowercaseFromString = transform(
      "LowercaseFromString",
      String,
      Lowercase,
      {
        from: (value) => ok(value.toLowerCase()),
        to: (value) => value,
      },
    );
    const NumberFromString = setupNumberFromString();
    const Values = record(LowercaseFromString, NumberFromString);

    return { Lowercase, LowercaseFromString, NumberFromString, Values };
  };

  describe("construction", () => {
    it("derives partial readonly shapes, errors, and one root parent", () => {
      const Values = record(String, Number);
      const _Allowed = record(literal("allowed"), Number);
      const transformed = setupTransformedRecord();

      assertEqual(Values.name, "Record");
      assertSame(Values.key, String);
      assertSame(Values.value, Number);
      assertSame(Values.parent, null);
      assertSame(transformed.Values.parent.key, String);
      assertSame(transformed.Values.parent.value, String);
      assertSame(transformed.Values.parent.parent, null);
      assertTrue("parent" in transformed.Values.from);
      assertType<
        "parent" extends keyof typeof transformed.Values.from ? true : false,
        true
      >();

      assertType<
        typeof Values extends RecordType<typeof String, typeof Number>
          ? true
          : false,
        true
      >();
      assertType<
        typeof Values.Input,
        Readonly<Partial<Record<string, number>>>
      >();
      assertType<
        typeof Values.Output,
        Readonly<Partial<Record<string, number>>>
      >();
      assertType<
        typeof Values.Error,
        RecordError<TypeOfError<"String">, TypeOfError<"Number">, never>
      >();
      assertType<
        InferErrors<typeof Values>,
        RecordError<TypeOfError<"String">, TypeOfError<"Number">, never>
      >();
      assertType<
        typeof _Allowed.Input,
        Readonly<Partial<Record<string, number>>>
      >();
      assertType<
        typeof _Allowed.Output,
        {
          readonly allowed?: number;
        }
      >();
      assertType<RecordIssue<never, never, never>, never>();
      assertType<
        RecordIssue<
          never,
          never,
          RecordAccessorIssue | RecordNonEnumerableIssue
        >,
        RecordAccessorIssue | RecordNonEnumerableIssue
      >();
      assertType<RecordEntriesError<never, never, never>, never>();
      assertType<
        RecordError<never, never, never>,
        | RecordNotRecordError
        | RecordNotPlainRecordError
        | RecordEntriesError<
            never,
            never,
            RecordAccessorIssue | RecordNonEnumerableIssue
          >
      >();
    });

    it("rejects every key in an empty key domain", () => {
      const Values = record(Never, Number);
      const symbol = globalThis.Symbol();
      const value = { anything: 1 };
      const compileTimeAssertions = () => {
        Values.from({});
        Values.to({});
        Values.from({ [symbol]: true });
        Values.to({ [symbol]: true });
        // @ts-expect-error A Record with Never keys has no properties.
        Values.from(value);
        // @ts-expect-error A Record with Never keys has no properties.
        Values.orThrow(value);
        // @ts-expect-error A Record with Never keys has no properties.
        Values.orNull(value);
        // @ts-expect-error A Record with Never keys has no properties.
        Values.to(value);
      };

      assertType<typeof Values.Input, Readonly<Record<string, never>>>();
      assertType<typeof Values.Output, Readonly<Record<string, never>>>();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
      assertEqual(Values.fromUnknown({}), ok(createNullRecord({})));
      assertEqual(
        Values.fromUnknown(value),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key: "anything",
                error: { type: "Never", value: "anything" },
              },
            ],
          },
        }),
      );
      assertTrue(Values.is(createNullRecord({})));
      assertFalse(Values.is(createNullRecord(value)));
    });

    it("computes an empty key domain independently at each boundary", () => {
      interface NeverFromStringError extends TypeError<"NeverFromString"> {
        readonly value: string;
      }
      const NeverFromString = transform(
        "NeverFromString",
        String,
        Never,
        {
          from: (value): Result<never, NeverFromStringError> =>
            err({ type: "NeverFromString", value }),
          to: (value) => value,
        },
        formatTestTypeError,
      );
      const _Values = record(NeverFromString, Number);

      assertType<
        typeof _Values.Input,
        Readonly<Partial<Record<string, number>>>
      >();
      assertType<typeof _Values.Output, Readonly<Record<string, never>>>();
    });

    it("requires concrete string key and concrete value Types", () => {
      type Key = typeof String | typeof Number;
      type Value = typeof String | typeof Number;
      const key = String as Key;
      const value = String as Value;
      const compileTimeAssertions = () => {
        // @ts-expect-error Record key Input and Output must extend string.
        record(Number, String);
        // @ts-expect-error Record key Input and Output must extend string.
        record(Unknown, String);
        // @ts-expect-error Record key requires one concrete Type node.
        record(key, String);
        // @ts-expect-error Record value requires one concrete Type node.
        record(String, value);
        record(String, union(String, Number));
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("distributes key and value errors inside one issue container", () => {
      interface AError extends TypeError<"A"> {
        readonly value: number;
      }
      interface BError extends TypeError<"B"> {
        readonly value: string;
      }

      const error: RecordEntriesError<AError | BError, AError | BError> = {
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Key",
              key: "a",
              error: { type: "A", value: 1 },
            },
            {
              kind: "Value",
              key: "b",
              error: { type: "B", value: "b" },
            },
          ],
        },
      };

      assertType<
        typeof error.reason.issues,
        NonEmptyReadonlyArray<
          | RecordKeyIssue<AError | BError>
          | RecordValueIssue<AError | BError>
          | RecordCollisionIssue
        >
      >();
    });
  });

  describe("validation", () => {
    it("accepts and preserves ordinary objects", () => {
      const Values = record(String, Number);
      const input: unknown = { first: 1, second: 2 };
      const result = Values.fromUnknown(input);

      assertOk(result, { first: 1, second: 2 });
      assertSame(result.value, input);
      assertSame(
        globalThis.Object.getPrototypeOf(result.value),
        globalThis.Object.prototype,
      );
      assertTrue(Values.is(input));
      assertTrue(Values.is(result.value));
      assertEqual(Values.from(result.value), ok(result.value));
      assertSame(Values.to(result.value), result.value);

      const first: number | undefined = result.value.first;
      assertEqual(first, 1);
    });

    it("ignores inherited properties", () => {
      const Values = record(literal("toString"), Number);
      const input = {};
      const result = Values.fromUnknown(input);

      assertOk(result, input);
      assertSame(result.value, input);
      assertFalse(globalThis.Object.hasOwn(result.value, "toString"));
      assertTrue(Values.is(input));
      assertOk(Values.from(result.value), input);
      assertSame(Values.to(result.value), input);

      const value: number | undefined = result.value.toString;
      assertType<typeof value, number | undefined>();
      assertEqual(typeof value, "function");
    });

    it("rejects class instances and custom prototypes", () => {
      const Values = record(String, Number);
      class ValueRecord {
        readonly [key: string]: number;
        readonly value = 1;
      }
      const instance = new ValueRecord();
      let inheritedReads = 0;
      const customPrototype = globalThis.Object.assign(
        globalThis.Object.create({
          get inherited() {
            inheritedReads++;
            return 1;
          },
        }) as Record<string, number>,
        { value: 1 },
      );

      for (const input of [instance, customPrototype]) {
        assertFalse(Values.is(input));
        const result = Values.fromUnknown(input);
        assertErr(result, {
          type: "Record",
          reason: { kind: "NotPlainRecord", value: input },
        });
        assertAssertionError(
          () => Values.from(input),
          "Expected Record.",
          result.error,
        );
        assertAssertionError(
          () => Values.to(input),
          "Expected Record.",
          result.error,
        );
      }
      assertEqual(inheritedReads, 0);
    });

    it("rejects custom prototype chains rooted in Object or null", () => {
      const Values = record(String, String);

      for (const value of setupUnexpectedPrototypeValues()) {
        assertEqual(
          Values.fromUnknown(value),
          err({
            type: "Record",
            reason: { kind: "NotPlainRecord", value },
          }),
        );
        assertFalse(Values.is(value));
      }
    });

    it("preserves an unchanged null-prototype record", () => {
      const Values = record(String, Number);
      const input = createNullRecord({ first: 1 });
      const result = Values.fromUnknown(input);

      assertOk(result, input);
      assertSame(result.value, input);
      assertTrue(Values.is(input));
    });

    it("accepts an Output after ordinary object spread", () => {
      const Values = record(literal("toString"), Number);
      const output = getOrThrow(Values.fromUnknown(createNullRecord({})));
      const spread = { ...output };

      assertSame(
        globalThis.Object.getPrototypeOf(spread),
        globalThis.Object.prototype,
      );
      assertFalse(globalThis.Object.hasOwn(spread, "toString"));
      assertTrue(Values.is(spread));
      assertOk(Values.from(spread), spread);
      assertSame(Values.to(spread), spread);
    });

    it("rejects non-enumerable properties from unknown", () => {
      const Values = record(String, Number);
      const input = globalThis.Object.defineProperty(
        globalThis.Object.create(null) as Record<string, number>,
        "value",
        { value: 1 },
      );
      const result = Values.fromUnknown(input);

      assertErr(result, {
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [{ kind: "NonEnumerable", key: "value" }],
        },
      });
      assertFalse(Values.is(input));
      assertAssertionError(
        () => Values.from(input),
        "Expected Record.",
        result.error,
      );
      assertAssertionError(
        () => Values.to(input),
        "Expected Record.",
        result.error,
      );
    });

    it("rejects non-plain values and accessors without reading them", () => {
      const Values = record(String, Number);
      let reads = 0;
      const accessor = globalThis.Object.defineProperty(
        globalThis.Object.create(null) as Record<string, unknown>,
        "value",
        {
          enumerable: true,
          get: () => {
            reads++;
            return 1;
          },
        },
      );

      assertEqual(
        Values.fromUnknown(null),
        err({
          type: "Record",
          reason: { kind: "NotRecord", value: null },
        }),
      );
      assertFalse(Values.is(null));
      assertEqual(
        Values.fromUnknown([]),
        err({
          type: "Record",
          reason: { kind: "NotPlainRecord", value: [] },
        }),
      );
      const result = Values.fromUnknown(accessor);

      assertErr(result, {
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [{ kind: "Accessor", key: "value" }],
        },
      });
      assertEqual(reads, 0);
      assertFalse(Values.is(accessor));
      assertAssertionError(
        () => Values.to(accessor as Record<string, number>),
        "Expected Record.",
        result.error,
      );
      assertEqual(reads, 0);
    });

    it("collects structural and value issues without reading accessors", () => {
      const Values = record(String, Number);
      const accessError = new Error("Access failed.");
      const input: Record<string, unknown> = {};
      let reads = 0;
      globalThis.Object.defineProperty(input, "first", {
        enumerable: true,
        get: () => {
          reads++;
          throw accessError;
        },
      });
      globalThis.Object.defineProperty(input, "second", {
        value: 2,
        enumerable: false,
      });
      input.third = "wrong";
      const accessorIssue = {
        kind: "Accessor" as const,
        key: "first",
      } satisfies RecordAccessorIssue;

      assertEqual(
        Values.fromUnknown(input),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [accessorIssue],
          },
        }),
      );
      const allErrors = {
        type: "Record" as const,
        reason: {
          kind: "Entries" as const,
          issues: [
            accessorIssue,
            {
              kind: "NonEnumerable" as const,
              key: "second",
            },
            {
              kind: "Value" as const,
              key: "third",
              error: {
                type: "TypeOf" as const,
                expected: "Number" as const,
                value: "wrong",
              },
            },
          ] as const,
        },
      };
      assertEqual(Values.fromUnknown(input, { errors: "all" }), err(allErrors));
      assertEqual(
        Values.formatError(allErrors),
        'A Record property "first" must be a data property.',
      );
      assertEqual(reads, 0);
    });

    it("does not read Symbol.toStringTag while rejecting the symbol key", () => {
      const Values = record(String, Number);
      let reads = 0;
      const value = globalThis.Object.defineProperty(
        {},
        globalThis.Symbol.toStringTag,
        {
          get: () => {
            reads++;
            throw new Error("Tag access failed.");
          },
        },
      );

      const result = Values.fromUnknown(value);

      assertEqual(
        result,
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key: globalThis.Symbol.toStringTag,
                error: {
                  type: "TypeOf",
                  expected: "String",
                  value: globalThis.Symbol.toStringTag,
                },
              },
            ],
          },
        }),
      );
      assertFalse(Values.is(value));
      assertEqual(reads, 0);
    });

    it("rejects symbol keys as key validation failures", () => {
      const Values = record(String, Number);
      const key = globalThis.Symbol("key");
      let reads = 0;
      const input = globalThis.Object.defineProperty({ value: 1 }, key, {
        get: () => {
          reads++;
          return "wrong";
        },
      });

      assertEqual(
        Values.fromUnknown(input),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key,
                error: {
                  type: "TypeOf",
                  expected: "String",
                  value: key,
                },
              },
            ],
          },
        }),
      );
      assertEqual(reads, 0);

      assertEqual(
        Values.fromUnknown(input, { errors: "all" }),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key,
                error: {
                  type: "TypeOf",
                  expected: "String",
                  value: key,
                },
              },
              {
                kind: "Accessor",
                key,
              },
            ],
          },
        }),
      );
      assertEqual(reads, 0);

      const canonical = createNullRecord({ value: 1 });
      Reflect.set(canonical, key, 2);
      assertFalse(Values.is(canonical));
      assertFalse(Values.is(input));
      assertEqual(reads, 0);
      assertFalse(Values.is(createNullRecord({ value: "wrong" })));
      assertFalse(
        record(literal("allowed"), Number).is(createNullRecord({ wrong: 1 })),
      );

      const output = createNullRecord({ value: 1 });
      Reflect.set(output, key, 2);
      const result = Values.fromUnknown(output);

      assertErr(result, {
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Key",
              key,
              error: {
                type: "TypeOf",
                expected: "String",
                value: key,
              },
            },
          ],
        },
      });
      assertAssertionError(
        () => Values.to(output),
        "Expected Record.",
        result.error,
      );
    });

    it("collects key and value issues in own-key order", () => {
      const Values = record(literal("allowed"), Number);
      const input = { wrong: "x", allowed: "y" };

      assertEqual(
        Values.fromUnknown(input),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key: "wrong",
                error: {
                  type: "Literal",
                  expected: "allowed",
                  value: "wrong",
                },
              },
            ],
          },
        }),
      );
      assertEqual(
        Values.fromUnknown(input, { errors: "all" }),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key: "wrong",
                error: {
                  type: "Literal",
                  expected: "allowed",
                  value: "wrong",
                },
              },
              {
                kind: "Value",
                key: "wrong",
                error: {
                  type: "TypeOf",
                  expected: "Number",
                  value: "x",
                },
              },
              {
                kind: "Value",
                key: "allowed",
                error: {
                  type: "TypeOf",
                  expected: "Number",
                  value: "y",
                },
              },
            ],
          },
        }),
      );
      assertEqual(
        record(String, Number).fromUnknown({ value: "wrong" }),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Value",
                key: "value",
                error: {
                  type: "TypeOf",
                  expected: "Number",
                  value: "wrong",
                },
              },
            ],
          },
        }),
      );
    });

    it("handles __proto__ as an ordinary data key", () => {
      const Values = record(String, Number);
      const input = globalThis.Object.defineProperty({}, "__proto__", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 1,
      });
      const result = Values.fromUnknown(input);

      assertOk(result, input);
      assertSame(result.value, input);
      assertSame(
        globalThis.Object.getPrototypeOf(result.value),
        globalThis.Object.prototype,
      );
      assertTrue(globalThis.Object.hasOwn(result.value, "__proto__"));
      assertEqual(result.value.__proto__, 1);
    });
  });

  describe("transformations and composition", () => {
    it("transforms keys and values into a canonical record", () => {
      const { Values } = setupTransformedRecord();
      const result = Values.fromUnknown({ FIRST: "1", Second: "2" });

      assertOk(result, { first: 1, second: 2 });
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
      assertTrue(Values.is(result.value));

      const encoded = Values.to(result.value);
      assertEqual(encoded, { first: "1", second: "2" });
      assertSame(globalThis.Object.getPrototypeOf(encoded), null);
      assertEqual(Values.from.parent(encoded), ok(result.value));
    });

    it("preserves a record when composed encoders preserve every entry", () => {
      const Values = record(String, union(Number, String));
      const value = createNullRecord({ answer: 42 });

      assertSame(Values.to(value), value);
    });

    it("reports decoded-key collisions without overwriting entries", () => {
      const { Values } = setupTransformedRecord();
      const input = { A: "1", a: "2" };
      const expected = err({
        type: "Record" as const,
        reason: {
          kind: "Entries" as const,
          issues: [
            {
              kind: "Collision" as const,
              key: "a",
              previousKey: "A",
              outputKey: "a",
            },
          ] as const,
        },
      });

      assertEqual(Values.fromUnknown(input), expected);
      const typedInput = createNullRecord(input);
      assertEqual(Values.from.parent(typedInput), expected);
      assertEqual(
        Values.fromUnknown({ A: "wrong", a: "2" }, { errors: "all" }),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Value",
                key: "A",
                error: { type: "NumberFromString", value: "wrong" },
              },
              {
                kind: "Collision",
                key: "a",
                previousKey: "A",
                outputKey: "a",
              },
            ],
          },
        }),
      );
      const accessError = new Error("Access failed.");
      const accessorInput: Record<string, unknown> = {};
      let reads = 0;
      globalThis.Object.defineProperty(accessorInput, "A", {
        enumerable: true,
        get: () => {
          reads++;
          throw accessError;
        },
      });
      accessorInput.a = "2";
      assertEqual(
        Values.fromUnknown(accessorInput, { errors: "all" }),
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Accessor",
                key: "A",
              },
              {
                kind: "Collision",
                key: "a",
                previousKey: "A",
                outputKey: "a",
              },
            ],
          },
        }),
      );
      assertEqual(reads, 0);
      {
        const actual = Values.from.parent(typedInput);
        assertType<
          typeof actual,
          Result<typeof Values.Output, typeof Values.Error>
        >();
      }
    });

    it("preserves Record errors through child Types", () => {
      const { Values } = setupTransformedRecord();
      const Imported = brand("ImportedRecord", Values);
      const input = createNullRecord({ A: "1", a: "2" });
      const result = Imported.from.parent.parent(input);

      assertEqual(
        result,
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Collision",
                key: "a",
                previousKey: "A",
                outputKey: "a",
              },
            ],
          },
        }),
      );
      assertType<
        typeof result,
        Result<typeof Imported.Output, typeof Values.Error>
      >();

      const decoded = Values.orThrow(createNullRecord({ one: "1" }));
      assertOk(Imported.from.parent(decoded), decoded);
      {
        const actual = Imported.from.parent(decoded);
        assertType<typeof actual, Result<typeof Imported.Output>>();
      }
    });

    it("accepts ordinary Records at typed boundaries", () => {
      const Values = record(String, Number);
      const input: typeof Values.Output = { value: 1 };

      assertEqual(Values.from(input), ok(input));
      assertSame(Values.to(input), input);
      assertSame(Values.orThrow(input), input);
      assertSame(Values.orNull(input), input);

      const decoded = Values.fromUnknown(input);
      assertOk(decoded, input);
      assertSame(decoded.value, input);
    });

    it("asserts own data properties before typed operations", () => {
      const Values = record(String, Number);
      const accessError = new Error("Access failed.");
      const value = globalThis.Object.defineProperty(
        globalThis.Object.create(null) as Record<string, number>,
        "value",
        {
          enumerable: true,
          get: () => {
            throw accessError;
          },
        },
      );

      const result = Values.fromUnknown(value);

      assertErr(result, {
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [{ kind: "Accessor", key: "value" }],
        },
      });
      for (const operation of [
        () => Values.from(value),
        () => Values.orThrow(value),
        () => Values.orNull(value),
        () => Values.to(value),
      ]) {
        assertAssertionError(operation, "Expected Record.", result.error);
      }
      assertInstanceOf(accessError, Error);
    });
  });

  it("formats record, key, value, and collision errors", () => {
    const Values = record(literal("allowed"), Number);
    const Transformed = setupTransformedRecord().Values;

    assertEqual(
      Values.formatError({
        type: "Record",
        reason: { kind: "NotRecord", value: 1 },
      }),
      "A value 1 is not a Record.",
    );
    assertEqual(
      Values.formatError({
        type: "Record",
        reason: { kind: "NotPlainRecord", value: [] },
      }),
      "The value is an object, but a Record Output must be a plain object or have a null prototype.",
    );
    assertEqual(
      Values.formatError({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Key",
              key: "wrong",
              error: {
                type: "Literal",
                expected: "allowed",
                value: "wrong",
              },
            },
          ],
        },
      }),
      'The value "wrong" is not strictly equal to the expected literal: allowed.',
    );
    assertEqual(
      Values.formatError({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Value",
              key: "allowed",
              error: { type: "TypeOf", expected: "Number", value: "x" },
            },
          ],
        },
      }),
      'A value "x" is not a number.',
    );
    assertEqual(
      Values.formatError({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [{ kind: "Accessor", key: "allowed" }],
        },
      }),
      'A Record property "allowed" must be a data property.',
    );
    assertEqual(
      Values.formatError({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [{ kind: "NonEnumerable", key: "allowed" }],
        },
      }),
      'A Record property "allowed" must be enumerable.',
    );
    assertEqual(
      Transformed.formatError({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [
            {
              kind: "Collision",
              key: "a",
              previousKey: "A",
              outputKey: "a",
            },
          ],
        },
      }),
      'Record keys "A" and "a" decode to the same key "a".',
    );
  });
});

describe("optional", () => {
  it("creates a property descriptor that is not a Type", () => {
    const property = optional(String);

    assertSame(property.type, String);
    assertType<typeof property extends TypeNode ? true : false, false>();
  });
});

describe("object", () => {
  const setupValidatedObject = () => {
    const validations: Array<readonly [string, string | number]> = [];

    const NonEmpty = brand(
      "NonEmpty",
      String,
      (value) => {
        validations.push(["NonEmpty", value]);
        return value.length > 0 ? ok() : err({ type: "NonEmpty", value });
      },
      formatTestTypeError,
    );

    const Short = brand(
      "Short",
      NonEmpty,
      (value) => {
        validations.push(["Short", value]);
        return value.length <= 5 ? ok() : err({ type: "Short", value });
      },
      formatTestTypeError,
    );

    const Positive = brand(
      "Positive",
      Number,
      (value) => {
        validations.push(["Positive", value]);
        return value > 0 ? ok() : err({ type: "Positive", value });
      },
      formatTestTypeError,
    );

    const Model = object({
      title: Short,
      count: Positive,
      note: optional(String),
    });

    return { Model, NonEmpty, Positive, Short, validations };
  };

  describe("construction", () => {
    it("includes non-enumerable schema properties", () => {
      const props = { name: String };
      globalThis.Object.defineProperty(props, "name", {
        value: String,
        enumerable: false,
      });
      const Model = object(props);

      assertFalse(Model.is({}));
      assertEqual(
        Model.fromUnknown({}),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { name: { type: "ObjectMissingProperty" } },
          },
        }),
      );
      assertEqual(Model.fromUnknown({ name: "Ada" }), ok({ name: "Ada" }));
      assertSame(Model.props.name, String);
    });

    it("snapshots schema properties", () => {
      const props = { value: String };
      const Model = object(props);

      Reflect.set(props, "value", Number);

      assertFalse(globalThis.Object.is(Model.props, props));
      assertSame(Model.props.value, String);
      assertTrue(Model.is({ value: "text" }));
      assertFalse(Model.is({ value: 1 }));
    });

    it("rejects schema accessors without invoking them", () => {
      let reads = 0;
      const props = {
        get value() {
          reads++;
          return String;
        },
      };

      const error = assertThrowsInstanceOf(() => object(props), Error);
      assertTrue(
        error.message.includes(
          "Object schema properties must be own string-keyed data properties.",
        ),
      );
      assertEqual(reads, 0);
    });

    it("rejects inherited schema properties without invoking them", () => {
      // TypeScript sees inherited properties through structural typing, but
      // Object schema reflection snapshots only own data properties. Accepting
      // this schema would infer a required `value` while constructing an empty
      // runtime schema. We cannot simply walk the prototype safely: it may
      // contain constructors, methods, accessors with side effects, or
      // properties hidden by structural narrowing. Supporting that would
      // require a separately defined inheritance and accessor policy.
      let reads = 0;

      class Props {
        get value() {
          reads++;
          return String;
        }
      }

      const props: { readonly value: typeof String } = new Props();

      const error = assertThrowsInstanceOf(() => object(props), Error);
      assertTrue(
        error.message.includes(
          "Object schema properties must be own string-keyed data properties.",
        ),
      );
      assertEqual(reads, 0);
    });

    it("rejects schema properties with custom prototype chains", () => {
      for (const value of setupUnexpectedPrototypeValues()) {
        const prototype = globalThis.Object.getPrototypeOf(value) as object;
        const props: { readonly name: typeof String } =
          globalThis.Object.assign(globalThis.Object.create(prototype), {
            name: String,
          });

        const error = assertThrowsInstanceOf(() => object(props), Error);
        assertTrue(
          error.message.includes(
            "Object schema properties must be own string-keyed data properties.",
          ),
        );
      }
    });

    it("rejects symbol schema properties without invoking them", () => {
      const key = globalThis.Symbol("value");
      let reads = 0;
      const props = globalThis.Object.defineProperty({ value: String }, key, {
        get: () => {
          reads++;
          return Number;
        },
      });

      const error = assertThrowsInstanceOf(() => object(props), Error);
      assertTrue(
        error.message.includes(
          "Object schema properties must be own string-keyed data properties.",
        ),
      );
      assertEqual(reads, 0);
    });

    it("accepts null-prototype schema properties", () => {
      const props = { value: String };
      globalThis.Object.setPrototypeOf(props, null);
      const Model = object(props);

      assertSame(Model.props.value, String);
      assertEqual(Model.fromUnknown({ value: "text" }), ok({ value: "text" }));
    });

    it("derives its properties, shapes, errors, and single root parent", () => {
      const {
        Model,
        NonEmpty: _NonEmpty,
        Positive,
        Short,
      } = setupValidatedObject();

      assertEqual(Model.name, "Object");
      assertSame(Model.props.title, Short);
      assertSame(Model.props.count, Positive);
      assertSame(Model.props.note.type, String);
      assertSame(Model.parent.props.title, String);
      assertSame(Model.parent.props.count, Number);
      assertSame(Model.parent.props.note.type, String);
      assertSame(Model.parent.parent, null);
      assertTrue("parent" in Model.from);
      assertType<
        "parent" extends keyof typeof Model.from ? true : false,
        true
      >();
      assertType<
        typeof Model extends ObjectType<{
          readonly title: typeof Short;
          readonly count: typeof Positive;
          readonly note: OptionalProperty<typeof String>;
        }>
          ? true
          : false,
        true
      >();
      assertType<
        typeof Model.Input,
        ExpectedStrictObject<
          { readonly title: string; readonly count: number },
          { readonly note: string }
        >
      >();
      assertType<
        typeof Model.Output,
        ExpectedStrictObject<
          {
            readonly title: typeof Short.Output;
            readonly count: typeof Positive.Output;
          },
          { readonly note: string }
        >
      >();
      assertType<typeof Model.parent.Output, typeof Model.Input>();
      assertType<
        typeof Model.Error,
        ObjectPropertiesError<{
          readonly title: typeof _NonEmpty.Error | typeof Short.Error;
          readonly count: typeof Positive.Error;
          readonly note: never;
        }>
      >();

      type PropertiesReason = Extract<
        InferErrors<typeof Model>["reason"],
        { readonly kind: "Properties" }
      >;
      type Errors = PropertiesReason["errors"];

      assertType<
        NonNullable<Errors["title"]>,
        | ObjectMissingPropertyError
        | ObjectPropertyAccessError
        | TypeOfError<"String">
        | typeof _NonEmpty.Error
        | typeof Short.Error
      >();
      assertType<
        NonNullable<Errors["count"]>,
        | ObjectMissingPropertyError
        | ObjectPropertyAccessError
        | TypeOfError<"Number">
        | typeof Positive.Error
      >();
      assertType<
        NonNullable<Errors["note"]>,
        ObjectPropertyAccessError | TypeOfError<"String">
      >();
      assertType<
        ObjectExcessPropertyError extends NonNullable<Errors["title"]>
          ? true
          : false,
        false
      >();

      assertType<
        {
          readonly type: "Object";
          readonly reason: {
            readonly kind: "Properties";
            readonly errors: {
              readonly unknown: ObjectExcessPropertyError;
            };
          };
        } extends InferErrors<typeof Model>
          ? true
          : false,
        true
      >();
    });

    it("creates a parent for optional-only refinements", () => {
      const Value = literal("value");
      const Model = object({ value: optional(Value) });
      const absent = {};

      assertSame(Model.parent.props.value.type, String);
      assertSame(Model.parent.parent, null);
      assertType<
        typeof Model.Error,
        ObjectPropertiesError<{
          readonly value: LiteralError<"value">;
        }>
      >();
      assertOk(Model.from(absent), absent);
      assertEqual(
        Model.from.parent({ value: "other" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: { type: "Literal", expected: "value", value: "other" },
            },
          },
        }),
      );
    });

    it("exposes readonly properties", () => {
      const props = { value: String, note: optional(Number) };
      const Model = object(props);
      const compileTimeAssertions = () => {
        // @ts-expect-error Object properties are readonly.
        Model.props.value = String;
        // @ts-expect-error Optional Object properties are readonly.
        Model.props.note = optional(Number);
        // @ts-expect-error The Type wrapped by an optional property is readonly.
        Model.props.note.type = Number;
      };

      assertType<typeof Model.props, Readonly<typeof props>>();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("composes declared properties with a Record", () => {
      const Values = record(String, Number);
      const Model = object({ count: Number }, Values);
      const _Open = object({}, Values);
      const otherRecord = record(String, Boolean);
      const restrictedKeys = record(literal("score"), Number);
      const ReversedString = transform("ReversedString", String, String, {
        from: (value) => ok(Array.from(value).toReversed().join("")),
        to: (value) => Array.from(value).toReversed().join(""),
      });
      const transformedKeys = record(ReversedString, Number);
      const NumberFromString = setupNumberFromString();
      const A = literal("a");
      const AFromString = transform("AFromString", String, A, {
        from: () => ok("a" as const),
        to: () => "not-a" as const,
      });
      const CompatibleAFromString = transform(
        "CompatibleAFromString",
        String,
        A,
        {
          from: () => ok("a" as const),
          to: () => "a" as const,
        },
      );
      const AValues = record(String, A);
      const CompatibleModel = object({ fixed: CompatibleAFromString }, AValues);
      const fakeRecord = {
        ...String,
        key: String,
        value: NumberFromString,
      };
      const numbersFromStrings = record(String, NumberFromString);
      const recordUnion = Math.random() > 0.5 ? Values : otherRecord;
      const erased: TypeNode = Values;
      const genericRecordAssertion = <
        Rest extends typeof Values | typeof otherRecord,
      >(
        rest: Rest,
      ): Rest => {
        // @ts-expect-error An unresolved generic could be instantiated with a Record Type union.
        object({}, rest);
        return rest;
      };
      const compileTimeAssertions = () => {
        object({ count: Number });
        object({ count: Number }, Values);
        // @ts-expect-error The second argument must be a Record Type.
        object({ count: Number }, {});
        // @ts-expect-error The Record Type must retain its concrete information.
        object({ count: Number }, erased);
        // @ts-expect-error The second argument requires one concrete Record Type.
        object({ count: Number }, recordUnion);
        // @ts-expect-error The Record key must be the predefined String Type.
        object({ count: Number }, restrictedKeys);
        // @ts-expect-error A string-to-string transformation is not the predefined String Type.
        object({ count: Number }, transformedKeys);
        // @ts-expect-error The second argument must be an actual Record Type.
        object({}, fakeRecord);
        // @ts-expect-error The declared Input must extend the Record value Input.
        object({ value: Number }, numbersFromStrings);
        // @ts-expect-error The declared Output must extend the Record value Output.
        object({ value: String }, numbersFromStrings);
        // @ts-expect-error The declared CanonicalInput must extend the Record value CanonicalInput.
        object({ fixed: AFromString }, AValues);
        // @ts-expect-error Undeclared properties must match the Record value Input.
        Model.from({ count: 0, other: "not a number" });
        // @ts-expect-error Undeclared properties must match the Record value Output.
        Model.to({ count: 0, other: "not a number" });
      };
      interface Errors {
        readonly count: TypeOfError<"Number">;
      }

      assertSame(Model.record, Values);
      assertType<
        typeof genericRecordAssertion extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
      assertSame(Model.parent, null);
      assertType<
        typeof Model extends ObjectType<
          { readonly count: typeof Number },
          typeof Values
        >
          ? true
          : false,
        true
      >();
      assertType<(typeof Model.Input)["count"], number>();
      assertType<(typeof Model.Input)["other"], number | undefined>();
      assertType<typeof Model.Output, typeof Model.Input>();
      assertType<
        typeof _Open.Output,
        Readonly<Partial<Record<string, number>>>
      >();
      assertEqual(
        CompatibleModel.to(CompatibleModel.orThrow({ fixed: "input" })),
        { fixed: "a" },
      );
      assertType<
        typeof Model.Error,
        ObjectError<
          Errors,
          | ObjectPropertyAccessError
          | RecordEntriesError<
              TypeOfError<"String">,
              TypeOfError<"Number">,
              never
            >
        >
      >();
      assertType<
        ObjectExcessPropertyError extends InferErrors<typeof Model>
          ? true
          : false,
        false
      >();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("rejects every property in an empty schema", () => {
      const Model = object({});
      const symbol = globalThis.Symbol();
      const value = { anything: 1 };
      const compileTimeAssertions = () => {
        Model.from({ [symbol]: true });
        Model.to({ [symbol]: true });
        // @ts-expect-error Object.from requires an object value.
        Model.from(42);
        // @ts-expect-error An empty Object schema has no properties.
        Model.from(value);
      };

      assertType<typeof Model.Input, Readonly<Record<string, never>>>();
      assertType<typeof Model.Output, Readonly<Record<string, never>>>();
      assertType<
        typeof Model.Error,
        ObjectError<Readonly<Record<never, never>>>
      >();
      assertType<
        InferErrors<typeof Model>,
        ObjectError<Readonly<Record<never, never>>>
      >();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
      assertEqual(
        Model.fromUnknown(value),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { anything: { type: "ObjectExcessProperty" } },
          },
        }),
      );
      assertFalse(Model.is(value));
      assertTrue(Model.is({}));

      const empty = {};
      const result = Model.from(empty);
      assertOk(result, empty);
      assertSame(result.value, empty);
    });

    it("creates a parent that validates only structural property inputs", () => {
      const { Model, validations } = setupValidatedObject();
      const value = { title: "", count: 0 };
      const result = Model.parent.fromUnknown(value, { errors: "all" });

      assertOk(result, value);
      assertSame(result.value, value);
      assertEqual(validations, []);
    });

    it("uses Union input boundaries in its parent", () => {
      const Value = union(literal("value"), Number);
      const Model = object({ value: Value });
      const encoded = { value: "other" };

      assertSame(Model.parent.props.value, Value.parent);
      assertType<typeof Model.parent.Output, typeof Model.Input>();
      assertOk(Model.parent.fromUnknown(encoded), encoded);
      assertEqual(
        Model.parent.fromUnknown({ value: true }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: {
                type: "Union",
                errors: [
                  {
                    index: 0,
                    error: {
                      type: "TypeOf",
                      expected: "String",
                      value: true,
                    },
                  },
                ],
              },
            },
          },
        }),
      );
      assertEqual(
        Model.fromUnknown(encoded),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: {
                type: "Union",
                errors: [
                  {
                    index: 0,
                    error: {
                      type: "Literal",
                      expected: "value",
                      value: "other",
                    },
                  },
                ],
              },
            },
          },
        }),
      );
    });

    it("rejects a union of property Types", () => {
      type Property = typeof String | typeof Number;
      type OptionalParameter = Parameters<typeof optional<Property>>[0];
      const property = String as Property;
      const optionalProperty: OptionalProperty<Property> = optional(String);
      const requiredOrOptional = String as
        typeof String | OptionalProperty<typeof String>;
      const genericCompileTimeAssertion = <
        Property extends typeof String | typeof Number,
      >(
        genericProperty: Property,
      ): Property => {
        // @ts-expect-error An unresolved generic could be instantiated with a property Type union.
        object({ value: genericProperty });
        // @ts-expect-error typed preserves Object property validation.
        typed("Generic", { value: genericProperty });
        return genericProperty;
      };
      const compileTimeAssertions = () => {
        // @ts-expect-error A property requires one concrete Type node.
        object({ value: property });
        // @ts-expect-error An optional property requires one concrete Type node.
        optional(property);
        // @ts-expect-error An Object property requires one concrete wrapped Type node.
        object({ value: optionalProperty });
        // @ts-expect-error Requiredness must not depend on a runtime union.
        object({ value: requiredOrOptional });
      };

      assertType<Property extends OptionalParameter ? true : false, false>();
      assertType<
        typeof genericCompileTimeAssertion extends (
          ...args: Array<never>
        ) => unknown
          ? true
          : false,
        true
      >();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("rejects erased property Types and a union of schemas", () => {
      const type: FormattableTypeNode = String;
      const props =
        Math.random() > 0.5 ? { root: String } : { child: literal("child") };
      const baseProps = { value: String };
      const extendedProps = { value: String, extra: Number };
      const getSubsumedProps = (): typeof baseProps | typeof extendedProps =>
        Math.random() > 0.5 ? baseProps : extendedProps;
      const subsumedProps = getSubsumedProps();
      const compileTimeAssertions = () => {
        // @ts-expect-error Optional requires a property Type with concrete information.
        optional(type);
        // @ts-expect-error Object requires a property Type with a concrete parent.
        object({ value: type });
        // @ts-expect-error Object requires one concrete schema.
        object(props);
        // @ts-expect-error A structurally wider branch is still a schema union.
        object(subsumedProps);
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("rejects reserved structural error tags in property Types", () => {
      interface MissingError extends TypeError<"ObjectMissingProperty"> {
        readonly value: string;
      }

      interface AccessError extends TypeError<"ObjectPropertyAccess"> {
        readonly value: string;
      }

      interface ExcessError extends TypeError<"ObjectExcessProperty"> {
        readonly value: string;
      }

      const Missing = createType(
        "ObjectMissingProperty",
        String,
        (value): Result<string, MissingError> =>
          err({ type: "ObjectMissingProperty", value }),
        formatTestTypeError,
      );
      const MissingChild = brand("MissingChild", Missing);
      const Access = createType(
        "ObjectPropertyAccess",
        String,
        (value): Result<string, AccessError> =>
          err({ type: "ObjectPropertyAccess", value }),
        formatTestTypeError,
      );
      const Excess = createType(
        "ObjectExcessProperty",
        String,
        (value): Result<string, ExcessError> =>
          err({ type: "ObjectExcessProperty", value }),
        formatTestTypeError,
      );
      const ExcessChild = brand("ExcessChild", Excess);
      const compileTimeAssertions = () => {
        // @ts-expect-error ObjectMissingProperty is reserved for Object structure.
        object({ value: Missing });
        // @ts-expect-error Reserved errors are rejected for optional properties too.
        object({ value: optional(Missing) });
        // @ts-expect-error Inherited reserved errors are rejected.
        object({ value: MissingChild });
        // @ts-expect-error ObjectPropertyAccess is reserved for Object structure.
        object({ value: Access });
        // @ts-expect-error ObjectPropertyAccess is also reserved for optional properties.
        object({ value: optional(Access) });
        // @ts-expect-error ObjectExcessProperty is reserved through child Types and optional properties.
        object({ value: optional(ExcessChild) });
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("requires a fixed set of string property names", () => {
      const broad: Record<string, typeof String> = { value: String };
      const pattern = { "value-test": String } as Record<
        `value-${string}`,
        typeof String
      >;
      const fixedAndPattern: Readonly<
        { value: typeof String } & Record<`extra-${string}`, typeof Number>
      > = { value: String, "extra-test": Number };
      const symbol = globalThis.Symbol();
      const number = { 0: String };
      const proto = { ["__proto__"]: String };
      const compileTimeAssertions = () => {
        // @ts-expect-error Broad keys belong to a Record Type.
        object(broad);
        // @ts-expect-error Template-pattern keys belong to a Record Type.
        object(pattern);
        // @ts-expect-error Template-pattern keys remain dynamic beside fixed keys.
        object(fixedAndPattern);
        // @ts-expect-error Symbol keys are not Object property names.
        object({
          [symbol]: String,
        });
        // @ts-expect-error Number keys are not Object property names.
        object(number);
        // @ts-expect-error __proto__ is not an Object property name.
        object(proto);
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("composition", () => {
    it("decodes and encodes declared properties at typed boundaries", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ age: NumberFromString });
      const encoded = { age: "42" };
      const output = { age: 42 };

      const fromResult = Model.from.parent(encoded);
      const toResult = Model.to(output);

      assertOk(fromResult, output);
      assertFalse(globalThis.Object.is(fromResult.value, encoded));
      assertEqual(toResult, encoded);
      assertFalse(globalThis.Object.is(toResult, output));
      assertTrue(Model.is({ age: 42 }));
      assertFalse(Model.is({ age: "42" }));
      assertType<
        typeof Model.Input,
        ExpectedStrictObject<{ readonly age: string }>
      >();
      assertType<
        typeof Model.Output,
        ExpectedStrictObject<{ readonly age: number }>
      >();
    });

    it("accepts ordinary Record properties through typed operations", () => {
      const Model = object({ values: record(String, Number) });
      const input = { values: { one: 1 } };
      const fromUnknownResult = Model.fromUnknown(input);

      assertOk(fromUnknownResult, input);
      const output = fromUnknownResult.value;
      assertSame(Model.parent, null);
      assertFalse("parent" in Model.from);
      assertTrue(Model.is(input));
      assertSame(output, input);
      assertSame(output.values, input.values);
      assertTrue(Model.is(output));
      assertEqual(Model.from(input), ok(input));
      assertSame(Model.to(input), input);
      assertSame(Model.orThrow(input), input);
      assertSame(Model.orNull(input), input);
    });

    it("transforms Record properties across Object and child operations", () => {
      const NumberFromString = setupNumberFromString();
      const Values = record(String, NumberFromString);
      const Model = object({ count: NumberFromString }, Values);
      const Imported = brand("Imported", Model);
      const encoded = { count: "2", score: "1" };
      const output = { count: 2, score: 1 };

      assertEqual(Model.fromUnknown(encoded), ok(output));
      assertEqual(Model.from.parent(encoded), ok(output));
      assertEqual(Model.orThrow(encoded), output);
      assertEqual(Model.orNull(encoded), output);
      assertEqual(Model.to(output), encoded);
      assertEqual(Model.parent.fromUnknown(encoded), ok(encoded));
      assertEqual(Imported.from.parent.parent(encoded), ok(output));
      assertTrue(Model.is(output));
      assertFalse(Model.is(encoded));
      assertSame(Model.record, Values);
      assertSame(Model.parent.record, Values.parent);
      assertType<(typeof Model.Output)["count"], number>();
      assertType<
        typeof Model.Output,
        { readonly count: number } & Readonly<Partial<Record<string, number>>>
      >();

      assertEqual(
        Model.from.parent({ count: "2", score: "no" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              score: {
                type: "Record",
                reason: {
                  kind: "Entries",
                  issues: [
                    {
                      kind: "Value",
                      key: "score",
                      error: { type: "NumberFromString", value: "no" },
                    },
                  ],
                },
              },
            },
          },
        }),
      );
      assertEqual(
        Model.from.parent({ count: "no", score: "also no" }, { errors: "all" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              count: { type: "NumberFromString", value: "no" },
              score: {
                type: "Record",
                reason: {
                  kind: "Entries",
                  issues: [
                    {
                      kind: "Value",
                      key: "score",
                      error: {
                        type: "NumberFromString",
                        value: "also no",
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      );
    });

    it("preserves dynamic values when composed operations are identities", () => {
      const Model = object({}, record(String, union(Number, String)));
      const value = { answer: 42 };

      const result = Model.from.parent(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertSame(Model.to(value), value);
    });

    it("preserves ordinary root Record values accepted by a Record", () => {
      const Model = object({}, record(String, record(String, Number)));
      const input = { values: { one: 1 } };
      const result = Model.fromUnknown(input);

      assertOk(result, input);
      assertSame(result.value, input);
      assertSame(result.value.values, input.values);
      assertTrue(Model.is(result.value));
    });

    it("constructs null-prototype decoded and encoded objects", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({
        name: String,
        age: NumberFromString,
      });
      const encoded: Record<string, unknown> = {};
      globalThis.Object.defineProperties(encoded, {
        name: {
          configurable: false,
          enumerable: true,
          value: "Ada",
          writable: false,
        },
        age: {
          configurable: false,
          enumerable: true,
          value: "42",
          writable: false,
        },
      });

      const result = Model.fromUnknown(encoded);

      assertOk(result, { name: "Ada", age: 42 });
      assertFalse(globalThis.Object.is(result.value, encoded));
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
      assertEqual(
        globalThis.Object.getOwnPropertyDescriptor(result.value, "name"),
        {
          configurable: true,
          enumerable: true,
          value: "Ada",
          writable: true,
        },
      );
      assertEqual(
        globalThis.Object.getOwnPropertyDescriptor(result.value, "age"),
        {
          configurable: true,
          enumerable: true,
          value: 42,
          writable: true,
        },
      );
      assertTrue(Model.is(result.value));

      const reencoded = Model.to(result.value);

      assertFalse(globalThis.Object.is(reencoded, result.value));
      assertSame(globalThis.Object.getPrototypeOf(reencoded), null);
      assertEqual(
        globalThis.Object.getOwnPropertyDescriptor(reencoded, "name"),
        {
          configurable: true,
          enumerable: true,
          value: "Ada",
          writable: true,
        },
      );
      assertEqual(
        globalThis.Object.getOwnPropertyDescriptor(reencoded, "age"),
        {
          configurable: true,
          enumerable: true,
          value: "42",
          writable: true,
        },
      );
      assertTrue(Model.parent.is(reencoded));
    });

    it("does not reread validated descriptors while constructing a decoded object", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({
        name: String,
        age: NumberFromString,
      });
      let nameDescriptorReads = 0;
      const input = new Proxy(
        { name: "Ada", age: "42" },
        {
          getOwnPropertyDescriptor: (target, key) => {
            const descriptor = globalThis.Object.getOwnPropertyDescriptor(
              target,
              key,
            );

            if (key !== "name" || descriptor === undefined) return descriptor;

            nameDescriptorReads++;
            return nameDescriptorReads === 1
              ? descriptor
              : { ...descriptor, value: 42 };
          },
        },
      );

      const result = Model.fromUnknown(input);

      assertOk(result, { name: "Ada", age: 42 });
      assertEqual(nameDescriptorReads, 1);
      assertFalse(globalThis.Object.is(result.value, input));
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
      assertTrue(Model.is(result.value));
    });

    it("rejects class instances instead of stripping their prototype", () => {
      class User {
        readonly #secret = "secret";
        readonly age = "42";

        getSecret(): string {
          return this.#secret;
        }
      }

      const NumberFromString = setupNumberFromString();
      const Model = object({ age: NumberFromString });
      const user = new User();
      const result = Model.fromUnknown(user);

      assertEqual(user.getSecret(), "secret");
      assertEqual(
        result,
        err({
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value: user },
        }),
      );
      assertFalse(Model.is(user));
    });

    it("rejects custom prototype chains", () => {
      const Model = object({ type: literal("Created"), name: String });

      for (const value of setupUnexpectedPrototypeValues()) {
        assertEqual(
          Model.fromUnknown(value),
          err({
            type: "Object",
            reason: { kind: "UnexpectedPrototype", value },
          }),
        );
        assertFalse(Model.is(value));
      }
    });

    it("rejects declared accessors without reading them", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ age: NumberFromString });
      let reads = 0;
      const encoded = globalThis.Object.defineProperty({}, "age", {
        configurable: true,
        enumerable: true,
        get: () => (++reads === 1 ? "42" : 42),
      });

      const result = Model.fromUnknown(encoded);

      assertEqual(
        result,
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              age: { type: "ObjectPropertyAccess", reason: "Accessor" },
            },
          },
        }),
      );
      assertEqual(reads, 0);
    });

    it("locates decoding transformation errors by property", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ age: NumberFromString });

      assertEqual(
        Model.from.parent({ age: "no" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              age: {
                type: "NumberFromString",
                value: "no",
              },
            },
          },
        }),
      );
    });

    it("decodes and encodes an optional transformed property", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ value: optional(NumberFromString) });
      const absent = {};
      const encoded = { value: "42" };
      const output = { value: 42 };
      const absentResult = Model.fromUnknown(absent);
      const result = Model.from.parent(encoded);
      const reencoded = Model.to(output);

      assertOk(absentResult, absent);
      assertSame(absentResult.value, absent);
      assertOk(result, output);
      assertFalse(globalThis.Object.is(result.value, encoded));
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
      assertEqual(reencoded, encoded);
      assertSame(globalThis.Object.getPrototypeOf(reencoded), null);
      assertEqual(
        Model.from.parent({ value: "no" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: { type: "NumberFromString", value: "no" },
            },
          },
        }),
      );
      assertType<
        typeof Model.Input,
        ExpectedStrictObject<
          Readonly<Record<never, never>>,
          { readonly value: string }
        >
      >();
      assertType<
        typeof Model.Output,
        ExpectedStrictObject<
          Readonly<Record<never, never>>,
          { readonly value: number }
        >
      >();
    });

    it("keeps an earlier absent optional property absent while decoding a later property", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({
        note: optional(String),
        value: NumberFromString,
      });

      const result = Model.fromUnknown({ value: "42" });

      assertOk(result, { value: 42 });
      assertFalse(globalThis.Object.hasOwn(result.value, "note"));
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
    });

    it("preserves a null prototype while transforming typed values", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({
        toString: optional(String),
        value: NumberFromString,
      });
      // Equivalent to assigning `value` to `Object.create(null)`, so
      // `toString` is absent instead of inherited.
      const unknownInput: unknown = globalThis.Object.setPrototypeOf(
        { value: "42" },
        null,
      );
      const input = getOrThrow(Model.parent.fromUnknown(unknownInput));

      const result = Model.from.parent(input);

      assertOk(result, { value: 42 });
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
      assertTrue(Model.is(result.value));

      const encoded = Model.to(result.value);

      assertEqual(encoded, input);
      assertSame(globalThis.Object.getPrototypeOf(encoded), null);
      assertTrue(Model.parent.is(encoded));
    });

    it("accepts a Union Type as a property Type", () => {
      const Value = union(String, Number);
      const Model = object({ value: Value, optionalValue: optional(Value) });

      assertSame(Model.props.value, Value);
      assertSame(Model.props.optionalValue.type, Value);
      assertType<
        typeof Model.Output,
        ExpectedStrictObject<
          { readonly value: string | number },
          { readonly optionalValue: string | number }
        >
      >();
    });

    it("accepts an Object Type as a property Type", () => {
      const Profile = object({ name: String });
      const Model = object({ profile: Profile });
      const value = { profile: { name: "Ada" } };

      assertOk(Model.fromUnknown(value), value);
      assertType<
        typeof Model.Output,
        ExpectedStrictObject<{
          readonly profile: ExpectedStrictObject<{
            readonly name: string;
          }>;
        }>
      >();
    });

    it("forwards property errors through a child Type", () => {
      const {
        Model,
        NonEmpty: _NonEmpty,
        Positive: _Positive,
        Short: _Short,
      } = setupValidatedObject();
      const ImportedModel = brand("ImportedModel", Model);

      const result = ImportedModel.from.parent.parent(
        { title: "", count: 0 },
        { errors: "all" },
      );

      assertErr(result, {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            title: { type: "NonEmpty", value: "" },
            count: { type: "Positive", value: 0 },
          },
        },
      });
      type Errors = typeof result.error.reason.errors;

      assertType<
        NonNullable<Errors["title"]>,
        typeof _NonEmpty.Error | typeof _Short.Error
      >();
      assertType<NonNullable<Errors["count"]>, typeof _Positive.Error>();
    });

    it("keeps a fallible child error outside inherited Object errors", () => {
      const {
        Model,
        NonEmpty: _NonEmpty,
        Positive: _Positive,
        Short: _Short,
      } = setupValidatedObject();

      interface ImportedModelError extends TypeError<"ImportedModel"> {
        readonly value: typeof Model.Output;
      }

      const ImportedModel = createType(
        "ImportedModel",
        Model,
        (value): Result<typeof Model.Output, ImportedModelError> =>
          value.count >= 2 ? ok(value) : err({ type: "ImportedModel", value }),
        formatTestTypeError,
      );
      const ReimportedModel = brand("ReimportedModel", ImportedModel);
      const inheritedResult = ReimportedModel.from.parent.parent.parent(
        { title: "", count: 0 },
        { errors: "all" },
      );
      const ownResult = ReimportedModel.from.parent.parent.parent({
        title: "value",
        count: 1,
      });
      type ParentError = ObjectPropertiesError<{
        readonly title: typeof _NonEmpty.Error | typeof _Short.Error;
        readonly count: typeof _Positive.Error;
        readonly note: never;
      }>;
      type Error = ImportedModelError | ParentError;

      assertType<
        typeof inheritedResult,
        Result<typeof ReimportedModel.Output, Error>
      >();
      assertType<
        typeof ownResult,
        Result<typeof ReimportedModel.Output, Error>
      >();
      assertType<
        ReturnType<typeof ReimportedModel.from.parent>,
        Result<typeof ReimportedModel.Output>
      >();
      assertType<
        ReturnType<typeof ReimportedModel.from.parent.parent>,
        Result<typeof ReimportedModel.Output, ImportedModelError>
      >();
      assertEqual(
        inheritedResult,
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              title: { type: "NonEmpty", value: "" },
              count: { type: "Positive", value: 0 },
            },
          },
        }),
      );
      assertEqual(
        ownResult,
        err({
          type: "ImportedModel",
          value: { title: "value", count: 1 },
        }),
      );
    });
  });

  describe("formatError", () => {
    it("formats root or first property errors without a path", () => {
      const Model = object({ name: String, age: optional(Number) });
      const NestedModel = object({ values: array(Number) });
      const RecordModel = object({ score: Number }, record(String, Number));

      assertEqual(
        Model.formatError({
          type: "Object",
          reason: { kind: "NotObject", value: null },
        }),
        "A value null is not an object.",
      );
      assertEqual(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "UnexpectedPrototype",
            value: new globalThis.Date(),
          },
        }),
        "The value is an object, but an Object Output must be a plain object or have a null prototype.",
      );
      assertEqual(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { role: { type: "ObjectExcessProperty" } },
          },
        }),
        'The property "role" is not allowed. Remove it or use a different Type.',
      );
      assertEqual(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { name: { type: "ObjectMissingProperty" } },
          },
        }),
        'The required property "name" is missing.',
      );
      assertEqual(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              age: { type: "ObjectPropertyAccess", reason: "Accessor" },
            },
          },
        }),
        "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      );
      assertEqual(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              age: {
                type: "ObjectPropertyAccess",
                reason: "NonEnumerable",
              },
            },
          },
        }),
        "An Object property must be enumerable. Make it enumerable or use a different Type.",
      );
      assertEqual(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              age: { type: "TypeOf", expected: "Number", value: "42" },
            },
          },
        }),
        'A value "42" is not a number.',
      );
      assertEqual(
        NestedModel.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              values: {
                type: "Array",
                reason: {
                  kind: "Items",
                  issues: [
                    {
                      kind: "Element",
                      index: 1,
                      error: {
                        type: "TypeOf",
                        expected: "Number",
                        value: "2",
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
        'A value "2" is not a number.',
      );
      assertEqual(
        RecordModel.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              wrong: {
                type: "Record",
                reason: {
                  kind: "Entries",
                  issues: [
                    {
                      kind: "Value",
                      key: "wrong",
                      error: {
                        type: "TypeOf",
                        expected: "Number",
                        value: "wrong",
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
        'A value "wrong" is not a number.',
      );
      assertType<
        Parameters<typeof Model.formatError>[0],
        ObjectError<{
          readonly name: TypeOfError<"String">;
          readonly age?: TypeOfError<"Number">;
        }>
      >();
    });

    it("throws for an empty Properties error", () => {
      const Model = object({ name: String });

      const error = assertThrowsInstanceOf(
        () =>
          Model.formatError({
            type: "Object",
            reason: { kind: "Properties", errors: {} },
          }),
        Error,
      );
      assertTrue(error.message.includes("Expected value to be non-nullable."));
    });
  });

  describe("is", () => {
    it("ignores inherited optional properties in Outputs", () => {
      const Matching = object({ constructor: optional(Function) });
      const Invalid = object({ toString: optional(String) });

      assertTrue(Matching.is({}));
      assertTrue(Invalid.is({}));
    });

    it("accepts ordinary and null-prototype plain objects", () => {
      const Model = object({ name: String });
      const value = globalThis.Object.assign(globalThis.Object.create(null), {
        name: "Ada",
      });

      assertTrue(Model.is({ name: "Ada" }));
      assertTrue(Model.is(value));
    });

    it("requires own enumerable data properties", () => {
      const Model = object({ name: String });
      let reads = 0;
      const accessor = globalThis.Object.defineProperty({}, "name", {
        enumerable: true,
        get: () => {
          reads++;
          return "Ada";
        },
      });
      const nonEnumerable = globalThis.Object.defineProperty({}, "name", {
        value: "Ada",
      });

      assertFalse(Model.is(accessor));
      assertEqual(reads, 0);
      assertFalse(Model.is(nonEnumerable));
      assertTrue(Model.is(globalThis.Object.freeze({ name: "Ada" })));
    });

    it("requires dynamic properties to be enumerable data properties", () => {
      const Model = object({}, record(String, Number));
      const value = globalThis.Object.defineProperty({}, "score", {
        value: 1,
      });

      assertFalse(Model.is(value));
    });

    it("rejects invalid open-object shapes", () => {
      const Model = object({}, record(String, Number));

      assertFalse(Model.is(null));
      assertFalse(Model.is(1));
      assertFalse(Model.is({ score: "wrong" }));
    });

    it("does not read Symbol.toStringTag", () => {
      const Model = object({ name: String });
      let reads = 0;
      const value = globalThis.Object.defineProperty(
        { name: "Ada" },
        globalThis.Symbol.toStringTag,
        {
          get: () => {
            reads++;
            return "Object";
          },
        },
      );

      assertFalse(Model.is(value));
      assertEqual(reads, 0);
    });
  });

  describe("fromUnknown", () => {
    it("distinguishes required, optional, and undefined-accepting properties", () => {
      const Model = object({
        required: String,
        requiredUndefined: undefinedOr(String),
        optional: optional(String),
        optionalUndefined: optional(undefinedOr(String)),
      });
      const valid = { required: "value", requiredUndefined: undefined };
      const validWithOptionalUndefined = {
        ...valid,
        optionalUndefined: undefined,
      };

      assertOk(Model.fromUnknown(valid), valid);
      assertOk(
        Model.fromUnknown(validWithOptionalUndefined),
        validWithOptionalUndefined,
      );
      assertEqual(
        Model.fromUnknown({ required: "value" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              requiredUndefined: { type: "ObjectMissingProperty" },
            },
          },
        }),
      );
      assertEqual(
        Model.fromUnknown({
          ...valid,
          optional: undefined,
        }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              optional: {
                type: "TypeOf",
                expected: "String",
                value: undefined,
              },
            },
          },
        }),
      );
    });

    it("treats an inherited required property as missing", () => {
      const Model = object({ constructor: Function });
      const value = {};
      const result = Model.fromUnknown(value);

      assertEqual(
        result,
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              constructor: { type: "ObjectMissingProperty" },
            },
          },
        }),
      );
    });

    it("ignores inherited optional properties", () => {
      const Matching = object({ constructor: optional(Function) });
      const Invalid = object({ toString: optional(String) });
      const value = {};
      const matchingResult = Matching.fromUnknown(value);
      const invalidResult = Invalid.fromUnknown(value);

      assertOk(matchingResult, value);
      assertOk(invalidResult, value);
      assertSame(matchingResult.value, value);
      assertSame(invalidResult.value, value);
    });

    it("preserves absent optional properties on null-prototype objects", () => {
      const Model = object({ note: optional(String) });
      const value = globalThis.Object.create(null) as Record<string, unknown>;
      const result = Model.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
      assertTrue(Model.is(value));
      assertTrue(Model.is(result.value));
    });

    it("keeps an absent optional Object.prototype name absent", () => {
      const Model = object({ toString: optional(String) });
      const value = globalThis.Object.create(null) as Record<string, unknown>;
      const result = Model.fromUnknown(value);

      assertOk(result, value);
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
      assertFalse("toString" in result.value);
      assertTrue(Model.is(result.value));
    });

    it("rejects accepted accessors without invoking them", () => {
      const Declared = object({ value: String });
      const Rest = object({}, record(String, String));
      const accessError = new Error("Access failed.");
      let reads = 0;
      const value = globalThis.Object.defineProperty({}, "value", {
        enumerable: true,
        get: () => {
          reads++;
          throw accessError;
        },
      });
      const propertyError = {
        type: "Object" as const,
        reason: {
          kind: "Properties" as const,
          errors: {
            value: {
              type: "ObjectPropertyAccess" as const,
              reason: "Accessor" as const,
            },
          },
        },
      };
      const error = err(propertyError);

      assertEqual(Declared.fromUnknown(value), error);
      assertEqual(Rest.fromUnknown(value), error);
      assertEqual(
        Rest.formatError(propertyError),
        "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      );
      assertEqual(reads, 0);
      assertInstanceOf(accessError, Error);
    });

    it("continues after structural property errors when collecting all errors", () => {
      const Model = object({ first: String, second: Number });
      const accessError = new Error("Access failed.");
      let reads = 0;
      const value = globalThis.Object.defineProperty(
        { second: "wrong" },
        "first",
        {
          enumerable: true,
          get: () => {
            reads++;
            throw accessError;
          },
        },
      );

      assertEqual(
        Model.fromUnknown(value, { errors: "all" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              first: {
                type: "ObjectPropertyAccess",
                reason: "Accessor",
              },
              second: {
                type: "TypeOf",
                expected: "Number",
                value: "wrong",
              },
            },
          },
        }),
      );
      assertEqual(reads, 0);
      assertInstanceOf(accessError, Error);
    });

    it("does not read excess accessors", () => {
      const Model = object({ name: String });
      let ownReads = 0;
      const value = globalThis.Object.defineProperty({ name: "Ada" }, "own", {
        enumerable: true,
        get: () => {
          ownReads++;
          return "value";
        },
      });

      assertEqual(
        Model.fromUnknown(value, { errors: "all" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              own: { type: "ObjectExcessProperty" },
            },
          },
        }),
      );
      assertEqual(ownReads, 0);
    });

    it("rejects excess properties", () => {
      const Model = object({ name: String });
      const value: unknown = { name: "Ada", role: "admin" };

      assertEqual(
        Model.fromUnknown(value),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { role: { type: "ObjectExcessProperty" } },
          },
        }),
      );
      assertFalse(Model.is(value));
      assertTrue(Model.is({ name: "Ada" }));
    });

    it("rejects non-enumerable and symbol excess properties", () => {
      const Model = object({ name: String });
      const symbol = globalThis.Symbol("excess");
      const value = globalThis.Object.defineProperty(
        { name: "Ada", [symbol]: true },
        "hidden",
        { value: true },
      );
      const errors = createNullRecord({
        hidden: { type: "ObjectExcessProperty" as const },
        [symbol]: { type: "ObjectExcessProperty" as const },
      });

      const result = Model.fromUnknown(value, { errors: "all" });
      assertErr(result);
      assertSame(result.error.reason.kind, "Properties");
      assertEqual(result.error.reason.errors.hidden, errors.hidden);
      assertEqual(result.error.reason.errors[symbol], errors[symbol]);
      assertFalse(Model.is(value));
      assertEqual(Reflect.ownKeys(errors), ["hidden", symbol]);
    });

    it("rejects exotic declared and Record properties without reading them", () => {
      const Model = object({ count: Number }, record(String, Number));
      let reads = 0;
      const value = globalThis.Object.create(null) as Record<
        PropertyKey,
        unknown
      >;
      globalThis.Object.defineProperties(value, {
        count: {
          configurable: false,
          enumerable: false,
          value: 0,
          writable: false,
        },
        score: {
          configurable: true,
          enumerable: true,
          get: () => {
            reads++;
            return 1;
          },
        },
        hidden: {
          configurable: false,
          enumerable: false,
          value: 2,
          writable: false,
        },
      });

      const result = Model.fromUnknown(value);

      assertEqual(reads, 0);
      assertFalse(Model.is(value));
      assertEqual(
        result,
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              count: {
                type: "ObjectPropertyAccess",
                reason: "NonEnumerable",
              },
            },
          },
        }),
      );
      assertEqual(
        Model.fromUnknown(value, { errors: "all" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              count: {
                type: "ObjectPropertyAccess",
                reason: "NonEnumerable",
              },
              score: {
                type: "ObjectPropertyAccess",
                reason: "Accessor",
              },
              hidden: {
                type: "ObjectPropertyAccess",
                reason: "NonEnumerable",
              },
            },
          },
        }),
      );
      assertEqual(reads, 0);
    });

    it("collects declared and Record property errors", () => {
      const Model = object(
        { count: Number, age: Number },
        record(String, Number),
      );

      assertEqual(
        Model.fromUnknown(
          { count: "2", age: "42", wrong: "value" },
          { errors: "all" },
        ),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              count: { type: "TypeOf", expected: "Number", value: "2" },
              age: { type: "TypeOf", expected: "Number", value: "42" },
              wrong: {
                type: "Record",
                reason: {
                  kind: "Entries",
                  issues: [
                    {
                      kind: "Value",
                      key: "wrong",
                      error: {
                        type: "TypeOf",
                        expected: "Number",
                        value: "value",
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      );
    });

    it("reports symbol Record keys", () => {
      const Model = object({}, record(String, Number));
      const key = globalThis.Symbol("key");
      let reads = 0;
      const value = globalThis.Object.defineProperty({}, key, {
        get: () => {
          reads++;
          return "wrong";
        },
      });

      for (const result of [
        Model.fromUnknown(value),
        Model.fromUnknown(value, { errors: "all" }),
      ]) {
        assertErr(result);
        assertSame(result.error.reason.kind, "Properties");
        assertEqual(Reflect.ownKeys(result.error.reason.errors), [key]);
        assertEqual(result.error.reason.errors[key], {
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key,
                error: {
                  type: "TypeOf",
                  expected: "String",
                  value: key,
                },
              },
            ],
          },
        });
      }
      assertEqual(reads, 0);
      assertFalse(Model.is(value));
      assertEqual(reads, 0);
    });

    it("collects declared and excess property errors", () => {
      const Model = object({ name: String, age: Number });

      assertEqual(
        Model.fromUnknown(
          { name: 42, age: "42", role: "admin" },
          { errors: "all" },
        ),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              name: { type: "TypeOf", expected: "String", value: 42 },
              age: { type: "TypeOf", expected: "Number", value: "42" },
              role: { type: "ObjectExcessProperty" },
            },
          },
        }),
      );
    });

    it("returns root structural errors without reading Symbol.toStringTag", () => {
      const Model = object({ name: String });
      let reads = 0;
      const unreadableTag = globalThis.Object.defineProperty(
        { name: "Ada" },
        globalThis.Symbol.toStringTag,
        {
          get: () => {
            reads++;
            throw new Error("Tag access should not run.");
          },
        },
      );

      assertEqual(
        Model.fromUnknown(null),
        err({
          type: "Object",
          reason: { kind: "NotObject", value: null },
        }),
      );
      assertEqual(
        Model.fromUnknown([]),
        err({
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value: [] },
        }),
      );
      const result = Model.fromUnknown(unreadableTag);
      assertErr(result);
      assertSame(result.error.reason.kind, "Properties");
      assertEqual(Reflect.ownKeys(result.error.reason.errors), [
        globalThis.Symbol.toStringTag,
      ]);
      assertEqual(result.error.reason.errors[globalThis.Symbol.toStringTag], {
        type: "ObjectExcessProperty",
      });
      assertEqual(reads, 0);
    });

    it("returns only the first property error by default", () => {
      const Model = object({
        name: String,
        age: Number,
        active: optional(Boolean),
      });

      assertEqual(
        Model.fromUnknown({ age: "42", active: "yes", role: "admin" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { name: { type: "ObjectMissingProperty" } },
          },
        }),
      );
    });

    it("collects one error from every invalid property", () => {
      const Model = object({
        name: String,
        age: Number,
        active: optional(Boolean),
      });

      assertEqual(
        Model.fromUnknown(
          { name: 42, age: "42", active: "yes" },
          { errors: "all" },
        ),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              name: { type: "TypeOf", expected: "String", value: 42 },
              age: { type: "TypeOf", expected: "Number", value: "42" },
              active: {
                type: "TypeOf",
                expected: "Boolean",
                value: "yes",
              },
            },
          },
        }),
      );
    });

    it("collects structural, invalid, and missing property errors", () => {
      const Model = object({
        toString: optional(String),
        name: String,
        age: Number,
      });

      assertEqual(
        Model.fromUnknown({ name: 42 }, { errors: "all" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              name: { type: "TypeOf", expected: "String", value: 42 },
              age: { type: "ObjectMissingProperty" },
            },
          },
        }),
      );
    });

    it("collects root and refinement errors from different properties", () => {
      const { Model, validations } = setupValidatedObject();

      assertEqual(
        Model.fromUnknown({ title: 42, count: 0 }, { errors: "all" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              title: { type: "TypeOf", expected: "String", value: 42 },
              count: { type: "Positive", value: 0 },
            },
          },
        }),
      );
      assertEqual(validations, [["Positive", 0]]);
    });

    it("returns nested Array errors", () => {
      const Model = object({ values: array(Number) });

      const result = Model.fromUnknown({ values: [1, "2"] });

      assertEqual(
        result,
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              values: {
                type: "Array",
                reason: {
                  kind: "Items",
                  issues: [
                    {
                      kind: "Element",
                      index: 1,
                      error: {
                        type: "TypeOf",
                        expected: "Number",
                        value: "2",
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      );
    });
  });

  describe("from", () => {
    it("accepts its own Output", () => {
      const { Model, validations } = setupValidatedObject();
      const value = Model.orThrow({ title: "value", count: 1 });
      validations.length = 0;
      const result = Model.from(value);

      assertType<typeof result, Result<typeof Model.Output>>();
      assertOk(result, value);
      assertSame(result.value, value);
      assertEqual(validations, [
        ["NonEmpty", "value"],
        ["Short", "value"],
        ["Positive", 1],
      ]);
    });

    it("accepts closed and open Outputs after ordinary object spread", () => {
      const Closed = object({ toString: optional(String) });
      const Open = object(
        { toString: optional(String) },
        record(String, String),
      );
      const input = globalThis.Object.create(null) as Record<string, unknown>;
      const closed = getOrThrow(Closed.fromUnknown(input));
      const open = getOrThrow(Open.fromUnknown(input));
      const closedSpread = { ...closed };
      const openSpread = { ...open };

      for (const spread of [closedSpread, openSpread]) {
        assertSame(
          globalThis.Object.getPrototypeOf(spread),
          globalThis.Object.prototype,
        );
        assertFalse(globalThis.Object.hasOwn(spread, "toString"));
      }
      assertOk(Closed.from(closedSpread), closedSpread);
      assertOk(Open.from(openSpread), openSpread);
      assertSame(Closed.to(closedSpread), closedSpread);
      assertSame(Open.to(openSpread), openSpread);
    });

    it("asserts exact own properties", () => {
      const Model = object({ name: String });
      const value = { name: "Ada", searchWords: ["ada"] };
      const ownToString = globalThis.Object.defineProperty(
        { name: "Ada" },
        "toString",
        { enumerable: true, value: "own" },
      );

      const result = Model.fromUnknown(value);
      const ownToStringResult = Model.fromUnknown(ownToString);

      assertErr(result, {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            searchWords: { type: "ObjectExcessProperty" },
          },
        },
      });
      const ownToStringError = {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            toString: { type: "ObjectExcessProperty" },
          },
        },
      } as const;
      assertErr(ownToStringResult);
      assertEqual(ownToStringResult.error, ownToStringError);
      for (const operation of [
        () => Model.from(value),
        () => Model.to(value),
        () => Model.orThrow(value),
        () => Model.orNull(value),
      ]) {
        assertAssertionError(operation, "Expected Object.", result.error);
      }
      assertAssertionError(
        () => Model.to(ownToString),
        "Expected Object.",
        ownToStringResult.error,
      );
    });

    it("validates nested exact Outputs without decoding them", () => {
      const NumberFromString = setupNumberFromString();
      const Nested = object({ count: NumberFromString });
      const Model = object({ nested: Nested, label: String });
      const invalid = {
        nested: { count: 1 },
        label: 42,
      } as unknown as typeof Model.Output;

      assertAssertionError(() => Model.from(invalid), "Expected Object.", {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            label: { type: "TypeOf", expected: "String", value: 42 },
          },
        },
      });
    });

    it("validates every property chain from its parent in declaration order", () => {
      const {
        Model,
        Positive: _Positive,
        Short: _Short,
        validations,
      } = setupValidatedObject();
      const value = { title: "value", count: 1 };
      const result = Model.from.parent(value);

      if (!result.ok) {
        type Errors = typeof result.error.reason.errors;

        assertType<
          NonNullable<Errors["title"]>,
          typeof _Short.Error | typeof Model.props.title.parent.Error
        >();
        assertType<NonNullable<Errors["count"]>, typeof _Positive.Error>();
        assertType<NonNullable<Errors["note"]>, never>();
      }
      assertOk(result, value);
      assertSame(result.value, value);
      assertEqual(validations, [
        ["NonEmpty", "value"],
        ["Short", "value"],
        ["Positive", 1],
      ]);
    });

    it("collects remaining errors by property", () => {
      const { Model } = setupValidatedObject();

      assertEqual(
        Model.from.parent({ title: "too long", count: 0 }, { errors: "all" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              title: { type: "Short", value: "too long" },
              count: { type: "Positive", value: 0 },
            },
          },
        }),
      );
    });

    it("ignores inherited optional properties at typed boundaries", () => {
      const Model = object({ constructor: optional(literal("value")) });
      const input = {} as typeof Model.Output;

      assertOk(Model.from(input), input);
      assertSame(Model.orThrow(input), input);
      assertSame(Model.orNull(input), input);
      assertSame(Model.to(input), input);
    });
  });

  describe("root operations", () => {
    it("return the original valid object", () => {
      const Model = object({ name: String });
      const value = { name: "Ada" };
      const result = Model.from(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertSame(Model.to(value), value);
      assertSame(Model.parent, null);
      assertSame(Model.orThrow(value), value);
      assertSame(Model.orNull(value), value);
    });

    it("use ordinary structural Input and Output types", () => {
      const Model = object({ name: String });
      const symbol = globalThis.Symbol();
      const value = { name: "Ada", [symbol]: true };
      const compileTimeAssertions = () => {
        Model.from(value);
        Model.to(value);
      };

      assertType<
        typeof Model.Input extends {
          readonly name: string;
        }
          ? true
          : false,
        true
      >();
      assertType<
        { readonly name: string } extends typeof Model.Input ? true : false,
        true
      >();
      assertType<
        typeof Model.Output extends {
          readonly name: string;
        }
          ? true
          : false,
        true
      >();
      assertType<
        { readonly name: string } extends typeof Model.Output ? true : false,
        true
      >();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("return valid Object and Record values", () => {
      const Model = object({ count: Number }, record(String, Number));
      const value = { count: 0, score: 1 };

      const result = Model.from(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertSame(Model.to(value), value);
      assertSame(Model.orThrow(value), value);
      assertSame(Model.orNull(value), value);
      assertSame(Model.parent, null);
      assertTrue(Model.is(value));
    });

    it("accept arbitrary string properties through a Record", () => {
      const Model = object({}, record(String, Unknown));
      const value = { anything: 1 };

      assertOk(Model.fromUnknown(value), value);
      assertTrue(Model.is(value));
      assertType<
        typeof Model.Output,
        Readonly<Partial<Record<string, unknown>>>
      >();
    });
  });

  describe("schema helpers", () => {
    it("partial makes required properties optional and preserves optional properties", () => {
      const nickname = optional(String);
      const props = { name: String, nickname };
      const Model = partial(props);

      assertSame(Model.props.name.type, String);
      assertSame(Model.props.nickname, nickname);
      assertOk(Model.fromUnknown({}), {});
      assertOk(Model.fromUnknown({ name: "Ada" }), { name: "Ada" });
      assertFalse(Model.fromUnknown({ name: 1 }).ok);
      assertType<typeof Model, ObjectType<PartialObjectProps<typeof props>>>();
    });

    it("nullableToOptional makes only nullable Union properties optional", () => {
      const nickname = optional(String);
      const props = {
        name: nullOr(String),
        count: Number,
        nickname,
      };
      const Model = nullableToOptional(props);

      assertSame(Model.props.name.type, props.name);
      assertSame(Model.props.count, Number);
      assertSame(Model.props.nickname, nickname);
      assertOk(Model.fromUnknown({ count: 1 }), { count: 1 });
      assertOk(Model.fromUnknown({ name: null, count: 1 }), {
        name: null,
        count: 1,
      });
      assertFalse(Model.fromUnknown({ name: "Ada" }).ok);
      assertType<
        typeof Model,
        ObjectType<NullableToOptionalProps<typeof props>>
      >();
    });

    it("nullableToOptional recognizes literal null semantically", () => {
      const Value = union(null, String);
      const Model = nullableToOptional({ value: Value });
      const output: typeof Model.Output = {};

      assertSame(Model.props.value.type, Value);
      assertOk(Model.fromUnknown({}), {});
      assertOk(Model.from(output), output);
    });

    it("preserves Object schema validation", () => {
      const dynamic: Readonly<Record<string, typeof String>> = {
        name: String,
      };
      const uncertain = String as typeof String | typeof Number;
      const compileTimeAssertions = () => {
        // @ts-expect-error Partial Object properties require fixed keys.
        partial(dynamic);
        // @ts-expect-error Nullable Object properties require fixed keys.
        nullableToOptional(dynamic);
        // @ts-expect-error Partial Object properties require one concrete Type node.
        partial({ value: uncertain });
        // @ts-expect-error Nullable Object properties require one concrete Type node.
        nullableToOptional({ value: uncertain });
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("omit removes declared properties and preserves an Object Record", () => {
      const User = object({ name: String, age: Number });
      const WithoutAge = omit(User, "age");
      const WithoutNameAndAge = omit(User, "name", "age");
      const keys = ["name", "age"] as const;
      const Empty = omit(User, ...keys);

      assertEqual(WithoutAge.props, { name: String });
      assertOk(WithoutAge.fromUnknown({ name: "Ada" }), { name: "Ada" });
      assertFalse(WithoutAge.fromUnknown({ name: "Ada", age: 1 }).ok);
      assertType<
        typeof WithoutAge,
        ObjectType<{ readonly name: typeof String }>
      >();
      assertEqual(WithoutNameAndAge.props, {});
      assertOk(WithoutNameAndAge.fromUnknown({}), {});
      assertType<typeof WithoutNameAndAge, ObjectType<{}>>();
      assertEqual(Empty.props, {});
      assertType<typeof Empty, ObjectType<{}>>();

      const compileTimeAssertions = (
        key: "name" | "age",
        keys: ReadonlyArray<"name" | "age">,
      ) => {
        // @ts-expect-error A runtime key must identify one statically known property.
        omit(User, key);
        // @ts-expect-error A runtime array does not guarantee which properties are omitted.
        omit(User, ...keys);
      };

      const Metadata = object(
        { name: String, age: Number },
        record(String, Unknown),
      );
      const MetadataWithoutAge = omit(Metadata, "age");

      assertSame(MetadataWithoutAge.record, Metadata.record);
      assertType<
        typeof MetadataWithoutAge,
        ObjectType<
          { readonly name: typeof String },
          RecordType<typeof String, typeof Unknown>
        >
      >();
      assertOk(
        MetadataWithoutAge.fromUnknown({ name: "Ada", age: "unknown" }),
        { name: "Ada", age: "unknown" },
      );
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });
});

describe("result", () => {
  it("validates Ok and Err values", async () => {
    const StringResult = result(String, Number);
    const UndefinedResult = result(Undefined, Undefined);
    const Pair = tuple(String, Number);
    const PairResult = result(Pair, Pair);
    const NeverResult = result(Never, Never);
    const compileTimeAssertions = () => {
      // @ts-expect-error The exact ok discriminator must select the value branch.
      StringResult.from({ ok: false, value: "value" });
    };

    assertEqual(StringResult.name, "DiscriminatedUnion");
    assertEqual(StringResult.key, "ok");
    assertType<
      typeof StringResult,
      DiscriminatedUnionType<
        "ok",
        readonly [
          ObjectType<{
            readonly ok: LiteralType<true>;
            readonly value: typeof String;
          }>,
          ObjectType<{
            readonly ok: LiteralType<false>;
            readonly error: typeof Number;
          }>,
        ]
      >
    >();
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
    assertOk(StringResult.fromUnknown({ ok: true, value: "value" }), {
      ok: true,
      value: "value",
    });
    assertOk(StringResult.fromUnknown({ ok: false, error: 1 }), {
      ok: false,
      error: 1,
    });
    assertFalse(StringResult.fromUnknown({ ok: true, value: 1 }).ok);
    const missingValue = StringResult.fromUnknown({ ok: true });
    const notObject = StringResult.fromUnknown(null);
    const memberNotObject = StringResult.members[0].fromUnknown(null);
    const excessProperty = StringResult.fromUnknown({
      ok: true,
      value: "value",
      extra: true,
    });
    assertErr(missingValue);
    assertErr(notObject);
    assertErr(memberNotObject);
    assertErr(excessProperty);
    assertEqual(
      StringResult.formatError(missingValue.error),
      'The required property "value" is missing.',
    );
    assertEqual(
      StringResult.formatError(notObject.error),
      "A value null is not an object.",
    );
    assertEqual(
      StringResult.members[0].formatError(memberNotObject.error),
      "A value null is not an object.",
    );
    assertEqual(
      StringResult.formatError(excessProperty.error),
      'The property "extra" is not allowed. Remove it or use a different Type.',
    );
    assertEqual(
      await StringResult["~standard"].validate({ ok: true, extra: true }),
      {
        issues: [
          {
            message: 'The required property "value" is missing.',
            path: ["value"],
          },
          {
            message:
              'The property "extra" is not allowed. Remove it or use a different Type.',
            path: ["extra"],
          },
        ],
      },
    );
    assertOk(UndefinedResult.fromUnknown({ ok: true, value: undefined }), {
      ok: true,
      value: undefined,
    });
    assertOk(UndefinedResult.fromUnknown({ ok: false, error: undefined }), {
      ok: false,
      error: undefined,
    });
    assertOk(PairResult.fromUnknown({ ok: true, value: ["value", 1] }), {
      ok: true,
      value: ["value", 1],
    });
    assertOk(PairResult.fromUnknown({ ok: false, error: ["error", 2] }), {
      ok: false,
      error: ["error", 2],
    });
    assertFalse(NeverResult.fromUnknown({ ok: true, value: undefined }).ok);
    assertFalse(NeverResult.fromUnknown({ ok: false, error: undefined }).ok);

    assertType<
      typeof UnknownResult,
      DiscriminatedUnionType<
        "ok",
        readonly [
          ObjectType<{
            readonly ok: LiteralType<true>;
            readonly value: typeof Unknown;
          }>,
          ObjectType<{
            readonly ok: LiteralType<false>;
            readonly error: typeof Unknown;
          }>,
        ]
      >
    >();
    assertTrue(UnknownResult.is({ ok: true, value: undefined }));
    assertTrue(UnknownResult.is({ ok: false, error: undefined }));
    assertFalse(UnknownResult.is({ ok: true }));
  });
});

describe("typed", () => {
  describe("construction", () => {
    it("ExtractTyped selects only existing Typed union members", () => {
      const Create = typed("Create", { id: String });
      const Delete = typed("Delete", { id: String });
      const Message = discriminatedUnion(Create, Delete);
      type Message = typeof Message.Output;
      type CreateMessage = ExtractTyped<Message, "Create">;
      const compileTimeAssertions = () => {
        // @ts-expect-error The selected type must exist in the Output union.
        type Typo = ExtractTyped<Message, "Cretae">;
        assertType<Typo, never>();
      };

      assertType<CreateMessage, typeof Create.Output>();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("creates a strict Object with only a literal type property", () => {
      const Empty = typed("Empty");

      assertEqual(Empty.name, "Object");
      assertEqual(Empty.props.type.name, "Literal");
      assertEqual(Empty.props.type.expected, "Empty");
      assertSame(Empty.parent.props.type, String);
      assertSame(Empty.parent.parent, null);
      assertTrue("parent" in Empty.from);
      assertType<typeof Empty, TypedType<"Empty">>();
      assertType<
        typeof Empty.Input,
        ExpectedStrictObject<{ readonly type: string }>
      >();
      assertType<
        typeof Empty.Output,
        ExpectedStrictObject<{ readonly type: "Empty" }>
      >();
      assertType<
        typeof Empty.Output extends Typed<"Empty"> ? true : false,
        true
      >();
      assertType<
        typeof Empty.Error,
        ObjectPropertiesError<{ readonly type: LiteralError<"Empty"> }>
      >();
      assertType<
        typeof Empty.parent.Error,
        ObjectError<{
          readonly type: TypeOfError<"String">;
        }>
      >();
      assertType<
        InferErrors<typeof Empty>,
        ObjectError<{
          readonly type: TypeOfError<"String"> | LiteralError<"Empty">;
        }>
      >();

      assertEqual(
        Empty.parent.fromUnknown({ type: "Other" }),
        ok({ type: "Other" }),
      );
      assertEqual(
        Empty.from.parent({ type: "Other" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              type: { type: "Literal", expected: "Empty", value: "Other" },
            },
          },
        }),
      );
      assertEqual(Empty.fromUnknown({ type: "Empty" }), ok({ type: "Empty" }));
    });

    it("includes non-enumerable schema properties", () => {
      const props = { value: String };
      globalThis.Object.defineProperty(props, "value", {
        value: String,
        enumerable: false,
      });
      const Model = typed("Model", props);

      assertFalse(Model.is({ type: "Model" }));
      assertEqual(
        Model.fromUnknown({ type: "Model" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { value: { type: "ObjectMissingProperty" } },
          },
        }),
      );
      assertEqual(
        Model.fromUnknown({ type: "Model", value: "text" }),
        ok({ type: "Model", value: "text" }),
      );
      assertSame(Model.props.value, String);
    });

    it("snapshots schema properties", () => {
      const props = { value: String };
      const Model = typed("Model", props);

      Reflect.set(props, "value", Number);

      assertFalse(globalThis.Object.is(Model.props, props));
      assertSame(Model.props.value, String);
      assertTrue(Model.is({ type: "Model", value: "text" }));
      assertFalse(Model.is({ type: "Model", value: 1 }));
    });

    it("rejects schema accessors without invoking them", () => {
      let reads = 0;
      const props = {
        get value() {
          reads++;
          return String;
        },
      };

      const error = assertThrowsInstanceOf(() => typed("Model", props), Error);
      assertTrue(
        error.message.includes(
          "Object schema properties must be own string-keyed data properties.",
        ),
      );
      assertEqual(reads, 0);
    });

    it("rejects inherited schema properties without invoking them", () => {
      let reads = 0;

      class Props {
        get value() {
          reads++;
          return String;
        }
      }

      const props: { readonly value: typeof String } = new Props();

      const error = assertThrowsInstanceOf(() => typed("Model", props), Error);
      assertTrue(
        error.message.includes(
          "Object schema properties must be own string-keyed data properties.",
        ),
      );
      assertEqual(reads, 0);
    });

    it("rejects symbol schema properties without invoking them", () => {
      const key = globalThis.Symbol("value");
      let reads = 0;
      const props = globalThis.Object.defineProperty({ value: String }, key, {
        get: () => {
          reads++;
          return Number;
        },
      });

      const error = assertThrowsInstanceOf(() => typed("Model", props), Error);
      assertTrue(
        error.message.includes(
          "Object schema properties must be own string-keyed data properties.",
        ),
      );
      assertEqual(reads, 0);
    });

    it("rejects a hidden own type schema property", () => {
      const props = globalThis.Object.defineProperty(
        { value: String },
        "type",
        {
          value: Number,
          enumerable: false,
        },
      );

      const error = assertThrowsInstanceOf(() => typed("Model", props), Error);
      assertTrue(
        error.message.includes(
          'The "type" schema property is reserved by typed.',
        ),
      );
    });

    it("rejects a hidden own type schema accessor without invoking it", () => {
      let reads = 0;
      const props = globalThis.Object.defineProperty(
        { value: String },
        "type",
        {
          enumerable: false,
          get: () => {
            reads++;
            return Number;
          },
        },
      );

      const error = assertThrowsInstanceOf(() => typed("Model", props), Error);
      assertTrue(
        error.message.includes(
          'The "type" schema property is reserved by typed.',
        ),
      );
      assertEqual(reads, 0);
    });

    it("composes additional properties through Object and Literal", () => {
      const NumberFromString = setupNumberFromString();
      const Pending = typed("Pending", {
        label: NumberFromString,
        note: optional(String),
      });
      const input = { type: "Pending", label: "42" } as const;
      const output = { type: "Pending", label: 42 } as const;

      assertEqual(Pending.name, "Object");
      assertEqual(Pending.props.type.expected, "Pending");
      assertSame(Pending.props.label, NumberFromString);
      assertSame(Pending.props.note.type, String);
      assertSame(Pending.parent.props.type, String);
      assertSame(Pending.parent.props.label, String);
      assertSame(Pending.parent.props.note.type, String);
      assertSame(Pending.parent.parent, null);
      assertType<
        typeof Pending,
        TypedType<
          "Pending",
          {
            readonly label: typeof NumberFromString;
            readonly note: OptionalProperty<typeof String>;
          }
        >
      >();
      assertType<
        typeof Pending.Input,
        ExpectedStrictObject<
          { readonly type: string; readonly label: string },
          { readonly note: string }
        >
      >();
      assertType<
        typeof Pending.Output,
        ExpectedStrictObject<
          { readonly type: "Pending"; readonly label: number },
          { readonly note: string }
        >
      >();
      assertType<
        typeof Pending.Error,
        ObjectPropertiesError<{
          readonly type: LiteralError<"Pending">;
          readonly label: typeof NumberFromString.Error;
          readonly note: never;
        }>
      >();

      assertEqual(Pending.from.parent(input), ok(output));
      assertEqual(Pending.to(output), input);
      assertTrue(Pending.is(output));
      assertFalse(Pending.is(input));
      assertFalse(Pending.is({ type: "Other", label: 42 }));
      assertEqual(
        Pending.fromUnknown({ type: "Other", label: "not a number" }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              type: { type: "Literal", expected: "Pending", value: "Other" },
            },
          },
        }),
      );
    });

    it("composes additional properties through a Record", () => {
      const Values = record(String, String);
      const Open = typed("Open", { label: String }, Values);
      const A = literal("a");
      const AFromString = transform("AFromString", String, A, {
        from: () => ok("a" as const),
        to: () => "not-a" as const,
      });
      const CompatibleAFromString = transform(
        "CompatibleAFromString",
        String,
        A,
        {
          from: () => ok("a" as const),
          to: () => "a" as const,
        },
      );
      const ValuesWithTag = record(String, union("Open", "a"));
      const Compatible = typed(
        "Open",
        { fixed: CompatibleAFromString },
        ValuesWithTag,
      );
      const value = { type: "Open", label: "Label", note: "Note" } as const;
      const compileTimeAssertions = () => {
        // @ts-expect-error Additional properties must match the Record value Type.
        Open.from({ type: "Open", label: "Label", score: 1 });
        // @ts-expect-error The declared CanonicalInput must extend the Record value CanonicalInput.
        typed("Open", { fixed: AFromString }, ValuesWithTag);
      };

      assertSame(Open.record, Values);
      assertType<
        typeof Open,
        TypedType<"Open", { readonly label: typeof String }, typeof Values>
      >();
      assertType<
        typeof Open.Input,
        {
          readonly type: string;
          readonly label: string;
        } & Readonly<Partial<Record<string, string>>>
      >();
      assertType<
        typeof Open.Output,
        {
          readonly type: "Open";
          readonly label: string;
        } & Readonly<Partial<Record<string, string>>>
      >();
      assertEqual(
        Compatible.to(Compatible.orThrow({ type: "Open", fixed: "x" })),
        { type: "Open", fixed: "a" },
      );
      assertOk(Open.fromUnknown(value), value);
      assertTrue(Open.is(value));
      assertEqual(
        Open.fromUnknown({ ...value, score: 1 }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              score: {
                type: "Record",
                reason: {
                  kind: "Entries",
                  issues: [
                    {
                      kind: "Value",
                      key: "score",
                      error: {
                        type: "TypeOf",
                        expected: "String",
                        value: 1,
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      );
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("requires one concrete Type name and reserves the type property", () => {
      const unionTag = "One" as "One" | "Two";
      const broadTag: TypeName = "One";
      const patternedTag = "One" as `One${string}`;
      const property = String as typeof String | typeof Number;
      const baseProps = { value: String };
      const extendedProps = { value: String, extra: Number };
      const getSubsumedProps = (): typeof baseProps | typeof extendedProps =>
        Math.random() > 0.5 ? baseProps : extendedProps;
      const subsumedProps = getSubsumedProps();
      const Values = record(String, String);
      const UnknownValues = record(String, Unknown);
      const recordUnion = Math.random() > 0.5 ? Values : UnknownValues;
      const erasedRecord: TypeNode = Values;
      const restrictedKeys = record(literal("value"), String);
      const genericTagAssertion = <Tag extends "One" | "Two">(
        tag: Tag,
      ): Tag => {
        // @ts-expect-error An unresolved generic could be instantiated with a tag union.
        typed(tag);
        return tag;
      };
      const compileTimeAssertions = () => {
        // @ts-expect-error Type names start with an uppercase letter.
        typed("one");
        // @ts-expect-error A union does not identify one concrete Type name.
        typed(unionTag);
        // @ts-expect-error A widened name does not identify one concrete Type name.
        typed(broadTag);
        // @ts-expect-error A template pattern does not identify one concrete Type name.
        typed(patternedTag);
        // @ts-expect-error The discriminator is owned by typed.
        typed("One", { type: String });
        // @ts-expect-error The discriminator cannot be redeclared as optional.
        typed("One", { type: optional(String) });
        // @ts-expect-error Object property validation is preserved.
        typed("One", { value: property });
        // @ts-expect-error A structurally wider branch is still a schema union.
        typed("One", subsumedProps);
        typed("One", {}, Values);
        // @ts-expect-error The third argument must be a Record Type.
        typed("One", {}, {});
        // @ts-expect-error The Record Type must retain its concrete information.
        typed("One", {}, erasedRecord);
        // @ts-expect-error The third argument requires one concrete Record Type.
        typed("One", {}, recordUnion);
        // @ts-expect-error The Record key must be the predefined String Type.
        typed("One", {}, restrictedKeys);
        // @ts-expect-error Declared Inputs and Outputs must extend the Record value Type.
        typed("One", { value: Number }, Values);
      };

      assertType<
        typeof genericTagAssertion extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("validation", () => {
    it("rejects missing, mismatched, and excess properties", () => {
      const Empty = typed("Empty");
      const valueWithExcessProperty = { type: "Empty", extra: true } as const;
      const compileTimeAssertions = () => {
        // @ts-expect-error Strict typed Input excludes excess properties.
        Empty.from({ type: "Empty", extra: true });
      };

      assertEqual(
        Empty.fromUnknown({}),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { type: { type: "ObjectMissingProperty" } },
          },
        }),
      );
      assertFalse(Empty.fromUnknown({ type: "Other" }).ok);
      assertEqual(
        Empty.fromUnknown(valueWithExcessProperty),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { extra: { type: "ObjectExcessProperty" } },
          },
        }),
      );
      assertFalse(Empty.is(valueWithExcessProperty));
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("composition", () => {
    it("forms a total discriminated Union", () => {
      const NumberFromString = setupNumberFromString();
      const Created = typed("Created", { id: NumberFromString });
      const Deleted = typed("Deleted", { id: String });
      const Event = union(Created, Deleted);
      const createdInput = { type: "Created", id: "42" } as const;
      const createdOutput = { type: "Created", id: 42 } as const;
      const deleted = { type: "Deleted", id: "42" } as const;

      assertEqual(Event.fromUnknown(createdInput), ok(createdOutput));
      assertEqual(Event.fromUnknown(deleted), ok(deleted));
      assertEqual(Event.to(createdOutput), createdInput);
      assertEqual(Event.to(deleted), deleted);
      assertFalse(
        Event.fromUnknown({ type: "Created", id: "42", extra: true }).ok,
      );
      assertType<
        typeof Event.Output,
        | ExpectedStrictObject<{
            readonly type: "Created";
            readonly id: number;
          }>
        | ExpectedStrictObject<{
            readonly type: "Deleted";
            readonly id: string;
          }>
      >();

      const result = Event.fromUnknown(createdInput);
      assertOk(result, createdOutput);
      if (result.value.type === "Created") {
        assertType<typeof result.value.id, number>();
      } else {
        assertType<typeof result.value.id, string>();
      }
    });
  });
});

describe("nextResult", () => {
  it("validates value, error, and done outcomes", () => {
    const StringNextResult = nextResult(String, Number, Boolean);
    const Pair = tuple(String, Number);
    const AnyComponentNextResult = nextResult(Undefined, Pair, Never);
    const PairDoneNextResult = nextResult(String, Undefined, Pair);

    assertEqual(StringNextResult.name, "DiscriminatedUnion");
    assertEqual(StringNextResult.key, "ok");
    assertType<
      typeof StringNextResult,
      DiscriminatedUnionType<
        "ok",
        readonly [
          ObjectType<{
            readonly ok: LiteralType<true>;
            readonly value: typeof String;
          }>,
          ObjectType<{
            readonly ok: LiteralType<false>;
            readonly error: UnionType<
              readonly [
                typeof Number,
                TypedType<"Done", { readonly done: typeof Boolean }>,
              ]
            >;
          }>,
        ]
      >
    >();
    assertOk(StringNextResult.fromUnknown({ ok: true, value: "value" }), {
      ok: true,
      value: "value",
    });
    assertOk(StringNextResult.fromUnknown({ ok: false, error: 1 }), {
      ok: false,
      error: 1,
    });
    assertOk(
      StringNextResult.fromUnknown({
        ok: false,
        error: { type: "Done", done: true },
      }),
      { ok: false, error: { type: "Done", done: true } },
    );
    assertOk(
      AnyComponentNextResult.fromUnknown({ ok: true, value: undefined }),
      { ok: true, value: undefined },
    );
    assertOk(
      AnyComponentNextResult.fromUnknown({ ok: false, error: ["error", 1] }),
      { ok: false, error: ["error", 1] },
    );
    assertOk(
      PairDoneNextResult.fromUnknown({
        ok: false,
        error: { type: "Done", done: ["done", 2] },
      }),
      { ok: false, error: { type: "Done", done: ["done", 2] } },
    );

    assertType<
      typeof UnknownNextResult,
      DiscriminatedUnionType<
        "ok",
        readonly [
          ObjectType<{
            readonly ok: LiteralType<true>;
            readonly value: typeof Unknown;
          }>,
          ObjectType<{
            readonly ok: LiteralType<false>;
            readonly error: UnionType<
              readonly [
                typeof Unknown,
                TypedType<"Done", { readonly done: typeof Unknown }>,
              ]
            >;
          }>,
        ]
      >
    >();
    assertTrue(UnknownNextResult.is({ ok: true, value: undefined }));
    assertTrue(UnknownNextResult.is({ ok: false, error: undefined }));
  });
});

describe("discriminatedUnion", () => {
  describe("construction", () => {
    it("creates a routed Type with exact discriminated Inputs", () => {
      const NumberFromString = setupNumberFromString();
      const Created = typed("Created", { id: NumberFromString });
      const Deleted = typed("Deleted", { reason: String });
      const Event = discriminatedUnion(Created, Deleted);

      assertEqual(Event.name, "DiscriminatedUnion");
      assertEqual(Event.key, "type");
      assertEqual(Event.members, [Created, Deleted]);
      assertSame(Event.members[0], Created);
      assertSame(Event.members[1], Deleted);
      assertEqual(Event.parent.name, "DiscriminatedUnion");
      assertSame(Event.parent.parent, null);
      assertType<
        typeof Event,
        DiscriminatedUnionType<
          "type",
          readonly [typeof Created, typeof Deleted]
        >
      >();
      assertType<
        typeof Event.parent.Input,
        | (typeof Created.Input & { readonly type: "Created" })
        | (typeof Deleted.Input & { readonly type: "Deleted" })
      >();
      assertType<typeof Event.parent.Output, typeof Event.parent.Input>();
      assertType<
        typeof Event.parent.Error extends DiscriminatedUnionError<
          "type",
          "Created" | "Deleted",
          | DiscriminatedUnionMemberIssue<
              "Created",
              InferErrors<typeof Created.parent>
            >
          | DiscriminatedUnionMemberIssue<
              "Deleted",
              InferErrors<typeof Deleted.parent>
            >
        >
          ? true
          : false,
        true
      >();
      assertType<
        typeof Event.Input,
        | (typeof Created.Input & { readonly type: "Created" })
        | (typeof Deleted.Input & { readonly type: "Deleted" })
      >();
      assertType<
        typeof Event.Output,
        typeof Created.Output | typeof Deleted.Output
      >();
      assertType<
        typeof Event.Error,
        DiscriminatedUnionMemberError<
          | DiscriminatedUnionMemberIssue<"Created", typeof Created.Error>
          | DiscriminatedUnionMemberIssue<"Deleted", typeof Deleted.Error>
        >
      >();
      assertType<
        InferErrors<typeof Event> extends DiscriminatedUnionError<
          "type",
          "Created" | "Deleted",
          | DiscriminatedUnionMemberIssue<
              "Created",
              InferErrors<typeof Created>
            >
          | DiscriminatedUnionMemberIssue<
              "Deleted",
              InferErrors<typeof Deleted>
            >
        >
          ? true
          : false,
        true
      >();
      assertTrue("parent" in Event.from);
    });

    it("supports an explicit discriminator key", () => {
      const Added = object({ kind: literal("added"), value: String });
      const Removed = object({ kind: literal("removed"), id: Number });
      const Event = discriminatedUnion("kind", Added, Removed);

      assertEqual(Event.key, "kind");
      assertEqual(Event.members, [Added, Removed]);
      assertType<
        typeof Event.Input,
        | (typeof Added.Input & { readonly kind: "added" })
        | (typeof Removed.Input & { readonly kind: "removed" })
      >();
      assertEqual(
        Event.fromUnknown({ kind: "added", value: "value" }),
        ok({ kind: "added", value: "value" }),
      );
      assertEqual(
        Event.fromUnknown({ kind: "removed", id: 1 }),
        ok({ kind: "removed", id: 1 }),
      );
    });

    it("supports string, number, bigint, and boolean discriminators", () => {
      const Text = object({ kind: literal("text") });
      const Count = object({ kind: literal(1) });
      const BigCount = object({ kind: literal(1n) });
      const Enabled = object({ kind: literal(true) });
      const Event = discriminatedUnion("kind", Text, Count, BigCount, Enabled);

      for (const kind of ["text", 1, 1n, true] as const) {
        assertOk(Event.fromUnknown({ kind }), { kind });
        assertOk(Event.parent.fromUnknown({ kind }), { kind });
      }
    });

    it("requires a concrete key and unique required Literal props", () => {
      const Valid = typed("Valid");
      const Duplicate = typed("Valid");
      const Missing = object({ value: String });
      const Optional = object({ type: optional(literal("Optional")) });
      const Broad = object({ type: String });
      const NullTag = object({ type: literal(null) });
      const UndefinedTag = object({ type: literal(undefined) });
      const _Other = typed("Other");
      const uncertain = Valid as typeof Valid | typeof _Other;
      const broadKey = "type" as string;
      const unionKey = "type" as "type" | "kind";
      const patternedKey = "type" as `type${string}`;
      const compileTimeAssertions = () => {
        // @ts-expect-error A Discriminated Union requires at least two members.
        discriminatedUnion();
        // @ts-expect-error A Discriminated Union requires at least two members.
        discriminatedUnion(Valid);
        // @ts-expect-error Every member must be an Object Type.
        discriminatedUnion(Valid, String);
        // @ts-expect-error Every member must have the discriminator property.
        discriminatedUnion(Valid, Missing);
        // @ts-expect-error The discriminator property must be required.
        discriminatedUnion(Valid, Optional);
        // @ts-expect-error The discriminator property must be a Literal Type.
        discriminatedUnion(Valid, Broad);
        // @ts-expect-error Null does not provide a widened discriminator parent.
        discriminatedUnion(Valid, NullTag);
        // @ts-expect-error Undefined does not provide a widened discriminator parent.
        discriminatedUnion(Valid, UndefinedTag);
        // @ts-expect-error Discriminator values must be unique.
        discriminatedUnion(Valid, Duplicate);
        // @ts-expect-error Every member slot must use one concrete Object Type.
        discriminatedUnion(uncertain, typed("Another"));
        // @ts-expect-error The explicit discriminator key must be concrete.
        discriminatedUnion(broadKey, Valid, typed("Other"));
        // @ts-expect-error The explicit discriminator key must not be a union.
        discriminatedUnion(unionKey, Valid, typed("Other"));
        // @ts-expect-error The explicit discriminator key must not be a template pattern.
        discriminatedUnion(patternedKey, Valid, typed("Other"));
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("requires one concrete finite member tuple", () => {
      const OneWithString = typed("One", { value: String });
      const TwoWithString = typed("Two", { value: String });
      const OneWithNumber = typed("One", { value: Number });
      const TwoWithNumber = typed("Two", { value: Number });
      const ThreeWithString = typed("Three", { value: String });
      const _ThreeWithNumber = typed("Three", { value: Number });
      const members =
        Math.random() > 0.5
          ? ([OneWithString, TwoWithString] as const)
          : ([OneWithNumber, TwoWithNumber] as const);
      const differentLengthMembers =
        Math.random() > 0.5
          ? ([OneWithString, TwoWithString] as const)
          : ([OneWithString, TwoWithString, ThreeWithString] as const);
      const widenedMembers: readonly [
        typeof OneWithString,
        typeof TwoWithString,
        ...ReadonlyArray<typeof ThreeWithString>,
      ] = [OneWithString, TwoWithString];
      const uncertainThird = ThreeWithString as
        typeof ThreeWithString | typeof _ThreeWithNumber;
      const compileTimeAssertions = () => {
        // @ts-expect-error Members must use one concrete finite tuple.
        discriminatedUnion(...members);
        // @ts-expect-error Explicit-key members must also use one concrete finite tuple.
        discriminatedUnion("type", ...members);
        // @ts-expect-error Members must not use a union of tuple lengths.
        discriminatedUnion(...differentLengthMembers);
        // @ts-expect-error Members must use a finite tuple instead of a variadic tuple.
        discriminatedUnion(...widenedMembers);
        // @ts-expect-error Every member slot must use one concrete Object Type.
        discriminatedUnion(OneWithString, TwoWithString, uncertainThird);
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("validation", () => {
    it("routes only the selected member through every operation", () => {
      let createdFromCount = 0;
      let createdToCount = 0;
      let deletedFromCount = 0;
      let deletedToCount = 0;
      const CreatedId = transform("CreatedId", String, Number, {
        from: (value) => {
          createdFromCount++;
          return ok(globalThis.Number(value));
        },
        to: (value) => {
          createdToCount++;
          return globalThis.String(value);
        },
      });
      const DeletedId = transform("DeletedId", String, Number, {
        from: (value) => {
          deletedFromCount++;
          return ok(globalThis.Number(value));
        },
        to: (value) => {
          deletedToCount++;
          return globalThis.String(value);
        },
      });
      const Created = typed("Created", { id: CreatedId });
      const Deleted = typed("Deleted", { id: DeletedId });
      const Event = discriminatedUnion(Created, Deleted);
      const input = { type: "Created", id: "42" } as const;
      const output = { type: "Created", id: 42 } as const;

      assertEqual(Event.fromUnknown(input), ok(output));
      assertEqual([createdFromCount, deletedFromCount], [1, 0]);

      createdFromCount = deletedFromCount = 0;
      assertEqual(Event.from.parent(input), ok(output));
      assertEqual([createdFromCount, deletedFromCount], [1, 0]);

      assertEqual(Event.to(output), input);
      assertEqual([createdToCount, deletedToCount], [1, 0]);
      assertTrue(Event.is(output));
      assertFalse(Event.is(input));
      assertFalse(Event.is(null));
      assertFalse(Event.parent.is(null));
    });

    it("routes its encoded parent boundary before member transformations", () => {
      const NumberFromString = setupNumberFromString();
      const Created = typed("Created", { id: NumberFromString });
      const Deleted = typed("Deleted", { id: String });
      const Event = discriminatedUnion(Created, Deleted);
      const input = { type: "Created", id: "42" } as const;
      const output = { type: "Created", id: 42 } as const;

      assertEqual(Event.parent.fromUnknown(input), ok(input));
      assertEqual(Event.parent.from(input), ok(input));
      assertEqual(Event.parent.to(input), input);
      assertEqual(Event.to.parent(output), input);
      {
        const actual = Event.to.parent(output);
        assertType<typeof actual, typeof Event.parent.Output>();
      }
      assertFalse("parent" in Event.to.parent);
      assertTrue(Event.parent.is(input));
      assertFalse(Event.is(input));
      assertEqual(Event.orThrow(input), output);
      assertEqual(Event.orNull(input), output);
    });

    it("asserts exact routed Outputs at both boundaries", () => {
      const Created = typed("Created", { id: Number });
      const Deleted = typed("Deleted", { reason: String });
      const Event = discriminatedUnion(Created, Deleted);
      const invalid = {
        type: "Created",
        id: "no",
      } as unknown as typeof Event.Output;
      const cause = {
        type: "DiscriminatedUnion",
        reason: {
          kind: "Member",
          discriminator: "Created",
          error: {
            type: "Object",
            reason: {
              kind: "Properties",
              errors: {
                id: { type: "TypeOf", expected: "Number", value: "no" },
              },
            },
          },
        },
      } as const;

      assertAssertionError(
        () => Event.from(invalid),
        "Expected DiscriminatedUnion.",
        cause,
      );
      assertAssertionError(
        () => Event.from.parent(invalid),
        "Expected DiscriminatedUnion.",
        cause,
      );
    });

    it("uses the immediate Object parent for a transformed Record member", () => {
      const NumberFromString = setupNumberFromString();
      const Added = object(
        { kind: literal("added") },
        record(String, union(literal("added"), NumberFromString)),
      );
      const Removed = object({ kind: literal("removed"), reason: String });
      const Event = discriminatedUnion("kind", Added, Removed);
      const input = { kind: "added", count: "42" } as const;
      const output = { kind: "added", count: 42 } as const;

      // The Literal property and transformed Record both have parent chains.
      // Object collapses them into one terminal parent, which routing uses as
      // the encoded boundary without walking the chain again.
      assertSame(Added.parent.parent, null);
      assertEqual(Event.parent.fromUnknown(input), ok(input));
      assertEqual(Event.parent.from(input), ok(input));
      assertEqual(Event.parent.to(input), input);
      assertTrue(Event.parent.is(input));
      assertEqual(Event.fromUnknown(input), ok(output));
      assertEqual(Event.to(output), input);
    });

    it("rejects an uncorrelated Input instead of trusting the selected shape", () => {
      const Created = typed("Created", { name: String });
      const Deleted = typed("Deleted", { reason: String });
      const Event = discriminatedUnion(Created, Deleted);
      const uncorrelated = { type: "Created", reason: "reason" } as const;
      const compileTimeAssertions = () => {
        // @ts-expect-error The exact discriminator must correlate with its member Input.
        Event.from(uncorrelated);
      };

      assertType<
        typeof uncorrelated extends typeof Event.Input ? true : false,
        false
      >();
      assertEqual(
        Event.fromUnknown(uncorrelated, { errors: "all" }),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Member",
            discriminator: "Created",
            error: {
              type: "Object",
              reason: {
                kind: "Properties",
                errors: {
                  name: { type: "ObjectMissingProperty" },
                  reason: { type: "ObjectExcessProperty" },
                },
              },
            },
          },
        }),
      );
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("returns routed discriminator, access, and member errors", () => {
      const Created = typed("Created", { name: String, email: String });
      const Deleted = typed("Deleted", { reason: String });
      const Event = discriminatedUnion(Created, Deleted);
      const accessError = new Error("access");
      const throwing = globalThis.Object.defineProperty({}, "type", {
        enumerable: true,
        get: () => {
          throw accessError;
        },
      });
      const nonEnumerable = globalThis.Object.defineProperty({}, "type", {
        value: "Created",
      });

      assertEqual(
        Event.fromUnknown(null),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Object",
            error: {
              type: "Object",
              reason: { kind: "NotObject", value: null },
            },
          },
        }),
      );
      assertEqual(
        Event.fromUnknown({ type: "Updated" }),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Discriminator",
            key: "type",
            value: "Updated",
            expected: ["Created", "Deleted"],
          },
        }),
      );
      assertEqual(
        Event.fromUnknown({ type: 1 }),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Discriminator",
            key: "type",
            value: 1,
            expected: ["Created", "Deleted"],
          },
        }),
      );
      assertEqual(
        Event.fromUnknown({}),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Discriminator",
            key: "type",
            value: undefined,
            expected: ["Created", "Deleted"],
          },
        }),
      );
      assertEqual(
        Event.fromUnknown(throwing),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "Accessor",
          },
        }),
      );
      assertEqual(
        Event.fromUnknown(nonEnumerable),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "NonEnumerable",
          },
        }),
      );
      assertInstanceOf(accessError, Error);
      assertEqual(
        Event.fromUnknown(
          { type: "Created", name: 1, email: 2 },
          { errors: "all" },
        ),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Member",
            discriminator: "Created",
            error: {
              type: "Object",
              reason: {
                kind: "Properties",
                errors: {
                  name: { type: "TypeOf", expected: "String", value: 1 },
                  email: { type: "TypeOf", expected: "String", value: 2 },
                },
              },
            },
          },
        }),
      );
    });

    it("formats routing errors and delegates selected member errors", () => {
      const Created = typed("Created", { name: String });
      const Deleted = typed("Deleted", { reason: String });
      const Event = discriminatedUnion(Created, Deleted);
      const objectResult = Event.fromUnknown(null);
      const discriminatorResult = Event.fromUnknown({ type: "Other" });
      const memberResult = Event.fromUnknown({ type: "Created" });
      const accessResult = Event.fromUnknown(
        globalThis.Object.defineProperty({}, "type", {
          get: () => {
            throw new Error("access");
          },
        }),
      );

      assertErr(objectResult, {
        type: "DiscriminatedUnion",
        reason: {
          kind: "Object",
          error: {
            type: "Object",
            reason: { kind: "NotObject", value: null },
          },
        },
      });
      assertErr(discriminatorResult, {
        type: "DiscriminatedUnion",
        reason: {
          kind: "Discriminator",
          key: "type",
          value: "Other",
          expected: ["Created", "Deleted"],
        },
      });
      assertErr(memberResult, {
        type: "DiscriminatedUnion",
        reason: {
          kind: "Member",
          discriminator: "Created",
          error: {
            type: "Object",
            reason: {
              kind: "Properties",
              errors: { name: { type: "ObjectMissingProperty" } },
            },
          },
        },
      });
      assertErr(accessResult, {
        type: "DiscriminatedUnion",
        reason: {
          kind: "PropertyAccess",
          key: "type",
          reason: "Accessor",
        },
      });

      assertEqual(
        Event.formatError(objectResult.error),
        "A value null is not an object.",
      );
      assertEqual(
        Event.formatError(discriminatorResult.error),
        'The discriminator property "type" has an unexpected value "Other".',
      );
      assertEqual(
        Event.formatError(memberResult.error),
        'The required property "name" is missing.',
      );
      assertEqual(
        Event.formatError(accessResult.error),
        'The discriminator property "type" must be a data property.',
      );
      assertEqual(
        Event.formatError({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "Inherited",
          },
        }),
        'The discriminator property "type" must be an own property.',
      );
      assertEqual(
        Event.formatError({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "NonEnumerable",
          },
        }),
        'The discriminator property "type" must be enumerable.',
      );
    });

    it("rejects class instances and inherited discriminator accessors without invoking them", () => {
      const Created = typed("Created", { value: String });
      const Deleted = typed("Deleted", { value: String });
      const Event = discriminatedUnion(Created, Deleted);
      let reads = 0;
      class CreatedInput {
        readonly value = "value";

        get type() {
          reads++;
          return "Created" as const;
        }
      }
      const input = new CreatedInput();

      assertEqual(
        Event.fromUnknown(input),
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Object",
            error: {
              type: "Object",
              reason: { kind: "UnexpectedPrototype", value: input },
            },
          },
        }),
      );
      assertFalse(Event.is(input));
      assertEqual(reads, 0);

      const originalTypeDescriptor = globalThis.Object.getOwnPropertyDescriptor(
        globalThis.Object.prototype,
        "type",
      );
      globalThis.Object.defineProperty(globalThis.Object.prototype, "type", {
        configurable: true,
        get: () => {
          reads++;
          return "Created" as const;
        },
      });
      try {
        assertEqual(
          Event.fromUnknown({ value: "value" }),
          err({
            type: "DiscriminatedUnion",
            reason: {
              kind: "PropertyAccess",
              key: "type",
              reason: "Inherited",
            },
          }),
        );
      } finally {
        if (originalTypeDescriptor === undefined) {
          Reflect.deleteProperty(globalThis.Object.prototype, "type");
        } else {
          globalThis.Object.defineProperty(
            globalThis.Object.prototype,
            "type",
            originalTypeDescriptor,
          );
        }
      }
      assertEqual(reads, 0);

      const nullPrototypeInput = globalThis.Object.assign(
        globalThis.Object.create(null),
        { type: "Deleted", value: "value" },
      );
      const result = Event.fromUnknown(nullPrototypeInput);

      assertOk(result, { type: "Deleted", value: "value" });
      assertSame(result.value, nullPrototypeInput);
      assertSame(globalThis.Object.getPrototypeOf(result.value), null);
    });

    it("rejects custom prototype chains", () => {
      const Created = typed("Created", { name: String });
      const Deleted = typed("Deleted", { name: String });
      const Event = discriminatedUnion(Created, Deleted);

      for (const value of setupUnexpectedPrototypeValues()) {
        assertEqual(
          Event.fromUnknown(value),
          err({
            type: "DiscriminatedUnion",
            reason: {
              kind: "Object",
              error: {
                type: "Object",
                reason: { kind: "UnexpectedPrototype", value },
              },
            },
          }),
        );
        assertFalse(Event.is(value));
      }
    });
  });

  describe("composition", () => {
    it("composes transformed members through Array and reverse operations", () => {
      const NumberFromString = setupNumberFromString();
      const Created = typed("Created", { id: NumberFromString });
      const Deleted = typed("Deleted", { id: String });
      const Events = array(discriminatedUnion(Created, Deleted));
      const input = [
        { type: "Created", id: "42" },
        { type: "Deleted", id: "42" },
      ] as const;
      const output = [
        { type: "Created", id: 42 },
        { type: "Deleted", id: "42" },
      ] as const;

      assertEqual(Events.fromUnknown(input), ok(output));
      assertEqual(Events.to(output), input);
      assertEqual(
        Events.fromUnknown([
          { type: "Deleted", id: "ok" },
          { type: "Created", id: "no" },
        ]),
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: {
                  type: "DiscriminatedUnion",
                  reason: {
                    kind: "Member",
                    discriminator: "Created",
                    error: {
                      type: "Object",
                      reason: {
                        kind: "Properties",
                        errors: {
                          id: { type: "NumberFromString", value: "no" },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        }),
      );
    });
  });
});

describe("lazy", () => {
  it("requires its definition to return one concrete Type node", () => {
    const chooseTarget = (useString: boolean) => (useString ? String : Number);
    type Target = ReturnType<typeof chooseTarget>;
    type Definition = Parameters<typeof lazy<Target>>[0];
    type DefinitionOutput = ReturnType<Definition>;
    const getTarget = (): Target => chooseTarget(true);
    const compileTimeAssertions = () => {
      // @ts-expect-error A Lazy Type definition must return one concrete Type node.
      lazy(getTarget);
      // @ts-expect-error An inferred Lazy Type definition must also return one concrete Type node.
      lazy(() => chooseTarget(true));
    };

    assertType<Target extends DefinitionOutput ? true : false, false>();
    assertType<
      DefinitionOutput,
      "⛔ Type error: Lazy Type definition must return one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
    >();
    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("rejects an unresolved generic definition", () => {
    const compileTimeAssertions = <
      Target extends typeof String | typeof Number,
    >(
      target: Target,
    ): Target => {
      // @ts-expect-error An unresolved generic target might be a union.
      lazy(() => target);
      return target;
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("accepts one Union Type node as its definition", () => {
    const Target = union(String, Number);
    const Value = lazy(() => Target);

    assertOk(Value.fromUnknown("value"), "value");
    assertOk(Value.fromUnknown(1), 1);
    assertType<typeof Value.Input, string | number>();
    assertType<typeof Value.Output, string | number>();
  });

  it("asserts exact resolved Outputs at both Lazy boundaries", () => {
    const Value = lazy(() => String);
    const invalid = 1 as unknown as string;
    const cause = { type: "TypeOf", expected: "String", value: 1 } as const;

    assertAssertionError(() => Value.from(invalid), "Expected Lazy.", cause);
    assertAssertionError(
      () => Value.from.parent(invalid),
      "Expected Lazy.",
      cause,
    );
  });

  describe("direct recursion", () => {
    it("accepts Map as a recursive structural boundary", () => {
      interface RecursiveStringMap extends ReadonlyMap<
        string,
        RecursiveStringMap
      > {}
      interface RecursiveStringMapEntriesError extends TypeError<"Map"> {
        readonly reason: {
          readonly kind: "Entries";
          readonly issues: NonEmptyReadonlyArray<
            | MapExcessPropertyIssue
            | MapKeyIssue<TypeOfError<"String">>
            | MapValueIssue<RecursiveStringMapError>
          >;
        };
      }
      type RecursiveStringMapError =
        MapNotMapError | RecursiveStringMapEntriesError;

      const RecursiveStringMap: LazyType<
        RecursiveStringMap,
        RecursiveStringMap,
        never,
        RecursiveStringMapError,
        RecursiveStringMapError
      > = lazy(() => map(String, RecursiveStringMap));

      const leaf: RecursiveStringMap = new Map();
      const value: RecursiveStringMap = new Map([["nested", leaf]]);

      assertEqual(RecursiveStringMap.fromUnknown(value), ok(value));
      assertTrue(RecursiveStringMap.is(value));
      assertFalse(
        RecursiveStringMap.fromUnknown(
          new Map([["nested", new Map([[1, new Map()]])]]),
        ).ok,
      );
    });

    it("validates a recursively declared pure Object", () => {
      interface StringTree {
        readonly value: string;
        readonly children: ReadonlyArray<StringTree>;
      }
      interface StringTreeError extends ObjectError<{
        readonly value: TypeOfError<"String">;
        readonly children: ArrayError<StringTreeError>;
      }> {}

      const StringTree: LazyType<
        StringTree,
        StringTree,
        never,
        StringTreeError,
        StringTreeError
      > = lazy(() => object({ value: String, children: array(StringTree) }));
      const value: StringTree = {
        value: "root",
        children: [{ value: "leaf", children: [] }],
      };

      assertEqual(StringTree.name, "Lazy");
      assertEqual(StringTree.parent.name, "Lazy");
      assertSame(StringTree.parent.parent, null);
      assertTrue("parent" in StringTree.from);
      assertEqual(StringTree.fromUnknown(value), ok(value));
      assertEqual(StringTree.from(value), ok(value));
      assertEqual(StringTree.to(value), value);
      assertTrue(StringTree.is(value));
      assertType<
        typeof StringTree,
        LazyType<
          StringTree,
          StringTree,
          never,
          StringTreeError,
          StringTreeError
        >
      >();
      {
        const actual = StringTree.from(value);
        assertType<typeof actual, Result<StringTree>>();
      }
      assertType<typeof StringTree.parent.Error, StringTreeError>();
      assertType<InferErrors<typeof StringTree>, StringTreeError>();

      assertEqual(
        StringTree.fromUnknown({
          value: "root",
          children: [{ value: 42, children: [] }],
        }),
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              children: {
                type: "Array",
                reason: {
                  kind: "Items",
                  issues: [
                    {
                      kind: "Element",
                      index: 0,
                      error: {
                        type: "Object",
                        reason: {
                          kind: "Properties",
                          errors: {
                            value: {
                              type: "TypeOf",
                              expected: "String",
                              value: 42,
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      );
    });

    it("preserves recursive input, conversion, and complete error channels", () => {
      const NumberFromString = setupNumberFromString();
      interface TreeInput {
        readonly value: string;
        readonly children: ReadonlyArray<TreeInput>;
      }
      interface TreeOutput {
        readonly value: number;
        readonly children: ReadonlyArray<TreeOutput>;
      }
      interface TreeInputError extends ObjectError<{
        readonly value: TypeOfError<"String">;
        readonly children: ArrayError<TreeInputError>;
      }> {}
      interface TreeFromError extends ObjectPropertiesError<{
        readonly value: NumberFromStringError;
        readonly children: ArrayElementsError<TreeFromError>;
      }> {}
      interface TreeError extends ObjectError<{
        readonly value: TypeOfError<"String"> | NumberFromStringError;
        readonly children: ArrayError<TreeError>;
      }> {}

      const Tree: LazyType<
        TreeInput,
        TreeOutput,
        TreeFromError,
        TreeInputError,
        TreeError,
        TreeInput,
        false
      > = lazy(() =>
        object({ value: NumberFromString, children: array(Tree) }),
      );
      const input: TreeInput = {
        value: "1",
        children: [{ value: "2", children: [] }],
      };
      const output: TreeOutput = {
        value: 1,
        children: [{ value: 2, children: [] }],
      };

      assertEqual(Tree.parent.fromUnknown(input), ok(input));
      assertEqual(Tree.parent.from(input), ok(input));
      assertEqual(Tree.parent.to(input), input);
      assertTrue(Tree.parent.is(input));
      assertEqual(Tree.fromUnknown(input), ok(output));
      assertEqual(Tree.from.parent(input), ok(output));
      assertEqual(Tree.to(output), input);
      assertEqual(Tree.orThrow(input), output);
      assertTrue(Tree.is(output));
      assertFalse(Tree.is(input));
      {
        const actual = Tree.from.parent(input);
        assertType<typeof actual, Result<TreeOutput, TreeFromError>>();
      }
      {
        const actual = Tree.parent.fromUnknown(input);
        assertType<typeof actual, Result<TreeInput, TreeInputError>>();
      }
      {
        const actual = Tree.fromUnknown(input);
        assertType<typeof actual, Result<TreeOutput, TreeError>>();
      }

      const invalid: TreeInput = {
        value: "no",
        children: [{ value: "also-no", children: [] }],
      };
      const result = Tree.from.parent(invalid, { errors: "all" });
      const completeResult = Tree.fromUnknown(invalid, { errors: "all" });
      const inputResult = Tree.parent.fromUnknown({ value: 1, children: [] });
      const expectedError = {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            value: { type: "NumberFromString", value: "no" },
            children: {
              type: "Array",
              reason: {
                kind: "Items",
                issues: [
                  {
                    kind: "Element",
                    index: 0,
                    error: {
                      type: "Object",
                      reason: {
                        kind: "Properties",
                        errors: {
                          value: {
                            type: "NumberFromString",
                            value: "also-no",
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      } as const;

      assertErr(result, expectedError);
      assertEqual(
        Tree.formatError(result.error),
        "The value no is not a number.",
      );
      assertErr(completeResult, expectedError);
      assertEqual(
        Tree.formatError(completeResult.error),
        "The value no is not a number.",
      );
      assertSame(Tree.orNull(invalid), null);
      assertErr(inputResult, {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            value: { type: "TypeOf", expected: "String", value: 1 },
          },
        },
      });
      assertEqual(
        Tree.parent.formatError(inputResult.error),
        "A value 1 is not a string.",
      );
    });
  });

  describe("resolution", () => {
    it("defers and caches mutually recursive definitions independently", () => {
      interface Left {
        readonly label: string;
        readonly right?: Right;
      }
      interface Right {
        readonly count: number;
        readonly left?: Left;
      }
      interface LeftError extends ObjectError<{
        readonly label: TypeOfError<"String">;
        readonly right?: RightError;
      }> {}
      interface RightError extends ObjectError<{
        readonly count: TypeOfError<"Number">;
        readonly left?: LeftError;
      }> {}
      let leftResolutions = 0;
      let rightResolutions = 0;
      const Left: LazyType<Left, Left, never, LeftError, LeftError> = lazy(
        () => {
          leftResolutions++;
          return object({ label: String, right: optional(Right) });
        },
      );
      const Right: LazyType<Right, Right, never, RightError, RightError> = lazy(
        () => {
          rightResolutions++;
          return object({ count: Number, left: optional(Left) });
        },
      );

      assertEqual([leftResolutions, rightResolutions], [0, 0]);
      assertEqual(Left.fromUnknown({ label: "left" }), ok({ label: "left" }));
      assertEqual([leftResolutions, rightResolutions], [1, 0]);

      const value: Left = {
        label: "left",
        right: { count: 1, left: { label: "nested" } },
      };

      assertEqual(Left.fromUnknown(value), ok(value));
      assertEqual([leftResolutions, rightResolutions], [1, 1]);
      assertTrue(Left.is(value));
      assertEqual(Right.to(value.right!), value.right);
      assertEqual([leftResolutions, rightResolutions], [1, 1]);
    });

    it("rejects reentrant definition resolution and caches the failure", () => {
      let resolutions = 0;
      const Reentrant: LazyType<
        string,
        string,
        never,
        TypeOfError<"String">,
        TypeOfError<"String">,
        string
      > = lazy(() => {
        resolutions++;
        Reentrant.is("value");
        return String;
      });
      const message =
        "A Lazy Type definition must not resolve itself while it is being created.";

      const firstError = assertThrowsInstanceOf(
        () => Reentrant.fromUnknown("value"),
        Error,
      );
      assertTrue(firstError.message.includes(message));
      const secondError = assertThrowsInstanceOf(
        () => Reentrant.fromUnknown("value"),
        Error,
      );
      assertTrue(secondError.message.includes(message));
      assertEqual(resolutions, 1);
    });

    it("rejects a Lazy Type returned as another Lazy definition", () => {
      let targetResolutions = 0;
      const Target = lazy(() => {
        targetResolutions++;
        return String;
      });
      const Alias = lazy(() => Target);

      const error = assertThrowsInstanceOf(
        () => Alias.fromUnknown("value"),
        Error,
      );
      assertTrue(
        error.message.includes(
          "A Lazy Type definition must return a non-Lazy Type.",
        ),
      );
      assertEqual(targetResolutions, 0);
    });

    it("rejects a localized Lazy Type returned as another Lazy definition", () => {
      let targetResolutions = 0;
      const Target = lazy(() => {
        targetResolutions++;
        return String;
      });
      const LocalizedTarget = localizeTypes(
        { Target },
        { test: { String: () => "Localized String." } },
      ).test.Target;
      const Alias = lazy(() => LocalizedTarget);

      const error = assertThrowsInstanceOf(
        () => Alias.fromUnknown("value"),
        Error,
      );
      assertTrue(
        error.message.includes(
          "A Lazy Type definition must return a non-Lazy Type.",
        ),
      );
      assertEqual(targetResolutions, 0);
    });

    it("rejects a Lazy Type in its definition parent chain", () => {
      const ParentCycle: LazyType<
        string,
        string,
        never,
        TypeOfError<"String">,
        TypeOfError<"String">,
        string,
        false
      > = lazy(() => createType("ParentCycle", ParentCycle, ok));

      const error = assertThrowsInstanceOf(
        () => ParentCycle.fromUnknown("value"),
        Error,
      );
      assertTrue(
        error.message.includes(
          "A Lazy Type definition must not use a Lazy Type in its parent chain.",
        ),
      );
    });

    it("rejects a localized Lazy Type in its definition parent chain", () => {
      let targetResolutions = 0;
      const Target = lazy(() => {
        targetResolutions++;
        return String;
      });
      const LocalizedTarget = localizeTypes(
        { Target },
        { test: { String: () => "Localized String." } },
      ).test.Target;
      const Alias = lazy(() =>
        createType("LocalizedParentCycle", LocalizedTarget.parent, ok),
      );

      const error = assertThrowsInstanceOf(
        () => Alias.fromUnknown("value"),
        Error,
      );
      assertTrue(
        error.message.includes(
          "A Lazy Type definition must not use a Lazy Type in its parent chain.",
        ),
      );
      assertEqual(targetResolutions, 0);
    });

    it("rejects an unguarded self-reference as the first Union member", () => {
      interface SelfError extends TypeError<"Union"> {
        readonly errors: NonEmptyReadonlyArray<
          | UnionMemberError<SelfError, 0>
          | UnionMemberError<TypeOfError<"String">, 1>
        >;
      }
      let resolutions = 0;
      const Self: LazyType<string, string, SelfError, SelfError, SelfError> =
        lazy(() => {
          resolutions++;
          return union(Self, String);
        });
      const message =
        "A Lazy Type definition must place every Lazy Type behind a structural boundary.";

      const firstError = assertThrowsInstanceOf(
        () => Self.fromUnknown("value"),
        Error,
      );
      assertTrue(firstError.message.includes(message));
      const secondError = assertThrowsInstanceOf(
        () => Self.fromUnknown("value"),
        Error,
      );
      assertTrue(secondError.message.includes(message));
      assertEqual(resolutions, 1);
    });

    it("rejects an unguarded self-reference as the second Union member", () => {
      interface SelfError extends TypeError<"Union"> {
        readonly errors: NonEmptyReadonlyArray<
          | UnionMemberError<TypeOfError<"String">, 0>
          | UnionMemberError<SelfError, 1>
        >;
      }
      let resolutions = 0;
      const Self: LazyType<string, string, SelfError, SelfError, SelfError> =
        lazy(() => {
          resolutions++;
          return union(String, Self);
        });
      const message =
        "A Lazy Type definition must place every Lazy Type behind a structural boundary.";

      const firstError = assertThrowsInstanceOf(
        () => Self.fromUnknown("value"),
        Error,
      );
      assertTrue(firstError.message.includes(message));
      const secondError = assertThrowsInstanceOf(
        () => Self.fromUnknown("value"),
        Error,
      );
      assertTrue(secondError.message.includes(message));
      assertEqual(resolutions, 1);
    });

    it("rejects an unguarded self-reference through Transform output", () => {
      let resolutions = 0;
      const Self: LazyType<
        string,
        string,
        never,
        TypeOfError<"String">,
        TypeOfError<"String">,
        string,
        false
      > = lazy(() => {
        resolutions++;
        return transform("RecursiveTransform", String, Self, {
          from: (value) => ok(value),
          to: (value) => value,
        });
      });
      const message =
        "A Lazy Type definition must place every Lazy Type behind a structural boundary.";

      const firstError = assertThrowsInstanceOf(
        () => Self.fromUnknown("value"),
        Error,
      );
      assertTrue(firstError.message.includes(message));
      const secondError = assertThrowsInstanceOf(
        () => Self.fromUnknown("value"),
        Error,
      );
      assertTrue(secondError.message.includes(message));
      assertEqual(resolutions, 1);
    });
  });
});

describe("Data", () => {
  it("exposes its exact recursive contract", () => {
    assertType<typeof Data, DataType>();
    assertType<typeof Data.Input, Data>();
    assertType<typeof Data.Output, Data>();
    assertType<typeof Data.Error, DataError>();
    assertType<typeof Data.parent, null>();

    interface User {
      readonly name: string;
      readonly roles: ReadonlySet<string>;
    }
    interface Node {
      readonly value: string;
      readonly next?: Node;
    }
    interface InvalidNode {
      readonly next?: InvalidNode;
      readonly run: () => void;
    }

    assertType<User extends Data ? true : false, false>();
    assertType<IsData<User>, true>();
    assertType<IsData<Node>, true>();
    assertType<IsData<InvalidNode>, false>();
    assertType<IsData<string | ReadonlyArray<number>>, true>();
    assertType<IsData<string | (() => void)>, false>();
    assertType<IsData<symbol>, false>();
    assertType<IsData<{ readonly [key: symbol]: string }>, false>();
    assertType<IsData<any>, false>();
    assertType<IsData<unknown>, false>();
    assertType<IsData<object>, false>();
    assertType<IsData<NonNullable<unknown>>, false>();
    assertType<IsData<Readonly<Record<never, never>>>, false>();
    assertType<IsData<globalThis.ArrayBuffer>, false>();
    assertType<IsData<never>, true>();
    assertType<IsData<void>, true>();
  });

  it("accepts supported Data without changing identity", () => {
    const nullPrototype = globalThis.Object.assign(
      globalThis.Object.create(null) as { value?: Data },
      { value: 1 },
    );
    const values: ReadonlyArray<Data> = [
      undefined,
      null,
      true,
      false,
      "text",
      0,
      -0,
      globalThis.Number.NaN,
      globalThis.Number.POSITIVE_INFINITY,
      1n,
      [],
      {},
      [1, "two", undefined],
      { nested: { array: [1, 2, 3] } },
      nullPrototype,
      new Set([1, { nested: true }]),
      new Map<Data, Data>([
        ["key", { nested: true }],
        [{ objectKey: true }, new Set([1, 2])],
      ]),
      new globalThis.Date("2025-01-01T00:00:00.000Z"),
      new globalThis.Uint8Array(),
      new globalThis.Uint8Array([1, 2, 3]),
    ];

    for (const value of values) {
      const result = Data.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertTrue(Data.is(result.value));
      assertSame(Data.to(result.value), value);
      structuredClone(value);
    }
  });

  it("accepts cyclic and shared data graphs", () => {
    const object: { self?: Data } = {};
    const array: Array<Data> = [];
    const set = new Set<Data>();
    const map = new Map<Data, Data>();
    object.self = object;
    array.push(array);
    set.add(set);
    map.set(map, set);
    map.set("object", object);
    const shared = { value: 1 };
    const value = { object, array, set, map, first: shared, second: shared };

    assertOk(Data.fromUnknown(value), value);
    assertTrue(Data.is(value));
    assertSame(Data.to(value), value);
  });

  it("reports invalid leaves with their paths", () => {
    const symbol = globalThis.Symbol("symbol");
    const value = {
      array: [() => undefined],
      set: new Set([new WeakSet()]),
      map: new Map<unknown, unknown>([[() => undefined, /value/u]]),
    };

    assertEqual(
      Data.fromUnknown(value, { errors: "all" }),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [
            { kind: "InvalidType", path: ["array", 0], value: value.array[0] },
            {
              kind: "UnexpectedPrototype",
              path: ["set", 0],
              container: "Object",
              value: [...value.set][0],
            },
            {
              kind: "InvalidType",
              path: ["map", 0, "key"],
              value: [...value.map][0][0],
            },
            {
              kind: "UnexpectedPrototype",
              path: ["map", 0, "value"],
              container: "Object",
              value: [...value.map][0][1],
            },
          ],
        },
      }),
    );

    assertEqual(
      Data.fromUnknown(symbol),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [{ kind: "InvalidType", path: [], value: symbol }],
        },
      }),
    );

    for (const invalid of [
      symbol,
      () => undefined,
      new WeakMap(),
      /regexp/u,
      new globalThis.ArrayBuffer(),
    ]) {
      assertFalse(Data.fromUnknown(invalid).ok);
      assertFalse(Data.is(invalid));
    }
  });

  it("rejects detached and out-of-bounds Uint8Arrays", () => {
    const detachedBuffer = new globalThis.ArrayBuffer(1);
    const detached = new globalThis.Uint8Array(detachedBuffer);
    structuredClone(detachedBuffer, {
      transfer: [detachedBuffer],
    });

    const resizableBuffer = new globalThis.ArrayBuffer(4, {
      maxByteLength: 8,
    });
    const outOfBounds = new globalThis.Uint8Array(resizableBuffer, 2, 2);
    resizableBuffer.resize(1);

    for (const value of [detached, outOfBounds]) {
      const result = Data.fromUnknown(value);

      assertErr(result);
      assertLength(result.error.reason.issues, 1);
      const issue = result.error.reason.issues[0];
      assertSame(issue.kind, "InvalidUint8Array");
      assertEqual(issue.path, []);
      assertSame(issue.value, value);
      assertFalse(Data.is(value));
      assertFalse(Data.fromUnknown(value, { errors: "all" }).ok);
      assertThrowsInstanceOf(() => structuredClone(value), DOMException);
    }
  });

  it("rejects behavioral and hidden Object properties without reading them", () => {
    let reads = 0;
    const symbol = globalThis.Symbol("symbol");
    const value = globalThis.Object.defineProperties(
      { [symbol]: 1 },
      {
        accessor: {
          enumerable: true,
          get: () => {
            reads++;
            return 1;
          },
        },
        hidden: { enumerable: false, value: 1 },
      },
    );

    assertEqual(
      Data.fromUnknown(value, { errors: "all" }),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [
            { kind: "Accessor", path: ["accessor"] },
            { kind: "NonEnumerable", path: ["hidden"] },
            { kind: "SymbolProperty", path: [symbol] },
          ],
        },
      }),
    );
    assertEqual(reads, 0);
    assertEqual(
      Data.fromUnknown(value),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Accessor", path: ["accessor"] }],
        },
      }),
    );
    assertEqual(
      Data.fromUnknown(
        globalThis.Object.defineProperty({}, "hidden", { value: 1 }),
      ),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [{ kind: "NonEnumerable", path: ["hidden"] }],
        },
      }),
    );

    const tagged = globalThis.Object.defineProperty(
      {},
      globalThis.Symbol.toStringTag,
      {
        get: () => {
          reads++;
          return "Date";
        },
      },
    );
    assertEqual(
      Data.fromUnknown(tagged),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [
            { kind: "SymbolProperty", path: [globalThis.Symbol.toStringTag] },
          ],
        },
      }),
    );
    assertEqual(reads, 0);

    class Model {
      readonly value = 1;
    }

    const model = new Model();
    assertEqual(
      Data.fromUnknown(model),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "UnexpectedPrototype",
              path: [],
              container: "Object",
              value: model,
            },
          ],
        },
      }),
    );

    class NullBase extends null {}

    const nullBase = globalThis.Object.create(NullBase.prototype) as NullBase;
    assertEqual(
      Data.fromUnknown(nullBase),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "UnexpectedPrototype",
              path: [],
              container: "Object",
              value: nullBase,
            },
          ],
        },
      }),
    );
  });

  it("rejects non-data Array representations", () => {
    const sparse = createMutableArray<Data>(1);
    assertEqual(
      Data.fromUnknown(sparse),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Hole", path: [0] }],
        },
      }),
    );
    assertFalse(Data.fromUnknown(sparse, { errors: "all" }).ok);

    let reads = 0;
    const accessor = createMutableArray<Data>(1);
    globalThis.Object.defineProperty(accessor, 0, {
      enumerable: true,
      get: () => {
        reads++;
        return 1;
      },
    });
    assertEqual(
      Data.fromUnknown(accessor),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Accessor", path: [0] }],
        },
      }),
    );
    assertFalse(Data.fromUnknown(accessor, { errors: "all" }).ok);
    assertEqual(reads, 0);

    const symbol = globalThis.Symbol("symbol");
    const excess = globalThis.Object.assign([1], { metadata: "important" });
    globalThis.Object.defineProperty(excess, symbol, { value: true });
    assertFalse(Data.fromUnknown(excess).ok);
    assertEqual(
      Data.fromUnknown(excess, { errors: "all" }),
      err({
        type: "Data",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "ExcessProperty",
              path: ["metadata"],
              container: "Array",
            },
            {
              kind: "ExcessProperty",
              path: [symbol],
              container: "Array",
            },
          ],
        },
      }),
    );
  });

  it("rejects Set and Map own properties", () => {
    const set = globalThis.Object.assign(new Set<Data>(), {
      metadata: true,
    });
    const map = globalThis.Object.assign(new Map<Data, Data>(), {
      metadata: true,
    });
    for (const [value, container] of [
      [set, "Set"],
      [map, "Map"],
    ] as const) {
      assertEqual(
        Data.fromUnknown(value),
        err({
          type: "Data",
          reason: {
            kind: "Issues",
            issues: [
              {
                kind: "ExcessProperty",
                path: ["metadata"],
                container,
              },
            ],
          },
        }),
      );
    }
  });

  it("validates deeply nested values without recursive calls", () => {
    let value: Data = null;

    for (let depth = 0; depth < 20_000; depth++) value = [value];

    assertOk(Data.fromUnknown(value), value);
    assertTrue(Data.is(value));
  });

  it("formats every issue", () => {
    const invalid = () => undefined;
    const issues: ReadonlyArray<readonly [DataIssue, string]> = [
      [
        { kind: "InvalidType", path: [], value: invalid },
        `A value ${globalThis.String(invalid)} is not Data.`,
      ],
      [
        {
          kind: "UnexpectedPrototype",
          path: [],
          container: "Object",
          value: /regexp/u,
        },
        "A Data Object has an unexpected prototype.",
      ],
      [
        { kind: "Accessor", path: ["value"] },
        "A Data property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      ],
      [
        { kind: "NonEnumerable", path: ["value"] },
        "A Data Object property must be enumerable. Remove it or use a different Type.",
      ],
      [
        { kind: "SymbolProperty", path: [globalThis.Symbol("value")] },
        "A Data Object property key must be a string. Remove the symbol property or use a different Type.",
      ],
      [{ kind: "Hole", path: [0] }, "A Data Array element is missing."],
      [
        {
          kind: "InvalidUint8Array",
          path: [],
          value: new globalThis.Uint8Array(),
        },
        "A Data Uint8Array must have an attached, in-bounds ArrayBuffer.",
      ],
      [
        { kind: "ExcessProperty", path: ["metadata"], container: "Map" },
        "A Data Map must not have excess own properties. Remove the property or use a different Type.",
      ],
    ];

    for (const [issue, message] of issues) {
      assertSame(
        Data.formatError({
          type: "Data",
          reason: { kind: "Issues", issues: [issue] },
        }),
        message,
      );
    }
  });
});

describe("JsonValue", () => {
  it("exposes exact recursive data contracts", () => {
    assertType<typeof JsonValue, JsonValueType>();
    assertType<typeof JsonValue.Input, JsonValue>();
    assertType<typeof JsonValue.Output, JsonValue>();
    assertType<typeof JsonValue.Error, JsonValueError>();
    assertType<typeof JsonValue.parent, null>();

    assertType<
      JsonValueInput,
      string | number | boolean | null | JsonArrayInput | JsonObjectInput
    >();
    assertType<typeof JsonArray.Output, JsonArray>();
    assertType<typeof JsonObject.Output, JsonObject>();
    assertType<typeof JsonObject, JsonObjectType>();
  });

  it("accepts exact JSON data without changing identity", () => {
    const nullPrototype = globalThis.Object.assign(
      globalThis.Object.create(null) as JsonObjectInput,
      { value: 1 },
    );
    const values: ReadonlyArray<JsonValueInput> = [
      null,
      true,
      false,
      "text",
      0,
      -0,
      42,
      [],
      {},
      [1, "two", false, null],
      { nested: { array: [1, 2, 3] } },
      nullPrototype,
    ];

    for (const value of values) {
      const result = JsonValue.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertTrue(JsonValue.is(result.value));
      assertSame(JsonValue.to(result.value), result.value);
    }
  });

  it("provides exact top-level Array and Object Types", () => {
    const arrayValue: JsonArrayInput = [1, { nested: true }];
    const objectValue: JsonObjectInput = { value: [1, false, null] };
    const arrayResult = JsonArray.fromUnknown(arrayValue);
    const objectResult = JsonObject.fromUnknown(objectValue);

    assertOk(arrayResult, arrayValue);
    assertOk(objectResult, objectValue);
    assertTrue(JsonArray.is(arrayResult.value));
    assertTrue(JsonObject.is(objectResult.value));
    assertSame(JsonArray.to(arrayResult.value), arrayValue);
    assertSame(JsonObject.to(objectResult.value), objectValue);

    assertEqual(
      JsonArray.fromUnknown({}),
      err({
        type: "Array",
        reason: { kind: "NotArray", value: {} },
      }),
    );
    assertEqual(
      JsonObject.fromUnknown([]),
      err({
        type: "Record",
        reason: { kind: "NotPlainRecord", value: [] },
      }),
    );
    assertFalse(JsonObject.fromUnknown({ value: undefined }).ok);
  });

  it("reports invalid leaves with their paths", () => {
    const value = {
      nested: [1, globalThis.Number.POSITIVE_INFINITY],
      missing: undefined,
    };

    assertEqual(
      JsonValue.fromUnknown(value, { errors: "all" }),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "NonFiniteNumber",
              path: ["nested", 1],
              value: globalThis.Number.POSITIVE_INFINITY,
            },
            {
              kind: "InvalidType",
              path: ["missing"],
              value: undefined,
            },
          ],
        },
      }),
    );

    for (const invalid of [
      undefined,
      1n,
      globalThis.Symbol("symbol"),
      () => undefined,
      globalThis.Number.NaN,
      globalThis.Number.NEGATIVE_INFINITY,
    ]) {
      assertFalse(JsonValue.fromUnknown(invalid).ok);
      assertFalse(JsonValue.is(invalid));
    }
  });

  it("rejects behavioral and hidden Object properties without reading them", () => {
    let reads = 0;
    const symbol = globalThis.Symbol("symbol");
    const value = globalThis.Object.defineProperties(
      { [symbol]: 1 },
      {
        accessor: {
          enumerable: true,
          get: () => {
            reads++;
            return 1;
          },
        },
        hidden: { enumerable: false, value: 1 },
      },
    );

    assertEqual(
      JsonValue.fromUnknown(value, { errors: "all" }),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            { kind: "Accessor", path: ["accessor"] },
            { kind: "NonEnumerable", path: ["hidden"] },
            { kind: "SymbolProperty", path: [symbol] },
          ],
        },
      }),
    );
    assertEqual(reads, 0);

    assertEqual(
      JsonValue.fromUnknown(value),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Accessor", path: ["accessor"] }],
        },
      }),
    );
    assertEqual(
      JsonValue.fromUnknown(
        globalThis.Object.defineProperty({}, "hidden", {
          enumerable: false,
          value: 1,
        }),
      ),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "NonEnumerable", path: ["hidden"] }],
        },
      }),
    );
    assertEqual(
      JsonValue.fromUnknown({ [symbol]: 1 }),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "SymbolProperty", path: [symbol] }],
        },
      }),
    );

    class Model {
      readonly value = 1;
    }

    const model = new Model();

    assertEqual(
      JsonValue.fromUnknown(model, { errors: "all" }),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "UnexpectedPrototype",
              path: [],
              container: "Object",
              value: model,
            },
          ],
        },
      }),
    );

    for (const value of setupUnexpectedPrototypeValues()) {
      assertEqual(
        JsonValue.fromUnknown(value),
        err({
          type: "JsonValue",
          reason: {
            kind: "Issues",
            issues: [
              {
                kind: "UnexpectedPrototype",
                path: [],
                container: "Object",
                value,
              },
            ],
          },
        }),
      );
      assertFalse(JsonValue.is(value));
    }
  });

  it("rejects non-data Array representations", () => {
    const sparse = createMutableArray<JsonValueInput>(1);
    assertEqual(
      JsonValue.fromUnknown(sparse),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Hole", path: [0] }],
        },
      }),
    );

    let reads = 0;
    const accessor = createMutableArray<JsonValueInput>(1);
    globalThis.Object.defineProperty(accessor, 0, {
      enumerable: true,
      get: () => {
        reads++;
        return 1;
      },
    });
    assertEqual(
      JsonValue.fromUnknown(accessor),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Accessor", path: [0] }],
        },
      }),
    );
    assertEqual(reads, 0);

    const symbol = globalThis.Symbol("symbol");
    const allIssues = createMutableArray<JsonValueInput>(3);
    globalThis.Object.defineProperties(allIssues, {
      0: { enumerable: true, get: () => 1 },
      2: { enumerable: true, value: undefined },
      metadata: { enumerable: true, value: "important" },
      [symbol]: { enumerable: true, value: "important" },
    });
    assertEqual(
      JsonValue.fromUnknown(allIssues, { errors: "all" }),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            { kind: "ExcessProperty", path: ["metadata"] },
            { kind: "ExcessProperty", path: [symbol] },
            { kind: "Accessor", path: [0] },
            { kind: "Hole", path: [1] },
            { kind: "InvalidType", path: [2], value: undefined },
          ],
        },
      }),
    );

    const excess = globalThis.Object.assign([1], { metadata: "important" });
    assertEqual(
      JsonValue.fromUnknown(excess),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "ExcessProperty", path: ["metadata"] }],
        },
      }),
    );

    const customPrototype: ReadonlyArray<JsonValueInput> = [1, "two"];
    globalThis.Object.setPrototypeOf(customPrototype, {});
    const customPrototypeResult = JsonValue.fromUnknown(customPrototype, {
      errors: "all",
    });
    assertOk(customPrototypeResult, customPrototype);
    assertSame(customPrototypeResult.value, customPrototype);
    assertTrue(JsonValue.is(customPrototype));
  });

  it("rejects circular references but allows shared subtrees", () => {
    const circularObject: { self?: JsonValueInput } = {};
    circularObject.self = circularObject;
    assertEqual(
      JsonValue.fromUnknown(circularObject),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "CircularReference",
              path: ["self"],
              ancestorPath: [],
            },
          ],
        },
      }),
    );

    const circularArray: Array<JsonValueInput> = [];
    circularArray.push(circularArray);
    assertEqual(
      JsonValue.fromUnknown(circularArray),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "CircularReference",
              path: [0],
              ancestorPath: [],
            },
          ],
        },
      }),
    );
    assertEqual(
      JsonValue.fromUnknown(circularArray, { errors: "all" }),
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "CircularReference",
              path: [0],
              ancestorPath: [],
            },
          ],
        },
      }),
    );

    const shared = { value: 1 };
    const value = { first: shared, second: shared };
    assertOk(JsonValue.fromUnknown(value), value);
  });

  it("validates deeply nested values without recursive calls", () => {
    let value: JsonValueInput = null;

    for (let depth = 0; depth < 20_000; depth++) value = [value];

    const result = JsonValue.fromUnknown(value);
    assertOk(result);
    assertTrue(JsonValue.is(value));
  });

  it("asserts circular typed values as contract violations", () => {
    const value: Array<JsonValue> = [];
    value.push(value);
    const error: JsonValueError = {
      type: "JsonValue",
      reason: {
        kind: "Issues",
        issues: [
          {
            kind: "CircularReference",
            path: [0],
            ancestorPath: [],
          },
        ],
      },
    };

    assertAssertionError(
      () => JsonValue.to(value),
      "Expected JsonValue.",
      error,
    );
  });

  it("formats every issue", () => {
    const issues: ReadonlyArray<readonly [JsonValueIssue, string]> = [
      [
        { kind: "InvalidType", path: [], value: undefined },
        "A value undefined is not a JSON value.",
      ],
      [
        { kind: "NonFiniteNumber", path: [], value: Infinity },
        "A JSON number must be finite.",
      ],
      [
        {
          kind: "UnexpectedPrototype",
          path: [],
          container: "Object",
          value: new globalThis.Date(),
        },
        "The value is an object, but a JsonValue object must be a plain object or have a null prototype.",
      ],
      [
        { kind: "Accessor", path: ["value"] },
        "A JSON property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      ],
      [
        { kind: "NonEnumerable", path: ["value"] },
        "A JSON object property must be enumerable. Remove it or use a different Type.",
      ],
      [
        { kind: "SymbolProperty", path: [globalThis.Symbol("value")] },
        "A JSON object property key must be a string. Remove the symbol property or use a different Type.",
      ],
      [{ kind: "Hole", path: [0] }, "A JSON array element is missing."],
      [
        { kind: "ExcessProperty", path: ["metadata"] },
        "An excess JSON array property is not allowed. Remove it or use a different Type.",
      ],
      [
        { kind: "CircularReference", path: [0], ancestorPath: [] },
        "A JsonValue must not contain circular references.",
      ],
    ];

    for (const [issue, message] of issues) {
      assertSame(
        JsonValue.formatError({
          type: "JsonValue",
          reason: { kind: "Issues", issues: [issue] },
        }),
        message,
      );
    }
  });
});

describe("Json", () => {
  it("proves and preserves exact valid JSON text", () => {
    for (const value of [
      "null",
      "true",
      "false",
      '"text"',
      "42",
      "-0E0",
      "[]",
      "{}",
      ' { "value": 1 } ',
    ]) {
      const result = Json.fromUnknown(value);

      assertOk(result, value);
      assertSame(result.value, value);
      assertTrue(Json.is(result.value));
    }

    assertEqual(
      Json.fromUnknown("{ invalid }"),
      err({ type: "Json", value: "{ invalid }" }),
    );
    assertEqual(
      Json.fromUnknown("1e400"),
      err({ type: "Json", value: "1e400" }),
    );
    assertEqual(
      Json.fromUnknown(1),
      err({ type: "TypeOf", expected: "String", value: 1 }),
    );
    assertEqual(
      Json.formatError({ type: "Json", value: "invalid" }),
      'The value "invalid" cannot be parsed into a JsonValue.',
    );

    assertType<typeof Json.Input, string>();
    assertType<typeof Json.Output, Json>();
    assertType<typeof Json.Error, JsonError>();
    assertSame(Json.parent, String);
  });

  it("converts totally between proven text and exact data", () => {
    const json = Json.orThrow(' { "value": 1 } ');
    const value = jsonToJsonValue(json);

    assertEqual(value, { value: 1 });
    assertTrue(JsonValue.is(value));
    assertType<typeof value, JsonValue>();

    const encoded = jsonValueToJson(value);
    assertEqual(encoded, '{"value":1}');
    assertType<typeof encoded, Json>();
  });
});

describe("JsonValueFromJson", () => {
  it("decodes unknown strings and the proven Json boundary", () => {
    const fromUnknown = JsonValueFromJson.fromUnknown(
      ' { "value": [1, true, null] } ',
    );
    assertOk(fromUnknown, { value: [1, true, null] });
    assertTrue(JsonValue.is(fromUnknown.value));

    const json = Json.orThrow("1.000");
    const fromJson = JsonValueFromJson.from.parent(json);
    assertType<typeof fromJson, Result<JsonValue>>();
    assertOk(fromJson, 1);

    const fromString = JsonValueFromJson.from.parent.parent("invalid");
    assertType<typeof fromString, Result<JsonValue, JsonError>>();
    assertEqual(fromString, err({ type: "Json", value: "invalid" }));
  });

  it("canonically encodes JsonValue Outputs", () => {
    const value = jsonToJsonValue(Json.orThrow(' { "value": 1.000 } '));
    const values = getOrThrow(
      JsonValue.fromUnknown({
        'escaped"key': [null, true, false, "line\nbreak", 1.5],
        emptyArray: [],
        emptyObject: {},
      }),
    );

    assertEqual(JsonValueFromJson.to(value), '{"value":1}');
    {
      const actual = JsonValueFromJson.to(value);
      assertType<typeof actual, Json>();
    }
    assertEqual(jsonValueToJson(value), '{"value":1}');
    assertEqual(
      jsonValueToJson(values),
      '{"escaped\\"key":[null,true,false,"line\\nbreak",1.5],"emptyArray":[],"emptyObject":{}}',
    );
  });

  it("round-trips negative zero at every depth", () => {
    const negativeZero = FiniteNumber.orThrow(-0);
    const value = getOrThrow(JsonValue.fromUnknown([-0, { value: -0 }]));

    assertEqual(jsonValueToJson(negativeZero), "-0");
    assertEqual(JsonValueFromJson.to(negativeZero), "-0");
    assertSame(JsonValueFromJson.orThrow("-0"), negativeZero);

    const encoded = JsonValueFromJson.to(value);
    assertEqual(encoded, '[-0,{"value":-0}]');

    const decoded = getOrThrow(
      JsonArray.fromUnknown(JsonValueFromJson.orThrow(encoded)),
    );
    assertTrue(globalThis.Object.is(decoded[0], -0));
    const object = getOrThrow(JsonObject.fromUnknown(decoded[1]));
    assertSame(object.value, -0);

    const normalized = JsonValueFromJson.to(JsonValueFromJson.orThrow("-0E0"));
    assertEqual(normalized, "-0");
  });

  it("encodes deeply nested Outputs without recursive calls", () => {
    let value: JsonValue = null;

    for (let depth = 0; depth < 20_000; depth++) value = [value];

    const encoded = JsonValueFromJson.to(value);
    assertLength(encoded, 40_004);

    let decoded = JsonValueFromJson.orThrow(encoded);
    let depth = 0;
    while (Array.isArray(decoded)) {
      depth++;
      decoded = decoded[0];
    }

    assertEqual(depth, 20_000);
    assertSame(decoded, null);
  });
});

describe("json", () => {
  it("tracks the statically known CanonicalInput", () => {
    const _One = literal(1);
    const Key = brand("Key", String);
    const _Values = record(Key, String);
    const FiniteThroughTransform = transform(
      "FiniteThroughTransform",
      Number,
      FiniteNumber,
      {
        from: (value) => ok(value),
        to: (value) => value,
      },
    );
    const _RefinedFiniteThroughTransform = brand(
      "RefinedFiniteThroughTransform",
      FiniteThroughTransform,
    );
    const NumberThroughTransform = transform(
      "NumberThroughTransform",
      Number,
      Number,
      {
        from: (value) => ok(value),
        to: (value) => value,
      },
    );
    const _FiniteAfterNumberTransform = finite(NumberThroughTransform);
    const Person = object({
      name: String,
      age: Age,
      sequence: Int64FromInt64String,
    });

    assertType<typeof Number.CanonicalInput, number>();
    assertType<typeof NonNaNNumber.CanonicalInput, NonNaNNumber>();
    assertType<typeof FiniteNumber.CanonicalInput, FiniteNumber>();
    assertType<typeof Age.CanonicalInput, Age>();
    assertType<typeof Int64FromInt64String.CanonicalInput, Int64String>();
    assertType<typeof FiniteThroughTransform.CanonicalInput, FiniteNumber>();
    assertType<
      typeof _RefinedFiniteThroughTransform.CanonicalInput,
      FiniteNumber
    >();
    assertType<typeof _FiniteAfterNumberTransform.CanonicalInput, number>();
    assertType<typeof _One.CanonicalInput, 1>();
    assertType<
      typeof _Values.CanonicalInput extends typeof _Values.Input ? true : false,
      true
    >();
    assertType<
      typeof FiniteNumber.CanonicalInput extends typeof FiniteNumber.Input
        ? true
        : false,
      true
    >();
    assertType<
      typeof Int64FromInt64String.CanonicalInput extends typeof Int64FromInt64String.Input
        ? true
        : false,
      true
    >();
    interface PersonCanonicalInput {
      readonly name: string;
      readonly age: Age;
      readonly sequence: Int64String;
    }

    assertType<
      typeof Person.CanonicalInput extends PersonCanonicalInput ? true : false,
      true
    >();
    assertType<
      PersonCanonicalInput extends typeof Person.CanonicalInput ? true : false,
      true
    >();
    assertType<
      typeof Person.CanonicalInput extends typeof Person.Input ? true : false,
      true
    >();
    assertType<ReturnType<typeof Person.to>, typeof Person.CanonicalInput>();

    const compileTimeAssertions = () => {
      type InvalidCanonicalInput = Type<
        "InvalidCanonicalInput",
        string,
        string,
        TypeError<"InvalidCanonicalInput">,
        null,
        TypeError<"InvalidCanonicalInput">,
        never,
        // @ts-expect-error CanonicalInput must extend Input.
        number
      >;

      assertType<InvalidCanonicalInput extends object ? true : false, true>();

      // The encoder's actual image is finite, but CanonicalInput is number.
      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(_FiniteAfterNumberTransform, "FiniteAfterNumberTransformJson");
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("creates a branded Json Type and total typed conversions", () => {
    const Person = object({
      name: String,
      age: Age,
      sequence: Int64FromInt64String,
    });
    type Person = typeof Person.Output;
    const [PersonJson, personToPersonJson, personJsonToPerson] = json(
      Person,
      "PersonJson",
    );
    type PersonJson = typeof PersonJson.Output;
    const person = Person.orThrow({ name: "Ada", age: 42, sequence: "1" });

    assertType<typeof PersonJson.Input, string>();
    assertType<PersonJson, Json & Brand<"PersonJson">>();
    assertType<typeof personToPersonJson, (value: Person) => PersonJson>();
    assertType<typeof personJsonToPerson, (value: PersonJson) => Person>();
    assertType<typeof person.sequence, Int64>();

    const personJson = personToPersonJson(person);

    assertType<typeof personJson, PersonJson>();
    assertEqual(personJson, '{"name":"Ada","age":42,"sequence":"1"}');
    assertEqual(personJsonToPerson(personJson), person);
    {
      const actual = personJsonToPerson(personJson);
      assertType<typeof actual, Person>();
    }
    assertOk(PersonJson.fromUnknown(personJson), personJson);
    assertTrue(PersonJson.is(personJson));

    const invalidJson = '{"name":"Ada","age":200,"sequence":"1"}';
    const invalid = PersonJson.fromUnknown(invalidJson);

    assertErr(invalid);
    assertFalse(PersonJson.is(invalidJson));
    assertFalse(PersonJson.is("{ invalid }"));
    assertSame(invalid.error.type, "PersonJson");
    assertEqual(invalid.error.error.type, "Object");
    assertEqual(
      PersonJson.formatError(invalid.error),
      "The value 200 must be less than 200.",
    );
  });

  it("preserves the Json and String from boundaries", () => {
    const Value = object({ count: Int });
    const [ValueJson] = json(Value, "ValueJson");
    const invalidValue = Json.orThrow('{"count":1.5}');
    const invalidValueResult = ValueJson.from.parent(invalidValue);

    assertErr(invalidValueResult);
    assertSame(invalidValueResult.error.type, "ValueJson");
    assertEqual(invalidValueResult.error.error.type, "Object");
    assertEqual(
      ValueJson.from.parent.parent("{ invalid }"),
      err({ type: "Json", value: "{ invalid }" }),
    );
    assertEqual(
      ValueJson.fromUnknown(1),
      err({ type: "TypeOf", expected: "String", value: 1 }),
    );
    assertAssertionError(
      () => ValueJson.from.parent("{ invalid }" as Json),
      "Expected Json.",
      { type: "Json", value: "{ invalid }" },
    );
    assertAssertionError(
      () => ValueJson.from.parent(1 as unknown as Json),
      "Expected Json.",
      { type: "TypeOf", expected: "String", value: 1 },
    );
    assertAssertionError(
      () => ValueJson.from.parent.parent(1 as unknown as string),
      "Expected String.",
      { type: "TypeOf", expected: "String", value: 1 },
    );
  });

  it("parses once before validating the represented Type", async () => {
    const Value = object({ count: Int });
    const [ValueJson, valueToValueJson, valueJsonToValue] = json(
      Value,
      "ValueJson",
    );
    const value = Value.orThrow({ count: 1 });
    const encodedForComposition = valueToValueJson(value);
    const secondEncoded = valueToValueJson(Value.orThrow({ count: 2 }));
    const ChildValueJson = brand("ChildValueJson", ValueJson);
    const Container = object({ first: ValueJson, second: ValueJson });
    const [ContainerJson, containerToContainerJson] = json(
      Container,
      "ContainerJson",
    );
    const container = {
      first: encodedForComposition,
      second: secondEncoded,
    };
    const containerJson = containerToContainerJson(container);
    const duplicateContainerJson = containerToContainerJson({
      first: encodedForComposition,
      second: encodedForComposition,
    });
    const parse = mock.method(JSON, "parse");

    try {
      const encoded = valueToValueJson(value);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertOk(ValueJson.fromUnknown(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertTrue(ValueJson.is(encoded));
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertEqual(await ValueJson["~standard"].validate(encoded), {
        value: encoded,
      });
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertOk(ValueJson.from(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertOk(ValueJson.from.parent(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertOk(ValueJson.from.parent.parent(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertSame(ValueJson.orThrow(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertSame(ValueJson.orNull(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertSame(ValueJson.to(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertSame(ChildValueJson.orThrow(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      assertEqual(Container.orThrow(container), container);
      assertEqual(parse.mock.callCount(), 2);

      parse.mock.resetCalls();
      assertEqual(Container.orNull(container), container);
      assertEqual(parse.mock.callCount(), 2);

      parse.mock.resetCalls();
      assertSame(ContainerJson.orThrow(containerJson), containerJson);
      assertEqual(parse.mock.callCount(), 3);

      parse.mock.resetCalls();
      assertSame(
        ContainerJson.orThrow(duplicateContainerJson),
        duplicateContainerJson,
      );
      assertEqual(parse.mock.callCount(), 3);

      parse.mock.resetCalls();
      assertEqual(valueJsonToValue(encoded), value);
      assertEqual(parse.mock.callCount(), 1);

      parse.mock.resetCalls();
      const firstParsed = jsonToJsonValue(encoded);
      const secondParsed = jsonToJsonValue(encoded);
      assertFalse(globalThis.Object.is(firstParsed, secondParsed));
      assertEqual(parse.mock.callCount(), 2);
    } finally {
      parse.mock.restore();
    }
  });

  it("preserves one-parse Json parent validation after localization", () => {
    const [ValueJson] = json(String, "ValueJson");
    const LocalizedValueJson = localizeTypes(
      { ValueJson },
      {
        test: {
          Json: () => "Localized Json.",
          String: () => "Localized String.",
        },
      },
    ).test.ValueJson;
    const encoded = Json.orThrow('"value"');
    const parse = mock.method(JSON, "parse");

    try {
      assertOk(LocalizedValueJson.from.parent(encoded), encoded);
      assertEqual(parse.mock.callCount(), 1);
    } finally {
      parse.mock.restore();
    }
  });

  it("accepts only Types with a JSON-compatible canonical Input", () => {
    const compileTimeAssertions = () => {
      interface StringTree {
        readonly value: string;
        readonly children: ReadonlyArray<StringTree>;
      }
      interface StringTreeError extends ObjectError<{
        readonly value: TypeOfError<"String">;
        readonly children: ArrayError<StringTreeError>;
      }> {}
      const StringTree: LazyType<
        StringTree,
        StringTree,
        never,
        StringTreeError,
        StringTreeError
      > = lazy(() => object({ value: String, children: array(StringTree) }));
      interface InvalidTree {
        readonly value: undefined;
        readonly children: ReadonlyArray<InvalidTree>;
      }
      interface InvalidTreeError extends ObjectError<{
        readonly value: InferErrors<typeof Undefined>;
        readonly children: ArrayError<InvalidTreeError>;
      }> {}
      const InvalidTree: LazyType<
        InvalidTree,
        InvalidTree,
        never,
        InvalidTreeError,
        InvalidTreeError
      > = lazy(() =>
        object({ value: Undefined, children: array(InvalidTree) }),
      );
      interface Left {
        readonly right?: Right;
      }
      interface Right {
        readonly left?: Left;
      }
      interface LeftError extends ObjectError<{
        readonly right?: RightError;
      }> {}
      interface RightError extends ObjectError<{
        readonly left?: LeftError;
      }> {}
      const Left: LazyType<Left, Left, never, LeftError, LeftError> = lazy(() =>
        object({ right: optional(Right) }),
      );
      const Right: LazyType<Right, Right, never, RightError, RightError> = lazy(
        () => object({ left: optional(Left) }),
      );
      interface InvalidLeft {
        readonly child?: InvalidRight;
      }
      interface InvalidRight {
        readonly child?: InvalidLeft;
        readonly bad?: undefined;
      }
      interface InvalidLeftError extends ObjectError<{
        readonly child?: InvalidRightError;
      }> {}
      interface InvalidRightError extends ObjectError<{
        readonly child?: InvalidLeftError;
        readonly bad?: InferErrors<typeof Undefined>;
      }> {}
      const InvalidLeft: LazyType<
        InvalidLeft,
        InvalidLeft,
        never,
        InvalidLeftError,
        InvalidLeftError
      > = lazy(() => object({ child: optional(InvalidRight) }));
      const InvalidRight: LazyType<
        InvalidRight,
        InvalidRight,
        never,
        InvalidRightError,
        InvalidRightError
      > = lazy(() =>
        object({
          child: optional(InvalidLeft),
          bad: optional(Undefined),
        }),
      );
      interface RecursiveA {
        readonly child?: RecursiveB;
      }
      interface RecursiveB {
        readonly child?: RecursiveB | RecursiveBad;
      }
      interface RecursiveBad {
        readonly child?: RecursiveA;
        readonly bad?: undefined;
      }
      interface CompileTimeTypeError<
        Name extends TypeName,
      > extends TypeError<Name> {
        readonly value: unknown;
      }
      const RecursiveA = createType(
        "RecursiveA",
        (value): Result<RecursiveA, CompileTimeTypeError<"RecursiveA">> => {
          const seen = new Set<object>();
          const isRecursiveA = (value: unknown): value is RecursiveA => {
            if (value === null || typeof value !== "object") return false;
            if (seen.has(value)) return true;
            seen.add(value);

            if ("bad" in value && value.bad !== undefined) return false;
            return (
              !("child" in value) ||
              value.child === undefined ||
              isRecursiveA(value.child)
            );
          };

          return isRecursiveA(value)
            ? ok(value)
            : err({ type: "RecursiveA", value });
        },
        () => "",
      );
      interface AnyObjectError extends TypeError<"AnyObject"> {
        readonly value: unknown;
      }
      const AnyObject = createType(
        "AnyObject",
        (value): Result<object, AnyObjectError> =>
          value !== null && typeof value === "object"
            ? ok(value)
            : err({ type: "AnyObject", value }),
        () => "Expected an object.",
      );
      const metadata = globalThis.Symbol("metadata");
      interface SymbolProperty {
        readonly value: string;
        readonly [metadata]: undefined;
      }
      const isSymbolProperty = (value: unknown): value is SymbolProperty =>
        value !== null &&
        typeof value === "object" &&
        globalThis.Object.hasOwn(value, "value") &&
        typeof Reflect.get(value, "value") === "string" &&
        globalThis.Object.hasOwn(value, metadata) &&
        Reflect.get(value, metadata) === undefined;
      const SymbolProperty = createType(
        "SymbolProperty",
        (
          value,
        ): Result<SymbolProperty, CompileTimeTypeError<"SymbolProperty">> =>
          isSymbolProperty(value)
            ? ok(value)
            : err({ type: "SymbolProperty", value }),
        () => "",
      );
      // The alias is assignable to JsonObject; an interface does not reproduce
      // the IsExactlyJsonValue mutual-assignability false positive.
      type SymbolJsonObject = {
        readonly value: string;
        readonly [metadata]: undefined;
      };
      const SymbolJsonObject = createType(
        "SymbolJsonObject",
        (
          value,
        ): Result<
          SymbolJsonObject,
          CompileTimeTypeError<"SymbolJsonObject">
        > =>
          isSymbolProperty(value)
            ? ok(value)
            : err({ type: "SymbolJsonObject", value }),
        () => "",
      );
      const isStringArrayWithOwnProperty = <Key extends PropertyKey, Property>(
        value: unknown,
        key: Key,
        isProperty: (value: unknown) => value is Property,
      ): value is ReadonlyArray<string> & Readonly<Record<Key, Property>> =>
        Array.isArray(value) &&
        value.every((item): item is string => typeof item === "string") &&
        globalThis.Object.hasOwn(value, key) &&
        isProperty(Reflect.get(value, key));
      interface ArrayWithExtra extends ReadonlyArray<string> {
        readonly extra: undefined;
      }
      const ArrayWithExtra = createType(
        "ArrayWithExtra",
        (
          value,
        ): Result<ArrayWithExtra, CompileTimeTypeError<"ArrayWithExtra">> =>
          isStringArrayWithOwnProperty(
            value,
            "extra",
            (value): value is undefined => value === undefined,
          )
            ? ok(value)
            : err({ type: "ArrayWithExtra", value }),
        () => "",
      );
      interface WeirdArray extends ReadonlyArray<string> {
        readonly push: () => number;
      }
      const WeirdArray = createType(
        "WeirdArray",
        (value): Result<WeirdArray, CompileTimeTypeError<"WeirdArray">> =>
          isStringArrayWithOwnProperty(
            value,
            "push",
            (value): value is () => number => typeof value === "function",
          )
            ? ok(value)
            : err({ type: "WeirdArray", value }),
        () => "",
      );
      interface NegativeArrayIndex extends ReadonlyArray<string> {
        readonly "-1": string;
      }
      const NegativeArrayIndex = createType(
        "NegativeArrayIndex",
        (
          value,
        ): Result<
          NegativeArrayIndex,
          CompileTimeTypeError<"NegativeArrayIndex">
        > =>
          isStringArrayWithOwnProperty(
            value,
            "-1",
            (value): value is string => typeof value === "string",
          )
            ? ok(value)
            : err({ type: "NegativeArrayIndex", value }),
        () => "",
      );
      interface FractionalArrayIndex extends ReadonlyArray<string> {
        readonly "1.5": string;
      }
      const FractionalArrayIndex = createType(
        "FractionalArrayIndex",
        (
          value,
        ): Result<
          FractionalArrayIndex,
          CompileTimeTypeError<"FractionalArrayIndex">
        > =>
          isStringArrayWithOwnProperty(
            value,
            "1.5",
            (value): value is string => typeof value === "string",
          )
            ? ok(value)
            : err({ type: "FractionalArrayIndex", value }),
        () => "",
      );
      interface NonCanonicalArrayIndex extends ReadonlyArray<string> {
        readonly "01": string;
      }
      const NonCanonicalArrayIndex = createType(
        "NonCanonicalArrayIndex",
        (
          value,
        ): Result<
          NonCanonicalArrayIndex,
          CompileTimeTypeError<"NonCanonicalArrayIndex">
        > =>
          isStringArrayWithOwnProperty(
            value,
            "01",
            (value): value is string => typeof value === "string",
          )
            ? ok(value)
            : err({ type: "NonCanonicalArrayIndex", value }),
        () => "",
      );
      const Invalid = object({ value: Undefined });
      const OptionalUndefined = object({
        value: optional(undefinedOr(String)),
      });
      const UndefinedRecord = record(String, Undefined);
      const One = brand("One", literal(1));
      const JsonValueWithSymbolProperty = union(JsonValue, SymbolJsonObject);

      json(FiniteNumber, "FiniteNumberJson");
      json(Age, "AgeJson");
      json(literal(1), "OneJson");
      json(array(FiniteNumber), "FiniteNumbersJson");
      json(tuple(String, Int64FromInt64String), "TupleJson");
      json(record(String, FiniteNumber), "RecordJson");
      json(object({}), "EmptyObjectJson");
      json(object({ value: optional(String) }), "OptionalStringJson");
      json(union(String, FiniteNumber), "UnionJson");
      json(
        lazy(() => object({ value: FiniteNumber })),
        "LazyJson",
      );
      json(JsonValue, "JsonValueJson");
      json(JsonArray, "JsonArrayJson");
      json(JsonObject, "JsonObjectJson");
      json(StringTree, "StringTreeJson");
      json(Left, "LeftJson");
      json(One, "OneJson");
      json(array(One), "OnesJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(Number, "NumberJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(NonNaNNumber, "NonNaNNumberJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(literal(1n), "OneBigIntJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(set(String), "StringSetJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(Invalid, "InvalidJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(OptionalUndefined, "OptionalUndefinedJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(UndefinedRecord, "UndefinedRecordJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(InvalidTree, "InvalidTreeJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(InvalidLeft, "InvalidLeftJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(RecursiveA, "RecursiveAJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(AnyObject, "AnyObjectJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(SymbolProperty, "SymbolPropertyJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(JsonValueWithSymbolProperty, "JsonValueWithSymbolPropertyJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(ArrayWithExtra, "ArrayWithExtraJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(WeirdArray, "WeirdArrayJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(NegativeArrayIndex, "NegativeArrayIndexJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(FractionalArrayIndex, "FractionalArrayIndexJson");

      // @ts-expect-error Type CanonicalInput must be JSON-compatible.
      json(NonCanonicalArrayIndex, "NonCanonicalArrayIndexJson");
    };

    assertType<
      typeof compileTimeAssertions extends (...args: Array<never>) => unknown
        ? true
        : false,
      true
    >();
  });

  it("forwards ValidationOptions to the represented Type", () => {
    const Model = object({ name: String, age: FiniteNumber });
    const [ModelJson] = json(Model, "ModelJson");
    const value = Json.orThrow('{"name":1,"age":"wrong"}');
    const expected = err({
      type: "ModelJson",
      error: {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            name: {
              type: "TypeOf",
              expected: "String",
              value: 1,
            },
            age: {
              type: "TypeOf",
              expected: "Number",
              value: "wrong",
            },
          },
        },
      },
    });

    assertEqual(ModelJson.fromUnknown(value, { errors: "all" }), expected);
    assertEqual(ModelJson.from.parent(value, { errors: "all" }), expected);
  });

  it("reports every represented Type issue through Standard Schema", async () => {
    const Model = object({ name: String, age: FiniteNumber });
    const [ModelJson] = json(Model, "ModelJson");

    assertEqual(
      await ModelJson["~standard"].validate('{"name":1,"age":"wrong"}'),
      {
        issues: [
          { message: "A value 1 is not a string.", path: ["name"] },
          {
            message: 'A value "wrong" is not a number.',
            path: ["age"],
          },
        ],
      },
    );
    assertEqual(await ModelJson["~standard"].validate("{ invalid }"), {
      issues: [
        {
          message: 'The value "{ invalid }" cannot be parsed into a JsonValue.',
          path: [],
        },
      ],
    });
  });

  it("localizes represented Type issues transparently", async () => {
    const Model = object({ name: String, active: Boolean });
    const [ModelJson] = json(Model, "ModelJson");
    const LocalizedModelJson = localizeTypes(
      { ModelJson },
      {
        test: {
          Boolean: (error) => {
            assertType<typeof error, TypeOfError<"Boolean">>();
            return "Localized Boolean.";
          },
          Json: (error) => {
            assertType<typeof error, JsonError>();
            return "Localized Json.";
          },
          Object: () => "Localized Object.",
          String: (error) => {
            assertType<typeof error, TypeOfError<"String">>();
            return "Localized String.";
          },
        },
      },
    ).test.ModelJson;

    assertEqual(
      await LocalizedModelJson["~standard"].validate(
        '{"name":1,"active":"wrong"}',
      ),
      {
        issues: [
          { message: "Localized String.", path: ["name"] },
          { message: "Localized Boolean.", path: ["active"] },
        ],
      },
    );
    assertEqual(await LocalizedModelJson["~standard"].validate("[]"), {
      issues: [{ message: "Localized Object.", path: [] }],
    });
    assertEqual(await LocalizedModelJson["~standard"].validate("{ invalid }"), {
      issues: [{ message: "Localized Json.", path: [] }],
    });
  });

  it("asserts the encoded Json still decodes through the Type", () => {
    interface FrozenJsonObjectError extends TypeError<"FrozenJsonObject"> {
      readonly value: JsonObject;
    }

    const FrozenJsonObject = brand(
      "FrozenJsonObject",
      JsonObject,
      (value) =>
        globalThis.Object.isFrozen(value)
          ? ok()
          : err<FrozenJsonObjectError>({
              type: "FrozenJsonObject",
              value,
            }),
      () => "Expected a frozen JsonObject.",
    );
    const [FrozenJson, frozenJsonObjectToFrozenJson] = json(
      FrozenJsonObject,
      "FrozenJson",
    );
    const value = globalThis.Object.freeze(
      getOrThrow(JsonObject.fromUnknown({ answer: 42 })),
    );
    assertType(FrozenJsonObject, value);
    const encoded = jsonValueToJson(FrozenJsonObject.to(value));
    const result = FrozenJson.fromUnknown(encoded);

    assertErr(result);
    assertAssertionError(
      () => frozenJsonObjectToFrozenJson(value),
      "Expected FrozenJson.",
      result.error,
    );
  });
});

describe("design decisions", () => {
  describe("typed inputs", () => {
    it("protect append-only fields from incompatible component changes", () => {
      const compileTimeAssertions = () => {
        const Todo = object({ title: NonEmptyTrimmedString100 });

        // The input guarantees the same constraints as the domain model.
        const inputOnChange = (title: NonEmptyTrimmedString100) => {
          Todo.from({ title });
        };

        // Later, the component is redesigned to allow longer text.
        const longerInputOnChange = (title: NonEmptyTrimmedString1000) => {
          // Validation from unknown cannot warn about the changed contract.
          // imaginaryValidationLibrary.fromUnknown(title);

          // A schema input typed only as string has the same blind spot:
          // imaginaryValidationLibrary.from(title);

          // The input can now produce titles that cannot be stored in the
          // append-only `title` field. Everything still compiles, so the broken
          // form can ship.

          // Evolu exposes the incompatible component change as a type error.
          // The developer must keep the component limit or add a new field such
          // as `titleLonger`.
          // @ts-expect-error MaxLength1000 does not guarantee MaxLength100.
          Todo.from({ title });
        };

        return { inputOnChange, longerInputOnChange };
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("compose one weaker component output", () => {
      const compileTimeAssertions = () => {
        const Todo = object({
          title: NonEmptyTrimmedString100,
          note: NonEmptyTrimmedString100,
        });

        // The existing title input guarantees every domain constraint. A new
        // note input guarantees only that its output is trimmed.
        const saveTodo = (
          title: NonEmptyTrimmedString100,
          note: TrimmedString,
        ) => {
          // @ts-expect-error TrimmedString does not guarantee a non-empty value
          // with at most 100 characters.
          Todo.from({ title, note });

          // Validate only what the note input does not already guarantee.
          const todo = flatMapResult(
            Todo.props.note.from.parent.parent(note),
            (note) => Todo.from({ title, note }),
          );
          assertType<
            typeof todo,
            Result<typeof Todo.Output, MaxLengthError<100> | MinLengthError<1>>
          >();

          return todo;
        };

        return saveTodo;
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });

    it("compose trim-only component outputs", () => {
      const compileTimeAssertions = () => {
        const Todo = object({
          title: NonEmptyTrimmedString100,
          note: NonEmptyTrimmedString100,
        });

        // Both inputs guarantee only that their output is trimmed.
        const saveTodo = (title: TrimmedString, note: TrimmedString) =>
          flatMapResult(
            allResult({
              title: Todo.props.title.from.parent.parent(title),
              note: Todo.props.note.from.parent.parent(note),
            }),
            (todo) => Todo.from(todo),
          );

        assertType<
          ReturnType<typeof saveTodo>,
          Result<typeof Todo.Output, MaxLengthError<100> | MinLengthError<1>>
        >();

        return saveTodo;
      };

      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
    });
  });

  describe("assertions", () => {
    it("separates explicit decoding from exact Output membership", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ count: NumberFromString });
      const decoded = Model.fromUnknown({ count: "1" });

      assertOk(decoded, { count: 1 });
      assertFalse(Model.is({ count: "1" }));
      assertTrue(Model.is(decoded.value));
      assertEqual(Model.to({ count: 1 }), { count: "1" });

      let reads = 0;
      const exotic: typeof Model.Output = globalThis.Object.defineProperty(
        {} as { readonly count: number },
        "count",
        {
          enumerable: true,
          get: () => {
            reads++;
            return 1;
          },
        },
      );

      const result = Model.fromUnknown(exotic);
      assertErr(result, {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            count: {
              type: "ObjectPropertyAccess",
              reason: "Accessor",
            },
          },
        },
      });
      assertFalse(Model.is(exotic));
      assertAssertionError(
        () => Model.to(exotic),
        "Expected Object.",
        result.error,
      );
      assertEqual(reads, 0);
    });

    it("treat external invalidity as data and typed violations as bugs", () => {
      const Todo = object({ title: NonEmptyTrimmedString100 });

      // Invalid external data is expected and remains a typed Result error.
      assertFalse(Todo.fromUnknown({ title: "" }).ok);

      const todo = {
        title: NonEmptyTrimmedString100.orThrow("Buy milk"),
      };
      const encodeTodoForStorage = (todo: typeof Todo.Output) => Todo.to(todo);

      assertSame(encodeTodoForStorage(todo), todo);

      // TypeScript allows a widened object with extra properties. A developer
      // can therefore add derived data and reasonably believe it is stored.
      const todoWithSearchWords = {
        ...todo,
        titleSearchWords: todo.title.toLowerCase().split(" "),
      };
      assertType<
        typeof todoWithSearchWords extends typeof Todo.Output ? true : false,
        true
      >();

      // Evolu does not silently discard code and data that the schema cannot
      // represent. The assertion exposes the broken application contract.
      const result = Todo.fromUnknown(todoWithSearchWords);
      assertErr(result, {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            titleSearchWords: { type: "ObjectExcessProperty" },
          },
        },
      });
      assertAssertionError(
        () => encodeTodoForStorage(todoWithSearchWords),
        "Expected Object.",
        result.error,
      );
    });
  });
});
