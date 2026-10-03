import { compress, init } from "@bokuweb/zstd-wasm";
import { before, describe, it, test } from "node:test";
import {
  assertEqual,
  assertEqualBytes,
  assertNonEmptyArray,
  assertSame,
} from "../../../../../packages/common/src/Assert.ts";
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
  defaultProtocolMessageRangesMaxSize,
  encodeAndEncryptDbChange,
  ProtocolErrorCode,
  ProtocolMessageMaxSize,
  ProtocolMessageRangesMaxSize,
  MessageType,
  type TimestampsRangeWithTimestampsBuffer,
} from "../../../../../packages/common/src/local-first/Protocol.ts";
import type {
  CrdtMessage,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  Storage,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  DbChange,
  InfiniteUpperBound,
  RangeType,
  timestampBytesToFingerprint,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../../../../packages/common/src/local-first/Timestamp.ts";
import { getOrThrow } from "../../../../../packages/common/src/Result.ts";
import { installPolyfills } from "../../../../../packages/common/src/Polyfills.ts";
import {
  testCreateDeps,
  testCreateRun,
  type RunDefaultDeps,
} from "../../../../../packages/common/src/Task.ts";
import {
  createId,
  DateIsoFromDate,
} from "../../../../../packages/common/src/Type.ts";
import {
  setupSqliteAndRelayStorage,
  testCreateTimestampBytesFixtures,
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
        354, 177, 999722, 40, 156106, 40, 154335, 40, 150189, 40, 153545, 40,
        90355, 20,
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
        24, 142360, 57, 151046, 57, 147856, 57, 152283, 57, 153168, 57, 154035,
        57, 144816, 57, 154840, 57, 157659, 57, 148577, 57, 150318, 57, 67326,
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
        362, 2291, 2231, 76988, 85667, 2269, 81008, 82180, 2371, 2260, 74895,
        77009, 2253, 90299, 77950, 2371, 2288, 73085, 74613, 2357, 2271, 71866,
        70385, 2355, 2236, 65376, 69177, 2224, 72843, 62793, 2387, 2221, 59533,
        62502, 53083, 64974, 28119, 89136, 90832, 9690, 34188, 39540,
      ],
      syncSteps: 42,
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
