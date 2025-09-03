import { compress, init } from "@bokuweb/zstd-wasm";
import * as fc from "fast-check";
import { assert, beforeAll, describe, expect, it, test } from "vitest";
import { createBuffer } from "../../src/Buffer.js";
import {
  applyProtocolMessageAsClient,
  applyProtocolMessageAsRelay,
  createProtocolMessageBuffer,
  createProtocolMessageForSync,
  createProtocolMessageFromCrdtMessages,
  createTimestampsBuffer,
  decodeLength,
  decodeNodeId,
  decodeNonNegativeInt,
  decodeNumber,
  decodeSqliteValue,
  decodeString,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  encodeLength,
  encodeNodeId,
  encodeNonNegativeInt,
  encodeNumber,
  encodeSqliteValue,
  encodeString,
  maxProtocolMessageRangesSize,
  MessageType,
  ProtocolValueType,
  protocolVersion,
  SubscriptionFlags,
  TimestampsRangeWithTimestampsBuffer,
} from "../../src/Evolu/Protocol.js";
import { createRelayStorage } from "../../src/Evolu/Relay.js";
import {
  binaryTimestampToFingerprint,
  CrdtMessage,
  DbChange,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  InfiniteUpperBound,
  RangeType,
  Storage,
  StorageDep,
} from "../../src/Evolu/Storage.js";
import {
  binaryTimestampToTimestamp,
  createInitialTimestamp,
  timestampToBinaryTimestamp,
} from "../../src/Evolu/Timestamp.js";
import { constFalse, constTrue } from "../../src/Function.js";
import {
  assertNonEmptyArray,
  createRandom,
  EncryptionKey,
  NonEmptyReadonlyArray,
} from "../../src/index.js";
import { err, getOrThrow } from "../../src/Result.js";
import { SqliteValue } from "../../src/Sqlite.js";
import { DateIso, NonNegativeInt, PositiveInt } from "../../src/Type.js";
import {
  testCreateId,
  testCreateSqlite,
  testCreateTimingSafeEqual,
  testDeps,
  testNanoIdLibDep,
  testOwner,
  testOwnerBinaryId,
  testRandomLib,
  testSymmetricCrypto,
} from "../_deps.js";
import {
  maxTimestamp,
  testTimestampsAsc,
  testTimestampsRandom,
} from "./_fixtures.js";

// Note we use `.join()` on Uint8Array/Buffer for two reasons:
//  - We want toMatchInlineSnapshot to be a single line (a string is).
//  - better-sqlite3 returns Buffer (a subclass of Uint8Array) and toEqual expects
//    the same prototype.

beforeAll(async () => {
  await init();
});

/** Returns uncompressed and compressed sizes. */
const getUncompressedAndCompressedSizes = (array: Uint8Array) => {
  return `${array.byteLength} ${compress(array as never).length}`;
};

const createStorageDep = async (): Promise<StorageDep> => {
  const sqlite = await testCreateSqlite();
  const storage = getOrThrow(
    createRelayStorage({
      sqlite,
      random: createRandom(),
      timingSafeEqual: testCreateTimingSafeEqual(),
    })({
      onStorageError: (error) => {
        throw new Error(error.type);
      },
    }),
  );
  return { storage };
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

  expect(buffer.unwrap().join()).toMatchInlineSnapshot(
    `"0,42,208,133,203,64,9,33,249,240,27,134,110,203,67,63,255,255,255,255,255,255,203,195,63,255,255,255,255,255,255,203,127,240,0,0,0,0,0,0,203,255,240,0,0,0,0,0,0,203,127,248,0,0,0,0,0,0"`,
  );
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
  expect(protocolVersion).toBe(0);
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
  expect(buffer.unwrap().join()).toMatchInlineSnapshot(
    `"13,72,101,108,108,111,44,32,119,111,114,108,100,33"`,
  );
  expect(decodeString(buffer)).toBe(string);
});

test("encodeNodeId/decodeNodeId", () => {
  const testCases = Array.from({ length: 100 }).map(
    () => createInitialTimestamp(testNanoIdLibDep).nodeId,
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
      "Binary": 23,
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
  const testCasesSuccess: Array<[SqliteValue, number]> = [
    ["", 1], // empty string optimization - 1 byte vs 2 bytes (50% reduction)
    [123.5, 10], // encodeNumber
    [-123, 3], // encodeNumber
    [null, 1],
    [new Uint8Array([1, 2, 3]), 5],
    [testCreateId(), 17],
    [0, 1], // small ints 0-19
    [19, 1], // small ints 0-19
    [123, 2], // NonNegativeInt
    [16383, 3], // NonNegativeInt
    ['{"compact":true,"schema":0}', 20], // 18 bytes msgpackr + 2 bytes protocol overhead
    // Protocol encoding ensures 6 bytes till the year 2108.
    [DateIso.fromOrThrow(new Date("0000-01-01T00:00:00.000Z")), 10],
    [DateIso.fromOrThrow(new Date("2024-10-31T00:00:00.000Z")), 7],
    [DateIso.fromOrThrow(new Date("2108-10-31T00:00:00.000Z")), 7],
    [DateIso.fromOrThrow(new Date("2109-10-31T00:00:00.000Z")), 8],
    [DateIso.fromOrThrow(new Date("9999-12-31T23:59:59.999Z")), 8],
  ];

  const buffer = createBuffer();
  testCasesSuccess.forEach(([value, bytesLength]) => {
    const encoded = createBuffer();
    encodeSqliteValue(encoded, value);
    buffer.extend(encoded.unwrap());

    expect(encoded.getLength()).toBe(bytesLength);
    expect(decodeSqliteValue(encoded)).toStrictEqual(value);
  });
  expect(buffer.unwrap().join()).toMatchInlineSnapshot(
    `"31,21,203,64,94,224,0,0,0,0,0,21,208,133,22,23,3,1,2,3,33,22,20,26,143,148,38,115,42,65,147,87,230,226,141,159,8,0,19,30,123,30,255,127,34,18,130,167,99,111,109,112,97,99,116,195,166,115,99,104,101,109,97,0,36,203,194,204,69,55,130,48,0,0,35,128,232,252,254,173,50,35,128,168,131,232,192,127,35,128,128,200,165,182,128,1,35,255,183,255,144,253,206,57"`,
  );
});

test("encodeSqliteValue/decodeSqliteValue property tests", () => {
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
        fc.constantFrom(testCreateId()), // Valid Id
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

const createDbChange = (): DbChange => ({
  table: "employee",
  id: testCreateId(),
  values: {
    name: "Victoria",
    hiredAt: DateIso.fromOrThrow(new Date("2024-10-31")),
    officeId: testCreateId(),
  },
});

const createTestCrdtMessage = (): CrdtMessage => ({
  timestamp: createInitialTimestamp(testNanoIdLibDep),
  change: createDbChange(),
});

const createEncryptedDbChange = (message: CrdtMessage): EncryptedDbChange =>
  encodeAndEncryptDbChange({ symmetricCrypto: testSymmetricCrypto })(
    message,
    testOwner.encryptionKey,
  );

const createEncryptedCrdtMessage = (
  message: CrdtMessage,
): EncryptedCrdtMessage => ({
  timestamp: message.timestamp,
  change: createEncryptedDbChange(message),
});

test("encodeAndEncryptDbChange/decryptAndDecodeDbChange", () => {
  const crdtMessage = createTestCrdtMessage();
  const encryptedMessage = createEncryptedCrdtMessage(crdtMessage);
  expect(encryptedMessage.change.join()).toMatchInlineSnapshot(
    `"149,88,168,255,159,170,32,144,166,127,188,43,16,197,141,78,178,25,209,69,79,137,211,186,120,89,68,115,201,20,188,25,107,207,226,207,25,113,154,119,48,137,23,100,221,136,33,234,191,149,54,55,4,80,245,119,72,37,102,23,181,187,177,238,170,113,181,52,134,209,234,94,22,160,170,34,79,41,203,219,148,204,123,190,61,125,163,37,229,226,57,157,101,78,216,162,253,247,117,96,108,221,94,36,217,25,99,46,61,151,46,59,158,70,42,12,106,8,252,51,215,142,231,198,63,23,80,181,203,128,154,170,45,25,194,227,16,17,218,171,11,53,81,110,176"`,
  );
  const decrypted = decryptAndDecodeDbChange({
    symmetricCrypto: testSymmetricCrypto,
  })(encryptedMessage, testOwner.encryptionKey);
  assert(decrypted.ok);
  expect(decrypted.value).toEqual(crdtMessage.change);

  const wrongKey = new Uint8Array(32).fill(42) as EncryptionKey;
  const decryptedWithWrongKey = decryptAndDecodeDbChange({
    symmetricCrypto: testSymmetricCrypto,
  })(encryptedMessage, wrongKey);
  assert(!decryptedWithWrongKey.ok);
  expect(decryptedWithWrongKey.error.type).toBe("SymmetricCryptoDecryptError");

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
  const decryptedCorrupted = decryptAndDecodeDbChange({
    symmetricCrypto: testSymmetricCrypto,
  })(corruptedMessage, testOwner.encryptionKey);
  assert(!decryptedCorrupted.ok);
  expect(decryptedCorrupted.error.type).toBe("SymmetricCryptoDecryptError");
});

test("decryptAndDecodeDbChange timestamp tamper-proofing", () => {
  const crdtMessage = createTestCrdtMessage();
  const encryptedMessage = createEncryptedCrdtMessage(crdtMessage);

  // Create a different timestamp
  const wrongTimestamp = createInitialTimestamp(testNanoIdLibDep);

  // Create a message with the wrong timestamp but same encrypted change
  const tamperedMessage: EncryptedCrdtMessage = {
    timestamp: wrongTimestamp,
    change: encryptedMessage.change,
  };

  // Attempt to decrypt with wrong timestamp should fail with ProtocolTimestampMismatchError
  const decryptedWithWrongTimestamp = decryptAndDecodeDbChange({
    symmetricCrypto: testSymmetricCrypto,
  })(tamperedMessage, testOwner.encryptionKey);

  expect(decryptedWithWrongTimestamp).toEqual(
    err({
      type: "ProtocolTimestampMismatchError",
      expected: wrongTimestamp,
      embedded: crdtMessage.timestamp,
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
  buffer.add(binaryTimestampToTimestamp(maxTimestamp));
  expect(buffer.getLength()).toBe(21);
});

describe("createProtocolMessageBuffer", () => {
  it("should allow no ranges", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
    });
    expect(buffer.unwrap().join()).toMatchInlineSnapshot(
      `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,0,0,0"`,
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
  const storageDep = await createStorageDep();

  // Empty DB: version, ownerId, 0 messages, one empty TimestampsRange.
  expect(
    createProtocolMessageForSync(storageDep)(testOwner.id)?.join(),
  ).toMatchInlineSnapshot(
    `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,0,0,0,1,2,0"`,
  );

  const messages31 = testTimestampsAsc.slice(0, 31).map(
    (t): EncryptedCrdtMessage => ({
      timestamp: binaryTimestampToTimestamp(t),
      change: createEncryptedDbChange({
        timestamp: binaryTimestampToTimestamp(t),
        change: createDbChange(),
      }),
    }),
  );
  assertNonEmptyArray(messages31);
  storageDep.storage.writeMessages(testOwnerBinaryId, messages31);

  // DB with 31 timestamps: version, ownerId, 0 messages, one full (31) TimestampsRange.
  expect(
    createProtocolMessageForSync(storageDep)(testOwner.id)?.join(),
  ).toMatchInlineSnapshot(
    `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,0,0,0,1,2,31,0,163,205,139,2,152,222,222,3,141,195,32,138,221,210,1,216,167,200,1,243,155,45,128,152,244,5,167,136,182,1,199,139,225,5,131,234,154,8,0,150,132,58,233,134,161,1,222,244,220,1,250,141,170,3,248,167,204,1,0,161,234,59,0,192,227,115,181,188,169,1,224,169,247,4,205,177,37,143,161,242,1,137,231,180,2,161,244,87,235,207,53,133,244,180,1,142,243,223,10,158,141,113,0,11,1,1,0,5,1,1,0,1,1,1,0,11,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,11,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1"`,
  );

  const message32 = testTimestampsAsc.slice(32, 33).map(
    (t): EncryptedCrdtMessage => ({
      timestamp: binaryTimestampToTimestamp(t),
      change: createEncryptedDbChange({
        timestamp: binaryTimestampToTimestamp(t),
        change: createDbChange(),
      }),
    }),
  );
  assertNonEmptyArray(message32);
  storageDep.storage.writeMessages(testOwnerBinaryId, message32);

  // DB with 32 timestamps: version, ownerId, 0 messages, 16x FingerprintRange.
  expect(
    createProtocolMessageForSync(storageDep)(testOwner.id)?.join(),
  ).toMatchInlineSnapshot(
    `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,0,0,0,16,187,171,234,5,151,160,243,1,203,195,245,1,167,160,170,7,202,245,251,13,150,132,58,199,251,253,2,242,181,246,4,161,234,59,192,227,115,149,230,160,6,220,210,151,2,170,219,140,3,240,195,234,1,172,128,209,11,0,15,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,5,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,7,153,201,144,40,214,99,106,145,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,79,199,221,49,166,129,34,35,99,27,109,221,72,203,113,173,13,174,108,244,220,53,10,79,91,208,39,170,201,18,73,253,152,51,99,124,0,152,50,246,239,212,6,13,80,19,126,71,76,18,73,200,62,200,42,99,188,63,73,207,154,238,98,14,224,33,103,255,188,202,60,84,33,248,184,78,240,231,221,198,98,244,79,237,208,100,110,251,209,4,221,129,70,179,162,173,26,9,38,199,115,85,231,208,141,13,135,35,144,151,124,233,151,6,119,79,51,128,236,157,32,91,160,104,143,239,236,16,148,246,215,168,225,200,73,253,182,117,53,113,24,52,165,196,73,55,66,212,228,27,187,1,71,143,234,75,93,129,254,145,224,183,203,200,8,205,21,142,6,139,145,237,12,30,146,233,222,152,203,251,132,199,125,55,190,43,113,63,180,29,179,161"`,
  );
});

describe("E2E versioning", () => {
  test("same versions", () => {
    const v0 = 0 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v0,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v0);

    assert(relayResponse.ok);
    expect(relayResponse.value.message.length).toMatchInlineSnapshot(`20`);
  });

  test("non-initiator version is higher", () => {
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v0,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v1);
    assert(relayResponse.ok);

    const clientResult = applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(relayResponse.value.message, { version: v0 });
    expect(clientResult).toEqual(
      err({
        type: "ProtocolUnsupportedVersionError",
        unsupportedVersion: 1,
        isInitiator: true,
        ownerId: testOwner.id,
      }),
    );
  });

  test("initiator version is higher", () => {
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v1,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v0);
    assert(relayResponse.ok);

    const clientResult = applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(relayResponse.value.message, { version: v1 });
    expect(clientResult).toEqual(
      err({
        type: "ProtocolUnsupportedVersionError",
        unsupportedVersion: 0,
        isInitiator: false,
        ownerId: testOwner.id,
      }),
    );
  });
});

describe("E2E errors", () => {
  test("ProtocolInvalidDataError", () => {
    const malformedMessage = createBuffer();
    encodeNonNegativeInt(malformedMessage, 1 as NonNegativeInt); // Only version, no ownerId

    const clientResult = applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(malformedMessage.unwrap(), { version: 0 as NonNegativeInt });

    assert(!clientResult.ok);
    expect(clientResult.error.type).toBe("ProtocolInvalidDataError");
  });

  test("ProtocolWriteKeyError", () => {
    const timestamp = binaryTimestampToTimestamp(testTimestampsAsc[0]);
    const dbChange = createDbChange();

    const messages: NonEmptyReadonlyArray<CrdtMessage> = [
      { timestamp, change: dbChange },
    ];

    const initiatorMessage = createProtocolMessageFromCrdtMessages(testDeps)(
      testOwner,
      messages,
    );

    const responseWithWriteKeyError = applyProtocolMessageAsRelay({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        validateWriteKey: constFalse,
      },
    })(initiatorMessage);

    assert(responseWithWriteKeyError.ok);
    expect(
      responseWithWriteKeyError.value.message.join(),
    ).toMatchInlineSnapshot(
      `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,1,1,0"`,
    );

    expect(
      applyProtocolMessageAsClient(shouldNotBeCalledStorageDep)(
        responseWithWriteKeyError.value.message,
      ),
    ).toEqual(err({ type: "ProtocolWriteKeyError", ownerId: testOwner.id }));
  });
});

describe("E2E relay options", () => {
  test("subscribe", () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Subscribe,
    }).unwrap();
    let subscribeCalledWithOwnerId: string | null = null;

    applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      subscribe: (ownerId) => {
        subscribeCalledWithOwnerId = ownerId;
      },
    });

    expect(subscribeCalledWithOwnerId).toBe(testOwner.id);
  });

  test("unsubscribe", () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Unsubscribe,
    }).unwrap();
    let unsubscribeCalledWithOwnerId: string | null = null;

    applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      unsubscribe: (ownerId) => {
        unsubscribeCalledWithOwnerId = ownerId;
      },
    });

    expect(unsubscribeCalledWithOwnerId).toBe(testOwner.id);
  });

  test("no subscription flag (None)", () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.None,
    }).unwrap();
    let subscribeWasCalled = false;
    let unsubscribeWasCalled = false;

    applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      subscribe: () => {
        subscribeWasCalled = true;
      },
      unsubscribe: () => {
        unsubscribeWasCalled = true;
      },
    });

    expect(subscribeWasCalled).toBe(false);
    expect(unsubscribeWasCalled).toBe(false);
  });

  test("default subscription flag (undefined)", () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
      // No subscriptionFlag provided, should default to None
    }).unwrap();
    let subscribeWasCalled = false;
    let unsubscribeWasCalled = false;

    applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      subscribe: () => {
        subscribeWasCalled = true;
      },
      unsubscribe: () => {
        unsubscribeWasCalled = true;
      },
    });

    expect(subscribeWasCalled).toBe(false);
    expect(unsubscribeWasCalled).toBe(false);
  });

  test("broadcast message", () => {
    const timestamp = binaryTimestampToTimestamp(testTimestampsAsc[0]);
    const dbChange = createDbChange();
    const messages: NonEmptyReadonlyArray<CrdtMessage> = [
      { timestamp, change: dbChange },
    ];

    const initiatorMessage = createProtocolMessageFromCrdtMessages(testDeps)(
      testOwner,
      messages,
    );

    expect(initiatorMessage.join()).toMatchInlineSnapshot(
      `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,1,223,255,201,168,127,27,26,188,250,180,237,65,254,6,128,233,0,1,0,0,1,0,0,0,0,0,0,0,0,1,145,1,126,237,229,95,73,192,255,134,205,60,46,41,126,169,147,15,206,168,124,117,185,198,175,101,120,21,32,227,252,120,101,95,69,58,81,167,150,166,242,89,69,218,80,205,68,152,219,242,173,120,62,144,2,119,173,123,184,240,144,57,121,65,100,160,38,85,128,38,96,169,33,228,3,193,241,215,31,228,6,232,64,216,65,97,219,252,33,224,229,129,247,52,105,30,77,187,241,108,115,153,242,144,245,188,248,27,186,77,152,200,40,195,199,4,216,123,30,157,93,130,248,68,189,136,109,228,112,98,79,32,187,215,193,124,53,104,248,230,32,191,151,188,52,132,132"`,
    );

    let broadcastedMessage = null as Uint8Array | null;

    applyProtocolMessageAsRelay({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        validateWriteKey: constTrue,
        writeMessages: constTrue,
      },
    })(initiatorMessage, {
      broadcast: (ownerId, message) => {
        expect(ownerId).toBe(testOwner.id);
        broadcastedMessage = message;
      },
    });

    assert(broadcastedMessage);
    // Added error and removed writeKey, added subscription flag
    expect(broadcastedMessage.join()).toMatchInlineSnapshot(
      `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,2,1,0,0,1,0,0,0,0,0,0,0,0,1,145,1,126,237,229,95,73,192,255,134,205,60,46,41,126,169,147,15,206,168,124,117,185,198,175,101,120,21,32,227,252,120,101,95,69,58,81,167,150,166,242,89,69,218,80,205,68,152,219,242,173,120,62,144,2,119,173,123,184,240,144,57,121,65,100,160,38,85,128,38,96,169,33,228,3,193,241,215,31,228,6,232,64,216,65,97,219,252,33,224,229,129,247,52,105,30,77,187,241,108,115,153,242,144,245,188,248,27,186,77,152,200,40,195,199,4,216,123,30,157,93,130,248,68,189,136,109,228,112,98,79,32,187,215,193,124,53,104,248,230,32,191,151,188,52,132,132"`,
    );

    let writeMessagesCalled = false;
    const result = applyProtocolMessageAsClient({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        writeMessages: (ownerId, encryptedMessages) => {
          writeMessagesCalled = true;
          expect(ownerId).toEqual(testOwnerBinaryId);
          expect(encryptedMessages.length).toBe(messages.length);
          return true;
        },
      },
    })(broadcastedMessage);

    expect(result.ok).toBe(true);
    expect(writeMessagesCalled).toBe(true);
  });
});

describe("E2E sync", () => {
  const messages = testTimestampsAsc.map(
    (t): EncryptedCrdtMessage => ({
      timestamp: binaryTimestampToTimestamp(t),
      change: createEncryptedDbChange({
        timestamp: binaryTimestampToTimestamp(t),
        change: {
          table: "foo",
          id: testCreateId(),
          values: {
            bar: "x".repeat(testRandomLib.int(1, 500)),
          },
        },
      }),
    }),
  );
  assertNonEmptyArray(messages);

  const createStorages = async () => {
    const clientStorageDep = await createStorageDep();
    const relayStorageDep = await createStorageDep();
    return [clientStorageDep.storage, relayStorageDep.storage];
  };

  const reconcile = (
    clientStorage: Storage,
    relayStorage: Storage,
    rangesMaxSize = maxProtocolMessageRangesSize,
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
          ? applyProtocolMessageAsRelay(relayStorageDep)(message, {
              rangesMaxSize,
            })
          : applyProtocolMessageAsClient(clientStorageDep)(message, {
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
            testOwnerBinaryId,
            timestampToBinaryTimestamp(message.timestamp),
          )
          ?.join(),
      ).toBe(message.change.join());

      expect(
        relayStorage
          .readDbChange(
            testOwnerBinaryId,
            timestampToBinaryTimestamp(message.timestamp),
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
    clientStorage.writeMessages(testOwnerBinaryId, messages);
    relayStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(clientStorage, relayStorage);
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
    const [clientStorage, relayStorage] = await createStorages();
    clientStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          370,
          193,
          999889,
          40,
          664426,
          20,
        ],
        "syncSteps": 6,
      }
    `);
  });

  it("client has all data - many steps", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    clientStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(
      clientStorage,
      relayStorage,
      3000 as PositiveInt,
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          370,
          193,
          999889,
          40,
          152137,
          40,
          143573,
          40,
          159426,
          40,
          170735,
          40,
          50745,
          20,
        ],
        "syncSteps": 14,
      }
    `);
  });

  it("relay has all data", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    relayStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          24,
          999644,
          57,
          681701,
        ],
        "syncSteps": 4,
      }
    `);
  });

  it("relay has all data - many steps", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    relayStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(
      clientStorage,
      relayStorage,
      3000 as PositiveInt,
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          24,
          157709,
          57,
          159568,
          57,
          153049,
          57,
          164440,
          57,
          163515,
          57,
          160714,
          57,
          158445,
          57,
          138609,
          57,
          156857,
          57,
          167901,
          57,
          112325,
        ],
        "syncSteps": 22,
      }
    `);
  });

  it("client and relay each have a random half of the data", async () => {
    const [clientStorage, relayStorage] = await createStorages();

    const shuffledMessages = testRandomLib.shuffle(messages);
    const middle = Math.floor(shuffledMessages.length / 2);
    const firstHalf = shuffledMessages.slice(0, middle);
    const secondHalf = shuffledMessages.slice(middle);

    assertNonEmptyArray(firstHalf);
    assertNonEmptyArray(secondHalf);

    clientStorage.writeMessages(testOwnerBinaryId, firstHalf);
    relayStorage.writeMessages(testOwnerBinaryId, secondHalf);

    const syncSteps = reconcile(clientStorage, relayStorage);
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          370,
          5191,
          18203,
          855111,
          830482,
          20,
        ],
        "syncSteps": 6,
      }
    `);
  });

  it("client and relay each have a random half of the data - many steps", async () => {
    const [clientStorage, relayStorage] = await createStorages();

    const shuffledMessages = testRandomLib.shuffle(messages);
    const middle = Math.floor(shuffledMessages.length / 2);
    const firstHalf = shuffledMessages.slice(0, middle);
    const secondHalf = shuffledMessages.slice(middle);

    assertNonEmptyArray(firstHalf);
    assertNonEmptyArray(secondHalf);

    clientStorage.writeMessages(testOwnerBinaryId, firstHalf);
    relayStorage.writeMessages(testOwnerBinaryId, secondHalf);

    const syncSteps = reconcile(
      clientStorage,
      relayStorage,
      3000 as PositiveInt,
    );
    expect(syncSteps).toMatchInlineSnapshot(`
      {
        "syncSizes": [
          354,
          2327,
          2270,
          111157,
          94955,
          2227,
          2244,
          88653,
          76839,
          2308,
          2239,
          69616,
          78440,
          2260,
          70105,
          75936,
          2258,
          61261,
          72910,
          2220,
          63875,
          68974,
          2312,
          58846,
          69461,
          2227,
          56996,
          61238,
          2276,
          46488,
          56334,
          28845,
          67939,
          44473,
          40634,
          70448,
          28757,
          78110,
          75868,
          20,
        ],
        "syncSteps": 40,
      }
    `);
  });

  it("starts sync from createProtocolMessageFromCrdtMessages", async () => {
    const owner = testOwner;
    const crdtMessages = testTimestampsAsc.map(
      (t): CrdtMessage => ({
        timestamp: binaryTimestampToTimestamp(t),
        change: {
          table: "foo",
          id: testCreateId(),
          values: { bar: "baz" },
        },
      }),
    );
    assertNonEmptyArray(crdtMessages);

    const protocolMessage = createProtocolMessageFromCrdtMessages(testDeps)(
      owner,
      crdtMessages,
      // Enforce a sync
      1000 as PositiveInt,
    );

    const relayStorageDep = await createStorageDep();

    const relayResult =
      applyProtocolMessageAsRelay(relayStorageDep)(protocolMessage);

    assert(relayResult.ok);
    expect(relayResult.value.message.join()).toMatchInlineSnapshot(
      `"0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,1,0,0,1,2,9,0,163,205,139,2,152,222,222,3,141,195,32,138,221,210,1,216,167,200,1,243,155,45,128,152,244,5,167,136,182,1,0,9,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6"`,
    );
    // Sync continue
    expect(relayResult.value).not.toBe(null);
  });

  describe("property-based sync tests", () => {
    it("should sync correctly with arbitrary data distribution", () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              table: fc.constantFrom("users", "posts", "comments", "tags"),
              values: fc.record({
                name: fc.string({ minLength: 1, maxLength: 50 }),
                count: fc.integer({ min: 0, max: 1000 }),
                active: fc.boolean(),
              }),
            }),
            { minLength: 1, maxLength: 20 },
          ),
          fc.float({ min: 0, max: 1 }), // Split ratio for client/relay data
          async (testData, splitRatio) => {
            // Create messages from test data
            const testMessages = testData.map(
              (data, index): EncryptedCrdtMessage => ({
                timestamp: binaryTimestampToTimestamp(testTimestampsAsc[index % testTimestampsAsc.length]),
                change: createEncryptedDbChange({
                  timestamp: binaryTimestampToTimestamp(testTimestampsAsc[index % testTimestampsAsc.length]),
                  change: {
                    table: data.table,
                    id: testCreateId(),
                    values: data.values,
                  },
                }),
              }),
            );

            const [clientStorage, relayStorage] = await createStorages();

            // Randomly distribute data between client and relay
            const shuffledMessages = testRandomLib.shuffle(testMessages);
            const splitIndex = Math.floor(shuffledMessages.length * splitRatio);
            const clientMessages = shuffledMessages.slice(0, splitIndex);
            const relayMessages = shuffledMessages.slice(splitIndex);

            if (clientMessages.length > 0) {
              assertNonEmptyArray(clientMessages);
              clientStorage.writeMessages(testOwnerBinaryId, clientMessages);
            }
            if (relayMessages.length > 0) {
              assertNonEmptyArray(relayMessages);
              relayStorage.writeMessages(testOwnerBinaryId, relayMessages);
            }

            // Perform sync
            const syncResult = reconcile(clientStorage, relayStorage);

            // Verify all messages are present on both sides after sync
            for (const message of testMessages) {
              const clientData = clientStorage.readDbChange(
                testOwnerBinaryId,
                timestampToBinaryTimestamp(message.timestamp),
              );
              const relayData = relayStorage.readDbChange(
                testOwnerBinaryId,
                timestampToBinaryTimestamp(message.timestamp),
              );

              expect(clientData?.join()).toBe(message.change.join());
              expect(relayData?.join()).toBe(message.change.join());
            }

            // Sync should always terminate (no infinite loops)
            expect(syncResult.syncSteps).toBeLessThan(100);
            expect(syncResult.syncSteps % 2).toBe(0); // Even number of steps
          },
        ),
        { numRuns: 50 }, // Reduced runs since these are async tests
      );
    });

    it("should handle various message sizes and ranges configurations", () => {
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 15 }), // Number of messages
          fc.integer({ min: 1000, max: 8000 }), // Range max size
          fc.record({
            clientDataRatio: fc.float({ min: 0, max: 1 }),
            messageSize: fc.constantFrom("small", "medium", "large"),
          }),
          async (messageCount, rangeMaxSize, config) => {
            // Generate messages with different sizes
            const getMessageData = (size: string) => {
              switch (size) {
                case "small":
                  return { data: "x".repeat(testRandomLib.int(1, 10)) };
                case "medium":
                  return { data: "x".repeat(testRandomLib.int(50, 200)) };
                case "large":
                  return { data: "x".repeat(testRandomLib.int(400, 800)) };
                default:
                  return { data: "test" };
              }
            };

            const testMessages = Array.from({ length: messageCount }, (_, i): EncryptedCrdtMessage => ({
              timestamp: binaryTimestampToTimestamp(testTimestampsAsc[i % testTimestampsAsc.length]),
              change: createEncryptedDbChange({
                timestamp: binaryTimestampToTimestamp(testTimestampsAsc[i % testTimestampsAsc.length]),
                change: {
                  table: "test",
                  id: testCreateId(),
                  values: getMessageData(config.messageSize),
                },
              }),
            }));

            const [clientStorage, relayStorage] = await createStorages();

            // Split data according to ratio
            const shuffledMessages = testRandomLib.shuffle(testMessages);
            const splitIndex = Math.floor(shuffledMessages.length * config.clientDataRatio);
            const clientMessages = shuffledMessages.slice(0, splitIndex);
            const relayMessages = shuffledMessages.slice(splitIndex);

            if (clientMessages.length > 0) {
              assertNonEmptyArray(clientMessages);
              clientStorage.writeMessages(testOwnerBinaryId, clientMessages);
            }
            if (relayMessages.length > 0) {
              assertNonEmptyArray(relayMessages);
              relayStorage.writeMessages(testOwnerBinaryId, relayMessages);
            }

            // Sync with custom range size
            const syncResult = reconcile(
              clientStorage,
              relayStorage,
              rangeMaxSize as PositiveInt,
            );

            // Verify sync completed successfully
            for (const message of testMessages) {
              const clientData = clientStorage.readDbChange(
                testOwnerBinaryId,
                timestampToBinaryTimestamp(message.timestamp),
              );
              const relayData = relayStorage.readDbChange(
                testOwnerBinaryId,
                timestampToBinaryTimestamp(message.timestamp),
              );

              expect(clientData?.join()).toBe(message.change.join());
              expect(relayData?.join()).toBe(message.change.join());
            }

            // Sync efficiency checks
            expect(syncResult.syncSteps).toBeLessThan(100);
            expect(syncResult.syncSteps % 2).toBe(0);
            
            // With smaller range sizes, we expect more steps
            if (rangeMaxSize < 3000) {
              // Should use more granular steps
              expect(syncResult.syncSizes.length).toBeGreaterThanOrEqual(2);
            }
          },
        ),
        { numRuns: 30 },
      );
    });
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
      range.timestamps.add(binaryTimestampToTimestamp(t));
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
      range.timestamps.add(binaryTimestampToTimestamp(t));
    });

    buffer.addRange(range);

    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"31562 17574"`);
  });

  it("fingerprints", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      messageType: MessageType.Request,
    });

    testTimestampsAsc.slice(0, 16).forEach((timestamp, i) => {
      buffer.addRange({
        type: RangeType.Fingerprint,
        upperBound: i === 15 ? InfiniteUpperBound : timestamp,
        fingerprint: binaryTimestampToFingerprint(testTimestampsRandom[i]),
      });
    });

    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"332 315"`);
  });
});
