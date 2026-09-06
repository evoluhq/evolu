import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertTrue,
} from "../../../packages/common/src/Assert.ts";
import { installPolyfills } from "../../../packages/common/src/Polyfills.ts";
import { testBundle } from "@evolu/nodejs/TestBundle";

installPolyfills();

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

const mapTypeFragments = [
  '"Map"',
  "is not a Map",
  "excess Map property",
  "Map keys at indexes",
];

const unrelatedTypeFragments = [
  ...unrelatedRecordTypeFragments,
  ...recordTypeFragments,
  ...instanceTypeFragments,
  ...mapTypeFragments,
  "Object Output must be a plain object",
];

const objectTypeFragments = [
  '"Object"',
  "Object Output must be a plain object",
  "The required property",
];

const setTypeFragments = ['"Set"', "is not a Set", "excess Set property"];

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
      ...mapTypeFragments,
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
    name: "Map(String, Number)",
    fileName: "StringNumberMap.ts",
    expected: [
      "A value null is not a Map.",
      'A value "x" is not a number.',
      42,
      true,
    ],
    excludedCodeFragments: [
      ...unrelatedRecordTypeFragments,
      '"Record"',
      "is not a Record",
      '"PropertyAccess"',
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
      ...mapTypeFragments,
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
      ...mapTypeFragments,
      '"NonEmptyString"',
      "Enter some text",
    ],
  },
  {
    name: "Union(String, Number)",
    fileName: "StringOrNumber.ts",
    expected: [
      "A value does not match any allowed variant.\n- 0: String: A value true is not a string.",
      "value",
    ],
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
      ...mapTypeFragments,
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
      ...mapTypeFragments,
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
      ...mapTypeFragments,
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
      ...mapTypeFragments,
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
      ...mapTypeFragments,
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
      ...mapTypeFragments,
      '"Array"',
      "is not an array",
      '"NonEmptyString"',
      "Enter some text",
    ],
  },
];

describe("Type tree shaking", { timeout: 60_000 }, () => {
  it("bundles a realistic app using common Types", async () => {
    await rm(outputDirectory, { recursive: true, force: true });
    const results = await testBundle({
      cases: {
        "real app": {
          entryPath: resolve(fixturesDirectory, "RealApp.ts"),
          verify: (value) => {
            assertEqual(value, [
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

    assertEqual(results, {
      "real app": {
        "vite@8.2.2": {
          brotliSizeInBytes: 9407,
          rawSizeInBytes: 32989,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 9460,
          rawSizeInBytes: 33428,
        },
      },
    });
  });

  it("bundles only the validation and formatting code used by each Type", async () => {
    const results = await testBundle({
      cases: Object.fromEntries(
        fixtures.map((fixture) => [
          fixture.name,
          {
            entryPath: resolve(fixturesDirectory, fixture.fileName),
            verify: (value, bundle) => {
              assertEqual(value, fixture.expected);
              for (const fragment of [
                ...base64CapabilityFragments,
                "A preserved default must equal",
                "withDefault value must be",
                ...fixture.excludedCodeFragments,
              ]) {
                assertFalse(bundle.code.includes(fragment));
              }
            },
          },
        ]),
      ),
      outputDirectory,
    });

    assertEqual(results, {
      "Array(String)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2344,
          rawSizeInBytes: 5995,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2347,
          rawSizeInBytes: 6063,
        },
      },
      "InstanceOf(Error)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 1160,
          rawSizeInBytes: 2554,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1151,
          rawSizeInBytes: 2586,
        },
      },
      "Map(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2366,
          rawSizeInBytes: 5935,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2389,
          rawSizeInBytes: 6014,
        },
      },
      NonEmptyString: {
        "vite@8.2.2": {
          brotliSizeInBytes: 1582,
          rawSizeInBytes: 3667,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1599,
          rawSizeInBytes: 3729,
        },
      },
      NumberFromString: {
        "vite@8.2.2": {
          brotliSizeInBytes: 1708,
          rawSizeInBytes: 4075,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1732,
          rawSizeInBytes: 4142,
        },
      },
      "Object(NonEmptyString)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3233,
          rawSizeInBytes: 9664,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3297,
          rawSizeInBytes: 9792,
        },
      },
      "Object(Number, Record(String, Number))": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3855,
          rawSizeInBytes: 12204,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3889,
          rawSizeInBytes: 12383,
        },
      },
      "Record(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2486,
          rawSizeInBytes: 6550,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2484,
          rawSizeInBytes: 6651,
        },
      },
      "Set(String)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2153,
          rawSizeInBytes: 5247,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2152,
          rawSizeInBytes: 5314,
        },
      },
      String: {
        "vite@8.2.2": {
          brotliSizeInBytes: 1084,
          rawSizeInBytes: 2360,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1075,
          rawSizeInBytes: 2391,
        },
      },
      "Tuple(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2400,
          rawSizeInBytes: 6137,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2425,
          rawSizeInBytes: 6217,
        },
      },
      "Union(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2019,
          rawSizeInBytes: 4969,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2036,
          rawSizeInBytes: 5054,
        },
      },
      "discriminatedUnion(Created, Deleted)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3961,
          rawSizeInBytes: 12634,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 4012,
          rawSizeInBytes: 12818,
        },
      },
      "lazy(Object(Array))": {
        "vite@8.2.2": {
          brotliSizeInBytes: 4246,
          rawSizeInBytes: 13316,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 4314,
          rawSizeInBytes: 13487,
        },
      },
      'templateLiteralParser(String, "px")': {
        "vite@8.2.2": {
          brotliSizeInBytes: 3239,
          rawSizeInBytes: 9046,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3293,
          rawSizeInBytes: 9176,
        },
      },
      "typed(Pending)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3376,
          rawSizeInBytes: 10085,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3419,
          rawSizeInBytes: 10225,
        },
      },
    });
  });

  it("bundles every selected locale and no unrelated Type formatter", async () => {
    const results = await testBundle({
      cases: {
        "localizeTypes(Label)": {
          entryPath: resolve(fixturesDirectory, "LocalizedTypes.ts"),
          verify: (value, bundle) => {
            assertEqual(value, [
              "Hodnota 42 musí být text.",
              "Text nesmí být prázdný.",
              "Text must not be empty.",
            ]);
            for (const fragment of [
              "musí mít délku alespoň",
              "Text must not be empty.",
              "The value must be text.",
            ]) {
              assertTrue(bundle.code.includes(fragment));
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
              assertFalse(bundle.code.includes(fragment));
            }
          },
        },
      },
      outputDirectory: resolve(outputDirectory, "localizeTypes"),
    });

    assertEqual(results, {
      "localizeTypes(Label)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2348,
          rawSizeInBytes: 6057,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2368,
          rawSizeInBytes: 6186,
        },
      },
    });
  });

  it("bundles a realistic Todo list schema", async () => {
    const results = await testBundle({
      cases: {
        "typed Todo list": {
          entryPath: resolve(fixturesDirectory, "TodoList.ts"),
          verify: (value, bundle) => {
            assertEqual(value, [
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
              assertFalse(bundle.code.includes(fragment));
            }
          },
        },
      },
      outputDirectory: resolve(outputDirectory, "TodoList"),
    });

    assertEqual(results, {
      "typed Todo list": {
        "vite@8.2.2": {
          brotliSizeInBytes: 5398,
          rawSizeInBytes: 17768,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 5444,
          rawSizeInBytes: 18016,
        },
      },
    });
  });
});
