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
      0, 0, 0, 0, 1, 2, 31, 0, 205, 232, 66, 167, 148, 6, 143, 133, 147, 9, 223,
      251, 122, 192, 233, 147, 1, 253, 239, 21, 170, 193, 106, 140, 255, 233, 2,
      200, 231, 203, 1, 178, 177, 159, 3, 245, 254, 241, 2, 161, 132, 228, 2,
      249, 130, 9, 185, 178, 79, 209, 140, 220, 5, 159, 250, 206, 3, 134, 129,
      149, 1, 164, 173, 130, 1, 250, 164, 128, 1, 166, 184, 87, 132, 234, 30,
      245, 151, 147, 7, 159, 219, 71, 143, 236, 209, 8, 227, 204, 146, 10, 241,
      194, 239, 1, 130, 170, 155, 4, 188, 213, 142, 1, 128, 237, 253, 1, 218,
      180, 189, 1, 0, 31, 0, 0, 0, 0, 0, 0, 0, 0, 1, 104, 162, 167, 191, 63,
      133, 160, 150, 2, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167,
      191, 63, 133, 160, 150, 7, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104,
      162, 167, 191, 63, 133, 160, 150, 2, 153, 201, 144, 40, 214, 99, 106, 145,
      1, 104, 162, 167, 191, 63, 133, 160, 150, 1, 153, 201, 144, 40, 214, 99,
      106, 145, 1, 104, 162, 167, 191, 63, 133, 160, 150, 11, 153, 201, 144, 40,
      214, 99, 106, 145, 2, 104, 162, 167, 191, 63, 133, 160, 150, 1,
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
      0, 0, 0, 0, 16, 244, 252, 72, 238, 128, 142, 10, 189, 217, 169, 1, 182,
      192, 212, 3, 250, 152, 235, 4, 150, 131, 214, 5, 178, 181, 88, 240, 134,
      171, 9, 170, 174, 151, 2, 160, 221, 215, 1, 249, 129, 178, 7, 174, 199,
      153, 9, 212, 143, 130, 12, 190, 255, 169, 5, 218, 161, 187, 3, 0, 15, 104,
      162, 167, 191, 63, 133, 160, 150, 6, 153, 201, 144, 40, 214, 99, 106, 145,
      2, 104, 162, 167, 191, 63, 133, 160, 150, 5, 153, 201, 144, 40, 214, 99,
      106, 145, 1, 104, 162, 167, 191, 63, 133, 160, 150, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 128, 206, 148, 14, 199, 56, 37, 243, 36,
      103, 94, 242, 26, 215, 28, 58, 69, 17, 216, 49, 151, 66, 7, 73, 145, 21,
      172, 3, 13, 246, 57, 38, 236, 183, 122, 66, 63, 72, 150, 103, 25, 204, 34,
      212, 14, 129, 175, 197, 206, 181, 177, 91, 41, 15, 0, 93, 10, 169, 105,
      80, 103, 156, 249, 223, 243, 178, 1, 220, 137, 89, 82, 220, 22, 134, 54,
      72, 5, 56, 202, 254, 108, 199, 207, 244, 82, 201, 17, 140, 29, 104, 188,
      217, 38, 175, 238, 209, 22, 15, 247, 170, 215, 200, 6, 101, 105, 182, 63,
      59, 104, 218, 122, 27, 75, 209, 87, 67, 182, 140, 208, 140, 116, 201, 185,
      220, 59, 174, 42, 178, 33, 111, 22, 135, 8, 206, 174, 78, 228, 236, 88,
      190, 31, 10, 249, 236, 206, 169, 84, 204, 222, 170, 199, 165, 5, 23, 210,
      180, 82, 241, 220, 231, 199, 220, 63, 227, 95, 164, 247, 162, 57, 73, 211,
      5, 0, 159, 12, 47, 71, 117, 107, 133, 249, 65, 116, 171, 184, 60, 72, 247,
      110, 74, 46, 204,
    ],
  );
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

    assertEqual(getUncompressedAndCompressedSizes(buffer.unwrap()), "245 190");
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
      "32865 17828",
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

    assertEqual(getUncompressedAndCompressedSizes(buffer.unwrap()), "345 312");
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

  it("client and relay have all data", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    assertEqual(syncSteps, { syncSizes: [370, 20], syncSteps: 2 });
  });

  it("client has all data", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(clientStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    assertEqual(syncSteps, {
      syncSizes: [370, 193, 999633, 40, 691617, 20],
      syncSteps: 6,
    });
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
    assertEqual(syncSteps, {
      syncSizes: [
        370, 193, 999633, 40, 157162, 40, 154407, 40, 143552, 40, 154780, 40,
        93872, 20,
      ],
      syncSteps: 14,
    });
  });

  it("relay has all data", async () => {
    await using run = testCreateRun();
    await using storages = await createStorages();
    const { clientStorage, relayStorage } = storages;
    await run(relayStorage.writeMessages(testAppOwnerIdBytes, messages));

    const syncSteps = await reconcile(clientStorage, relayStorage);
    assertEqual(syncSteps, {
      syncSizes: [24, 999381, 57, 709864],
      syncSteps: 4,
    });
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
    assertEqual(syncSteps, {
      syncSizes: [
        24, 151171, 57, 150672, 57, 161282, 57, 157215, 57, 156921, 57, 155741,
        57, 149069, 57, 154723, 57, 149107, 57, 148657, 57, 165915, 57, 22837,
      ],
      syncSteps: 24,
    });
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
    assertEqual(syncSteps, {
      syncSizes: [334, 5138, 17190, 863219, 849394, 20],
      syncSteps: 6,
    });
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
    assertEqual(syncSteps, {
      syncSizes: [
        334, 2273, 2231, 85964, 87838, 2264, 86478, 84497, 2296, 2262, 76500,
        85193, 2261, 67518, 82713, 2221, 74032, 74087, 2298, 81087, 77073, 2288,
        2264, 58323, 64987, 2243, 57456, 66768, 2266, 66564, 60858, 14942,
        64259, 47293, 100563, 97897, 10043, 35130, 33078, 20,
      ],
      syncSteps: 40,
    });
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

    assertEqualBytes(
      relayResult.message,
      [
        1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186, 235,
        212, 1, 0, 0, 1, 2, 9, 0, 205, 232, 66, 167, 148, 6, 143, 133, 147, 9,
        223, 251, 122, 192, 233, 147, 1, 253, 239, 21, 170, 193, 106, 140, 255,
        233, 2, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 1, 104, 162, 167, 191, 63, 133,
        160, 150, 2, 153, 201, 144, 40, 214, 99, 106, 145, 1, 104, 162, 167,
        191, 63, 133, 160, 150, 5,
      ],
    );
  });
});
