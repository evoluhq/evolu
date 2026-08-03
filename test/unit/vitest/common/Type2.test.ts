import { expectErr, expectOk } from "@evolu/vitest";
import { assert, describe, expect, expectTypeOf, test } from "vitest";
import type { NonEmptyReadonlyArray } from "../../../../packages/common/src/Array.ts";
import type { Brand } from "../../../../packages/common/src/Brand.ts";
import * as cs from "../../../../packages/common/src/intl/cs.ts";
import {
  allResult,
  err,
  flatMapResult,
  getOrThrow,
  ok,
  type Result,
} from "../../../../packages/common/src/Result.ts";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  array,
  ArrayBuffer,
  assertType,
  between,
  BigInt,
  Boolean,
  brand,
  capitalized,
  CapitalizedString,
  createInstanceOfType,
  createType,
  Date,
  DateIso,
  discriminatedUnion,
  finite,
  FiniteNumber,
  Function,
  greaterThan,
  greaterThanOrEqualTo,
  int,
  Int,
  Int64,
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
  minLength,
  multipleOf,
  negative,
  NegativeInt,
  NegativeNumber,
  Never,
  NonEmptyTrimmedString,
  NonEmptyTrimmedString100,
  NonEmptyTrimmedString1000,
  nonNaN,
  NonNaNNumber,
  nonNegative,
  NonNegativeFiniteNumber,
  NonNegativeInt,
  NonNegativeNumber,
  nonPositive,
  NonPositiveInt,
  NonPositiveNumber,
  Null,
  nullishOr,
  nullOr,
  Number,
  Object,
  object,
  onePositiveInt,
  optional,
  positive,
  PositiveDecimalString,
  PositiveInt,
  PositiveNumber,
  Ratio,
  record,
  regex,
  String,
  Symbol,
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
  UrlSafeString,
  zeroNonNegativeInt,
  type ArrayElementIssue,
  type ArrayElementsError,
  type ArrayError,
  type ArrayExcessPropertyIssue,
  type ArrayIssue,
  type ArrayItemsError,
  type ArrayType,
  type BrandFactory,
  type BrandType,
  type CapitalizedError,
  type DateIsoError,
  type DiscriminatedUnionError,
  type DiscriminatedUnionMemberError,
  type DiscriminatedUnionMemberIssue,
  type DiscriminatedUnionType,
  type FiniteError,
  type GreaterThanError,
  type InferErrors,
  type InstanceConstructor,
  type InstanceOfError,
  type InstanceOfType,
  type Int64Error,
  type IntError,
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
  type MinLengthError,
  type NegativeError,
  type NeverError,
  type NonNaNError,
  type NonNegativeError,
  type NonPositiveError,
  type ObjectError,
  type ObjectExcessPropertyError,
  type ObjectMissingPropertyError,
  type ObjectPropertiesError,
  type ObjectPropertyAccessError,
  type ObjectType,
  type OptionalProperty,
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
  type TransformError,
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
  type UInt64Error,
  type UnionError,
  type UnionInputType,
  type UnionMemberError,
  type UnionType,
  type ValidationOptions,
} from "../../../../packages/common/src/Type2.ts";

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

const expectAssertionError = (
  operation: () => unknown,
  message: string,
  cause: unknown,
): void => {
  let thrown: unknown;

  try {
    operation();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, "Expected an Error.");
  expect(thrown.message).toBe(message);
  expect(thrown.cause).toEqual(cause);
};

describe("Type", () => {
  test("exposes every non-Lazy Type name through introspection", () => {
    type Type2Module =
      typeof import("../../../../packages/common/src/Type2.ts");
    type ExportedTypeKey = {
      readonly [Key in keyof Type2Module]: Type2Module[Key] extends TypeNode
        ? Key
        : never;
    }[keyof Type2Module];
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
      ArrayBuffer,
      BigInt,
      Boolean,
      CapitalizedString,
      Date,
      DateIso,
      FiniteNumber,
      Function,
      Int,
      Int64,
      Json,
      JsonArray,
      JsonObject,
      JsonValue,
      JsonValueFromJson,
      NegativeInt,
      NegativeNumber,
      Never,
      NonEmptyTrimmedString,
      NonEmptyTrimmedString100,
      NonEmptyTrimmedString1000,
      NonNaNNumber,
      NonNegativeFiniteNumber,
      NonNegativeInt,
      NonNegativeNumber,
      NonPositiveInt,
      NonPositiveNumber,
      Null,
      Number,
      Object,
      PositiveInt,
      PositiveDecimalString,
      PositiveNumber,
      Ratio,
      String,
      Symbol,
      TrimmedString,
      UInt64,
      Uint8Array,
      Undefined,
      Unknown,
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
      regex("IntrospectionRegex", /introspection/)(String),
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
      record(regex("IntrospectionKey", /^key/)(String), NumberFromString),
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
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      createInstanceOfType(class IntrospectionInstance {}),
    );
    const allTypes = [
      ...globalThis.Object.values(exportedTypes),
      combinations,
    ] as const;
    const expectedNames = [
      "Array",
      "Between6-7",
      "BigInt",
      "Boolean",
      "Capitalized",
      "DateIso",
      "DiscriminatedUnion",
      "Finite",
      "Function",
      "GreaterThan1",
      "GreaterThanOrEqualTo2",
      "InstanceOf",
      "Int",
      "Int64",
      "IntrospectionChild",
      "IntrospectionKey",
      "IntrospectionRegex",
      "IntrospectionRoot",
      "Json",
      "JsonValue",
      "JsonValueFromJson",
      "Length4",
      "LessThan3",
      "LessThanOrEqualTo1",
      "LessThanOrEqualTo4",
      "Literal",
      "MaxLength100",
      "MaxLength1000",
      "MaxLength3",
      "MinLength1",
      "MinLength2",
      "MultipleOf5",
      "Negative",
      "Never",
      "NonNaN",
      "NonNegative",
      "NonPositive",
      "Number",
      "NumberFromString",
      "Object",
      "Positive",
      "PositiveDecimalString",
      "Ratio",
      "Record",
      "String",
      "Symbol",
      "Trimmed",
      "Tuple",
      "UInt64",
      "Union",
      "Unknown",
      "UrlSafeString",
    ] as const;

    expectTypeOf<
      IntrospectedTypeNames<(typeof allTypes)[number]>
    >().toEqualTypeOf<(typeof expectedNames)[number]>();

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
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "parent" in value &&
      "fromUnknown" in value;
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

    expect([...names].sort()).toEqual(expectedNames);
  });

  test("is nominal", () => {
    const Answer = literal(42);
    // The private symbol makes TypeNode nominal.
    type StructuralAnswer = Omit<typeof Answer, symbol>;

    expectTypeOf(Answer).toExtend<TypeNode>();
    expectTypeOf<StructuralAnswer>().not.toExtend<TypeNode>();
  });

  test("exposes its typed default error formatter", () => {
    expect(
      String.formatError({ type: "TypeOf", expected: "String", value: 42 }),
    ).toBe("A value 42 is not a string.");
    expectTypeOf(String.formatError)
      .parameter(0)
      .toEqualTypeOf<TypeOfError<"String">>();
  });

  test("does not expose error formatting through TypeNode", () => {
    expectTypeOf<"formatError">().not.toExtend<keyof TypeNode>();
  });

  test("does not expose encoding through TypeNode", () => {
    expectTypeOf<"to">().not.toExtend<keyof TypeNode>();
  });

  test("encodes validation-only Types without changing their values", () => {
    const dateIso = getOrThrow(DateIso.from.parent("2024-01-01T00:00:00.000Z"));

    expect(String.to("value")).toBe("value");
    expect(DateIso.to(dateIso)).toBe("2024-01-01T00:00:00.000Z");
    expectTypeOf(DateIso.to(dateIso)).toEqualTypeOf<string>();
  });

  test("does not expose partial encoding operations", () => {
    const A = brand("OperationA", String);
    const B = brand("OperationB", A);

    expectTypeOf<"parent">().not.toExtend<keyof typeof B.to>();
    expect("parent" in B.to).toBe(false);
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

    type NarrowName = VarianceType<"Variance">;
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

    test("makes Name and Error covariant", () => {
      expectTypeOf<NarrowName>().toExtend<BroadName>();
      expectTypeOf<BroadName>().not.toExtend<NarrowName>();
      expectTypeOf<NarrowOwnError>().toExtend<BroadOwnError>();
      expectTypeOf<BroadOwnError>().not.toExtend<NarrowOwnError>();
    });

    test("makes Input, Output, Parent, and Errors invariant", () => {
      expectTypeOf<NarrowInput>().not.toExtend<BroadInput>();
      expectTypeOf<BroadInput>().not.toExtend<NarrowInput>();
      expectTypeOf<NarrowOutput>().not.toExtend<BroadOutput>();
      expectTypeOf<BroadOutput>().not.toExtend<NarrowOutput>();
      expectTypeOf<NarrowErrors>().not.toExtend<BroadErrors>();
      expectTypeOf<BroadErrors>().not.toExtend<NarrowErrors>();
      expectTypeOf<WithNarrowParent>().not.toExtend<WithBroadParent>();
      expectTypeOf<WithBroadParent>().not.toExtend<WithNarrowParent>();
    });
  });
});

describe("assertType", () => {
  test("narrows values that satisfy a Type Output", () => {
    const value: unknown = 42;

    assertType(Number, value);

    expectTypeOf(value).toEqualTypeOf<number>();
  });

  test("rejects values that satisfy only a transformed Type Input", () => {
    const NumberFromString = setupNumberFromString();

    expectAssertionError(
      () => assertType(NumberFromString, "42"),
      'A value "42" is not a number.',
      {
        type: "NumberFromString",
        outputError: {
          type: "TypeOf",
          expected: "Number",
          value: "42",
        },
      },
    );
  });
});

describe("Standard Schema", () => {
  test("infers the exact Input and Output", () => {
    const _NumberFromString = setupNumberFromString();

    expectTypeOf<
      StandardSchemaV1.InferInput<typeof _NumberFromString>
    >().toEqualTypeOf<string>();
    expectTypeOf<
      StandardSchemaV1.InferOutput<typeof _NumberFromString>
    >().toEqualTypeOf<number>();
  });

  test("decodes synchronously through transformations", async () => {
    const NumberFromString = setupNumberFromString();
    const result = NumberFromString["~standard"].validate("42");

    expect(result).not.toBeInstanceOf(Promise);
    expect(await result).toEqual({ value: 42 });
  });

  test("returns every nested Object and Array issue with its path", async () => {
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

    expect(result).toEqual({
      issues: [
        { message: "A value 1 is not a string.", path: ["labels", 0] },
        { message: "A value 2 is not a string.", path: ["labels", 1] },
        { message: 'A value "1" is not a number.', path: ["count"] },
        { message: "A required property is missing.", path: ["required"] },
        {
          message:
            "An excess property is not allowed. Remove it or use a different Type.",
          path: ["excess"],
        },
      ],
    });
  });

  test("locates Array holes, accessors, and excess properties", async () => {
    const symbol = globalThis.Symbol("metadata");
    const value = new globalThis.Array<unknown>(3);
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

    expect(result).toEqual({
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

  test("locates Tuple issues", async () => {
    const result = await tuple(String, Number)["~standard"].validate([1, "2"]);

    expect(result).toEqual({
      issues: [
        { message: "A value 1 is not a string.", path: [0] },
        { message: 'A value "2" is not a number.', path: [1] },
      ],
    });
  });

  test("locates Tuple structural issues", async () => {
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

    expect(result).toEqual({
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

  test("locates Record key, value, and structural issues", async () => {
    const Values = record(regex("RecordKey", /^value/)(String), Number);
    const input = { invalid: 1, value: "1" };
    globalThis.Object.defineProperty(input, "hidden", {
      enumerable: false,
      value: 1,
    });
    const result = await Values["~standard"].validate(input);

    expect(result).toEqual({
      issues: [
        {
          message: 'The value "invalid" does not match /^value/.',
          path: ["invalid"],
        },
        { message: 'A value "1" is not a number.', path: ["value"] },
        {
          message: 'The value "hidden" does not match /^value/.',
          path: ["hidden"],
        },
        {
          message: 'A record property "hidden" must be enumerable.',
          path: ["hidden"],
        },
      ],
    });
  });

  test("does not duplicate Object Record property paths", async () => {
    const Model = object(
      { fixed: array(Number) },
      record(String, array(Number)),
    );
    const result = await Model["~standard"].validate({
      fixed: [1],
      values: ["1"],
    });

    expect(result).toEqual({
      issues: [
        { message: 'A value "1" is not a number.', path: ["values", 0] },
      ],
    });
  });

  test("returns one Union issue at the current path", async () => {
    const Model = object({ value: union(String, Number) });
    const result = await Model["~standard"].validate({ value: null });

    expect(result).toEqual({
      issues: [
        {
          message: "A value does not match any union member.",
          path: ["value"],
        },
      ],
    });
  });

  test("locates DiscriminatedUnion routing and member issues", async () => {
    const Created = typed("Created", { value: String });
    const Deleted = typed("Deleted", { reason: Number });
    const Event = discriminatedUnion(Created, Deleted);

    expect(await Event["~standard"].validate({ type: "Unknown" })).toEqual({
      issues: [
        {
          message:
            'The discriminator property "type" has an unexpected value "Unknown".',
          path: ["type"],
        },
      ],
    });
    expect(
      await Event["~standard"].validate({ type: "Created", value: 1 }),
    ).toEqual({
      issues: [{ message: "A value 1 is not a string.", path: ["value"] }],
    });
  });

  test("locates transformation output issues", async () => {
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

    expect(result).toEqual({
      issues: [
        {
          message: "The value 0 must be positive (> 0).",
          path: ["value"],
        },
      ],
    });
  });

  test("locates directly recursive Lazy issues", async () => {
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

    expect(result).toEqual({
      issues: [
        {
          message: "A value 1 is not a string.",
          path: ["children", 0, "value"],
        },
      ],
    });
  });

  test("locates mutually recursive Lazy issues", async () => {
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

    expect(result).toEqual({
      issues: [
        {
          message: "A value 1 is not a string.",
          path: ["right", "left", "label"],
        },
      ],
    });
  });

  test("uses localized messages without changing paths", async () => {
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

    expect(result).toEqual({
      issues: [
        { message: "Hodnota musí být text.", path: ["labels", 0] },
        { message: "Text nesmí být prázdný.", path: ["labels", 1] },
      ],
    });
  });

  test("uses JsonValue issue paths", async () => {
    const result = await JsonValue["~standard"].validate({
      values: [1, globalThis.Number.POSITIVE_INFINITY],
    });

    expect(result).toEqual({
      issues: [
        {
          message: "A JSON number must be finite.",
          path: ["values", 1],
        },
      ],
    });
  });
});

describe("localizeTypes", () => {
  test("creates localized Type collections for every locale", () => {
    const Label = minLength(1)(String);
    const Types = localizeTypes(
      { Label },
      {
        cs: {
          MinLength1: (error) => {
            expectTypeOf(error).toEqualTypeOf<MinLengthError<1>>();
            return "Text nesmí být prázdný.";
          },
          String: (error) => {
            expectTypeOf(error).toEqualTypeOf<TypeOfError<"String">>();
            return "Hodnota musí být text.";
          },
        },
        en: {
          MinLength1: () => "Text must not be empty.",
          String: () => "The value must be text.",
        },
      },
    );

    expectTypeOf<keyof typeof Types>().toEqualTypeOf<"cs" | "en">();
    expectTypeOf(Types.cs.Label).toEqualTypeOf(Label);
    expect(Types.cs.Label).not.toBe(Label);

    const invalidType = Types.cs.Label.fromUnknown(1);
    assert(!invalidType.ok);
    expect(Types.cs.Label.formatError(invalidType.error)).toBe(
      "Hodnota musí být text.",
    );

    const invalidLength = Types.cs.Label.fromUnknown("");
    assert(!invalidLength.ok);
    expect(Types.cs.Label.formatError(invalidLength.error)).toBe(
      "Text nesmí být prázdný.",
    );
    expect(Types.en.Label.formatError(invalidLength.error)).toBe(
      "Text must not be empty.",
    );
    expect(Label.formatError(invalidLength.error)).toBe(
      'The value "" does not meet the minimum length of 1.',
    );
  });

  test("shares a locale registry across composed Types", () => {
    const Label = minLength(1)(String);
    const Labels = array(Label);
    const Model = object({ labels: Labels });
    const Types = localizeTypes(
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

    expect(Types.Label.parent).toBe(Types.String);

    for (const [value, message] of [
      [null, "Localized Object."],
      [{ labels: null }, "Localized Array."],
      [{ labels: [1] }, "Localized String."],
      [{ labels: [""] }, "Localized MinLength1."],
    ] as const) {
      const result = Types.Model.fromUnknown(value);
      assert(!result.ok);
      expect(Types.Model.formatError(result.error)).toBe(message);
    }

    const labelResult = Types.Label.fromUnknown(1);
    assert(!labelResult.ok);
    assert(labelResult.error.type === "TypeOf");
    expect(Types.Label.formatError(labelResult.error)).toBe(
      "Localized String.",
    );
    expect(Types.Label.parent.formatError(labelResult.error)).toBe(
      "Localized String.",
    );
  });

  test("preserves Type APIs and formats typed boundary assertions", () => {
    const Strings = array(String);
    const Types = localizeTypes(
      { PositiveNumber, Strings },
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

    expectTypeOf(Types.Strings).toEqualTypeOf(Strings);
    expect(Types.Strings.element).toBe(String);
    expect(Types.Strings.to(["Evolu"])).toEqual(["Evolu"]);

    const positiveError = { type: "Positive", value: 0 } as const;
    for (const operation of [
      () => Types.PositiveNumber.from(0 as PositiveNumber),
      () => Types.PositiveNumber.to(0 as PositiveNumber),
    ]) {
      expectAssertionError(operation, "Localized Positive.", positiveError);
    }

    const numberError = {
      type: "TypeOf",
      expected: "Number",
      value: "1",
    } as const;
    for (const operation of [
      () => Types.PositiveNumber.from.parent.parent("1" as unknown as number),
      () => Types.PositiveNumber.orThrow("1" as unknown as number),
      () => Types.PositiveNumber.orNull("1" as unknown as number),
    ]) {
      expectAssertionError(operation, "Localized Number.", numberError);
    }
  });

  test("routes Tuple and Record child errors", () => {
    const Pair = tuple(String, Number);
    const Values = record(String, Number);
    const KeyedValues = record(regex("RecordKey", /^value$/)(String), Number);
    const Model = object({ fixed: String }, record(String, String));
    const Types = localizeTypes(
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

    const notTuple = Types.Pair.fromUnknown(null);
    assert(!notTuple.ok);
    expect(Types.Pair.formatError(notTuple.error)).toBe("Localized Tuple.");

    const invalidTupleElement = Types.Pair.fromUnknown(["value", false]);
    assert(!invalidTupleElement.ok);
    expect(Types.Pair.formatError(invalidTupleElement.error)).toBe(
      "Localized Number.",
    );

    const notRecord = Types.Values.fromUnknown(null);
    assert(!notRecord.ok);
    expect(Types.Values.formatError(notRecord.error)).toBe("Localized Record.");

    const invalidRecordValue = Types.Values.fromUnknown({ value: false });
    assert(!invalidRecordValue.ok);
    expect(Types.Values.formatError(invalidRecordValue.error)).toBe(
      "Localized Number.",
    );

    const invalidRecordKey = Types.KeyedValues.fromUnknown({ invalid: 1 });
    assert(!invalidRecordKey.ok);
    expect(Types.KeyedValues.formatError(invalidRecordKey.error)).toBe(
      "Localized RecordKey.",
    );

    const invalidObjectRest = Types.Model.fromUnknown({
      fixed: "fixed",
      value: false,
    });
    assert(!invalidObjectRest.ok);
    expect(Types.Model.formatError(invalidObjectRest.error)).toBe(
      "Localized String.",
    );
  });

  test("lets a Union own its complete failure", () => {
    const Value = union(String, Number);
    const Types = localizeTypes(
      { Value },
      { test: { Union: () => "Localized Union." } },
    ).test;
    const result = Types.Value.fromUnknown(null);

    assert(!result.ok);
    expect(Types.Value.formatError(result.error)).toBe("Localized Union.");
  });

  test("routes DiscriminatedUnion member errors", () => {
    const Created = typed("Created", { value: String });
    const Deleted = typed("Deleted", { reason: Number });
    const Event = discriminatedUnion(Created, Deleted);
    const Types = localizeTypes(
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
      const result = Types.Event.fromUnknown(value);
      assert(!result.ok);
      expect(Types.Event.formatError(result.error)).toBe(message);
    }
  });

  test("uses a custom root error type as its formatter key", () => {
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
    const Types = localizeTypes(
      { Root },
      { test: { RootError: () => "Localized RootError." } },
    ).test;
    const result = Types.Root.fromUnknown(1);

    assert(!result.ok);
    expect(Types.Root.formatError(result.error)).toBe("Localized RootError.");
  });

  test("routes custom root TypeOf errors by their expected Types", async () => {
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
            expectTypeOf(error).toEqualTypeOf<TypeOfError<"String">>();
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
            expectTypeOf(error).toEqualTypeOf<TypeOfError<"BigInt">>();
            return "Localized BigInt.";
          },
        },
      },
    ).test.BigInteger;
    const textResult = LocalizedText.fromUnknown(1);
    const bigIntegerResult = LocalizedBigInteger.fromUnknown(1);

    assert(!textResult.ok);
    expect(LocalizedText.formatError(textResult.error)).toBe(
      "Localized String.",
    );
    expect(await LocalizedText["~standard"].validate(1)).toEqual({
      issues: [{ message: "Localized String.", path: [] }],
    });
    assert(!bigIntegerResult.ok);
    expect(LocalizedBigInteger.formatError(bigIntegerResult.error)).toBe(
      "Localized BigInt.",
    );
    expect(await LocalizedBigInteger["~standard"].validate(1)).toEqual({
      issues: [{ message: "Localized BigInt.", path: [] }],
    });
  });

  test("routes parent, own, and output transformation errors", () => {
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
    const Types = localizeTypes(
      { NumberFromString, PositiveFromString },
      {
        test: {
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
      const result = Types.NumberFromString.fromUnknown(value);
      assert(!result.ok);
      expect(Types.NumberFromString.formatError(result.error)).toBe(message);
    }

    const invalidOutput = Types.PositiveFromString.fromUnknown("0");
    assert(!invalidOutput.ok);
    expect(Types.PositiveFromString.formatError(invalidOutput.error)).toBe(
      "Localized Positive.",
    );
  });

  test("infers formatters through directly recursive Lazy errors", () => {
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
    const Types = localizeTypes({ Tree }, { test: formatters }).test;
    const InputTypes = localizeTypes(
      { TreeInput: Tree.parent },
      { test: formatters },
    ).test;
    const result = Types.Tree.fromUnknown({
      value: "root",
      children: [{ value: 1, children: [] }],
    });

    assert(!result.ok);
    expect(Types.Tree.formatError(result.error)).toBe("Localized String.");

    const inputResult = InputTypes.TreeInput.fromUnknown({
      value: 1,
      children: [],
    });
    assert(!inputResult.ok);
    expect(InputTypes.TreeInput.formatError(inputResult.error)).toBe(
      "Localized String.",
    );
  });

  test("infers formatters through mutually recursive Lazy errors", () => {
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
    const Types = localizeTypes(
      { Left, Right },
      {
        test: {
          Number: () => "Localized Number.",
          Object: () => "Localized Object.",
          String: () => "Localized String.",
        },
      },
    ).test;
    const result = Types.Left.fromUnknown({
      label: "left",
      right: { count: "invalid" },
    });

    assert(!result.ok);
    expect(Types.Left.formatError(result.error)).toBe("Localized Number.");
  });

  test("snapshots each locale formatter set", () => {
    const formatters = { String: () => "First formatter." };
    const Types = localizeTypes(
      { String, Text: String },
      { test: formatters },
    ).test;

    formatters.String = () => "Replacement formatter.";

    const result = Types.String.fromUnknown(1);
    assert(!result.ok);
    expect(Types.String.formatError(result.error)).toBe("First formatter.");
    expect(Types.Text).toBe(Types.String);
  });

  test("requires exactly the reachable formatters", () => {
    const Label = minLength(1)(String);
    const compileTimeAssertions = () => {
      localizeTypes(
        { Label },
        {
          // @ts-expect-error String is missing.
          missing: { MinLength1: () => "Missing String." },
        },
      );
      localizeTypes(
        { Label },
        {
          excess: {
            MinLength1: () => "MinLength1.",
            String: () => "String.",
            // @ts-expect-error Number is not reachable.
            Number: () => "Number.",
          },
        },
      );
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });
});

describe("createType", () => {
  test("creates a root Type", () => {
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

    expect(Answer.fromUnknown(answer)).toEqual(ok(42));
    expect(Answer.fromUnknown(41)).toEqual(err({ type: "Answer", value: 41 }));
    expect(Answer.formatError({ type: "Answer", value: 41 })).toBe(
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
      expectAssertionError(operation, "The answer must be 42.", cause);
    }
  });

  test("creates a child Type with inherited errors", () => {
    const NonEmptyString = createType(
      "NonEmptyString",
      String,
      (value): Result<string, NonEmptyStringError> =>
        value.length > 0 ? ok(value) : err({ type: "NonEmptyString", value }),
      (error) => {
        expectTypeOf(error).toEqualTypeOf<NonEmptyStringError>();
        return "Enter some text.";
      },
    );

    interface NonEmptyStringError extends TypeError<"NonEmptyString"> {
      readonly value: string;
    }

    expect(NonEmptyString.parent).toBe(String);
    expectTypeOf(NonEmptyString.parent).toEqualTypeOf<typeof String>();
    expectTypeOf<typeof NonEmptyString.Input>().toEqualTypeOf<string>();
    expectTypeOf<typeof NonEmptyString.Output>().toEqualTypeOf<string>();
    expectTypeOf<
      typeof NonEmptyString.Error
    >().toEqualTypeOf<NonEmptyStringError>();

    expect(NonEmptyString.fromUnknown("Evolu")).toEqual(ok("Evolu"));
    expect(NonEmptyString.fromUnknown(42)).toEqual(
      err({ type: "TypeOf", expected: "String", value: 42 }),
    );
    expect(NonEmptyString.fromUnknown("")).toEqual(
      err({ type: "NonEmptyString", value: "" }),
    );
    expect(NonEmptyString.from.parent("")).toEqual(
      err({ type: "NonEmptyString", value: "" }),
    );
    expect(
      NonEmptyString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
    ).toBe("A value 42 is not a string.");
    expect(
      NonEmptyString.formatError({ type: "NonEmptyString", value: "" }),
    ).toBe("Enter some text.");
  });

  test("asserts that validation callbacks preserve identity", () => {
    const Model = object({ value: Number });
    const Invalid = createType("InvalidRefinement", Model, (value) =>
      ok({ ...value }),
    );
    const InvalidRoot = createType(
      "InvalidRootRefinement",
      (value): Result<object, never> => ok({ ...(value as object) }),
      () => "",
    );
    const value = { value: 1 };

    expect(() => InvalidRoot.fromUnknown(value)).toThrow(
      "A Type refinement must return its input.",
    );
    expect(() => Invalid.fromUnknown(value)).toThrow(
      "A Type refinement must return its input.",
    );
    expect(() => Invalid.from.parent(value)).toThrow(
      "A Type refinement must return its input.",
    );
  });

  test("requires a child Output to narrow its parent Output", () => {
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

    expect(FortyTwo.from(42)).toEqual(ok(42));
    expectTypeOf<typeof FortyTwo.Output>().toEqualTypeOf<42>();

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
        (_value): Result<42, never> => ok(42),
        // @ts-expect-error An infallible child Type must not provide a formatter.
        () => "Unreachable.",
      );
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires a formatter for root and fallible child Types", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("inherits the parent formatter when a child is infallible", () => {
    const IdentityString = createType("IdentityString", String, ok);

    expectTypeOf<typeof IdentityString.Error>().toEqualTypeOf<never>();
    expectTypeOf<InferErrors<typeof IdentityString>>().toEqualTypeOf<
      TypeOfError<"String">
    >();
    expect(IdentityString.formatError).toBe(String.formatError);
    expectTypeOf(IdentityString.formatError)
      .parameter(0)
      .toEqualTypeOf<TypeOfError<"String">>();
  });

  test("does not widen its error from a broad formatter", () => {
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

    expectTypeOf<
      typeof RefinedString.Error
    >().toEqualTypeOf<RefinedStringError>();
    expectTypeOf<InferErrors<typeof RefinedString>>().toEqualTypeOf<
      TypeOfError<"String"> | RefinedStringError
    >();
    expect(
      RefinedString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
    ).toBe("A value 42 is not a string.");
    expect(
      RefinedString.formatError({ type: "RefinedString", value: "value" }),
    ).toBe("RefinedString");
  });

  test("rejects an error type inherited from the parent Type", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires one concrete name for a fallible child Type", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires one concrete name for root and infallible child Types", () => {
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

    expectTypeOf(genericCompileTimeAssertion).toBeFunction();
    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("rejects a parent with erased concrete Type information", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires a child error type matching the child name", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  describe("Type", () => {
    describe("Unknown", () => {
      test("has the expected root Type definition", () => {
        expect(Unknown.name).toBe("Unknown");
        expectTypeOf(Unknown.name).toEqualTypeOf<"Unknown">();
        expectTypeOf<typeof Unknown.Input>().toEqualTypeOf<unknown>();
        expectTypeOf<typeof Unknown.Output>().toEqualTypeOf<unknown>();
        expectTypeOf<typeof Unknown.Error>().toEqualTypeOf<never>();
        expectTypeOf(Unknown.parent).toEqualTypeOf<null>();
      });

      test("accepts every value without changing it", () => {
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

          expectOk(result, value);
          expect(result.value).toBe(value);
          expect(Unknown.is(value)).toBe(true);
        }
      });

      test("cannot return a validation error", () => {
        expectTypeOf<ReturnType<typeof Unknown.fromUnknown>>().toEqualTypeOf<
          Result<unknown, never>
        >();
        expectTypeOf(Unknown.formatError).parameter(0).toEqualTypeOf<never>();
      });
    });

    describe("Never", () => {
      test("has the expected root Type definition", () => {
        expect(Never.name).toBe("Never");
        expectTypeOf(Never.name).toEqualTypeOf<"Never">();
        expectTypeOf<typeof Never.Input>().toEqualTypeOf<never>();
        expectTypeOf<typeof Never.Output>().toEqualTypeOf<never>();
        expectTypeOf<typeof Never.Error>().toEqualTypeOf<NeverError>();
        expectTypeOf<NeverError>().toExtend<TypeValueError<"Never">>();
        expectTypeOf(Never.parent).toEqualTypeOf<null>();
      });

      test("rejects every value with a Never error containing the rejected value", () => {
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
          expect(Never.fromUnknown(value)).toEqual(
            err({ type: "Never", value }),
          );
          expect(Never.is(value)).toBe(false);
        }
      });

      test("cannot return a validated value", () => {
        expectTypeOf<ReturnType<typeof Never.fromUnknown>>().toEqualTypeOf<
          Result<never, NeverError>
        >();
      });

      test("formats its validation error", () => {
        expect(Never.formatError({ type: "Never", value: 42 })).toBe(
          "A value 42 is not valid for type Never.",
        );
      });
    });
  });
});

describe("transform", () => {
  test("creates a Type between encoded and output Types", () => {
    const NumberFromString = setupNumberFromString();

    expect(NumberFromString.parent).toBe(String);
    expect(NumberFromString.output).toBe(Number);
    expectTypeOf(NumberFromString).toEqualTypeOf<
      TransformType<
        typeof String,
        typeof Number,
        "NumberFromString",
        NumberFromStringError
      >
    >();
    expectTypeOf<typeof NumberFromString.Input>().toEqualTypeOf<string>();
    expectTypeOf<typeof NumberFromString.Output>().toEqualTypeOf<number>();
    expectTypeOf<typeof NumberFromString.Error>().toEqualTypeOf<
      TransformError<"NumberFromString", NumberFromStringError, never>
    >();
    expectTypeOf<InferErrors<typeof NumberFromString>>().toEqualTypeOf<
      | TypeOfError<"String">
      | TransformError<"NumberFromString", NumberFromStringError, never>
    >();
  });

  test("transforms from its parent Output to its own Output", () => {
    const NumberFromString = setupNumberFromString();

    expect(NumberFromString.fromUnknown("42")).toEqual(ok(42));
    expect(NumberFromString.from.parent("42")).toEqual(ok(42));
    expect(NumberFromString.fromUnknown(42)).toEqual(
      err({ type: "TypeOf", expected: "String", value: 42 }),
    );
    expect(NumberFromString.from.parent("not a number")).toEqual(
      err({
        type: "NumberFromString",
        value: "not a number",
      }),
    );
  });

  test("satisfies Output round-tripping and stable Input normalization", () => {
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

      expect(globalThis.Object.is(decoded, output)).toBe(true);
    }

    const normalized = NumberFromString.to(
      getOrThrow(NumberFromString.from.parent("01")),
    );

    expect(normalized).toBe("1");
    expect(
      NumberFromString.to(getOrThrow(NumberFromString.from.parent(normalized))),
    ).toBe(normalized);
    expectTypeOf(NumberFromString.to(42)).toEqualTypeOf<string>();
  });

  test("round-trips Boolean and yes/no representations", () => {
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

    expect(YesOrNoFromBoolean.fromUnknown(true)).toEqual(ok("yes"));
    expect(YesOrNoFromBoolean.fromUnknown(false)).toEqual(ok("no"));
    expect(YesOrNoFromBoolean.to("yes")).toBe(true);
    expect(YesOrNoFromBoolean.to("no")).toBe(false);
    expectTypeOf<typeof YesOrNoFromBoolean.Input>().toEqualTypeOf<boolean>();
    expectTypeOf<typeof YesOrNoFromBoolean.Output>().toEqualTypeOf<
      "yes" | "no"
    >();
  });

  test("narrows unknown values on the output side", () => {
    const NumberFromString = setupNumberFromString();
    const value: unknown = 42;

    expect(NumberFromString.is(value)).toBe(true);
    expect(NumberFromString.is("42")).toBe(false);
    if (NumberFromString.is(value)) {
      expectTypeOf(value).toEqualTypeOf<number>();
    }
  });

  test("runs and formats the complete output Type pipeline", () => {
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

    expectTypeOf<typeof PositiveNumberFromString.Error>().toEqualTypeOf<
      TransformError<
        "PositiveNumberFromString",
        PositiveNumberFromStringError,
        PositiveNumberError
      >
    >();

    expect(PositiveNumberFromString.from.parent("-1")).toEqual(
      err({
        type: "PositiveNumberFromString",
        outputError: { type: "PositiveNumber", value: -1 },
      }),
    );
    expect(
      PositiveNumberFromString.formatError({
        type: "PositiveNumberFromString",
        outputError: { type: "PositiveNumber", value: -1 },
      }),
    ).toBe("Enter a positive number.");
    expect(PositiveNumberFromString.is(1)).toBe(true);
    expect(PositiveNumberFromString.is(-1)).toBe(false);
  });

  test("composes Object parent and output pipelines", () => {
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

    expectOk(result, output);
    expect(result.value).not.toBe(encoded);
    expect(orThrowResult).toEqual(output);
    expect(orNullResult).toEqual(output);
    expect(PositiveModelFromStrings.orNull({ value: "-1" })).toBeNull();
    expectTypeOf(PositiveModelFromStrings.orThrow)
      .parameter(0)
      .toEqualTypeOf<typeof PositiveModelFromStrings.Input>();
    expectTypeOf(orThrowResult).toEqualTypeOf<
      typeof PositiveModelFromStrings.Output
    >();
    expectTypeOf(orNullResult).toEqualTypeOf<
      typeof PositiveModelFromStrings.Output | null
    >();
    expect(PositiveModelFromStrings.to(output)).toEqual(encoded);
    expect(
      PositiveModelFromStrings.from.parent.parent({ value: "no" }),
    ).toEqual(
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

    expect(outputResult).toEqual(
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
    expectTypeOf(outputResult).toEqualTypeOf<
      Result<
        typeof PositiveModelFromStrings.Output,
        typeof EncodedModel.Error | typeof PositiveModelFromStrings.Error
      >
    >();
    expectTypeOf<typeof PositiveModelFromStrings.Error>().toEqualTypeOf<
      TransformError<
        "PositiveModelFromStrings",
        never,
        typeof OutputModel.Error
      >
    >();
  });

  test("composes total encoding through its output Type", () => {
    const NumberFromString = setupNumberFromString();
    const ReencodedNumber = transform(
      "ReencodedNumber",
      String,
      NumberFromString,
      { from: ok, to: (value) => value },
    );

    expect(ReencodedNumber.from.parent("42")).toEqual(ok(42));
    expect(ReencodedNumber.to(1.5)).toBe("1.5");
  });

  test("formats inherited and own transformation errors", () => {
    const NumberFromString = setupNumberFromString();

    expect(
      NumberFromString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
    ).toBe("A value 42 is not a string.");
    expect(
      NumberFromString.formatError({
        type: "NumberFromString",
        value: "no",
      }),
    ).toBe("The value no is not a number.");
  });

  test("preserves callback errors containing an Output-shaped reason", () => {
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

    expect(NumberFromText.from.parent("no")).toEqual(err(error));
    expect(NumberFromText.formatError(error)).toBe("Enter a number.");
  });

  test("composes total encoding through refinements", () => {
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

    expect(PositiveNumber.to(positive)).toBe("42");
    expect(PositiveNumber.to(positiveNonInteger)).toBe("1.5");
  });

  test("composes decoding and encoding transformations", () => {
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

    expect(BooleanFromNumberString.from.parent.parent("1")).toEqual(ok(true));
    expect(BooleanFromNumberString.from.parent(0)).toEqual(ok(false));
    expect(BooleanFromNumberString.to(true)).toBe("1");
  });

  test("requires a formatter exactly when decoding adds an own error", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires callbacks to return their declared boundary types", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("asserts successful decoding callback results", () => {
    const Invalid = transform("InvalidTransformFrom", String, Number, {
      from: () => ok("not a number" as unknown as number),
      to: globalThis.String,
    });

    expect(() => Invalid.fromUnknown("value")).toThrow(
      'A value "not a number" is not a number.',
    );
    expect(() => Invalid.from.parent("value")).toThrow(
      'A value "not a number" is not a number.',
    );
  });

  test("asserts encoding inputs and callback results", () => {
    const NumberFromString = setupNumberFromString();
    const Invalid = transform("InvalidTransformTo", String, Number, {
      from: () => ok(42),
      to: () => 42 as unknown as string,
    });

    expect(NumberFromString.fromUnknown("42")).toEqual(ok(42));
    expectAssertionError(
      () => NumberFromString.to("42" as unknown as number),
      'A value "42" is not a number.',
      {
        type: "NumberFromString",
        outputError: {
          type: "TypeOf",
          expected: "Number",
          value: "42",
        },
      },
    );
    expect(() => Invalid.to(42)).toThrow("A value 42 is not a string.");
  });

  test("rejects fallible parent and output Types with erased concrete information", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("rejects unresolved generic parent and output Types", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires an own error to use the transformation name", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("reserves outputError for errors from the output Type", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("does not widen its own errors from a broad formatter", () => {
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

    expectTypeOf<typeof _NumberFromString.Error>().toEqualTypeOf<
      TransformError<"NumberFromString", NumberFromStringError, never>
    >();
  });
});

describe("TypeOf", () => {
  const types = [String, Number, BigInt, Boolean, Symbol, Function] as const;

  test("Types have the expected root definitions", () => {
    expectTypeOf(String).toEqualTypeOf<
      Type<"String", string, string, TypeOfError<"String">>
    >();
    expectTypeOf(Number).toEqualTypeOf<
      Type<"Number", number, number, TypeOfError<"Number">>
    >();
    expectTypeOf(BigInt).toEqualTypeOf<
      Type<"BigInt", bigint, bigint, TypeOfError<"BigInt">>
    >();
    expectTypeOf(Boolean).toEqualTypeOf<
      Type<"Boolean", boolean, boolean, TypeOfError<"Boolean">>
    >();
    expectTypeOf(Symbol).toEqualTypeOf<
      Type<"Symbol", symbol, symbol, TypeOfError<"Symbol">>
    >();
    expectTypeOf(Function).toEqualTypeOf<
      Type<
        "Function",
        globalThis.Function,
        globalThis.Function,
        TypeOfError<"Function">
      >
    >();
    expectTypeOf<TypeOfError<"String">>().toExtend<TypeValueError<"TypeOf">>();
    expectTypeOf<TypeOfError<"String">["expected"]>().toEqualTypeOf<"String">();
  });

  describe("Type", () => {
    for (const type of types) {
      const name = type.name;

      describe(name, () => {
        test("preserves matching values", () => {
          const value = globalThis[name](0);
          const result = type.fromUnknown(value);

          expectOk(result, value);
          expect(result.value).toBe(value);
        });

        test("reports the expected Type and rejected value", () => {
          const value: unknown = null;

          expect(type.fromUnknown(value)).toEqual(
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

describe("createInstanceOfType", () => {
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

  const UserInstance = createInstanceOfType(User);
  const builtInTypes = [
    {
      constructorName: "Date",
      type: Date,
      value: new globalThis.Date(0),
    },
    {
      constructorName: "Uint8Array",
      type: Uint8Array,
      value: new globalThis.Uint8Array(0),
    },
    {
      constructorName: "ArrayBuffer",
      type: ArrayBuffer,
      value: new globalThis.ArrayBuffer(0),
    },
  ] as const;

  test("creates the expected root Type", () => {
    expectTypeOf(User).toExtend<InstanceConstructor<User>>();
    expectTypeOf(UserInstance).toEqualTypeOf<InstanceOfType<typeof User>>();
    expectTypeOf<typeof UserInstance.Input>().toEqualTypeOf<User>();
    expectTypeOf<typeof UserInstance.Output>().toEqualTypeOf<User>();
    expectTypeOf<typeof UserInstance.Error>().toEqualTypeOf<InstanceOfError>();
    expectTypeOf<InstanceOfError>().toExtend<TypeValueError<"InstanceOf">>();
    expectTypeOf(UserInstance.parent).toEqualTypeOf<null>();
    expect(UserInstance.name).toBe("InstanceOf");
    expect(UserInstance.constructor).toBe(User);
    expect(UserInstance.parent).toBeNull();
  });

  test("creates the predefined built-in Types", () => {
    expectTypeOf(Date).toEqualTypeOf<InstanceOfType<typeof globalThis.Date>>();
    expectTypeOf(Uint8Array).toEqualTypeOf<
      InstanceOfType<typeof globalThis.Uint8Array>
    >();
    expectTypeOf(ArrayBuffer).toEqualTypeOf<
      InstanceOfType<typeof globalThis.ArrayBuffer>
    >();
    expectTypeOf<typeof Date.Output>().toEqualTypeOf<globalThis.Date>();
    expectTypeOf<
      typeof Uint8Array.Output
    >().toEqualTypeOf<globalThis.Uint8Array>();
    expectTypeOf<
      globalThis.Uint8Array<globalThis.SharedArrayBuffer>
    >().toExtend<typeof Uint8Array.Output>();
    expectTypeOf<
      typeof ArrayBuffer.Output
    >().toEqualTypeOf<globalThis.ArrayBuffer>();

    for (const { constructorName, type } of builtInTypes) {
      expect(type.name).toBe("InstanceOf");
      expect(type.constructor).toBe(globalThis[constructorName]);
      expect(type.parent).toBeNull();
    }
  });

  test("requires one concrete constructor", () => {
    class _Session {
      readonly id = "session";
    }

    type Constructor = typeof User | typeof _Session;
    type ConstructorParameter = Parameters<
      typeof createInstanceOfType<Constructor>
    >[0];
    type ErasedConstructor = InstanceConstructor<User>;
    type ErasedConstructorParameter = Parameters<
      typeof createInstanceOfType<ErasedConstructor>
    >[0];
    const compileTimeAssertions = (
      constructor: Constructor,
      erasedConstructor: ErasedConstructor,
    ) => {
      // @ts-expect-error An Instance Type requires one concrete constructor.
      createInstanceOfType(constructor);
      // @ts-expect-error An Instance Type requires concrete constructor information.
      createInstanceOfType(erasedConstructor);
    };
    const genericCompileTimeAssertion = <C extends Constructor>(
      constructor: C,
    ): C => {
      // @ts-expect-error An unresolved generic could be instantiated with a constructor union.
      createInstanceOfType(constructor);
      return constructor;
    };

    expectTypeOf<Constructor>().not.toExtend<ConstructorParameter>();
    expectTypeOf<ErasedConstructor>().not.toExtend<ErasedConstructorParameter>();
    expectTypeOf<ConstructorParameter>().toEqualTypeOf<"⛔ Type error: Constructor must preserve one concrete constructor. Create a Union Type from separate Instance Types instead of passing a union or erased constructor.">();
    expectTypeOf<ErasedConstructorParameter>().toEqualTypeOf<ConstructorParameter>();
    expectTypeOf(compileTimeAssertions).toBeFunction();
    expectTypeOf(genericCompileTimeAssertion).toBeFunction();
  });

  test("composes multiple constructors through one Union Type", () => {
    class Session {
      readonly id = "session";
    }

    const Instance = union(
      createInstanceOfType(User),
      createInstanceOfType(Session),
    );
    const user = new User("Ada");
    const session = new Session();

    expect(Instance.fromUnknown(user)).toEqual(ok(user));
    expect(Instance.fromUnknown(session)).toEqual(ok(session));
    expectTypeOf<typeof Instance.Output>().toEqualTypeOf<User | Session>();
  });

  test("preserves instances accepted by the constructor", () => {
    const user = new User("Ada");
    const admin = new Admin("Grace");

    for (const value of [user, admin]) {
      const result = UserInstance.fromUnknown(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(UserInstance.is(value)).toBe(true);
    }

    expect(UserInstance.from(user)).toEqual(ok(user));
    expectTypeOf(UserInstance.from(user)).toEqualTypeOf<Result<User, never>>();
    expect(UserInstance.to(user)).toBe(user);
    expect(UserInstance.orThrow(user)).toBe(user);
    expect(UserInstance.orNull(user)).toBe(user);
  });

  test("ignores overridden Symbol.hasInstance", () => {
    class Overridden {
      readonly kind = "Overridden";

      static [globalThis.Symbol.hasInstance](value: unknown): boolean {
        return value === 42;
      }
    }

    const OverriddenInstance = createInstanceOfType(Overridden);
    const instance = new Overridden();

    expect(Overridden[globalThis.Symbol.hasInstance](42)).toBe(true);
    expect(instance instanceof Overridden).toBe(false);
    expect(OverriddenInstance.fromUnknown(42)).toEqual(
      err({
        type: "InstanceOf",
        constructorName: "Overridden",
        value: 42,
      }),
    );
    expect(OverriddenInstance.is(42)).toBe(false);
    expectOk(OverriddenInstance.fromUnknown(instance), instance);
    expect(OverriddenInstance.is(instance)).toBe(true);
  });

  test("asserts structurally typed values that are not instances", () => {
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
      expectAssertionError(
        operation,
        'A value {"name":"Ada"} is not an instance of User.',
        error,
      );
    }
  });

  test("predefined built-in Types preserve matching instances", () => {
    for (const { type, value } of builtInTypes) {
      const result = type.fromUnknown(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(type.is(value)).toBe(true);
    }
  });

  test("predefined built-in Types reject matching object-tag impostors", () => {
    for (const { constructorName, type } of builtInTypes) {
      const value: unknown = {
        [globalThis.Symbol.toStringTag]: constructorName,
      };

      expect(globalThis.Object.prototype.toString.call(value)).toBe(
        `[object ${constructorName}]`,
      );
      expect(type.fromUnknown(value)).toEqual(
        err({ type: "InstanceOf", constructorName, value }),
      );
      expect(type.is(value)).toBe(false);
    }
  });

  test("rejects structurally equivalent values with different constructor identities", () => {
    const plain: unknown = { name: "Ada" };
    const sameName: unknown = new SameName("Ada");

    for (const value of [plain, sameName]) {
      expect(UserInstance.fromUnknown(value)).toEqual(
        err({
          type: "InstanceOf",
          constructorName: "User",
          value,
        }),
      );
      expect(UserInstance.is(value)).toBe(false);
    }
  });

  test("formats the rejected value and expected constructor", () => {
    expect(
      UserInstance.formatError({
        type: "InstanceOf",
        constructorName: "User",
        value: {},
      }),
    ).toBe("A value {} is not an instance of User.");
  });
});

describe("literal", () => {
  const Hello = literal("Hello");

  test("creates a Literal Type with its primitive Type as parent", () => {
    expect(Hello.name).toBe("Literal");
    expect(Hello.expected).toBe("Hello");
    expect(Hello.parent).toBe(String);
    expectTypeOf(Hello).toEqualTypeOf<LiteralType<"Hello">>();
    expectTypeOf<typeof Hello.Input>().toEqualTypeOf<string>();
    expectTypeOf<typeof Hello.Output>().toEqualTypeOf<"Hello">();
    expectTypeOf<typeof Hello.Error>().toEqualTypeOf<LiteralError<"Hello">>();
    expectTypeOf<LiteralError<"Hello">>().toExtend<TypeValueError<"Literal">>();
    expectTypeOf(Hello.parent).toEqualTypeOf<typeof String>();
    expect("parent" in Hello.from).toBe(true);
    expectTypeOf<"parent">().toExtend<keyof typeof Hello.from>();
  });

  test("validates unknown and widened input at their respective boundaries", () => {
    const expectedError = err({
      type: "Literal",
      expected: "Hello",
      value: "World",
    });

    expect(Hello.fromUnknown("Hello")).toEqual(ok("Hello"));
    expect(Hello.fromUnknown("World")).toEqual(expectedError);
    expect(Hello.fromUnknown(42)).toEqual(
      err({ type: "TypeOf", expected: "String", value: 42 }),
    );
    expect(Hello.from("Hello")).toEqual(ok("Hello"));
    expect(Hello.from.parent("World")).toEqual(expectedError);
    expectTypeOf(Hello.fromUnknown("Hello")).toEqualTypeOf<
      Result<"Hello", TypeOfError<"String"> | LiteralError<"Hello">>
    >();
    expectTypeOf(Hello.from).parameter(0).toEqualTypeOf<"Hello">();
    expectTypeOf(Hello.from("Hello")).toEqualTypeOf<Result<"Hello", never>>();
    expectTypeOf(Hello.from.parent("Hello")).toEqualTypeOf<
      Result<"Hello", LiteralError<"Hello">>
    >();
  });

  test("narrows values and validates convenience operations", () => {
    const value: unknown = "Hello";

    expect(Hello.is(value)).toBe(true);
    expect(Hello.is("World")).toBe(false);
    if (Hello.is(value)) expectTypeOf(value).toEqualTypeOf<"Hello">();

    expect(Hello.orThrow("Hello")).toBe("Hello");
    expect(() => Hello.orThrow("World")).toThrow("getOrThrow");
    expect(Hello.orNull("Hello")).toBe("Hello");
    expect(Hello.orNull("World")).toBeNull();
  });

  test("supports every literal primitive", () => {
    const FortyTwo = literal(42);
    const FortyTwoBigInt = literal(42n);
    const True = literal(true);

    expect(FortyTwo.parent).toBe(Number);
    expect(FortyTwoBigInt.parent).toBe(BigInt);
    expect(True.parent).toBe(Boolean);
    expect(FortyTwo.from(42)).toEqual(ok(42));
    expect(FortyTwoBigInt.from(42n)).toEqual(ok(42n));
    expect(True.from(true)).toEqual(ok(true));
    expect(literal(undefined).from(undefined)).toEqual(ok(undefined));
    expect(literal(null).from(null)).toEqual(ok(null));
  });

  test("distinguishes primitive type errors from Literal value errors", () => {
    const FortyTwo = literal(42);

    expect(FortyTwo.fromUnknown("42")).toEqual(
      err({ type: "TypeOf", expected: "Number", value: "42" }),
    );
    expect(FortyTwo.fromUnknown(43)).toEqual(
      err({ type: "Literal", expected: 42, value: 43 }),
    );
    expectTypeOf(FortyTwo.fromUnknown(42)).toEqualTypeOf<
      Result<42, TypeOfError<"Number"> | LiteralError<42>>
    >();
  });

  test("formats its own and inherited errors", () => {
    expect(
      Hello.formatError({
        type: "Literal",
        expected: "Hello",
        value: "World",
      }),
    ).toBe(
      'The value "World" is not strictly equal to the expected literal: Hello.',
    );
    expect(
      Hello.formatError({
        type: "TypeOf",
        expected: "String",
        value: 42,
      }),
    ).toBe("A value 42 is not a string.");
    expectTypeOf(Hello.formatError)
      .parameter(0)
      .toEqualTypeOf<TypeOfError<"String"> | LiteralError<"Hello">>();
  });

  test("uses JavaScript strict equality without replacing the accepted value", () => {
    const result = literal(0).from.parent(-0);

    expectOk(result, -0);
    expect(globalThis.Object.is(result.value, -0)).toBe(true);
  });

  test("rejects values without one exact literal type", () => {
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
    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  describe("Type", () => {
    describe("Undefined", () => {
      test("is the Literal Type for undefined", () => {
        expect(Undefined.name).toBe("Literal");
        expect(Undefined.expected).toBeUndefined();
        expect(Undefined.parent).toBeNull();
        expectTypeOf(Undefined).toEqualTypeOf<LiteralType<undefined>>();
        expectTypeOf(Undefined.from(undefined)).toEqualTypeOf<
          Result<undefined, never>
        >();
      });

      test("accepts undefined and rejects other values", () => {
        expect(Undefined.fromUnknown(undefined)).toEqual(ok(undefined));
        expect(Undefined.fromUnknown(null)).toEqual(
          err({ type: "Literal", expected: undefined, value: null }),
        );
      });
    });

    describe("Null", () => {
      test("is the Literal Type for null", () => {
        expect(Null.name).toBe("Literal");
        expect(Null.expected).toBeNull();
        expect(Null.parent).toBeNull();
        expectTypeOf(Null).toEqualTypeOf<LiteralType<null>>();
        expectTypeOf(Null.from(null)).toEqualTypeOf<Result<null, never>>();
      });

      test("accepts null and rejects other values", () => {
        expect(Null.fromUnknown(null)).toEqual(ok(null));
        expect(Null.fromUnknown(undefined)).toEqual(
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

  test("creates a root boundary for its encoded member Inputs", () => {
    expect(StringOrNumber.name).toBe("Union");
    expect(StringOrNumber.parent.name).toBe("Union");
    expect(StringOrNumber.parent.parent).toBeNull();
    expect(StringOrNumber.members).toEqual([String, Number]);
    expect(StringOrNumber.members[0]).toBe(String);
    expect(StringOrNumber.members[1]).toBe(Number);
    expectTypeOf(StringOrNumber).toEqualTypeOf<
      UnionType<readonly [typeof String, typeof Number]>
    >();
    expectTypeOf(StringOrNumber.parent).toEqualTypeOf<
      UnionInputType<string | number, StringOrNumberError>
    >();
    expectTypeOf<typeof StringOrNumber.Input>().toEqualTypeOf<
      string | number
    >();
    expectTypeOf<typeof StringOrNumber.Output>().toEqualTypeOf<
      string | number
    >();
    expectTypeOf<
      typeof StringOrNumber.Error
    >().toEqualTypeOf<StringOrNumberError>();
    expectTypeOf<
      InferErrors<typeof StringOrNumber>
    >().toEqualTypeOf<StringOrNumberError>();
    expectTypeOf<typeof StringOrNumber.parent.Input>().toEqualTypeOf<
      typeof StringOrNumber.Input
    >();
    expectTypeOf<typeof StringOrNumber.parent.Output>().toEqualTypeOf<
      typeof StringOrNumber.Input
    >();
    expectTypeOf<
      typeof StringOrNumber.parent.Error
    >().toEqualTypeOf<StringOrNumberError>();
    expectTypeOf<StringOrNumberError>().not.toExtend<TypeValueError>();
    expect(StringOrNumber.parent.fromUnknown("value")).toEqual(ok("value"));
    expect(StringOrNumber.parent.fromUnknown(42)).toEqual(ok(42));
    expect(StringOrNumber.parent.fromUnknown(true)).toEqual(
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
    expect("parent" in StringOrNumber.from).toBe(true);
    expectTypeOf<"parent">().toExtend<keyof typeof StringOrNumber.from>();
  });

  test("asserts exact member Outputs at both Union boundaries", () => {
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

    expectAssertionError(
      () => StringOrNumber.from(invalid),
      "A value does not match any union member.",
      cause,
    );
    expectAssertionError(
      () => StringOrNumber.from.parent(invalid),
      "A value does not match any union member.",
      cause,
    );
  });

  test("accepts ordinary root Record members through typed operations", () => {
    const Value = union(record(String, Number), String);
    const input = { count: 1 };
    const fromUnknownResult = Value.parent.fromUnknown(input);

    expectOk(fromUnknownResult, input);
    expect(fromUnknownResult.value).toBe(input);
    expect(Value.parent.is(input)).toBe(true);

    const fromResult = Value.from.parent(input);
    expectOk(fromResult, input);
    expect(fromResult.value).toBe(input);
    expect(Value.is(fromResult.value)).toBe(true);
    expect(Value.orThrow(input)).toBe(input);
    expect(Value.orNull(input)).toBe(input);
  });

  test("accepts ordinary root Union members through Array", () => {
    const Value = union(record(String, Number), String);
    const Values = array(Value);
    const input = [{ count: 1 }];
    const result = Values.from.parent(input);

    expectOk(result, input);
    expect(result.value).toBe(input);
    expect(result.value[0]).toBe(input[0]);
    expect(Values.parent.is(result.value)).toBe(true);
  });

  test("does not select a root that can only decode the typed value", () => {
    class Input {
      readonly count = 1;
    }

    interface RejectedObjectError extends TypeError<"RejectedObject"> {
      readonly value: Input;
    }

    const Values = object({ count: Number });
    const RejectedObject = brand(
      "RejectedObject",
      createInstanceOfType(Input),
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

    expect(Values.is(input)).toBe(false);
    expect(Value.parent.is(input)).toBe(true);

    expect(Value.from.parent(input, { errors: "all" })).toEqual(
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
    expect(rootDecodings).toBe(0);
  });

  test("normalizes literal-only members behind a Union input boundary", () => {
    expect(DraftOrPublished.parent.name).toBe("Union");
    expect(DraftOrPublished.parent.parent).toBeNull();
    expect(DraftOrPublished.parent).not.toBe(String);
    expect(DraftOrPublished.members[0].expected).toBe("draft");
    expect(DraftOrPublished.members[1].expected).toBe("published");
    expectTypeOf(DraftOrPublished).toEqualTypeOf<
      UnionType<readonly [LiteralType<"draft">, LiteralType<"published">]>
    >();
    expectTypeOf<typeof DraftOrPublished.Output>().toEqualTypeOf<
      "draft" | "published"
    >();
    expectTypeOf<typeof DraftOrPublished.Error>().toEqualTypeOf<
      UnionError<
        | TypeOfError<"String">
        | LiteralError<"draft">
        | LiteralError<"published">,
        | UnionMemberError<TypeOfError<"String"> | LiteralError<"draft">, 0>
        | UnionMemberError<TypeOfError<"String"> | LiteralError<"published">, 1>
      >
    >();
    expectTypeOf<
      typeof DraftOrPublished.parent.Output
    >().toEqualTypeOf<string>();
    expectTypeOf(DraftOrPublished.parent).toEqualTypeOf<
      UnionInputType<string, UnionError<TypeOfError<"String">>>
    >();
    expect(DraftOrPublished.parent.fromUnknown("other")).toEqual(ok("other"));
    expect(DraftOrPublished.parent.fromUnknown(42)).toEqual(
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

  test("accepts an explicit Union Type as one concrete member", () => {
    const AOrOne = union(literal("a"), literal(1));
    const AOrOneOrBoolean = union(AOrOne, Boolean);
    const BOrAOrOne = union("b", AOrOne);

    expect(AOrOneOrBoolean.members[0]).toBe(AOrOne);
    expect(BOrAOrOne.members[1]).toBe(AOrOne);
    expectTypeOf(AOrOneOrBoolean).toEqualTypeOf<
      UnionType<readonly [typeof AOrOne, typeof Boolean]>
    >();
    expectTypeOf(BOrAOrOne).toEqualTypeOf<
      UnionType<readonly [LiteralType<"b">, typeof AOrOne]>
    >();
    expect(AOrOneOrBoolean.fromUnknown(1)).toEqual(ok(1));
    expect(BOrAOrOne.fromUnknown("a")).toEqual(ok("a"));
  });

  test("keeps a Union input boundary for repeated parentless Literal Types", () => {
    const Value = union(Null, Null);

    expectTypeOf(Value.parent).toEqualTypeOf<
      UnionInputType<null, UnionError<LiteralError<null>>>
    >();
    expect(Value.parent.name).toBe("Union");
    expect(Value.parent.parent).toBeNull();
    expect(Value.parent.fromUnknown(undefined)).toEqual(
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

  test("normalizes mixed literal and Type members in any position", () => {
    const DraftOrNumber = union("draft", Number);
    const NumberOrDraft = union(Number, "draft");

    expect(DraftOrNumber.members[0].expected).toBe("draft");
    expect(DraftOrNumber.members[1]).toBe(Number);
    expect(NumberOrDraft.members[0]).toBe(Number);
    expect(NumberOrDraft.members[1].expected).toBe("draft");
    expectTypeOf(DraftOrNumber).toEqualTypeOf<
      UnionType<readonly [LiteralType<"draft">, typeof Number]>
    >();
    expectTypeOf(NumberOrDraft).toEqualTypeOf<
      UnionType<readonly [typeof Number, LiteralType<"draft">]>
    >();
    expect(DraftOrNumber.fromUnknown("draft")).toEqual(ok("draft"));
    expect(DraftOrNumber.fromUnknown(42)).toEqual(ok(42));
    expect(NumberOrDraft.fromUnknown("draft")).toEqual(ok("draft"));
  });

  test("validates literal values with the same Union behavior", () => {
    const value: unknown = "published";
    const result = DraftOrPublished.fromUnknown(value);

    expectOk(result, value);
    expect(result.value).toBe(value);
    expect(DraftOrPublished.fromUnknown("other")).toEqual(
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
    expect(DraftOrPublished.fromUnknown("other", { errors: "all" })).toEqual(
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

  test("supports every literal primitive", () => {
    const Values = union("value", 42, 42n, true, null, undefined);

    expect(Values.members.map((member) => member.expected)).toEqual([
      "value",
      42,
      42n,
      true,
      null,
      undefined,
    ]);
    expectTypeOf<typeof Values.Output>().toEqualTypeOf<
      "value" | 42 | 42n | true | null | undefined
    >();
  });

  test("returns the original value from the first successful member", () => {
    const DateOrUint8Array = union(Date, Uint8Array);
    const value: unknown = new globalThis.Uint8Array([1, 2]);
    const result = DateOrUint8Array.fromUnknown(value);

    expectOk(result, value);
    expect(result.value).toBe(value);
    expectTypeOf(result.value).toEqualTypeOf<
      typeof Date.Output | typeof Uint8Array.Output
    >();
  });

  test("tries later members after a member fails and stops after success", () => {
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

    expect(Type.fromUnknown("value")).toEqual(ok("value"));
    expect(validations).toEqual(["First", "Second"]);
  });

  test("retains the first member error by default", () => {
    const result = StringOrNumber.fromUnknown(true);

    expect(result).toEqual(
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
    expectTypeOf(result).toEqualTypeOf<
      Result<string | number, StringOrNumberError>
    >();
  });

  test("retains every member error in all-errors mode", () => {
    const result = StringOrNumber.fromUnknown(true, { errors: "all" });

    expectErr(result, {
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

    expectTypeOf(memberError).toEqualTypeOf<
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
      expectTypeOf(memberError.error).toEqualTypeOf<TypeOfError<"String">>();
    } else {
      expectTypeOf(memberError.index).toEqualTypeOf<1>();
      expectTypeOf(memberError.error).toEqualTypeOf<TypeOfError<"Number">>();
    }
  });

  test("formats one message without enumerating member errors", () => {
    const result = StringOrNumber.fromUnknown(true, { errors: "all" });

    expectErr(result, {
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

    expect(StringOrNumber.formatError(result.error)).toBe(
      "A value does not match any union member.",
    );
    expectTypeOf(StringOrNumber.formatError)
      .parameter(0)
      .toEqualTypeOf<StringOrNumberError>();
  });

  test("cannot fail when one member is infallible", () => {
    const StringOrUnknown = union(String, Unknown);
    const result = StringOrUnknown.fromUnknown(true);

    expectTypeOf<typeof StringOrUnknown.Error>().toEqualTypeOf<never>();
    expectTypeOf<typeof StringOrUnknown.parent.Error>().toEqualTypeOf<never>();
    expectTypeOf<InferErrors<typeof StringOrUnknown>>().toEqualTypeOf<never>();
    expectTypeOf(result).toEqualTypeOf<Result<unknown, never>>();
    expectOk(result, true);
    expectOk(StringOrUnknown.parent.fromUnknown(true), true);
  });

  test("requires every member slot to preserve one concrete Type", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("forwards all-errors mode to member Types", () => {
    const StringArrayOrNumberArray = union(array(String), array(Number));

    expect(
      StringArrayOrNumberArray.fromUnknown([true, false], { errors: "all" }),
    ).toEqual(
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

  test("transforms the first successful member while decoding", () => {
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

    expect(Value.from.parent("42")).toEqual(ok(42));
    expect(Value.from.parent("true")).toEqual(ok(true));
    expect(Value.to(42)).toBe("42");
    expect(Value.to(true)).toBe("true");
    expect(Value.is(42)).toBe(true);
    expect(Value.is(true)).toBe(true);
    expect(Value.is("42")).toBe(false);
    expectTypeOf<typeof Value.Input>().toEqualTypeOf<string>();
    expectTypeOf<typeof Value.Output>().toEqualTypeOf<number | boolean>();
    expectTypeOf<typeof Value.parent.Output>().toEqualTypeOf<string>();
    expect(Value.parent.fromUnknown("not a number or boolean")).toEqual(
      ok("not a number or boolean"),
    );
  });

  test("encodes with the first member matching the Output", () => {
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

    expect(Value.to(42)).toBe("42");
    expect(attempts).toEqual(["First"]);
  });

  test("encodes ordinary Record Outputs through direct and nested members", () => {
    const Values = record(String, Number);
    const Direct = union(Values, String);
    const List = union(array(Values), String);
    const Model = union(object({ values: Values }), String);
    const direct = { count: 1 };
    const list = [direct];
    const model = { values: direct };

    expect(Direct.to(direct)).toBe(direct);
    expect(List.to(list)).toBe(list);
    expect(Model.to(model)).toBe(model);

    const canonical = globalThis.Object.assign(
      globalThis.Object.create(null) as Record<string, number>,
      { count: 1 },
    );
    const canonicalList = [canonical];
    const canonicalModel = { values: canonical };

    expect(Direct.to(canonical)).toBe(canonical);
    expect(List.to(canonicalList)).toBe(canonicalList);
    expect(Model.to(canonicalModel)).toBe(canonicalModel);
  });

  test("can be unlawful when encoded member representations overlap", () => {
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
    expect(encodedNumber).toBe("1");
    expect(decodedAgain).toEqual(ok(true));
  });

  test("accepts its own member Outputs through from", () => {
    expect(StringOrNumber.from("value")).toEqual(ok("value"));
    expect(StringOrNumber.from(42)).toEqual(ok(42));
    expectTypeOf(StringOrNumber.from)
      .parameter(0)
      .toEqualTypeOf<string | number>();
    expectTypeOf(StringOrNumber.from).returns.toEqualTypeOf<
      Result<string | number, never>
    >();
  });

  test("runs only matching roots when selecting through from.parent", () => {
    const Value = union(literal("Hello"), Number);
    const input: typeof Value.parent.Output = "World";

    expect(Value.from.parent(input, { errors: "all" })).toEqual(
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
    expect(Value.orNull(input)).toBeNull();
    expect(() => Value.orThrow(input)).toThrow("getOrThrow");
  });

  test("validates only the remaining Type after a validated Union through from.parent", () => {
    const HelloOrNumber = union(literal("Hello"), Number);
    const validations: Array<unknown> = [];
    const Value = brand("Value", HelloOrNumber, (value) => {
      validations.push(value);
      return ok();
    });
    const value = getOrThrow(HelloOrNumber.fromUnknown(42));

    expect(Value.from.parent(value)).toEqual(ok(42));
    expect(validations).toEqual([42]);
    expectTypeOf(Value.from.parent(value)).toEqualTypeOf<
      Result<typeof Value.Output, never>
    >();
  });

  test("composes with Array validation and nested error collection", () => {
    const HelloOrNumber = union(literal("Hello"), Number);
    const Values = array(HelloOrNumber);
    const value: ReadonlyArray<string | number> = ["Hello", 42];
    const result = Values.from.parent(value);

    expect(Values.parent).toBe(array(HelloOrNumber.parent));
    expectTypeOf<typeof Values.parent.Output>().toEqualTypeOf<
      typeof Values.Input
    >();
    expect(Values.parent.fromUnknown(["World", "No"])).toEqual(
      ok(["World", "No"]),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result<typeof Values.Output, typeof Values.Error>
    >();
    expectOk(result, value);
    expect(result.value).toBe(value);
    expect(Values.fromUnknown(["World", "No"], { errors: "all" })).toEqual(
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

  test("composes discriminated Object members with transformed and optional properties", () => {
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

    expectOk(result, output);
    expect(result.value).not.toBe(encoded);
    expect(Value.to(output)).toEqual(encoded);
    expect(Value.to({ kind: "label", value: "answer" })).toEqual({
      kind: "label",
      value: "answer",
    });
    const invalidResult = Value.fromUnknown(
      { kind: "count", value: "no" },
      { errors: "all" },
    );

    expectTypeOf(invalidResult).toEqualTypeOf<
      Result<typeof Value.Output, typeof Value.Error>
    >();
    expect(invalidResult).toEqual(
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

  test("requires at least two members and concrete shorthand literals", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });
});

describe("undefinedOr", () => {
  test("creates a Union with the supplied Type before Undefined", () => {
    const UndefinedOrString = undefinedOr(String);
    const StringOrNumber = union(String, Number);
    const UndefinedOrStringOrNumber = undefinedOr(StringOrNumber);

    expect(UndefinedOrString.members).toEqual([String, Undefined]);
    expect(UndefinedOrStringOrNumber.members[0]).toBe(StringOrNumber);
    expectTypeOf(UndefinedOrString).toEqualTypeOf<
      UnionType<readonly [typeof String, typeof Undefined]>
    >();
    expectTypeOf<typeof UndefinedOrString.Output>().toEqualTypeOf<
      string | undefined
    >();
    expect(UndefinedOrString.fromUnknown(42)).toEqual(
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

  test("rejects an uncertain supplied Type", () => {
    type Value = typeof String | typeof Number;
    const value = String as Value;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error The supplied Type must use one concrete Type node.
      undefinedOr(value);
      // @ts-expect-error The supplied Type must preserve its concrete information.
      undefinedOr(erased);
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });
});

describe("nullOr", () => {
  test("creates a Union with the supplied Type before Null", () => {
    const NullOrString = nullOr(String);
    const StringOrNumber = union(String, Number);
    const NullOrStringOrNumber = nullOr(StringOrNumber);

    expect(NullOrString.members).toEqual([String, Null]);
    expect(NullOrStringOrNumber.members[0]).toBe(StringOrNumber);
    expectTypeOf(NullOrString).toEqualTypeOf<
      UnionType<readonly [typeof String, typeof Null]>
    >();
    expectTypeOf<typeof NullOrString.Output>().toEqualTypeOf<string | null>();
  });

  test("rejects an uncertain supplied Type", () => {
    type Value = typeof String | typeof Number;
    const value = String as Value;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error The supplied Type must use one concrete Type node.
      nullOr(value);
      // @ts-expect-error The supplied Type must preserve its concrete information.
      nullOr(erased);
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });
});

describe("nullishOr", () => {
  test("creates a Union with the supplied Type before Null and Undefined", () => {
    const NullishOrString = nullishOr(String);
    const StringOrNumber = union(String, Number);
    const NullishOrStringOrNumber = nullishOr(StringOrNumber);

    expect(NullishOrString.members).toEqual([String, Null, Undefined]);
    expect(NullishOrStringOrNumber.members[0]).toBe(StringOrNumber);
    expectTypeOf(NullishOrString).toEqualTypeOf<
      UnionType<readonly [typeof String, typeof Null, typeof Undefined]>
    >();
    expectTypeOf<typeof NullishOrString.Output>().toEqualTypeOf<
      string | null | undefined
    >();
  });

  test("rejects an uncertain supplied Type", () => {
    type Value = typeof String | typeof Number;
    const value = String as Value;
    const erased: FormattableTypeNode = String;
    const compileTimeAssertions = () => {
      // @ts-expect-error The supplied Type must use one concrete Type node.
      nullishOr(value);
      // @ts-expect-error The supplied Type must preserve its concrete information.
      nullishOr(erased);
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
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

  test("adds a semantic brand without adding a refinement error", () => {
    const UserId = brand("UserId", String);
    const result = UserId.from.parent("id");

    expect(UserId.name).toBe("UserId");
    expectTypeOf(UserId.name).toEqualTypeOf<"UserId">();
    expect(UserId.parent).toBe(String);
    expectTypeOf(UserId).toEqualTypeOf<
      BrandType<typeof String, "UserId", never>
    >();
    expectTypeOf<typeof UserId.Input>().toEqualTypeOf<string>();
    expectTypeOf<typeof UserId.Error>().toEqualTypeOf<never>();
    expectTypeOf(UserId.parent).toEqualTypeOf<typeof String>();
    expectTypeOf(result).toEqualTypeOf<Result<typeof UserId.Output, never>>();
    expectOk(result, "id");
    expect(UserId.formatError).toBe(String.formatError);
    expectTypeOf(UserId.formatError)
      .parameter(0)
      .toEqualTypeOf<TypeOfError<"String">>();
  });

  test("rejects an unresolved generic infallible name", () => {
    const compileTimeAssertions = <Name extends "A" | "B">(
      name: Name,
    ): Name => {
      // @ts-expect-error An unresolved generic name might be a union.
      brand<Name, typeof String>(name, String);
      return name;
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("rejects a union of parent Types", () => {
    type Parent = typeof String | typeof Number;
    type ParentParameter = Parameters<
      typeof brand<"StringOrNumber", Parent>
    >[1];

    expectTypeOf<Parent>().not.toExtend<ParentParameter>();
    expectTypeOf<ParentParameter>().toEqualTypeOf<"⛔ Type error: Parent must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes.">();
  });

  test("rejects a parent with erased concrete Type information", () => {
    const erased: FormattableTypeNode = brand("Erased", String);

    const compileTimeAssertions = () => {
      // @ts-expect-error A parent must preserve its concrete Type.
      brand("Wrapped", erased);
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("inherits the parent formatter when validation is infallible", () => {
    const Validated = brand("Validated", String, () => ok());

    expect(Validated.formatError).toBe(String.formatError);
    expectTypeOf<typeof Validated.Error>().toEqualTypeOf<never>();
  });

  test("requires a formatter when a brand adds a validation error", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires one concrete name when validation is fallible", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("rejects an error type inherited from the parent Type", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires a brand error type matching the brand name", () => {
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

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("requires validation to report success without replacing the parent value", () => {
    const compileTimeAssertions = () => {
      brand(
        "Lowercase",
        String,
        // @ts-expect-error A Brand validation cannot replace the parent value.
        (value) => ok(value.toLowerCase()),
        formatTestTypeError,
      );
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("validates only the brand after a validated Literal parent through from.parent", () => {
    const Hello = literal("Hello");
    const Greeting = brand("Greeting", Hello);
    const hello = getOrThrow(Hello.from("Hello"));
    const greeting = getOrThrow(Greeting.from.parent(hello));

    expect(Greeting.parent).toBe(Hello);
    expect(Greeting.parent.parent).toBe(String);
    expect(Greeting.from(greeting)).toEqual(ok("Hello"));
    expect(Greeting.from.parent.parent("World")).toEqual(
      err({ type: "Literal", expected: "Hello", value: "World" }),
    );
    expect(Greeting.from.parent(hello)).toEqual(ok("Hello"));
    expectTypeOf(Greeting.from(greeting)).toEqualTypeOf<
      Result<typeof Greeting.Output, never>
    >();
    expectTypeOf(Greeting.from.parent(hello)).toEqualTypeOf<
      Result<typeof Greeting.Output, never>
    >();
  });

  test("accumulates every brand in its Output type", () => {
    const { Label: _Label } = setupLabel();

    expectTypeOf<typeof _Label.Output>().toEqualTypeOf<
      string &
        Brand<"TrimmedString"> &
        Brand<"NonEmptyString"> &
        Brand<"MaxLengthString"> &
        Brand<"Label">
    >();
  });

  test("exposes every preceding Type through parent", () => {
    const { Label, MaxLengthString, NonEmptyString, TrimmedString } =
      setupLabel();

    expect(Label.parent).toBe(MaxLengthString);
    expect(Label.parent.parent).toBe(NonEmptyString);
    expect(Label.parent.parent.parent).toBe(TrimmedString);
    expect(Label.parent.parent.parent.parent).toBe(String);
  });

  test("moves the output target toward the root through Type.parent", () => {
    const {
      Label,
      MaxLengthString: _MaxLengthString,
      validations,
    } = setupLabel();
    const value = Label.parent.orThrow("value");
    validations.length = 0;
    const result = Label.parent.from(value);

    expectTypeOf(result).toEqualTypeOf<
      Result<typeof _MaxLengthString.Output, never>
    >();
    expectOk(result, "value");
    expect(validations).toEqual([
      "TrimmedString",
      "NonEmptyString",
      "MaxLengthString",
    ]);
  });

  describe("fromUnknown", () => {
    test("validates every Type and returns the final branded value", () => {
      const { Label, validations } = setupLabel();
      const result = Label.fromUnknown("value");

      expectOk(result, "value");
      expectTypeOf(result.value).toEqualTypeOf<typeof Label.Output>();
      expect(validations).toEqual([
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);
    });

    test("returns the first failing Type error", () => {
      {
        const { Label, validations } = setupLabel();

        expect(Label.fromUnknown(42)).toEqual(
          err({ type: "TypeOf", expected: "String", value: 42 }),
        );
        expect(validations).toEqual([]);
      }

      {
        const { Label, validations } = setupLabel();

        expect(Label.fromUnknown(" value ")).toEqual(
          err({ type: "TrimmedString", value: " value " }),
        );
        expect(validations).toEqual(["TrimmedString"]);
      }

      {
        const { Label, validations } = setupLabel();

        expect(Label.fromUnknown("")).toEqual(
          err({ type: "NonEmptyString", value: "" }),
        );
        expect(validations).toEqual(["TrimmedString", "NonEmptyString"]);
      }

      {
        const { Label, validations } = setupLabel();

        expect(Label.fromUnknown("longer")).toEqual(
          err({
            type: "MaxLengthString",
            maxLength: 5,
            value: "longer",
          }),
        );
        expect(validations).toEqual([
          "TrimmedString",
          "NonEmptyString",
          "MaxLengthString",
        ]);
      }
    });

    test("infers every reachable validation error", () => {
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

      expectTypeOf(Label.fromUnknown("value")).toEqualTypeOf<
        Result<typeof Label.Output, Errors>
      >();
      expectTypeOf<InferErrors<typeof Label>>().toEqualTypeOf<Errors>();
    });
  });

  describe("is", () => {
    test("a type guard that validates the whole chain and narrows to the final Output", () => {
      const { Label, validations } = setupLabel();
      const value: unknown = "value";

      assert(Label.is(value), "Expected value to be a Label.");

      expectTypeOf(value).toEqualTypeOf<typeof Label.Output>();
      expect(validations).toEqual([
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      const invalid = setupLabel();
      expect(invalid.Label.is(" value ")).toBe(false);
      expect(invalid.validations).toEqual(["TrimmedString"]);
    });
  });

  describe("from", () => {
    test("asserts its own Output", () => {
      const { Label, validations } = setupLabel();
      const value = Label.orThrow("value");
      validations.length = 0;

      expect(Label.from(value)).toEqual(ok("value"));
      expectTypeOf(Label.from)
        .parameter(0)
        .toEqualTypeOf<typeof Label.Output>();
      expect(validations).toEqual([
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);
    });

    test("cannot return a validation error", () => {
      const { Label } = setupLabel();

      expectTypeOf(Label.from).returns.toEqualTypeOf<
        Result<typeof Label.Output, never>
      >();
    });
  });

  describe("from.parent", () => {
    test("accepts the parent Output and preserves the final output target", () => {
      const { Label, MaxLengthString } = setupLabel();
      const value = MaxLengthString.orThrow("value");
      const result = Label.from.parent(value);

      expect(result).toEqual(ok("value"));
      expectTypeOf(Label.from.parent)
        .parameter(0)
        .toEqualTypeOf<typeof MaxLengthString.Output>();
      expectTypeOf(result).toEqualTypeOf<Result<typeof Label.Output, never>>();
    });

    test("infers only errors after the selected input boundary", () => {
      const {
        Label,
        MaxLengthString: _MaxLengthString,
        NonEmptyString: _NonEmptyString,
        TrimmedString: _TrimmedString,
      } = setupLabel();

      expectTypeOf(Label.from.parent).returns.toEqualTypeOf<
        Result<typeof Label.Output, never>
      >();
      expectTypeOf(Label.from.parent.parent).returns.toEqualTypeOf<
        Result<typeof Label.Output, typeof _MaxLengthString.Error>
      >();
      expectTypeOf(Label.from.parent.parent.parent).returns.toEqualTypeOf<
        Result<
          typeof Label.Output,
          typeof _NonEmptyString.Error | typeof _MaxLengthString.Error
        >
      >();
      expectTypeOf(
        Label.from.parent.parent.parent.parent,
      ).returns.toEqualTypeOf<
        Result<
          typeof Label.Output,
          | typeof _TrimmedString.Error
          | typeof _NonEmptyString.Error
          | typeof _MaxLengthString.Error
        >
      >();
      expectTypeOf(Label.from.parent)
        .parameter(0)
        .toEqualTypeOf<typeof _MaxLengthString.Output>();
      expectTypeOf(Label.from.parent.parent)
        .parameter(0)
        .toEqualTypeOf<typeof _NonEmptyString.Output>();
      expectTypeOf(Label.from.parent.parent.parent)
        .parameter(0)
        .toEqualTypeOf<typeof _TrimmedString.Output>();
      expectTypeOf(Label.from.parent.parent.parent.parent)
        .parameter(0)
        .toEqualTypeOf<typeof String.Output>();
    });

    test("asserts the selected boundary and validates the remaining Types", () => {
      const {
        Label,
        MaxLengthString,
        NonEmptyString,
        TrimmedString,
        validations,
      } = setupLabel();

      const maxLength = MaxLengthString.orThrow("value");
      validations.length = 0;
      expect(Label.from.parent(maxLength)).toEqual(ok("value"));
      expect(validations).toEqual([
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      const nonEmpty = NonEmptyString.orThrow("value");
      validations.length = 0;
      expect(Label.from.parent.parent(nonEmpty)).toEqual(ok("value"));
      expect(validations).toEqual([
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      const trimmed = TrimmedString.orThrow("value");
      validations.length = 0;
      expect(Label.from.parent.parent.parent(trimmed)).toEqual(ok("value"));
      expect(validations).toEqual([
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);

      validations.length = 0;
      expect(Label.from.parent.parent.parent.parent("value")).toEqual(
        ok("value"),
      );
      expect(validations).toEqual([
        "TrimmedString",
        "NonEmptyString",
        "MaxLengthString",
      ]);
    });

    test("ends when the input boundary reaches the root", () => {
      const { Label } = setupLabel();
      const deepest = Label.from.parent.parent.parent.parent;

      expect("parent" in deepest).toBe(false);
      expectTypeOf<"parent">().not.toExtend<keyof typeof deepest>();
    });
  });

  describe("orThrow", () => {
    test("converts a typed Input or throws the first failing Type error", () => {
      const { Label, validations } = setupLabel();
      const value = Label.orThrow("value");

      expect(value).toBe("value");
      expectTypeOf(value).toEqualTypeOf<typeof Label.Output>();
      expectTypeOf(Label.orThrow)
        .parameter(0)
        .toEqualTypeOf<typeof Label.Input>();
      validations.length = 0;
      expectAssertionError(() => Label.orThrow(" value "), "getOrThrow", {
        type: "TrimmedString",
        value: " value ",
      });
      expect(validations).toEqual(["TrimmedString"]);
    });
  });

  describe("orNull", () => {
    test("converts a typed Input or returns null for the first failing Type", () => {
      const { Label, validations } = setupLabel();
      const value = Label.orNull("value");

      expect(value).toBe("value");
      expectTypeOf(value).toEqualTypeOf<typeof Label.Output | null>();
      expectTypeOf(Label.orNull)
        .parameter(0)
        .toEqualTypeOf<typeof Label.Input>();
      validations.length = 0;
      expect(Label.orNull(" value ")).toBeNull();
      expect(validations).toEqual(["TrimmedString"]);
    });
  });

  test("does not expose parent input boundaries through convenience operations", () => {
    const { Label } = setupLabel();

    expect("parent" in Label.orThrow).toBe(false);
    expectTypeOf<"parent">().not.toExtend<keyof typeof Label.orThrow>();
    expect("parent" in Label.orNull).toBe(false);
    expectTypeOf<"parent">().not.toExtend<keyof typeof Label.orNull>();
  });

  describe("Type", () => {
    describe("DateIso", () => {
      test("is branded from String", () => {
        expect(DateIso.name).toBe("DateIso");
        expect(DateIso.parent).toBe(String);
        expectTypeOf(DateIso).toEqualTypeOf<
          BrandType<typeof String, "DateIso", DateIsoError>
        >();
        expectTypeOf<typeof DateIso.Input>().toEqualTypeOf<string>();
        expectTypeOf<typeof DateIso.Output>().toEqualTypeOf<
          string & Brand<"DateIso">
        >();
        expectTypeOf<typeof DateIso.Error>().toEqualTypeOf<DateIsoError>();
        expectTypeOf<DateIsoError>().toExtend<TypeValueError<"DateIso">>();
      });

      test("accepts canonical ISO 8601 date-time strings", () => {
        const values = [
          "0000-01-01T00:00:00.000Z",
          "2023-01-01T12:00:00.000Z",
          "9999-12-31T23:59:59.999Z",
        ];

        for (const value of values) {
          expect(DateIso.from.parent(value)).toEqual(ok(value));
        }
      });

      test("returns a DateIso error for invalid or non-canonical date-time strings", () => {
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
          expect(DateIso.from.parent(value)).toEqual(
            err({ type: "DateIso", value }),
          );
        }
      });

      test("returns the parent TypeOf error for a non-string unknown value", () => {
        const value: unknown = 42;

        expect(DateIso.fromUnknown(value)).toEqual(
          err({ type: "TypeOf", expected: "String", value }),
        );
      });

      test("formats its own and inherited errors", () => {
        expect(
          DateIso.formatError({ type: "DateIso", value: "2023-01-01" }),
        ).toBe(
          'The value "2023-01-01" is not a canonical ISO date-time string.',
        );
        expect(
          DateIso.formatError({
            type: "TypeOf",
            expected: "String",
            value: 42,
          }),
        ).toBe("A value 42 is not a string.");
        expectTypeOf(DateIso.formatError)
          .parameter(0)
          .toEqualTypeOf<TypeOfError<"String"> | DateIsoError>();
      });
    });

    describe("Int64", () => {
      test("is branded from BigInt", () => {
        expect(Int64.name).toBe("Int64");
        expect(Int64.parent).toBe(BigInt);
        expectTypeOf(Int64).toEqualTypeOf<
          BrandType<typeof BigInt, "Int64", Int64Error>
        >();
        expectTypeOf<typeof Int64.Input>().toEqualTypeOf<bigint>();
        expectTypeOf<typeof Int64.Output>().toEqualTypeOf<
          bigint & Brand<"Int64">
        >();
        expectTypeOf<typeof Int64.Error>().toEqualTypeOf<Int64Error>();
        expectTypeOf<Int64Error>().toExtend<TypeValueError<"Int64">>();
      });

      test("accepts signed 64-bit boundary values", () => {
        const values = [-9223372036854775808n, 0n, 9223372036854775807n];

        for (const value of values) {
          expect(Int64.from.parent(value)).toEqual(ok(value));
        }
      });

      test("returns an Int64 error for bigint values outside the signed 64-bit range", () => {
        const values = [-9223372036854775809n, 9223372036854775808n];

        for (const value of values) {
          expect(Int64.from.parent(value)).toEqual(
            err({ type: "Int64", value }),
          );
        }
      });

      test("formats its own and inherited errors", () => {
        expect(
          Int64.formatError({ type: "Int64", value: 9223372036854775808n }),
        ).toBe(
          "The value 9223372036854775808 is not a valid signed 64-bit integer (Int64).",
        );
        expect(
          Int64.formatError({
            type: "TypeOf",
            expected: "BigInt",
            value: 42,
          }),
        ).toBe("A value 42 is not a bigint.");
        expectTypeOf(Int64.formatError)
          .parameter(0)
          .toEqualTypeOf<TypeOfError<"BigInt"> | Int64Error>();
      });
    });

    describe("UInt64", () => {
      test("is branded from BigInt", () => {
        expect(UInt64.name).toBe("UInt64");
        expect(UInt64.parent).toBe(BigInt);
        expectTypeOf(UInt64).toEqualTypeOf<
          BrandType<typeof BigInt, "UInt64", UInt64Error>
        >();
        expectTypeOf<typeof UInt64.Input>().toEqualTypeOf<bigint>();
        expectTypeOf<typeof UInt64.Output>().toEqualTypeOf<
          bigint & Brand<"UInt64">
        >();
        expectTypeOf<typeof UInt64.Error>().toEqualTypeOf<UInt64Error>();
        expectTypeOf<UInt64Error>().toExtend<TypeValueError<"UInt64">>();
      });

      test("accepts unsigned 64-bit boundary values", () => {
        const values = [0n, 18_446_744_073_709_551_615n];

        for (const value of values) {
          expect(UInt64.from.parent(value)).toEqual(ok(value));
        }
      });

      test("returns a UInt64 error for bigint values outside the unsigned 64-bit range", () => {
        const values = [-1n, 18_446_744_073_709_551_616n];

        for (const value of values) {
          expect(UInt64.from.parent(value)).toEqual(
            err({ type: "UInt64", value }),
          );
        }
      });

      test("formats its own and inherited errors", () => {
        expect(
          UInt64.formatError({
            type: "UInt64",
            value: 18_446_744_073_709_551_616n,
          }),
        ).toBe(
          "The value 18446744073709551616 is not a valid unsigned 64-bit integer (UInt64).",
        );
        expect(
          UInt64.formatError({
            type: "TypeOf",
            expected: "BigInt",
            value: 42,
          }),
        ).toBe("A value 42 is not a bigint.");
        expectTypeOf(UInt64.formatError)
          .parameter(0)
          .toEqualTypeOf<TypeOfError<"BigInt"> | UInt64Error>();
      });
    });

    describe("Ratio", () => {
      test("accepts finite numbers from zero to one", () => {
        expect(Ratio.from.parent.parent.parent.parent.parent(0)).toEqual(ok(0));
        expect(Ratio.from.parent.parent.parent.parent.parent(1)).toEqual(ok(1));
        expect(Ratio.from.parent.parent.parent.parent.parent(1.1)).toEqual(
          err({ type: "LessThanOrEqualTo1", value: 1.1, max: 1 }),
        );
        expect(Ratio.from.parent.parent.parent.parent.parent(-0.1)).toEqual(
          err({ type: "NonNegative", value: -0.1 }),
        );
      });
    });

    describe("PositiveDecimalString", () => {
      test("is branded from String", () => {
        expect(PositiveDecimalString.name).toBe("PositiveDecimalString");
        expect(PositiveDecimalString.parent).toBe(String);
        expectTypeOf(PositiveDecimalString).toEqualTypeOf<
          BrandType<
            typeof String,
            "PositiveDecimalString",
            PositiveDecimalStringError
          >
        >();
        expectTypeOf<typeof PositiveDecimalString.Output>().toEqualTypeOf<
          string & Brand<"PositiveDecimalString">
        >();
      });

      test("accepts one canonical spelling of every positive decimal", () => {
        for (const value of ["1", "25", "0.3", "0.01", "10.25"]) {
          expect(PositiveDecimalString.from.parent(value)).toEqual(ok(value));
        }
      });

      test("rejects zero and non-canonical decimal spellings", () => {
        for (const value of [
          "0",
          "-0.3",
          "+0.3",
          ".3",
          "0.30",
          "00.3",
          "3e-1",
        ]) {
          expect(PositiveDecimalString.from.parent(value)).toEqual(
            err({ type: "PositiveDecimalString", value }),
          );
        }
      });

      test("formats its validation error", () => {
        expect(
          PositiveDecimalString.formatError({
            type: "PositiveDecimalString",
            value: "0.30",
          }),
        ).toBe('The value "0.30" must be a canonical positive decimal string.');
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

  test("infers a reusable factory and preserves the exact parent Type", () => {
    const { nonEmpty } = createNonEmpty();
    const NonEmptyTrimmedString = nonEmpty(TrimmedString);

    expectTypeOf(nonEmpty).toEqualTypeOf<
      BrandFactory<
        "NonEmpty",
        { readonly length: number },
        typeof NonEmptyTrimmedString.Error
      >
    >();
    expectTypeOf(NonEmptyTrimmedString).toEqualTypeOf<
      BrandType<
        typeof TrimmedString,
        "NonEmpty",
        typeof NonEmptyTrimmedString.Error
      >
    >();
    expectTypeOf<typeof NonEmptyTrimmedString.Output>().toEqualTypeOf<
      string & Brand<"Trimmed"> & Brand<"NonEmpty">
    >();
    expect(NonEmptyTrimmedString.parent).toBe(TrimmedString);
  });

  test("validates values and routes own and inherited errors", () => {
    const { nonEmpty, validations } = createNonEmpty();
    const NonEmptyString = nonEmpty(String);

    expect(NonEmptyString.from.parent("value")).toEqual(ok("value"));
    expect(NonEmptyString.from.parent("")).toEqual(
      err({ type: "NonEmpty", value: "" }),
    );
    expect(validations).toEqual(["value", ""]);
    expect(NonEmptyString.formatError({ type: "NonEmpty", value: "" })).toBe(
      "The value must not be empty.",
    );
    expect(
      NonEmptyString.formatError({
        type: "TypeOf",
        expected: "String",
        value: 1,
      }),
    ).toBe("A value 1 is not a string.");
  });

  test("preserves typed input boundaries", () => {
    const { nonEmpty, validations } = createNonEmpty();
    const NonEmptyTrimmedString = nonEmpty(TrimmedString);
    const trimmedString = TrimmedString.orThrow("Ada");

    validations.length = 0;
    const result = NonEmptyTrimmedString.from.parent(trimmedString);

    expectTypeOf(result).toEqualTypeOf<
      Result<
        typeof NonEmptyTrimmedString.Output,
        typeof NonEmptyTrimmedString.Error
      >
    >();
    expectOk(result, "Ada");
    expect(validations).toEqual(["Ada"]);
    expectTypeOf(NonEmptyTrimmedString.from.parent)
      .parameter(0)
      .toEqualTypeOf<typeof TrimmedString.Output>();
  });

  test("returns the original parent value after successful validation", () => {
    const { nonEmpty } = createNonEmpty();
    const NonEmptyNumbers = nonEmpty(array(Number));
    const values: ReadonlyArray<number> = [1, 2];
    const result = NonEmptyNumbers.from.parent(values);

    expectOk(result, values);
    expect(result.value).toBe(values);
  });

  test("supports factory creators with literal parameters", () => {
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

    expectTypeOf<typeof MaxLength2String.Output>().toEqualTypeOf<
      string & Brand<"MaxLength2">
    >();
    expectTypeOf<typeof MaxLength2String.Error>().toEqualTypeOf<
      MaxLengthError<2>
    >();
    expect(MaxLength2String.from.parent("ab")).toEqual(ok("ab"));
    expect(MaxLength2String.from.parent("abc")).toEqual(
      err({ type: "MaxLength2", max: 2, value: "abc" }),
    );
  });

  test("accepts one Union Type node as a parent", () => {
    const OneOrTwo = union(literal(1), literal(2));
    const PositiveOneOrTwo = positive(OneOrTwo);

    expect(PositiveOneOrTwo.fromUnknown(1)).toEqual(ok(1));
    expect(PositiveOneOrTwo.fromUnknown(2)).toEqual(ok(2));
    expectTypeOf(PositiveOneOrTwo.parent).toEqualTypeOf<typeof OneOrTwo>();
  });

  test("rejects a union of parent Types with compatible Outputs", () => {
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

    expectTypeOf<Parent>().not.toExtend<ParentParameter>();
    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("rejects incompatible and erased parents", () => {
    const { nonEmpty } = createNonEmpty();
    const erased: FormattableTypeNode = String;

    const compileTimeAssertions = () => {
      // @ts-expect-error The parent Output must have a length.
      nonEmpty(Number);
      // @ts-expect-error The parent must preserve its concrete Type information.
      nonEmpty(erased);
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("rejects a parent that already exposes the factory error type", () => {
    const { nonEmpty } = createNonEmpty();
    const NonEmptyString = nonEmpty(String);

    const compileTimeAssertions = () => {
      // @ts-expect-error A Brand Factory error must not duplicate an inherited error type.
      nonEmpty(NonEmptyString);
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  describe("ValidateBrandFactoryNumber", () => {
    test("rejects widened and union numeric parameters", () => {
      const value = globalThis.Number(1);
      const unionValue = 1 as 1 | 2;
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
      };

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });
  });

  describe("Type Factory", () => {
    describe("capitalized", () => {
      test("is a reusable Brand Factory", () => {
        expectTypeOf(capitalized).toEqualTypeOf<
          BrandFactory<"Capitalized", string, CapitalizedError>
        >();
      });

      describe("Type", () => {
        describe("CapitalizedString", () => {
          test("accepts only capitalized strings", () => {
            expect(CapitalizedString.from.parent("Evolu")).toEqual(ok("Evolu"));
            expect(CapitalizedString.from.parent("evolu")).toEqual(
              err({ type: "Capitalized", value: "evolu" }),
            );
            expect(CapitalizedString.from.parent("𐐀x")).toEqual(ok("𐐀x"));
            expect(CapitalizedString.from.parent("𐐨x")).toEqual(
              err({ type: "Capitalized", value: "𐐨x" }),
            );
            expect(
              CapitalizedString.formatError({
                type: "Capitalized",
                value: "evolu",
              }),
            ).toBe('The value "evolu" must be capitalized.');
            expectTypeOf<typeof CapitalizedString.Output>().toEqualTypeOf<
              string & Brand<"Capitalized">
            >();
          });
        });
      });
    });

    describe("trimmed", () => {
      test("is a reusable Brand Factory", () => {
        expectTypeOf(trimmed).toEqualTypeOf<
          BrandFactory<"Trimmed", string, TrimmedError>
        >();
      });

      describe("Type", () => {
        describe("TrimmedString", () => {
          test("accepts only strings without surrounding whitespace", () => {
            expect(TrimmedString.from.parent("Evolu")).toEqual(ok("Evolu"));
            expect(TrimmedString.from.parent(" Evolu ")).toEqual(
              err({ type: "Trimmed", value: " Evolu " }),
            );
            expect(
              TrimmedString.formatError({
                type: "Trimmed",
                value: " Evolu ",
              }),
            ).toBe('The value " Evolu " must be trimmed.');
            expectTypeOf<typeof TrimmedString.Output>().toEqualTypeOf<
              string & Brand<"Trimmed">
            >();
          });
        });
      });
    });

    describe("trim", () => {
      test("returns a TrimmedString", () => {
        const value = trim(" Evolu ");

        expect(value).toBe("Evolu");
        expectTypeOf(value).toEqualTypeOf<TrimmedString>();
      });
    });

    describe("minLength", () => {
      test("creates a Brand Factory requiring a minimum length", () => {
        const min = 2;
        const MinLength2 = minLength(min)(TrimmedString);

        expect(MinLength2.from.parent.parent("ab")).toEqual(ok("ab"));
        expect(MinLength2.from.parent.parent("a")).toEqual(
          err({ type: "MinLength2", value: "a", min: 2 }),
        );
        expect(MinLength2.from.parent.parent(" a")).toEqual(
          err({ type: "Trimmed", value: " a" }),
        );
        expect(
          MinLength2.formatError({ type: "MinLength2", value: "a", min: 2 }),
        ).toBe('The value "a" does not meet the minimum length of 2.');
        expectTypeOf<typeof MinLength2.Output>().toEqualTypeOf<
          string & Brand<"Trimmed"> & Brand<"MinLength2">
        >();
        expectTypeOf<typeof MinLength2.Error>().toEqualTypeOf<
          MinLengthError<2>
        >();
      });

      test("returns a Brand Factory that accepts the parent separately", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Parameterized Brand Factories accept their parent separately.
          minLength(1, String);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });

      describe("Type", () => {
        test("does not predefine NonEmptyString", () => {
          type Type2Exports =
            keyof typeof import("../../../../packages/common/src/Type2.ts");
          type RemovedStringExports = Extract<Type2Exports, "NonEmptyString">;

          expectTypeOf<RemovedStringExports>().toEqualTypeOf<never>();
        });

        describe("NonEmptyTrimmedString", () => {
          test("requires a non-empty TrimmedString", () => {
            expect(NonEmptyTrimmedString.from.parent.parent("Evolu")).toEqual(
              ok("Evolu"),
            );
            expect(NonEmptyTrimmedString.from.parent.parent(" Evolu ")).toEqual(
              err({ type: "Trimmed", value: " Evolu " }),
            );
            expect(NonEmptyTrimmedString.from.parent.parent("")).toEqual(
              err({ type: "MinLength1", value: "", min: 1 }),
            );
          });
        });
      });
    });

    describe("maxLength", () => {
      test("creates a Brand Factory requiring a maximum length", () => {
        const MaxLength2 = maxLength(2)(array(Number));
        const numbers = [1, 2] as const;
        const result = MaxLength2.from.parent(numbers);

        expectOk(result, numbers);
        expect(result.value).toBe(numbers);
        expect(MaxLength2.from.parent([1, 2, 3])).toEqual(
          err({ type: "MaxLength2", value: [1, 2, 3], max: 2 }),
        );
        expect(
          MaxLength2.formatError({
            type: "MaxLength2",
            value: [1, 2, 3],
            max: 2,
          }),
        ).toBe("The value [1,2,3] exceeds the maximum length of 2.");
        expectTypeOf<typeof MaxLength2.Output>().toEqualTypeOf<
          ReadonlyArray<number> & Brand<"MaxLength2">
        >();
      });

      test("requires a parent value with a length", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Length constraints require a value with a length.
          maxLength(1)(Number);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });

      describe("Type", () => {
        test("exports only the recommended bounded String Types", () => {
          type Type2Exports =
            keyof typeof import("../../../../packages/common/src/Type2.ts");
          type RemovedBoundedStringExports = Extract<
            Type2Exports,
            | "String100"
            | "String1000"
            | "NonEmptyString100"
            | "NonEmptyString1000"
            | "TrimmedString100"
            | "TrimmedString1000"
          >;

          expectTypeOf<RemovedBoundedStringExports>().toEqualTypeOf<never>();
        });

        describe("NonEmptyTrimmedString100", () => {
          test("validates maximum length after NonEmptyTrimmedString", () => {
            const value = NonEmptyTrimmedString.orThrow("a".repeat(101));

            expect(NonEmptyTrimmedString100.from.parent(value)).toEqual(
              err({ type: "MaxLength100", value, max: 100 }),
            );
            expect(NonEmptyTrimmedString100.name).toBe("MaxLength100");
            expect(NonEmptyTrimmedString100.parent).toBe(NonEmptyTrimmedString);
            expectTypeOf(NonEmptyTrimmedString100.parent).toEqualTypeOf<
              typeof NonEmptyTrimmedString
            >();
            expectTypeOf<typeof NonEmptyTrimmedString100.Error>().toEqualTypeOf<
              MaxLengthError<100>
            >();
            expectTypeOf(NonEmptyTrimmedString100.from.parent)
              .parameter(0)
              .toEqualTypeOf<typeof NonEmptyTrimmedString.Output>();
            expectTypeOf<
              typeof NonEmptyTrimmedString100.Output
            >().toEqualTypeOf<
              string &
                Brand<"Trimmed"> &
                Brand<"MinLength1"> &
                Brand<"MaxLength100">
            >();
          });
        });

        describe("NonEmptyTrimmedString1000", () => {
          test("validates maximum length after NonEmptyTrimmedString", () => {
            const value = NonEmptyTrimmedString.orThrow("a".repeat(1001));

            expect(NonEmptyTrimmedString1000.from.parent(value)).toEqual(
              err({ type: "MaxLength1000", value, max: 1000 }),
            );
            expect(NonEmptyTrimmedString1000.name).toBe("MaxLength1000");
            expect(NonEmptyTrimmedString1000.parent).toBe(
              NonEmptyTrimmedString,
            );
            expectTypeOf(NonEmptyTrimmedString1000.parent).toEqualTypeOf<
              typeof NonEmptyTrimmedString
            >();
            expectTypeOf<
              typeof NonEmptyTrimmedString1000.Error
            >().toEqualTypeOf<MaxLengthError<1000>>();
            expectTypeOf(NonEmptyTrimmedString1000.from.parent)
              .parameter(0)
              .toEqualTypeOf<typeof NonEmptyTrimmedString.Output>();
            expectTypeOf<
              typeof NonEmptyTrimmedString1000.Output
            >().toEqualTypeOf<
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
      test("creates a Brand Factory requiring an exact length", () => {
        const Length2 = length(2)(String);

        expect(Length2.from.parent("ab")).toEqual(ok("ab"));
        expect(Length2.from.parent("abc")).toEqual(
          err({ type: "Length2", value: "abc", exact: 2 }),
        );
        expect(
          Length2.formatError({ type: "Length2", value: "abc", exact: 2 }),
        ).toBe('The value "abc" does not have the required length of 2.');
        expectTypeOf<typeof Length2.Output>().toEqualTypeOf<
          string & Brand<"Length2">
        >();
      });

      test("requires one concrete parent Type", () => {
        const parent = String as typeof String | typeof Number;
        const compileTimeAssertions = () => {
          // @ts-expect-error A constraint requires one concrete parent Type.
          length(1)(parent);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });
    });

    describe("regex", () => {
      test("requires one concrete name", () => {
        const unionName = "Pattern" as "Pattern" | "Other";
        const broadName = "Pattern" as TypeName;
        const patternedName = "Pattern" as `Pattern${string}`;
        const compileTimeAssertions = () => {
          // @ts-expect-error A union does not identify one concrete Regex name.
          regex(unionName, /./);
          // @ts-expect-error A widened string does not identify one concrete Regex name.
          regex(broadName, /./);
          // @ts-expect-error A template pattern does not identify one concrete Regex name.
          regex(patternedName, /./);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });

      test("keeps stateful matching private and returns immutable pattern data", () => {
        const RepeatedA = regex("RepeatedA", /a+/g)(String);
        const failure = RepeatedA.from.parent("bbb");

        expectErr(failure, {
          type: "RepeatedA",
          value: "bbb",
          source: "a+",
          flags: "g",
        });

        expect(RepeatedA.from.parent("aaa")).toEqual(ok("aaa"));
        expect(RepeatedA.from.parent("aaa")).toEqual(ok("aaa"));
        expect(failure.error).toEqual({
          type: "RepeatedA",
          value: "bbb",
          source: "a+",
          flags: "g",
        });
        expect(RepeatedA.from.parent("bbb")).toEqual(
          err({
            type: "RepeatedA",
            value: "bbb",
            source: "a+",
            flags: "g",
          }),
        );
        expect(
          RepeatedA.formatError({
            type: "RepeatedA",
            value: "bbb",
            source: "a+",
            flags: "g",
          }),
        ).toBe('The value "bbb" does not match /a+/g.');
        expectTypeOf(failure.error.source).toEqualTypeOf<string>();
        expectTypeOf(failure.error.flags).toEqualTypeOf<string>();

        const compileTimeAssertions = () => {
          // @ts-expect-error Regex errors do not expose the live matcher.
          failure.error.pattern.test = () => true;
          // @ts-expect-error Pattern data is readonly.
          failure.error.source = ".*";
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });

      test("requires a string parent Output", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Regex constraints require string Outputs.
          regex("NumberPattern", /1/)(Number);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });

      describe("Type", () => {
        describe("UrlSafeString", () => {
          test("accepts only non-empty URL-safe strings", () => {
            expect(UrlSafeString.from.parent("abc-123_DEF")).toEqual(
              ok("abc-123_DEF"),
            );
            expect(UrlSafeString.from.parent("not safe")).toEqual(
              err({
                type: "UrlSafeString",
                value: "not safe",
                source: "^[A-Za-z0-9_-]+$",
                flags: "",
              }),
            );
            expectTypeOf<typeof UrlSafeString.Output>().toEqualTypeOf<
              string & Brand<"UrlSafeString">
            >();
          });
        });
      });
    });

    describe("nonNegative", () => {
      test("creates a reusable Brand Factory accepting zero and positive numbers", () => {
        const NonNegative = nonNegative(Number);

        expect(NonNegative.from.parent(0)).toEqual(ok(0));
        expect(NonNegative.from.parent(-1)).toEqual(
          err({ type: "NonNegative", value: -1 }),
        );
        expect(
          NonNegative.formatError({ type: "NonNegative", value: -1 }),
        ).toBe("The value -1 must be non-negative (>= 0).");
        expectTypeOf(nonNegative).toEqualTypeOf<
          BrandFactory<"NonNegative", number, NonNegativeError>
        >();
      });

      describe("Type", () => {
        describe("NonNegativeNumber", () => {
          test("accepts zero", () => {
            expect(NonNegativeNumber.from.parent(0)).toEqual(ok(0));
          });
        });

        describe("NonNegativeInt", () => {
          test("accepts zero and provides its minimum value", () => {
            expect(NonNegativeInt.from.parent.parent(0)).toEqual(ok(0));
            expect(zeroNonNegativeInt).toBe(0);
          });
        });

        describe("NonNegativeFiniteNumber", () => {
          test("accepts zero", () => {
            expect(
              NonNegativeFiniteNumber.from.parent.parent.parent(0),
            ).toEqual(ok(0));
          });
        });
      });
    });

    describe("positive", () => {
      test("creates a reusable Brand Factory accepting positive numbers", () => {
        const Positive = positive(Number);

        expect(Positive.from.parent(1)).toEqual(ok(1));
        expect(Positive.from.parent(0)).toEqual(
          err({ type: "Positive", value: 0 }),
        );
        expect(Positive.formatError({ type: "Positive", value: 0 })).toBe(
          "The value 0 must be positive (> 0).",
        );
        expectTypeOf(positive).toEqualTypeOf<
          BrandFactory<"Positive", number, PositiveError>
        >();
      });

      describe("Type", () => {
        describe("PositiveNumber", () => {
          test("accepts positive numbers", () => {
            expect(PositiveNumber.from.parent.parent(1)).toEqual(ok(1));
          });
        });

        describe("PositiveInt", () => {
          test("has the expected brands and boundary values", () => {
            expect(PositiveInt.from.parent.parent.parent(1)).toEqual(ok(1));
            expect(onePositiveInt).toBe(1);
            expect(maxPositiveInt).toBe(globalThis.Number.MAX_SAFE_INTEGER);
            expectTypeOf<typeof PositiveInt.Output>().toEqualTypeOf<
              number & Brand<"Int"> & Brand<"NonNegative"> & Brand<"Positive">
            >();
          });
        });
      });
    });

    describe("nonPositive", () => {
      test("creates a reusable Brand Factory accepting zero and negative numbers", () => {
        const NonPositive = nonPositive(Number);

        expect(NonPositive.from.parent(0)).toEqual(ok(0));
        expect(NonPositive.from.parent(1)).toEqual(
          err({ type: "NonPositive", value: 1 }),
        );
        expect(NonPositive.formatError({ type: "NonPositive", value: 1 })).toBe(
          "The value 1 must be non-positive (<= 0).",
        );
        expectTypeOf(nonPositive).toEqualTypeOf<
          BrandFactory<"NonPositive", number, NonPositiveError>
        >();
      });

      describe("Type", () => {
        describe("NonPositiveNumber", () => {
          test("accepts zero", () => {
            expect(NonPositiveNumber.from.parent(0)).toEqual(ok(0));
          });
        });

        describe("NonPositiveInt", () => {
          test("accepts zero", () => {
            expect(NonPositiveInt.from.parent.parent(0)).toEqual(ok(0));
          });
        });
      });
    });

    describe("negative", () => {
      test("creates a reusable Brand Factory accepting negative numbers", () => {
        const Negative = negative(Number);

        expect(Negative.from.parent(-1)).toEqual(ok(-1));
        expect(Negative.from.parent(0)).toEqual(
          err({ type: "Negative", value: 0 }),
        );
        expect(Negative.formatError({ type: "Negative", value: 0 })).toBe(
          "The value 0 must be negative (< 0).",
        );
        expectTypeOf(negative).toEqualTypeOf<
          BrandFactory<"Negative", number, NegativeError>
        >();
      });

      describe("Type", () => {
        describe("NegativeNumber", () => {
          test("accepts negative numbers", () => {
            expect(NegativeNumber.from.parent.parent(-1)).toEqual(ok(-1));
          });
        });

        describe("NegativeInt", () => {
          test("accepts negative integers", () => {
            expect(NegativeInt.from.parent.parent.parent(-1)).toEqual(ok(-1));
          });
        });
      });
    });

    describe("int", () => {
      test("creates a reusable Brand Factory accepting only safe integers", () => {
        const SafeInt = int(Number);

        expect(SafeInt.from.parent(42)).toEqual(ok(42));
        expect(SafeInt.from.parent(1.5)).toEqual(
          err({ type: "Int", value: 1.5 }),
        );
        expect(SafeInt.formatError({ type: "Int", value: 1.5 })).toBe(
          "The value 1.5 must be a safe integer.",
        );
        expectTypeOf(int).toEqualTypeOf<
          BrandFactory<"Int", number, IntError>
        >();
      });

      describe("Type", () => {
        describe("Int", () => {
          test("accepts only safe integers", () => {
            expect(Int.from.parent(42)).toEqual(ok(42));
            expect(Int.from.parent(1.5)).toEqual(
              err({ type: "Int", value: 1.5 }),
            );
          });
        });
      });
    });

    describe("greaterThan", () => {
      test("creates a Brand Factory requiring a number greater than its minimum", () => {
        const GreaterThan5 = greaterThan(5)(Number);

        expect(GreaterThan5.from.parent(6)).toEqual(ok(6));
        expect(GreaterThan5.from.parent(5)).toEqual(
          err({ type: "GreaterThan5", value: 5, min: 5 }),
        );
        expect(
          GreaterThan5.formatError({
            type: "GreaterThan5",
            value: 5,
            min: 5,
          }),
        ).toBe("The value 5 must be greater than 5.");
        expectTypeOf<typeof GreaterThan5.Error>().toEqualTypeOf<
          GreaterThanError<5>
        >();
      });
    });

    describe("greaterThanOrEqualTo", () => {
      test("creates a Brand Factory requiring a number at or above its minimum", () => {
        const AtLeast5 = greaterThanOrEqualTo(5)(Number);

        expect(AtLeast5.from.parent(5)).toEqual(ok(5));
        expect(AtLeast5.from.parent(4)).toEqual(
          err({ type: "GreaterThanOrEqualTo5", value: 4, min: 5 }),
        );
        expect(
          AtLeast5.formatError({
            type: "GreaterThanOrEqualTo5",
            value: 4,
            min: 5,
          }),
        ).toBe("The value 4 must be greater than or equal to 5.");
      });
    });

    describe("lessThan", () => {
      test("creates a Brand Factory requiring a number less than its maximum", () => {
        const max = 5;
        const LessThan5 = lessThan(max)(Number);

        expect(LessThan5.from.parent(4)).toEqual(ok(4));
        expect(LessThan5.from.parent(5)).toEqual(
          err({ type: "LessThan5", value: 5, max: 5 }),
        );
        expect(
          LessThan5.formatError({ type: "LessThan5", value: 5, max: 5 }),
        ).toBe("The value 5 must be less than 5.");
      });

      test("requires a number parent Output", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Numeric constraints require number Outputs.
          lessThan(1)(String);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });
    });

    describe("lessThanOrEqualTo", () => {
      test("creates a Brand Factory requiring a number at or below its maximum", () => {
        const AtMost5 = lessThanOrEqualTo(5)(Number);

        expect(AtMost5.from.parent(5)).toEqual(ok(5));
        expect(AtMost5.from.parent(6)).toEqual(
          err({ type: "LessThanOrEqualTo5", value: 6, max: 5 }),
        );
        expect(
          AtMost5.formatError({
            type: "LessThanOrEqualTo5",
            value: 6,
            max: 5,
          }),
        ).toBe("The value 6 must be less than or equal to 5.");
        expectTypeOf<typeof AtMost5.Output>().toEqualTypeOf<
          number & Brand<"LessThanOrEqualTo5">
        >();
      });

      test("composes with PositiveInt into a branded Age", () => {
        const Age = brand("Age", lessThanOrEqualTo(99)(PositiveInt));
        type Age = typeof Age.Output;
        const positiveInt = PositiveInt.orThrow(42);
        const result = Age.from.parent.parent(positiveInt);

        expect(Age.from.parent.parent.parent.parent.parent(1)).toEqual(ok(1));
        expect(Age.from.parent.parent.parent.parent.parent(99)).toEqual(ok(99));
        expect(Age.from.parent.parent.parent.parent.parent(0)).toEqual(
          err({ type: "Positive", value: 0 }),
        );
        expect(Age.from.parent.parent.parent.parent.parent(100)).toEqual(
          err({ type: "LessThanOrEqualTo99", value: 100, max: 99 }),
        );
        expectTypeOf(result).toEqualTypeOf<
          Result<Age, LessThanOrEqualToError<99>>
        >();
        expectOk(result, 42);
        expectTypeOf<Age>().toEqualTypeOf<
          number &
            Brand<"Int"> &
            Brand<"NonNegative"> &
            Brand<"Positive"> &
            Brand<"LessThanOrEqualTo99"> &
            Brand<"Age">
        >();
      });
    });

    describe("nonNaN", () => {
      test("is a reusable Brand Factory", () => {
        expectTypeOf(nonNaN).toEqualTypeOf<
          BrandFactory<"NonNaN", number, NonNaNError>
        >();
      });

      describe("Type", () => {
        describe("NonNaNNumber", () => {
          test("rejects NaN", () => {
            expect(NonNaNNumber.from.parent(globalThis.Number.NaN)).toEqual(
              err({ type: "NonNaN", value: globalThis.Number.NaN }),
            );
            expect(
              NonNaNNumber.formatError({
                type: "NonNaN",
                value: globalThis.Number.NaN,
              }),
            ).toBe("The value must not be NaN.");
          });
        });
      });
    });

    describe("finite", () => {
      test("is a reusable Brand Factory", () => {
        expectTypeOf(finite).toEqualTypeOf<
          BrandFactory<"Finite", number, FiniteError>
        >();
      });

      describe("Type", () => {
        describe("FiniteNumber", () => {
          test("rejects infinities", () => {
            expect(
              FiniteNumber.from.parent.parent(
                globalThis.Number.POSITIVE_INFINITY,
              ),
            ).toEqual(
              err({
                type: "Finite",
                value: globalThis.Number.POSITIVE_INFINITY,
              }),
            );
            expect(
              FiniteNumber.formatError({
                type: "Finite",
                value: globalThis.Number.POSITIVE_INFINITY,
              }),
            ).toBe("The value Infinity must be finite.");
          });
        });
      });
    });

    describe("multipleOf", () => {
      test("accepts a canonical literal divisor", () => {
        const MultipleOf3 = multipleOf("3")(Number);

        expectTypeOf(MultipleOf3.name).toEqualTypeOf<"MultipleOf3">();
      });

      test("rejects invalid literal and unvalidated dynamic divisors at compile time", () => {
        const value = globalThis.String("0.1");
        const unionValue = "0.1" as "0.1" | "0.2";
        const compileTimeAssertions = () => {
          // @ts-expect-error The divisor must be an exact decimal string.
          multipleOf(0.1);
          // @ts-expect-error Zero is not a positive divisor.
          multipleOf("0");
          // @ts-expect-error Negative divisors are not positive.
          multipleOf("-0.1");
          // @ts-expect-error Trailing fractional zeroes are not canonical.
          multipleOf("0.10");
          // @ts-expect-error Exponent notation is not canonical.
          multipleOf("1e-1");
          // @ts-expect-error A runtime string cannot produce one concrete Brand name.
          multipleOf(value);
          const divisor = PositiveDecimalString.orThrow("0.1");
          // @ts-expect-error A runtime value cannot produce one concrete Brand name.
          multipleOf(divisor);
          // @ts-expect-error A divisor must not be a union.
          multipleOf(unionValue);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
      });

      test("asserts invalid construction values that bypass the static contract", () => {
        const divisor = "0.10" as unknown as "0.1";

        expectAssertionError(
          () => multipleOf(divisor),
          'The value "0.10" must be a canonical positive decimal string.',
          { type: "PositiveDecimalString", value: "0.10" },
        );
      });

      test("creates a Brand Factory requiring an integer multiple", () => {
        const MultipleOf3 = multipleOf("3")(Number);

        expect(MultipleOf3.from.parent(6)).toEqual(ok(6));
        expect(MultipleOf3.from.parent(5)).toEqual(
          err({ type: "MultipleOf3", value: 5, divisor: "3" }),
        );
        expect(
          MultipleOf3.formatError({
            type: "MultipleOf3",
            value: 5,
            divisor: "3",
          }),
        ).toBe("The value 5 must be a multiple of 3.");
      });

      test("uses exact base-10 semantics for decimal multiples", () => {
        const Tenths = multipleOf("0.1")(Number);
        const Fifths = multipleOf("0.2")(Number);
        const Thirds = multipleOf("0.3")(Number);
        const TwoFifths = multipleOf("0.4")(Number);
        const Quarters = multipleOf("0.25")(Number);
        const TenMillionths = multipleOf("0.0000001")(Number);
        const Thousands = multipleOf("1000")(Number);

        for (const value of [0, -0, 0.3, -0.3, 1.5]) {
          expect(Tenths.from.parent(value)).toEqual(ok(value));
        }
        expect(Tenths.from.parent(0.31)).toEqual(
          err({ type: "MultipleOf0.1", value: 0.31, divisor: "0.1" }),
        );
        expect(Tenths.from.parent(0.1 + 0.2)).toEqual(
          err({
            type: "MultipleOf0.1",
            value: 0.1 + 0.2,
            divisor: "0.1",
          }),
        );
        expect(Fifths.from.parent(1)).toEqual(ok(1));
        expect(Thirds.from.parent(1)).toEqual(
          err({ type: "MultipleOf0.3", value: 1, divisor: "0.3" }),
        );
        expect(TwoFifths.from.parent(1)).toEqual(
          err({ type: "MultipleOf0.4", value: 1, divisor: "0.4" }),
        );
        expect(Quarters.from.parent(0.1)).toEqual(
          err({ type: "MultipleOf0.25", value: 0.1, divisor: "0.25" }),
        );
        expect(Quarters.from.parent(0.5)).toEqual(ok(0.5));
        expect(TenMillionths.from.parent(3e-7)).toEqual(ok(3e-7));
        expect(TenMillionths.from.parent(3.1e-7)).toEqual(
          err({
            type: "MultipleOf0.0000001",
            value: 3.1e-7,
            divisor: "0.0000001",
          }),
        );
        expect(Thousands.from.parent(1e21)).toEqual(ok(1e21));
      });

      test("rejects non-finite numbers", () => {
        const MultipleOf1 = multipleOf("1")(Number);

        for (const value of [globalThis.Number.NaN, Infinity, -Infinity]) {
          expect(MultipleOf1.from.parent(value)).toEqual(
            err({ type: "MultipleOf1", value, divisor: "1" }),
          );
        }
      });
    });

    describe("between", () => {
      test("creates a Brand Factory requiring an inclusive range", () => {
        const Between1And3 = between(1, 3)(Number);

        expect(Between1And3.from.parent(2)).toEqual(ok(2));
        expect(Between1And3.from.parent(0)).toEqual(
          err({ type: "Between1-3", value: 0, min: 1, max: 3 }),
        );
        expect(Between1And3.from.parent(4)).toEqual(
          err({ type: "Between1-3", value: 4, min: 1, max: 3 }),
        );
        expect(
          Between1And3.formatError({
            type: "Between1-3",
            value: 4,
            min: 1,
            max: 3,
          }),
        ).toBe("The value 4 must be between 1 and 3, inclusive.");
      });

      test("returns a Brand Factory that accepts the parent separately", () => {
        const compileTimeAssertions = () => {
          // @ts-expect-error Parameterized Brand Factories accept their parent separately.
          between(1, 2, Number);
        };

        expectTypeOf(compileTimeAssertions).toBeFunction();
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
    test("mirrors its element Type chain", () => {
      const { PositiveInt, UserId, UserIds } = setupUserIds();

      expect(UserIds.name).toBe("Array");
      expect(UserIds.element).toBe(UserId);
      expect(UserIds.element.parent).toBe(PositiveInt);
      expect(UserIds.parent.element).toBe(PositiveInt);
      expect(UserIds.parent.element).toBe(UserIds.element.parent);
      expect(UserIds.parent.parent.element).toBe(Number);
      expect(UserIds.parent.parent.parent).toBeNull();
      expectTypeOf(UserIds).toEqualTypeOf<ArrayType<typeof UserId>>();
      expectTypeOf<typeof UserIds.Input>().toEqualTypeOf<
        ReadonlyArray<number>
      >();
      expectTypeOf<typeof UserIds.Output>().toEqualTypeOf<
        ReadonlyArray<typeof UserId.Output>
      >();
      expectTypeOf<typeof UserIds.Error>().toEqualTypeOf<never>();
      expectTypeOf<InferErrors<typeof UserIds>>().toEqualTypeOf<
        ArrayError<TypeOfError<"Number"> | typeof PositiveInt.Error>
      >();
      expectTypeOf<
        InferErrors<typeof UserIds>
      >().not.toExtend<TypeValueError>();
      expectTypeOf<
        ArrayItemsError<
          TypeOfError<"Number"> | typeof PositiveInt.Error
        >["reason"]["issues"][number]
      >().toEqualTypeOf<
        ArrayIssue<TypeOfError<"Number"> | typeof PositiveInt.Error>
      >();
      expectTypeOf<
        ArrayElementsError<
          TypeOfError<"Number"> | typeof PositiveInt.Error
        >["reason"]["issues"][number]
      >().toEqualTypeOf<
        | ArrayElementIssue<TypeOfError<"Number">>
        | ArrayElementIssue<typeof PositiveInt.Error>
      >();
      expectTypeOf<ArrayElementIssue<never>>().toEqualTypeOf<never>();
      expectTypeOf<ArrayExcessPropertyIssue>().toExtend<
        ArrayItemsError<TypeOfError<"Number">>["reason"]["issues"][number]
      >();
      expectTypeOf<ArrayExcessPropertyIssue>().not.toExtend<
        ArrayElementsError<TypeOfError<"Number">>["reason"]["issues"][number]
      >();
      expectTypeOf<ArrayExcessPropertyIssue["key"]>().toEqualTypeOf<
        string | symbol
      >();
    });

    test("reuses an Array Type by element Type identity", () => {
      const { PositiveInt, UserId, UserIds } = setupUserIds();
      const OtherUserId = brand("UserId", PositiveInt);

      expect(array(UserId)).toBe(UserIds);
      expect(UserIds.parent).toBe(array(PositiveInt));
      expect(UserIds.parent.parent).toBe(array(Number));
      expect(array(OtherUserId)).not.toBe(UserIds);
      expect(array(array(Number))).toBe(array(array(Number)));
    });

    test("allows heterogeneous element issues in one error", () => {
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

      expect(mixed.reason.issues).toEqual([
        { kind: "Element", index: 0, error: { type: "A", value: 1 } },
        { kind: "Element", index: 1, error: { type: "B", value: "x" } },
      ]);
    });

    test("rejects a union of element Types", () => {
      type Element = typeof String | typeof Number;
      type ElementParameter = Parameters<typeof array<Element>>[0];

      expectTypeOf<Element>().not.toExtend<ElementParameter>();
      expectTypeOf<ElementParameter>().toEqualTypeOf<"⛔ Type error: Element must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes.">();
    });

    test("rejects an unresolved generic element Type", () => {
      const compileTimeAssertions = <
        Element extends typeof String | typeof Number,
      >(
        element: Element,
      ): Element => {
        // @ts-expect-error An unresolved generic element might be a union.
        array(element);
        return element;
      };

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("rejects an element with erased concrete Type information", () => {
      const erased: FormattableTypeNode = brand("Erased", String);

      const compileTimeAssertions = () => {
        // @ts-expect-error An element must preserve its concrete Type.
        array(erased);
      };

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });
  });

  describe("formatError", () => {
    test("formats its own error or the first nested error without a path", () => {
      const Strings = array(String);

      expect(
        Strings.formatError({
          type: "Array",
          reason: { kind: "NotArray", value: null },
        }),
      ).toBe("A value null is not an array.");
      expect(
        Strings.formatError({
          type: "Array",
          reason: { kind: "UnexpectedPrototype", value: [] },
        }),
      ).toBe(
        "The value is an array, but an Array Output must use this realm's Array.prototype. For a trusted return contract, cast and skip this Type; otherwise, use boundary-specific validation or transformation.",
      );
      expect(
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
      ).toBe("A value 42 is not a string.");
      expect(
        Strings.formatError({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 2 }],
          },
        }),
      ).toBe("An array element at index 2 is missing.");
      expect(
        Strings.formatError({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Accessor", index: 2 }],
          },
        }),
      ).toBe("An array element at index 2 must be a data property.");
      expect(
        Strings.formatError({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "ExcessProperty", key: "metadata" }],
          },
        }),
      ).toBe(
        "An excess Array property is not allowed. Remove it or use a different Type.",
      );
      expectTypeOf(Strings.formatError)
        .parameter(0)
        .toEqualTypeOf<ArrayError<TypeOfError<"String">>>();
    });
  });

  describe("composition", () => {
    test("decodes and encodes elements", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);
      const encoded = ["1", "2"] as const;
      const output = [1, 2] as const;

      const fromResult = Numbers.from.parent(encoded);
      const toResult = Numbers.to(output);

      expectOk(fromResult, [1, 2]);
      expect(fromResult.value).not.toBe(encoded);
      expect(toResult).toEqual(["1", "2"]);
      expect(toResult).not.toBe(output);
      expect(Numbers.is([1, 2])).toBe(true);
      expect(Numbers.is(["1", "2"])).toBe(false);
      expectTypeOf<typeof Numbers.Input>().toEqualTypeOf<
        ReadonlyArray<string>
      >();
      expectTypeOf<typeof Numbers.Output>().toEqualTypeOf<
        ReadonlyArray<number>
      >();
    });

    test("rejects excess properties instead of discarding them during transformations", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);
      const input = globalThis.Object.assign(["1"], {
        metadata: "important",
      });
      const output = globalThis.Object.assign([1], {
        metadata: "important",
      });
      const error = err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      });
      const message =
        "An excess Array property is not allowed. Remove it or use a different Type.";

      expect(Numbers.is(output)).toBe(false);
      expect(Numbers.fromUnknown(input)).toEqual(error);
      expect(() => Numbers.from.parent(input)).toThrow(message);
      expect(() => Numbers.to(output)).toThrow(message);
    });

    test("rejects excess properties even when element encoding is identity", () => {
      const Numbers = array(Number);
      const value = globalThis.Object.assign([1], {
        metadata: "important",
      });
      const error = err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: [{ kind: "ExcessProperty", key: "metadata" }],
        },
      });
      const message =
        "An excess Array property is not allowed. Remove it or use a different Type.";

      expect(Numbers.is(value)).toBe(false);
      expect(Numbers.fromUnknown(value)).toEqual(error);
      expect(() => Numbers.from(value)).toThrow(message);
      expect(() => Numbers.to(value)).toThrow(message);
    });

    test("rejects non-enumerable and symbol properties without reading them", () => {
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

      expect(Numbers.is(value)).toBe(false);
      expect(Numbers.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(reads).toBe(0);
    });

    test("accepts ordinary Record elements through typed operations", () => {
      const Values = array(record(String, Number));
      const input = [{ value: 1 }];
      const fromUnknownResult = Values.fromUnknown(input);

      expectOk(fromUnknownResult, input);
      const output = fromUnknownResult.value;
      expect(Values.parent).toBeNull();
      expect("parent" in Values.from).toBe(false);
      expect(Values.is(input)).toBe(true);
      expect(output).toBe(input);
      expect(Values.is(output)).toBe(true);
      expect(Values.from(input)).toEqual(ok(input));
      expect(Values.to(input)).toBe(input);
      expect(Values.orThrow(input)).toBe(input);
      expect(Values.orNull(input)).toBe(input);
    });

    test("rejects holes independently of the element Type", () => {
      const Strings = array(String);
      const Undefineds = array(Undefined);
      const Unknowns = array(Unknown);
      const sparse = new Array<unknown>(1);
      const error = err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: [{ kind: "Hole", index: 0 }],
        },
      });

      expect(Strings.is(sparse)).toBe(false);
      expect(Strings.fromUnknown(sparse)).toEqual(error);
      expect(Undefineds.is(sparse)).toBe(false);
      expect(Undefineds.fromUnknown(sparse)).toEqual(error);
      expect(Unknowns.is(sparse)).toBe(false);
      expect(Unknowns.fromUnknown(sparse)).toEqual(error);
      expectTypeOf(Unknowns.fromUnknown(sparse)).toEqualTypeOf<
        Result<ReadonlyArray<unknown>, ArrayError<never>>
      >();
    });

    test("rejects arrays with a custom prototype before reading inherited elements", () => {
      const Strings = array(String);
      const prototype: Array<unknown> = ["inherited"];
      const sparseStrings = new Array<string>(1);
      globalThis.Object.setPrototypeOf(sparseStrings, prototype);

      expect(Strings.is(sparseStrings)).toBe(false);
      expect(Strings.fromUnknown(sparseStrings)).toEqual(
        err({
          type: "Array",
          reason: { kind: "UnexpectedPrototype", value: sparseStrings },
        }),
      );
    });

    test("rejects Array subclasses at unknown and typed boundaries", () => {
      const Values = array(Number);

      class NumberArray extends globalThis.Array<number> {}

      const value = new NumberArray(1);
      const error = err({
        type: "Array",
        reason: { kind: "UnexpectedPrototype", value },
      });

      expect(Values.fromUnknown(value)).toEqual(error);
      expect(Values.is(value)).toBe(false);
      const message =
        "The value is an array, but an Array Output must use this realm's Array.prototype.";
      expect(() => Values.from(value)).toThrow(message);
      expect(() => Values.to(value)).toThrow(message);
    });

    test("locates decoding transformation errors by element", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);

      expect(Numbers.from.parent(["1", "no"])).toEqual(
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

    test("validates Literal elements through from.parent", () => {
      const Hello = literal("Hello");
      const Hellos = array(Hello);

      expect(Hellos.parent).toBe(array(String));
      expect(Hellos.parent.parent).toBeNull();
      expect(Hellos.from.parent(["Hello", "Hello"])).toEqual(
        ok(["Hello", "Hello"]),
      );
      expect(Hellos.from.parent(["Hello", "World"])).toEqual(
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
      expectTypeOf(Hellos.from.parent(["Hello"])).toEqualTypeOf<
        Result<
          ReadonlyArray<"Hello">,
          ArrayElementsError<LiteralError<"Hello">>
        >
      >();
    });

    test("validates only the remaining element Types through from.parent", () => {
      const Hello = literal("Hello");
      const validations: Array<string> = [];
      const Greeting = brand("Greeting", Hello, (value) => {
        validations.push(value);
        return ok();
      });
      const Greetings = array(Greeting);
      const hello = getOrThrow(Hello.from("Hello"));

      expect(Greetings.from.parent([hello])).toEqual(ok(["Hello"]));
      expect(validations).toEqual(["Hello"]);
      expectTypeOf(Greetings.from.parent([hello])).toEqualTypeOf<
        Result<ReadonlyArray<typeof Greeting.Output>, never>
      >();
    });

    test("composes Object elements with transformed and optional properties", () => {
      const NumberFromString = setupNumberFromString();
      const Item = object({
        value: NumberFromString,
        note: optional(String),
      });
      const Items = array(Item);
      const encoded = [{ value: "1" }, { value: "2", note: "two" }];
      const output = [{ value: 1 }, { value: 2, note: "two" }];
      const result = Items.from.parent(encoded);

      expectOk(result, output);
      expect(result.value).not.toBe(encoded);
      expect(Items.to(output)).toEqual(encoded);
      expect(
        Items.from.parent([{ value: "1" }, { value: "no" }], { errors: "all" }),
      ).toEqual(
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
      expectTypeOf<typeof Items.Input>().toEqualTypeOf<
        ReadonlyArray<
          ExpectedStrictObject<
            { readonly value: string },
            { readonly note: string }
          >
        >
      >();
      expectTypeOf<typeof Items.Output>().toEqualTypeOf<
        ReadonlyArray<
          ExpectedStrictObject<
            { readonly value: number },
            { readonly note: string }
          >
        >
      >();
    });

    test("preserves ordinary root Record properties through Object elements", () => {
      const Items = array(object({ values: record(String, Number) }));
      const input = [{ values: { one: 1 } }];
      const result = Items.fromUnknown(input);

      expectOk(result, input);
      expect(result.value).toBe(input);
      expect(result.value[0]).toBe(input[0]);
      expect(result.value[0].values).toBe(input[0].values);
      expect(Items.is(result.value)).toBe(true);
    });
  });

  test("exposes error collection options only on operations that preserve errors", () => {
    const { UserIds } = setupUserIds();

    expectTypeOf<Parameters<typeof UserIds.fromUnknown>[1]>().toEqualTypeOf<
      ValidationOptions | undefined
    >();
    expectTypeOf<Parameters<typeof UserIds.from>[1]>().toEqualTypeOf<
      ValidationOptions | undefined
    >();
    expectTypeOf<Parameters<typeof UserIds.from.parent>[1]>().toEqualTypeOf<
      ValidationOptions | undefined
    >();
    expectTypeOf<Parameters<typeof UserIds.orThrow>[1]>().toEqualTypeOf<
      ValidationOptions | undefined
    >();
    expectTypeOf<Parameters<typeof UserIds.is>>().toEqualTypeOf<[unknown]>();
    expectTypeOf<Parameters<typeof UserIds.orNull>>().toEqualTypeOf<
      [ReadonlyArray<number>]
    >();

    const compileTimeAssertions = () => {
      // @ts-expect-error Error collection is not observable through `is`.
      UserIds.is([], { errors: "all" });
      // @ts-expect-error Error collection is not observable through `orNull`.
      UserIds.orNull([], { errors: "all" });
    };
    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  describe("is", () => {
    test("a type guard that narrows unknown values", () => {
      const { UserIds } = setupUserIds();
      const value: unknown = [1, 2];

      assert(UserIds.is(value), "Expected value to be UserIds.");

      expectTypeOf(value).toEqualTypeOf<typeof UserIds.Output>();
      expect(UserIds.is([0])).toBe(false);
      expect(UserIds.is(null)).toBe(false);
    });

    test("rejects accessor elements without invoking them", () => {
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

      expect(Strings.is(value)).toBe(false);
      expect(reads).toBe(0);
    });
  });

  describe("fromUnknown", () => {
    test("accepts an empty array in both error collection modes", () => {
      const { UserIds, validations } = setupUserIds();
      const value: unknown = [];
      const first = UserIds.fromUnknown(value);
      const all = UserIds.fromUnknown(value, { errors: "all" });

      expectOk(first, value);
      expect(first.value).toBe(value);
      expectOk(all, value);
      expect(all.value).toBe(value);
      expect(validations).toEqual([]);
    });

    test("validates every element without changing the array", () => {
      const { UserIds, validations } = setupUserIds();
      const value: unknown = [1, 2];
      const result = UserIds.fromUnknown(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(validations).toEqual([1, 2]);
      expectTypeOf(result.value).toEqualTypeOf<typeof UserIds.Output>();
    });

    test("rejects accessor elements without invoking them", () => {
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

      expect(result).toEqual(
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Accessor", index: 0 }],
          },
        }),
      );
      expect(reads).toBe(0);
    });

    test("wraps a primitive parent error for an invalid Literal element", () => {
      const Hello = literal("Hello");
      const Hellos = array(Hello);
      const value: unknown = [42];

      expect(Hellos.fromUnknown(value)).toEqual(
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
      expectTypeOf(Hellos.fromUnknown(value)).toEqualTypeOf<
        Result<
          ReadonlyArray<"Hello">,
          ArrayError<TypeOfError<"String"> | LiteralError<"Hello">>
        >
      >();
    });

    test("returns a NotArray error regardless of error collection mode", () => {
      const { PositiveInt: _PositiveInt, UserIds } = setupUserIds();
      const value: unknown = null;
      const expected = err({
        type: "Array",
        reason: { kind: "NotArray", value },
      });

      expect(UserIds.fromUnknown(value)).toEqual(expected);
      expect(UserIds.fromUnknown(value, { errors: "all" })).toEqual(expected);
      expectTypeOf(UserIds.fromUnknown(value)).toEqualTypeOf<
        Result<
          typeof UserIds.Output,
          ArrayError<TypeOfError<"Number"> | typeof _PositiveInt.Error>
        >
      >();
    });

    test("returns only the first failing element error by default", () => {
      const { UserIds } = setupUserIds();

      expect(UserIds.fromUnknown([1, "2", 3])).toEqual(
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
      expect(UserIds.fromUnknown([1, -2, 3])).toEqual(
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

    test("returns the first invalid element across validation levels", () => {
      const { UserIds } = setupUserIds();

      expect(UserIds.fromUnknown([-1, "x"])).toEqual(
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

    test("supports explicit first-error collection", () => {
      const { MaxTenValues, validations } = setupValidatedNumbers();

      expect(MaxTenValues.fromUnknown([1, -2], { errors: "first" })).toEqual(
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
      expect(validations).toEqual([
        ["Positive", 1],
        ["Even", 1],
      ]);
    });

    test("collects one error from every invalid element in index order", () => {
      const { MaxTenValues, validations } = setupValidatedNumbers();

      expect(
        MaxTenValues.fromUnknown([1, "x", -2, 12], { errors: "all" }),
      ).toEqual(
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
      expect(validations).toEqual([
        ["Positive", 1],
        ["Even", 1],
        ["Positive", -2],
        ["Positive", 12],
        ["Even", 12],
        ["MaxTen", 12],
      ]);
    });

    test("collects structural and invalid element issues in index order", () => {
      const Strings = array(String);
      let reads = 0;
      const value = new Array<unknown>(5);
      value[0] = 0;
      globalThis.Object.defineProperty(value, 1, {
        enumerable: true,
        get: () => {
          reads++;
          return "value";
        },
      });
      value[3] = false;

      expect(Strings.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(reads).toBe(0);
    });

    test("does not construct transformed output after collecting an issue", () => {
      const NumberFromString = setupNumberFromString();
      const Numbers = array(NumberFromString);
      const value = new Array<unknown>(2);
      value[1] = "1";

      expect(Numbers.fromUnknown(value, { errors: "all" })).toEqual(
        err({
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 0 }],
          },
        }),
      );
    });

    test("composes with another Array Type", () => {
      const Matrix = array(array(Number));
      const value: unknown = [
        [1, 2],
        [3, 4],
      ];
      const result = Matrix.fromUnknown(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expectTypeOf(result.value).toEqualTypeOf<
        ReadonlyArray<ReadonlyArray<number>>
      >();
      expect(Matrix.fromUnknown([[1, "2"]])).toEqual(
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

    test("collects nested Array errors recursively", () => {
      const Matrix = array(array(Number));

      expect(
        Matrix.fromUnknown(
          [
            ["a", "b"],
            [1, "c"],
            [2, 3],
          ],
          { errors: "all" },
        ),
      ).toEqual(
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

    test("forwards error collection through a child of an Array Type", () => {
      const { UserIds } = setupUserIds();
      const ImportedUserIds = brand("ImportedUserIds", UserIds);

      expect(ImportedUserIds.fromUnknown([0, -1], { errors: "all" })).toEqual(
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
    test("asserts its own Output", () => {
      const Values = array(Number);
      const sparse = new Array<number>(1);

      expect(() => Values.to(sparse)).toThrow(
        "An array element at index 0 is missing.",
      );
    });
  });

  describe("from", () => {
    test("asserts its own Output", () => {
      const Values = array(Number);
      const sparse = new Array<number>(1);

      expect(() => Values.from(sparse)).toThrow(
        "An array element at index 0 is missing.",
      );
    });

    test("asserts its own Output elements", () => {
      const { UserIds, validations } = setupUserIds();
      const value = UserIds.orThrow([1, 2]);
      validations.length = 0;
      const result = UserIds.from(value);

      expectTypeOf(result).toEqualTypeOf<
        Result<typeof UserIds.Output, never>
      >();
      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(validations).toEqual([1, 2]);
      expectTypeOf(UserIds.from)
        .parameter(0)
        .toEqualTypeOf<typeof UserIds.Output>();
    });

    test("validates root element Outputs at the deepest boundary", () => {
      const {
        PositiveInt: _PositiveInt,
        UserIds,
        validations,
      } = setupUserIds();
      const value: ReadonlyArray<number> = [1, 2];
      const result = UserIds.from.parent.parent(value);

      expectTypeOf(result).toEqualTypeOf<
        Result<
          typeof UserIds.Output,
          ArrayElementsError<typeof _PositiveInt.Error>
        >
      >();
      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(validations).toEqual([1, 2]);
      expectTypeOf(UserIds.from.parent.parent)
        .parameter(0)
        .toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("returns the first failing element index and refinement error", () => {
      const { UserIds } = setupUserIds();

      expect(UserIds.from.parent.parent([1, -2, 3])).toEqual(
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

    test("returns the first invalid element across remaining validation levels", () => {
      const { MaxTenValues } = setupValidatedNumbers();

      expect(MaxTenValues.from.parent.parent.parent([1, -2])).toEqual(
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

    test("collects mixed remaining validation errors from every invalid element", () => {
      const { MaxTenValues, validations } = setupValidatedNumbers();

      expect(
        MaxTenValues.from.parent.parent.parent([1, -2, 12, 4], {
          errors: "all",
        }),
      ).toEqual(
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
      expect(validations).toEqual([
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

    test("forwards error collection through a child of an Array Type", () => {
      const { UserIds } = setupUserIds();
      const ImportedUserIds = brand("ImportedUserIds", UserIds);

      expect(
        ImportedUserIds.from.parent.parent.parent([0, -1], {
          errors: "all",
        }),
      ).toEqual(
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

    test("preserves heterogeneous errors through a child of an Array Type", () => {
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

      expectTypeOf(result).toEqualTypeOf<
        Result<typeof Imported.Output, Error>
      >();
      expectTypeOf(reimportedResult).toEqualTypeOf<
        Result<typeof Reimported.Output, Error>
      >();
      expectTypeOf<ReturnType<typeof Imported.from.parent>>().toEqualTypeOf<
        Result<typeof Imported.Output, never>
      >();
      expectTypeOf<
        ReturnType<typeof Imported.from.parent.parent>
      >().toEqualTypeOf<
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

      expect(result).toEqual(expected);
      expect(reimportedResult).toEqual(expected);
    });

    test("preserves heterogeneous errors through createType and transform children", () => {
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

      expectTypeOf(importedResult).toEqualTypeOf<
        Result<typeof Imported.Output, ParentError>
      >();
      expectTypeOf(revalidatedResult).toEqualTypeOf<
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

      expect(importedResult).toEqual(expected);
      expect(revalidatedResult).toEqual(expected);
    });

    test("keeps a fallible createType child error outside inherited Array errors", () => {
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

      expectTypeOf(inheritedResult).toEqualTypeOf<
        Result<typeof AtLeastFourValues.Output, Error>
      >();
      expectTypeOf(ownResult).toEqualTypeOf<
        Result<typeof AtLeastFourValues.Output, Error>
      >();
      expect(inheritedResult).toEqual(
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
      expect(ownResult).toEqual(
        err({ type: "AtLeastFourValues", value: [2, 4] }),
      );
    });
  });

  describe("from.parent", () => {
    test("asserts the selected parent Output", () => {
      const Values = array(literal(1));
      const sparse = new Array<number>(1);

      expect(() => Values.from.parent(sparse)).toThrow(
        "An array element at index 0 is missing.",
      );
    });

    test("consumes the Output produced by the parent Array Type", () => {
      const { UserIds, validations } = setupUserIds();
      const value: unknown = [1, 2];
      const parentResult = UserIds.parent.fromUnknown(value);

      expectOk(parentResult, value);
      expect(parentResult.value).toBe(value);
      expect(validations).toEqual([1, 2]);

      validations.length = 0;
      const result = UserIds.from.parent(parentResult.value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(validations).toEqual([1, 2]);
      expectTypeOf(UserIds.from.parent)
        .parameter(0)
        .toEqualTypeOf<typeof UserIds.parent.Output>();
    });

    test("preserves unchanged elements before the first converted element", () => {
      const NumberFromString = setupNumberFromString();
      const Values = array(union(Number, NumberFromString));
      const input: typeof Values.parent.Output = [1, "2"];
      const result = Values.from.parent(input);

      expectOk(result, [1, 2]);
      expect(result.value).not.toBe(input);
    });

    test("asserts parent element Outputs and validates later Types", () => {
      const { Even, MaxTenValues, validations } = setupValidatedNumbers();
      const values = [Even.orThrow(2), Even.orThrow(4)];
      validations.length = 0;
      const result = MaxTenValues.from.parent(values);

      expectTypeOf(result).toEqualTypeOf<
        Result<typeof MaxTenValues.Output, typeof MaxTenValues.Error>
      >();
      expectOk(result, values);
      expect(result.value).toBe(values);
      expect(validations).toEqual([
        ["Positive", 2],
        ["Even", 2],
        ["Positive", 4],
        ["Even", 4],
        ["MaxTen", 2],
        ["MaxTen", 4],
      ]);
      expectTypeOf(MaxTenValues.from.parent)
        .parameter(0)
        .toEqualTypeOf<ReadonlyArray<typeof Even.Output>>();
    });

    test("collects errors from every invalid immediate-parent Output", () => {
      const { Even, MaxTenValues, validations } = setupValidatedNumbers();
      const values = [Even.orThrow(12), Even.orThrow(14)];
      validations.length = 0;

      expect(MaxTenValues.from.parent(values, { errors: "all" })).toEqual(
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
      expect(validations).toEqual([
        ["Positive", 12],
        ["Even", 12],
        ["Positive", 14],
        ["Even", 14],
        ["MaxTen", 12],
        ["MaxTen", 14],
      ]);
    });

    test("ends when the input boundary reaches the root Array Type", () => {
      const { UserIds } = setupUserIds();
      const deepest = UserIds.from.parent.parent;

      expect("parent" in deepest).toBe(false);
      expectTypeOf<"parent">().not.toExtend<keyof typeof deepest>();
    });

    test("supports deeper input boundaries and remaining validation levels", () => {
      const {
        Positive,
        Even: _Even,
        MaxTenValues,
        validations,
      } = setupValidatedNumbers();
      const values = [Positive.orThrow(2), Positive.orThrow(12)];
      validations.length = 0;
      const result = MaxTenValues.from.parent.parent(values);

      expect(result).toEqual(
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
      expect(validations).toEqual([
        ["Positive", 2],
        ["Positive", 12],
        ["Even", 2],
        ["MaxTen", 2],
        ["Even", 12],
        ["MaxTen", 12],
      ]);
      expectTypeOf(result).toEqualTypeOf<
        Result<
          typeof MaxTenValues.Output,
          ArrayElementsError<
            typeof _Even.Error | typeof MaxTenValues.element.Error
          >
        >
      >();
      expectTypeOf(MaxTenValues.from.parent.parent)
        .parameter(0)
        .toEqualTypeOf<ReadonlyArray<typeof Positive.Output>>();
    });

    test("collects mixed errors across a deeper input boundary", () => {
      const { Positive, MaxTenValues, validations } = setupValidatedNumbers();
      const values = [
        Positive.orThrow(1),
        Positive.orThrow(12),
        Positive.orThrow(4),
        Positive.orThrow(3),
      ];
      validations.length = 0;

      expect(
        MaxTenValues.from.parent.parent(values, { errors: "all" }),
      ).toEqual(
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
      expect(validations).toEqual([
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
    test("asserts its typed Input boundary", () => {
      const Values = array(literal(1));
      const sparse = new Array<number>(1);

      expect(() => Values.orThrow(sparse)).toThrow(
        "An array element at index 0 is missing.",
      );
    });

    test("returns the same array or throws the first failing element error", () => {
      const { UserIds } = setupUserIds();
      const value: ReadonlyArray<number> = [1, 2];

      expect(UserIds.orThrow(value)).toBe(value);
      expectAssertionError(() => UserIds.orThrow([1, -2, 3]), "getOrThrow", {
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

    test("throws every collected element error", () => {
      const { UserIds } = setupUserIds();
      expectAssertionError(
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
    test("does not convert a typed Input assertion into null", () => {
      const Values = array(literal(1));
      const sparse = new Array<number>(1);

      expect(() => Values.orNull(sparse)).toThrow(
        "An array element at index 0 is missing.",
      );
    });

    test("returns the same array or null for a failing element", () => {
      const { UserIds } = setupUserIds();
      const value: ReadonlyArray<number> = [1, 2];

      expect(UserIds.orNull(value)).toBe(value);
      expect(UserIds.orNull([0])).toBeNull();
    });
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
    test("creates a fixed heterogeneous Type and collapses element roots into one parent", () => {
      const { Entry, NumberFromString, Positive } = setupEntry();

      expect(Entry.name).toBe("Tuple");
      expect(Entry.elements).toEqual([String, NumberFromString, Positive]);
      expect(Entry.parent.elements).toEqual([String, String, Number]);
      expect(Entry.parent.parent).toBeNull();
      expectTypeOf(Entry).toEqualTypeOf<
        TupleType<
          readonly [typeof String, typeof NumberFromString, typeof Positive]
        >
      >();
      expectTypeOf<typeof Entry.Input>().toEqualTypeOf<
        readonly [string, string, number]
      >();
      expectTypeOf<typeof Entry.Output>().toEqualTypeOf<
        readonly [string, number, typeof Positive.Output]
      >();
      expectTypeOf<typeof Entry.Error>().toEqualTypeOf<
        TupleElementsError<NumberFromStringError | typeof Positive.Error>
      >();
      expectTypeOf<InferErrors<typeof Entry>>().toEqualTypeOf<
        TupleError<
          | TypeOfError<"String">
          | TypeOfError<"Number">
          | NumberFromStringError
          | typeof Positive.Error
        >
      >();
    });

    test("creates a root Tuple without a parent", () => {
      const Pair = tuple(String, Number);

      expect(Pair.parent).toBeNull();
      expectTypeOf<typeof Pair.Error>().toEqualTypeOf<
        TupleError<TypeOfError<"String"> | TypeOfError<"Number">>
      >();
      expectTypeOf(Pair.from).toEqualTypeOf<
        (
          value: readonly [string, number],
          options?: ValidationOptions,
        ) => Result<readonly [string, number], never>
      >();
    });

    test("exposes exact structural and typed element issue types", () => {
      type ElementError = TypeOfError<"String"> | TypeOfError<"Number">;

      expectTypeOf<
        TupleItemsError<ElementError>["reason"]["issues"][number]
      >().toEqualTypeOf<TupleIssue<ElementError>>();
      expectTypeOf<
        TupleElementsError<ElementError>["reason"]["issues"][number]
      >().toEqualTypeOf<
        | TupleElementIssue<TypeOfError<"String">>
        | TupleElementIssue<TypeOfError<"Number">>
      >();
      expectTypeOf<TupleElementIssue<never>>().toEqualTypeOf<never>();
      expectTypeOf<TupleExcessPropertyIssue>().toExtend<
        TupleItemsError<ElementError>["reason"]["issues"][number]
      >();
      expectTypeOf<TupleExcessPropertyIssue>().not.toExtend<
        TupleElementsError<ElementError>["reason"]["issues"][number]
      >();
      expectTypeOf<TupleExcessPropertyIssue["key"]>().toEqualTypeOf<
        string | symbol
      >();
    });

    test("requires one concrete finite non-empty tuple of concrete Types", () => {
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
      expectTypeOf(validateUnionElement).toBeFunction();
      expectTypeOf(validateTupleSchema).toBeFunction();
    });
  });

  describe("formatError", () => {
    test("formats structural errors and the first nested element error", () => {
      const Pair = tuple(String, Number);

      expect(
        Pair.formatError({
          type: "Tuple",
          reason: { kind: "NotArray", value: null },
        }),
      ).toBe("A value null is not a tuple.");
      expect(
        Pair.formatError({
          type: "Tuple",
          reason: { kind: "UnexpectedPrototype", value: [] },
        }),
      ).toBe(
        "The value is an array, but a Tuple Output must use this realm's Array.prototype. For a trusted return contract, cast and skip this Type; otherwise, use boundary-specific validation or transformation.",
      );
      expect(
        Pair.formatError({
          type: "Tuple",
          reason: { kind: "InvalidLength", expected: 2, actual: 1 },
        }),
      ).toBe(
        "A Tuple must contain exactly 2 elements, but the value contains 1.",
      );
      expect(
        Pair.formatError({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 0 }],
          },
        }),
      ).toBe("A Tuple element at index 0 is missing.");
      expect(
        Pair.formatError({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "Accessor", index: 0 }],
          },
        }),
      ).toBe("A Tuple element at index 0 must be a data property.");
      expect(
        Pair.formatError({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "ExcessProperty", key: "metadata" }],
          },
        }),
      ).toBe(
        "An excess Tuple property is not allowed. Remove it or use a different Type.",
      );
      expect(
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
      ).toBe('A value "1" is not a number.');
    });
  });

  describe("fromUnknown", () => {
    test("preserves a valid root Tuple and materializes transformed elements only when necessary", () => {
      const Pair = tuple(String, Number);
      const rootValue = ["count", 1] as const;
      const { Entry, Positive } = setupEntry();
      const input = ["count", "1", 2] as const;

      const rootResult = Pair.fromUnknown(rootValue);
      const result = Entry.fromUnknown(input);

      expectOk(rootResult, rootValue);
      expect(rootResult.value).toBe(rootValue);
      expectOk(result, ["count", 1, Positive.orThrow(2)]);
      expect(result.value).not.toBe(input);
      expect(result.value[0]).toBe(input[0]);
      expect(Entry.is(result.value)).toBe(true);
    });

    test("rejects non-arrays, wrong lengths, and unexpected Array prototypes", () => {
      const Pair = tuple(String, Number);
      const customPrototype = ["count", 1] as Array<string | number>;
      globalThis.Object.setPrototypeOf(customPrototype, null);

      expect(Pair.fromUnknown(null)).toEqual(
        err({
          type: "Tuple",
          reason: { kind: "NotArray", value: null },
        }),
      );
      expect(Pair.fromUnknown(["count"])).toEqual(
        err({
          type: "Tuple",
          reason: { kind: "InvalidLength", expected: 2, actual: 1 },
        }),
      );
      expect(Pair.fromUnknown(customPrototype)).toEqual(
        err({
          type: "Tuple",
          reason: { kind: "UnexpectedPrototype", value: customPrototype },
        }),
      );
      expect(Pair.is(null)).toBe(false);
      expect(Pair.is(["count"])).toBe(false);
      expect(Pair.is(customPrototype)).toBe(false);
    });

    test("returns the first element error by default and every error on request", () => {
      const Pair = tuple(String, Number);
      const value = [42, "1"];

      expect(Pair.fromUnknown(value)).toEqual(
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
      expect(Pair.fromUnknown(value, { errors: "all" })).toEqual(
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

    test("rejects holes and accessors without invoking them", () => {
      const Pair = tuple(String, Number);
      const value = new Array<unknown>(2);
      let reads = 0;
      globalThis.Object.defineProperty(value, 1, {
        enumerable: true,
        get: () => {
          reads++;
          return 1;
        },
      });

      expect(Pair.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(Pair.fromUnknown(new Array<unknown>(2))).toEqual(
        err({
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "Hole", index: 0 }],
          },
        }),
      );
      expect(Pair.is(value)).toBe(false);
      expect(reads).toBe(0);
    });

    test("rejects named, non-enumerable, and symbol properties without reading them", () => {
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

      expect(Pair.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(Pair.is(value)).toBe(false);
      expect(reads).toBe(0);
    });
  });

  describe("typed operations", () => {
    test("runs every remaining element pipeline from the collapsed root parent", () => {
      const { NumberFromString, Positive } = setupEntryElements();
      const Entry = tuple(NumberFromString, Positive);
      const input = ["1", 2] as const;
      const result = Entry.from.parent(input);

      expectTypeOf(result).toEqualTypeOf<
        Result<
          typeof Entry.Output,
          TupleElementsError<NumberFromStringError | typeof Positive.Error>
        >
      >();
      expectTypeOf(Entry.from.parent)
        .parameter(0)
        .toEqualTypeOf<readonly [string, number]>();
      expectTypeOf<"parent">().not.toExtend<keyof typeof Entry.from.parent>();
      expectOk(result, [1, Positive.orThrow(2)]);
      expect(result.value).not.toBe(input);
    });

    test("collects errors from different element pipelines", () => {
      const { NumberFromString, Positive } = setupEntryElements();
      const Entry = tuple(NumberFromString, Positive);

      expect(
        Entry.from.parent(["not a number", -1], { errors: "all" }),
      ).toEqual(
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

    test("encodes every element and preserves identity when all encoders do", () => {
      const NumberFromString = setupNumberFromString();
      const Encoded = tuple(String, NumberFromString);
      const output = ["count", 1] as const;
      const encoded = Encoded.to(output);
      const Pair = tuple(String, Number);
      const rootOutput = ["count", 1] as const;
      const StringOrNumberFromString = tuple(union(String, NumberFromString));
      const unchanged = ["count"] as const;

      expect(encoded).toEqual(["count", "1"]);
      expect(encoded).not.toBe(output);
      expect(Encoded.parent.is(encoded)).toBe(true);
      expect(Pair.to(rootOutput)).toBe(rootOutput);
      expect(StringOrNumberFromString.to(unchanged)).toBe(unchanged);
    });

    test("asserts structural developer errors at from and to boundaries", () => {
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
      const message =
        "An excess Tuple property is not allowed. Remove it or use a different Type.";

      expect(() => Pair.from(excess)).toThrow(message);
      expect(() => Pair.to(excess)).toThrow(message);
      expect(() => Pair.from(invalidElement)).toThrow(
        'A value "1" is not a number.',
      );
    });

    test("asserts the root parent representation before reading elements", () => {
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

      expect(() => Entry.from.parent(input)).toThrow(
        "A Tuple element at index 0 must be a data property.",
      );
      expect(reads).toBe(0);
    });
  });

  describe("composition", () => {
    test("composes as an Array element Type", () => {
      const NumberFromString = setupNumberFromString();
      const Entries = array(tuple(String, NumberFromString));
      const input = [
        ["first", "1"],
        ["second", "2"],
      ] as const;

      expectOk(Entries.fromUnknown(input), [
        ["first", 1],
        ["second", 2],
      ]);
      expect(
        Entries.is([
          ["first", 1],
          ["second", 2],
        ]),
      ).toBe(true);
    });

    test("guards recursive Lazy validation by consuming one Tuple element", () => {
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

      expect(StringList.fromUnknown(value)).toEqual(ok(value));
      expect(StringList.is(value)).toBe(true);
      expect(StringList.fromUnknown(["first", [42, null]])).toEqual(
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

describe("Object", () => {
  test("has the expected root definition", () => {
    expectTypeOf(Object).toEqualTypeOf<
      Type<
        "Object",
        Readonly<Record<string, unknown>>,
        Readonly<Record<string, unknown>>,
        ObjectError<
          Readonly<Record<never, never>>,
          ObjectPropertyAccessError | TypeOfError<"String">
        >
      >
    >();
    expect(Object.parent).toBeNull();
  });

  test("accepts ordinary and null-prototype objects without copying them", () => {
    const ordinary: unknown = { name: "Ada" };
    const nullPrototype: unknown = globalThis.Object.assign(
      globalThis.Object.create(null) as Record<string, unknown>,
      { name: "Ada" },
    );

    for (const value of [ordinary, nullPrototype]) {
      const result = Object.fromUnknown(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(Object.is(value)).toBe(true);
    }

    const typed: typeof Object.Output = { name: "Ada" };
    expect(Object.from(typed)).toEqual(ok(typed));
    expect(Object.to(typed)).toBe(typed);
  });

  test("rejects non-objects, instances, and custom prototypes", () => {
    class Example {
      readonly value = 1;
    }

    for (const value of [null, 42, "value", () => undefined]) {
      expect(Object.fromUnknown(value)).toEqual(
        err({ type: "Object", reason: { kind: "NotObject", value } }),
      );
      expect(Object.is(value)).toBe(false);
    }

    const prototype = globalThis.Object.create(null) as object;
    for (const value of [
      [],
      new globalThis.Date(),
      new Example(),
      globalThis.Object.create(prototype) as object,
    ]) {
      expect(Object.fromUnknown(value)).toEqual(
        err({
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value },
        }),
      );
      expect(Object.is(value)).toBe(false);
    }
  });

  test("rejects accessors, non-enumerable properties, and symbol keys without reading values", () => {
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

    expect(Object.fromUnknown(value, { errors: "all" })).toEqual(
      err({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            accessor: {
              type: "ObjectPropertyAccess",
              reason: "Accessor",
            },
            hidden: {
              type: "ObjectPropertyAccess",
              reason: "NonEnumerable",
            },
            [symbol]: {
              type: "TypeOf",
              expected: "String",
              value: symbol,
            },
          },
        },
      }),
    );
    expect(Object.is(value)).toBe(false);
    expect(reads).toBe(0);
  });

  test("does not read Symbol.toStringTag", () => {
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

    expect(Object.fromUnknown(value)).toEqual(
      err({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            [globalThis.Symbol.toStringTag]: {
              type: "TypeOf",
              expected: "String",
              value: globalThis.Symbol.toStringTag,
            },
          },
        },
      }),
    );
    expect(reads).toBe(0);
  });

  test("formats structural failures with developer guidance", () => {
    expect(
      Object.formatError({
        type: "Object",
        reason: { kind: "NotObject", value: null },
      }),
    ).toBe("A value null is not an object.");
    expect(
      Object.formatError({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            value: { type: "ObjectPropertyAccess", reason: "Accessor" },
          },
        },
      }),
    ).toBe(
      "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
    );
    expect(
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
    ).toBe(
      "An Object property must be enumerable. Make it enumerable or use a different Type.",
    );
    expect(
      Object.formatError({
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            [globalThis.Symbol.iterator]: {
              type: "TypeOf",
              expected: "String",
              value: globalThis.Symbol.iterator,
            },
          },
        },
      }),
    ).toBe(
      "An Object property key must be a string. Remove it or use a different Type.",
    );
  });

  test("asserts invalid typed representations with the same structured error", () => {
    const value = globalThis.Object.defineProperty({}, "name", {
      enumerable: true,
      get: () => "Ada",
    });
    const result = Object.fromUnknown(value);

    expectErr(result, {
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
    const message =
      "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.";

    expectAssertionError(() => Object.from(typed), message, result.error);
    expectAssertionError(() => Object.to(typed), message, result.error);
  });
});

describe("record", () => {
  const createNullRecord = <Value>(
    entries: Readonly<Record<string, Value>>,
  ): Record<string, Value> =>
    globalThis.Object.assign(
      globalThis.Object.create(null) as Record<string, Value>,
      entries,
    );

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
    test("derives partial readonly shapes, errors, and one root parent", () => {
      const Values = record(String, Number);
      const _Allowed = record(literal("allowed"), Number);
      const transformed = setupTransformedRecord();

      expect(Values.name).toBe("Record");
      expect(Values.key).toBe(String);
      expect(Values.value).toBe(Number);
      expect(Values.parent).toBeNull();
      expect(transformed.Values.parent.key).toBe(String);
      expect(transformed.Values.parent.value).toBe(String);
      expect(transformed.Values.parent.parent).toBeNull();
      expect("parent" in transformed.Values.from).toBe(true);
      expectTypeOf<"parent">().toExtend<keyof typeof transformed.Values.from>();

      expectTypeOf(Values).toExtend<RecordType<typeof String, typeof Number>>();
      expectTypeOf<typeof Values.Input>().toEqualTypeOf<
        Readonly<Partial<Record<string, number>>>
      >();
      expectTypeOf<typeof Values.Output>().toEqualTypeOf<
        Readonly<Partial<Record<string, number>>>
      >();
      expectTypeOf<typeof Values.Error>().toEqualTypeOf<
        RecordError<TypeOfError<"String">, TypeOfError<"Number">, never>
      >();
      expectTypeOf<InferErrors<typeof Values>>().toEqualTypeOf<
        RecordError<TypeOfError<"String">, TypeOfError<"Number">, never>
      >();
      expectTypeOf<typeof _Allowed.Input>().toEqualTypeOf<
        Readonly<Partial<Record<string, number>>>
      >();
      expectTypeOf<typeof _Allowed.Output>().toEqualTypeOf<{
        readonly allowed?: number;
      }>();
      expectTypeOf<RecordIssue<never, never, never>>().toEqualTypeOf<never>();
      expectTypeOf<
        RecordIssue<
          never,
          never,
          RecordAccessorIssue | RecordNonEnumerableIssue
        >
      >().toEqualTypeOf<RecordAccessorIssue | RecordNonEnumerableIssue>();
      expectTypeOf<
        RecordEntriesError<never, never, never>
      >().toEqualTypeOf<never>();
      expectTypeOf<RecordError<never, never, never>>().toEqualTypeOf<
        | RecordNotRecordError
        | RecordNotPlainRecordError
        | RecordEntriesError<
            never,
            never,
            RecordAccessorIssue | RecordNonEnumerableIssue
          >
      >();
    });

    test("rejects every key in an empty key domain", () => {
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

      expectTypeOf<typeof Values.Input>().toEqualTypeOf<
        Readonly<Record<string, never>>
      >();
      expectTypeOf<typeof Values.Output>().toEqualTypeOf<
        Readonly<Record<string, never>>
      >();
      expectTypeOf(compileTimeAssertions).toBeFunction();
      expect(Values.fromUnknown({})).toEqual(ok(createNullRecord({})));
      expect(Values.fromUnknown(value)).toEqual(
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
      expect(Values.is(createNullRecord({}))).toBe(true);
      expect(Values.is(createNullRecord(value))).toBe(false);
    });

    test("computes an empty key domain independently at each boundary", () => {
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

      expectTypeOf<typeof _Values.Input>().toEqualTypeOf<
        Readonly<Partial<Record<string, number>>>
      >();
      expectTypeOf<typeof _Values.Output>().toEqualTypeOf<
        Readonly<Record<string, never>>
      >();
    });

    test("requires concrete string key and concrete value Types", () => {
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("distributes key and value errors inside one issue container", () => {
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

      expectTypeOf(error.reason.issues).toEqualTypeOf<
        NonEmptyReadonlyArray<
          | RecordKeyIssue<AError | BError>
          | RecordValueIssue<AError | BError>
          | RecordCollisionIssue
        >
      >();
    });
  });

  describe("validation", () => {
    test("accepts and preserves ordinary objects", () => {
      const Values = record(String, Number);
      const input: unknown = { first: 1, second: 2 };
      const result = Values.fromUnknown(input);

      expectOk(result, { first: 1, second: 2 });
      expect(result.value).toBe(input);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBe(
        globalThis.Object.prototype,
      );
      expect(Values.is(input)).toBe(true);
      expect(Values.is(result.value)).toBe(true);
      expect(Values.from(result.value)).toEqual(ok(result.value));
      expect(Values.to(result.value)).toBe(result.value);

      const first: number | undefined = result.value.first;
      expect(first).toBe(1);
    });

    test("ignores inherited properties", () => {
      const Values = record(literal("toString"), Number);
      const input = {};
      const result = Values.fromUnknown(input);

      expectOk(result, input);
      expect(result.value).toBe(input);
      expect(globalThis.Object.hasOwn(result.value, "toString")).toBe(false);
      expect(Values.is(input)).toBe(true);
      expectOk(Values.from(result.value), input);
      expect(Values.to(result.value)).toBe(input);

      const value: number | undefined = result.value.toString;
      expectTypeOf(value).toEqualTypeOf<number | undefined>();
      expect(typeof value).toBe("function");
    });

    test("rejects class instances and custom prototypes", () => {
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
        expect(Values.is(input)).toBe(false);
        expect(Values.fromUnknown(input)).toEqual(
          err({
            type: "Record",
            reason: { kind: "NotPlainRecord", value: input },
          }),
        );
        const message =
          "The value is an object, but a Record Output must use this realm's Object.prototype or null.";
        expect(() => Values.from(input)).toThrow(message);
        expect(() => Values.to(input)).toThrow(message);
      }
      expect(inheritedReads).toBe(0);
    });

    test("preserves an unchanged null-prototype record", () => {
      const Values = record(String, Number);
      const input = createNullRecord({ first: 1 });
      const result = Values.fromUnknown(input);

      expectOk(result, input);
      expect(result.value).toBe(input);
      expect(Values.is(input)).toBe(true);
    });

    test("accepts an Output after ordinary object spread", () => {
      const Values = record(literal("toString"), Number);
      const output = getOrThrow(Values.fromUnknown(createNullRecord({})));
      const spread = { ...output };

      expect(globalThis.Object.getPrototypeOf(spread)).toBe(
        globalThis.Object.prototype,
      );
      expect(globalThis.Object.hasOwn(spread, "toString")).toBe(false);
      expect(Values.is(spread)).toBe(true);
      expectOk(Values.from(spread), spread);
      expect(Values.to(spread)).toBe(spread);
    });

    test("rejects non-enumerable properties from unknown", () => {
      const Values = record(String, Number);
      const input = globalThis.Object.defineProperty(
        globalThis.Object.create(null) as Record<string, number>,
        "value",
        { value: 1 },
      );
      const result = Values.fromUnknown(input);

      expect(result).toEqual(
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [{ kind: "NonEnumerable", key: "value" }],
          },
        }),
      );
      expect(Values.is(input)).toBe(false);
      expect(() => Values.from(input)).toThrow(
        'A record property "value" must be enumerable.',
      );
      expect(() => Values.to(input)).toThrow(
        'A record property "value" must be enumerable.',
      );
    });

    test("rejects non-plain values and accessors without reading them", () => {
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

      expect(Values.fromUnknown(null)).toEqual(
        err({
          type: "Record",
          reason: { kind: "NotRecord", value: null },
        }),
      );
      expect(Values.is(null)).toBe(false);
      expect(Values.fromUnknown([])).toEqual(
        err({
          type: "Record",
          reason: { kind: "NotPlainRecord", value: [] },
        }),
      );
      const result = Values.fromUnknown(accessor);

      expect(result).toEqual(
        err({
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [{ kind: "Accessor", key: "value" }],
          },
        }),
      );
      expect(reads).toBe(0);
      expect(Values.is(accessor)).toBe(false);
      expect(() => Values.to(accessor as Record<string, number>)).toThrow(
        'A record property "value" must be a data property.',
      );
      expect(reads).toBe(0);
    });

    test("collects structural and value issues without reading accessors", () => {
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

      expect(Values.fromUnknown(input)).toEqual(
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
      expect(Values.fromUnknown(input, { errors: "all" })).toEqual(
        err(allErrors),
      );
      expect(Values.formatError(allErrors)).toBe(
        'A record property "first" must be a data property.',
      );
      expect(reads).toBe(0);
    });

    test("does not read Symbol.toStringTag while rejecting the symbol key", () => {
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

      expect(result).toEqual(
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
      expect(Values.is(value)).toBe(false);
      expect(reads).toBe(0);
    });

    test("rejects symbol keys as key validation failures", () => {
      const Values = record(String, Number);
      const key = globalThis.Symbol("key");
      let reads = 0;
      const input = globalThis.Object.defineProperty({ value: 1 }, key, {
        get: () => {
          reads++;
          return "wrong";
        },
      });

      expect(Values.fromUnknown(input)).toEqual(
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
      expect(reads).toBe(0);

      expect(Values.fromUnknown(input, { errors: "all" })).toEqual(
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
      expect(reads).toBe(0);

      const canonical = createNullRecord({ value: 1 });
      globalThis.Reflect.set(canonical, key, 2);
      expect(Values.is(canonical)).toBe(false);
      expect(Values.is(input)).toBe(false);
      expect(reads).toBe(0);
      expect(Values.is(createNullRecord({ value: "wrong" }))).toBe(false);
      expect(
        record(literal("allowed"), Number).is(createNullRecord({ wrong: 1 })),
      ).toBe(false);

      const output = createNullRecord({ value: 1 });
      globalThis.Reflect.set(output, key, 2);
      expect(() => Values.to(output)).toThrow(
        "A value Symbol(key) is not a string.",
      );
    });

    test("collects key and value issues in own-key order", () => {
      const Values = record(literal("allowed"), Number);
      const input = { wrong: "x", allowed: "y" };

      expect(Values.fromUnknown(input)).toEqual(
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
      expect(Values.fromUnknown(input, { errors: "all" })).toEqual(
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
      expect(record(String, Number).fromUnknown({ value: "wrong" })).toEqual(
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

    test("handles __proto__ as an ordinary data key", () => {
      const Values = record(String, Number);
      const input = globalThis.Object.defineProperty({}, "__proto__", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 1,
      });
      const result = Values.fromUnknown(input);

      expectOk(result, input);
      expect(result.value).toBe(input);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBe(
        globalThis.Object.prototype,
      );
      expect(globalThis.Object.hasOwn(result.value, "__proto__")).toBe(true);
      expect(result.value.__proto__).toBe(1);
    });
  });

  describe("transformations and composition", () => {
    test("transforms keys and values into a canonical record", () => {
      const { Values } = setupTransformedRecord();
      const result = Values.fromUnknown({ FIRST: "1", Second: "2" });

      expectOk(result, { first: 1, second: 2 });
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
      expect(Values.is(result.value)).toBe(true);

      const encoded = Values.to(result.value);
      expect(encoded).toEqual({ first: "1", second: "2" });
      expect(globalThis.Object.getPrototypeOf(encoded)).toBeNull();
      expect(Values.from.parent(encoded)).toEqual(ok(result.value));
    });

    test("preserves a record when composed encoders preserve every entry", () => {
      const Values = record(String, union(Number, String));
      const value = createNullRecord({ answer: 42 });

      expect(Values.to(value)).toBe(value);
    });

    test("reports decoded-key collisions without overwriting entries", () => {
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

      expect(Values.fromUnknown(input)).toEqual(expected);
      const typedInput = createNullRecord(input);
      expect(Values.from.parent(typedInput)).toEqual(expected);
      expect(
        Values.fromUnknown({ A: "wrong", a: "2" }, { errors: "all" }),
      ).toEqual(
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
      expect(Values.fromUnknown(accessorInput, { errors: "all" })).toEqual(
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
      expect(reads).toBe(0);
      expectTypeOf(Values.from.parent(typedInput)).toEqualTypeOf<
        Result<typeof Values.Output, typeof Values.Error>
      >();
    });

    test("preserves Record errors through child Types", () => {
      const { Values } = setupTransformedRecord();
      const Imported = brand("ImportedRecord", Values);
      const input = createNullRecord({ A: "1", a: "2" });
      const result = Imported.from.parent.parent(input);

      expect(result).toEqual(
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
      expectTypeOf(result).toEqualTypeOf<
        Result<typeof Imported.Output, typeof Values.Error>
      >();

      const decoded = Values.orThrow(createNullRecord({ one: "1" }));
      expectOk(Imported.from.parent(decoded), decoded);
      expectTypeOf(Imported.from.parent(decoded)).toEqualTypeOf<
        Result<typeof Imported.Output, never>
      >();
    });

    test("accepts ordinary Records at typed boundaries", () => {
      const Values = record(String, Number);
      const input: typeof Values.Output = { value: 1 };

      expect(Values.from(input)).toEqual(ok(input));
      expect(Values.to(input)).toBe(input);
      expect(Values.orThrow(input)).toBe(input);
      expect(Values.orNull(input)).toBe(input);

      const decoded = Values.fromUnknown(input);
      expectOk(decoded, input);
      expect(decoded.value).toBe(input);
    });

    test("asserts own data properties before typed operations", () => {
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

      const message = 'A record property "value" must be a data property.';
      expect(() => Values.from(value)).toThrow(message);
      expect(() => Values.orThrow(value)).toThrow(message);
      expect(() => Values.orNull(value)).toThrow(message);
      expect(() => Values.to(value)).toThrow(message);
      expect(accessError).toBeInstanceOf(Error);
    });
  });

  test("formats record, key, value, and collision errors", () => {
    const Values = record(literal("allowed"), Number);
    const Transformed = setupTransformedRecord().Values;

    expect(
      Values.formatError({
        type: "Record",
        reason: { kind: "NotRecord", value: 1 },
      }),
    ).toBe("A value 1 is not a record.");
    expect(
      Values.formatError({
        type: "Record",
        reason: { kind: "NotPlainRecord", value: [] },
      }),
    ).toBe(
      "The value is an object, but a Record Output must use this realm's Object.prototype or null. For a trusted return contract, cast and skip this Type; otherwise, use boundary-specific validation or transformation.",
    );
    expect(
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
    ).toBe(
      'The value "wrong" is not strictly equal to the expected literal: allowed.',
    );
    expect(
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
    ).toBe('A value "x" is not a number.');
    expect(
      Values.formatError({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [{ kind: "Accessor", key: "allowed" }],
        },
      }),
    ).toBe('A record property "allowed" must be a data property.');
    expect(
      Values.formatError({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: [{ kind: "NonEnumerable", key: "allowed" }],
        },
      }),
    ).toBe('A record property "allowed" must be enumerable.');
    expect(
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
    ).toBe('Record keys "A" and "a" decode to the same key "a".');
  });
});

describe("optional", () => {
  test("creates a property descriptor that is not a Type", () => {
    const property = optional(String);

    expect(property.type).toBe(String);
    expectTypeOf(property).not.toExtend<TypeNode>();
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
    test("includes non-enumerable schema properties", () => {
      const props = { name: String };
      globalThis.Object.defineProperty(props, "name", {
        value: String,
        enumerable: false,
      });
      const Model = object(props);

      expect(Model.is({})).toBe(false);
      expect(Model.fromUnknown({})).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { name: { type: "ObjectMissingProperty" } },
          },
        }),
      );
      expect(Model.fromUnknown({ name: "Ada" })).toEqual(ok({ name: "Ada" }));
      expect(Model.props.name).toBe(String);
    });

    test("snapshots schema properties", () => {
      const props = { value: String };
      const Model = object(props);

      globalThis.Reflect.set(props, "value", Number);

      expect(Model.props).not.toBe(props);
      expect(Model.props.value).toBe(String);
      expect(Model.is({ value: "text" })).toBe(true);
      expect(Model.is({ value: 1 })).toBe(false);
    });

    test("rejects schema accessors without invoking them", () => {
      let reads = 0;
      const props = {
        get value() {
          reads++;
          return String;
        },
      };

      expect(() => object(props)).toThrow(
        "Object schema properties must be own string-keyed data properties.",
      );
      expect(reads).toBe(0);
    });

    test("rejects inherited schema properties without invoking them", () => {
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

      expect(() => object(props)).toThrow(
        "Object schema properties must be own string-keyed data properties.",
      );
      expect(reads).toBe(0);
    });

    test("rejects symbol schema properties without invoking them", () => {
      const key = globalThis.Symbol("value");
      let reads = 0;
      const props = globalThis.Object.defineProperty({ value: String }, key, {
        get: () => {
          reads++;
          return Number;
        },
      });

      expect(() => object(props)).toThrow(
        "Object schema properties must be own string-keyed data properties.",
      );
      expect(reads).toBe(0);
    });

    test("accepts null-prototype schema properties", () => {
      const props = { value: String };
      globalThis.Object.setPrototypeOf(props, null);
      const Model = object(props);

      expect(Model.props.value).toBe(String);
      expect(Model.fromUnknown({ value: "text" })).toEqual(
        ok({ value: "text" }),
      );
    });

    test("derives its properties, shapes, errors, and single root parent", () => {
      const {
        Model,
        NonEmpty: _NonEmpty,
        Positive,
        Short,
      } = setupValidatedObject();

      expect(Model.name).toBe("Object");
      expect(Model.props.title).toBe(Short);
      expect(Model.props.count).toBe(Positive);
      expect(Model.props.note.type).toBe(String);
      expect(Model.parent.props.title).toBe(String);
      expect(Model.parent.props.count).toBe(Number);
      expect(Model.parent.props.note.type).toBe(String);
      expect(Model.parent.parent).toBeNull();
      expect("parent" in Model.from).toBe(true);
      expectTypeOf<"parent">().toExtend<keyof typeof Model.from>();
      expectTypeOf(Model).toExtend<
        ObjectType<{
          readonly title: typeof Short;
          readonly count: typeof Positive;
          readonly note: OptionalProperty<typeof String>;
        }>
      >();
      expectTypeOf<typeof Model.Input>().toEqualTypeOf<
        ExpectedStrictObject<
          { readonly title: string; readonly count: number },
          { readonly note: string }
        >
      >();
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        ExpectedStrictObject<
          {
            readonly title: typeof Short.Output;
            readonly count: typeof Positive.Output;
          },
          { readonly note: string }
        >
      >();
      expectTypeOf<typeof Model.parent.Output>().toEqualTypeOf<
        typeof Model.Input
      >();
      expectTypeOf<typeof Model.Error>().toEqualTypeOf<
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

      expectTypeOf<NonNullable<Errors["title"]>>().toEqualTypeOf<
        | ObjectMissingPropertyError
        | ObjectPropertyAccessError
        | TypeOfError<"String">
        | typeof _NonEmpty.Error
        | typeof Short.Error
      >();
      expectTypeOf<NonNullable<Errors["count"]>>().toEqualTypeOf<
        | ObjectMissingPropertyError
        | ObjectPropertyAccessError
        | TypeOfError<"Number">
        | typeof Positive.Error
      >();
      expectTypeOf<NonNullable<Errors["note"]>>().toEqualTypeOf<
        ObjectPropertyAccessError | TypeOfError<"String">
      >();
      expectTypeOf<ObjectExcessPropertyError>().not.toExtend<
        NonNullable<Errors["title"]>
      >();

      expectTypeOf<{
        readonly type: "Object";
        readonly reason: {
          readonly kind: "Properties";
          readonly errors: {
            readonly unknown: ObjectExcessPropertyError;
          };
        };
      }>().toExtend<InferErrors<typeof Model>>();
    });

    test("creates a parent for optional-only refinements", () => {
      const Value = literal("value");
      const Model = object({ value: optional(Value) });
      const absent = {};

      expect(Model.parent.props.value.type).toBe(String);
      expect(Model.parent.parent).toBeNull();
      expectTypeOf<typeof Model.Error>().toEqualTypeOf<
        ObjectPropertiesError<{
          readonly value: LiteralError<"value">;
        }>
      >();
      expectOk(Model.from(absent), absent);
      expect(Model.from.parent({ value: "other" })).toEqual(
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

    test("exposes readonly properties", () => {
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

      expectTypeOf(Model.props).toEqualTypeOf<Readonly<typeof props>>();
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("composes declared properties with a Record", () => {
      const Values = record(String, Number);
      const Model = object({ count: Number }, Values);
      const _Open = object({}, Values);
      const otherRecord = record(String, Boolean);
      const restrictedKeys = record(literal("score"), Number);
      const ReversedString = transform("ReversedString", String, String, {
        from: (value) => ok(globalThis.Array.from(value).reverse().join("")),
        to: (value) => globalThis.Array.from(value).reverse().join(""),
      });
      const transformedKeys = record(ReversedString, Number);
      const NumberFromString = setupNumberFromString();
      const fakeRecord = {
        ...String,
        key: String,
        value: NumberFromString,
      };
      const numbersFromStrings = record(String, NumberFromString);
      const recordUnion = globalThis.Math.random() > 0.5 ? Values : otherRecord;
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
        // @ts-expect-error Undeclared properties must match the Record value Input.
        Model.from({ count: 0, other: "not a number" });
        // @ts-expect-error Undeclared properties must match the Record value Output.
        Model.to({ count: 0, other: "not a number" });
      };
      interface Errors {
        readonly count: TypeOfError<"Number">;
      }

      expect(Model.record).toBe(Values);
      expectTypeOf(genericRecordAssertion).toBeFunction();
      expect(Model.parent).toBeNull();
      expectTypeOf(Model).toExtend<
        ObjectType<{ readonly count: typeof Number }, typeof Values>
      >();
      expectTypeOf<(typeof Model.Input)["count"]>().toEqualTypeOf<number>();
      expectTypeOf<(typeof Model.Input)["other"]>().toEqualTypeOf<
        number | undefined
      >();
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<typeof Model.Input>();
      expectTypeOf<typeof _Open.Output>().toEqualTypeOf<
        Readonly<Partial<Record<string, number>>>
      >();
      expectTypeOf<typeof Model.Error>().toEqualTypeOf<
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
      expectTypeOf<ObjectExcessPropertyError>().not.toExtend<
        InferErrors<typeof Model>
      >();
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("rejects every property in an empty schema", () => {
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

      expectTypeOf<typeof Model.Input>().toEqualTypeOf<
        Readonly<Record<string, never>>
      >();
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        Readonly<Record<string, never>>
      >();
      expectTypeOf<typeof Model.Error>().toEqualTypeOf<
        ObjectError<Readonly<Record<never, never>>>
      >();
      expectTypeOf<InferErrors<typeof Model>>().toEqualTypeOf<
        ObjectError<Readonly<Record<never, never>>>
      >();
      expectTypeOf(compileTimeAssertions).toBeFunction();
      expect(Model.fromUnknown(value)).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { anything: { type: "ObjectExcessProperty" } },
          },
        }),
      );
      expect(Model.is(value)).toBe(false);
      expect(Model.is({})).toBe(true);

      const empty = {};
      const result = Model.from(empty);
      expectOk(result, empty);
      expect(result.value).toBe(empty);
    });

    test("creates a parent that validates only structural property inputs", () => {
      const { Model, validations } = setupValidatedObject();
      const value = { title: "", count: 0 };
      const result = Model.parent.fromUnknown(value, { errors: "all" });

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(validations).toEqual([]);
    });

    test("uses Union input boundaries in its parent", () => {
      const Value = union(literal("value"), Number);
      const Model = object({ value: Value });
      const encoded = { value: "other" };

      expect(Model.parent.props.value).toBe(Value.parent);
      expectTypeOf<typeof Model.parent.Output>().toEqualTypeOf<
        typeof Model.Input
      >();
      expectOk(Model.parent.fromUnknown(encoded), encoded);
      expect(Model.parent.fromUnknown({ value: true })).toEqual(
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
      expect(Model.fromUnknown(encoded)).toEqual(
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

    test("rejects a union of property Types", () => {
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

      expectTypeOf<Property>().not.toExtend<OptionalParameter>();
      expectTypeOf(genericCompileTimeAssertion).toBeFunction();
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("rejects erased property Types and a union of schemas", () => {
      const type: FormattableTypeNode = String;
      const props =
        globalThis.Math.random() > 0.5
          ? { root: String }
          : { child: literal("child") };
      const baseProps = { value: String };
      const extendedProps = { value: String, extra: Number };
      const getSubsumedProps = (): typeof baseProps | typeof extendedProps =>
        globalThis.Math.random() > 0.5 ? baseProps : extendedProps;
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("rejects reserved structural error tags in property Types", () => {
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("requires a fixed set of string property names", () => {
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });
  });

  describe("composition", () => {
    test("decodes and encodes declared properties at typed boundaries", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ age: NumberFromString });
      const encoded = { age: "42" };
      const output = { age: 42 };

      const fromResult = Model.from.parent(encoded);
      const toResult = Model.to(output);

      expectOk(fromResult, output);
      expect(fromResult.value).not.toBe(encoded);
      expect(toResult).toEqual(encoded);
      expect(toResult).not.toBe(output);
      expect(Model.is({ age: 42 })).toBe(true);
      expect(Model.is({ age: "42" })).toBe(false);
      expectTypeOf<typeof Model.Input>().toEqualTypeOf<
        ExpectedStrictObject<{ readonly age: string }>
      >();
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        ExpectedStrictObject<{ readonly age: number }>
      >();
    });

    test("accepts ordinary Record properties through typed operations", () => {
      const Model = object({ values: record(String, Number) });
      const input = { values: { one: 1 } };
      const fromUnknownResult = Model.fromUnknown(input);

      expectOk(fromUnknownResult, input);
      const output = fromUnknownResult.value;
      expect(Model.parent).toBeNull();
      expect("parent" in Model.from).toBe(false);
      expect(Model.is(input)).toBe(true);
      expect(output).toBe(input);
      expect(output.values).toBe(input.values);
      expect(Model.is(output)).toBe(true);
      expect(Model.from(input)).toEqual(ok(input));
      expect(Model.to(input)).toBe(input);
      expect(Model.orThrow(input)).toBe(input);
      expect(Model.orNull(input)).toBe(input);
    });

    test("transforms Record properties across Object and child operations", () => {
      const NumberFromString = setupNumberFromString();
      const Values = record(String, NumberFromString);
      const Model = object({ count: NumberFromString }, Values);
      const Imported = brand("Imported", Model);
      const encoded = { count: "2", score: "1" };
      const output = { count: 2, score: 1 };

      expect(Model.fromUnknown(encoded)).toEqual(ok(output));
      expect(Model.from.parent(encoded)).toEqual(ok(output));
      expect(Model.orThrow(encoded)).toEqual(output);
      expect(Model.orNull(encoded)).toEqual(output);
      expect(Model.to(output)).toEqual(encoded);
      expect(Model.parent.fromUnknown(encoded)).toEqual(ok(encoded));
      expect(Imported.from.parent.parent(encoded)).toEqual(ok(output));
      expect(Model.is(output)).toBe(true);
      expect(Model.is(encoded)).toBe(false);
      expect(Model.record).toBe(Values);
      expect(Model.parent.record).toBe(Values.parent);
      expectTypeOf<(typeof Model.Output)["count"]>().toEqualTypeOf<number>();
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        { readonly count: number } & Readonly<Partial<Record<string, number>>>
      >();

      expect(Model.from.parent({ count: "2", score: "no" })).toEqual(
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
      expect(
        Model.from.parent({ count: "no", score: "also no" }, { errors: "all" }),
      ).toEqual(
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

    test("preserves dynamic values when composed operations are identities", () => {
      const Model = object({}, record(String, union(Number, String)));
      const value = { answer: 42 };

      const result = Model.from.parent(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(Model.to(value)).toBe(value);
    });

    test("preserves ordinary root Record values accepted by a Record", () => {
      const Model = object({}, record(String, record(String, Number)));
      const input = { values: { one: 1 } };
      const result = Model.fromUnknown(input);

      expectOk(result, input);
      expect(result.value).toBe(input);
      expect(result.value.values).toBe(input.values);
      expect(Model.is(result.value)).toBe(true);
    });

    test("constructs null-prototype decoded and encoded objects", () => {
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

      expectOk(result, { name: "Ada", age: 42 });
      expect(result.value).not.toBe(encoded);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
      expect(
        globalThis.Object.getOwnPropertyDescriptor(result.value, "name"),
      ).toEqual({
        configurable: true,
        enumerable: true,
        value: "Ada",
        writable: true,
      });
      expect(
        globalThis.Object.getOwnPropertyDescriptor(result.value, "age"),
      ).toEqual({
        configurable: true,
        enumerable: true,
        value: 42,
        writable: true,
      });
      expect(Model.is(result.value)).toBe(true);

      const reencoded = Model.to(result.value);

      expect(reencoded).not.toBe(result.value);
      expect(globalThis.Object.getPrototypeOf(reencoded)).toBeNull();
      expect(
        globalThis.Object.getOwnPropertyDescriptor(reencoded, "name"),
      ).toEqual({
        configurable: true,
        enumerable: true,
        value: "Ada",
        writable: true,
      });
      expect(
        globalThis.Object.getOwnPropertyDescriptor(reencoded, "age"),
      ).toEqual({
        configurable: true,
        enumerable: true,
        value: "42",
        writable: true,
      });
      expect(Model.parent.is(reencoded)).toBe(true);
    });

    test("does not reread validated descriptors while constructing a decoded object", () => {
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

      expectOk(result, { name: "Ada", age: 42 });
      expect(nameDescriptorReads).toBe(1);
      expect(result.value).not.toBe(input);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
      expect(Model.is(result.value)).toBe(true);
    });

    test("rejects class instances instead of stripping their prototype", () => {
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

      expect(user.getSecret()).toBe("secret");
      expect(result).toEqual(
        err({
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value: user },
        }),
      );
      expect(Model.is(user)).toBe(false);
    });

    test("rejects custom prototypes instead of treating them as another realm", () => {
      const Model = object({ name: String });
      const prototype = globalThis.Object.create(null) as object;
      const value = globalThis.Object.assign(
        globalThis.Object.create(prototype),
        { name: "Ada" },
      );

      expect(Model.fromUnknown(value)).toEqual(
        err({
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value },
        }),
      );
      expect(Model.is(value)).toBe(false);
    });

    test("rejects declared accessors without reading them", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ age: NumberFromString });
      let reads = 0;
      const encoded = globalThis.Object.defineProperty({}, "age", {
        configurable: true,
        enumerable: true,
        get: () => (++reads === 1 ? "42" : 42),
      });

      const result = Model.fromUnknown(encoded);

      expect(result).toEqual(
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
      expect(reads).toBe(0);
    });

    test("locates decoding transformation errors by property", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ age: NumberFromString });

      expect(Model.from.parent({ age: "no" })).toEqual(
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

    test("decodes and encodes an optional transformed property", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ value: optional(NumberFromString) });
      const absent = {};
      const encoded = { value: "42" };
      const output = { value: 42 };
      const absentResult = Model.fromUnknown(absent);
      const result = Model.from.parent(encoded);
      const reencoded = Model.to(output);

      expectOk(absentResult, absent);
      expect(absentResult.value).toBe(absent);
      expectOk(result, output);
      expect(result.value).not.toBe(encoded);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
      expect(reencoded).toEqual(encoded);
      expect(globalThis.Object.getPrototypeOf(reencoded)).toBeNull();
      expect(Model.from.parent({ value: "no" })).toEqual(
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
      expectTypeOf<typeof Model.Input>().toEqualTypeOf<
        ExpectedStrictObject<
          Readonly<Record<never, never>>,
          { readonly value: string }
        >
      >();
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        ExpectedStrictObject<
          Readonly<Record<never, never>>,
          { readonly value: number }
        >
      >();
    });

    test("keeps an earlier absent optional property absent while decoding a later property", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({
        note: optional(String),
        value: NumberFromString,
      });

      const result = Model.fromUnknown({ value: "42" });

      expectOk(result, { value: 42 });
      expect(globalThis.Object.hasOwn(result.value, "note")).toBe(false);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
    });

    test("preserves a null prototype while transforming typed values", () => {
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

      expectOk(result, { value: 42 });
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
      expect(Model.is(result.value)).toBe(true);

      const encoded = Model.to(result.value);

      expect(encoded).toEqual(input);
      expect(globalThis.Object.getPrototypeOf(encoded)).toBeNull();
      expect(Model.parent.is(encoded)).toBe(true);
    });

    test("accepts a Union Type as a property Type", () => {
      const Value = union(String, Number);
      const Model = object({ value: Value, optionalValue: optional(Value) });

      expect(Model.props.value).toBe(Value);
      expect(Model.props.optionalValue.type).toBe(Value);
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        ExpectedStrictObject<
          { readonly value: string | number },
          { readonly optionalValue: string | number }
        >
      >();
    });

    test("accepts an Object Type as a property Type", () => {
      const Profile = object({ name: String });
      const Model = object({ profile: Profile });
      const value = { profile: { name: "Ada" } };

      expectOk(Model.fromUnknown(value), value);
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        ExpectedStrictObject<{
          readonly profile: ExpectedStrictObject<{
            readonly name: string;
          }>;
        }>
      >();
    });

    test("forwards property errors through a child Type", () => {
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

      expectErr(result, {
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

      expectTypeOf<NonNullable<Errors["title"]>>().toEqualTypeOf<
        typeof _NonEmpty.Error | typeof _Short.Error
      >();
      expectTypeOf<NonNullable<Errors["count"]>>().toEqualTypeOf<
        typeof _Positive.Error
      >();
    });

    test("keeps a fallible child error outside inherited Object errors", () => {
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

      expectTypeOf(inheritedResult).toEqualTypeOf<
        Result<typeof ReimportedModel.Output, Error>
      >();
      expectTypeOf(ownResult).toEqualTypeOf<
        Result<typeof ReimportedModel.Output, Error>
      >();
      expectTypeOf<
        ReturnType<typeof ReimportedModel.from.parent>
      >().toEqualTypeOf<Result<typeof ReimportedModel.Output, never>>();
      expectTypeOf<
        ReturnType<typeof ReimportedModel.from.parent.parent>
      >().toEqualTypeOf<
        Result<typeof ReimportedModel.Output, ImportedModelError>
      >();
      expect(inheritedResult).toEqual(
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
      expect(ownResult).toEqual(
        err({
          type: "ImportedModel",
          value: { title: "value", count: 1 },
        }),
      );
    });
  });

  describe("formatError", () => {
    test("formats root or first property errors without a path", () => {
      const Model = object({ name: String, age: optional(Number) });
      const NestedModel = object({ values: array(Number) });
      const RecordModel = object({ score: Number }, record(String, Number));

      expect(
        Model.formatError({
          type: "Object",
          reason: { kind: "NotObject", value: null },
        }),
      ).toBe("A value null is not an object.");
      expect(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "UnexpectedPrototype",
            value: new globalThis.Date(),
          },
        }),
      ).toBe(
        "The value is an object, but an Object Output must use this realm's Object.prototype or null. For a trusted return contract, cast and skip this Type; otherwise, use boundary-specific validation or transformation.",
      );
      expect(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { role: { type: "ObjectExcessProperty" } },
          },
        }),
      ).toBe(
        "An excess property is not allowed. Remove it or use a different Type.",
      );
      expect(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { name: { type: "ObjectMissingProperty" } },
          },
        }),
      ).toBe("A required property is missing.");
      expect(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              age: { type: "ObjectPropertyAccess", reason: "Accessor" },
            },
          },
        }),
      ).toBe(
        "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      );
      expect(
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
      ).toBe("An Object property must be enumerable.");
      expect(
        Model.formatError({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              age: { type: "TypeOf", expected: "Number", value: "42" },
            },
          },
        }),
      ).toBe('A value "42" is not a number.');
      expect(
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
      ).toBe('A value "2" is not a number.');
      expect(
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
      ).toBe('A value "wrong" is not a number.');
      expectTypeOf(Model.formatError).parameter(0).toEqualTypeOf<
        ObjectError<{
          readonly name: TypeOfError<"String">;
          readonly age?: TypeOfError<"Number">;
        }>
      >();
    });

    test("throws for an empty Properties error", () => {
      const Model = object({ name: String });

      expect(() =>
        Model.formatError({
          type: "Object",
          reason: { kind: "Properties", errors: {} },
        }),
      ).toThrow("Expected value to be non-nullable.");
    });
  });

  describe("is", () => {
    test("ignores inherited optional properties in Outputs", () => {
      const Matching = object({ constructor: optional(Function) });
      const Invalid = object({ toString: optional(String) });

      expect(Matching.is({})).toBe(true);
      expect(Invalid.is({})).toBe(true);
    });

    test("accepts ordinary and null-prototype plain objects", () => {
      const Model = object({ name: String });
      const value = globalThis.Object.assign(globalThis.Object.create(null), {
        name: "Ada",
      });

      expect(Model.is({ name: "Ada" })).toBe(true);
      expect(Model.is(value)).toBe(true);
    });

    test("requires own enumerable data properties", () => {
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

      expect(Model.is(accessor)).toBe(false);
      expect(reads).toBe(0);
      expect(Model.is(nonEnumerable)).toBe(false);
      expect(Model.is(globalThis.Object.freeze({ name: "Ada" }))).toBe(true);
    });

    test("requires dynamic properties to be enumerable data properties", () => {
      const Model = object({}, record(String, Number));
      const value = globalThis.Object.defineProperty({}, "score", {
        value: 1,
      });

      expect(Model.is(value)).toBe(false);
    });

    test("rejects invalid open-object shapes", () => {
      const Model = object({}, record(String, Number));

      expect(Model.is(null)).toBe(false);
      expect(Model.is(1)).toBe(false);
      expect(Model.is({ score: "wrong" })).toBe(false);
    });

    test("does not read Symbol.toStringTag", () => {
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

      expect(Model.is(value)).toBe(false);
      expect(reads).toBe(0);
    });
  });

  describe("fromUnknown", () => {
    test("distinguishes required, optional, and undefined-accepting properties", () => {
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

      expectOk(Model.fromUnknown(valid), valid);
      expectOk(
        Model.fromUnknown(validWithOptionalUndefined),
        validWithOptionalUndefined,
      );
      expect(Model.fromUnknown({ required: "value" })).toEqual(
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
      expect(
        Model.fromUnknown({
          ...valid,
          optional: undefined,
        }),
      ).toEqual(
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

    test("treats an inherited required property as missing", () => {
      const Model = object({ constructor: Function });
      const value = {};
      const result = Model.fromUnknown(value);

      expect(result).toEqual(
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

    test("ignores inherited optional properties", () => {
      const Matching = object({ constructor: optional(Function) });
      const Invalid = object({ toString: optional(String) });
      const value = {};
      const matchingResult = Matching.fromUnknown(value);
      const invalidResult = Invalid.fromUnknown(value);

      expectOk(matchingResult, value);
      expectOk(invalidResult, value);
      expect(matchingResult.value).toBe(value);
      expect(invalidResult.value).toBe(value);
    });

    test("preserves absent optional properties on null-prototype objects", () => {
      const Model = object({ note: optional(String) });
      const value = globalThis.Object.create(null) as Record<string, unknown>;
      const result = Model.fromUnknown(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
      expect(Model.is(value)).toBe(true);
      expect(Model.is(result.value)).toBe(true);
    });

    test("keeps an absent optional Object.prototype name absent", () => {
      const Model = object({ toString: optional(String) });
      const value = globalThis.Object.create(null) as Record<string, unknown>;
      const result = Model.fromUnknown(value);

      expectOk(result, value);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
      expect("toString" in result.value).toBe(false);
      expect(Model.is(result.value)).toBe(true);
    });

    test("rejects accepted accessors without invoking them", () => {
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

      expect(Declared.fromUnknown(value)).toEqual(error);
      expect(Rest.fromUnknown(value)).toEqual(error);
      expect(Rest.formatError(propertyError)).toBe(
        "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      );
      expect(reads).toBe(0);
      expect(accessError).toBeInstanceOf(Error);
    });

    test("continues after structural property errors when collecting all errors", () => {
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

      expect(Model.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(reads).toBe(0);
      expect(accessError).toBeInstanceOf(Error);
    });

    test("does not read excess accessors", () => {
      const Model = object({ name: String });
      let ownReads = 0;
      const value = globalThis.Object.defineProperty({ name: "Ada" }, "own", {
        enumerable: true,
        get: () => {
          ownReads++;
          return "value";
        },
      });

      expect(Model.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(ownReads).toBe(0);
    });

    test("rejects excess properties", () => {
      const Model = object({ name: String });
      const value: unknown = { name: "Ada", role: "admin" };

      expect(Model.fromUnknown(value)).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { role: { type: "ObjectExcessProperty" } },
          },
        }),
      );
      expect(Model.is(value)).toBe(false);
      expect(Model.is({ name: "Ada" })).toBe(true);
    });

    test("rejects non-enumerable and symbol excess properties", () => {
      const Model = object({ name: String });
      const symbol = globalThis.Symbol("excess");
      const value = globalThis.Object.defineProperty(
        { name: "Ada", [symbol]: true },
        "hidden",
        { value: true },
      );
      const errors = {
        hidden: { type: "ObjectExcessProperty" as const },
        [symbol]: { type: "ObjectExcessProperty" as const },
      };

      expect(Model.fromUnknown(value, { errors: "all" })).toEqual(
        err({ type: "Object", reason: { kind: "Properties", errors } }),
      );
      expect(Model.is(value)).toBe(false);
      expect(globalThis.Reflect.ownKeys(errors)).toEqual(["hidden", symbol]);
    });

    test("rejects exotic declared and Record properties without reading them", () => {
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

      expect(reads).toBe(0);
      expect(Model.is(value)).toBe(false);
      expect(result).toEqual(
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
      expect(Model.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(reads).toBe(0);
    });

    test("collects declared and Record property errors", () => {
      const Model = object(
        { count: Number, age: Number },
        record(String, Number),
      );

      expect(
        Model.fromUnknown(
          { count: "2", age: "42", wrong: "value" },
          { errors: "all" },
        ),
      ).toEqual(
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

    test("reports symbol Record keys", () => {
      const Model = object({}, record(String, Number));
      const key = globalThis.Symbol("key");
      let reads = 0;
      const value = globalThis.Object.defineProperty({}, key, {
        get: () => {
          reads++;
          return "wrong";
        },
      });

      expect(Model.fromUnknown(value)).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              [key]: {
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
              },
            },
          },
        }),
      );
      expect(reads).toBe(0);

      expect(Model.fromUnknown(value, { errors: "all" })).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              [key]: {
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
              },
            },
          },
        }),
      );
      expect(reads).toBe(0);
      expect(Model.is(value)).toBe(false);
      expect(reads).toBe(0);
    });

    test("collects declared and excess property errors", () => {
      const Model = object({ name: String, age: Number });

      expect(
        Model.fromUnknown(
          { name: 42, age: "42", role: "admin" },
          { errors: "all" },
        ),
      ).toEqual(
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

    test("returns root structural errors without reading Symbol.toStringTag", () => {
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

      expect(Model.fromUnknown(null)).toEqual(
        err({
          type: "Object",
          reason: { kind: "NotObject", value: null },
        }),
      );
      expect(Model.fromUnknown([])).toEqual(
        err({
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value: [] },
        }),
      );
      expect(Model.fromUnknown(unreadableTag)).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              [globalThis.Symbol.toStringTag]: {
                type: "ObjectExcessProperty",
              },
            },
          },
        }),
      );
      expect(reads).toBe(0);
    });

    test("returns only the first property error by default", () => {
      const Model = object({
        name: String,
        age: Number,
        active: optional(Boolean),
      });

      expect(
        Model.fromUnknown({ age: "42", active: "yes", role: "admin" }),
      ).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { name: { type: "ObjectMissingProperty" } },
          },
        }),
      );
    });

    test("collects one error from every invalid property", () => {
      const Model = object({
        name: String,
        age: Number,
        active: optional(Boolean),
      });

      expect(
        Model.fromUnknown(
          { name: 42, age: "42", active: "yes" },
          { errors: "all" },
        ),
      ).toEqual(
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

    test("collects structural, invalid, and missing property errors", () => {
      const Model = object({
        toString: optional(String),
        name: String,
        age: Number,
      });

      expect(Model.fromUnknown({ name: 42 }, { errors: "all" })).toEqual(
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

    test("collects root and refinement errors from different properties", () => {
      const { Model, validations } = setupValidatedObject();

      expect(
        Model.fromUnknown({ title: 42, count: 0 }, { errors: "all" }),
      ).toEqual(
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
      expect(validations).toEqual([["Positive", 0]]);
    });

    test("returns nested Array errors", () => {
      const Model = object({ values: array(Number) });

      const result = Model.fromUnknown({ values: [1, "2"] });

      expect(result).toEqual(
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
    test("accepts its own Output", () => {
      const { Model, validations } = setupValidatedObject();
      const value = Model.orThrow({ title: "value", count: 1 });
      validations.length = 0;
      const result = Model.from(value);

      expectTypeOf(result).toEqualTypeOf<Result<typeof Model.Output, never>>();
      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(validations).toEqual([
        ["NonEmpty", "value"],
        ["Short", "value"],
        ["Positive", 1],
      ]);
    });

    test("accepts closed and open Outputs after ordinary object spread", () => {
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
        expect(globalThis.Object.getPrototypeOf(spread)).toBe(
          globalThis.Object.prototype,
        );
        expect(globalThis.Object.hasOwn(spread, "toString")).toBe(false);
      }
      expectOk(Closed.from(closedSpread), closedSpread);
      expectOk(Open.from(openSpread), openSpread);
      expect(Closed.to(closedSpread)).toBe(closedSpread);
      expect(Open.to(openSpread)).toBe(openSpread);
    });

    test("asserts exact own properties", () => {
      const Model = object({ name: String });
      const value = { name: "Ada", searchWords: ["ada"] };
      const ownToString = globalThis.Object.defineProperty(
        { name: "Ada" },
        "toString",
        { enumerable: true, value: "own" },
      );

      const message =
        "An excess property is not allowed. Remove it or use a different Type.";
      expect(() => Model.from(value)).toThrow(message);
      expect(() => Model.to(value)).toThrow(message);
      expect(() => Model.orThrow(value)).toThrow(message);
      expect(() => Model.orNull(value)).toThrow(message);
      expect(() => Model.to(ownToString)).toThrow(message);
    });

    test("validates nested exact Outputs without decoding them", () => {
      const NumberFromString = setupNumberFromString();
      const Nested = object({ count: NumberFromString });
      const Model = object({ nested: Nested, label: String });
      const invalid = {
        nested: { count: 1 },
        label: 42,
      } as unknown as typeof Model.Output;

      expectAssertionError(
        () => Model.from(invalid),
        "A value 42 is not a string.",
        {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              label: { type: "TypeOf", expected: "String", value: 42 },
            },
          },
        },
      );
    });

    test("validates every property chain from its parent in declaration order", () => {
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

        expectTypeOf<NonNullable<Errors["title"]>>().toEqualTypeOf<
          typeof _Short.Error | typeof Model.props.title.parent.Error
        >();
        expectTypeOf<NonNullable<Errors["count"]>>().toEqualTypeOf<
          typeof _Positive.Error
        >();
        expectTypeOf<NonNullable<Errors["note"]>>().toEqualTypeOf<never>();
      }
      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(validations).toEqual([
        ["NonEmpty", "value"],
        ["Short", "value"],
        ["Positive", 1],
      ]);
    });

    test("collects remaining errors by property", () => {
      const { Model } = setupValidatedObject();

      expect(
        Model.from.parent({ title: "too long", count: 0 }, { errors: "all" }),
      ).toEqual(
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

    test("ignores inherited optional properties at typed boundaries", () => {
      const Model = object({ constructor: optional(literal("value")) });
      const input = {} as typeof Model.Output;

      expectOk(Model.from(input), input);
      expect(Model.orThrow(input)).toBe(input);
      expect(Model.orNull(input)).toBe(input);
      expect(Model.to(input)).toBe(input);
    });
  });

  describe("root operations", () => {
    test("return the original valid object", () => {
      const Model = object({ name: String });
      const value = { name: "Ada" };
      const result = Model.from(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(Model.to(value)).toBe(value);
      expect(Model.parent).toBeNull();
      expect(Model.orThrow(value)).toBe(value);
      expect(Model.orNull(value)).toBe(value);
    });

    test("use ordinary structural Input and Output types", () => {
      const Model = object({ name: String });
      const symbol = globalThis.Symbol();
      const value = { name: "Ada", [symbol]: true };
      const compileTimeAssertions = () => {
        Model.from(value);
        Model.to(value);
      };

      expectTypeOf<typeof Model.Input>().toExtend<{
        readonly name: string;
      }>();
      expectTypeOf<{ readonly name: string }>().toExtend<typeof Model.Input>();
      expectTypeOf<typeof Model.Output>().toExtend<{
        readonly name: string;
      }>();
      expectTypeOf<{ readonly name: string }>().toExtend<typeof Model.Output>();
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("return valid Object and Record values", () => {
      const Model = object({ count: Number }, record(String, Number));
      const value = { count: 0, score: 1 };

      const result = Model.from(value);

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(Model.to(value)).toBe(value);
      expect(Model.orThrow(value)).toBe(value);
      expect(Model.orNull(value)).toBe(value);
      expect(Model.parent).toBeNull();
      expect(Model.is(value)).toBe(true);
    });

    test("accept arbitrary string properties through a Record", () => {
      const Model = object({}, record(String, Unknown));
      const value = { anything: 1 };

      expectOk(Model.fromUnknown(value), value);
      expect(Model.is(value)).toBe(true);
      expectTypeOf<typeof Model.Output>().toEqualTypeOf<
        Readonly<Partial<Record<string, unknown>>>
      >();
    });
  });
});

describe("typed", () => {
  describe("construction", () => {
    test("creates a strict Object with only a literal type property", () => {
      const Empty = typed("Empty");

      expect(Empty.name).toBe("Object");
      expect(Empty.props.type.name).toBe("Literal");
      expect(Empty.props.type.expected).toBe("Empty");
      expect(Empty.parent.props.type).toBe(String);
      expect(Empty.parent.parent).toBeNull();
      expect("parent" in Empty.from).toBe(true);
      expectTypeOf(Empty).toEqualTypeOf<TypedType<"Empty">>();
      expectTypeOf<typeof Empty.Input>().toEqualTypeOf<
        ExpectedStrictObject<{ readonly type: string }>
      >();
      expectTypeOf<typeof Empty.Output>().toEqualTypeOf<
        ExpectedStrictObject<{ readonly type: "Empty" }>
      >();
      expectTypeOf<typeof Empty.Output>().toExtend<Typed<"Empty">>();
      expectTypeOf<typeof Empty.Error>().toEqualTypeOf<
        ObjectPropertiesError<{ readonly type: LiteralError<"Empty"> }>
      >();
      expectTypeOf<typeof Empty.parent.Error>().toEqualTypeOf<
        ObjectError<{
          readonly type: TypeOfError<"String">;
        }>
      >();
      expectTypeOf<InferErrors<typeof Empty>>().toEqualTypeOf<
        ObjectError<{
          readonly type: TypeOfError<"String"> | LiteralError<"Empty">;
        }>
      >();

      expect(Empty.parent.fromUnknown({ type: "Other" })).toEqual(
        ok({ type: "Other" }),
      );
      expect(Empty.from.parent({ type: "Other" })).toEqual(
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
      expect(Empty.fromUnknown({ type: "Empty" })).toEqual(
        ok({ type: "Empty" }),
      );
    });

    test("includes non-enumerable schema properties", () => {
      const props = { value: String };
      globalThis.Object.defineProperty(props, "value", {
        value: String,
        enumerable: false,
      });
      const Model = typed("Model", props);

      expect(Model.is({ type: "Model" })).toBe(false);
      expect(Model.fromUnknown({ type: "Model" })).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { value: { type: "ObjectMissingProperty" } },
          },
        }),
      );
      expect(Model.fromUnknown({ type: "Model", value: "text" })).toEqual(
        ok({ type: "Model", value: "text" }),
      );
      expect(Model.props.value).toBe(String);
    });

    test("snapshots schema properties", () => {
      const props = { value: String };
      const Model = typed("Model", props);

      globalThis.Reflect.set(props, "value", Number);

      expect(Model.props).not.toBe(props);
      expect(Model.props.value).toBe(String);
      expect(Model.is({ type: "Model", value: "text" })).toBe(true);
      expect(Model.is({ type: "Model", value: 1 })).toBe(false);
    });

    test("rejects schema accessors without invoking them", () => {
      let reads = 0;
      const props = {
        get value() {
          reads++;
          return String;
        },
      };

      expect(() => typed("Model", props)).toThrow(
        "Object schema properties must be own string-keyed data properties.",
      );
      expect(reads).toBe(0);
    });

    test("rejects inherited schema properties without invoking them", () => {
      let reads = 0;

      class Props {
        get value() {
          reads++;
          return String;
        }
      }

      const props: { readonly value: typeof String } = new Props();

      expect(() => typed("Model", props)).toThrow(
        "Object schema properties must be own string-keyed data properties.",
      );
      expect(reads).toBe(0);
    });

    test("rejects symbol schema properties without invoking them", () => {
      const key = globalThis.Symbol("value");
      let reads = 0;
      const props = globalThis.Object.defineProperty({ value: String }, key, {
        get: () => {
          reads++;
          return Number;
        },
      });

      expect(() => typed("Model", props)).toThrow(
        "Object schema properties must be own string-keyed data properties.",
      );
      expect(reads).toBe(0);
    });

    test("rejects a hidden own type schema property", () => {
      const props = globalThis.Object.defineProperty(
        { value: String },
        "type",
        {
          value: Number,
          enumerable: false,
        },
      );

      expect(() => typed("Model", props)).toThrow(
        'The "type" schema property is reserved by typed.',
      );
    });

    test("rejects a hidden own type schema accessor without invoking it", () => {
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

      expect(() => typed("Model", props)).toThrow(
        'The "type" schema property is reserved by typed.',
      );
      expect(reads).toBe(0);
    });

    test("composes additional properties through Object and Literal", () => {
      const NumberFromString = setupNumberFromString();
      const Pending = typed("Pending", {
        label: NumberFromString,
        note: optional(String),
      });
      const input = { type: "Pending", label: "42" } as const;
      const output = { type: "Pending", label: 42 } as const;

      expect(Pending.name).toBe("Object");
      expect(Pending.props.type.expected).toBe("Pending");
      expect(Pending.props.label).toBe(NumberFromString);
      expect(Pending.props.note.type).toBe(String);
      expect(Pending.parent.props.type).toBe(String);
      expect(Pending.parent.props.label).toBe(String);
      expect(Pending.parent.props.note.type).toBe(String);
      expect(Pending.parent.parent).toBeNull();
      expectTypeOf(Pending).toEqualTypeOf<
        TypedType<
          "Pending",
          {
            readonly label: typeof NumberFromString;
            readonly note: OptionalProperty<typeof String>;
          }
        >
      >();
      expectTypeOf<typeof Pending.Input>().toEqualTypeOf<
        ExpectedStrictObject<
          { readonly type: string; readonly label: string },
          { readonly note: string }
        >
      >();
      expectTypeOf<typeof Pending.Output>().toEqualTypeOf<
        ExpectedStrictObject<
          { readonly type: "Pending"; readonly label: number },
          { readonly note: string }
        >
      >();
      expectTypeOf<typeof Pending.Error>().toEqualTypeOf<
        ObjectPropertiesError<{
          readonly type: LiteralError<"Pending">;
          readonly label: typeof NumberFromString.Error;
          readonly note: never;
        }>
      >();

      expect(Pending.from.parent(input)).toEqual(ok(output));
      expect(Pending.to(output)).toEqual(input);
      expect(Pending.is(output)).toBe(true);
      expect(Pending.is(input)).toBe(false);
      expect(Pending.is({ type: "Other", label: 42 })).toBe(false);
      expect(
        Pending.fromUnknown({ type: "Other", label: "not a number" }),
      ).toEqual(
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

    test("composes additional properties through a Record", () => {
      const Values = record(String, String);
      const Open = typed("Open", { label: String }, Values);
      const value = { type: "Open", label: "Label", note: "Note" } as const;
      const compileTimeAssertions = () => {
        // @ts-expect-error Additional properties must match the Record value Type.
        Open.from({ type: "Open", label: "Label", score: 1 });
      };

      expect(Open.record).toBe(Values);
      expectTypeOf(Open).toEqualTypeOf<
        TypedType<"Open", { readonly label: typeof String }, typeof Values>
      >();
      expectTypeOf<typeof Open.Input>().toEqualTypeOf<
        {
          readonly type: string;
          readonly label: string;
        } & Readonly<Partial<Record<string, string>>>
      >();
      expectTypeOf<typeof Open.Output>().toEqualTypeOf<
        {
          readonly type: "Open";
          readonly label: string;
        } & Readonly<Partial<Record<string, string>>>
      >();
      expectOk(Open.fromUnknown(value), value);
      expect(Open.is(value)).toBe(true);
      expect(Open.fromUnknown({ ...value, score: 1 })).toEqual(
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
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("requires one concrete Type name and reserves the type property", () => {
      const unionTag = "One" as "One" | "Two";
      const broadTag: TypeName = "One";
      const patternedTag = "One" as `One${string}`;
      const property = String as typeof String | typeof Number;
      const baseProps = { value: String };
      const extendedProps = { value: String, extra: Number };
      const getSubsumedProps = (): typeof baseProps | typeof extendedProps =>
        globalThis.Math.random() > 0.5 ? baseProps : extendedProps;
      const subsumedProps = getSubsumedProps();
      const Values = record(String, String);
      const UnknownValues = record(String, Unknown);
      const recordUnion =
        globalThis.Math.random() > 0.5 ? Values : UnknownValues;
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

      expectTypeOf(genericTagAssertion).toBeFunction();
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });
  });

  describe("validation", () => {
    test("rejects missing, mismatched, and excess properties", () => {
      const Empty = typed("Empty");
      const valueWithExcessProperty = { type: "Empty", extra: true } as const;
      const compileTimeAssertions = () => {
        // @ts-expect-error Strict typed Input excludes excess properties.
        Empty.from({ type: "Empty", extra: true });
      };

      expect(Empty.fromUnknown({})).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { type: { type: "ObjectMissingProperty" } },
          },
        }),
      );
      expect(Empty.fromUnknown({ type: "Other" }).ok).toBe(false);
      expect(Empty.fromUnknown(valueWithExcessProperty)).toEqual(
        err({
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { extra: { type: "ObjectExcessProperty" } },
          },
        }),
      );
      expect(Empty.is(valueWithExcessProperty)).toBe(false);
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });
  });

  describe("composition", () => {
    test("forms a total discriminated Union", () => {
      const NumberFromString = setupNumberFromString();
      const Created = typed("Created", { id: NumberFromString });
      const Deleted = typed("Deleted", { id: String });
      const Event = union(Created, Deleted);
      const createdInput = { type: "Created", id: "42" } as const;
      const createdOutput = { type: "Created", id: 42 } as const;
      const deleted = { type: "Deleted", id: "42" } as const;

      expect(Event.fromUnknown(createdInput)).toEqual(ok(createdOutput));
      expect(Event.fromUnknown(deleted)).toEqual(ok(deleted));
      expect(Event.to(createdOutput)).toEqual(createdInput);
      expect(Event.to(deleted)).toEqual(deleted);
      expect(
        Event.fromUnknown({ type: "Created", id: "42", extra: true }).ok,
      ).toBe(false);
      expectTypeOf<typeof Event.Output>().toEqualTypeOf<
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
      expectOk(result, createdOutput);
      if (result.value.type === "Created") {
        expectTypeOf(result.value.id).toEqualTypeOf<number>();
      } else {
        expectTypeOf(result.value.id).toEqualTypeOf<string>();
      }
    });
  });
});

describe("discriminatedUnion", () => {
  describe("construction", () => {
    test("creates a routed Type with exact discriminated Inputs", () => {
      const NumberFromString = setupNumberFromString();
      const Created = typed("Created", { id: NumberFromString });
      const Deleted = typed("Deleted", { reason: String });
      const Event = discriminatedUnion(Created, Deleted);

      expect(Event.name).toBe("DiscriminatedUnion");
      expect(Event.key).toBe("type");
      expect(Event.members).toEqual([Created, Deleted]);
      expect(Event.members[0]).toBe(Created);
      expect(Event.members[1]).toBe(Deleted);
      expect(Event.parent.name).toBe("DiscriminatedUnion");
      expect(Event.parent.parent).toBeNull();
      expectTypeOf(Event).toEqualTypeOf<
        DiscriminatedUnionType<
          "type",
          readonly [typeof Created, typeof Deleted]
        >
      >();
      expectTypeOf<typeof Event.parent.Input>().toEqualTypeOf<
        | (typeof Created.Input & { readonly type: "Created" })
        | (typeof Deleted.Input & { readonly type: "Deleted" })
      >();
      expectTypeOf<typeof Event.parent.Output>().toEqualTypeOf<
        typeof Event.parent.Input
      >();
      expectTypeOf<typeof Event.parent.Error>().toExtend<
        DiscriminatedUnionError<
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
      >();
      expectTypeOf<typeof Event.Input>().toEqualTypeOf<
        | (typeof Created.Input & { readonly type: "Created" })
        | (typeof Deleted.Input & { readonly type: "Deleted" })
      >();
      expectTypeOf<typeof Event.Output>().toEqualTypeOf<
        typeof Created.Output | typeof Deleted.Output
      >();
      expectTypeOf<typeof Event.Error>().toEqualTypeOf<
        DiscriminatedUnionMemberError<
          | DiscriminatedUnionMemberIssue<"Created", typeof Created.Error>
          | DiscriminatedUnionMemberIssue<"Deleted", typeof Deleted.Error>
        >
      >();
      expectTypeOf<InferErrors<typeof Event>>().toExtend<
        DiscriminatedUnionError<
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
      >();
      expect("parent" in Event.from).toBe(true);
    });

    test("supports an explicit discriminator key", () => {
      const Added = object({ kind: literal("added"), value: String });
      const Removed = object({ kind: literal("removed"), id: Number });
      const Event = discriminatedUnion("kind", Added, Removed);

      expect(Event.key).toBe("kind");
      expect(Event.members).toEqual([Added, Removed]);
      expectTypeOf<typeof Event.Input>().toEqualTypeOf<
        | (typeof Added.Input & { readonly kind: "added" })
        | (typeof Removed.Input & { readonly kind: "removed" })
      >();
      expect(Event.fromUnknown({ kind: "added", value: "value" })).toEqual(
        ok({ kind: "added", value: "value" }),
      );
      expect(Event.fromUnknown({ kind: "removed", id: 1 })).toEqual(
        ok({ kind: "removed", id: 1 }),
      );
    });

    test("requires a concrete key and unique required string literal props", () => {
      const Valid = typed("Valid");
      const Duplicate = typed("Valid");
      const Missing = object({ value: String });
      const Optional = object({ type: optional(literal("Optional")) });
      const Broad = object({ type: String });
      const NumberTag = object({ type: literal(1) });
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
        // @ts-expect-error The discriminator property must be a string Literal Type.
        discriminatedUnion(Valid, NumberTag);
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("requires one concrete finite member tuple", () => {
      const OneWithString = typed("One", { value: String });
      const TwoWithString = typed("Two", { value: String });
      const OneWithNumber = typed("One", { value: Number });
      const TwoWithNumber = typed("Two", { value: Number });
      const ThreeWithString = typed("Three", { value: String });
      const _ThreeWithNumber = typed("Three", { value: Number });
      const members =
        globalThis.Math.random() > 0.5
          ? ([OneWithString, TwoWithString] as const)
          : ([OneWithNumber, TwoWithNumber] as const);
      const differentLengthMembers =
        globalThis.Math.random() > 0.5
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });
  });

  describe("validation", () => {
    test("routes only the selected member through every operation", () => {
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

      expect(Event.fromUnknown(input)).toEqual(ok(output));
      expect([createdFromCount, deletedFromCount]).toEqual([1, 0]);

      createdFromCount = deletedFromCount = 0;
      expect(Event.from.parent(input)).toEqual(ok(output));
      expect([createdFromCount, deletedFromCount]).toEqual([1, 0]);

      expect(Event.to(output)).toEqual(input);
      expect([createdToCount, deletedToCount]).toEqual([1, 0]);
      expect(Event.is(output)).toBe(true);
      expect(Event.is(input)).toBe(false);
      expect(Event.is(null)).toBe(false);
      expect(Event.parent.is(null)).toBe(false);
    });

    test("routes its encoded parent boundary before member transformations", () => {
      const NumberFromString = setupNumberFromString();
      const Created = typed("Created", { id: NumberFromString });
      const Deleted = typed("Deleted", { id: String });
      const Event = discriminatedUnion(Created, Deleted);
      const input = { type: "Created", id: "42" } as const;
      const output = { type: "Created", id: 42 } as const;

      expect(Event.parent.fromUnknown(input)).toEqual(ok(input));
      expect(Event.parent.from(input)).toEqual(ok(input));
      expect(Event.parent.to(input)).toEqual(input);
      expect(Event.parent.is(input)).toBe(true);
      expect(Event.is(input)).toBe(false);
      expect(Event.orThrow(input)).toEqual(output);
      expect(Event.orNull(input)).toEqual(output);
    });

    test("asserts exact routed Outputs at both boundaries", () => {
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

      expectAssertionError(
        () => Event.from(invalid),
        'A value "no" is not a number.',
        cause,
      );
      expectAssertionError(
        () => Event.from.parent(invalid),
        'A value "no" is not a number.',
        cause,
      );
    });

    test("uses the immediate Object parent for a transformed Record member", () => {
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
      expect(Added.parent.parent).toBeNull();
      expect(Event.parent.fromUnknown(input)).toEqual(ok(input));
      expect(Event.parent.from(input)).toEqual(ok(input));
      expect(Event.parent.to(input)).toEqual(input);
      expect(Event.parent.is(input)).toBe(true);
      expect(Event.fromUnknown(input)).toEqual(ok(output));
      expect(Event.to(output)).toEqual(input);
    });

    test("rejects an uncorrelated Input instead of trusting the selected shape", () => {
      const Created = typed("Created", { name: String });
      const Deleted = typed("Deleted", { reason: String });
      const Event = discriminatedUnion(Created, Deleted);
      const uncorrelated = { type: "Created", reason: "reason" } as const;
      const compileTimeAssertions = () => {
        // @ts-expect-error The exact discriminator must correlate with its member Input.
        Event.from(uncorrelated);
      };

      expectTypeOf(uncorrelated).not.toExtend<typeof Event.Input>();
      expect(Event.fromUnknown(uncorrelated, { errors: "all" })).toEqual(
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
      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("returns routed discriminator, access, and member errors", () => {
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

      expect(Event.fromUnknown(null)).toEqual(
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
      expect(Event.fromUnknown({ type: "Updated" })).toEqual(
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
      expect(Event.fromUnknown({ type: 1 })).toEqual(
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
      expect(Event.fromUnknown({})).toEqual(
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
      expect(Event.fromUnknown(throwing)).toEqual(
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "Accessor",
          },
        }),
      );
      expect(Event.fromUnknown(nonEnumerable)).toEqual(
        err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "NonEnumerable",
          },
        }),
      );
      expect(accessError).toBeInstanceOf(Error);
      expect(
        Event.fromUnknown(
          { type: "Created", name: 1, email: 2 },
          { errors: "all" },
        ),
      ).toEqual(
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

    test("formats routing errors and delegates selected member errors", () => {
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

      expectErr(objectResult, {
        type: "DiscriminatedUnion",
        reason: {
          kind: "Object",
          error: {
            type: "Object",
            reason: { kind: "NotObject", value: null },
          },
        },
      });
      expectErr(discriminatorResult, {
        type: "DiscriminatedUnion",
        reason: {
          kind: "Discriminator",
          key: "type",
          value: "Other",
          expected: ["Created", "Deleted"],
        },
      });
      expectErr(memberResult, {
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
      expectErr(accessResult, {
        type: "DiscriminatedUnion",
        reason: {
          kind: "PropertyAccess",
          key: "type",
          reason: "Accessor",
        },
      });

      expect(Event.formatError(objectResult.error)).toBe(
        "A value null is not an object.",
      );
      expect(Event.formatError(discriminatorResult.error)).toBe(
        'The discriminator property "type" has an unexpected value "Other".',
      );
      expect(Event.formatError(memberResult.error)).toBe(
        "A required property is missing.",
      );
      expect(Event.formatError(accessResult.error)).toBe(
        'The discriminator property "type" must be a data property.',
      );
      expect(
        Event.formatError({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "Inherited",
          },
        }),
      ).toBe('The discriminator property "type" must be an own property.');
      expect(
        Event.formatError({
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "NonEnumerable",
          },
        }),
      ).toBe('The discriminator property "type" must be enumerable.');
    });

    test("rejects class instances and inherited discriminator accessors without invoking them", () => {
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

      expect(Event.fromUnknown(input)).toEqual(
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
      expect(Event.is(input)).toBe(false);
      expect(reads).toBe(0);

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
        expect(Event.fromUnknown({ value: "value" })).toEqual(
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
          globalThis.Reflect.deleteProperty(
            globalThis.Object.prototype,
            "type",
          );
        } else {
          globalThis.Object.defineProperty(
            globalThis.Object.prototype,
            "type",
            originalTypeDescriptor,
          );
        }
      }
      expect(reads).toBe(0);

      const nullPrototypeInput = globalThis.Object.assign(
        globalThis.Object.create(null),
        { type: "Deleted", value: "value" },
      );
      const result = Event.fromUnknown(nullPrototypeInput);

      expectOk(result, { type: "Deleted", value: "value" });
      expect(result.value).toBe(nullPrototypeInput);
      expect(globalThis.Object.getPrototypeOf(result.value)).toBeNull();
    });
  });

  describe("composition", () => {
    test("composes transformed members through Array and reverse operations", () => {
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

      expect(Events.fromUnknown(input)).toEqual(ok(output));
      expect(Events.to(output)).toEqual(input);
      expect(
        Events.fromUnknown([
          { type: "Deleted", id: "ok" },
          { type: "Created", id: "no" },
        ]),
      ).toEqual(
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
  test("requires its definition to return one concrete Type node", () => {
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

    expectTypeOf<Target>().not.toExtend<DefinitionOutput>();
    expectTypeOf<DefinitionOutput>().toEqualTypeOf<"⛔ Type error: Lazy Type definition must return one concrete Type node. Pass a Union Type node instead of a union of Type nodes.">();
    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("rejects an unresolved generic definition", () => {
    const compileTimeAssertions = <
      Target extends typeof String | typeof Number,
    >(
      target: Target,
    ): Target => {
      // @ts-expect-error An unresolved generic target might be a union.
      lazy(() => target);
      return target;
    };

    expectTypeOf(compileTimeAssertions).toBeFunction();
  });

  test("accepts one Union Type node as its definition", () => {
    const Target = union(String, Number);
    const Value = lazy(() => Target);

    expectOk(Value.fromUnknown("value"), "value");
    expectOk(Value.fromUnknown(1), 1);
    expectTypeOf<typeof Value.Input>().toEqualTypeOf<string | number>();
    expectTypeOf<typeof Value.Output>().toEqualTypeOf<string | number>();
  });

  test("asserts exact resolved Outputs at both Lazy boundaries", () => {
    const Value = lazy(() => String);
    const invalid = 1 as unknown as string;
    const cause = { type: "TypeOf", expected: "String", value: 1 } as const;

    expectAssertionError(
      () => Value.from(invalid),
      "A value 1 is not a string.",
      cause,
    );
    expectAssertionError(
      () => Value.from.parent(invalid),
      "A value 1 is not a string.",
      cause,
    );
  });

  describe("direct recursion", () => {
    test("validates a recursively declared pure Object", () => {
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

      expect(StringTree.name).toBe("Lazy");
      expect(StringTree.parent.name).toBe("Lazy");
      expect(StringTree.parent.parent).toBeNull();
      expect("parent" in StringTree.from).toBe(true);
      expect(StringTree.fromUnknown(value)).toEqual(ok(value));
      expect(StringTree.from(value)).toEqual(ok(value));
      expect(StringTree.to(value)).toEqual(value);
      expect(StringTree.is(value)).toBe(true);
      expectTypeOf(StringTree).toEqualTypeOf<
        LazyType<
          StringTree,
          StringTree,
          never,
          StringTreeError,
          StringTreeError
        >
      >();
      expectTypeOf(StringTree.from(value)).toEqualTypeOf<
        Result<StringTree, never>
      >();
      expectTypeOf<
        typeof StringTree.parent.Error
      >().toEqualTypeOf<StringTreeError>();
      expectTypeOf<
        InferErrors<typeof StringTree>
      >().toEqualTypeOf<StringTreeError>();

      expect(
        StringTree.fromUnknown({
          value: "root",
          children: [{ value: 42, children: [] }],
        }),
      ).toEqual(
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

    test("preserves recursive input, conversion, and complete error channels", () => {
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
        TreeError
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

      expect(Tree.parent.fromUnknown(input)).toEqual(ok(input));
      expect(Tree.parent.from(input)).toEqual(ok(input));
      expect(Tree.parent.to(input)).toEqual(input);
      expect(Tree.parent.is(input)).toBe(true);
      expect(Tree.fromUnknown(input)).toEqual(ok(output));
      expect(Tree.from.parent(input)).toEqual(ok(output));
      expect(Tree.to(output)).toEqual(input);
      expect(Tree.orThrow(input)).toEqual(output);
      expect(Tree.is(output)).toBe(true);
      expect(Tree.is(input)).toBe(false);
      expectTypeOf(Tree.from.parent(input)).toEqualTypeOf<
        Result<TreeOutput, TreeFromError>
      >();
      expectTypeOf(Tree.parent.fromUnknown(input)).toEqualTypeOf<
        Result<TreeInput, TreeInputError>
      >();
      expectTypeOf(Tree.fromUnknown(input)).toEqualTypeOf<
        Result<TreeOutput, TreeError>
      >();

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

      expectErr(result, expectedError);
      expect(Tree.formatError(result.error)).toBe(
        "The value no is not a number.",
      );
      expectErr(completeResult, expectedError);
      expect(Tree.formatError(completeResult.error)).toBe(
        "The value no is not a number.",
      );
      expect(Tree.orNull(invalid)).toBeNull();
      expectErr(inputResult, {
        type: "Object",
        reason: {
          kind: "Properties",
          errors: {
            value: { type: "TypeOf", expected: "String", value: 1 },
          },
        },
      });
      expect(Tree.parent.formatError(inputResult.error)).toBe(
        "A value 1 is not a string.",
      );
    });
  });

  describe("resolution", () => {
    test("defers and caches mutually recursive definitions independently", () => {
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

      expect([leftResolutions, rightResolutions]).toEqual([0, 0]);
      expect(Left.fromUnknown({ label: "left" })).toEqual(
        ok({ label: "left" }),
      );
      expect([leftResolutions, rightResolutions]).toEqual([1, 0]);

      const value: Left = {
        label: "left",
        right: { count: 1, left: { label: "nested" } },
      };

      expect(Left.fromUnknown(value)).toEqual(ok(value));
      expect([leftResolutions, rightResolutions]).toEqual([1, 1]);
      expect(Left.is(value)).toBe(true);
      expect(Right.to(value.right!)).toEqual(value.right);
      expect([leftResolutions, rightResolutions]).toEqual([1, 1]);
    });

    test("rejects reentrant definition resolution and caches the failure", () => {
      let resolutions = 0;
      const Reentrant: LazyType<
        string,
        string,
        never,
        TypeOfError<"String">,
        TypeOfError<"String">
      > = lazy(() => {
        resolutions++;
        Reentrant.is("value");
        return String;
      });
      const message =
        "A Lazy Type definition must not resolve itself while it is being created.";

      expect(() => Reentrant.fromUnknown("value")).toThrow(message);
      expect(() => Reentrant.fromUnknown("value")).toThrow(message);
      expect(resolutions).toBe(1);
    });

    test("rejects a Lazy Type returned as another Lazy definition", () => {
      let targetResolutions = 0;
      const Target = lazy(() => {
        targetResolutions++;
        return String;
      });
      const Alias = lazy(() => Target);

      expect(() => Alias.fromUnknown("value")).toThrow(
        "A Lazy Type definition must return a non-Lazy Type.",
      );
      expect(targetResolutions).toBe(0);
    });

    test("rejects a Lazy Type in its definition parent chain", () => {
      const ParentCycle: LazyType<
        string,
        string,
        never,
        TypeOfError<"String">,
        TypeOfError<"String">
      > = lazy(() => createType("ParentCycle", ParentCycle, ok));

      expect(() => ParentCycle.fromUnknown("value")).toThrow(
        "A Lazy Type definition must not use a Lazy Type in its parent chain.",
      );
    });
  });
});

describe("JsonValue", () => {
  test("exposes exact recursive data contracts", () => {
    expectTypeOf(JsonValue).toEqualTypeOf<JsonValueType>();
    expectTypeOf<typeof JsonValue.Input>().toEqualTypeOf<JsonValue>();
    expectTypeOf<typeof JsonValue.Output>().toEqualTypeOf<JsonValue>();
    expectTypeOf<typeof JsonValue.Error>().toEqualTypeOf<JsonValueError>();
    expectTypeOf(JsonValue.parent).toEqualTypeOf<null>();

    expectTypeOf<JsonValueInput>().toEqualTypeOf<
      string | number | boolean | null | JsonArrayInput | JsonObjectInput
    >();
    expectTypeOf<typeof JsonArray.Output>().toEqualTypeOf<JsonArray>();
    expectTypeOf<typeof JsonObject.Output>().toEqualTypeOf<JsonObject>();
    expectTypeOf(JsonObject).toEqualTypeOf<JsonObjectType>();
  });

  test("accepts exact JSON data without changing identity", () => {
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

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(JsonValue.is(result.value)).toBe(true);
      expect(JsonValue.to(result.value)).toBe(result.value);
    }
  });

  test("provides exact top-level Array and Object Types", () => {
    const arrayValue: JsonArrayInput = [1, { nested: true }];
    const objectValue: JsonObjectInput = { value: [1, false, null] };
    const arrayResult = JsonArray.fromUnknown(arrayValue);
    const objectResult = JsonObject.fromUnknown(objectValue);

    expectOk(arrayResult, arrayValue);
    expectOk(objectResult, objectValue);
    expect(JsonArray.is(arrayResult.value)).toBe(true);
    expect(JsonObject.is(objectResult.value)).toBe(true);
    expect(JsonArray.to(arrayResult.value)).toBe(arrayValue);
    expect(JsonObject.to(objectResult.value)).toBe(objectValue);

    expect(JsonArray.fromUnknown({})).toEqual(
      err({
        type: "Array",
        reason: { kind: "NotArray", value: {} },
      }),
    );
    expect(JsonObject.fromUnknown([])).toEqual(
      err({
        type: "Record",
        reason: { kind: "NotPlainRecord", value: [] },
      }),
    );
    expect(JsonObject.fromUnknown({ value: undefined }).ok).toBe(false);
  });

  test("reports invalid leaves with their paths", () => {
    const value = {
      nested: [1, globalThis.Number.POSITIVE_INFINITY],
      missing: undefined,
    };

    expect(JsonValue.fromUnknown(value, { errors: "all" })).toEqual(
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
      expect(JsonValue.fromUnknown(invalid).ok).toBe(false);
      expect(JsonValue.is(invalid)).toBe(false);
    }
  });

  test("rejects behavioral and hidden Object properties without reading them", () => {
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

    expect(JsonValue.fromUnknown(value, { errors: "all" })).toEqual(
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
    expect(reads).toBe(0);

    expect(JsonValue.fromUnknown(value)).toEqual(
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Accessor", path: ["accessor"] }],
        },
      }),
    );
    expect(
      JsonValue.fromUnknown(
        globalThis.Object.defineProperty({}, "hidden", {
          enumerable: false,
          value: 1,
        }),
      ),
    ).toEqual(
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "NonEnumerable", path: ["hidden"] }],
        },
      }),
    );
    expect(JsonValue.fromUnknown({ [symbol]: 1 })).toEqual(
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

    expect(JsonValue.fromUnknown(new Model())).toEqual(
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "UnexpectedPrototype",
              path: [],
              container: "Object",
              value: new Model(),
            },
          ],
        },
      }),
    );
  });

  test("rejects non-data Array representations", () => {
    const sparse = globalThis.Array<JsonValueInput>(1);
    expect(JsonValue.fromUnknown(sparse)).toEqual(
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Hole", path: [0] }],
        },
      }),
    );

    let reads = 0;
    const accessor = globalThis.Array<JsonValueInput>(1);
    globalThis.Object.defineProperty(accessor, 0, {
      enumerable: true,
      get: () => {
        reads++;
        return 1;
      },
    });
    expect(JsonValue.fromUnknown(accessor)).toEqual(
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "Accessor", path: [0] }],
        },
      }),
    );
    expect(reads).toBe(0);

    const symbol = globalThis.Symbol("symbol");
    const allIssues = globalThis.Array<JsonValueInput>(3);
    globalThis.Object.defineProperties(allIssues, {
      0: { enumerable: true, get: () => 1 },
      2: { enumerable: true, value: undefined },
      metadata: { enumerable: true, value: "important" },
      [symbol]: { enumerable: true, value: "important" },
    });
    expect(JsonValue.fromUnknown(allIssues, { errors: "all" })).toEqual(
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
    expect(JsonValue.fromUnknown(excess)).toEqual(
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [{ kind: "ExcessProperty", path: ["metadata"] }],
        },
      }),
    );

    const customPrototype: ReadonlyArray<JsonValueInput> = [];
    globalThis.Object.setPrototypeOf(customPrototype, {});
    expect(JsonValue.fromUnknown(customPrototype, { errors: "all" })).toEqual(
      err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: [
            {
              kind: "UnexpectedPrototype",
              path: [],
              container: "Array",
              value: customPrototype,
            },
          ],
        },
      }),
    );
  });

  test("rejects circular references but allows shared subtrees", () => {
    const circularObject: { self?: JsonValueInput } = {};
    circularObject.self = circularObject;
    expect(JsonValue.fromUnknown(circularObject)).toEqual(
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
    expect(JsonValue.fromUnknown(circularArray)).toEqual(
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
    expect(JsonValue.fromUnknown(circularArray, { errors: "all" })).toEqual(
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
    expectOk(JsonValue.fromUnknown(value), value);
  });

  test("validates deeply nested values without recursive calls", () => {
    let value: JsonValueInput = null;

    for (let depth = 0; depth < 20_000; depth++) value = [value];

    const result = JsonValue.fromUnknown(value);
    expect(result.ok).toBe(true);
    expect(JsonValue.is(value)).toBe(true);
  });

  test("asserts circular typed values as developer errors", () => {
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

    expectAssertionError(
      () => JsonValue.to(value),
      "A JsonValue must not contain circular references.",
      error,
    );
  });

  test("formats every issue", () => {
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
          container: "Array",
          value: [],
        },
        "The value is an array, but a JsonValue Output must use this realm's Array.prototype. For a trusted return contract, cast and skip this Type; otherwise, use boundary-specific validation or transformation.",
      ],
      [
        { kind: "Accessor", path: ["value"] },
        "A JSON property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      ],
      [
        { kind: "NonEnumerable", path: ["value"] },
        "A JSON Object property must be enumerable. Remove it or use a different Type.",
      ],
      [
        { kind: "SymbolProperty", path: [globalThis.Symbol("value")] },
        "A JSON Object property key must be a string. Remove the symbol property or use a different Type.",
      ],
      [{ kind: "Hole", path: [0] }, "A JSON Array element is missing."],
      [
        { kind: "ExcessProperty", path: ["metadata"] },
        "An excess JSON Array property is not allowed. Remove it or use a different Type.",
      ],
      [
        { kind: "CircularReference", path: [0], ancestorPath: [] },
        "A JsonValue must not contain circular references.",
      ],
    ];

    for (const [issue, message] of issues) {
      expect(
        JsonValue.formatError({
          type: "JsonValue",
          reason: { kind: "Issues", issues: [issue] },
        }),
      ).toBe(message);
    }
  });
});

describe("Json", () => {
  test("proves and preserves exact valid JSON text", () => {
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

      expectOk(result, value);
      expect(result.value).toBe(value);
      expect(Json.is(result.value)).toBe(true);
    }

    expect(Json.fromUnknown("{ invalid }")).toEqual(
      err({ type: "Json", value: "{ invalid }" }),
    );
    expect(Json.fromUnknown("1e400")).toEqual(
      err({ type: "Json", value: "1e400" }),
    );
    expect(Json.fromUnknown(1)).toEqual(
      err({ type: "TypeOf", expected: "String", value: 1 }),
    );
    expect(Json.formatError({ type: "Json", value: "invalid" })).toBe(
      'The value "invalid" cannot be parsed into a JsonValue.',
    );

    expectTypeOf<typeof Json.Input>().toEqualTypeOf<string>();
    expectTypeOf<typeof Json.Output>().toEqualTypeOf<Json>();
    expectTypeOf<typeof Json.Error>().toEqualTypeOf<JsonError>();
    expect(Json.parent).toBe(String);
  });

  test("converts totally between proven text and exact data", () => {
    const json = Json.orThrow(' { "value": 1 } ');
    const value = jsonToJsonValue(json);

    expect(value).toEqual({ value: 1 });
    expect(JsonValue.is(value)).toBe(true);
    expectTypeOf(value).toEqualTypeOf<JsonValue>();

    const encoded = jsonValueToJson(value);
    expect(encoded).toBe('{"value":1}');
    expectTypeOf(encoded).toEqualTypeOf<Json>();
  });
});

describe("JsonValueFromJson", () => {
  test("decodes unknown strings and the proven Json boundary", () => {
    const fromUnknown = JsonValueFromJson.fromUnknown(
      ' { "value": [1, true, null] } ',
    );
    expectOk(fromUnknown, { value: [1, true, null] });
    expect(JsonValue.is(fromUnknown.value)).toBe(true);

    const json = Json.orThrow("1.000");
    const fromJson = JsonValueFromJson.from.parent(json);
    expectTypeOf(fromJson).toEqualTypeOf<Result<JsonValue, never>>();
    expectOk(fromJson, 1);

    const fromString = JsonValueFromJson.from.parent.parent("invalid");
    expectTypeOf(fromString).toEqualTypeOf<Result<JsonValue, JsonError>>();
    expect(fromString).toEqual(err({ type: "Json", value: "invalid" }));
  });

  test("canonically encodes JsonValue Outputs", () => {
    const value = jsonToJsonValue(Json.orThrow(' { "value": 1.000 } '));
    const values = getOrThrow(
      JsonValue.fromUnknown({
        'escaped"key': [null, true, false, "line\nbreak", 1.5],
        emptyArray: [],
        emptyObject: {},
      }),
    );

    expect(JsonValueFromJson.to(value)).toBe('{"value":1}');
    expectTypeOf(JsonValueFromJson.to(value)).toEqualTypeOf<string>();
    expect(jsonValueToJson(value)).toBe('{"value":1}');
    expect(jsonValueToJson(values)).toBe(
      '{"escaped\\"key":[null,true,false,"line\\nbreak",1.5],"emptyArray":[],"emptyObject":{}}',
    );
  });

  test("round-trips negative zero at every depth", () => {
    const negativeZero = FiniteNumber.orThrow(-0);
    const value = getOrThrow(JsonValue.fromUnknown([-0, { value: -0 }]));

    expect(jsonValueToJson(negativeZero)).toBe("-0");
    expect(JsonValueFromJson.to(negativeZero)).toBe("-0");
    expect(
      globalThis.Object.is(JsonValueFromJson.orThrow("-0"), negativeZero),
    ).toBe(true);

    const encoded = JsonValueFromJson.to(value);
    expect(encoded).toBe('[-0,{"value":-0}]');

    const decoded = JsonValueFromJson.orThrow(encoded);
    assert(globalThis.Array.isArray(decoded), "Expected Array.");
    expect(globalThis.Object.is(decoded[0], -0)).toBe(true);
    const object = decoded[1];
    assert(
      object !== null &&
        typeof object === "object" &&
        !globalThis.Array.isArray(object),
      "Expected Object.",
    );
    expect(globalThis.Object.is(object.value, -0)).toBe(true);

    const normalized = JsonValueFromJson.to(JsonValueFromJson.orThrow("-0E0"));
    expect(normalized).toBe("-0");
  });

  test("encodes deeply nested Outputs without recursive calls", () => {
    let value: JsonValue = null;

    for (let depth = 0; depth < 20_000; depth++) value = [value];

    const encoded = JsonValueFromJson.to(value);
    expect(encoded.length).toBe(40_004);

    let decoded = JsonValueFromJson.orThrow(encoded);
    let depth = 0;
    while (globalThis.Array.isArray(decoded)) {
      depth++;
      decoded = decoded[0];
    }

    expect(depth).toBe(20_000);
    expect(decoded).toBe(null);
  });
});

describe("design decisions", () => {
  describe("typed inputs", () => {
    test("protect append-only fields from incompatible component changes", () => {
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

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("compose one weaker component output", () => {
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
          expectTypeOf(todo).toEqualTypeOf<
            Result<typeof Todo.Output, MaxLengthError<100> | MinLengthError<1>>
          >();

          return todo;
        };

        return saveTodo;
      };

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });

    test("compose trim-only component outputs", () => {
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

        expectTypeOf<ReturnType<typeof saveTodo>>().toEqualTypeOf<
          Result<typeof Todo.Output, MaxLengthError<100> | MinLengthError<1>>
        >();

        return saveTodo;
      };

      expectTypeOf(compileTimeAssertions).toBeFunction();
    });
  });

  describe("assertions", () => {
    test("separates explicit decoding from exact Output membership", () => {
      const NumberFromString = setupNumberFromString();
      const Model = object({ count: NumberFromString });
      const decoded = Model.fromUnknown({ count: "1" });

      expectOk(decoded, { count: 1 });
      expect(Model.is({ count: "1" })).toBe(false);
      expect(Model.is(decoded.value)).toBe(true);
      expect(Model.to({ count: 1 })).toEqual({ count: "1" });

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

      expect(Model.fromUnknown(exotic)).toEqual(
        err({
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
        }),
      );
      expect(Model.is(exotic)).toBe(false);
      expect(() => Model.to(exotic)).toThrow(
        "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.",
      );
      expect(reads).toBe(0);
    });

    test("treat external invalidity as data and typed violations as bugs", () => {
      const Todo = object({ title: NonEmptyTrimmedString100 });

      // Invalid external data is expected and remains a typed Result error.
      expect(Todo.fromUnknown({ title: "" }).ok).toBe(false);

      const todo = {
        title: NonEmptyTrimmedString100.orThrow("Buy milk"),
      };
      const encodeTodoForStorage = (todo: typeof Todo.Output) => Todo.to(todo);

      expect(encodeTodoForStorage(todo)).toBe(todo);

      // TypeScript allows a widened object with extra properties. A developer
      // can therefore add derived data and reasonably believe it is stored.
      const todoWithSearchWords = {
        ...todo,
        titleSearchWords: todo.title.toLowerCase().split(" "),
      };
      expectTypeOf(todoWithSearchWords).toExtend<typeof Todo.Output>();

      // Evolu does not silently discard code and data that the schema cannot
      // represent. The assertion exposes the broken application contract.
      expect(() => encodeTodoForStorage(todoWithSearchWords)).toThrow(
        "An excess property is not allowed. Remove it or use a different Type.",
      );
    });
  });
});
