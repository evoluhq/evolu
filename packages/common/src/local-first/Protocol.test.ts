import * as fc from "fast-check";
import { describe, it, test } from "node:test";
import type { NonEmptyReadonlyArray } from "../Array.ts";
import {
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "../Assert.ts";
import { createBuffer, encodeNonNegativeInt } from "../Buffer.ts";
import { EncryptionKey } from "../Crypto.ts";
import { constFalse, constTrue } from "../Function.ts";
import { SqliteValue } from "../Sqlite.ts";
import {
  ownerIdToOwnerIdBytes,
  testAppOwner,
  type OwnerIdBytes,
} from "./Owner.ts";
import {
  applyProtocolMessageAsClient,
  applyProtocolMessageAsRelay,
  createProtocolMessageBuffer,
  createProtocolMessageFromCrdtMessages,
  createTimestampsBuffer,
  decodeSqliteValue,
  decryptAndDecodeDbChange,
  encodeSqliteValue,
  encodeAndEncryptDbChange,
  MessageType,
  parseProtocolHeader,
  ProtocolValueType,
  protocolVersion,
  SubscriptionFlags,
} from "./Protocol.ts";
import type {
  CrdtMessage,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  StorageDep,
} from "./Storage.ts";
import { DbChange, InfiniteUpperBound, RangeType } from "./Storage.ts";
import { err, getOrThrow, ok } from "../Result.ts";
import {
  testCreateDeps,
  testCreateRun,
  type RunDefaultDeps,
  type TestRunDefaultDeps as TestDeps,
} from "../Task.ts";
import { maxMillis, Millis } from "../Time.ts";
import {
  createId,
  DateIsoFromDate,
  FiniteNumber,
  NonNegativeInt,
  PositiveInt,
} from "../Type.ts";
import {
  createInitialTimestamp,
  createTimestamp,
  maxCounter,
  maxNodeId,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "./Timestamp.ts";

const testTimestampsAsc = [
  timestampToTimestampBytes(createTimestamp()),
  timestampToTimestampBytes(createTimestamp({ millis: Millis.orThrow(1) })),
] as const;

const maxTimestamp = timestampToTimestampBytes(
  createTimestamp({
    millis: maxMillis,
    counter: maxCounter,
    nodeId: maxNodeId,
  }),
);

test("protocolVersion", () => {
  assertEqual(protocolVersion, 1);
});

test("ProtocolValueType", () => {
  assertEqual(ProtocolValueType, {
    Base64Url: 32,
    Bytes: 23,
    DateIsoWithNegativeTime: 36,
    DateIsoWithNonNegativeTime: 35,
    EmptyString: 31,
    Id: 33,
    Json: 34,
    NonNegativeInt: 30,
    Null: 22,
    Number: 21,
    String: 20,
  });
});

test("encodeSqliteValue/decodeSqliteValue", () => {
  const deps = testCreateDeps();
  const id = createId(deps);
  const testCasesSuccess: Array<[SqliteValue, number]> = [
    // empty string optimization - 1 byte vs 2 bytes (50% reduction)
    ["", 1],
    // encodeNumber
    [FiniteNumber.orThrow(123.5), 10],
    // encodeNumber
    [FiniteNumber.orThrow(-123), 3],
    [null, 1],
    [new Uint8Array([1, 2, 3]), 5],
    [id, 17],
    // small ints 0-19
    [FiniteNumber.orThrow(0), 1],
    // small ints 0-19
    [FiniteNumber.orThrow(19), 1],
    // NonNegativeInt
    [FiniteNumber.orThrow(123), 2],
    // NonNegativeInt
    [FiniteNumber.orThrow(16383), 3],
    // 18 bytes MessagePack + 2 bytes protocol overhead
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

    assertEqual(encoded.getLength(), bytesLength);
    assertEqual(decodeSqliteValue(encoded), value);
  });
  assertEqualBytes(
    buffer.unwrap(),
    [
      31, 21, 203, 64, 94, 224, 0, 0, 0, 0, 0, 21, 208, 133, 22, 23, 3, 1, 2, 3,
      33, 157, 202, 140, 67, 91, 176, 119, 159, 179, 127, 150, 10, 81, 180, 247,
      84, 0, 19, 30, 123, 30, 255, 127, 34, 18, 130, 167, 99, 111, 109, 112, 97,
      99, 116, 195, 166, 115, 99, 104, 101, 109, 97, 0, 36, 203, 194, 204, 69,
      55, 130, 48, 0, 0, 35, 128, 232, 252, 254, 173, 50, 35, 128, 168, 131,
      232, 192, 127, 35, 128, 128, 200, 165, 182, 128, 1, 35, 255, 183, 255,
      144, 253, 206, 57,
    ],
  );
});

test("encodeSqliteValue/decodeSqliteValue preserves an own __proto__ JSON object key", () => {
  const value = '{"__proto__":{"safe":true}}';
  const buffer = createBuffer();

  encodeSqliteValue(buffer, value);

  assertEqual(decodeSqliteValue(buffer), value);
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
        fc.double().filter(Number.isFinite),
        // Binary data
        fc.uint8Array(),

        // Small ints (0-19) - special encoding
        fc.integer({ min: 0, max: 19 }),
        // Non-negative ints
        fc.integer({ min: 20, max: Number.MAX_SAFE_INTEGER }),
        // Negative numbers
        fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
        // Regular floats
        fc.float({ min: -1000, max: 1000 }).filter(Number.isFinite),

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
        const sqliteValue = SqliteValue.orThrow(value);
        const buffer = createBuffer();
        encodeSqliteValue(buffer, sqliteValue);
        const decoded = decodeSqliteValue(buffer);

        // Handle special cases for comparison
        if (
          sqliteValue instanceof Uint8Array &&
          decoded instanceof Uint8Array
        ) {
          return (
            sqliteValue.length === decoded.length &&
            sqliteValue.every((byte, i) => byte === decoded[i])
          );
        }

        return globalThis.Object.is(decoded, sqliteValue);
      },
    ),
    { numRuns: 10000 },
  );
});

test("decodeSqliteValue rejects trailing data in a JSON frame", () => {
  const buffer = createBuffer([ProtocolValueType.Json, 2, 0xc0, 0xc0]);

  const error = assertThrowsInstanceOf(() => decodeSqliteValue(buffer), Error);
  assertEqual(error.message, "Invalid JSON MessagePack length");
});

test("decodeSqliteValue does not decode beyond a JSON frame", () => {
  const bytesAfterFrame = new Uint8Array([0xc0, 0xc0]);
  const buffer = createBuffer([
    ProtocolValueType.Json,
    5,
    0xdd,
    0,
    0,
    0,
    2,
    ...bytesAfterFrame,
  ]);

  const error = assertThrowsInstanceOf(() => decodeSqliteValue(buffer), Error);
  assertEqual(error.message, "Buffer parse ended prematurely");
  assertEqualBytes(buffer.unwrap(), bytesAfterFrame);
});

test("encodeSqliteValue/decodeSqliteValue specific failing case from property tests", () => {
  // This was the specific failing case from property tests before the DateIsoString fix
  const failingInput = `["0 (      ",-100000000]`;

  const buffer = createBuffer();
  encodeSqliteValue(buffer, failingInput);
  const decoded = decodeSqliteValue(buffer);

  // After the DateIsoString round-trip fix, this should now work correctly
  // The input should be treated as a regular string (not DateIso) and round-trip properly
  assertEqual(decoded, failingInput);
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
  assertEqualBytes(
    encryptedMessage.change,
    [
      61, 17, 38, 101, 206, 230, 156, 196, 117, 122, 86, 130, 104, 17, 74, 160,
      137, 87, 251, 80, 60, 4, 187, 82, 120, 9, 50, 95, 6, 212, 192, 215, 212,
      240, 254, 11, 101, 113, 29, 11, 162, 146, 20, 200, 144, 145, 81, 15, 109,
      39, 41, 118, 215, 227, 212, 2, 217, 19, 197, 97, 11, 243, 146, 145, 67,
      17, 119, 86, 239, 234, 243, 1, 204, 183, 182, 137, 63, 25, 61, 156, 207,
      208, 27, 245, 222, 183, 68, 23, 42, 207, 92, 45, 184, 244, 180, 51, 216,
      127, 250, 165, 184, 202, 205, 155, 238, 38, 175, 27, 116, 71, 192, 59,
      240, 72, 174, 147, 90, 149, 89, 211, 36, 206, 34, 16, 160, 198, 99, 70,
      123, 16, 151, 77, 131, 12, 246, 54, 44, 72, 34, 252, 143, 75, 40, 144, 1,
    ],
  );
  const decrypted = getOrThrow(
    decryptAndDecodeDbChange(encryptedMessage, testAppOwner.encryptionKey),
  );
  assertEqual(decrypted, crdtMessage.change);

  const wrongKey = EncryptionKey.orThrow(new Uint8Array(32).fill(42));
  const decryptedWithWrongKey = decryptAndDecodeDbChange(
    encryptedMessage,
    wrongKey,
  );
  assertFalse(decryptedWithWrongKey.ok);
  assertEqual(
    decryptedWithWrongKey.error.type,
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
  assertFalse(decryptedCorrupted.ok);
  assertEqual(
    decryptedCorrupted.error.type,
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

  assertEqual(
    getOrThrow(
      decryptAndDecodeDbChange(encryptedMessage, testAppOwner.encryptionKey),
    ),
    message.change,
  );
});

test("encodeAndEncryptDbChange preserves negative zero", () => {
  const deps = testCreateDeps();
  const message: CrdtMessage = {
    timestamp: createInitialTimestamp(deps),
    change: DbChange.orThrow({
      table: "employee",
      id: createId(deps),
      values: { score: FiniteNumber.orThrow(-0) },
      isInsert: false,
      isDelete: null,
    }),
  };
  const encryptedMessage = createEncryptedCrdtMessage(deps, message);
  const decrypted = getOrThrow(
    decryptAndDecodeDbChange(encryptedMessage, testAppOwner.encryptionKey),
  );

  assertSame(decrypted.values.score, -0);
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

  assertEqual(
    decryptedWithWrongTimestamp,
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
  assertEqual(buffer.getLength(), 21);
});

describe("createProtocolMessageBuffer", () => {
  it("should allow no ranges", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    assertEqualBytes(
      buffer.unwrap(),
      [
        1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235,
        212, 0, 0, 0, 0,
      ],
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
    buffer.unwrap();
  });

  it("should reject single range without InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[0],
    });
    const error = assertThrowsInstanceOf(() => buffer.unwrap(), Error);
    assertEqual(
      error.message,
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
    buffer.unwrap();
  });

  it("should reject range added after InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    const error = assertThrowsInstanceOf(() => {
      buffer.addRange({
        type: RangeType.Skip,
        upperBound: testTimestampsAsc[0],
      });
    }, Error);
    assertEqual(
      error.message,
      "Cannot add a range after an InfiniteUpperBound range",
    );
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
    const error = assertThrowsInstanceOf(() => {
      buffer.addRange({
        type: RangeType.Skip,
        upperBound: InfiniteUpperBound,
      });
    }, Error);
    assertEqual(
      error.message,
      "Cannot add a range after an InfiniteUpperBound range",
    );
  });
});

test("parseProtocolHeader parses supported headers and rejects malformed ones", () => {
  const requestHeader = parseProtocolHeader(
    createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Subscribe,
    }).unwrap(),
  );
  assertEqual(
    requestHeader,
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
  assertEqual(
    responseHeader,
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
  assertEqual(
    broadcastHeader,
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
  assertFalse(invalidVersion.ok);
  if (!invalidVersion.ok) {
    assertEqual(invalidVersion.error.type, "ProtocolInvalidDataError");
    assertInstanceOf(invalidVersion.error.error, Error);
  }

  const invalidTypeMessage = createBuffer();
  encodeNonNegativeInt(invalidTypeMessage, protocolVersion);
  invalidTypeMessage.extend(ownerIdToOwnerIdBytes(testAppOwner.id));
  invalidTypeMessage.extend([255]);

  const invalidType = parseProtocolHeader(invalidTypeMessage.unwrap());
  assertFalse(invalidType.ok);
  if (!invalidType.ok) {
    assertEqual(invalidType.error.type, "ProtocolInvalidDataError");
    assertInstanceOf(invalidType.error.error, Error);
  }
});

describe("E2E versioning", () => {
  it("same versions", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const v0 = 0 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testAppOwner.id, {
      version: v0,
      messageType: MessageType.Request,
    }).unwrap();

    const relayResponse = await run.orThrow(
      applyProtocolMessageAsRelay(clientMessage, {}, v0),
    );
    assertEqual(relayResponse.message.length, 20);
  });

  it("non-initiator version is higher", async () => {
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
    assertEqual(
      clientResult,
      err({
        type: "ProtocolVersionError",
        version: 1,
        isInitiator: true,
        ownerId: testAppOwner.id,
      }),
    );
  });

  it("initiator version is higher", async () => {
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
    assertEqual(
      clientResult,
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
  it("ProtocolInvalidDataError", async () => {
    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const malformedMessage = createBuffer();
    // Only version, no ownerId
    encodeNonNegativeInt(malformedMessage, 1 as NonNegativeInt);

    const clientResult = await run(
      applyProtocolMessageAsClient(malformedMessage.unwrap(), {
        version: 0 as NonNegativeInt,
      }),
    );

    assertFalse(clientResult.ok);
    assertEqual(clientResult.error.type, "ProtocolInvalidDataError");
  });

  it("ProtocolWriteKeyError", async () => {
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
      assertEqualBytes(
        response.message,
        [
          1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235,
          212, 1, 1, 0,
        ],
      );
      responseMessage = response.message;
    }

    await using run = testCreateRun(shouldNotBeCalledStorageDep);
    const clientResult = await run(
      applyProtocolMessageAsClient(responseMessage),
    );
    assertEqual(
      clientResult,
      err({ type: "ProtocolWriteKeyError", ownerId: testAppOwner.id }),
    );
  });
});

describe("E2E relay options", () => {
  it("subscribe", async () => {
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

    assertEqual(subscribeCalledWithOwnerId, testAppOwner.id);
  });

  it("unsubscribe", async () => {
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

    assertEqual(unsubscribeCalledWithOwnerId, testAppOwner.id);
  });

  it("no subscription flag (None)", async () => {
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

    assertFalse(subscribeWasCalled);
    assertFalse(unsubscribeWasCalled);
  });

  it("default subscription flag (undefined)", async () => {
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

    assertFalse(subscribeWasCalled);
    assertFalse(unsubscribeWasCalled);
  });

  it("broadcast message", async () => {
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

    assertEqualBytes(
      initiatorMessage,
      [
        1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235,
        212, 0, 1, 251, 175, 113, 170, 127, 245, 31, 104, 159, 23, 7, 74, 106,
        187, 137, 180, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 145, 1, 138,
        125, 164, 134, 128, 69, 100, 218, 61, 17, 38, 101, 206, 230, 156, 196,
        117, 122, 86, 130, 104, 17, 74, 160, 120, 248, 71, 117, 163, 185, 102,
        74, 58, 39, 102, 235, 141, 227, 226, 129, 183, 209, 55, 45, 27, 183,
        134, 35, 187, 95, 52, 188, 199, 131, 202, 240, 112, 108, 240, 162, 130,
        149, 239, 24, 101, 96, 218, 224, 225, 5, 94, 58, 141, 225, 132, 168,
        118, 184, 251, 105, 226, 136, 35, 94, 9, 34, 3, 128, 195, 153, 50, 60,
        181, 19, 194, 98, 84, 196, 202, 168, 140, 1, 127, 77, 88, 238, 211, 184,
        92, 117, 128, 144, 232, 210, 17, 27, 14, 157, 88, 96, 109, 76, 12, 230,
        193, 52, 89, 185, 127, 233, 137, 151, 101, 46, 245, 56, 125, 57, 126,
        177, 79, 113, 20, 30, 50,
      ],
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
          assertEqual(ownerId, testAppOwner.id);
          broadcastedMessage = message;
        },
      }),
    );

    assertNonNullable(broadcastedMessage);
    // Added error and removed writeKey, added subscription flag
    assertEqualBytes(
      broadcastedMessage,
      [
        1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235,
        212, 2, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 145, 1, 138, 125, 164,
        134, 128, 69, 100, 218, 61, 17, 38, 101, 206, 230, 156, 196, 117, 122,
        86, 130, 104, 17, 74, 160, 120, 248, 71, 117, 163, 185, 102, 74, 58, 39,
        102, 235, 141, 227, 226, 129, 183, 209, 55, 45, 27, 183, 134, 35, 187,
        95, 52, 188, 199, 131, 202, 240, 112, 108, 240, 162, 130, 149, 239, 24,
        101, 96, 218, 224, 225, 5, 94, 58, 141, 225, 132, 168, 118, 184, 251,
        105, 226, 136, 35, 94, 9, 34, 3, 128, 195, 153, 50, 60, 181, 19, 194,
        98, 84, 196, 202, 168, 140, 1, 127, 77, 88, 238, 211, 184, 92, 117, 128,
        144, 232, 210, 17, 27, 14, 157, 88, 96, 109, 76, 12, 230, 193, 52, 89,
        185, 127, 233, 137, 151, 101, 46, 245, 56, 125, 57, 126, 177, 79, 113,
        20, 30, 50,
      ],
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
              assertEqual(encryptedMessages.length, messages.length);
              return ok();
            },
        },
      });
      const result = await run(
        applyProtocolMessageAsClient(broadcastedMessage),
      );
      assertOk(result, { type: "NoResponse" });
    }
    assertTrue(writeMessagesCalled);
  });
});
