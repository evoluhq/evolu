import { compress, init } from "@bokuweb/zstd-wasm";
import {
  assert,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
  test,
} from "vitest";
import { createBuffer } from "../../src/Buffer.js";
import {
  applyProtocolMessageAsClient,
  applyProtocolMessageAsRelay,
  Base64Url256,
  base64Url256ToBytes,
  binaryIdToId,
  binaryOwnerIdToOwnerId,
  binaryTimestampToFingerprint,
  CrdtMessage,
  createProtocolMessageBuffer,
  createProtocolMessageForSync,
  createProtocolMessageForWriteKeyRotation,
  createProtocolMessageFromCrdtMessages,
  createTimestampsBuffer,
  DbChange,
  decodeBase64Url256,
  decodeBase64Url256WithLength,
  decodeLength,
  decodeNodeId,
  decodeNonNegativeInt,
  decodeNumber,
  decodeSqliteValue,
  decodeString,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  encodeBase64Url256,
  encodeLength,
  encodeNodeId,
  encodeNonNegativeInt,
  encodeNumber,
  encodeSqliteValue,
  encodeString,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  idToBinaryId,
  InfiniteUpperBound,
  maxProtocolMessageRangesSize,
  ownerIdToBinaryOwnerId,
  ProtocolValueType,
  protocolVersion,
  RangeType,
  Storage,
  StorageDep,
  TimestampsRangeWithTimestampsBuffer,
} from "../../src/Evolu/Protocol.js";
import { createRelayStorage } from "../../src/Evolu/Relay.js";
import {
  binaryTimestampToTimestamp,
  createInitialTimestamp,
  timestampToBinaryTimestamp,
} from "../../src/Evolu/Timestamp.js";
import { constFalse, constTrue } from "../../src/Function.js";
import {
  assertNonEmptyArray,
  createOwner,
  createRandom,
  createWriteKey,
  EncryptionKey,
  NonEmptyReadonlyArray,
} from "../../src/index.js";
import { err, getOrThrow, ok } from "../../src/Result.js";
import { SqliteValue } from "../../src/Sqlite.js";
import { DateIso, NonNegativeInt, PositiveInt } from "../../src/Type.js";
import { Brand } from "../../src/Types.js";
import {
  testCreateId,
  testCreateSqlite,
  testCreateTimingSafeEqual,
  testDeps,
  testNanoIdLib,
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

test("Base64Url256", () => {
  expectTypeOf<Base64Url256>().toEqualTypeOf<
    string & Brand<"Base64Url"> & Brand<"MaxLength256">
  >();

  const s = "a".repeat(256);
  expect(Base64Url256.from(s).ok).toBe(true);
  expect(Base64Url256.from(s + "a").ok).toBe(false);

  expect(Base64Url256.from("")).toEqual(
    err({
      type: "Regex",
      name: "Base64Url",
      pattern: /^[A-Za-z0-9_-]+$/,
      value: "",
    }),
  );
});

test("idToBinaryId/binaryIdToId", () => {
  const testCases = Array.from({ length: 100 }).map(() => testCreateId());

  testCases.forEach((id) => {
    expect(binaryIdToId(idToBinaryId(id))).toBe(id);
    expect(idToBinaryId(id).length).toBe(16);
  });
});

test("ownerIdToBinaryOwnerId/binaryOwnerIdToOwnerId", () => {
  const id = testOwner.id;
  expect(binaryOwnerIdToOwnerId(ownerIdToBinaryOwnerId(id))).toStrictEqual(id);
});

test("base64Url256ToBytes/decodeBase64Url256", () => {
  const buffer = createBuffer();

  const testCasesSuccess = [
    "A",
    "ABC",
    "abcdefghijklmnopqrstuvwxyz0123456789_-",
    "HelloWorld123_-",
    testNanoIdLib.nanoid(),
  ];

  testCasesSuccess.forEach((string) => {
    const encoded = base64Url256ToBytes(getOrThrow(Base64Url256.from(string)));
    buffer.extend(encoded);
    expect(decodeBase64Url256(createBuffer(encoded), string.length)).toBe(
      string,
    );
  });

  expect(buffer.unwrap().join()).toMatchInlineSnapshot(
    `"100,102,70,128,15,15,133,11,28,179,247,77,118,28,65,150,223,192,127,3,142,87,235,180,76,36,244,21,41,67,141,176,128,156,45,182,26,129,188,216,83,9,62,194,0,89,128,9,37,219,76,175,47,66,221,75,72,212,105,149,12"`,
  );

  Array.from({ length: 256 }).forEach((_, i) => {
    // Empty string isn't Base64Url256.
    if (i === 0) return;
    const s = "a".repeat(i);
    expect(
      decodeBase64Url256(
        createBuffer(base64Url256ToBytes(s as Base64Url256)),
        s.length,
      ),
    ).toBe(s);
  });

  const tooLong = "a".repeat(257) as Base64Url256;

  expect(() =>
    decodeBase64Url256(
      createBuffer(base64Url256ToBytes(tooLong)),
      tooLong.length,
    ),
  ).toThrow("MaxLength");

  // From 21 to 16
  expect(
    base64Url256ToBytes(getOrThrow(Base64Url256.from(testNanoIdLib.nanoid())))
      .length,
  ).toBe(16);

  expect(
    JSON.stringify(
      Array.from({ length: 30 }).map((_, i) => [
        i + 1,
        base64Url256ToBytes("a".repeat(i + 1) as Base64Url256).length,
      ]),
    ),
  ).toMatchInlineSnapshot(
    `"[[1,1],[2,2],[3,3],[4,3],[5,4],[6,5],[7,6],[8,6],[9,7],[10,8],[11,9],[12,9],[13,10],[14,11],[15,12],[16,12],[17,13],[18,14],[19,15],[20,15],[21,16],[22,17],[23,18],[24,18],[25,19],[26,20],[27,21],[28,21],[29,22],[30,23]]"`,
  );
});

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

test("encodeBase64Url256WithLength/decodeBase64Url256WithLength", () => {
  const testCasesSuccess = [
    "A",
    "ABC",
    "abcdefghijklmnopqrstuvwxyz0123456789_-",
    "HelloWorld123_-",
    testNanoIdLib.nanoid(),
  ];

  testCasesSuccess.forEach((string) => {
    const buffer = createBuffer();
    encodeBase64Url256(buffer, getOrThrow(Base64Url256.from(string)));
    expect(decodeBase64Url256WithLength(buffer)).toBe(string);
  });
});

test("ProtocolValueType", () => {
  expect(ProtocolValueType).toStrictEqual({
    String: 20,
    Number: 21,
    Null: 22,
    Binary: 23,
    Id: 30,
    Base64Url256: 31,
    NonNegativeInt: 32,
    Json: 33,
    DateIsoWithNonNegativeTime: 34,
    DateIsoWithNegativeTime: 35,
  });
});

test("encodeSqliteValue/decodeSqliteValue", () => {
  const testCasesSuccess: Array<[SqliteValue, number]> = [
    ["aaaaaaaaaaa!", 14], // type + length + value
    [123.5, 10], // encodeNumber
    [-123, 3], // encodeNumber
    [null, 1],
    [new Uint8Array([1, 2, 3]), 5],
    [testCreateId(), 17],
    ["aaaaaaaaaaaa", 11], // Base64Url256
    [0, 1], // small ints 0-19
    [19, 1], // small ints 0-19
    [123, 2], // NonNegativeInt
    [16383, 3], // NonNegativeInt
    ['{"compact":true,"schema":0}', 22],
    // Protocol encoding ensures 6 bytes till the year 2108.
    [getOrThrow(DateIso.fromParent(new Date("0000-01-01T00:00:00.000Z"))), 10],
    [getOrThrow(DateIso.fromParent(new Date("2024-10-31T00:00:00.000Z"))), 7],
    [getOrThrow(DateIso.fromParent(new Date("2108-10-31T00:00:00.000Z"))), 7],
    [getOrThrow(DateIso.fromParent(new Date("2109-10-31T00:00:00.000Z"))), 8],
    [getOrThrow(DateIso.fromParent(new Date("9999-12-31T23:59:59.999Z"))), 8],
  ];

  let buffer = createBuffer();
  testCasesSuccess.forEach(([value, bytesLength]) => {
    const encoded = createBuffer();
    encodeSqliteValue(encoded, value);
    buffer.extend(encoded.unwrap());

    expect(encoded.getLength()).toBe(bytesLength);
    expect(decodeSqliteValue(encoded)).toStrictEqual(value);
  });
  expect(buffer.unwrap().join()).toMatchInlineSnapshot(
    `"20,12,97,97,97,97,97,97,97,97,97,97,97,33,21,203,64,94,224,0,0,0,0,0,21,208,133,22,23,3,1,2,3,30,103,102,107,10,197,201,53,161,13,77,89,167,46,24,175,12,31,12,12,48,195,12,48,195,12,48,195,0,19,32,123,32,255,127,33,20,222,0,2,167,99,111,109,112,97,99,116,195,166,115,99,104,101,109,97,0,35,203,194,204,69,55,130,48,0,0,34,128,232,252,254,173,50,34,128,168,131,232,192,127,34,128,128,200,165,182,128,1,34,255,183,255,144,253,206,57"`,
  );

  // string
  buffer = createBuffer();
  encodeSqliteValue(buffer, "." + "a".repeat(255));
  expect(buffer.getLength()).toBe(
    // 256 + string length (2 bytes) + type (1 byte)
    259,
  );

  // Base64Url256
  buffer = createBuffer();
  encodeSqliteValue(buffer, "a" + "a".repeat(255));
  expect(buffer.getLength()).toBe(195);
});

const createDbChange = (): DbChange => ({
  table: "employee" as Base64Url256,
  id: testCreateId(),
  values: {
    ["name" as Base64Url256]: "Victoria",
    ["hiredAt" as Base64Url256]: getOrThrow(
      DateIso.from(new Date("2024-10-31")),
    ),
    ["officeId" as Base64Url256]: testCreateId(),
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
    `"224,133,64,197,50,12,233,89,143,169,92,123,149,145,188,150,38,102,88,76,117,90,162,252,112,211,179,64,166,95,0,86,85,118,155,144,195,219,82,109,80,34,104,67,212,11,6,121,52,116,11,3,106,4,11,247,59,46,119,63,161,251,205,174,9,103,10,219,239,201,184,234,45,180,149,150,75,80,175,31,16,180,253,238,202,237,72,182,166,139,160,253,217,4,228,76,150,225,20,250,168,12,23,97,34,124,91,155,160,125,196,194,110,253,27,47,187,193,226,42,114,52,207,73,223,205,172,117,142,106,151,81,206,81,195,181,232"`,
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
      type: "initiator",
    });
    expect(() => buffer.unwrap()).not.toThrow();
  });

  it("should allow single range with InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      type: "initiator",
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() => buffer.unwrap()).not.toThrow();
  });

  it("should reject single range without InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      type: "initiator",
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
      type: "initiator",
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
      type: "initiator",
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
      type: "initiator",
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
    `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,0,1,2,0"`,
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
    `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,0,1,2,31,0,163,205,139,2,152,222,222,3,141,195,32,138,221,210,1,216,167,200,1,243,155,45,128,152,244,5,167,136,182,1,199,139,225,5,131,234,154,8,0,150,132,58,233,134,161,1,222,244,220,1,250,141,170,3,248,167,204,1,0,161,234,59,0,192,227,115,181,188,169,1,224,169,247,4,205,177,37,143,161,242,1,137,231,180,2,161,244,87,235,207,53,133,244,180,1,142,243,223,10,158,141,113,0,11,1,1,0,5,1,1,0,1,1,1,0,11,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,11,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1"`,
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
    `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,0,16,187,171,234,5,151,160,243,1,203,195,245,1,167,160,170,7,202,245,251,13,150,132,58,199,251,253,2,242,181,246,4,161,234,59,192,227,115,149,230,160,6,220,210,151,2,170,219,140,3,240,195,234,1,172,128,209,11,0,15,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,5,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,7,153,201,144,40,214,99,106,145,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,79,199,221,49,166,129,34,35,99,27,109,221,72,203,113,173,13,174,108,244,220,53,10,79,91,208,39,170,201,18,73,253,152,51,99,124,0,152,50,246,239,212,6,13,80,19,126,71,76,18,73,200,62,200,42,99,188,63,73,207,154,238,98,14,224,33,103,255,188,202,60,84,33,248,184,78,240,231,221,198,98,244,79,237,208,100,110,251,209,4,221,129,70,179,162,173,26,9,38,199,115,85,231,208,141,13,135,35,144,151,124,233,151,6,119,79,51,128,236,157,32,91,160,104,143,239,236,16,148,246,215,168,225,200,73,253,182,117,53,113,24,52,165,196,73,55,66,212,228,27,187,1,71,143,234,75,93,129,254,145,224,183,203,200,8,205,21,142,6,139,145,237,12,30,146,233,222,152,203,251,132,199,125,55,190,43,113,63,180,29,179,161"`,
  );
});

test("E2E key rotation", async () => {
  const storageDep = await createStorageDep();

  const owner = createOwner(testDeps)();
  const binaryOwnerId = ownerIdToBinaryOwnerId(owner.id);
  const currentWriteKey = owner.writeKey;
  const newWriteKey = createWriteKey(testDeps)();

  storageDep.storage.setWriteKey(binaryOwnerId, currentWriteKey);

  const rotationMessage = createProtocolMessageForWriteKeyRotation(
    owner.id,
    currentWriteKey,
    newWriteKey,
  );
  expect(rotationMessage.join()).toMatchInlineSnapshot(
    `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,2,111,64,118,108,245,65,176,98,173,247,85,78,30,167,192,203,24,131,5,12,119,244,182,193,94,33,37,51,202,213,38,65,0"`,
  );

  const result = applyProtocolMessageAsRelay(storageDep)(rotationMessage);
  expect(result).toEqual(ok(null));

  const oldKeyValidation = storageDep.storage.validateWriteKey(
    binaryOwnerId,
    currentWriteKey,
  );
  expect(oldKeyValidation).toBe(false);

  const newKeyValidation = storageDep.storage.validateWriteKey(
    binaryOwnerId,
    newWriteKey,
  );
  expect(newKeyValidation).toBe(true);
});

describe("E2E versioning", () => {
  test("same versions", () => {
    const v0 = 0 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v0,
      type: "initiator",
    }).unwrap();

    const relayResponse = applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v0);

    expect(relayResponse).toEqual(ok(null));
  });

  test("non-initiator version is higher", () => {
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    const clientMessage = createProtocolMessageBuffer(testOwner.id, {
      version: v0,
      type: "initiator",
    }).unwrap();

    const relayResponse = applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v1);
    assert(relayResponse.ok);
    assert(relayResponse.value);

    const clientResult = applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(relayResponse.value, { version: v0 });
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
      type: "initiator",
    }).unwrap();

    const relayResponse = applyProtocolMessageAsRelay(
      shouldNotBeCalledStorageDep,
    )(clientMessage, {}, v0);
    assert(relayResponse.ok);
    assert(relayResponse.value);

    const clientResult = applyProtocolMessageAsClient(
      shouldNotBeCalledStorageDep,
    )(relayResponse.value, { version: v1 });
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
    assert(responseWithWriteKeyError.value);
    expect(responseWithWriteKeyError.value.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,1,0"`,
    );

    expect(
      applyProtocolMessageAsClient(shouldNotBeCalledStorageDep)(
        responseWithWriteKeyError.value,
      ),
    ).toEqual(
      err({ type: "ProtocolWriteKeyError", ownerId: "MdVYFAxShUluuZKVWQfYL" }),
    );
  });
});

describe("E2E relay options", () => {
  test("subscribe", () => {
    const message = createProtocolMessageBuffer(testOwner.id, {
      type: "initiator",
    }).unwrap();
    let onOwnerIdCalled = false;

    applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(message, {
      subscribe: (ownerId) => {
        expect(ownerId).toBe(testOwner.id);
        onOwnerIdCalled = true;
      },
    });

    expect(onOwnerIdCalled).toBe(true);
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
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,1,111,64,118,108,245,65,176,98,173,247,85,78,30,167,192,203,1,0,0,1,0,0,0,0,0,0,0,0,1,137,1,132,69,106,188,87,40,206,247,79,137,58,9,129,77,32,199,233,34,114,254,197,204,200,212,112,226,219,99,131,43,138,8,172,69,168,200,126,44,152,21,249,3,99,145,251,140,134,219,250,141,161,137,117,175,52,245,3,101,100,119,148,153,43,57,59,125,53,103,6,190,245,235,200,178,79,37,127,59,213,222,204,34,210,48,76,122,201,76,224,143,132,252,173,111,6,203,36,168,228,73,231,70,56,167,57,74,99,198,158,202,57,228,215,232,254,29,40,10,117,75,61,94,235,35,124,231,198,161,156,101,166,15,59,230,155,119,200"`,
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
    // Added error and removed writeKey
    expect(broadcastedMessage.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,0,0,1,0,0,0,0,0,0,0,0,1,137,1,132,69,106,188,87,40,206,247,79,137,58,9,129,77,32,199,233,34,114,254,197,204,200,212,112,226,219,99,131,43,138,8,172,69,168,200,126,44,152,21,249,3,99,145,251,140,134,219,250,141,161,137,117,175,52,245,3,101,100,119,148,153,43,57,59,125,53,103,6,190,245,235,200,178,79,37,127,59,213,222,204,34,210,48,76,122,201,76,224,143,132,252,173,111,6,203,36,168,228,73,231,70,56,167,57,74,99,198,158,202,57,228,215,232,254,29,40,10,117,75,61,94,235,35,124,231,198,161,156,101,166,15,59,230,155,119,200"`,
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
          table: "foo" as Base64Url256,
          id: testCreateId(),
          values: {
            ["bar" as Base64Url256]: "x".repeat(testRandomLib.int(1, 500)),
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

      if (!result.ok || result.value === null) break;
      message = result.value;

      turn = turn === "relay" ? "client" : "relay";
      syncSizes.push(result.value.length);
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
          368,
        ],
        "syncSteps": 1,
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
          368,
          192,
          999840,
          39,
          664131,
        ],
        "syncSteps": 5,
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
          368,
          192,
          999840,
          39,
          155255,
          39,
          143820,
          39,
          153508,
          39,
          169709,
          39,
          53989,
        ],
        "syncSteps": 13,
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
          22,
          999558,
          55,
          681449,
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
          22,
          162992,
          55,
          171528,
          55,
          146348,
          55,
          158368,
          55,
          164486,
          55,
          156647,
          55,
          155385,
          55,
          141322,
          55,
          154433,
          55,
          162590,
          55,
          118660,
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
          390,
          5190,
          19478,
          853234,
          832391,
        ],
        "syncSteps": 5,
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
          350,
          2304,
          2266,
          126162,
          110877,
          2253,
          2302,
          87874,
          83390,
          2337,
          2280,
          77546,
          75620,
          2324,
          2285,
          63550,
          76419,
          2259,
          62853,
          73260,
          2236,
          66324,
          63771,
          2223,
          62132,
          58999,
          2252,
          60820,
          57431,
          2245,
          68423,
          52005,
          25032,
          58549,
          39313,
          91209,
          102421,
          10159,
          25761,
          32626,
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
          table: "foo" as Base64Url256,
          id: testCreateId(),
          values: { ["bar" as Base64Url256]: "baz" },
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
    expect(relayResult.value?.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,0,1,2,9,0,163,205,139,2,152,222,222,3,141,195,32,138,221,210,1,216,167,200,1,243,155,45,128,152,244,5,167,136,182,1,0,9,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6"`,
    );
    // Sync continue
    expect(relayResult.value).not.toBe(null);
  });
});

describe("ranges sizes", () => {
  it("31 timestamps", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      type: "initiator",
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
    ).toMatchInlineSnapshot(`"238 189"`);
  });

  it("testTimestampsAsc", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      type: "initiator",
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
    ).toMatchInlineSnapshot(`"31628 18270"`);
  });

  it("fingerprints", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id, {
      type: "initiator",
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
    ).toMatchInlineSnapshot(`"330 313"`);
  });
});

// TODO:
// - protocol message with ranges isn't broadcasted
