import { compress, init } from "@bokuweb/zstd-wasm";
import { before, describe, it, test } from "node:test";
import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertNonEmptyArray,
  assertOk,
  assertSame,
} from "../../../../../packages/common/src/Assert.ts";
import { eqArrayNumber } from "../../../../../packages/common/src/Eq.ts";
import { exhaustiveCheck } from "../../../../../packages/common/src/Function.ts";
import { computeBalancedBuckets } from "../../../../../packages/common/src/Number.ts";
import {
  ownerIdToOwnerIdBytes,
  testAppOwner,
} from "../../../../../packages/common/src/local-first/Owner.ts";
import {
  applyProtocolMessageAsClient,
  applyProtocolMessageAsRelay,
  createProtocolMessageBuffer,
  createProtocolMessageForSync,
  createProtocolMessageFromCrdtMessages,
  createTimestampsBuffer,
  defaultProtocolMessageMaxSize,
  defaultProtocolMessageRangesMaxSize,
  encodeAndEncryptDbChange,
  ProtocolErrorCode,
  ProtocolMessageMaxSize,
  ProtocolMessageRangesMaxSize,
  MessageType,
  type ProtocolChangeTooLargeError,
  type ProtocolMessage,
  type ProtocolMessageBuffer,
  type TimestampsRangeWithTimestampsBuffer,
} from "../../../../../packages/common/src/local-first/Protocol.ts";
import type {
  CrdtMessage,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  Fingerprint,
  Storage,
  StorageDep,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  DbChange,
  fingerprintSize,
  InfiniteUpperBound,
  RangeType,
  timestampBytesToFingerprint,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  Counter,
  createTimestamp,
  NodeId,
  type Timestamp,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../../../../packages/common/src/local-first/Timestamp.ts";
import { getOrThrow } from "../../../../../packages/common/src/Result.ts";
import { installPolyfills } from "../../../../../packages/common/src/Polyfills.ts";
import {
  testCreateDeps,
  testCreateRun,
  type Run,
  type RunDefaultDeps,
} from "../../../../../packages/common/src/Task.ts";
import { Millis } from "../../../../../packages/common/src/Time.ts";
import {
  createId,
  DateIsoFromDate,
  NonNegativeInt,
} from "../../../../../packages/common/src/Type.ts";
import {
  setupSqliteAndRelayStorage,
  testCreateTimestampBytesFixtures,
  type TestSqliteAndRelayStorageSetup,
} from "../../_deps.ts";

const testAppOwnerIdBytes = ownerIdToOwnerIdBytes(testAppOwner.id);
const { testTimestampsAsc, testTimestampsRandom } =
  testCreateTimestampBytesFixtures(testCreateDeps());

installPolyfills();

before(async () => {
  await init();
});

/** Returns uncompressed and compressed sizes. */
const getUncompressedAndCompressedSizes = (array: Uint8Array) =>
  `${array.byteLength} ${compress(array).length}`;

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

const createEncryptedDbChange = (
  deps: RunDefaultDeps,
  message: CrdtMessage,
): EncryptedDbChange =>
  encodeAndEncryptDbChange(deps)(message, testAppOwner.encryptionKey);

/**
 * Returns the index-th of ascending timestamps with nearly the widest encoding
 * in a frame: a 6-byte millis delta, a 3-byte counter, and a NodeId unlike its
 * neighbors', so no run of the run-length encoding spans two of them.
 */
const createWideTimestamp = (index: number): Timestamp =>
  createTimestamp({
    millis: Millis.orThrow((index + 1) * 2 ** 35),
    counter: Counter.orThrow(16_384 + index),
    nodeId: NodeId.orThrow((index + 1).toString(16).padStart(16, "0")),
  });

/**
 * Stores changes of the given lengths. Relay storage serves stored bytes
 * without decrypting them, so they are zeros.
 */
const storeChanges = async (
  { run, storage }: TestSqliteAndRelayStorageSetup,
  changes: ReadonlyArray<readonly [Timestamp, number]>,
): Promise<void> => {
  const messages = changes.map(([timestamp, length]): EncryptedCrdtMessage => ({
    timestamp,
    change: new Uint8Array(length) as EncryptedDbChange,
  }));
  assertNonEmptyArray(messages);
  await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, messages));
};

const createRequest = (): ProtocolMessageBuffer =>
  createProtocolMessageBuffer(testAppOwner.id, {
    messageType: MessageType.Request,
  });

const createResponse = (
  rangesMaxSize?: ProtocolMessageRangesMaxSize,
): ProtocolMessageBuffer =>
  createProtocolMessageBuffer(testAppOwner.id, {
    messageType: MessageType.Response,
    errorCode: ProtocolErrorCode.NoError,
    rangesMaxSize,
  });

/** An empty response is its header followed by a zero message count. */
const emptyResponse = createResponse().unwrap();

/**
 * Asserts a response without an error that fits
 * {@link defaultProtocolMessageMaxSize}.
 */
const assertFittingResponse = (message: ProtocolMessage): void => {
  assert(
    message.length <= defaultProtocolMessageMaxSize,
    `The response has ${message.length} bytes.`,
  );
  assertEqualBytes(
    message.subarray(0, emptyResponse.length - 1),
    emptyResponse.subarray(0, -1),
  );
};

// Stored ranges in these tests are not empty, so none has a zero fingerprint.
const wrongFingerprint = new Uint8Array(12) as Fingerprint;

const createTimestampsRange = (
  upperBound: TimestampsRangeWithTimestampsBuffer["upperBound"],
  timestamps: ReadonlyArray<Timestamp>,
): TimestampsRangeWithTimestampsBuffer => {
  const buffer = createTimestampsBuffer();
  for (const timestamp of timestamps) buffer.add(timestamp);
  return { type: RangeType.Timestamps, upperBound, timestamps: buffer };
};

test("createProtocolMessageForSync", async () => {
  await using setup = await setupSqliteAndRelayStorage();
  const { run, storage } = setup;

  // Empty DB: version, ownerId, 0 messages, one empty TimestampsRange.
  assertEqualBytes(
    createProtocolMessageForSync(run.deps)(testAppOwner.id),
    [
      1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235, 212,
      0, 0, 0, 0, 1, 2, 0,
    ],
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
  assertEqualBytes(
    createProtocolMessageForSync(run.deps)(testAppOwner.id),
    [
      1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235, 212,
      0, 0, 0, 0, 1, 2, 31, 0, 154, 143, 203, 7, 183, 247, 225, 1, 178, 251, 46,
      140, 207, 168, 4, 0, 0, 156, 202, 117, 228, 249, 79, 254, 222, 206, 1,
      173, 159, 246, 14, 241, 178, 162, 2, 252, 205, 213, 3, 204, 146, 223, 3,
      0, 173, 132, 234, 2, 0, 0, 235, 242, 172, 1, 173, 181, 134, 1, 213, 243,
      164, 7, 192, 245, 224, 10, 0, 255, 151, 205, 3, 0, 152, 202, 181, 1, 245,
      238, 138, 10, 0, 228, 168, 242, 1, 194, 226, 241, 4, 167, 235, 69, 0, 5,
      1, 1, 2, 1, 0, 7, 1, 1, 0, 1, 1, 1, 2, 1, 0, 4, 1, 1, 0, 1, 1, 1, 0, 2, 1,
      1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 104, 162, 167, 191, 63, 133, 160, 150,
      5, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167, 191, 63, 133,
      160, 150, 4, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167, 191,
      63, 133, 160, 150, 4, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162,
      167, 191, 63, 133, 160, 150, 2, 153, 201, 144, 40, 214, 99, 106, 145, 2,
      104, 162, 167, 191, 63, 133, 160, 150, 4, 153, 201, 144, 40, 214, 99, 106,
      145, 2, 104, 162, 167, 191, 63, 133, 160, 150, 4,
    ],
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
  assertEqualBytes(
    createProtocolMessageForSync(run.deps)(testAppOwner.id),
    [
      1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235, 212,
      0, 0, 0, 0, 16, 209, 134, 173, 9, 190, 202, 215, 4, 0, 128, 196, 197, 1,
      171, 254, 196, 16, 237, 128, 248, 5, 204, 146, 223, 3, 173, 132, 234, 2,
      235, 242, 172, 1, 130, 169, 171, 8, 192, 245, 224, 10, 255, 151, 205, 3,
      141, 185, 192, 11, 228, 168, 242, 1, 233, 205, 183, 5, 0, 2, 2, 1, 0, 3,
      1, 2, 0, 2, 1, 2, 0, 3, 104, 162, 167, 191, 63, 133, 160, 150, 2, 153,
      201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167, 191, 63, 133, 160, 150,
      4, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167, 191, 63, 133,
      160, 150, 1, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167, 191,
      63, 133, 160, 150, 2, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162,
      167, 191, 63, 133, 160, 150, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 76, 72, 32, 196, 18, 225, 45, 216, 89, 25, 181, 240, 71, 27, 67,
      128, 158, 102, 5, 202, 117, 185, 15, 182, 252, 67, 252, 106, 118, 33, 10,
      50, 232, 57, 200, 50, 119, 9, 88, 23, 42, 201, 32, 178, 166, 142, 74, 23,
      254, 224, 23, 50, 109, 13, 161, 186, 204, 209, 69, 162, 13, 99, 151, 207,
      147, 27, 25, 210, 216, 161, 42, 128, 42, 252, 206, 107, 55, 85, 52, 93,
      10, 248, 1, 135, 157, 70, 72, 92, 106, 176, 49, 227, 120, 198, 202, 185,
      95, 68, 35, 217, 253, 229, 250, 212, 175, 85, 58, 34, 69, 44, 39, 66, 194,
      119, 214, 112, 114, 151, 183, 111, 72, 190, 156, 173, 234, 120, 215, 232,
      185, 135, 150, 78, 171, 3, 242, 236, 49, 198, 113, 245, 69, 26, 23, 155,
      206, 6, 176, 69, 136, 32, 254, 80, 121, 243, 255, 21, 95, 71, 229, 33,
      209, 173, 73, 246, 49, 35, 97, 85, 106, 246, 20, 205, 41, 56, 175, 91,
      138, 4, 7, 159, 40, 169, 151, 251, 213, 108, 138, 151, 239, 174, 142, 109,
    ],
  );
});

test("a mismatched range too small to split returns its own timestamps", async () => {
  await using setup = await setupSqliteAndRelayStorage();
  const { run, storage } = setup;

  const timestamps = testTimestampsAsc.slice(0, 40);
  const messages = timestamps.map((t): EncryptedCrdtMessage => ({
    timestamp: timestampBytesToTimestamp(t),
    change: createEncryptedDbChange(run.deps, {
      timestamp: timestampBytesToTimestamp(t),
      change: createDbChange(run.deps),
    }),
  }));
  assertNonEmptyArray(messages);
  await run(storage.writeMessages(testAppOwnerIdBytes, messages));

  // The mismatched range starts at index 20 and holds 20 timestamps, fewer
  // than fingerprint buckets need, so the relay answers with its timestamps.
  const request = createProtocolMessageBuffer(testAppOwner.id, {
    messageType: MessageType.Request,
  });
  request.addRange({ type: RangeType.Skip, upperBound: timestamps[20] });
  request.addRange({
    type: RangeType.Fingerprint,
    upperBound: InfiniteUpperBound,
    fingerprint: timestampBytesToFingerprint(testTimestampsRandom[0]),
  });

  const expected = createProtocolMessageBuffer(testAppOwner.id, {
    messageType: MessageType.Response,
    errorCode: ProtocolErrorCode.NoError,
  });
  expected.addRange({ type: RangeType.Skip, upperBound: timestamps[20] });
  const range: TimestampsRangeWithTimestampsBuffer = {
    type: RangeType.Timestamps,
    upperBound: InfiniteUpperBound,
    timestamps: createTimestampsBuffer(),
  };
  for (const t of timestamps.slice(20)) {
    range.timestamps.add(timestampBytesToTimestamp(t));
  }
  expected.addRange(range);

  const response = await run.orThrow(
    applyProtocolMessageAsRelay(request.unwrap()),
  );
  assertEqualBytes(response.message, expected.unwrap());
});

describe("sync near the size limit", () => {
  /**
   * Three small changes, 107 changes whose messages nearly fill a frame, and
   * 900 small changes the peer already has, with the ranges asking for them
   * after a skip over the small changes. The peer lists one change the other
   * side lacks, so the range must be answered.
   */
  const setupKnownTimestampsAfterMessages = async (
    setup: TestSqliteAndRelayStorageSetup,
    frame: ProtocolMessageBuffer,
  ) => {
    const timestamps = Array.from({ length: 1010 }, (_, index) =>
      createWideTimestamp(index),
    );
    await storeChanges(
      setup,
      timestamps.map((timestamp, index) => [
        timestamp,
        index >= 3 && index < 110 ? 9_258 : 100,
      ]),
    );
    frame.addRange({
      type: RangeType.Skip,
      upperBound: timestampToTimestampBytes(timestamps[3]),
    });
    frame.addRange(
      createTimestampsRange(InfiniteUpperBound, [
        ...timestamps.slice(110),
        createWideTimestamp(1010),
      ]),
    );
    return frame.unwrap();
  };

  it("lists known timestamps after nearly full messages in a response", async () => {
    await using relay = await setupSqliteAndRelayStorage();
    const request = await setupKnownTimestampsAfterMessages(
      relay,
      createRequest(),
    );

    const result = await relay.run(applyProtocolMessageAsRelay(request));

    assertOk(result);
    assertFittingResponse(result.value.message);
    // The response lists known timestamps after the large changes and ends with
    // a fingerprint from the first one it did not list.
    const fingerprint = result.value.message.subarray(
      result.value.message.length - fingerprintSize,
    );
    const firstUnlisted = Array.from(
      { length: 1010 },
      (_, index) => index,
    ).find((index) =>
      eqArrayNumber(
        fingerprint,
        relay.storage.fingerprint(
          testAppOwnerIdBytes,
          NonNegativeInt.orThrow(index),
          NonNegativeInt.orThrow(1010),
        ),
      ),
    );
    assert(
      firstUnlisted !== undefined && firstUnlisted > 110,
      `The response lists up to ${firstUnlisted}.`,
    );
    await using client = await setupSqliteAndRelayStorage();
    const clientResult = await client.run(
      applyProtocolMessageAsClient(result.value.message, {
        writeKey: testAppOwner.writeKey,
      }),
    );
    assertOk(clientResult);
    assertSame(clientResult.value.type, "Response");
  });

  it("lists known timestamps after nearly full messages in a request", async () => {
    await using client = await setupSqliteAndRelayStorage();
    const response = await setupKnownTimestampsAfterMessages(
      client,
      createResponse(),
    );

    const result = await client.run(
      applyProtocolMessageAsClient(response, {
        writeKey: testAppOwner.writeKey,
      }),
    );

    assertOk(result);
    assert(result.value.type === "Response", "Expected a request.");
    assert(
      result.value.message.length <= defaultProtocolMessageMaxSize,
      `The request has ${result.value.message.length} bytes.`,
    );
  });

  it("falls back to one fingerprint when a split does not fit after nearly full messages", async () => {
    await using relay = await setupSqliteAndRelayStorage();
    const timestamps = Array.from({ length: 42 }, (_, index) =>
      createWideTimestamp(index),
    );
    await storeChanges(
      relay,
      timestamps.map((timestamp, index) => [
        timestamp,
        index < 2 ? 499_850 : 100,
      ]),
    );
    // The client lacks the two large changes, and its 40 small ones differ.
    const request = createRequest();
    request.addRange(
      createTimestampsRange(timestampToTimestampBytes(timestamps[2]), []),
    );
    request.addRange({
      type: RangeType.Fingerprint,
      upperBound: InfiniteUpperBound,
      fingerprint: wrongFingerprint,
    });

    const result = await relay.run.orThrow(
      applyProtocolMessageAsRelay(request.unwrap()),
    );

    // The large changes leave no room to split the small ones into 16
    // fingerprints, so one fingerprint covers everything after the last range
    // the response answered, the skipped range included.
    const expected = createResponse();
    for (const timestamp of timestamps.slice(0, 2)) {
      expected.addMessage({
        timestamp,
        change: relay.storage.readDbChange(
          testAppOwnerIdBytes,
          timestampToTimestampBytes(timestamp),
        ),
      });
    }
    expected.addRange({
      type: RangeType.Fingerprint,
      upperBound: InfiniteUpperBound,
      fingerprint: relay.storage.fingerprint(
        testAppOwnerIdBytes,
        NonNegativeInt.orThrow(0),
        NonNegativeInt.orThrow(42),
      ),
    });
    assertFittingResponse(result.message);
    // A diff of a nearly full frame would take gigabytes.
    assert(
      eqArrayNumber(result.message, expected.unwrap()),
      "Expected the messages and one fingerprint.",
    );
  });

  /**
   * Ranges past the relay's 12 changes, each listing one timestamp the relay
   * lacks, so the relay answers each with an empty Timestamps range.
   */
  const addEmptyWindowRanges = (
    request: ProtocolMessageBuffer,
    timestamps: ReadonlyArray<Timestamp>,
  ) => {
    for (const [index, timestamp] of timestamps.entries()) {
      request.addRange(
        createTimestampsRange(
          index + 1 < timestamps.length
            ? timestampToTimestampBytes(timestamps[index + 1])
            : InfiniteUpperBound,
          [timestamp],
        ),
      );
    }
  };

  it("answers ranges past nearly full messages within the total size", async () => {
    await using relay = await setupSqliteAndRelayStorage();
    const timestamps = Array.from({ length: 1012 }, (_, index) =>
      createWideTimestamp(index),
    );
    await storeChanges(
      relay,
      timestamps.slice(0, 12).map((timestamp) => [timestamp, 83_000]),
    );
    const request = createRequest();
    request.addRange(
      createTimestampsRange(timestampToTimestampBytes(timestamps[12]), []),
    );
    addEmptyWindowRanges(request, timestamps.slice(12));

    const result = await relay.run(
      applyProtocolMessageAsRelay(request.unwrap()),
    );

    assertOk(result);
    assertFittingResponse(result.value.message);
  });

  it("answers ranges past the relay's data within the ranges size", async () => {
    await using relay = await setupSqliteAndRelayStorage();
    const timestamps = Array.from({ length: 205 }, (_, index) =>
      createWideTimestamp(index),
    );
    await storeChanges(
      relay,
      timestamps.slice(0, 5).map((timestamp) => [timestamp, 100]),
    );
    const request = createRequest();
    request.addRange({
      type: RangeType.Skip,
      upperBound: timestampToTimestampBytes(timestamps[5]),
    });
    addEmptyWindowRanges(request, timestamps.slice(5));
    const rangesMaxSize = ProtocolMessageRangesMaxSize.orThrow(3_000);

    const result = await relay.run(
      applyProtocolMessageAsRelay(request.unwrap(), { rangesMaxSize }),
    );

    assertOk(result);
    assertFittingResponse(result.value.message);
    // The response holds no messages, so the rest is its ranges section.
    const rangesSize = result.value.message.length - emptyResponse.length;
    assert(
      rangesSize <= rangesMaxSize,
      `The ranges section has ${rangesSize} bytes.`,
    );
  });

  it("keeps every response within the size at each length of a change near it", async () => {
    // Two large changes nearly fill a response before 56 small ones, which the
    // relay sends, lists as known, or splits. The first change's length moves
    // the edge across one small change's size, with and without a pending
    // skip over two leading changes.
    const tails = ["send", "list", "split"] as const;
    for (const tail of tails) {
      for (const hasSkip of [false, true]) {
        for (let length = 499_350; length < 499_434; length++) {
          await using relay = await setupSqliteAndRelayStorage();
          const timestamps = Array.from({ length: 60 }, (_, index) =>
            createWideTimestamp(index),
          );
          const first = hasSkip ? 0 : 2;
          await storeChanges(
            relay,
            timestamps
              .slice(first)
              .map((timestamp, index) => [
                timestamp,
                index === 2 - first
                  ? length
                  : index === 3 - first
                    ? 500_000
                    : 60,
              ]),
          );

          const request = createRequest();
          if (hasSkip)
            request.addRange({
              type: RangeType.Skip,
              upperBound: timestampToTimestampBytes(timestamps[2]),
            });
          const lacked = createWideTimestamp(60);
          switch (tail) {
            case "send":
              request.addRange(
                createTimestampsRange(InfiniteUpperBound, [lacked]),
              );
              break;
            case "list":
              request.addRange(
                createTimestampsRange(InfiniteUpperBound, [
                  ...timestamps.slice(4),
                  lacked,
                ]),
              );
              break;
            case "split":
              request.addRange(
                createTimestampsRange(
                  timestampToTimestampBytes(timestamps[4]),
                  [],
                ),
              );
              request.addRange({
                type: RangeType.Fingerprint,
                upperBound: InfiniteUpperBound,
                fingerprint: wrongFingerprint,
              });
              break;
            default:
              exhaustiveCheck(tail);
          }

          const result = await relay.run(
            applyProtocolMessageAsRelay(request.unwrap()),
          );

          assert(result.ok, `${tail} ${hasSkip} ${length}: not ok.`);
          assertFittingResponse(result.value.message);
        }
      }
    }
  });

  describe("a split that does not fit the ranges size", () => {
    // 640 timestamps make 16 buckets of 40, and the relay splits each
    // mismatched bucket into 16 fingerprints. Nine splits fit 3,000 bytes.
    const rangesMaxSize = ProtocolMessageRangesMaxSize.orThrow(3_000);

    const setupBuckets = async () => {
      const setup = await setupSqliteAndRelayStorage();
      await storeChanges(
        setup,
        testTimestampsAsc
          .slice(0, 640)
          .map((timestamp) => [timestampBytesToTimestamp(timestamp), 100]),
      );
      const buckets = setup.storage.fingerprintRanges(
        testAppOwnerIdBytes,
        getOrThrow(computeBalancedBuckets(NonNegativeInt.orThrow(640))),
      );
      const request = createRequest();
      const expected = createResponse(rangesMaxSize);
      for (const [index, bucket] of buckets.slice(0, 9).entries()) {
        request.addRange({ ...bucket, fingerprint: wrongFingerprint });
        const lower = 40 * index;
        const splits = setup.storage.fingerprintRanges(
          testAppOwnerIdBytes,
          [
            NonNegativeInt.orThrow(lower),
            ...getOrThrow(
              computeBalancedBuckets(NonNegativeInt.orThrow(40)),
            ).map((end) => NonNegativeInt.orThrow(lower + end)),
          ],
          bucket.upperBound,
        );
        for (const split of splits.slice(1)) expected.addRange(split);
      }
      // The fallback fingerprint covers everything after the last split.
      expected.addRange({
        type: RangeType.Fingerprint,
        upperBound: InfiniteUpperBound,
        fingerprint: setup.storage.fingerprint(
          testAppOwnerIdBytes,
          NonNegativeInt.orThrow(360),
          NonNegativeInt.orThrow(640),
        ),
      });
      return { setup, buckets, request, expected };
    };

    it("fingerprints from where the skipped ranges began", async () => {
      const { setup, buckets, request, expected } = await setupBuckets();
      await using _setup = setup;
      // A matching bucket is skipped, and then the rest does not fit.
      request.addRange(buckets[9]);
      request.addRange({
        type: RangeType.Fingerprint,
        upperBound: InfiniteUpperBound,
        fingerprint: wrongFingerprint,
      });

      const result = await setup.run.orThrow(
        applyProtocolMessageAsRelay(request.unwrap(), { rangesMaxSize }),
      );

      assertEqualBytes(result.message, expected.unwrap());
    });

    it("fingerprints from the bound of the range that does not fit", async () => {
      const { setup, buckets, request, expected } = await setupBuckets();
      await using _setup = setup;
      request.addRange({ ...buckets[9], fingerprint: wrongFingerprint });
      request.addRange({
        type: RangeType.Fingerprint,
        upperBound: InfiniteUpperBound,
        fingerprint: wrongFingerprint,
      });

      const result = await setup.run.orThrow(
        applyProtocolMessageAsRelay(request.unwrap(), { rangesMaxSize }),
      );

      assertEqualBytes(result.message, expected.unwrap());
    });
  });

  describe("a stored change too large for any frame", () => {
    /**
     * Syncs the client with the relay from the client's sync request until the
     * client converges, failing after 20 messages.
     */
    const syncClientWithRelay = async (
      clientRun: Run<StorageDep>,
      relayRun: Run<StorageDep>,
      onChangeTooLarge?: (error: ProtocolChangeTooLargeError) => void,
    ) => {
      let message = createProtocolMessageForSync(clientRun.deps)(
        testAppOwner.id,
      );
      for (let step = 0; step < 10; step++) {
        const response = await relayRun.orThrow(
          applyProtocolMessageAsRelay(message),
        );
        const result = await clientRun.orThrow(
          applyProtocolMessageAsClient(response.message, {
            writeKey: testAppOwner.writeKey,
            ...(onChangeTooLarge && { onChangeTooLarge }),
          }),
        );
        if (result.type === "Converged") return;
        assert(result.type === "Response", "Expected a request.");
        message = result.message;
      }
      throw new Error("The sync did not converge.");
    };

    it("is skipped by a client, which uploads the rest", async () => {
      await using client = await setupSqliteAndRelayStorage();
      await using relay = await setupSqliteAndRelayStorage();
      const timestamps = testTimestampsAsc
        .slice(0, 400)
        .map(timestampBytesToTimestamp);
      // A client up to 8.11 could save a 999,377-byte blob, which encrypts to
      // 1,015,851 bytes.
      await storeChanges(
        client,
        timestamps.map((timestamp, index) => [
          timestamp,
          index === 200 ? 1_015_851 : 100,
        ]),
      );
      const errors: Array<ProtocolChangeTooLargeError> = [];

      await syncClientWithRelay(client.run, relay.run, (error) => {
        errors.push(error);
      });

      assertSame(relay.storage.getSize(testAppOwnerIdBytes), 399);
      assertNonEmptyArray(errors);
      for (const error of errors)
        assertEqual(error, {
          type: "ProtocolChangeTooLargeError",
          timestamp: timestamps[200],
          size: 1_015_851,
        });

      // Every later sync skips it again and converges too.
      errors.length = 0;
      await syncClientWithRelay(client.run, relay.run, (error) => {
        errors.push(error);
      });
      assertNonEmptyArray(errors);
      assertSame(relay.storage.getSize(testAppOwnerIdBytes), 399);
    });

    it("is skipped and logged by a relay, which sends the rest", async () => {
      await using client = await setupSqliteAndRelayStorage();
      await using relay = await setupSqliteAndRelayStorage();
      const timestamps = testTimestampsAsc
        .slice(0, 40)
        .map(timestampBytesToTimestamp);
      // Anyone with the write key can upload a crafted change that fits an
      // upload request but no sync response, beside the largest change a
      // client up to 8.11 could save.
      await storeChanges(
        relay,
        timestamps.map((timestamp, index) => [
          timestamp,
          index === 10 ? 999_467 : index === 20 ? 999_900 : 100,
        ]),
      );
      await using relayRun = testCreateRun({ storage: relay.storage });
      const clientErrors: Array<ProtocolChangeTooLargeError> = [];

      await syncClientWithRelay(client.run, relayRun, (error) => {
        clientErrors.push(error);
      });

      assertEqual(clientErrors, []);
      assertSame(client.storage.getSize(testAppOwnerIdBytes), 39);
      assertSame(
        client.storage.readDbChange(
          testAppOwnerIdBytes,
          timestampToTimestampBytes(timestamps[10]),
        ).length,
        999_467,
      );
      const warnings = relayRun.deps.console
        .getEntriesSnapshot()
        .filter((entry) => entry.method === "warn");
      assertNonEmptyArray(warnings);
      for (const warning of warnings)
        assertEqual(warning.args, [
          {
            type: "ProtocolChangeTooLargeError",
            timestamp: timestamps[20],
            size: 999_900,
          },
        ]);
    });

    it("is neither sent nor listed in an answer when each side holds one", async () => {
      // Each side lacks the other's skipped change. Listing it in a
      // Timestamps answer would make the peer ask for it again in every round.
      await using client = await setupSqliteAndRelayStorage();
      await using relay = await setupSqliteAndRelayStorage();
      const timestamps = testTimestampsAsc
        .slice(0, 4)
        .map(timestampBytesToTimestamp);
      await storeChanges(client, [
        [timestamps[0], 100],
        [timestamps[1], 1_015_851],
      ]);
      await storeChanges(relay, [
        [timestamps[2], 100],
        [timestamps[3], 1_015_851],
      ]);
      await using relayRun = testCreateRun({ storage: relay.storage });
      const clientErrors: Array<ProtocolChangeTooLargeError> = [];

      await syncClientWithRelay(client.run, relayRun, (error) => {
        clientErrors.push(error);
      });

      assertSame(client.storage.getSize(testAppOwnerIdBytes), 3);
      assertSame(relay.storage.getSize(testAppOwnerIdBytes), 3);
      assertNonEmptyArray(clientErrors);
      for (const error of clientErrors)
        assertEqual(error, {
          type: "ProtocolChangeTooLargeError",
          timestamp: timestamps[1],
          size: 1_015_851,
        });
      const warnings = relayRun.deps.console
        .getEntriesSnapshot()
        .filter((entry) => entry.method === "warn");
      assertNonEmptyArray(warnings);
      for (const warning of warnings)
        assertEqual(warning.args, [
          {
            type: "ProtocolChangeTooLargeError",
            timestamp: timestamps[3],
            size: 1_015_851,
          },
        ]);
    });

    it("is logged by a client without onChangeTooLarge", async () => {
      await using client = await setupSqliteAndRelayStorage();
      await using relay = await setupSqliteAndRelayStorage();
      const timestamps = testTimestampsAsc
        .slice(0, 3)
        .map(timestampBytesToTimestamp);
      await storeChanges(
        client,
        timestamps.map((timestamp, index) => [
          timestamp,
          index === 1 ? 1_015_851 : 100,
        ]),
      );
      await using clientRun = testCreateRun({ storage: client.storage });

      await syncClientWithRelay(clientRun, relay.run);

      assertSame(relay.storage.getSize(testAppOwnerIdBytes), 2);
      const warnings = clientRun.deps.console
        .getEntriesSnapshot()
        .filter((entry) => entry.method === "warn");
      assertNonEmptyArray(warnings);
      for (const warning of warnings)
        assertEqual(warning.args, [
          {
            type: "ProtocolChangeTooLargeError",
            timestamp: timestamps[1],
            size: 1_015_851,
          },
        ]);
    });

    it("is sent at the largest size that fits an empty frame after a skip", async () => {
      // The relay lacks the first change, so the client's first answer holds
      // it and cannot fit X. A later round sends X first after a Skip range,
      // which is the frame the check measures. X one byte larger is reported
      // and not sent in that sync. Without a pending skip, a frame holds 22
      // bytes more, so such a change may still be sent by a later sync.
      const timestamps = [0, 1].map((index) =>
        createTimestamp({
          millis: Millis.orThrow(1_700_000_000_000 + index * 1000),
          nodeId: NodeId.orThrow("0000000000000001"),
        }),
      );
      for (const [size, isSent] of [
        [999_867, true],
        [999_868, false],
      ] as const) {
        await using client = await setupSqliteAndRelayStorage();
        await using relay = await setupSqliteAndRelayStorage();
        await storeChanges(client, [
          [timestamps[0], 100],
          [timestamps[1], size],
        ]);
        const errors: Array<ProtocolChangeTooLargeError> = [];

        await syncClientWithRelay(client.run, relay.run, (error) => {
          errors.push(error);
        });

        assertSame(relay.storage.getSize(testAppOwnerIdBytes), isSent ? 2 : 1);
        assertEqual(
          errors,
          isSent
            ? []
            : [
                {
                  type: "ProtocolChangeTooLargeError",
                  timestamp: timestamps[1],
                  size,
                },
              ],
        );
      }
    });
  });
});

describe("decode bounds", () => {
  /** An empty request is its header followed by a zero message count. */
  const emptyRequest = createRequest().unwrap();

  it("accepts a 100,000-byte ranges section", async () => {
    await using relay = await setupSqliteAndRelayStorage();
    const timestamps = testTimestampsAsc
      .slice(0, 1000)
      .map(timestampBytesToTimestamp);
    await storeChanges(
      relay,
      timestamps.map((timestamp) => [timestamp, 100]),
    );
    const request = createRequest();
    for (let i = 0; i < 50_000; i++)
      request.addRange({
        type: RangeType.Skip,
        upperBound: testTimestampsAsc[500],
      });
    request.addRange({
      type: RangeType.Fingerprint,
      upperBound: InfiniteUpperBound,
      fingerprint: wrongFingerprint,
    });
    const message = request.unwrap();
    assert(message.length - emptyRequest.length > 100_000, "Too small.");

    const result = await relay.run(applyProtocolMessageAsRelay(message));

    assertOk(result);
    assertFittingResponse(result.value.message);
  });

  it("accepts a nested timestamps list packed at one byte per timestamp", async () => {
    await using relay = await setupSqliteAndRelayStorage();
    // Equal timestamps take one byte each, so the list count nearly equals the
    // bytes after it.
    const request = createRequest();
    request.addRange(
      createTimestampsRange(
        InfiniteUpperBound,
        Array.from({ length: 99_980 }, () =>
          createTimestamp({ millis: Millis.orThrow(1000) }),
        ),
      ),
    );

    const result = await relay.run(
      applyProtocolMessageAsRelay(request.unwrap()),
    );

    assertOk(result);
    assertFittingResponse(result.value.message);
  });

  it("accepts equal consecutive upper bounds emitted by a size-limited response", async () => {
    await using relay = await setupSqliteAndRelayStorage();
    const timestamps = Array.from({ length: 12 }, (_, index) =>
      createWideTimestamp(index),
    );
    await storeChanges(
      relay,
      timestamps.map((timestamp) => [timestamp, 100_000]),
    );
    const request = createRequest();
    request.addRange(
      createTimestampsRange(timestampToTimestampBytes(timestamps[9]), []),
    );
    request.addRange(createTimestampsRange(InfiniteUpperBound, []));

    const result = await relay.run.orThrow(
      applyProtocolMessageAsRelay(request.unwrap()),
    );

    // Nine changes fill the response. The relay skips the first range and
    // answers the second one up to the change that did not fit, so both of its
    // ranges end at that change.
    const expected = createResponse();
    for (const timestamp of timestamps.slice(0, 9)) {
      expected.addMessage({
        timestamp,
        change: relay.storage.readDbChange(
          testAppOwnerIdBytes,
          timestampToTimestampBytes(timestamp),
        ),
      });
    }
    const upperBound = timestampToTimestampBytes(timestamps[9]);
    expected.addRange({ type: RangeType.Skip, upperBound });
    expected.addRange(createTimestampsRange(upperBound, []));
    expected.addRange({
      type: RangeType.Fingerprint,
      upperBound: InfiniteUpperBound,
      fingerprint: relay.storage.fingerprint(
        testAppOwnerIdBytes,
        NonNegativeInt.orThrow(9),
        NonNegativeInt.orThrow(12),
      ),
    });
    assert(
      eqArrayNumber(result.message, expected.unwrap()),
      "Expected two ranges ending at the same change.",
    );

    await using client = await setupSqliteAndRelayStorage();
    const clientResult = await client.run(
      applyProtocolMessageAsClient(result.message, {
        writeKey: testAppOwner.writeKey,
      }),
    );
    assertOk(clientResult);
    assertSame(clientResult.value.type, "Response");
  });

  it("accepts an over-limit echo from a relay with rangesMaxSize 100,000", async () => {
    // Up to @evolu/common 8.17, a relay answered each range holding none of its
    // timestamps that listed timestamps with an empty Timestamps range without
    // checking the size, so a relay with rangesMaxSize 100,000 could exceed it.
    const response = createResponse();
    for (let index = 0; index < 5300; index++)
      response.addRange(
        createTimestampsRange(
          timestampToTimestampBytes(createWideTimestamp(index)),
          [],
        ),
      );
    response.addRange(createTimestampsRange(InfiniteUpperBound, []));
    const message = response.unwrap();
    const rangesSize = message.length - emptyResponse.length;
    assert(
      rangesSize > 100_000 + 1_024 && rangesSize <= 200_000,
      `The ranges section has ${rangesSize} bytes.`,
    );

    await using client = await setupSqliteAndRelayStorage();
    const result = await client.run(
      applyProtocolMessageAsClient(message, {
        writeKey: testAppOwner.writeKey,
      }),
    );

    assertOk(result, { type: "Converged" });
  });

  it("rejects zero-length changes the quota cannot count", async () => {
    await using relay = await setupSqliteAndRelayStorage({
      isOwnerWithinQuota: (_ownerId, bytes) => bytes <= 1000,
    });
    const request = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      writeKey: testAppOwner.writeKey,
    });
    for (let index = 0; index < 1000; index++)
      request.addMessage({
        timestamp: createWideTimestamp(index),
        change: new Uint8Array(0) as EncryptedDbChange,
      });

    const result = await relay.run(
      applyProtocolMessageAsRelay(request.unwrap()),
    );

    assert(
      !result.ok && result.error.type === "ProtocolInvalidDataError",
      "Expected ProtocolInvalidDataError.",
    );
    assertSame(relay.storage.getSize(testAppOwnerIdBytes), 0);
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

    assertEqual(getUncompressedAndCompressedSizes(buffer.unwrap()), "255 191");
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

    assertEqual(
      getUncompressedAndCompressedSizes(buffer.unwrap()),
      "33797 15532",
    );
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

    assertEqual(getUncompressedAndCompressedSizes(buffer.unwrap()), "339 315");
  });
});

describe("E2E sync", { timeout: 15_000 }, () => {
  const setupE2eSync = () => {
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

    const setupStorages = async () => {
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
      const clientStorageDep = {
        storage: clientStorage,
        console: deps.console,
      };
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

        if (!result.ok || result.value.type === "Converged") break;
        assertSame(result.value.type, "Response");
        message = result.value.message;

        turn = turn === "relay" ? "client" : "relay";
        syncSizes.push(result.value.message.length);
      }

      for (const message of messages) {
        assertEqual(
          clientStorage
            .readDbChange(
              testAppOwnerIdBytes,
              timestampToTimestampBytes(message.timestamp),
            )
            .join(),
          message.change.join(),
        );

        assertEqual(
          relayStorage
            .readDbChange(
              testAppOwnerIdBytes,
              timestampToTimestampBytes(message.timestamp),
            )
            .join(),
          message.change.join(),
        );
      }

      // Ensure number of sync steps is even (relay/client turns alternate)
      assertEqual(syncSteps % 2, 0);

      return { syncSteps, syncSizes };
    };

    return { deps, messages, reconcile, setupStorages };
  };

  it("client and relay have all data", async () => {
    const { messages, reconcile, setupStorages } = setupE2eSync();
    await using run = testCreateRun();
    await using storages = await setupStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    assertEqual(syncSteps, { syncSizes: [354, 20], syncSteps: 2 });
  });

  it("client has all data", async () => {
    const { messages, reconcile, setupStorages } = setupE2eSync();
    await using run = testCreateRun();
    await using storages = await setupStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    assertEqual(syncSteps, {
      syncSizes: [354, 177, 999722, 40, 692372, 20],
      syncSteps: 6,
    });
  });

  it("client has all data - many steps", async () => {
    const { messages, reconcile, setupStorages } = setupE2eSync();
    await using run = testCreateRun();
    await using storages = await setupStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    assertEqual(syncSteps, {
      syncSizes: [
        354, 177, 999722, 40, 154964, 40, 154233, 40, 149917, 40, 151573, 40,
        93798, 20,
      ],
      syncSteps: 14,
    });
  });

  it("relay has all data", async () => {
    const { messages, reconcile, setupStorages } = setupE2eSync();
    await using run = testCreateRun();
    await using storages = await setupStorages();
    const { clientStorage, relayStorage } = storages;
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    assertEqual(syncSteps, {
      syncSizes: [24, 999901, 57, 710883],
      syncSteps: 4,
    });
  });

  it("relay has all data - many steps", async () => {
    const { messages, reconcile, setupStorages } = setupE2eSync();
    await using run = testCreateRun();
    await using storages = await setupStorages();
    const { clientStorage, relayStorage } = storages;
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(
      clientStorage,
      relayStorage,
      ProtocolMessageRangesMaxSize.orThrow(3000),
    );
    assertEqual(syncSteps, {
      syncSizes: [
        24, 142650, 57, 150617, 57, 147501, 57, 150276, 57, 153125, 57, 153044,
        57, 143763, 57, 154178, 57, 154849, 57, 149091, 57, 152045, 57, 72953,
      ],
      syncSteps: 24,
    });
  });

  it("client and relay each have a random half of the data", async () => {
    const { deps, messages, reconcile, setupStorages } = setupE2eSync();
    await using run = testCreateRun();
    await using storages = await setupStorages();
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
    assertEqual(syncSteps, {
      syncSizes: [362, 5252, 22744, 865359, 850279, 20],
      syncSteps: 6,
    });
  });

  it("client and relay each have a random half of the data - many steps", async () => {
    const { deps, messages, reconcile, setupStorages } = setupE2eSync();
    await using run = testCreateRun();
    await using storages = await setupStorages();
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
    assertEqual(syncSteps, {
      syncSizes: [
        362, 2957, 3030, 109639, 110828, 2736, 2943, 108054, 109085, 2794, 2954,
        112962, 98724, 2756, 2989, 97820, 96094, 2967, 3021, 94627, 94213, 2839,
        3027, 76669, 85827, 3002, 3019, 83202, 77703, 2978, 41851, 78322, 48587,
        106874, 95676, 20,
      ],
      syncSteps: 36,
    });
  });

  it("starts sync from createProtocolMessageFromCrdtMessages", async () => {
    const { deps } = setupE2eSync();
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

    assertEqualBytes(
      relayResult.message,
      [
        1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235,
        212, 1, 0, 0, 1, 2, 9, 0, 154, 143, 203, 7, 183, 247, 225, 1, 178, 251,
        46, 140, 207, 168, 4, 0, 0, 156, 202, 117, 228, 249, 79, 0, 5, 1, 1, 2,
        1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 104, 162, 167, 191, 63, 133, 160,
        150, 5, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167, 191, 63,
        133, 160, 150, 2,
      ],
    );
  });
});
