import { cs } from "@evolu/common/intl";
import {
  String,
  localizeTypes,
  minLength,
  type ArrayError,
  type DiscriminatedUnionError,
  type JsonValueError,
  type ObjectError,
  type RecordError,
  type TupleError,
  type TypeOfError,
} from "../../../../../packages/common/src/Type2.ts";
import { describe, expect, expectTypeOf, test } from "vitest";

describe("Czech Type error formatters", () => {
  test("formats primitive and scalar errors", () => {
    expect(cs.formatNeverError({ type: "Never", value: 1 })).toBe(
      "Hodnota 1 není platná pro typ Never.",
    );
    expect(
      cs.formatStringError({
        type: "TypeOf",
        expected: "String",
        value: 1,
      }),
    ).toBe("Hodnota musí být text.");
    expect(
      cs.formatNumberError({
        type: "TypeOf",
        expected: "Number",
        value: null,
      }),
    ).toBe("Hodnota null musí být číslo.");
    expect(
      cs.formatBigIntError({
        type: "TypeOf",
        expected: "BigInt",
        value: null,
      }),
    ).toBe("Hodnota null musí být celé číslo typu bigint.");
    expect(
      cs.formatBooleanError({
        type: "TypeOf",
        expected: "Boolean",
        value: null,
      }),
    ).toBe("Hodnota null musí být logická hodnota.");
    expect(
      cs.formatSymbolError({
        type: "TypeOf",
        expected: "Symbol",
        value: null,
      }),
    ).toBe("Hodnota null musí být symbol.");
    expect(
      cs.formatFunctionError({
        type: "TypeOf",
        expected: "Function",
        value: null,
      }),
    ).toBe("Hodnota null musí být funkce.");
    expect(
      cs.formatInstanceOfError({
        type: "InstanceOf",
        constructorName: "Date",
        value: {},
      }),
    ).toBe("Hodnota {} musí být instancí Date.");
    expect(
      cs.formatLiteralError({ type: "Literal", expected: "yes", value: "no" }),
    ).toBe('Hodnota "no" se musí přesně rovnat očekávanému literálu yes.');
    expect(
      cs.formatUnionError({
        type: "Union",
        errors: [
          {
            index: 0,
            error: { type: "Nested" },
          },
        ],
      }),
    ).toBe("Hodnota neodpovídá žádné z povolených variant.");
    expect(cs.formatDateIsoError({ type: "DateIso", value: "invalid" })).toBe(
      'Hodnota "invalid" musí být datum a čas v kanonickém formátu ISO.',
    );
    expect(cs.formatInt64Error({ type: "Int64", value: 2n ** 63n })).toBe(
      "Hodnota 9223372036854775808 musí být platné 64bitové celé číslo se znaménkem (Int64).",
    );
    expect(cs.formatUInt64Error({ type: "UInt64", value: -1n })).toBe(
      "Hodnota -1 musí být platné 64bitové celé číslo bez znaménka (UInt64).",
    );
    expect(
      cs.formatCapitalizedError({ type: "Capitalized", value: "evolu" }),
    ).toBe('Text "evolu" musí začínat velkým písmenem.');
    expect(cs.formatTrimmedError({ type: "Trimmed", value: " Evolu " })).toBe(
      'Text " Evolu " nesmí obsahovat bílé znaky na začátku ani na konci.',
    );
    expect(
      cs.formatRegexError({
        type: "Code",
        value: "x",
        source: "^[0-9]+$",
        flags: "u",
      }),
    ).toBe('Hodnota "x" neodpovídá regulárnímu výrazu /^[0-9]+$/u.');
  });

  test("formats reusable length errors", () => {
    expect(
      cs.formatMinLengthError({ type: "MinLength1", value: "", min: 1 }),
    ).toBe("Text nesmí být prázdný.");
    expect(
      cs.formatMinLengthError({ type: "MinLength2", value: [1], min: 2 }),
    ).toBe("Hodnota [1] musí mít délku alespoň 2.");
    expect(
      cs.formatMaxLengthError({
        type: "MaxLength2",
        value: "abc",
        max: 2,
      }),
    ).toBe('Hodnota "abc" smí mít délku nejvýše 2.');
    expect(
      cs.formatLengthError({ type: "Length2", value: "a", exact: 2 }),
    ).toBe('Hodnota "a" musí mít délku přesně 2.');
  });

  test("formats reusable numeric errors", () => {
    expect(cs.formatNonNegativeError({ type: "NonNegative", value: -1 })).toBe(
      "Hodnota -1 musí být nezáporná (>= 0).",
    );
    expect(cs.formatPositiveError({ type: "Positive", value: 0 })).toBe(
      "Hodnota 0 musí být kladná (> 0).",
    );
    expect(
      cs.formatPositiveDecimalStringError({
        type: "PositiveDecimalString",
        value: "0.30",
      }),
    ).toBe(
      'Hodnota "0.30" musí být kanonický řetězec představující kladné desetinné číslo.',
    );
    expect(cs.formatNonPositiveError({ type: "NonPositive", value: 1 })).toBe(
      "Hodnota 1 musí být nekladná (<= 0).",
    );
    expect(cs.formatNegativeError({ type: "Negative", value: 0 })).toBe(
      "Hodnota 0 musí být záporná (< 0).",
    );
    expect(cs.formatIntError({ type: "Int", value: 1.5 })).toBe(
      "Hodnota 1.5 musí být bezpečné celé číslo.",
    );
    expect(
      cs.formatGreaterThanError({ type: "GreaterThan1", value: 1, min: 1 }),
    ).toBe("Hodnota 1 musí být větší než 1.");
    expect(
      cs.formatGreaterThanOrEqualToError({
        type: "GreaterThanOrEqualTo1",
        value: 0,
        min: 1,
      }),
    ).toBe("Hodnota 0 musí být větší nebo rovna 1.");
    expect(
      cs.formatLessThanError({ type: "LessThan1", value: 1, max: 1 }),
    ).toBe("Hodnota 1 musí být menší než 1.");
    expect(
      cs.formatLessThanOrEqualToError({
        type: "LessThanOrEqualTo1",
        value: 2,
        max: 1,
      }),
    ).toBe("Hodnota 2 musí být menší nebo rovna 1.");
    expect(cs.formatNonNaNError({ type: "NonNaN", value: Number.NaN })).toBe(
      "Hodnota nesmí být NaN.",
    );
    expect(
      cs.formatFiniteError({ type: "Finite", value: Number.POSITIVE_INFINITY }),
    ).toBe("Hodnota Infinity musí být konečné číslo.");
    expect(
      cs.formatMultipleOfError({
        type: "MultipleOf3",
        value: 4,
        divisor: "3",
      }),
    ).toBe("Hodnota 4 musí být násobkem čísla 3.");
    expect(
      cs.formatBetweenError({
        type: "Between1-3",
        value: 4,
        min: 1,
        max: 3,
      }),
    ).toBe("Hodnota 4 musí být v rozsahu od 1 do 3 včetně.");
  });

  test("formats every Array structural issue", () => {
    const errors: ReadonlyArray<readonly [ArrayError, string]> = [
      [
        { type: "Array", reason: { kind: "NotArray", value: null } },
        "Hodnota null není pole.",
      ],
      [
        { type: "Array", reason: { kind: "UnexpectedPrototype", value: [] } },
        "Output typu Array",
      ],
      [
        {
          type: "Array",
          reason: { kind: "Items", issues: [{ kind: "Hole", index: 1 }] },
        },
        "V poli chybí prvek na indexu 1.",
      ],
      [
        {
          type: "Array",
          reason: { kind: "Items", issues: [{ kind: "Accessor", index: 1 }] },
        },
        "Prvek pole na indexu 1 musí být datová vlastnost.",
      ],
      [
        {
          type: "Array",
          reason: {
            kind: "Items",
            issues: [{ kind: "ExcessProperty", key: "metadata" }],
          },
        },
        "Pole obsahuje nepovolenou vlastní vlastnost.",
      ],
      [
        {
          type: "Array",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: { type: "Nested" },
              },
            ],
          },
        },
        "Prvek pole na indexu 1 není platný.",
      ],
    ];

    for (const [error, message] of errors) {
      expect(cs.formatArrayError(error)).toContain(message);
    }
  });

  test("formats every Tuple structural issue", () => {
    const errors: ReadonlyArray<readonly [TupleError, string]> = [
      [
        { type: "Tuple", reason: { kind: "NotArray", value: null } },
        "Hodnota null není tuple.",
      ],
      [
        { type: "Tuple", reason: { kind: "UnexpectedPrototype", value: [] } },
        "Output typu Tuple",
      ],
      [
        {
          type: "Tuple",
          reason: { kind: "InvalidLength", expected: 2, actual: 1 },
        },
        "Požadovaná délka Tuple je 2, ale hodnota má délku 1.",
      ],
      [
        {
          type: "Tuple",
          reason: { kind: "Items", issues: [{ kind: "Hole", index: 1 }] },
        },
        "V Tuple chybí prvek na indexu 1.",
      ],
      [
        {
          type: "Tuple",
          reason: { kind: "Items", issues: [{ kind: "Accessor", index: 1 }] },
        },
        "Prvek Tuple na indexu 1 musí být datová vlastnost.",
      ],
      [
        {
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [{ kind: "ExcessProperty", key: "metadata" }],
          },
        },
        "Tuple obsahuje nepovolenou vlastní vlastnost.",
      ],
      [
        {
          type: "Tuple",
          reason: {
            kind: "Items",
            issues: [
              {
                kind: "Element",
                index: 1,
                error: { type: "Nested" },
              },
            ],
          },
        },
        "Prvek Tuple na indexu 1 není platný.",
      ],
    ];

    for (const [error, message] of errors) {
      expect(cs.formatTupleError(error)).toContain(message);
    }
  });

  test("formats every Record structural issue", () => {
    const errors: ReadonlyArray<readonly [RecordError, string]> = [
      [
        { type: "Record", reason: { kind: "NotRecord", value: null } },
        "Hodnota null není Record.",
      ],
      [
        {
          type: "Record",
          reason: { kind: "NotPlainRecord", value: new Map() },
        },
        "Output typu Record",
      ],
      [
        {
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Key",
                key: "x",
                error: { type: "Nested" },
              },
            ],
          },
        },
        'Klíč vlastnosti "x" není platný.',
      ],
      [
        {
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              {
                kind: "Value",
                key: "x",
                error: { type: "Nested" },
              },
            ],
          },
        },
        'Hodnota vlastnosti "x" není platná.',
      ],
      [
        {
          type: "Record",
          reason: { kind: "Entries", issues: [{ kind: "Accessor", key: "x" }] },
        },
        'Vlastnost Record "x" musí být datová vlastnost.',
      ],
      [
        {
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [{ kind: "NonEnumerable", key: "x" }],
          },
        },
        'Vlastnost Record "x" musí být enumerable.',
      ],
      [
        {
          type: "Record",
          reason: {
            kind: "Entries",
            issues: [
              { kind: "Collision", previousKey: "a", key: "A", outputKey: "a" },
            ],
          },
        },
        'Klíče Record "a" a "A" se dekódují na stejný klíč "a".',
      ],
    ];

    for (const [error, message] of errors) {
      expect(cs.formatRecordError(error)).toContain(message);
    }
  });

  test("formats Object structural issues", () => {
    const symbol = globalThis.Symbol("extra");
    const errors: ReadonlyArray<readonly [ObjectError, string]> = [
      [
        { type: "Object", reason: { kind: "NotObject", value: null } },
        "Hodnota null není objekt.",
      ],
      [
        {
          type: "Object",
          reason: { kind: "UnexpectedPrototype", value: new Map() },
        },
        "Output typu Object",
      ],
      [
        {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: { type: "ObjectPropertyAccess", reason: "Accessor" },
            },
          },
        },
        "musí být datová vlastnost",
      ],
      [
        {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: { type: "ObjectPropertyAccess", reason: "NonEnumerable" },
            },
          },
        },
        "musí být enumerable",
      ],
      [
        {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { value: { type: "ObjectMissingProperty" } },
          },
        },
        'Povinná vlastnost "value" chybí.',
      ],
      [
        {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: { value: { type: "ObjectExcessProperty" } },
          },
        },
        'Vlastnost "value" není povolena.',
      ],
      [
        {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              [symbol]: { type: "TypeOf" },
            },
          },
        },
        "Klíč vlastnosti Object musí být text.",
      ],
      [
        {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              value: { type: "Nested" },
            },
          },
        },
        'Vlastnost "value" není platná.',
      ],
    ];

    for (const [error, message] of errors) {
      expect(cs.formatObjectError(error)).toContain(message);
    }
  });

  test("formats DiscriminatedUnion routing issues", () => {
    const errors: ReadonlyArray<readonly [DiscriminatedUnionError, string]> = [
      [
        {
          type: "DiscriminatedUnion",
          reason: {
            kind: "Object",
            error: {
              type: "Object",
              reason: { kind: "NotObject", value: null },
            },
          },
        },
        "Hodnota null není objekt.",
      ],
      [
        {
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "Accessor",
          },
        },
        "musí být datová vlastnost",
      ],
      [
        {
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "Inherited",
          },
        },
        "musí být vlastní vlastnost",
      ],
      [
        {
          type: "DiscriminatedUnion",
          reason: {
            kind: "PropertyAccess",
            key: "type",
            reason: "NonEnumerable",
          },
        },
        "musí být enumerable",
      ],
      [
        {
          type: "DiscriminatedUnion",
          reason: {
            kind: "Discriminator",
            key: "type",
            value: "Unknown",
            expected: ["Created"],
          },
        },
        "má neočekávanou hodnotu",
      ],
      [
        {
          type: "DiscriminatedUnion",
          reason: {
            kind: "Member",
            discriminator: "Created",
            error: { type: "Nested" },
          },
        },
        'Vybraná varianta "Created" není platná.',
      ],
    ];

    for (const [error, message] of errors) {
      expect(cs.formatDiscriminatedUnionError(error)).toContain(message);
    }
  });

  test("formats every JsonValue issue", () => {
    const issues: ReadonlyArray<
      readonly [JsonValueError["reason"]["issues"][number], string]
    > = [
      [
        { kind: "InvalidType", path: [], value: undefined },
        "Hodnota undefined není JSON hodnota.",
      ],
      [
        { kind: "NonFiniteNumber", path: [], value: Number.NaN },
        "Číslo v JSON musí být konečné.",
      ],
      [
        {
          kind: "UnexpectedPrototype",
          path: [],
          container: "Array",
          value: [],
        },
        "Output typu JsonValue musí používat Array.prototype",
      ],
      [
        {
          kind: "UnexpectedPrototype",
          path: [],
          container: "Object",
          value: {},
        },
        "Object.prototype z tohoto JavaScriptového realmu nebo null",
      ],
      [
        { kind: "Accessor", path: ["value"] },
        "Vlastnost JSON musí být datová vlastnost.",
      ],
      [
        { kind: "NonEnumerable", path: ["value"] },
        "Vlastnost JSON Object musí být enumerable.",
      ],
      [
        { kind: "SymbolProperty", path: [globalThis.Symbol("value")] },
        "Klíč vlastnosti JSON Object musí být text.",
      ],
      [{ kind: "Hole", path: [0] }, "V JSON Array chybí prvek."],
      [
        { kind: "ExcessProperty", path: ["metadata"] },
        "JSON Array obsahuje nepovolenou vlastní vlastnost.",
      ],
      [
        { kind: "CircularReference", path: ["self"], ancestorPath: [] },
        "JsonValue nesmí obsahovat cyklické reference.",
      ],
    ];

    for (const [issue, message] of issues) {
      expect(
        cs.formatJsonValueError({
          type: "JsonValue",
          reason: { kind: "Issues", issues: [issue] },
        }),
      ).toContain(message);
    }
    expect(cs.formatJsonError({ type: "Json", value: "invalid" })).toBe(
      'Hodnotu "invalid" nelze převést na JsonValue.',
    );
  });

  test("localizes selected Types without a shared runtime dictionary", () => {
    const Label = minLength(1)(String);
    const Types = localizeTypes(
      { Label },
      {
        cs: {
          MinLength1: cs.formatMinLengthError,
          String: cs.formatStringError,
        },
      },
    ).cs;

    expectTypeOf(Types.Label).toEqualTypeOf(Label);

    const invalidType = Types.Label.fromUnknown(1);
    expect(invalidType.ok).toBe(false);
    if (!invalidType.ok) {
      expect(Types.Label.formatError(invalidType.error)).toBe(
        "Hodnota musí být text.",
      );
    }

    const invalidLength = Types.Label.fromUnknown("");
    expect(invalidLength.ok).toBe(false);
    if (!invalidLength.ok) {
      expect(Types.Label.formatError(invalidLength.error)).toBe(
        "Text nesmí být prázdný.",
      );
    }
  });

  test("keeps formatter parameter types exact", () => {
    expectTypeOf(cs.formatStringError)
      .parameter(0)
      .toEqualTypeOf<TypeOfError<"String">>();
  });
});
