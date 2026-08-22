import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { testBundle } from "@evolu/nodejs/TestBundle";
import { describe, expect, test } from "vitest";

const fixturesDirectory = resolve(import.meta.dirname, "__fixtures__");
const outputDirectory = resolve(import.meta.dirname, "tmp/Type");

const base64CapabilityFragments = ["toBase64", "fromBase64", "base64url"];

const unrelatedRecordTypeFragments = [
  '"Never"',
  "not valid for type Never",
  '"Literal"',
  "strictly equal to the expected literal",
  '"Union"',
  "does not match any allowed variant",
  '"DateIso"',
  "canonical ISO date-time string",
  '"Int64"',
  "signed 64-bit integer",
  '"UInt64"',
  "unsigned 64-bit integer",
];

const recordOnlyTypeFragments = [
  "is not a Record",
  '"PropertyAccess"',
  "decode to the same key",
];

const recordTypeFragments = ['"Record"', ...recordOnlyTypeFragments];

const instanceTypeFragments = ['"InstanceOf"', "is not an instance of"];

const unrelatedTypeFragments = [
  ...unrelatedRecordTypeFragments,
  ...recordTypeFragments,
  ...instanceTypeFragments,
  "Object Output must be a plain object",
];

const objectTypeFragments = [
  '"Object"',
  "Object Output must be a plain object",
  "The required property",
];

const setTypeFragments = [
  '"Set"',
  "is not a Set",
  "Set Output must be a direct Set",
  "excess Set property",
];

// Bundle-size policy: realistic aggregate fixtures are the primary optimization
// target because applications compose many Types and can benefit from shared
// runtime code. The isolated fixtures below are regression guardrails for
// accidentally retaining unrelated validators, formatters, or dependencies;
// small changes in those snapshots do not decide a refactoring by themselves.

const fixtures: ReadonlyArray<{
  readonly name: string;
  readonly fileName: string;
  readonly expected: unknown;
  readonly excludedCodeFragments: ReadonlyArray<string>;
}> = [
  {
    name: "InstanceOf(Error)",
    fileName: "ErrorInstance.ts",
    expected: [true, false, "A value {} is not an instance of Error."],
    excludedCodeFragments: [
      ...unrelatedRecordTypeFragments,
      ...recordTypeFragments,
      "Object Output must be a plain object",
      '"Array"',
      "is not an array",
      ...objectTypeFragments,
    ],
  },
  {
    name: "String",
    fileName: "String.ts",
    expected: "A value 42 is not a string.",
    excludedCodeFragments: [
      ...unrelatedTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
      "getOrThrow",
      ...objectTypeFragments,
    ],
  },
  {
    name: "NonEmptyString",
    fileName: "NonEmptyString.ts",
    expected: ["A value 42 is not a string.", "Enter some text."],
    excludedCodeFragments: [
      ...unrelatedTypeFragments,
      '"Array"',
      "is not an array",
      ...objectTypeFragments,
    ],
  },
  {
    name: "NumberFromString",
    fileName: "NumberFromString.ts",
    expected: [42, "42", "Enter a number.", "1.5"],
    excludedCodeFragments: [
      ...unrelatedTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
      ...objectTypeFragments,
    ],
  },
  {
    name: "Array(String)",
    fileName: "StringArray.ts",
    expected: ["A value null is not an array.", "A value 42 is not a string."],
    excludedCodeFragments: [
      ...unrelatedTypeFragments,
      '"NonEmptyString"',
      "Enter some text",
      ...setTypeFragments,
      ...objectTypeFragments,
    ],
  },
  {
    name: "Set(String)",
    fileName: "StringSet.ts",
    expected: ["A value null is not a Set.", "A value 42 is not a string."],
    excludedCodeFragments: [
      ...unrelatedTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
      ...objectTypeFragments,
    ],
  },
  {
    name: "Tuple(String, Number)",
    fileName: "StringNumberTuple.ts",
    expected: [
      "A value null is not a tuple.",
      "A value 42 is not a string.",
      'A value "1" is not a number.',
      "count:1",
    ],
    excludedCodeFragments: [
      ...unrelatedTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
      ...objectTypeFragments,
    ],
  },
  {
    name: 'templateLiteralParser(String, "px")',
    fileName: "StringPixelsTemplateLiteral.ts",
    expected: [
      "10",
      "10px",
      'The value "10em" does not match the template literal.',
    ],
    excludedCodeFragments: [
      "not valid for type Never",
      "canonical ISO date-time string",
      "signed 64-bit integer",
      "unsigned 64-bit integer",
      ...recordTypeFragments,
      ...instanceTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
      ...setTypeFragments,
      ...objectTypeFragments,
    ],
  },
  {
    name: "lazy(Object(Array))",
    fileName: "LazyStringTree.ts",
    expected: ["leaf", "A value 42 is not a string.", true],
    excludedCodeFragments: [
      ...unrelatedRecordTypeFragments,
      ...recordOnlyTypeFragments,
      ...instanceTypeFragments,
      '"NonEmptyString"',
      "Enter some text",
    ],
  },
  {
    name: "Union(String, Number)",
    fileName: "StringOrNumber.ts",
    expected: ["A value does not match any allowed variant.", "value"],
    excludedCodeFragments: [
      '"Never"',
      "not valid for type Never",
      "Object Output must be a plain object",
      '"DateIso"',
      "canonical ISO date-time string",
      '"Int64"',
      "signed 64-bit integer",
      '"UInt64"',
      "unsigned 64-bit integer",
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
      ...objectTypeFragments,
      ...recordTypeFragments,
      ...instanceTypeFragments,
    ],
  },
  {
    name: "Object(NonEmptyString)",
    fileName: "NonEmptyStringObject.ts",
    expected: [
      "A value null is not an object.",
      'The required property "value" is missing.',
      "A value 42 is not a string.",
      "Enter some text.",
    ],
    excludedCodeFragments: [
      ...unrelatedRecordTypeFragments,
      ...recordOnlyTypeFragments,
      ...instanceTypeFragments,
      '"Array"',
      "is not an array",
    ],
  },
  {
    name: "Record(String, Number)",
    fileName: "StringNumberRecord.ts",
    expected: [
      "A value null is not a Record.",
      'A value "x" is not a number.',
      42,
      true,
    ],
    excludedCodeFragments: [
      ...unrelatedRecordTypeFragments,
      ...instanceTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
      "The required property",
    ],
  },
  {
    name: "Object(Number, Record(String, Number))",
    fileName: "StringNumberObjectRecord.ts",
    expected: [
      "A value null is not an object.",
      'A value "x" is not a number.',
      42,
      true,
    ],
    excludedCodeFragments: [
      ...unrelatedRecordTypeFragments,
      ...instanceTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
    ],
  },
  {
    name: "typed(Pending)",
    fileName: "TypedPending.ts",
    expected: [
      "A value null is not an object.",
      'The required property "type" is missing.',
      "A value 42 is not a string.",
      'The value "Other" is not strictly equal to the expected literal: Pending.',
      'The property "extra" is not allowed. Remove it or use a different Type.',
      "Pending",
    ],
    excludedCodeFragments: [
      '"Never"',
      "not valid for type Never",
      '"Union"',
      "does not match any allowed variant",
      '"DateIso"',
      "canonical ISO date-time string",
      '"Int64"',
      "signed 64-bit integer",
      '"UInt64"',
      "unsigned 64-bit integer",
      ...recordOnlyTypeFragments,
      ...instanceTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
    ],
  },
  {
    name: "discriminatedUnion(Created, Deleted)",
    fileName: "DiscriminatedEvent.ts",
    expected: [
      "A value null is not an object.",
      'The discriminator property "type" has an unexpected value "Other".',
      'The required property "value" is missing.',
      "Created",
      "Deleted",
    ],
    excludedCodeFragments: [
      '"Never"',
      "not valid for type Never",
      '"Union"',
      "does not match any union member",
      '"DateIso"',
      "canonical ISO date-time string",
      '"Int64"',
      "signed 64-bit integer",
      '"UInt64"',
      "unsigned 64-bit integer",
      "is not a Record",
      "decode to the same key",
      ...instanceTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
    ],
  },
];

describe("Type tree shaking", () => {
  test("bundles a realistic app using common Types", async () => {
    await rm(outputDirectory, { recursive: true, force: true });
    const results = await testBundle({
      cases: {
        "real app": {
          entryPath: resolve(fixturesDirectory, "RealApp.ts"),
          verify: (value) => {
            expect(value).toEqual([
              "A value null is not an object.",
              'The value "" does not meet the minimum length of 1.',
              "User",
              '{"theme":"System","compact":true,"shortcuts":[]}',
              "System",
              "cursor:1",
            ]);
          },
        },
      },
      outputDirectory: resolve(outputDirectory, "RealApp"),
    });

    expect(results).toMatchInlineSnapshot(`
      {
        "real app": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 8959,
            "rawSizeInBytes": 31712,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 8965,
            "rawSizeInBytes": 32115,
          },
        },
      }
    `);
  }, 60000);

  test("bundles only the validation and formatting code used by each Type", async () => {
    const results = await testBundle({
      cases: Object.fromEntries(
        fixtures.map((fixture) => [
          fixture.name,
          {
            entryPath: resolve(fixturesDirectory, fixture.fileName),
            verify: (value, bundle) => {
              expect(value).toEqual(fixture.expected);
              for (const fragment of [
                ...base64CapabilityFragments,
                ...fixture.excludedCodeFragments,
              ]) {
                expect(bundle.code).not.toContain(fragment);
              }
            },
          },
        ]),
      ),
      outputDirectory,
    });

    expect(results).toMatchInlineSnapshot(`
      {
        "Array(String)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 1956,
            "rawSizeInBytes": 5024,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 1945,
            "rawSizeInBytes": 5060,
          },
        },
        "InstanceOf(Error)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 736,
            "rawSizeInBytes": 1619,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 736,
            "rawSizeInBytes": 1617,
          },
        },
        "NonEmptyString": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 1168,
            "rawSizeInBytes": 2696,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 1186,
            "rawSizeInBytes": 2726,
          },
        },
        "NumberFromString": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 1298,
            "rawSizeInBytes": 3115,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 1296,
            "rawSizeInBytes": 3150,
          },
        },
        "Object(NonEmptyString)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 2785,
            "rawSizeInBytes": 8461,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2826,
            "rawSizeInBytes": 8550,
          },
        },
        "Object(Number, Record(String, Number))": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 3391,
            "rawSizeInBytes": 10999,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 3405,
            "rawSizeInBytes": 11142,
          },
        },
        "Record(String, Number)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 2076,
            "rawSizeInBytes": 5529,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2078,
            "rawSizeInBytes": 5596,
          },
        },
        "Set(String)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 1893,
            "rawSizeInBytes": 4721,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 1874,
            "rawSizeInBytes": 4766,
          },
        },
        "String": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 653,
            "rawSizeInBytes": 1401,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 656,
            "rawSizeInBytes": 1400,
          },
        },
        "Tuple(String, Number)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 2013,
            "rawSizeInBytes": 5166,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2012,
            "rawSizeInBytes": 5214,
          },
        },
        "Union(String, Number)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 1569,
            "rawSizeInBytes": 3838,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 1612,
            "rawSizeInBytes": 3891,
          },
        },
        "discriminatedUnion(Created, Deleted)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 3510,
            "rawSizeInBytes": 11423,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 3548,
            "rawSizeInBytes": 11579,
          },
        },
        "lazy(Object(Array))": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 3784,
            "rawSizeInBytes": 12116,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 3840,
            "rawSizeInBytes": 12254,
          },
        },
        "templateLiteralParser(String, "px")": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 2847,
            "rawSizeInBytes": 8137,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2892,
            "rawSizeInBytes": 8243,
          },
        },
        "typed(Pending)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 2914,
            "rawSizeInBytes": 8876,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2957,
            "rawSizeInBytes": 8986,
          },
        },
      }
    `);
  }, 60000);

  test("bundles every selected locale and no unrelated Type formatter", async () => {
    const results = await testBundle({
      cases: {
        "localizeTypes(Label)": {
          entryPath: resolve(fixturesDirectory, "LocalizedTypes.ts"),
          verify: (value, bundle) => {
            expect(value).toEqual([
              "Hodnota 42 musí být text.",
              "Text nesmí být prázdný.",
              "Text must not be empty.",
            ]);
            for (const fragment of [
              "musí mít délku alespoň",
              "Text must not be empty.",
              "The value must be text.",
            ]) {
              expect(bundle.code).toContain(fragment);
            }
            for (const fragment of [
              ...base64CapabilityFragments,
              ...unrelatedTypeFragments,
              '"Array"',
              "is not an array",
              '"NonEmptyString"',
              "Enter some text",
              "musí být číslo",
              "neodpovídá regulárnímu výrazu",
              ...objectTypeFragments,
            ]) {
              expect(bundle.code).not.toContain(fragment);
            }
          },
        },
      },
      outputDirectory: resolve(outputDirectory, "localizeTypes"),
    });

    expect(results).toMatchInlineSnapshot(`
      {
        "localizeTypes(Label)": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 1916,
            "rawSizeInBytes": 4993,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 1949,
            "rawSizeInBytes": 5096,
          },
        },
      }
    `);
  }, 60000);

  test("bundles a realistic Todo list schema", async () => {
    const results = await testBundle({
      cases: {
        "typed Todo list": {
          entryPath: resolve(fixturesDirectory, "TodoList.ts"),
          verify: (value, bundle) => {
            expect(value).toEqual([
              "A value null is not an array.",
              'The value "" does not meet the minimum length of 1.',
              "A value null is not a Record.",
              "Todo",
            ]);
            for (const fragment of [
              ...base64CapabilityFragments,
              '"Never"',
              "not valid for type Never",
              '"DateIso"',
              "canonical ISO date-time string",
              '"Int64"',
              "signed 64-bit integer",
              '"UInt64"',
              "unsigned 64-bit integer",
              ...instanceTypeFragments,
            ]) {
              expect(bundle.code).not.toContain(fragment);
            }
          },
        },
      },
      outputDirectory: resolve(outputDirectory, "TodoList"),
    });

    expect(results).toMatchInlineSnapshot(`
      {
        "typed Todo list": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 4876,
            "rawSizeInBytes": 16413,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 4933,
            "rawSizeInBytes": 16622,
          },
        },
      }
    `);
  }, 60000);
});
