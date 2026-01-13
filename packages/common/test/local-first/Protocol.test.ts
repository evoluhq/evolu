import { compress, init } from "@bokuweb/zstd-wasm";
import * as fc from "fast-check";
import { assert, beforeAll, describe, expect, it, test } from "vitest";
import { createBuffer } from "../../src/Buffer.js";
import { constFalse, constTrue } from "../../src/Function.js";
import type { NonEmptyReadonlyArray } from "../../src/index.js";
import { assertNonEmptyArray, EncryptionKey } from "../../src/index.js";
import type { TimestampsRangeWithTimestampsBuffer } from "../../src/local-first/Protocol.js";
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
  ProtocolMessageMaxSize,
  ProtocolMessageRangesMaxSize,
  ProtocolValueType,
  protocolVersion,
  SubscriptionFlags,
} from "../../src/local-first/Protocol.js";
import type {
  CrdtMessage,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  Storage,
  StorageDep,
} from "../../src/local-first/Storage.js";
import {
  DbChange,
  InfiniteUpperBound,
  RangeType,
  timestampBytesToFingerprint,
} from "../../src/local-first/Storage.js";
import {
  createInitialTimestamp,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../src/local-first/Timestamp.js";
import { err, getOrThrow, ok } from "../../src/Result.js";
import { SqliteValue } from "../../src/Sqlite.js";
import type { TestDeps } from "../../src/Test.js";
import { createTestDeps } from "../../src/Test.js";
import {
  createId,
  dateToDateIso,
  NonNegativeInt,
  PositiveInt,
} from "../../src/Type.js";
import { testCreateRelayStorageAndSqliteDeps } from "../_deps.js";
import {
  maxTimestamp,
  testOwner,
  testOwnerIdBytes,
  testTimestampsAsc,
  testTimestampsRandom,
} from "./_fixtures.js";

beforeAll(async () => {
  await init();
});

/** Returns uncompressed and compressed sizes. */
const getUncompressedAndCompressedSizes = (array: Uint8Array) => {
  return `${array.byteLength} ${compress(array as never).length}`;
};

test("encodeNumber/decodeNumber", () => {
  const testCases = [
    0,
    42,
    -123,
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

  const malformedData = new globalThis.Array(8).fill(0xff);
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
  const deps = createTestDeps();
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
  const deps = createTestDeps();
  const testCasesSuccess: Array<[SqliteValue, number]> = [
    ["", 1], // empty string optimization - 1 byte vs 2 bytes (50% reduction)
    [123.5, 10], // encodeNumber
    [-123, 3], // encodeNumber
    [null, 1],
    [new Uint8Array([1, 2, 3]), 5],
    [createId(deps), 17],
    [0, 1], // small ints 0-19
    [19, 1], // small ints 0-19
    [123, 2], // NonNegativeInt
    [16383, 3], // NonNegativeInt
    ['{"compact":true,"schema":0}', 20], // 18 bytes msgpackr + 2 bytes protocol overhead
    // Protocol encoding ensures 6 bytes till the year 2108.
    [getOrThrow(dateToDateIso(new Date("0000-01-01T00:00:00.000Z"))), 10],
    [getOrThrow(dateToDateIso(new Date("2024-10-31T00:00:00.000Z"))), 7],
    [getOrThrow(dateToDateIso(new Date("2108-10-31T00:00:00.000Z"))), 7],
    [getOrThrow(dateToDateIso(new Date("2109-10-31T00:00:00.000Z"))), 8],
    [getOrThrow(dateToDateIso(new Date("9999-12-31T23:59:59.999Z"))), 8],
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
    `uint8:[31,21,203,64,94,224,0,0,0,0,0,21,208,133,22,23,3,1,2,3,33,32,99,101,230,222,46,149,166,144,165,217,240,14,24,40,8,0,19,30,123,30,255,127,34,18,130,167,99,111,109,112,97,99,116,195,166,115,99,104,101,109,97,0,36,203,194,204,69,55,130,48,0,0,35,128,232,252,254,173,50,35,128,168,131,232,192,127,35,128,128,200,165,182,128,1,35,255,183,255,144,253,206,57]`,
  );
});

test("encodeSqliteValue/decodeSqliteValue property tests", () => {
  const deps = createTestDeps();
  // Property test: round-trip encoding/decoding should preserve the value
  fc.assert(
    fc.property(
      fc.oneof(
        // Test all SqliteValue types
        fc.constant(null),
        fc.string(), // Regular strings
        fc.double().filter((n) => !Number.isNaN(n)), // Numbers (exclude NaN)
        fc.uint8Array(), // Binary data

        // Special number cases
        fc.constantFrom(Infinity, -Infinity, NaN),
        fc.integer({ min: 0, max: 19 }), // Small ints (0-19) - special encoding
        fc.integer({ min: 20, max: Number.MAX_SAFE_INTEGER }), // Non-negative ints
        fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }), // Negative numbers
        fc.float({ min: -1000, max: 1000 }), // Regular floats

        // Id optimization cases
        fc.constantFrom(createId(deps)), // Valid Id
        fc
          .string({ minLength: 21, maxLength: 21 })
          .map((s) => s.replace(/[^A-Za-z0-9_-]/g, "a")), // Id-like strings

        // URL-safe strings with length % 4 === 0 (Base64Url optimization)
        fc
          .stringMatching(/^[A-Za-z0-9_-]*$/)
          .filter((s) => s.length % 4 === 0 && s.length > 0),
        // URL-safe strings with length % 4 !== 0 (should use regular string encoding)
        fc
          .stringMatching(/^[A-Za-z0-9_-]*$/)
          .filter((s) => s.length % 4 !== 0 && s.length > 0),

        // Base64Url edge cases
        fc.constant(""), // Empty string (optimization)
        fc
          .stringMatching(/^[A-Za-z0-9_-]{4,}$/)
          .filter((s) => s.length % 4 === 0), // Valid Base64Url
        fc.string().filter((s) => /[^A-Za-z0-9_-]/.test(s)), // Invalid Base64Url chars

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
        fc.constantFrom('{"a":1}', "[]", "null", "true", "false", '"string"'), // Simple JSON
        fc.string().filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }), // Non-JSON strings

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
          "not-a-date-2024-01-01T00:00:00.000Z", // Invalid date format
          "2024-13-01T00:00:00.000Z", // Invalid month
        ),

        // Binary data edge cases
        fc.constant(new Uint8Array(0)), // Empty binary
        fc.uint8Array({ minLength: 1, maxLength: 1000 }), // Variable size binary
        fc.constant(new Uint8Array(1000).fill(255)), // Large binary with pattern
        fc.constant(new Uint8Array([0, 1, 2, 3, 4, 5])), // Small binary pattern
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
        if (typeof value === "number" && typeof decoded === "number") {
          if (Number.isNaN(value)) {
            return Number.isNaN(decoded);
          }
        }

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

const createDbChange = (deps: TestDeps) =>
  DbChange.orThrow({
    table: "employee",
    id: createId(deps),
    values: {
      name: "Victoria",
      hiredAt: getOrThrow(dateToDateIso(new Date("2024-10-31"))),
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
  deps: TestDeps,
  message: CrdtMessage,
): EncryptedDbChange =>
  encodeAndEncryptDbChange(deps)(message, testOwner.encryptionKey);

const createEncryptedCrdtMessage = (
  deps: TestDeps,
  message: CrdtMessage,
): EncryptedCrdtMessage => ({
  timestamp: message.timestamp,
  change: createEncryptedDbChange(deps, message),
});

test("encodeAndEncryptDbChange/decryptAndDecodeDbChange", () => {
  const deps = createTestDeps();
  const crdtMessage = createTestCrdtMessage(deps);
  const encryptedMessage = createEncryptedCrdtMessage(deps, crdtMessage);
  expect(encryptedMessage.change).toMatchInlineSnapshot(
    `uint8:[241,14,128,41,142,157,38,100,106,119,182,150,57,231,121,203,1,130,102,255,189,176,71,43,120,23,239,6,214,65,111,99,169,234,146,241,12,0,58,45,51,31,132,69,127,250,60,149,153,138,200,19,145,53,210,180,34,126,99,90,197,77,140,109,134,17,112,53,148,133,66,107,149,90,154,174,221,58,233,123,146,196,69,167,238,191,79,236,109,122,109,91,246,157,252,218,187,152,0,207,39,10,32,7,186,217,215,12,165,245,82,236,250,178,227,132,171,89,106,77,81,216,236,92,149,188,250,219,5,20,130,27,55,43,64,164,180,75,222,112,122,62,145,82,171]`,
  );
  const decrypted = decryptAndDecodeDbChange(
    encryptedMessage,
    testOwner.encryptionKey,
  );
  assert(decrypted.ok);
  expect(decrypted.value).toEqual(crdtMessage.change);

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
    corruptedCiphertext[10] = (corruptedCiphertext[10] + 1) % 256; // Modify a byte
  }
  const corruptedMessage: EncryptedCrdtMessage = {
    timestamp: encryptedMessage.timestamp,
    change: corruptedCiphertext,
  };
  const decryptedCorrupted = decryptAndDecodeDbChange(
    corruptedMessage,
    testOwner.encryptionKey,
  );
  assert(!decryptedCorrupted.ok);
  expect(decryptedCorrupted.error.type).toBe(
    "DecryptWithXChaCha20Poly1305Error",
  );
});

test("decryptAndDecodeDbChange timestamp tamper-proofing", () => {
  const deps = createTestDeps();
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
    testOwner.encryptionKey,
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
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(0));

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
    encodeNodeId(buffer, "0123456789abcdef" as any);
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
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
    });
    expect(buffer.unwrap()).toMatchInlineSnapshot(
      `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,0,0,0,0]`,
    );
  });

  it("should allow single range with InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() => buffer.unwrap()).not.toThrow();
  });

  it("should reject single range without InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
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
    const buffer = createProtocolMessageBuffer(testOwner.id, {
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
    const buffer = createProtocolMessageBuffer(testOwner.id, {
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
    const buffer = createProtocolMessageBuffer(testOwner.id, {
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
  const testDeps = createTestDeps();
  const storageDeps = await testCreateRelayStorageAndSqliteDeps();

  // Empty DB: version, ownerId, 0 messages, one empty TimestampsRange.
  expect(
    createProtocolMessageForSync(storageDeps)(testOwner.id),
  ).toMatchInlineSnapshot(
    `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,0,0,0,0,1,2,0]`,
  );

  const messages31 = testTimestampsAsc.slice(0, 31).map(
    (t): EncryptedCrdtMessage => ({
      timestamp: timestampBytesToTimestamp(t),
      change: createEncryptedDbChange(testDeps, {
        timestamp: timestampBytesToTimestamp(t),
        change: createDbChange(testDeps),
      }),
    }),
  );
  assertNonEmptyArray(messages31);
  await storageDeps.storage.writeMessages(testOwnerIdBytes, messages31);

  // DB with 31 timestamps: version, ownerId, 0 messages, one full (31) TimestampsRange.
  expect(
    createProtocolMessageForSync(storageDeps)(testOwner.id),
  ).toMatchInlineSnapshot(
    `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,0,0,0,0,1,2,31,0,163,205,139,2,152,222,222,3,141,195,32,138,221,210,1,216,167,200,1,243,155,45,128,152,244,5,167,136,182,1,199,139,225,5,131,234,154,8,0,150,132,58,233,134,161,1,222,244,220,1,250,141,170,3,248,167,204,1,0,161,234,59,0,192,227,115,181,188,169,1,224,169,247,4,205,177,37,143,161,242,1,137,231,180,2,161,244,87,235,207,53,133,244,180,1,142,243,223,10,158,141,113,0,11,1,1,0,5,1,1,0,1,1,1,0,11,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,11,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1]`,
  );

  const message32 = testTimestampsAsc.slice(32, 33).map(
    (t): EncryptedCrdtMessage => ({
      timestamp: timestampBytesToTimestamp(t),
      change: createEncryptedDbChange(testDeps, {
        timestamp: timestampBytesToTimestamp(t),
        change: createDbChange(testDeps),
      }),
    }),
  );
  assertNonEmptyArray(message32);
  await storageDeps.storage.writeMessages(testOwnerIdBytes, message32);

  // DB with 32 timestamps: version, ownerId, 0 messages, 16x FingerprintRange.
  expect(
    createProtocolMessageForSync(storageDeps)(testOwner.id),
  ).toMatchInlineSnapshot(
    `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,0,0,0,0,16,187,171,234,5,151,160,243,1,203,195,245,1,167,160,170,7,202,245,251,13,150,132,58,199,251,253,2,242,181,246,4,161,234,59,192,227,115,149,230,160,6,220,210,151,2,170,219,140,3,240,195,234,1,172,128,209,11,0,15,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,5,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,7,153,201,144,40,214,99,106,145,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,79,199,221,49,166,129,34,35,99,27,109,221,72,203,113,173,13,174,108,244,220,53,10,79,91,208,39,170,201,18,73,253,152,51,99,124,0,152,50,246,239,212,6,13,80,19,126,71,76,18,73,200,62,200,42,99,188,63,73,207,154,238,98,14,224,33,103,255,188,202,60,84,33,248,184,78,240,231,221,198,98,244,79,237,208,100,110,251,209,4,221,129,70,179,162,173,26,9,38,199,115,85,231,208,141,13,135,35,144,151,124,233,151,6,119,79,51,128,236,157,32,91,160,104,143,239,236,16,148,246,215,168,225,200,73,253,182,117,53,113,24,52,165,196,73,55,66,212,228,27,187,1,71,143,234,75,93,129,254,145,224,183,203,200,8,205,21,142,6,139,145,237,12,30,146,233,222,152,203,251,132,199,125,55,190,43,113,63,180,29,179,161]`,
  );
});

describe("E2E versioning", () => {
  test("same versions", async () => {
    const v0 = 0 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v0,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = await applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v0);

    assert(relayResponse.ok);
    expect(relayResponse.value.message.length).toMatchInlineSnapshot(`20`);
  });

  test("non-initiator version is higher", async () => {
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v0,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = await applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v1);
    assert(relayResponse.ok);

    const clientResult = await applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(relayResponse.value.message, { version: v0 });
    expect(clientResult).toEqual(
      err({
        type: "ProtocolVersionError",
        version: 1,
        isInitiator: true,
        ownerId: testOwner.id,
      }),
    );
  });

  test("initiator version is higher", async () => {
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v1,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = await applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v0);
    assert(relayResponse.ok);

    const clientResult = await applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(relayResponse.value.message, { version: v1 });
    expect(clientResult).toEqual(
      err({
        type: "ProtocolVersionError",
        version: 0,
        isInitiator: false,
        ownerId: testOwner.id,
      }),
    );
  });
});

describe("E2E errors", () => {
  test("ProtocolInvalidDataError", async () => {
    const malformedMessage = createBuffer();
    encodeNonNegativeInt(malformedMessage, 1 as NonNegativeInt); // Only version, no ownerId

    const clientResult = await applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(malformedMessage.unwrap(), { version: 0 as NonNegativeInt });

    assert(!clientResult.ok);
    expect(clientResult.error.type).toBe("ProtocolInvalidDataError");
  });

  test("ProtocolWriteKeyError", async () => {
    const deps = createTestDeps();
    const timestamp = timestampBytesToTimestamp(testTimestampsAsc[0]);
    const dbChange = createDbChange(deps);

    const messages: NonEmptyReadonlyArray<CrdtMessage> = [
      { timestamp, change: dbChange },
    ];

    const initiatorMessage = createProtocolMessageFromCrdtMessages(deps)(
      testOwner,
      messages,
    );

    const responseWithWriteKeyError = await applyProtocolMessageAsRelay({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        validateWriteKey: constFalse,
      },
    })(initiatorMessage);

    assert(responseWithWriteKeyError.ok);
    expect(responseWithWriteKeyError.value.message).toMatchInlineSnapshot(
      `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,1,1,0]`,
    );

    expect(
      await applyProtocolMessageAsClient(shouldNotBeCalledStorageDep)(
        responseWithWriteKeyError.value.message,
      ),
    ).toEqual(err({ type: "ProtocolWriteKeyError", ownerId: testOwner.id }));
  });
});

describe("E2E relay options", () => {
  test("subscribe", async () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Subscribe,
    }).unwrap();
    let subscribeCalledWithOwnerId: string | null = null;

    await applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      subscribe: (ownerId) => {
        subscribeCalledWithOwnerId = ownerId;
        return true;
      },
    });

    expect(subscribeCalledWithOwnerId).toBe(testOwner.id);
  });

  test("unsubscribe", async () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Unsubscribe,
    }).unwrap();
    let unsubscribeCalledWithOwnerId: string | null = null;

    await applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      unsubscribe: (ownerId) => {
        unsubscribeCalledWithOwnerId = ownerId;
      },
    });

    expect(unsubscribeCalledWithOwnerId).toBe(testOwner.id);
  });

  test("no subscription flag (None)", async () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.None,
    }).unwrap();
    let subscribeWasCalled = false;
    let unsubscribeWasCalled = false;

    await applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      subscribe: () => {
        subscribeWasCalled = true;
        return true;
      },
      unsubscribe: () => {
        unsubscribeWasCalled = true;
      },
    });

    expect(subscribeWasCalled).toBe(false);
    expect(unsubscribeWasCalled).toBe(false);
  });

  test("default subscription flag (undefined)", async () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      // No subscriptionFlag provided, should default to None
    }).unwrap();
    let subscribeWasCalled = false;
    let unsubscribeWasCalled = false;

    await applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      subscribe: () => {
        subscribeWasCalled = true;
        return true;
      },
      unsubscribe: () => {
        unsubscribeWasCalled = true;
      },
    });

    expect(subscribeWasCalled).toBe(false);
    expect(unsubscribeWasCalled).toBe(false);
  });

  test("broadcast message", async () => {
    const deps = createTestDeps();
    const timestamp = timestampBytesToTimestamp(testTimestampsAsc[0]);
    const dbChange = createDbChange(deps);
    const messages: NonEmptyReadonlyArray<CrdtMessage> = [
      { timestamp, change: dbChange },
    ];

    const initiatorMessage = createProtocolMessageFromCrdtMessages(deps)(
      testOwner,
      messages,
    );

    expect(initiatorMessage).toMatchInlineSnapshot(
      `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,0,1,172,144,67,75,249,177,167,163,209,113,55,184,160,22,72,143,0,1,0,0,1,0,0,0,0,0,0,0,0,1,145,1,154,15,34,119,141,80,147,177,241,14,128,41,142,157,38,100,106,119,182,150,57,231,121,203,120,244,185,167,187,69,70,221,148,117,128,101,150,172,36,118,246,47,92,86,32,115,84,235,133,24,165,213,71,107,135,41,22,156,220,147,76,164,225,32,110,204,134,121,28,157,22,37,84,119,3,255,152,0,42,64,89,207,122,252,24,211,244,82,92,48,212,82,141,76,208,175,248,77,122,127,92,161,9,216,108,124,93,96,54,66,154,24,145,71,40,243,37,153,139,123,191,6,169,17,98,30,225,213,255,109,41,13,94,96,198,34,147,51,144,95,189,162,238,214,182]`,
    );

    let broadcastedMessage = null as Uint8Array | null;

    await applyProtocolMessageAsRelay({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        validateWriteKey: constTrue,
        writeMessages: () => Promise.resolve(ok()),
      },
    })(initiatorMessage, {
      broadcast: (ownerId, message) => {
        expect(ownerId).toBe(testOwner.id);
        broadcastedMessage = message;
      },
    });

    assert(broadcastedMessage);
    // Added error and removed writeKey, added subscription flag
    expect(broadcastedMessage).toMatchInlineSnapshot(
      `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,2,1,0,0,1,0,0,0,0,0,0,0,0,1,145,1,154,15,34,119,141,80,147,177,241,14,128,41,142,157,38,100,106,119,182,150,57,231,121,203,120,244,185,167,187,69,70,221,148,117,128,101,150,172,36,118,246,47,92,86,32,115,84,235,133,24,165,213,71,107,135,41,22,156,220,147,76,164,225,32,110,204,134,121,28,157,22,37,84,119,3,255,152,0,42,64,89,207,122,252,24,211,244,82,92,48,212,82,141,76,208,175,248,77,122,127,92,161,9,216,108,124,93,96,54,66,154,24,145,71,40,243,37,153,139,123,191,6,169,17,98,30,225,213,255,109,41,13,94,96,198,34,147,51,144,95,189,162,238,214,182]`,
    );

    let writeMessagesCalled = false;
    const result = await applyProtocolMessageAsClient({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        // eslint-disable-next-line @typescript-eslint/require-await
        writeMessages: async (ownerId, encryptedMessages) => {
          writeMessagesCalled = true;
          expect(ownerId).toEqual(testOwnerIdBytes);
          expect(encryptedMessages.length).toBe(messages.length);
          return ok();
        },
      },
    })(broadcastedMessage);

    expect(result.ok).toBe(true);
    expect(writeMessagesCalled).toBe(true);
  });
});

describe("E2E sync", () => {
  const deps = createTestDeps();

  const messages = testTimestampsAsc.map(
    (t): EncryptedCrdtMessage => ({
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
    }),
  );
  assertNonEmptyArray(messages);

  const createStorages = async () => {
    const clientStorageDep = await testCreateRelayStorageAndSqliteDeps();
    const relayStorageDep = await testCreateRelayStorageAndSqliteDeps();
    return [clientStorageDep.storage, relayStorageDep.storage];
  };

  const reconcile = async (
    clientStorage: Storage,
    relayStorage: Storage,
    rangesMaxSize = defaultProtocolMessageRangesMaxSize,
  ) => {
    const clientStorageDep = { storage: clientStorage };
    const relayStorageDep = { storage: relayStorage };

    let message = createProtocolMessageForSync(clientStorageDep)(testOwner.id);
    assert(message);

    let result;
    let turn = "relay";
    let syncSteps = 0;
    const syncSizes: Array<number> = [message.length];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (message) {
      syncSteps++;

      if (syncSteps > 100) {
        throw new Error(syncSteps.toString());
      }

      result =
        turn === "relay"
          ? await applyProtocolMessageAsRelay(relayStorageDep)(message, {
              rangesMaxSize,
            })
          : await applyProtocolMessageAsClient(clientStorageDep)(message, {
              getWriteKey: () => testOwner.writeKey,
              rangesMaxSize,
            });

      if (!result.ok || result.value.type === "no-response") break;
      assert(result.value.type !== "broadcast");
      message = result.value.message;

      turn = turn === "relay" ? "client" : "relay";
      syncSizes.push(result.value.message.length);
    }

    for (const message of messages) {
      expect(
        clientStorage
          .readDbChange(
            testOwnerIdBytes,
            timestampToTimestampBytes(message.timestamp),
          )
          ?.join(),
      ).toBe(message.change.join());

      expect(
        relayStorage
          .readDbChange(
            testOwnerIdBytes,
            timestampToTimestampBytes(message.timestamp),
          )
          ?.join(),
      ).toBe(message.change.join());
    }

    // Ensure number of sync steps is even (relay/client turns alternate)
    expect(syncSteps % 2).toBe(0);

    return { syncSteps, syncSizes };
  };

  it("client and relay have all data", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    await clientStorage.writeMessages(testOwnerIdBytes, messages);
    await relayStorage.writeMessages(testOwnerIdBytes, messages);

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          356,
          20,
        ],
        "syncSteps": 2,
      }
    `);
  });

  it("client has all data", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    await clientStorage.writeMessages(testOwnerIdBytes, messages);

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          356,
          179,
          999468,
          40,
          669628,
          20,
        ],
        "syncSteps": 6,
      }
    `);
  });

  it("client has all data - many steps", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    await clientStorage.writeMessages(testOwnerIdBytes, messages);

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          356,
          179,
          999468,
          40,
          161560,
          40,
          144597,
          40,
          152440,
          40,
          167124,
          40,
          56082,
          20,
        ],
        "syncSteps": 14,
      }
    `);
  });

  it("relay has all data", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    await relayStorage.writeMessages(testOwnerIdBytes, messages);

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          24,
          999909,
          57,
          686240,
        ],
        "syncSteps": 4,
      }
    `);
  });

  it("relay has all data - many steps", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    await relayStorage.writeMessages(testOwnerIdBytes, messages);

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          24,
          158737,
          57,
          168265,
          57,
          153402,
          57,
          167719,
          57,
          163261,
          57,
          156844,
          57,
          157415,
          57,
          143584,
          57,
          149391,
          57,
          163339,
          57,
          116034,
        ],
        "syncSteps": 22,
      }
    `);
  });

  it("client and relay each have a random half of the data", async () => {
    const [clientStorage, relayStorage] = await createStorages();

    const shuffledMessages = deps.randomLib.shuffle(messages);
    const middle = Math.floor(shuffledMessages.length / 2);
    const firstHalf = shuffledMessages.slice(0, middle);
    const secondHalf = shuffledMessages.slice(middle);

    assertNonEmptyArray(firstHalf);
    assertNonEmptyArray(secondHalf);

    await clientStorage.writeMessages(testOwnerIdBytes, firstHalf);
    await relayStorage.writeMessages(testOwnerIdBytes, secondHalf);

    const syncSteps = await reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          370,
          5115,
          19549,
          856829,
          833927,
          20,
        ],
        "syncSteps": 6,
      }
    `);
  });

  it("client and relay each have a random half of the data - many steps", async () => {
    const [clientStorage, relayStorage] = await createStorages();

    const shuffledMessages = deps.randomLib.shuffle(messages);
    const middle = Math.floor(shuffledMessages.length / 2);
    const firstHalf = shuffledMessages.slice(0, middle);
    const secondHalf = shuffledMessages.slice(middle);

    assertNonEmptyArray(firstHalf);
    assertNonEmptyArray(secondHalf);

    await clientStorage.writeMessages(testOwnerIdBytes, firstHalf);
    await relayStorage.writeMessages(testOwnerIdBytes, secondHalf);

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          392,
          2297,
          2312,
          87652,
          84100,
          2261,
          80570,
          85941,
          2256,
          82347,
          73183,
          2305,
          2310,
          75079,
          82276,
          2254,
          76742,
          73708,
          2269,
          63053,
          71318,
          2264,
          61137,
          62387,
          2282,
          67486,
          63280,
          2268,
          55213,
          57134,
          2252,
          44664,
          53842,
          47057,
          88259,
          38464,
          74994,
          72708,
        ],
        "syncSteps": 38,
      }
    `);
  });

  it("starts sync from createProtocolMessageFromCrdtMessages", async () => {
    const owner = testOwner;
    const crdtMessages = testTimestampsAsc.map(
      (t): CrdtMessage => ({
        timestamp: timestampBytesToTimestamp(t),
        change: DbChange.orThrow({
          table: "foo",
          id: createId(deps),
          values: { bar: "baz" },
          isInsert: true,
          isDelete: null,
        }),
      }),
    );
    assertNonEmptyArray(crdtMessages);

    const protocolMessage = createProtocolMessageFromCrdtMessages(deps)(
      owner,
      crdtMessages,
      // This is technically invalid, we use it to enforce a sync.
      1000 as ProtocolMessageMaxSize,
    );

    const relayStorageDep = await testCreateRelayStorageAndSqliteDeps();

    const relayResult =
      await applyProtocolMessageAsRelay(relayStorageDep)(protocolMessage);

    assert(relayResult.ok);
    expect(relayResult.value.message).toMatchInlineSnapshot(
      `uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,1,0,0,1,2,9,0,163,205,139,2,152,222,222,3,141,195,32,138,221,210,1,216,167,200,1,243,155,45,128,152,244,5,167,136,182,1,0,9,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6]`,
    );
    // Sync continue
    expect(relayResult.value).not.toBe(null);
  });
});

describe("ranges sizes", () => {
  it("31 timestamps", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
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
    ).toMatchInlineSnapshot(`"240 191"`);
  });

  it("testTimestampsAsc", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
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
    ).toMatchInlineSnapshot(`"31636 17683"`);
  });

  it("fingerprints", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
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
    ).toMatchInlineSnapshot(`"332 315"`);
  });
});
