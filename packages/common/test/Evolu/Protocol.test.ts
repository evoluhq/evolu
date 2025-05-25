import { compress, init } from "@bokuweb/zstd-wasm";
import { pack } from "msgpackr";
import {
  assert,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
  test,
} from "vitest";
import { Buffer, createBuffer, utf8ToBytes } from "../../src/Buffer.js";
import {
  applyProtocolMessageAsClient,
  applyProtocolMessageAsRelay,
  Base64Url256,
  base64Url256ToBytes,
  binaryIdToId,
  binaryOwnerIdToOwnerId,
  binaryTimestampToFingerprint,
  ColumnName,
  CrdtMessage,
  createProtocolMessageBuffer,
  createProtocolMessageForSync,
  createProtocolMessageFromCrdtMessages,
  createTimestampsBuffer,
  DbChange,
  DbIdentifier,
  decodeBase64Url256,
  decodeBase64Url256WithLength,
  decodeDbChange,
  decodeDbIdentifier,
  decodeLength,
  decodeNodeId,
  decodeNonNegativeInt,
  decodeNumber,
  decodeRanges,
  decodeSqliteValue,
  decodeString,
  decryptDbChange,
  encodeBase64Url256,
  encodeDbChange,
  encodeDbIdentifier,
  encodeLength,
  encodeNodeId,
  encodeNonNegativeInt,
  encodeNumber,
  encodeSqliteValue,
  encodeString,
  encryptDbChange,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  FingerprintRange,
  idToBinaryId,
  InfiniteUpperBound,
  ownerIdToBinaryOwnerId,
  ProtocolErrorCode,
  ProtocolValueType,
  protocolVersion,
  RangeType,
  SkipRange,
  Storage,
  StorageDep,
  TableName,
  TimestampsRangeWithTimestampsBuffer,
} from "../../src/Evolu/Protocol.js";
import { createRelayStorage } from "../../src/Evolu/Relay.js";
import {
  binaryTimestampToTimestamp,
  createInitialTimestamp,
  timestampToBinaryTimestamp,
} from "../../src/Evolu/Timestamp.js";
import { constFalse, constNull, constTrue } from "../../src/Function.js";
import {
  assertNonEmptyArray,
  createRandom,
  EncryptionKey,
  NonEmptyReadonlyArray,
} from "../../src/index.js";
import { err, getOrThrow, ok, Result } from "../../src/Result.js";
import { SqliteValue } from "../../src/Sqlite.js";
import {
  DateIso,
  MaxLengthError,
  MinLengthError,
  NonNegativeInt,
  PositiveInt,
  RegexError,
  StringError,
} from "../../src/Type.js";
import { Brand } from "../../src/Types.js";
import {
  testCreateId,
  testCreateSqlite,
  testDeps,
  testNanoIdLib,
  testNanoIdLibDep,
  testOwner,
  testOwnerBinaryId,
  testRandomLib,
  testSymmetricCrypto,
} from "../_deps.js";
import { testTimestampsAsc, testTimestampsRandom } from "./_fixtures.js";

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
    createRelayStorage({ sqlite, random: createRandom() })({
      onStorageError: (error) => {
        throw new Error(error.type);
      },
    }),
  );
  return { storage };
};

test("DbIdentifier", () => {
  expectTypeOf<DbIdentifier>().toEqualTypeOf<
    string & Brand<"Base64Url"> & Brand<"MinLength1"> & Brand<"MaxLength42">
  >();
  expectTypeOf<typeof DbIdentifier.Error>().toEqualTypeOf<MinLengthError<1>>();
  expectTypeOf<typeof DbIdentifier.ParentError>().toEqualTypeOf<
    RegexError<"Base64Url"> | StringError | MaxLengthError<42>
  >();
});

test("TableName", () => {
  expectTypeOf<TableName>().toEqualTypeOf<
    string &
      Brand<"Base64Url"> &
      Brand<"MaxLength42"> &
      Brand<"MinLength1"> &
      Brand<"TableName">
  >();
});

test("ColumnName", () => {
  expectTypeOf<ColumnName>().toEqualTypeOf<
    string &
      Brand<"Base64Url"> &
      Brand<"MaxLength42"> &
      Brand<"MinLength1"> &
      Brand<"ColumnName">
  >();
});

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

test("encodeDbIdentifier/decodeDbIdentifier", () => {
  const tooLong = "a".repeat(43) as DbIdentifier;
  const buffer = createBuffer();
  encodeDbIdentifier(buffer, tooLong);
  expect(() => decodeDbIdentifier(buffer)).toThrow("MaxLength");
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
  table: "employee" as TableName,
  id: testCreateId(),
  values: {
    ["name" as ColumnName]: "Victoria",
    ["hiredAt" as ColumnName]: getOrThrow(DateIso.from(new Date("2024-10-31"))),
    ["officeId" as ColumnName]: testCreateId(),
  },
});

const createEncryptedDbChange = (dbChange: DbChange): EncryptedDbChange => {
  return encryptDbChange({ symmetricCrypto: testSymmetricCrypto })(
    dbChange,
    testOwner.encryptionKey,
  );
};

test("encodeDbChange/decodeDbChange", () => {
  const dbChange = createDbChange();

  // JSON
  expect(utf8ToBytes(JSON.stringify(dbChange)).length).toBe(150);

  // MessagePack
  expect(pack(dbChange).byteLength).toBe(131);

  // Evolu Protocol
  const encoded = createBuffer();
  encodeDbChange(encoded, dbChange);
  expect(encoded.getLength()).toBe(74);

  expect(encoded.unwrap().join()).toMatchInlineSnapshot(
    `"8,8,117,182,27,160,130,27,240,224,250,198,98,1,37,21,42,240,173,90,49,207,148,3,4,16,49,194,31,8,115,223,191,27,207,67,7,207,223,2,21,159,192,34,128,232,252,254,173,50,8,27,28,125,248,40,69,30,98,213,44,174,124,221,220,137,117,250,186,114,137,190,3,4"`,
  );
  expect(decodeDbChange(encoded)).toEqual(dbChange);
});

test("encryptDbChange/decryptDbChange", () => {
  const dbChange = createDbChange();
  const encrypted = createEncryptedDbChange(dbChange);
  expect(encrypted.join()).toMatchInlineSnapshot(
    `"114,47,130,62,246,76,198,108,173,30,85,166,118,236,168,112,188,114,71,68,131,93,111,240,90,27,29,38,30,9,252,175,174,170,131,117,218,230,142,168,149,228,121,104,165,33,57,80,205,92,114,230,39,245,199,20,51,236,207,163,109,241,194,35,204,104,48,20,68,198,170,206,245,170,84,26,206,97,222,159,37,120,228,182,125,155,88,142,155,179,183,48,53,180,219,183,81,253,129,232,201,247,97,121,58,92,196,119,90,249,45,0,148,210,16"`,
  );
  const decrypted = decryptDbChange({ symmetricCrypto: testSymmetricCrypto })(
    encrypted,
    testOwner.encryptionKey,
  );
  assert(decrypted.ok);
  expect(decrypted.value).toEqual(dbChange);

  const wrongKey = new Uint8Array(32).fill(42) as EncryptionKey;
  const decryptedWithWrongKey = decryptDbChange({
    symmetricCrypto: testSymmetricCrypto,
  })(encrypted, wrongKey);
  assert(!decryptedWithWrongKey.ok);
  expect(decryptedWithWrongKey.error.type).toBe("SymmetricCryptoDecryptError");

  const corruptedCiphertext = new Uint8Array(encrypted) as EncryptedDbChange;
  if (corruptedCiphertext.length > 10) {
    corruptedCiphertext[10] = (corruptedCiphertext[10] + 1) % 256; // Modify a byte
  }
  const decryptedCorrupted = decryptDbChange({
    symmetricCrypto: testSymmetricCrypto,
  })(corruptedCiphertext, testOwner.encryptionKey);
  assert(!decryptedCorrupted.ok);
  expect(decryptedCorrupted.error.type).toBe("SymmetricCryptoDecryptError");
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
    writeMessages: shouldNotBeCalled,
    readDbChange: shouldNotBeCalled,
  },
};

describe("createProtocolMessageBuffer", () => {
  it("should allow no ranges", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
    expect(() => buffer.unwrap()).not.toThrow();
  });

  it("should allow single range with InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() => buffer.unwrap()).not.toThrow();
  });

  it("should reject single range without InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[0],
    });
    expect(() => buffer.unwrap()).toThrow(
      "The last range's upperBound must be InfiniteUpperBound",
    );
  });

  it("should allow multiple ranges with only last InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
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
    const buffer = createProtocolMessageBuffer(testOwner.id);
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() =>
      buffer.addRange({
        type: RangeType.Skip,
        upperBound: testTimestampsAsc[0],
      }),
    ).toThrow("Cannot add a range after an InfiniteUpperBound range");
  });

  it("should reject multiple InfiniteUpperBounds", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[0],
    });
    buffer.addRange({
      type: RangeType.Skip,
      upperBound: InfiniteUpperBound,
    });
    expect(() =>
      buffer.addRange({
        type: RangeType.Skip,
        upperBound: InfiniteUpperBound,
      }),
    ).toThrow("Cannot add a range after an InfiniteUpperBound range");
  });

  it("hasEnoughSpaceForSplitRange", () => {
    expect(
      createProtocolMessageBuffer(testOwner.id, {
        rangesMaxSize: 999 as PositiveInt,
      }).hasEnoughSpaceForSplitRange(),
    ).toBe(false);

    expect(
      createProtocolMessageBuffer(testOwner.id, {
        rangesMaxSize: 1000 as PositiveInt,
      }).hasEnoughSpaceForSplitRange(),
    ).toBe(true);
  });
});

describe("decodeRanges", () => {
  const fingerprint = binaryTimestampToFingerprint(testTimestampsRandom[0]);

  const decodeHeaderAndMessages = (buffer: Buffer) => {
    buffer.shiftN(1 as NonNegativeInt);
    buffer.shiftN(16 as NonNegativeInt);
    buffer.shiftN(1 as NonNegativeInt);
  };

  it("should handle no ranges", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
    const protocolMessage = buffer.unwrap();
    expect(protocolMessage.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0"`,
    );

    const output = createBuffer(protocolMessage);
    decodeHeaderAndMessages(output);

    const decodedRanges = decodeRanges(output);
    expect(decodedRanges).toEqual([]);
    expect(output.getLength()).toBe(0);
  });

  it("should handle single range with InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
    const range: FingerprintRange = {
      type: RangeType.Fingerprint,
      upperBound: InfiniteUpperBound,
      fingerprint,
    };
    buffer.addRange(range);
    const protocolMessage = buffer.unwrap();
    expect(protocolMessage.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,1,182,187,38,109,89,6,62,199,219,193,245,246"`,
    );

    const output = createBuffer(protocolMessage);
    decodeHeaderAndMessages(output);

    const decodedRanges = decodeRanges(output);
    expect(decodedRanges).toEqual([range]);
    expect(output.getLength()).toBe(0);
  });

  it("should handle multiple ranges with last InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);

    const range1 = {
      type: RangeType.Skip,
      upperBound: testTimestampsAsc[1],
    };
    const range2 = {
      type: RangeType.Fingerprint,
      upperBound: testTimestampsAsc[2],
      fingerprint,
    };
    const range3 = {
      type: RangeType.Timestamps,
      upperBound: InfiniteUpperBound,
      timestamps: [testTimestampsAsc[3], testTimestampsAsc[4]],
    };

    expect(buffer.addRange(range1)).toBe(true);
    expect(buffer.addRange(range2)).toBe(true);

    const timestamps = createTimestampsBuffer();
    timestamps.add(binaryTimestampToTimestamp(testTimestampsAsc[3]));
    timestamps.add(binaryTimestampToTimestamp(testTimestampsAsc[4]));

    expect(
      buffer.addRange({
        type: RangeType.Timestamps,
        upperBound: InfiniteUpperBound,
        timestamps,
      }),
    ).toBe(true);

    const protocolMessage = buffer.unwrap();
    expect(protocolMessage.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,3,163,205,139,2,152,222,222,3,0,2,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,0,1,2,182,187,38,109,89,6,62,199,219,193,245,246,2,200,238,138,6,138,221,210,1,0,2,104,162,167,191,63,133,160,150,2"`,
    );

    const output = createBuffer(protocolMessage);
    decodeHeaderAndMessages(output);

    const decodedRanges = decodeRanges(output);

    expect(decodedRanges).toEqual([range1, range2, range3]);
    expect(output.getLength()).toBe(0);
  });

  it("should handle single empty TimestampsRange with InfiniteUpperBound", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
    const range: TimestampsRangeWithTimestampsBuffer = {
      type: RangeType.Timestamps,
      upperBound: InfiniteUpperBound,
      timestamps: createTimestampsBuffer(),
    };
    expect(buffer.addRange(range)).toBe(true);
    const protocolMessage = buffer.unwrap();
    expect(protocolMessage.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,2,0"`,
    );

    const output = createBuffer(protocolMessage);
    decodeHeaderAndMessages(output);

    const decodedRanges = decodeRanges(output);
    expect(decodedRanges).toEqual([
      {
        type: RangeType.Timestamps,
        upperBound: InfiniteUpperBound,
        timestamps: [],
      },
    ]);
    expect(output.getLength()).toBe(0);
  });

  const createSkipRange = (index: number): SkipRange => ({
    type: RangeType.Skip,
    upperBound: testTimestampsAsc[index],
  });

  const createFingerprintRange = (index: number): FingerprintRange => ({
    type: RangeType.Fingerprint,
    upperBound: testTimestampsAsc[index],
    fingerprint,
  });

  const lastFingerprintRange: FingerprintRange = {
    type: RangeType.Fingerprint,
    upperBound: InfiniteUpperBound,
    fingerprint,
  };

  const headerLength = 17;

  it("should add ranges up to rangesMaxSize without exceeding it", () => {
    const rangesMaxSize = 98 as PositiveInt;
    const buffer = createProtocolMessageBuffer(testOwner.id, { rangesMaxSize });

    const addedRanges: Array<SkipRange> = [];
    for (let i = 0; i < testTimestampsAsc.length; i++) {
      const range = createSkipRange(i);
      if (!buffer.addRange(range)) {
        break;
      }
      addedRanges.push(range);
    }

    expect(buffer.addRange(lastFingerprintRange)).toBe(true);

    const protocolMessage = buffer.unwrap();
    expect(protocolMessage.length).toBe(rangesMaxSize + headerLength);

    const output = createBuffer(protocolMessage);
    decodeHeaderAndMessages(output);

    const decodedRanges = decodeRanges(output);
    expect(decodedRanges.length).toBe(addedRanges.length + 1);
    expect(decodedRanges.slice(0, -1)).toEqual(addedRanges);
    expect(decodedRanges[decodedRanges.length - 1]).toEqual(
      lastFingerprintRange,
    );
    expect(output.getLength()).toBe(0);
  });

  it("should reject a range that exceeds rangesMaxSize", () => {
    const rangesMaxSize = 40 as PositiveInt;
    const buffer = createProtocolMessageBuffer(testOwner.id, { rangesMaxSize });

    const range1 = createFingerprintRange(0);
    expect(buffer.addRange(range1)).toBe(true);

    const range2 = createSkipRange(1);
    expect(buffer.addRange(range2)).toBe(false);

    expect(buffer.addRange(lastFingerprintRange)).toBe(true);

    const protocolMessage = buffer.unwrap();
    expect(protocolMessage.length).toBe(rangesMaxSize + headerLength);

    const output = createBuffer(protocolMessage);
    decodeHeaderAndMessages(output);
    const decodedRanges = decodeRanges(output);
    expect(decodedRanges).toEqual([range1, lastFingerprintRange]);
    expect(output.getLength()).toBe(0);
  });
});

test("createProtocolMessageForSync", async () => {
  const storageDep = await createStorageDep();

  // Empty DB: version, ownerId, 0 messages, one empty TimestampsRange.
  expect(
    createProtocolMessageForSync(storageDep)(testOwner.id)?.join(),
  ).toMatchInlineSnapshot(
    `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,2,0"`,
  );

  const messages31 = testTimestampsAsc.slice(0, 31).map(
    (t): EncryptedCrdtMessage => ({
      timestamp: binaryTimestampToTimestamp(t),
      change: createEncryptedDbChange(createDbChange()),
    }),
  );
  assertNonEmptyArray(messages31);
  storageDep.storage.writeMessages(testOwnerBinaryId, messages31);

  // DB with 31 timestamps: version, ownerId, 0 messages, one full (31) TimestampsRange.
  expect(
    createProtocolMessageForSync(storageDep)(testOwner.id)?.join(),
  ).toMatchInlineSnapshot(
    `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,2,31,0,163,205,139,2,152,222,222,3,141,195,32,138,221,210,1,216,167,200,1,243,155,45,128,152,244,5,167,136,182,1,199,139,225,5,131,234,154,8,0,150,132,58,233,134,161,1,222,244,220,1,250,141,170,3,248,167,204,1,0,161,234,59,0,192,227,115,181,188,169,1,224,169,247,4,205,177,37,143,161,242,1,137,231,180,2,161,244,87,235,207,53,133,244,180,1,142,243,223,10,158,141,113,0,11,1,1,0,5,1,1,0,1,1,1,0,11,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,11,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,6,153,201,144,40,214,99,106,145,1"`,
  );

  const message32 = testTimestampsAsc.slice(32, 33).map(
    (t): EncryptedCrdtMessage => ({
      timestamp: binaryTimestampToTimestamp(t),
      change: createEncryptedDbChange(createDbChange()),
    }),
  );
  assertNonEmptyArray(message32);
  storageDep.storage.writeMessages(testOwnerBinaryId, message32);

  // DB with 32 timestamps: version, ownerId, 0 messages, 16x FingerprintRange.
  expect(
    createProtocolMessageForSync(storageDep)(testOwner.id)?.join(),
  ).toMatchInlineSnapshot(
    `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,16,187,171,234,5,151,160,243,1,203,195,245,1,167,160,170,7,202,245,251,13,150,132,58,199,251,253,2,242,181,246,4,161,234,59,192,227,115,149,230,160,6,220,210,151,2,170,219,140,3,240,195,234,1,172,128,209,11,0,15,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,5,153,201,144,40,214,99,106,145,1,104,162,167,191,63,133,160,150,7,153,201,144,40,214,99,106,145,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,79,199,221,49,166,129,34,35,99,27,109,221,72,203,113,173,13,174,108,244,220,53,10,79,91,208,39,170,201,18,73,253,152,51,99,124,0,152,50,246,239,212,6,13,80,19,126,71,76,18,73,200,62,200,42,99,188,63,73,207,154,238,98,14,224,33,103,255,188,202,60,84,33,248,184,78,240,231,221,198,98,244,79,237,208,100,110,251,209,4,221,129,70,179,162,173,26,9,38,199,115,85,231,208,141,13,135,35,144,151,124,233,151,6,119,79,51,128,236,157,32,91,160,104,143,239,236,16,148,246,215,168,225,200,73,253,182,117,53,113,24,52,165,196,73,55,66,212,228,27,187,1,71,143,234,75,93,129,254,145,224,183,203,200,8,205,21,142,6,139,145,237,12,30,146,233,222,152,203,251,132,199,125,55,190,43,113,63,180,29,179,161"`,
  );
});

describe("E2E (old)", () => {
  test("versioning", () => {
    const v0 = 0 as NonNegativeInt;
    const v1 = 1 as NonNegativeInt;

    expect(
      applyProtocolMessageAsRelay(shouldNotBeCalledStorageDep)(
        createProtocolMessageBuffer(testOwner.id, {
          version: v0,
        }).unwrap(),
        {},
        v0,
      ),
    ).toEqual(ok(null));

    expect(
      applyProtocolMessageAsClient(shouldNotBeCalledStorageDep)(
        createProtocolMessageBuffer(testOwner.id, {
          errorCode: ProtocolErrorCode.NoError,
          version: v0,
        }).unwrap(),
        { version: v0 },
      ),
    ).toEqual(ok(null));

    expect(
      applyProtocolMessageAsClient(shouldNotBeCalledStorageDep)(
        createProtocolMessageBuffer(testOwner.id, {
          errorCode: ProtocolErrorCode.NoError,
          version: v0,
        }).unwrap(),
        { version: v1 },
      ),
    ).toEqual(
      err({
        type: "ProtocolUnsupportedVersionError",
        unsupportedVersion: 0,
        isInitiator: false,
      }),
    );

    expect(
      applyProtocolMessageAsClient(shouldNotBeCalledStorageDep)(
        createProtocolMessageBuffer(testOwner.id, {
          errorCode: ProtocolErrorCode.NoError,
          version: v1,
        }).unwrap(),
        { version: v0 },
      ),
    ).toEqual(
      err({
        type: "ProtocolUnsupportedVersionError",
        unsupportedVersion: 1,
        isInitiator: true,
      }),
    );
  });

  test("messages without and with size limit", () => {
    const messages = testTimestampsAsc.slice(0, 3).map(
      (timestamp): CrdtMessage => ({
        timestamp: binaryTimestampToTimestamp(timestamp),
        change: createDbChange(),
      }),
    );
    assertNonEmptyArray(messages);

    // As minimal as possible.
    const maxSize = 420 as PositiveInt;

    let protocolMessage = createProtocolMessageFromCrdtMessages(testDeps)(
      testOwner,
      messages,
      maxSize,
    );

    expect(protocolMessage.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,3,0,163,205,139,2,152,222,222,3,0,3,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,115,242,251,55,205,141,153,5,169,167,29,221,49,195,178,122,186,190,238,248,70,127,246,6,76,90,140,133,83,240,111,247,12,50,2,5,26,73,1,95,216,198,143,231,35,11,178,248,50,13,23,133,200,22,154,214,95,12,113,36,22,218,248,147,249,248,129,234,51,102,213,245,107,229,94,106,116,151,138,253,234,9,219,234,5,13,213,188,164,238,172,164,198,53,128,101,224,40,140,150,35,129,72,32,96,219,39,216,109,218,194,138,85,46,98,215,115,12,199,157,174,235,213,76,209,241,35,149,201,225,20,174,159,167,28,95,251,208,109,126,63,90,33,236,223,66,185,48,151,120,219,230,144,255,164,115,214,52,204,210,117,210,219,75,144,231,49,215,222,131,126,154,91,55,103,242,71,141,154,67,202,139,64,116,42,159,207,73,148,211,106,131,200,115,152,52,135,153,217,86,113,151,159,122,196,179,248,59,49,200,203,5,139,132,185,118,200,3,42,180,17,217,157,166,224,125,94,40,236,93,17,77,115,187,10,104,64,37,12,203,170,9,30,49,110,227,116,115,136,131,254,17,150,132,69,106,188,90,175,237,73,153,11,179,31,166,54,75,43,36,226,141,175,136,240,22,120,121,241,229,145,238,216,143,89,100,225,25,244,154,50,48,71,92,46,130,65,83,128,216,49,153,97,72,87,224,73,142,14,124,255,220,193,75,110,210,243,181,221,24,121,197,152,193,239,64,72,210,229,42,90,98,213,156,130,100,253,204,166,126,97,120,144,196,91,185,107,125,111,64,118,108,245,65,176,98,173,247,85,78,30,167,192,203"`,
    );
    expect(protocolMessage.length).toBe(maxSize);

    let writeMessagesCalled = false;

    applyProtocolMessageAsRelay({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        writeMessages: (ownerId, messagesToWrite) => {
          writeMessagesCalled = true;

          expect(ownerId).toEqual(testOwnerBinaryId);

          const decryptedMessage = messagesToWrite.map(
            (message): CrdtMessage => {
              const change = decryptDbChange({
                symmetricCrypto: testSymmetricCrypto,
              })(message.change, testOwner.encryptionKey);
              assert(change.ok);
              return { timestamp: message.timestamp, change: change.value };
            },
          );
          expect(decryptedMessage).toEqual(messages);

          return true;
        },
        validateWriteKey: constTrue,
        readDbChange: constNull,
      },
    })(protocolMessage);

    expect(writeMessagesCalled).toBe(true);

    protocolMessage = createProtocolMessageFromCrdtMessages(testDeps)(
      testOwner,
      messages,
      (maxSize - 1) as PositiveInt,
    );

    expect(protocolMessage.join()).toMatchInlineSnapshot(
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,2,0,163,205,139,2,0,2,0,0,0,0,0,0,0,0,1,104,162,167,191,63,133,160,150,1,115,87,40,206,247,79,137,58,9,129,77,32,199,233,34,114,254,197,204,200,212,85,246,228,91,90,102,149,61,90,173,91,109,239,180,178,181,44,1,82,96,110,40,221,142,124,34,24,168,172,174,54,15,225,247,171,61,136,38,221,241,246,128,227,141,0,9,139,251,143,173,61,11,217,90,46,249,205,10,22,161,226,157,240,193,97,50,42,72,139,69,249,67,29,172,179,249,160,40,81,245,94,248,94,243,235,216,227,16,245,79,12,79,90,100,238,115,12,37,57,35,20,115,205,223,175,59,168,215,150,31,214,124,142,173,90,85,164,107,156,138,90,189,49,63,178,221,83,69,162,22,67,171,153,207,226,236,179,145,3,162,243,17,90,144,104,152,128,208,150,222,208,162,85,199,70,240,87,208,154,77,96,216,255,247,32,121,170,203,141,18,21,89,229,173,217,184,53,168,101,43,170,127,75,146,60,231,11,157,189,51,55,184,22,41,232,71,131,205,11,51,149,156,182,53,213,163,221,50,44,140,89,111,64,118,108,245,65,176,98,173,247,85,78,30,167,192,203,1,1,240,47,43,136,133,55,211,33,213,129,41,62"`,
    );

    writeMessagesCalled = false;

    applyProtocolMessageAsRelay({
      storage: {
        ...shouldNotBeCalledStorageDep.storage,
        writeMessages: (ownerId, messagesToWrite) => {
          writeMessagesCalled = true;

          expect(ownerId).toEqual(testOwnerBinaryId);
          expect(messagesToWrite.length).toMatchInlineSnapshot(`2`);

          const decryptedMessage = messagesToWrite.map(
            (message): CrdtMessage => {
              const change = decryptDbChange({
                symmetricCrypto: testSymmetricCrypto,
              })(message.change, testOwner.encryptionKey);
              assert(change.ok);
              return { timestamp: message.timestamp, change: change.value };
            },
          );
          expect(decryptedMessage).toEqual(messages.slice(0, 2));

          return true;
        },
        validateWriteKey: constTrue,
        readDbChange: constNull,
        getSize: constNull,
      },
    })(protocolMessage);

    expect(writeMessagesCalled).toBe(true);
  });

  test("with write errors", () => {
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
    ).toEqual(err({ type: "ProtocolWriteKeyError" }));
  });

  test("subscribe", () => {
    const message = createProtocolMessageBuffer(testOwner.id).unwrap();
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
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,1,0,0,1,0,0,0,0,0,0,0,0,1,115,106,11,157,135,229,28,6,92,65,155,30,72,25,50,18,189,205,143,175,133,112,99,22,139,90,151,4,67,105,103,88,119,160,130,106,61,131,206,31,57,126,155,72,144,225,163,119,131,120,173,105,236,160,201,125,92,84,34,79,121,189,87,144,88,126,111,54,15,202,211,226,23,164,91,237,207,21,109,72,233,54,214,30,68,168,20,40,19,189,93,191,25,57,240,91,35,216,172,71,85,243,242,64,93,88,107,30,51,254,180,162,140,95,181,66,111,64,118,108,245,65,176,98,173,247,85,78,30,167,192,203"`,
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
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,0,0,1,0,0,0,0,0,0,0,0,1,115,106,11,157,135,229,28,6,92,65,155,30,72,25,50,18,189,205,143,175,133,112,99,22,139,90,151,4,67,105,103,88,119,160,130,106,61,131,206,31,57,126,155,72,144,225,163,119,131,120,173,105,236,160,201,125,92,84,34,79,121,189,87,144,88,126,111,54,15,202,211,226,23,164,91,237,207,21,109,72,233,54,214,30,68,168,20,40,19,189,93,191,25,57,240,91,35,216,172,71,85,243,242,64,93,88,107,30,51,254,180,162,140,95,181,66"`,
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

// TODO: This should be a specification of the sync algorithm.
// describe("TDD sync", () => {
//   it("empty TimestampsRange to empty TimestampsRange", () => {
//     //
//   });
//   it("FingerprintRanges to TimestampsRanges or FingerprintRanges (recursion)", () => {
//     //
//   });
//   it("adjacent Skip ranges should be coalesced into a single Skip range", () => {
//     //
//   });
//   it("The last range always has InfiniteUpperBound", () => {
//     //
//   });
// });

// TODO:
// 7k mam tech stable, to pro test syncu staci
// 100k pro vsechno, protoze potrebuju otestovat max message size
// A budu chtit random DbChange, ale to asi stable, tam duplicita nevadi
describe("E2E sync", () => {
  const messages = testTimestampsAsc.map(
    (t): EncryptedCrdtMessage => ({
      timestamp: binaryTimestampToTimestamp(t),
      change: createEncryptedDbChange(createDbChange()),
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
    checkData = true,
  ): Result<PositiveInt, PositiveInt> => {
    const clientStorageDep = { storage: clientStorage };
    const relayStorageDep = { storage: relayStorage };

    let message = createProtocolMessageForSync(clientStorageDep)(testOwner.id);
    let result;
    let turn = "relay";
    let syncSteps = 0;

    // console.log("initial", message.length);

    while (message) {
      syncSteps++;
      // console.log("syncSteps", syncSteps);

      if (syncSteps > 100) {
        return err(syncSteps as PositiveInt);
      }
      if (turn === "relay") {
        result = applyProtocolMessageAsRelay(relayStorageDep)(message);
        if (!result.ok || result.value === null) break;
        // console.log("relay", result.value.length);

        message = result.value;
        turn = "client";
      } else {
        result = applyProtocolMessageAsClient(clientStorageDep)(message, {
          getWriteKey: () => testOwner.writeKey,
        });
        if (!result.ok || result.value === null) break;
        // console.log("client", result.value.length);
        message = result.value;
        turn = "relay";
      }
    }

    if (checkData) {
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
    }

    return ok(syncSteps as PositiveInt);
  };

  it("client and relay have no data", async () => {
    const [clientStorage, relayStorage] = await createStorages();

    const syncSteps = reconcile(clientStorage, relayStorage, false);
    expect(syncSteps).toEqual(ok(1));
  });

  it("client and relay have all data", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    clientStorage.writeMessages(testOwnerBinaryId, messages);
    relayStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(clientStorage, relayStorage);
    expect(syncSteps).toEqual(ok(1));
  });

  it("client has all data", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    clientStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(clientStorage, relayStorage);
    expect(syncSteps).toEqual(ok(3));
  });

  it("relay has all data", async () => {
    const [clientStorage, relayStorage] = await createStorages();
    relayStorage.writeMessages(testOwnerBinaryId, messages);

    const syncSteps = reconcile(clientStorage, relayStorage);
    expect(syncSteps).toEqual(ok(2));
  });

  it("client is missing some and relay is missing some", async () => {
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
    expect(syncSteps).toEqual(ok(5));
  });
});

describe("ranges sizes", () => {
  it("31 timestamps", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);
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
    ).toMatchInlineSnapshot(`"237 188"`);
  });

  it("testTimestampsAsc", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);

    const range: TimestampsRangeWithTimestampsBuffer = {
      type: RangeType.Timestamps,
      upperBound: InfiniteUpperBound,
      timestamps: createTimestampsBuffer(),
    };
    testTimestampsAsc.forEach((t) => {
      range.timestamps.add(binaryTimestampToTimestamp(t));
    });

    buffer.addRange(range);

    // The not efficiently encoded size was around 35 KB.
    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"6212 3633"`);
  });

  it("fingerprints", () => {
    const buffer = createProtocolMessageBuffer(testOwner.id);

    testTimestampsAsc.slice(0, 16).forEach((timestamp, i) => {
      buffer.addRange({
        type: RangeType.Fingerprint,
        upperBound: i === 15 ? InfiniteUpperBound : timestamp,
        fingerprint: binaryTimestampToFingerprint(testTimestampsRandom[i]),
      });
    });

    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"329 312"`);
  });
});
