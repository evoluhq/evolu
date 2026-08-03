import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { testBundle } from "@evolu/nodejs/TestBundle";
import { describe, expect, test } from "vitest";

const fixturesDirectory = resolve(import.meta.dirname, "__fixtures__");
const outputDirectory = resolve(import.meta.dirname, "tmp");

const unrelatedRecordTypeFragments = [
  '"Never"',
  "not valid for type Never",
  '"Literal"',
  "strictly equal to the expected literal",
  '"Union"',
  "does not match any union member",
  '"DateIso"',
  "canonical ISO date-time string",
  '"Int64"',
  "signed 64-bit integer",
  '"UInt64"',
  "unsigned 64-bit integer",
];

const recordOnlyTypeFragments = [
  "is not a record",
  '"PropertyAccess"',
  "decode to the same key",
];

const recordTypeFragments = ['"Record"', ...recordOnlyTypeFragments];

const instanceTypeFragments = ['"InstanceOf"', "is not an instance of"];

const unrelatedTypeFragments = [
  ...unrelatedRecordTypeFragments,
  ...recordTypeFragments,
  ...instanceTypeFragments,
  "Object Output must use",
];

const objectTypeFragments = [
  '"Object"',
  "Object Output must use",
  "required property is missing",
];

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
      "Object Output must use",
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
    expected: ["A value does not match any union member.", "value"],
    excludedCodeFragments: [
      '"Never"',
      "not valid for type Never",
      "Object Output must use",
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
      "A required property is missing.",
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
      "A value null is not a record.",
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
      "required property is missing",
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
      "A required property is missing.",
      "A value 42 is not a string.",
      'The value "Other" is not strictly equal to the expected literal: Pending.',
      "An excess property is not allowed. Remove it or use a different Type.",
      "Pending",
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
      "A required property is missing.",
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
      "is not a record",
      "decode to the same key",
      ...instanceTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
    ],
  },
];

describe("Type2 tree shaking", () => {
  test("bundles only the validation and formatting code used by each Type", async () => {
    await rm(outputDirectory, { recursive: true, force: true });
    const results = await testBundle({
      cases: Object.fromEntries(
        fixtures.map((fixture) => [
          fixture.name,
          {
            entryPath: resolve(fixturesDirectory, fixture.fileName),
            verify: (value, bundle) => {
              expect(value).toEqual(fixture.expected);
              for (const fragment of fixture.excludedCodeFragments) {
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
          "vite@8.2.0": {
            "gzipSizeInBytes": 2105,
            "rawSizeInBytes": 4834,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2118,
            "rawSizeInBytes": 4895,
          },
        },
        "InstanceOf(Error)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 781,
            "rawSizeInBytes": 1529,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 780,
            "rawSizeInBytes": 1531,
          },
        },
        "NonEmptyString": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 1180,
            "rawSizeInBytes": 2462,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 1181,
            "rawSizeInBytes": 2494,
          },
        },
        "NumberFromString": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 1323,
            "rawSizeInBytes": 2894,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 1314,
            "rawSizeInBytes": 2933,
          },
        },
        "Object(NonEmptyString)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3007,
            "rawSizeInBytes": 8183,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3012,
            "rawSizeInBytes": 8265,
          },
        },
        "Object(Number, Record(String, Number))": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3637,
            "rawSizeInBytes": 10538,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3651,
            "rawSizeInBytes": 10683,
          },
        },
        "Record(String, Number)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 2231,
            "rawSizeInBytes": 5224,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2232,
            "rawSizeInBytes": 5284,
          },
        },
        "String": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 695,
            "rawSizeInBytes": 1311,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 690,
            "rawSizeInBytes": 1314,
          },
        },
        "Tuple(String, Number)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 2219,
            "rawSizeInBytes": 5134,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2208,
            "rawSizeInBytes": 5156,
          },
        },
        "Union(String, Number)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 1626,
            "rawSizeInBytes": 3567,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 1628,
            "rawSizeInBytes": 3614,
          },
        },
        "discriminatedUnion(Created, Deleted)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3774,
            "rawSizeInBytes": 11025,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3788,
            "rawSizeInBytes": 11166,
          },
        },
        "lazy(Object(Array))": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3988,
            "rawSizeInBytes": 11500,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 4010,
            "rawSizeInBytes": 11661,
          },
        },
        "typed(Pending)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3140,
            "rawSizeInBytes": 8569,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3146,
            "rawSizeInBytes": 8662,
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
              "Hodnota musí být text.",
              "Text nesmí být prázdný.",
              "Text must not be empty.",
            ]);
            for (const fragment of [
              "musí být text.",
              "musí mít délku alespoň",
              "Text must not be empty.",
              "The value must be text.",
            ]) {
              expect(bundle.code).toContain(fragment);
            }
            for (const fragment of [
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
          "vite@8.2.0": {
            "gzipSizeInBytes": 1644,
            "rawSizeInBytes": 3652,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 1659,
            "rawSizeInBytes": 3712,
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
              "A value null is not a record.",
              "Todo",
            ]);
            for (const fragment of [
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
          "vite@8.2.0": {
            "gzipSizeInBytes": 5218,
            "rawSizeInBytes": 15651,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 5254,
            "rawSizeInBytes": 15886,
          },
        },
      }
    `);
  }, 60000);
});
