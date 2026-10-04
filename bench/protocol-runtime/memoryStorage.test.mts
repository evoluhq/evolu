import {
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
  createRandom,
  createRun,
  createSqlite,
  isNonEmptyArray,
  Millis,
  Name,
  NonNegativeInt,
  ok,
  testCreateRandom,
} from "@evolu/common";
import {
  Counter,
  createBaseSqliteStorageTables,
  createRelaySqliteStorage,
  createRelayStorageTables,
  type EncryptedCrdtMessage,
  type EncryptedDbChange,
  type Fingerprint,
  InfiniteUpperBound,
  NodeId,
  OwnerWriteKey,
  ownerIdToOwnerIdBytes,
  RangeType,
  type RangeUpperBound,
  type Storage,
  testAppOwner,
  type Timestamp,
  type TimestampBytes,
  timestampBytesToFingerprint,
  timestampToTimestampBytes,
  zeroFingerprint,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { createBetterSqliteDriver, createTimingSafeEqual } from "@evolu/nodejs";
import { describe, it } from "node:test";
import {
  countCalls,
  createMemoryStorage,
  createMemoryStorageSnapshot,
  type MemoryStorage,
  type MemoryStorageModules,
} from "./memoryStorage.mts";

installPolyfills();

const modules: MemoryStorageModules = {
  common: { ok },
  localFirst: {
    InfiniteUpperBound,
    RangeType,
    timestampBytesToFingerprint,
    timestampToTimestampBytes,
    zeroFingerprint,
  },
};

const ownerId = ownerIdToOwnerIdBytes(testAppOwner.id);

/** Distinct timestamps from two devices, many sharing millis, unsorted. */
const createMessages = (count: number): Array<EncryptedCrdtMessage> => {
  const random = testCreateRandom("memory storage");
  const next = () => random.next();
  const keys = new Set<string>();
  const messages: Array<EncryptedCrdtMessage> = [];
  while (messages.length < count) {
    const timestamp: Timestamp = {
      millis: Millis.orThrow(1_700_000_000_000 + Math.floor(next() * 500)),
      counter: Counter.orThrow(Math.floor(next() * 3)),
      nodeId: NodeId.orThrow(
        next() < 0.5 ? "000000000000000a" : "000000000000000b",
      ),
    };
    const key = `${timestamp.millis}-${timestamp.counter}-${timestamp.nodeId}`;
    if (keys.has(key)) continue;
    keys.add(key);
    messages.push({
      timestamp,
      change: new Uint8Array([
        messages.length % 256,
        1,
        2,
      ]) as EncryptedDbChange,
    });
  }
  return messages;
};

const sortMessages = (
  messages: ReadonlyArray<EncryptedCrdtMessage>,
): Array<EncryptedCrdtMessage> =>
  messages.toSorted((a, b) =>
    Buffer.compare(
      timestampToTimestampBytes(a.timestamp),
      timestampToTimestampBytes(b.timestamp),
    ),
  );

const setupSqliteStorage = async (
  messages: ReadonlyArray<EncryptedCrdtMessage>,
) => {
  await using stack = new AsyncDisposableStack();
  const run = stack.use(
    createRun({ createSqliteDriver: createBetterSqliteDriver }),
  );
  const sqlite = stack.use(
    await run.ok(
      createSqlite(Name.orThrow("memory-storage-test"), { mode: "memory" }),
    ),
  );
  createBaseSqliteStorageTables({ sqlite });
  createRelayStorageTables({ sqlite });
  const storage = createRelaySqliteStorage({
    sqlite,
    random: createRandom(),
    timingSafeEqual: createTimingSafeEqual(),
  })({ isOwnerWithinQuota: () => true });
  const write = async (batch: ReadonlyArray<EncryptedCrdtMessage>) => {
    if (isNonEmptyArray(batch)) {
      await run.orThrow(storage.writeMessages(ownerId, batch));
    }
  };
  await write(messages);
  const disposables = stack.move();
  return {
    storage,
    write,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

const writeToMemory = async (
  storage: MemoryStorage,
  batch: ReadonlyArray<EncryptedCrdtMessage>,
) => {
  if (!isNonEmptyArray(batch)) return;
  await using run = createRun();
  await run.orThrow(storage.writeMessages(ownerId, batch));
};

const index = (value: number) => NonNegativeInt.orThrow(value);

/** Every answer the protocol reads from storage, for comparison. */
const describeStorage = (storage: Storage) => {
  const size = storage.getSize(ownerId);
  const bounds = [0, 1, Math.floor(size / 3), Math.floor(size / 2), size - 1];
  const timestamps: Array<string> = [];
  storage.iterate(ownerId, index(0), size, (timestamp, at) => {
    timestamps.push(`${at}:${Buffer.from(timestamp).toString("hex")}`);
    return true;
  });
  const firstThree: Array<number> = [];
  storage.iterate(ownerId, index(5), size, (_timestamp, at) => {
    firstThree.push(at);
    return firstThree.length < 3;
  });
  const lowerBounds = [...bounds, size].flatMap((begin) =>
    [0, 7, Math.floor(size / 2), size - 1].map((at) => {
      const upperBound = new Uint8Array(16) as TimestampBytes;
      upperBound.set(
        Buffer.from(timestamps[at]?.split(":")[1] ?? "", "hex").subarray(0, 16),
      );
      // A bound just above a stored timestamp finds the next one.
      upperBound[15] += at % 2;
      return storage.findLowerBound(
        ownerId,
        index(Math.min(begin, at)),
        size,
        upperBound,
      );
    }),
  );
  return {
    size,
    timestamps,
    firstThree,
    fingerprints: bounds.flatMap((begin) =>
      bounds
        .filter((end) => end >= begin)
        .map((end) =>
          Buffer.from(
            storage.fingerprint(ownerId, index(begin), index(end)),
          ).toString("hex"),
        ),
    ),
    // Without an upper bound the last range is infinite, else it ends there.
    ranges: (
      [
        undefined,
        storage.fingerprintRanges(ownerId, [index(1), size])[0].upperBound,
      ] satisfies ReadonlyArray<RangeUpperBound | undefined>
    )
      .flatMap((upperBound) =>
        storage.fingerprintRanges(
          ownerId,
          [index(3), index(Math.floor(size / 2)), size],
          upperBound,
        ),
      )
      .map((range) => ({
        ...range,
        upperBound:
          range.upperBound === InfiniteUpperBound
            ? "infinite"
            : Buffer.from(range.upperBound).toString("hex"),
        fingerprint: Buffer.from(range.fingerprint).toString("hex"),
      })),
    infiniteLowerBound: storage.findLowerBound(
      ownerId,
      index(0),
      size,
      InfiniteUpperBound,
    ),
    lowerBounds,
  };
};

describe("createMemoryStorage", () => {
  const messages = createMessages(400);
  const initial = sortMessages(messages.slice(0, 250));
  const snapshot = createMemoryStorageSnapshot(
    modules,
    initial.map(({ timestamp, change }) => ({
      timestamp: timestampToTimestampBytes(timestamp),
      change,
    })),
  );

  it("answers like relay storage before and after writes", async () => {
    await using sqlite = await setupSqliteStorage(initial);
    const memory = createMemoryStorage(modules, snapshot, 0);
    assertEqual(describeStorage(memory), describeStorage(sqlite.storage));

    // A few new rows are spliced in, more are merged as blocks, and rows
    // already stored or repeated in a batch are skipped.
    const batches = [
      messages.slice(250, 255),
      [...messages.slice(255, 400), messages[3], messages[260]],
    ];
    for (const batch of batches) {
      await sqlite.write(batch);
      await writeToMemory(memory, batch);
      assertEqual(describeStorage(memory), describeStorage(sqlite.storage));
    }
    for (const { timestamp, change } of messages) {
      const bytes = timestampToTimestampBytes(timestamp);
      assertSame(memory.readDbChange(ownerId, bytes), change);
      assertEqualBytes(sqlite.storage.readDbChange(ownerId, bytes), change);
    }
    const sorted = sortMessages(messages);
    memory.readAll().forEach(({ timestamp, change }, at) => {
      assertEqualBytes(
        timestamp,
        timestampToTimestampBytes(sorted[at].timestamp),
      );
      assertSame(change, sorted[at].change);
    });
  });

  it("starts empty and grows past its capacity", async () => {
    await using sqlite = await setupSqliteStorage([]);
    const memory = createMemoryStorage(
      modules,
      createMemoryStorageSnapshot(modules, []),
      0,
    );
    assertEqual(memory.getSize(ownerId), 0);
    assertSame(
      memory.fingerprint(ownerId, index(0), index(0)),
      zeroFingerprint,
    );
    await sqlite.write(messages);
    await writeToMemory(memory, messages);
    assertEqual(describeStorage(memory), describeStorage(sqlite.storage));
  });

  it("resets to the snapshot in place and forgets the write key", async () => {
    const memory = createMemoryStorage(modules, snapshot, 400);
    const fresh = describeStorage(memory);
    memory.reset();
    assertEqual(describeStorage(memory), fresh);

    const writeKey = testAppOwner.writeKey;
    const otherWriteKey = OwnerWriteKey.orThrow(new Uint8Array(16));
    assertTrue(memory.validateWriteKey(ownerId, writeKey));
    assertTrue(memory.validateWriteKey(ownerId, writeKey));
    assertFalse(memory.validateWriteKey(ownerId, otherWriteKey));
    await writeToMemory(memory, messages.slice(250, 400));
    assertEqual(memory.getSize(ownerId), 400);

    memory.reset();
    assertEqual(describeStorage(memory), fresh);
    assertTrue(memory.validateWriteKey(ownerId, otherWriteKey));
    assertThrowsInstanceOf(
      () =>
        memory.readDbChange(
          ownerId,
          timestampToTimestampBytes(messages[300].timestamp),
        ),
      Error,
    );
  });

  it("validates write keys like relay storage", async () => {
    await using sqlite = await setupSqliteStorage([]);
    const memory = createMemoryStorage(modules, snapshot, 0);
    const otherWriteKey = OwnerWriteKey.orThrow(new Uint8Array(16));
    for (const storage of [memory, sqlite.storage]) {
      assertTrue(storage.validateWriteKey(ownerId, testAppOwner.writeKey));
      assertFalse(storage.validateWriteKey(ownerId, otherWriteKey));
    }
  });

  it("rejects buckets the protocol never asks for", () => {
    const memory = createMemoryStorage(modules, snapshot, 0);
    const size = memory.getSize(ownerId);
    for (const buckets of [[index(size + 1)], [size, size]]) {
      assertThrowsInstanceOf(
        () => memory.fingerprintRanges(ownerId, buckets),
        Error,
      );
    }
    assertThrowsInstanceOf(() => {
      memory.deleteOwner(ownerId);
    }, Error);
  });

  it("rejects a fingerprint of another size", () => {
    assertThrowsInstanceOf(
      () =>
        createMemoryStorageSnapshot(
          {
            ...modules,
            localFirst: {
              ...modules.localFirst,
              timestampBytesToFingerprint: () =>
                new Uint8Array(16) as Fingerprint,
            },
          },
          [
            {
              timestamp: snapshot.timestamps[0],
              change: new Uint8Array(1) as EncryptedDbChange,
            },
          ],
        ),
      Error,
    );
  });

  it("rejects snapshot entries out of order", () => {
    const [first, second] = snapshot.timestamps;
    const change = new Uint8Array(1) as EncryptedDbChange;
    assertThrowsInstanceOf(
      () =>
        createMemoryStorageSnapshot(modules, [
          { timestamp: second, change },
          { timestamp: first, change },
        ]),
      Error,
    );
  });
});

describe("countCalls", () => {
  it("counts each method's calls by name", () => {
    const counted = countCalls({
      constant: 1,
      double: (value: number) => value * 2,
      unused: () => undefined,
    });
    assertEqual(counted.storage.double(2), 4);
    assertEqual(counted.storage.double(3), 6);
    assertEqual(counted.storage.constant, 1);
    assertEqual(counted.counts(), { double: 2, unused: 0 });
  });
});
