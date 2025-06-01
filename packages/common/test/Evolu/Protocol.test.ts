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
import { createBuffer, utf8ToBytes } from "../../src/Buffer.js";
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
  idToBinaryId,
  InfiniteUpperBound,
  maxProtocolMessageRangesSize,
  ownerIdToBinaryOwnerId,
  ProtocolErrorCode,
  ProtocolValueType,
  protocolVersion,
  RangeType,
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
import { constFalse, constTrue } from "../../src/Function.js";
import {
  assertNonEmptyArray,
  createRandom,
  EncryptionKey,
  NonEmptyReadonlyArray,
} from "../../src/index.js";
import { err, getOrThrow, ok } from "../../src/Result.js";
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

const createEncryptedDbChange = (dbChange: DbChange): EncryptedDbChange =>
  encryptDbChange({ symmetricCrypto: testSymmetricCrypto })(
    dbChange,
    testOwner.encryptionKey,
  );

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

test("createTimestampsBuffer maxTimestamp", () => {
  const buffer = createTimestampsBuffer();
  buffer.add(binaryTimestampToTimestamp(maxTimestamp));
  expect(buffer.getLength()).toBe(21);
});

// describe("createProtocolMessageBuffer", () => {
//   it("should allow no ranges", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     expect(() => buffer.unwrap()).not.toThrow();
//   });

//   it("should allow single range with InfiniteUpperBound", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: InfiniteUpperBound,
//     });
//     expect(() => buffer.unwrap()).not.toThrow();
//   });

//   it("should reject single range without InfiniteUpperBound", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: testTimestampsAsc[0],
//     });
//     expect(() => buffer.unwrap()).toThrow(
//       "The last range's upperBound must be InfiniteUpperBound",
//     );
//   });

//   it("should allow multiple ranges with only last InfiniteUpperBound", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: testTimestampsAsc[0],
//     });
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: testTimestampsAsc[1],
//     });
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: InfiniteUpperBound,
//     });
//     expect(() => buffer.unwrap()).not.toThrow();
//   });

//   it("should reject range added after InfiniteUpperBound", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: InfiniteUpperBound,
//     });
//     expect(() =>
//       buffer.addRange({
//         type: RangeType.Skip,
//         upperBound: testTimestampsAsc[0],
//       }),
//     ).toThrow("Cannot add a range after an InfiniteUpperBound range");
//   });

//   it("should reject multiple InfiniteUpperBounds", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: testTimestampsAsc[0],
//     });
//     buffer.addRange({
//       type: RangeType.Skip,
//       upperBound: InfiniteUpperBound,
//     });
//     expect(() =>
//       buffer.addRange({
//         type: RangeType.Skip,
//         upperBound: InfiniteUpperBound,
//       }),
//     ).toThrow("Cannot add a range after an InfiniteUpperBound range");
//   });

//   it("hasEnoughSpaceForSplitRange", () => {
//     expect(
//       createProtocolMessageBuffer(testOwner.id, {
//         rangesMaxSize: 999 as PositiveInt,
//       }).hasEnoughSpaceForSplitRange(),
//     ).toBe(false);

//     expect(
//       createProtocolMessageBuffer(testOwner.id, {
//         rangesMaxSize: 1000 as PositiveInt,
//       }).hasEnoughSpaceForSplitRange(),
//     ).toBe(true);
//   });
// });

// describe("decodeRanges", () => {
//   const fingerprint = binaryTimestampToFingerprint(testTimestampsRandom[0]);

//   const decodeHeaderAndMessages = (buffer: Buffer) => {
//     buffer.shiftN(1 as NonNegativeInt);
//     buffer.shiftN(16 as NonNegativeInt);
//     buffer.shiftN(1 as NonNegativeInt);
//   };

//   it("should handle no ranges", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     const protocolMessage = buffer.unwrap();
//     expect(protocolMessage.join()).toMatchInlineSnapshot(
//       `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0"`,
//     );

//     const output = createBuffer(protocolMessage);
//     decodeHeaderAndMessages(output);

//     const decodedRanges = decodeRanges(output);
//     expect(decodedRanges).toEqual([]);
//     expect(output.getLength()).toBe(0);
//   });

//   it("should handle single range with InfiniteUpperBound", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     const range: FingerprintRange = {
//       type: RangeType.Fingerprint,
//       upperBound: InfiniteUpperBound,
//       fingerprint,
//     };
//     buffer.addRange(range);
//     const protocolMessage = buffer.unwrap();
//     expect(protocolMessage.join()).toMatchInlineSnapshot(
//       `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,1,182,187,38,109,89,6,62,199,219,193,245,246"`,
//     );

//     const output = createBuffer(protocolMessage);
//     decodeHeaderAndMessages(output);

//     const decodedRanges = decodeRanges(output);
//     expect(decodedRanges).toEqual([range]);
//     expect(output.getLength()).toBe(0);
//   });

//   it("should handle multiple ranges with last InfiniteUpperBound", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);

//     const range1 = {
//       type: RangeType.Skip,
//       upperBound: testTimestampsAsc[1],
//     };
//     const range2 = {
//       type: RangeType.Fingerprint,
//       upperBound: testTimestampsAsc[2],
//       fingerprint,
//     };
//     const range3 = {
//       type: RangeType.Timestamps,
//       upperBound: InfiniteUpperBound,
//       timestamps: [testTimestampsAsc[3], testTimestampsAsc[4]],
//     };

//     expect(buffer.addRange(range1)).toBe(true);
//     expect(buffer.addRange(range2)).toBe(true);

//     const timestamps = createTimestampsBuffer();
//     timestamps.add(binaryTimestampToTimestamp(testTimestampsAsc[3]));
//     timestamps.add(binaryTimestampToTimestamp(testTimestampsAsc[4]));

//     expect(
//       buffer.addRange({
//         type: RangeType.Timestamps,
//         upperBound: InfiniteUpperBound,
//         timestamps,
//       }),
//     ).toBe(true);

//     const protocolMessage = buffer.unwrap();
//     expect(protocolMessage.join()).toMatchInlineSnapshot(
//       `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,3,163,205,139,2,152,222,222,3,0,2,104,162,167,191,63,133,160,150,1,153,201,144,40,214,99,106,145,1,0,1,2,182,187,38,109,89,6,62,199,219,193,245,246,2,200,238,138,6,138,221,210,1,0,2,104,162,167,191,63,133,160,150,2"`,
//     );

//     const output = createBuffer(protocolMessage);
//     decodeHeaderAndMessages(output);

//     const decodedRanges = decodeRanges(output);

//     expect(decodedRanges).toEqual([range1, range2, range3]);
//     expect(output.getLength()).toBe(0);
//   });

//   it("should handle single empty TimestampsRange with InfiniteUpperBound", () => {
//     const buffer = createProtocolMessageBuffer(testOwner.id);
//     const range: TimestampsRangeWithTimestampsBuffer = {
//       type: RangeType.Timestamps,
//       upperBound: InfiniteUpperBound,
//       timestamps: createTimestampsBuffer(),
//     };
//     expect(buffer.addRange(range)).toBe(true);
//     const protocolMessage = buffer.unwrap();
//     expect(protocolMessage.join()).toMatchInlineSnapshot(
//       `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,2,0"`,
//     );

//     const output = createBuffer(protocolMessage);
//     decodeHeaderAndMessages(output);

//     const decodedRanges = decodeRanges(output);
//     expect(decodedRanges).toEqual([
//       {
//         type: RangeType.Timestamps,
//         upperBound: InfiniteUpperBound,
//         timestamps: [],
//       },
//     ]);
//     expect(output.getLength()).toBe(0);
//   });

//   const createSkipRange = (index: number): SkipRange => ({
//     type: RangeType.Skip,
//     upperBound: testTimestampsAsc[index],
//   });

//   const createFingerprintRange = (index: number): FingerprintRange => ({
//     type: RangeType.Fingerprint,
//     upperBound: testTimestampsAsc[index],
//     fingerprint,
//   });

//   const lastFingerprintRange: FingerprintRange = {
//     type: RangeType.Fingerprint,
//     upperBound: InfiniteUpperBound,
//     fingerprint,
//   };

//   const headerLength = 17;

//   it("should add ranges up to rangesMaxSize without exceeding it", () => {
//     const rangesMaxSize = 98 as PositiveInt;
//     const buffer = createProtocolMessageBuffer(testOwner.id, { rangesMaxSize });

//     const addedRanges: Array<SkipRange> = [];
//     for (let i = 0; i < testTimestampsAsc.length; i++) {
//       const range = createSkipRange(i);
//       if (!buffer.addRange(range)) {
//         break;
//       }
//       addedRanges.push(range);
//     }

//     expect(buffer.addRange(lastFingerprintRange)).toBe(true);

//     const protocolMessage = buffer.unwrap();
//     expect(protocolMessage.length).toBe(rangesMaxSize + headerLength);

//     const output = createBuffer(protocolMessage);
//     decodeHeaderAndMessages(output);

//     const decodedRanges = decodeRanges(output);
//     expect(decodedRanges.length).toBe(addedRanges.length + 1);
//     expect(decodedRanges.slice(0, -1)).toEqual(addedRanges);
//     expect(decodedRanges[decodedRanges.length - 1]).toEqual(
//       lastFingerprintRange,
//     );
//     expect(output.getLength()).toBe(0);
//   });

//   it("should reject a range that exceeds rangesMaxSize", () => {
//     const rangesMaxSize = 40 as PositiveInt;
//     const buffer = createProtocolMessageBuffer(testOwner.id, { rangesMaxSize });

//     const range1 = createFingerprintRange(0);
//     expect(buffer.addRange(range1)).toBe(true);

//     const range2 = createSkipRange(1);
//     expect(buffer.addRange(range2)).toBe(false);

//     expect(buffer.addRange(lastFingerprintRange)).toBe(true);

//     const protocolMessage = buffer.unwrap();
//     expect(protocolMessage.length).toBe(rangesMaxSize + headerLength);

//     const output = createBuffer(protocolMessage);
//     decodeHeaderAndMessages(output);
//     const decodedRanges = decodeRanges(output);
//     expect(decodedRanges).toEqual([range1, lastFingerprintRange]);
//     expect(output.getLength()).toBe(0);
//   });
// });

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

describe("E2E header", () => {
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
});

describe("E2E relay options", () => {
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
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,1,0,0,1,0,0,0,0,0,0,0,0,1,115,189,215,126,28,170,160,0,84,60,116,239,128,64,1,243,80,81,13,183,12,227,152,57,246,90,220,73,121,152,110,8,113,127,69,183,223,210,110,220,13,32,7,152,113,69,226,105,82,116,14,26,44,247,0,77,106,136,12,202,24,163,144,115,245,119,25,196,25,146,233,131,214,206,138,104,163,181,208,80,70,252,19,162,166,120,124,237,52,101,70,140,167,124,4,169,41,14,174,206,78,22,153,10,4,247,90,201,170,29,27,65,250,140,19,119,111,64,118,108,245,65,176,98,173,247,85,78,30,167,192,203"`,
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
      `"0,128,87,31,173,149,230,206,93,128,2,246,220,162,236,95,168,0,1,0,0,1,0,0,0,0,0,0,0,0,1,115,189,215,126,28,170,160,0,84,60,116,239,128,64,1,243,80,81,13,183,12,227,152,57,246,90,220,73,121,152,110,8,113,127,69,183,223,210,110,220,13,32,7,152,113,69,226,105,82,116,14,26,44,247,0,77,106,136,12,202,24,163,144,115,245,119,25,196,25,146,233,131,214,206,138,104,163,181,208,80,70,252,19,162,166,120,124,237,52,101,70,140,167,124,4,169,41,14,174,206,78,22,153,10,4,247,90,201,170,29,27,65,250,140,19,119"`,
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
        table: "foo" as TableName,
        id: testCreateId(),
        values: {
          ["bar" as ColumnName]: "x".repeat(testRandomLib.int(1, 500)),
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
          367,
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
          367,
          192,
          999837,
          39,
          542273,
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
          367,
          192,
          999837,
          39,
          130101,
          39,
          145667,
          39,
          145034,
          39,
          130570,
        ],
        "syncSteps": 11,
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
          21,
          999612,
          38,
          561652,
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
          21,
          151564,
          38,
          159456,
          38,
          135501,
          38,
          146557,
          38,
          152688,
          38,
          145430,
          38,
          144553,
          38,
          131225,
          38,
          143516,
          38,
          150847,
          38,
          110189,
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
          367,
          5204,
          21695,
          796004,
          768309,
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
          340,
          2234,
          2262,
          108244,
          104304,
          2275,
          2251,
          78413,
          79383,
          2294,
          2225,
          88037,
          61603,
          2239,
          2252,
          69487,
          68809,
          2273,
          61859,
          66753,
          2261,
          61964,
          62370,
          2227,
          67225,
          52341,
          2219,
          51386,
          54608,
          2211,
          51414,
          50400,
          55252,
          84414,
          32452,
          82684,
          89613,
          6569,
        ],
        "syncSteps": 38,
      }
    `);
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

    expect(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
    ).toMatchInlineSnapshot(`"31627 18269"`);
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
