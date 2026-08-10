import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { testBundle } from "@evolu/nodejs/TestBundle";
import { describe, expect, test } from "vitest";

const fixturesDirectory = resolve(import.meta.dirname, "__fixtures__");
const outputDirectory = resolve(import.meta.dirname, "tmp");

const base64CapabilityFragments = ["toBase64", "fromBase64", "base64url"];

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
  "Object Output must be a plain object",
];

const objectTypeFragments = [
  '"Object"',
  "Object Output must be a plain object",
  "required property is missing",
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
              "1",
            ]);
          },
        },
      },
      outputDirectory: resolve(outputDirectory, "RealApp"),
    });

    expect(results).toMatchInlineSnapshot(`
      {
        "real app": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 8848,
            "rawSizeInBytes": 28063,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 8901,
            "rawSizeInBytes": 28438,
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
          "vite@8.2.0": {
            "gzipSizeInBytes": 2139,
            "rawSizeInBytes": 4935,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2135,
            "rawSizeInBytes": 4971,
          },
        },
        "InstanceOf(Error)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 829,
            "rawSizeInBytes": 1619,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 822,
            "rawSizeInBytes": 1617,
          },
        },
        "NonEmptyString": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 1288,
            "rawSizeInBytes": 2690,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 1292,
            "rawSizeInBytes": 2720,
          },
        },
        "NumberFromString": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 1423,
            "rawSizeInBytes": 3109,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 1420,
            "rawSizeInBytes": 3144,
          },
        },
        "Object(NonEmptyString)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3009,
            "rawSizeInBytes": 8230,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3031,
            "rawSizeInBytes": 8319,
          },
        },
        "Object(Number, Record(String, Number))": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3670,
            "rawSizeInBytes": 10647,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3681,
            "rawSizeInBytes": 10790,
          },
        },
        "Record(String, Number)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 2269,
            "rawSizeInBytes": 5402,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2286,
            "rawSizeInBytes": 5469,
          },
        },
        "Set(String)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 2020,
            "rawSizeInBytes": 4588,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2001,
            "rawSizeInBytes": 4631,
          },
        },
        "String": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 745,
            "rawSizeInBytes": 1401,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 740,
            "rawSizeInBytes": 1400,
          },
        },
        "Tuple(String, Number)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 2212,
            "rawSizeInBytes": 5080,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2199,
            "rawSizeInBytes": 5096,
          },
        },
        "Union(String, Number)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 1724,
            "rawSizeInBytes": 3795,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 1745,
            "rawSizeInBytes": 3850,
          },
        },
        "discriminatedUnion(Created, Deleted)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3773,
            "rawSizeInBytes": 11046,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3817,
            "rawSizeInBytes": 11204,
          },
        },
        "lazy(Object(Array))": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 4127,
            "rawSizeInBytes": 11800,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 4160,
            "rawSizeInBytes": 11940,
          },
        },
        "typed(Pending)": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3150,
            "rawSizeInBytes": 8616,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3186,
            "rawSizeInBytes": 8726,
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
          "vite@8.2.0": {
            "gzipSizeInBytes": 2105,
            "rawSizeInBytes": 4953,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2133,
            "rawSizeInBytes": 5047,
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
          "vite@8.2.0": {
            "gzipSizeInBytes": 5289,
            "rawSizeInBytes": 15938,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 5352,
            "rawSizeInBytes": 16152,
          },
        },
      }
    `);
  }, 60000);
});
