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
          brotliSizeInBytes: 9214,
          rawSizeInBytes: 32434,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 9243,
          rawSizeInBytes: 32842,
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
          brotliSizeInBytes: 2227,
          rawSizeInBytes: 5731,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2229,
          rawSizeInBytes: 5772,
        },
      },
      "InstanceOf(Error)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 1038,
          rawSizeInBytes: 2326,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1031,
          rawSizeInBytes: 2329,
        },
      },
      "Map(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2260,
          rawSizeInBytes: 5693,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2284,
          rawSizeInBytes: 5745,
        },
      },
      NonEmptyString: {
        "vite@8.2.2": {
          brotliSizeInBytes: 1464,
          rawSizeInBytes: 3403,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1477,
          rawSizeInBytes: 3438,
        },
      },
      NumberFromString: {
        "vite@8.2.2": {
          brotliSizeInBytes: 1610,
          rawSizeInBytes: 3822,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1602,
          rawSizeInBytes: 3862,
        },
      },
      "Object(NonEmptyString)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3088,
          rawSizeInBytes: 9272,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3124,
          rawSizeInBytes: 9368,
        },
      },
      "Object(Number, Record(String, Number))": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3688,
          rawSizeInBytes: 11810,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3721,
          rawSizeInBytes: 11960,
        },
      },
      "Record(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2371,
          rawSizeInBytes: 6286,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2369,
          rawSizeInBytes: 6360,
        },
      },
      "Set(String)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2051,
          rawSizeInBytes: 5005,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2038,
          rawSizeInBytes: 5045,
        },
      },
      String: {
        "vite@8.2.2": {
          brotliSizeInBytes: 963,
          rawSizeInBytes: 2108,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 964,
          rawSizeInBytes: 2112,
        },
      },
      "Tuple(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 2289,
          rawSizeInBytes: 5873,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2316,
          rawSizeInBytes: 5926,
        },
      },
      "Union(String, Number)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 1853,
          rawSizeInBytes: 4567,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 1884,
          rawSizeInBytes: 4623,
        },
      },
      "discriminatedUnion(Created, Deleted)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3796,
          rawSizeInBytes: 12236,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3841,
          rawSizeInBytes: 12397,
        },
      },
      "lazy(Object(Array))": {
        "vite@8.2.2": {
          brotliSizeInBytes: 4097,
          rawSizeInBytes: 12918,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 4149,
          rawSizeInBytes: 13061,
        },
      },
      'templateLiteralParser(String, "px")': {
        "vite@8.2.2": {
          brotliSizeInBytes: 3128,
          rawSizeInBytes: 8782,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3169,
          rawSizeInBytes: 8885,
        },
      },
      "typed(Pending)": {
        "vite@8.2.2": {
          brotliSizeInBytes: 3205,
          rawSizeInBytes: 9687,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3244,
          rawSizeInBytes: 9804,
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
          brotliSizeInBytes: 2172,
          rawSizeInBytes: 5596,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 2207,
          rawSizeInBytes: 5693,
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
          brotliSizeInBytes: 5194,
          rawSizeInBytes: 17227,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 5240,
          rawSizeInBytes: 17443,
        },
      },
    });
  });
});
