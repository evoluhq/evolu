import { compress, init } from "@bokuweb/zstd-wasm";
import { expectOk } from "@evolu/vitest";
import * as fc from "fast-check";
import { assert, beforeAll, describe, expect, it, test } from "vitest";
import { createBuffer } from "../../../../../packages/common/src/Buffer.ts";
import {
  constFalse,
  constTrue,
} from "../../../../../packages/common/src/Function.ts";
import type {
  NonEmptyReadonlyArray,
  RunDefaultDeps,
} from "../../../../../packages/common/src/index.ts";
import {
  assertNonEmptyArray,
  createMutableArray,
  EncryptionKey,
} from "../../../../../packages/common/src/index.ts";
import {
  ownerIdToOwnerIdBytes,
  type OwnerIdBytes,
} from "../../../../../packages/common/src/local-first/Owner.ts";
import type { TimestampsRangeWithTimestampsBuffer } from "../../../../../packages/common/src/local-first/Protocol.ts";
import {
  applyProtocolMessageAsClient,
  applyProtocolMessageAsRelay,
  createProtocolMessageBuffer,
  createProtocolMessageForSync,
  createProtocolMessageFromCrdtMessages,
  createTimestampsBuffer,
  decodeFlags,
  decodeLength,
  decodeNodeId,
  decodeNonNegativeInt,
  decodeNumber,
  decodeRle,
  decodeSqliteValue,
  decodeString,
  decryptAndDecodeDbChange,
  defaultProtocolMessageRangesMaxSize,
  encodeAndEncryptDbChange,
  encodeFlags,
  encodeLength,
  encodeNodeId,
  encodeNonNegativeInt,
  encodeNumber,
  encodeSqliteValue,
  encodeString,
  MessageType,
  parseProtocolHeader,
  ProtocolMessageMaxSize,
  ProtocolMessageRangesMaxSize,
  ProtocolValueType,
  protocolVersion,
  SubscriptionFlags,
} from "../../../../../packages/common/src/local-first/Protocol.ts";
import type {
  CrdtMessage,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  Storage,
  StorageDep,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  DbChange,
  InfiniteUpperBound,
  RangeType,
  timestampBytesToFingerprint,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  createInitialTimestamp,
  NodeId,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../../../../packages/common/src/local-first/Timestamp.ts";
import {
  err,
  getOrThrow,
  ok,
} from "../../../../../packages/common/src/Result.ts";
import { SqliteValue } from "../../../../../packages/common/src/Sqlite.ts";
import {
  testCreateDeps,
  testCreateRun,
  type TestRunDefaultDeps as TestDeps,
} from "../../../../../packages/common/src/Task.ts";
import {
  createId,
  DateIsoFromDate,
  NonNegativeInt,
  PositiveInt,
  zeroNonNegativeInt,
} from "../../../../../packages/common/src/Type.ts";
import { setupSqliteAndRelayStorage } from "../../_deps.ts";
import {
  maxTimestamp,
  testAppOwner,
  testAppOwnerIdBytes,
  testTimestampsAsc,
  testTimestampsRandom,
} from "../../../../unit/vitest/common/local-first/_fixtures.ts";

beforeAll(async () => {
  await init();
});

/** Returns uncompressed and compressed sizes. */
const getUncompressedAndCompressedSizes = (array: Uint8Array) =>
  `${array.byteLength} ${compress(array).length}`;

test("encodeNumber/decodeNumber", () => {
  const testCases = [
    0,
    42,
    -123,
    // oxlint-disable-next-line oxc/approx-constant -- Pins this exact decimal's serialized bytes in the snapshot below.
    3.14159,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    Infinity,
    -Infinity,
    NaN,
  ];

  const buffer = createBuffer();

  testCases.forEach((value) => {
    encodeNumber(buffer, value);
    const encoded = createBuffer();
    encodeNumber(encoded, value);
    expect(decodeNumber(encoded)).toBe(value);
    expect(encoded.getLength()).toBe(0);
  });

  expect(buffer.unwrap()).toMatchInlineSnapshot(
    `uint8:[0,42,208,133,203,64,9,33,249,240,27,134,110,203,67,63,255,255,255,255,255,255,203,195,63,255,255,255,255,255,255,203,127,240,0,0,0,0,0,0,203,255,240,0,0,0,0,0,0,203,127,248,0,0,0,0,0,0]`,
  );
});

test("encodeFlags/decodeFlags", () => {
  const testCases: Array<{
    flags: ReadonlyArray<boolean>;
    expected: number;
  }> = [
    { flags: [true], expected: 1 },
    { flags: [false], expected: 0 },
    { flags: [true, false], expected: 1 },
    { flags: [false, true], expected: 2 },
    { flags: [true, true], expected: 3 },
    {
      flags: [true, false, true, false, true],
      expected: 0b10101,
    },
    {
      flags: [true, true, true, true, true, true, true, true],
      expected: 0xff,
    },
  ];

  testCases.forEach(({ flags, expected }) => {
    const buffer = createBuffer();
    encodeFlags(buffer, flags);
    expect(buffer.unwrap()[0]).toBe(expected);

    const decodedFlags = decodeFlags(
      createBuffer(buffer.unwrap()),
      PositiveInt.orThrow(flags.length),
    );
    expect(Array.from(decodedFlags)).toEqual(Array.from(flags));
  });
});

test("encodeNonNegativeInt/decodeNonNegativeInt", () => {
  const testCases: Array<{ input: NonNegativeInt; expected: Array<number> }> = [
    { input: 0 as NonNegativeInt, expected: [0] },
    { input: 1 as NonNegativeInt, expected: [1] },
    { input: 127 as NonNegativeInt, expected: [127] },

    { input: 128 as NonNegativeInt, expected: [128, 1] },
    { input: 129 as NonNegativeInt, expected: [129, 1] },
    { input: 255 as NonNegativeInt, expected: [255, 1] },

    { input: 16383 as NonNegativeInt, expected: [255, 127] },
    { input: 16384 as NonNegativeInt, expected: [128, 128, 1] },
    { input: 32767 as NonNegativeInt, expected: [255, 255, 1] },

    { input: 2097151 as NonNegativeInt, expected: [255, 255, 127] },
    { input: 2097152 as NonNegativeInt, expected: [128, 128, 128, 1] },
    { input: 268435455 as NonNegativeInt, expected: [255, 255, 255, 127] },

    {
      input: Number.MAX_SAFE_INTEGER as NonNegativeInt,
      expected: [255, 255, 255, 255, 255, 255, 255, 15],
    },

    {
      input: (Number.MAX_SAFE_INTEGER - 1) as NonNegativeInt,
      expected: [254, 255, 255, 255, 255, 255, 255, 15],
    },
  ];

  testCases.forEach(({ input, expected }) => {
    const encoded = createBuffer();
    encodeNonNegativeInt(encoded, input);
    expect(encoded.unwrap()).toEqual(new Uint8Array(expected));
    expect(decodeNonNegativeInt(encoded)).toBe(input);
  });

  expect(() => {
    const buffer = createBuffer();
    encodeNonNegativeInt(
      buffer,
      (Number.MAX_SAFE_INTEGER + 1) as NonNegativeInt,
    );
    decodeNonNegativeInt(buffer);
  }).toThrow("Int");

  const malformedData = createMutableArray<number>(8).fill(0xff);
  expect(() => decodeNonNegativeInt(createBuffer(malformedData))).toThrow(
    "Int",
  );

  const truncatedBuffer = createBuffer([128]);
  expect(() => decodeNonNegativeInt(truncatedBuffer)).toThrow(
    "Buffer parse ended prematurely",
  );
});

test("protocolVersion", () => {
  expect(protocolVersion).toBe(1);
});

test("encodeLength/decodeLength", () => {
  let buffer = createBuffer();
  encodeLength(buffer, []);
  expect(decodeLength(buffer)).toBe(0);
  buffer = createBuffer();
  encodeLength(buffer, [1, 2, 3]);
  expect(decodeLength(buffer)).toBe(3);
});

test("encodeString/decodeString", () => {
  const string = "Hello, world!";
  const buffer = createBuffer();
  encodeString(buffer, string);
  expect(buffer.unwrap()).toMatchInlineSnapshot(
    `uint8:[13,72,101,108,108,111,44,32,119,111,114,108,100,33]`,
  );
  expect(decodeString(buffer)).toBe(string);
});

test("encodeNodeId/decodeNodeId", () => {
  const deps = testCreateDeps();
  const testCases = Array.from({ length: 100 }).map(
    () => createInitialTimestamp(deps).nodeId,
  );

  testCases.forEach((id) => {
    const buffer = createBuffer();
    encodeNodeId(buffer, id);
    expect(decodeNodeId(buffer)).toBe(id);
  });
});

test("ProtocolValueType", () => {
  expect(ProtocolValueType).toMatchInlineSnapshot(`
    {
      "Base64Url": 32,
      "Bytes": 23,
      "DateIsoWithNegativeTime": 36,
      "DateIsoWithNonNegativeTime": 35,
      "EmptyString": 31,
      "Id": 33,
      "Json": 34,
      "NonNegativeInt": 30,
      "Null": 22,
      "Number": 21,
      "String": 20,
    }
  `);
});

test("encodeSqliteValue/decodeSqliteValue", () => {
  const deps = testCreateDeps();
  const testCasesSuccess: Array<[SqliteValue, number]> = [
    // empty string optimization - 1 byte vs 2 bytes (50% reduction)
    ["", 1],
    // encodeNumber
    [123.5, 10],
    // encodeNumber
    [-123, 3],
    [null, 1],
    [new Uint8Array([1, 2, 3]), 5],
    [createId(deps), 17],
    // small ints 0-19
    [0, 1],
    // small ints 0-19
    [19, 1],
    // NonNegativeInt
    [123, 2],
    // NonNegativeInt
    [16383, 3],
    // 18 bytes msgpackr + 2 bytes protocol overhead
    ['{"compact":true,"schema":0}', 20],
    // Protocol encoding ensures 6 bytes till the year 2108.
    [
      getOrThrow(
        DateIsoFromDate.from.parent(new Date("0000-01-01T00:00:00.000Z")),
      ),
      10,
    ],
    [
      getOrThrow(
        DateIsoFromDate.from.parent(new Date("2024-10-31T00:00:00.000Z")),
      ),
      7,
    ],
    [
      getOrThrow(
        DateIsoFromDate.from.parent(new Date("2108-10-31T00:00:00.000Z")),
      ),
      7,
    ],
    [
      getOrThrow(
        DateIsoFromDate.from.parent(new Date("2109-10-31T00:00:00.000Z")),
      ),
      8,
    ],
    [
      getOrThrow(
        DateIsoFromDate.from.parent(new Date("9999-12-31T23:59:59.999Z")),
      ),
      8,
    ],
  ];

  const buffer = createBuffer();
  testCasesSuccess.forEach(([value, bytesLength]) => {
    const encoded = createBuffer();
    encodeSqliteValue(encoded, value);
    buffer.extend(encoded.unwrap());

    expect(encoded.getLength()).toBe(bytesLength);
    expect(decodeSqliteValue(encoded)).toStrictEqual(value);
  });
  expect(buffer.unwrap()).toMatchInlineSnapshot(
    `uint8:[31,21,203,64,94,224,0,0,0,0,0,21,208,133,22,23,3,1,2,3,33,157,202,140,67,91,176,119,159,179,127,150,10,81,180,247,84,0,19,30,123,30,255,127,34,18,130,167,99,111,109,112,97,99,116,195,166,115,99,104,101,109,97,0,36,203,194,204,69,55,130,48,0,0,35,128,232,252,254,173,50,35,128,168,131,232,192,127,35,128,128,200,165,182,128,1,35,255,183,255,144,253,206,57]`,
  );
});

test("encodeSqliteValue/decodeSqliteValue property tests", () => {
  const deps = testCreateDeps();
  // Property test: round-trip encoding/decoding should preserve the value
  fc.assert(
    fc.property(
      fc.oneof(
        // Test all SqliteValue types
        fc.constant(null),
        // Regular strings
        fc.string(),
        // Numbers (exclude NaN)
        fc.double().filter((n) => !Number.isNaN(n)),
        // Binary data
        fc.uint8Array(),

        // Special number cases
        fc.constantFrom(Infinity, -Infinity, NaN),
        // Small ints (0-19) - special encoding
        fc.integer({ min: 0, max: 19 }),
        // Non-negative ints
        fc.integer({ min: 20, max: Number.MAX_SAFE_INTEGER }),
        // Negative numbers
        fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
        // Regular floats
        fc.float({ min: -1000, max: 1000 }),

        // Id optimization cases
        // Valid Id
        fc.constantFrom(createId(deps)),
        fc
          .string({ minLength: 21, maxLength: 21 })
          // Id-like strings
          .map((s) => s.replaceAll(/[^A-Za-z0-9_-]/gu, "a")),

        // URL-safe strings with length % 4 === 0 (Base64Url optimization)
        fc
          .stringMatching(/^[A-Za-z0-9_-]*$/u)
          .filter((s) => s.length % 4 === 0 && s.length > 0),
        // URL-safe strings with length % 4 !== 0 (should use regular string encoding)
        fc
          .stringMatching(/^[A-Za-z0-9_-]*$/u)
          .filter((s) => s.length % 4 !== 0 && s.length > 0),

        // Base64Url edge cases
        // Empty string (optimization)
        fc.constant(""),
        fc
          .stringMatching(/^[A-Za-z0-9_-]{4,}$/u)
          // Valid Base64Url
          .filter((s) => s.length % 4 === 0),
        // Invalid Base64Url chars
        fc.string().filter((s) => /[^A-Za-z0-9_-]/u.test(s)),

        // JSON optimization cases
        fc
          .record({
            name: fc.string(),
            value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          })
          .map((obj) => JSON.stringify(obj)),
        fc
          .array(fc.oneof(fc.string(), fc.integer(), fc.boolean()))
          .map((arr) => JSON.stringify(arr)),
        // Simple JSON
        fc.constantFrom('{"a":1}', "[]", "null", "true", "false", '"string"'),
        fc.string().filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
          // Non-JSON strings
        }),

        // Date ISO strings - both valid and invalid
        fc
          .date({ min: new Date("1970-01-01"), max: new Date("2100-01-01") })
          .filter((d) => !isNaN(d.getTime()))
          .map((d) => d.toISOString()),
        fc
          .date({ min: new Date("0000-01-01"), max: new Date("9999-12-31") })
          .filter((d) => !isNaN(d.getTime()))
          .map((d) => d.toISOString()),
        fc.constantFrom(
          "0000-01-01T00:00:00.000Z",
          "9999-12-31T23:59:59.999Z",
          // Invalid date format
          "not-a-date-2024-01-01T00:00:00.000Z",
          // Invalid month
          "2024-13-01T00:00:00.000Z",
        ),

        // Binary data edge cases
        // Empty binary
        fc.constant(new Uint8Array(0)),
        // Variable size binary
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        // Large binary with pattern
        fc.constant(new Uint8Array(1000).fill(255)),
        // Small binary pattern
        fc.constant(new Uint8Array([0, 1, 2, 3, 4, 5])),
      ),
      (value) => {
        const buffer = createBuffer();
        encodeSqliteValue(buffer, value);
        const decoded = decodeSqliteValue(buffer);

        // Handle special cases for comparison
        if (value instanceof Uint8Array && decoded instanceof Uint8Array) {
          return (
            value.length === decoded.length &&
            value.every((byte, i) => byte === decoded[i])
          );
        }

        // Handle NaN specially since NaN !== NaN
        if (
          typeof value === "number" &&
          typeof decoded === "number" &&
          Number.isNaN(value)
        )
          return Number.isNaN(decoded);

        return decoded === value;
      },
    ),
    { numRuns: 10000 },
  );
});

test("encodeSqliteValue/decodeSqliteValue specific failing case from property tests", () => {
  // This was the specific failing case from property tests before the DateIsoString fix
  const failingInput = `["0 (      ",-100000000]`;

  const buffer = createBuffer();
  encodeSqliteValue(buffer, failingInput);
  const decoded = decodeSqliteValue(buffer);

  // After the DateIsoString round-trip fix, this should now work correctly
  // The input should be treated as a regular string (not DateIso) and round-trip properly
  expect(decoded).toBe(failingInput);
});

const createDbChange = (deps: RunDefaultDeps) =>
  DbChange.orThrow({
    table: "employee",
    id: createId(deps),
    values: {
      name: "Victoria",
      hiredAt: getOrThrow(DateIsoFromDate.from.parent(new Date("2024-10-31"))),
      officeId: createId(deps),
    },
    isInsert: true,
    isDelete: null,
  });

const createTestCrdtMessage = (deps: TestDeps): CrdtMessage => ({
  timestamp: createInitialTimestamp(deps),
  change: createDbChange(deps),
});

const createEncryptedDbChange = (
  deps: RunDefaultDeps,
  message: CrdtMessage,
): EncryptedDbChange =>
  encodeAndEncryptDbChange(deps)(message, testAppOwner.encryptionKey);

const createEncryptedCrdtMessage = (
  deps: RunDefaultDeps,
  message: CrdtMessage,
): EncryptedCrdtMessage => ({
  timestamp: message.timestamp,
  change: createEncryptedDbChange(deps, message),
});

test("encodeAndEncryptDbChange/decryptAndDecodeDbChange", () => {
  const deps = testCreateDeps();
  const crdtMessage = createTestCrdtMessage(deps);
  const encryptedMessage = createEncryptedCrdtMessage(deps, crdtMessage);
  expect(encryptedMessage.change).toMatchInlineSnapshot(
    `uint8:[61,17,38,101,206,230,156,196,117,122,86,130,104,17,74,160,137,87,251,80,60,4,187,82,120,21,183,156,135,35,243,181,223,18,22,90,96,109,219,144,157,35,221,192,170,117,127,10,105,220,14,61,168,131,146,173,220,111,49,224,40,176,173,245,221,64,77,184,172,123,119,129,13,41,215,115,183,78,193,86,195,208,223,188,12,0,254,111,107,29,141,95,196,63,67,44,28,179,237,16,75,204,188,79,115,27,54,230,114,95,42,76,182,31,48,194,89,15,87,25,123,136,83,31,53,97,40,186,18,230,69,165,128,90,88,104,194,141,42,84,169,193,21,76,116]`,
  );
  const decrypted = getOrThrow(
    decryptAndDecodeDbChange(encryptedMessage, testAppOwner.encryptionKey),
  );
  expect(decrypted).toEqual(crdtMessage.change);

  const wrongKey = EncryptionKey.orThrow(new Uint8Array(32).fill(42));
  const decryptedWithWrongKey = decryptAndDecodeDbChange(
    encryptedMessage,
    wrongKey,
  );
  assert(!decryptedWithWrongKey.ok);
  expect(decryptedWithWrongKey.error.type).toBe(
    "DecryptWithXChaCha20Poly1305Error",
  );

  const corruptedCiphertext = new Uint8Array(
    encryptedMessage.change,
  ) as EncryptedDbChange;
  if (corruptedCiphertext.length > 10) {
    // Modify a byte
    corruptedCiphertext[10] = (corruptedCiphertext[10] + 1) % 256;
  }
  const corruptedMessage: EncryptedCrdtMessage = {
    timestamp: encryptedMessage.timestamp,
    change: corruptedCiphertext,
  };
  const decryptedCorrupted = decryptAndDecodeDbChange(
    corruptedMessage,
    testAppOwner.encryptionKey,
  );
  assert(!decryptedCorrupted.ok);
  expect(decryptedCorrupted.error.type).toBe(
    "DecryptWithXChaCha20Poly1305Error",
  );
});

test("encodeAndEncryptDbChange preserves null values", () => {
  const deps = testCreateDeps();
  const message: CrdtMessage = {
    timestamp: createInitialTimestamp(deps),
    change: DbChange.orThrow({
      table: "employee",
      id: createId(deps),
      values: { officeId: null },
      isInsert: false,
      isDelete: null,
    }),
  };
  const encryptedMessage = createEncryptedCrdtMessage(deps, message);

  expect(
    getOrThrow(
      decryptAndDecodeDbChange(encryptedMessage, testAppOwner.encryptionKey),
    ),
  ).toEqual(message.change);
});

test("decryptAndDecodeDbChange timestamp tamper-proofing", () => {
  const deps = testCreateDeps();
  const crdtMessage = createTestCrdtMessage(deps);
  const encryptedMessage = createEncryptedCrdtMessage(deps, crdtMessage);

  // Create a different timestamp
  const wrongTimestamp = createInitialTimestamp(deps);

  // Create a message with the wrong timestamp but same encrypted change
  const tamperedMessage: EncryptedCrdtMessage = {
    timestamp: wrongTimestamp,
    change: encryptedMessage.change,
  };

  // Attempt to decrypt with wrong timestamp should fail with ProtocolTimestampMismatchError
  const decryptedWithWrongTimestamp = decryptAndDecodeDbChange(
    tamperedMessage,
    testAppOwner.encryptionKey,
  );

  expect(decryptedWithWrongTimestamp).toEqual(
    err({
      type: "ProtocolTimestampMismatchError",
      expected: wrongTimestamp,
      timestamp: crdtMessage.timestamp,
    }),
  );
});

const shouldNotBeCalled = () => {
  throw new Error("should not be called");
};

const shouldNotBeCalledStorageDep: StorageDep = {
  storage: {
    getSize: shouldNotBeCalled,
    fingerprint: shouldNotBeCalled,
    fingerprintRanges: shouldNotBeCalled,
    findLowerBound: shouldNotBeCalled,
    iterate: shouldNotBeCalled,
    validateWriteKey: shouldNotBeCalled,
    setWriteKey: shouldNotBeCalled,
    writeMessages: shouldNotBeCalled,
    readDbChange: shouldNotBeCalled,
    deleteOwner: shouldNotBeCalled,
  },
};

test("createTimestampsBuffer maxTimestamp", () => {
  const buffer = createTimestampsBuffer();
  buffer.add(timestampBytesToTimestamp(maxTimestamp));
  expect(buffer.getLength()).toBe(21);
});

describe("decodeRle", () => {
  test("rejects runLength exceeding remaining", () => {
    const buffer = createBuffer();
    // value=1, runLength=100000 (malicious: exceeds expected length of 2)
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(1));
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(100000));

    expect(() =>
      decodeRle(buffer, NonNegativeInt.orThrow(2), () =>
        decodeNonNegativeInt(buffer),
      ),
    ).toThrow("Invalid RLE encoding: runLength 100000 exceeds remaining 2");
  });

  test("rejects zero runLength", () => {
    const buffer = createBuffer();
    // value=1, runLength=0 (malicious: would infinite-loop)
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(1));
    encodeNonNegativeInt(buffer, zeroNonNegativeInt);

    expect(() =>
      decodeRle(buffer, NonNegativeInt.orThrow(1), () =>
        decodeNonNegativeInt(buffer),
      ),
    ).toThrow("Invalid RLE encoding: runLength must be positive");
  });

  test("accepts valid RLE encoding", () => {
    const buffer = createBuffer();
    // [5 x 3]
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(5));
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(3));

    const values = decodeRle(buffer, NonNegativeInt.orThrow(3), () =>
      decodeNonNegativeInt(buffer),
    );
    expect(values).toEqual([5, 5, 5]);
    expect(buffer.getLength()).toBe(0);
  });

  test("supports non-int values (NodeId)", () => {
    const buffer = createBuffer();
    encodeNodeId(buffer, NodeId.orThrow("0123456789abcdef"));
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(2));

    const values = decodeRle(buffer, NonNegativeInt.orThrow(2), () =>
      decodeNodeId(buffer),
    );
    expect(values).toEqual(["0123456789abcdef", "0123456789abcdef"]);
    expect(buffer.getLength()).toBe(0);
  });
});

describe("createProtocolMessageBuffer", () => {
  it("should allow no ranges", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    expect(buffer.unwrap()).toMatchInlineSnapshot(
      `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,0,0,0,0]`,
    );
  });

  it("should allow single range with InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() => buffer.unwrap()).not.toThrow();
  });

  it("should reject single range without InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[0],
    });
    expect(() => buffer.unwrap()).toThrow(
      "The last range's upperBound must be InfiniteUpperBound",
    );
  });

  it("should allow multiple ranges with only last InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[0],
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[1],
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() => buffer.unwrap()).not.toThrow();
  });

  it("should reject range added after InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() => {
      buffer.addRange({
        type: RangeType.Skip,
        upperBound: testTimestampsAsc[0],
      });
    }).toThrow("Cannot add a range after an InfiniteUpperBound range");
  });

  it("should reject multiple InfiniteUpperBounds", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[0],
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() => {
      buffer.addRange({
        type: RangeType.Skip,
        upperBound: InfiniteUpperBound,
      });
    }).toThrow("Cannot add a range after an InfiniteUpperBound range");
  });
});

test("createProtocolMessageForSync", async () => {
  await using setup = await setupSqliteAndRelayStorage();
  const { run, storage } = setup;

  // Empty DB: version, ownerId, 0 messages, one empty TimestampsRange.
  expect(
    createProtocolMessageForSync(run.deps)(testAppOwner.id),
  ).toMatchInlineSnapshot(
    `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,0,0,0,0,1,2,0]`,
  );

  const messages31 = testTimestampsAsc
    .slice(0, 31)
    .map((t): EncryptedCrdtMessage => ({
      timestamp: timestampBytesToTimestamp(t),
      change: createEncryptedDbChange(run.deps, {
        timestamp: timestampBytesToTimestamp(t),
        change: createDbChange(run.deps),
      }),
    }));
  assertNonEmptyArray(messages31);
  await run(storage.writeMessages(testAppOwnerIdBytes, messages31));

  // DB with 31 timestamps: version, ownerId, 0 messages, one full (31) TimestampsRange.
  expect(
    createProtocolMessageForSync(run.deps)(testAppOwner.id),
  ).toMatchInlineSnapshot(
    `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,0,0,0,0,1,2,31,0,205,232,66,167,148,6,143,133,147,9,223,251,122,192,233,147,1,253,239,21,170,193,106,140,255,233,2,200,231,203,1,178,177,159,3,245,254,241,2,161,132,228,2,249,130,9,185,178,79,209,140,220,5,159,250,206,3,134,129,149,1,164,173,130,1,250,164,128,1,166,184,87,132,234,30,245,151,147,7,159,219,71,143,236,209,8,227,204,146,10,241,194,239,1,130,170,155,4,188,213,142,1,128,237,253,1,218,180,189,1,0,31,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,2,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,7,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,2,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,11,153,201,144,40,214,99,106,145,2,104,162,167,191,63,133,160,150,1]`,
  );

  const message32 = testTimestampsAsc
    .slice(32, 33)
    .map((t): EncryptedCrdtMessage => ({
      timestamp: timestampBytesToTimestamp(t),
      change: createEncryptedDbChange(run.deps, {
        timestamp: timestampBytesToTimestamp(t),
        change: createDbChange(run.deps),
      }),
    }));
  assertNonEmptyArray(message32);
  await run(storage.writeMessages(testAppOwnerIdBytes, message32));

  // DB with 32 timestamps: version, ownerId, 0 messages, 16x FingerprintRange.
  expect(
    createProtocolMessageForSync(run.deps)(testAppOwner.id),
  ).toMatchInlineSnapshot(
    `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,0,0,0,0,16,244,252,72,238,128,142,10,189,217,169,1,182,192,212,3,250,152,235,4,150,131,214,5,178,181,88,240,134,171,9,170,174,151,2,160,221,215,1,249,129,178,7,174,199,153,9,212,143,130,12,190,255,169,5,218,161,187,3,0,15,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,2,104,162,167,191,63,133,160,150,5,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,128,206,148,14,199,56,37,243,36,103,94,242,26,215,28,58,69,17,216,49,151,66,7,73,145,21,172,3,13,246,57,38,236,183,122,66,63,72,150,103,25,204,34,212,14,129,175,197,206,181,177,91,41,15,0,93,10,169,105,80,103,156,249,223,243,178,1,220,137,89,82,220,22,134,54,72,5,56,202,254,108,199,207,244,82,201,17,140,29,104,188,217,38,175,238,209,22,15,247,170,215,200,6,101,105,182,63,59,104,218,122,27,75,209,87,67,182,140,208,140,116,201,185,220,59,174,42,178,33,111,22,135,8,206,174,78,228,236,88,190,31,10,249,236,206,169,84,204,222,170,199,165,5,23,210,180,82,241,220,231,199,220,63,227,95,164,247,162,57,73,211,5,0,159,12,47,71,117,107,133,249,65,116,171,184,60,72,247,110,74,46,204]`,
  );
});

test("parseProtocolHeader parses supported headers and rejects malformed ones", () => {
  const requestHeader = parseProtocolHeader(
    createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Subscribe,
    }).unwrap(),
  );
  expect(requestHeader).toEqual(
    ok({
      type: "ProtocolHeader",
      version: 1,
      ownerId: testAppOwner.id,
      messageType: MessageType.Request,
    }),
  );

  const responseHeader = parseProtocolHeader(
    createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Response,
      errorCode: 0,
    }).unwrap(),
  );
  expect(responseHeader).toEqual(
    ok({
      type: "ProtocolHeader",
      version: 1,
      ownerId: testAppOwner.id,
      messageType: MessageType.Response,
    }),
  );

  const broadcastHeader = parseProtocolHeader(
    createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Broadcast,
    }).unwrap(),
  );
  expect(broadcastHeader).toEqual(
    ok({
      type: "ProtocolHeader",
      version: 1,
      ownerId: testAppOwner.id,
      messageType: MessageType.Broadcast,
    }),
  );

  const invalidVersionMessage = createProtocolMessageBuffer(testAppOwner.id, {
    version: PositiveInt.orThrow(2),
    messageType: MessageType.Request,
  }).unwrap();
  const invalidVersion = parseProtocolHeader(invalidVersionMessage);
  expect(invalidVersion.ok).toBe(false);
  if (!invalidVersion.ok) {
    expect(invalidVersion.error.type).toBe("ProtocolInvalidDataError");
    expect(invalidVersion.error.error).toBeInstanceOf(Error);
  }

  const invalidTypeMessage = createBuffer();
  encodeNonNegativeInt(invalidTypeMessage, protocolVersion);
  invalidTypeMessage.extend(ownerIdToOwnerIdBytes(testAppOwner.id));
  invalidTypeMessage.extend([255]);

  const invalidType = parseProtocolHeader(invalidTypeMessage.unwrap());
  expect(invalidType.ok).toBe(false);
  if (!invalidType.ok) {
    expect(invalidType.error.type).toBe("ProtocolInvalidDataError");
    expect(invalidType.error.error).toBeInstanceOf(Error);
  }
});

describe("E2E versioning", () => {
  test("same versions", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const v0 = 0 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testAppOwner.id, {
      version: v0,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = await run.orThrow(
      applyProtocolMessageAsRelay(clientMessage, {}, v0),
    );
    expect(relayResponse.message.length).toMatchInlineSnapshot(`20`);
  });

  test("non-initiator version is higher", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testAppOwner.id, {
      version: v0,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = await run.orThrow(
      applyProtocolMessageAsRelay(clientMessage, {}, v1),
    );

    const clientResult = await run(
      applyProtocolMessageAsClient(relayResponse.message, {
        version: v0,
      }),
    );
    expect(clientResult).toEqual(
      err({
        type: "ProtocolVersionError",
        version: 1,
        isInitiator: true,
        ownerId: testAppOwner.id,
      }),
    );
  });

  test("initiator version is higher", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testAppOwner.id, {
      version: v1,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = await run.orThrow(
      applyProtocolMessageAsRelay(clientMessage, {}, v0),
    );

    const clientResult = await run(
      applyProtocolMessageAsClient(relayResponse.message, {
        version: v1,
      }),
    );
    expect(clientResult).toEqual(
      err({
        type: "ProtocolVersionError",
        version: 0,
        isInitiator: false,
        ownerId: testAppOwner.id,
      }),
    );
  });
});

describe("E2E errors", () => {
  test("ProtocolInvalidDataError", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const malformedMessage = createBuffer();
    // Only version, no ownerId
    encodeNonNegativeInt(malformedMessage, 1 as NonNegativeInt);

    const clientResult = await run(
      applyProtocolMessageAsClient(malformedMessage.unwrap(), {
        version: 0 as NonNegativeInt,
      }),
    );

    assert(!clientResult.ok);
    expect(clientResult.error.type).toBe("ProtocolInvalidDataError");
  });

  test("ProtocolWriteKeyError", async () => {
    const deps = testCreateDeps();
    const timestamp = timestampBytesToTimestamp(testTimestampsAsc[0]);
    const dbChange = createDbChange(deps);

    const messages: NonEmptyReadonlyArray<CrdtMessage> = [
      { timestamp, change: dbChange },
    ];

    const initiatorMessage = createProtocolMessageFromCrdtMessages(deps)(
      testAppOwner,
      messages,
    );

    let responseMessage: Uint8Array;
    {
      await using run = testCreateRun({
        storage: {
          ...shouldNotBeCalledStorageDep.storage,
          validateWriteKey: constFalse,
        },
      });
      const response = await run.orThrow(
        applyProtocolMessageAsRelay(initiatorMessage),
      );
      expect(response.message).toMatchInlineSnapshot(
        `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,1,1,0]`,
      );
      responseMessage = response.message;
    }

    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const clientResult = await run(
      applyProtocolMessageAsClient(responseMessage),
    );
    expect(clientResult).toEqual(
      err({ type: "ProtocolWriteKeyError", ownerId: testAppOwner.id }),
    );
  });
});

describe("E2E relay options", () => {
  test("subscribe", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const message = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Subscribe,
    }).unwrap();
    let subscribeCalledWithOwnerId: string | null = null;

    await run(
      applyProtocolMessageAsRelay(message, {
        subscribe: (ownerId) => {
          subscribeCalledWithOwnerId = ownerId;
        },
      }),
    );

    expect(subscribeCalledWithOwnerId).toBe(testAppOwner.id);
  });

  test("unsubscribe", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const message = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Unsubscribe,
    }).unwrap();
    let unsubscribeCalledWithOwnerId: string | null = null;

    await run(
      applyProtocolMessageAsRelay(message, {
        unsubscribe: (ownerId) => {
          unsubscribeCalledWithOwnerId = ownerId;
        },
      }),
    );

    expect(unsubscribeCalledWithOwnerId).toBe(testAppOwner.id);
  });

  test("no subscription flag (None)", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const message = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.None,
    }).unwrap();
    let subscribeWasCalled = false;
    let unsubscribeWasCalled = false;

    await run(
      applyProtocolMessageAsRelay(message, {
        subscribe: () => {
          subscribeWasCalled = true;
        },
        unsubscribe: () => {
          unsubscribeWasCalled = true;
        },
      }),
    );

    expect(subscribeWasCalled).toBe(false);
    expect(unsubscribeWasCalled).toBe(false);
  });

  test("default subscription flag (undefined)", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const message = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      // No subscriptionFlag provided, should default to None
    }).unwrap();
    let subscribeWasCalled = false;
    let unsubscribeWasCalled = false;

    await run(
      applyProtocolMessageAsRelay(message, {
        subscribe: () => {
          subscribeWasCalled = true;
        },
        unsubscribe: () => {
          unsubscribeWasCalled = true;
        },
      }),
    );

    expect(subscribeWasCalled).toBe(false);
    expect(unsubscribeWasCalled).toBe(false);
  });

  test("broadcast message", async () => {
    const deps = testCreateDeps();
    const timestamp = timestampBytesToTimestamp(testTimestampsAsc[0]);
    const dbChange = createDbChange(deps);
    const messages: NonEmptyReadonlyArray<CrdtMessage> = [
      { timestamp, change: dbChange },
    ];

    const initiatorMessage = createProtocolMessageFromCrdtMessages(deps)(
      testAppOwner,
      messages,
    );

    expect(initiatorMessage).toMatchInlineSnapshot(
      `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,0,1,54,5,233,240,206,250,4,176,183,249,24,139,227,171,130,125,0,1,0,0,1,0,0,0,0,0,0,0,0,1,145,1,138,125,164,134,128,69,100,218,61,17,38,101,206,230,156,196,117,122,86,130,104,17,74,160,120,27,6,173,226,63,249,78,64,158,64,105,113,65,117,32,162,72,75,27,1,5,223,99,61,7,23,202,44,28,122,171,187,194,60,62,5,98,119,184,148,143,93,17,8,12,188,194,3,106,221,82,87,187,217,164,140,157,102,52,61,75,92,103,149,130,120,162,73,165,205,252,14,159,22,32,25,147,175,182,135,84,252,31,192,102,121,156,137,162,248,23,240,231,192,142,139,193,226,61,188,215,224,46,244,167,7,68,239,113,47,66,66,228,237,109,216,178,49,253,117]`,
    );

    let broadcastedMessage = null as Uint8Array | null;

    await using run = testCreateRun({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        validateWriteKey: constTrue,
        writeMessages: () => () => ok(),
      },
    });
    await run(
      applyProtocolMessageAsRelay(initiatorMessage, {
        broadcast: (ownerId, message) => {
          expect(ownerId).toBe(testAppOwner.id);
          broadcastedMessage = message;
        },
      }),
    );

    assert(broadcastedMessage);
    // Added error and removed writeKey, added subscription flag
    expect(broadcastedMessage).toMatchInlineSnapshot(
      `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,2,1,0,0,1,0,0,0,0,0,0,0,0,1,145,1,138,125,164,134,128,69,100,218,61,17,38,101,206,230,156,196,117,122,86,130,104,17,74,160,120,27,6,173,226,63,249,78,64,158,64,105,113,65,117,32,162,72,75,27,1,5,223,99,61,7,23,202,44,28,122,171,187,194,60,62,5,98,119,184,148,143,93,17,8,12,188,194,3,106,221,82,87,187,217,164,140,157,102,52,61,75,92,103,149,130,120,162,73,165,205,252,14,159,22,32,25,147,175,182,135,84,252,31,192,102,121,156,137,162,248,23,240,231,192,142,139,193,226,61,188,215,224,46,244,167,7,68,239,113,47,66,66,228,237,109,216,178,49,253,117]`,
    );

    let writeMessagesCalled = false;
    {
      await using run = testCreateRun({
        storage: {
          ...shouldNotBeCalledStorageDep.storage,
          writeMessages:
            (
              _ownerId: OwnerIdBytes,
              encryptedMessages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
            ) =>
            () => {
              writeMessagesCalled = true;
              expect(encryptedMessages.length).toBe(messages.length);
              return ok();
            },
        },
      });
      const result = await run(
        applyProtocolMessageAsClient(broadcastedMessage),
      );
      expectOk(result, { type: "NoResponse" });
    }
    expect(writeMessagesCalled).toBe(true);
  });
});

describe("E2E sync", { timeout: 15_000 }, () => {
  const deps = testCreateDeps();

  const messages = testTimestampsAsc.map((t): EncryptedCrdtMessage => ({
    timestamp: timestampBytesToTimestamp(t),
    change: createEncryptedDbChange(deps, {
      timestamp: timestampBytesToTimestamp(t),
      change: DbChange.orThrow({
        table: "foo",
        id: createId(deps),
        values: {
          bar: "x".repeat(deps.randomLib.int(1, 500)),
        },
        isInsert: true,
        isDelete: null,
      }),
    }),
  }));
  assertNonEmptyArray(messages);

  const createStorages = async () => {
    await using disposer = new AsyncDisposableStack();
    const client = disposer.use(await setupSqliteAndRelayStorage());
    const relay = disposer.use(await setupSqliteAndRelayStorage());
    const disposables = disposer.move();

    return {
      clientStorage: client.storage,
      relayStorage: relay.storage,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };
  };

  const reconcile = async (
    clientStorage: Storage,
    relayStorage: Storage,
    rangesMaxSize = defaultProtocolMessageRangesMaxSize,
  ) => {
    const clientStorageDep = { storage: clientStorage, console: deps.console };
    const relayStorageDep = { storage: relayStorage };

    let message = createProtocolMessageForSync(clientStorageDep)(
      testAppOwner.id,
    );

    let result;
    let turn = "relay";
    let syncSteps = 0;
    const syncSizes: Array<number> = [message.length];

    while (true) {
      syncSteps++;

      if (syncSteps > 100) {
        throw new Error(syncSteps.toString());
      }

      if (turn === "relay") {
        await using run = testCreateRun(relayStorageDep);
        result = await run(
          applyProtocolMessageAsRelay(message, { rangesMaxSize }),
        );
      } else {
        await using run = testCreateRun(clientStorageDep);
        result = await run(
          applyProtocolMessageAsClient(message, {
            writeKey: testAppOwner.writeKey,
            rangesMaxSize,
          }),
        );
      }

      if (!result.ok || result.value.type === "NoResponse") break;
      assert(result.value.type !== "Broadcast");
      message = result.value.message;

      turn = turn === "relay" ? "client" : "relay";
      syncSizes.push(result.value.message.length);
    }

    for (const message of messages) {
      expect(
        clientStorage
          .readDbChange(
            testAppOwnerIdBytes,
            timestampToTimestampBytes(message.timestamp),
          )
          .join(),
      ).toBe(message.change.join());

      expect(
        relayStorage
          .readDbChange(
            testAppOwnerIdBytes,
            timestampToTimestampBytes(message.timestamp),
          )
          .join(),
      ).toBe(message.change.join());
    }

    // Ensure number of sync steps is even (relay/client turns alternate)
    expect(syncSteps % 2).toBe(0);

    return { syncSteps, syncSizes };
  };

  it("client and relay have all data", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          370,
          20,
        ],
        "syncSteps": 2,
      }
    `);
  });

  it("client has all data", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          370,
          193,
          999633,
          40,
          691617,
          20,
        ],
        "syncSteps": 6,
      }
    `);
  });

  it("client has all data - many steps", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          370,
          193,
          999633,
          40,
          157162,
          40,
          154407,
          40,
          143552,
          40,
          154780,
          40,
          93872,
          20,
        ],
        "syncSteps": 14,
      }
    `);
  });

  it("relay has all data", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          24,
          999381,
          57,
          709864,
        ],
        "syncSteps": 4,
      }
    `);
  });

  it("relay has all data - many steps", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          24,
          151171,
          57,
          150672,
          57,
          161282,
          57,
          157215,
          57,
          156921,
          57,
          155741,
          57,
          149069,
          57,
          154723,
          57,
          149107,
          57,
          148657,
          57,
          165915,
          57,
          22837,
        ],
        "syncSteps": 24,
      }
    `);
  });

  it("client and relay each have a random half of the data", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;

    const shuffledMessages = deps.randomLib.shuffle(messages);
    const middle = Math.floor(shuffledMessages.length / 2);
    const firstHalf = shuffledMessages.slice(0, middle);
    const secondHalf = shuffledMessages.slice(middle);

    assertNonEmptyArray(firstHalf);
    assertNonEmptyArray(secondHalf);

    await run(clientStorage.writeMessages(testAppOwnerIdBytes, firstHalf));
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, secondHalf));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          334,
          5138,
          17190,
          863219,
          849394,
          20,
        ],
        "syncSteps": 6,
      }
    `);
  });

  it("client and relay each have a random half of the data - many steps", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;

    const shuffledMessages = deps.randomLib.shuffle(messages);
    const middle = Math.floor(shuffledMessages.length / 2);
    const firstHalf = shuffledMessages.slice(0, middle);
    const secondHalf = shuffledMessages.slice(middle);

    assertNonEmptyArray(firstHalf);
    assertNonEmptyArray(secondHalf);

    await run(clientStorage.writeMessages(testAppOwnerIdBytes, firstHalf));
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, secondHalf));

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          334,
          2273,
          2231,
          85964,
          87838,
          2264,
          86478,
          84497,
          2296,
          2262,
          76500,
          85193,
          2261,
          67518,
          82713,
          2221,
          74032,
          74087,
          2298,
          81087,
          77073,
          2288,
          2264,
          58323,
          64987,
          2243,
          57456,
          66768,
          2266,
          66564,
          60858,
          14942,
          64259,
          47293,
          100563,
          97897,
          10043,
          35130,
          33078,
          20,
        ],
        "syncSteps": 40,
      }
    `);
  });

  it("starts sync from createProtocolMessageFromCrdtMessages", async () => {
    const owner = testAppOwner;
    const crdtMessages = testTimestampsAsc.map((t): CrdtMessage => ({
      timestamp: timestampBytesToTimestamp(t),
      change: DbChange.orThrow({
        table: "foo",
        id: createId(deps),
        values: { bar: "baz" },
        isInsert: true,
        isDelete: null,
      }),
    }));
    assertNonEmptyArray(crdtMessages);

    const protocolMessage = createProtocolMessageFromCrdtMessages(deps)(
      owner,
      crdtMessages,
      // This is technically invalid, we use it to enforce a sync.
      1000 as ProtocolMessageMaxSize,
    );

    await using setup = await setupSqliteAndRelayStorage();
    const { run } = setup;
    const relayResult = await run.orThrow(
      applyProtocolMessageAsRelay(protocolMessage),
    );

    expect(relayResult.message).toMatchInlineSnapshot(
      `uint8:[1,19,154,246,4,48,219,175,239,119,78,111,157,181,236,230,99,1,0,0,1,2,9,0,205,232,66,167,148,6,143,133,147,9,223,251,122,192,233,147,1,253,239,21,170,193,106,140,255,233,2,0,9,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,2,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,5]`,
    );
    // Sync continue
    expect(relayResult).not.toBe(null);
  });
});

describe("ranges sizes", () => {
  it("31 timestamps", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    const range: TimestampsRangeWithTimestampsBuffer = {
      type: RangeType.Timestamps,
      upperBound: InfiniteUpperBound,
      timestamps: createTimestampsBuffer(),
    };
    testTimestampsAsc.slice(0, 31).forEach((t) => {
      range.timestamps.add(timestampBytesToTimestamp(t));
    });

    buffer.addRange(range);

    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"245 190"`);
  });

  it("testTimestampsAsc", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });

    const range: TimestampsRangeWithTimestampsBuffer = {
      type: RangeType.Timestamps,
      upperBound: InfiniteUpperBound,
      timestamps: createTimestampsBuffer(),
    };
    testTimestampsAsc.forEach((t) => {
      range.timestamps.add(timestampBytesToTimestamp(t));
    });

    buffer.addRange(range);

    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"32865 17828"`);
  });

  it("fingerprints", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });

    testTimestampsAsc.slice(0, 16).forEach((timestamp, i) => {
      buffer.addRange({
        type: RangeType.Fingerprint,
        upperBound: i === 15 ? InfiniteUpperBound : timestamp,
        fingerprint: timestampBytesToFingerprint(testTimestampsRandom[i]),
      });
    });

    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"345 312"`);
  });
});
