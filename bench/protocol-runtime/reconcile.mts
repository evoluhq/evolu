/**
 * Times one reconcile scenario of the protocol benchmark in a child process.
 *
 * In order, the child:
 *
 * 1. Records one sync against in-memory storages, counting storage calls, and
 *    verifies every frame and both sides' final rows;
 * 2. Warms up with in-memory passes;
 * 3. Times one sync against real SQLite relay storage on both sides for each
 *    skiplist topology, each of whose frames must equal the recording byte for
 *    byte;
 * 4. Measures in-memory passes, each of whose frames must equal the recording.
 *
 * Every pass starts from fresh storages. The timed regions are each call of
 * `applyProtocolMessageAsRelay` and `applyProtocolMessageAsClient`, plus the
 * client's first request; each side's metric is the sum of its regions.
 */
import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { RandomNumber } from "@evolu/common";
import type { EncryptedDbChange, Storage } from "@evolu/common/local-first";
import type { Modules } from "../protocol/child.mts";
import { createFrameParser } from "../protocol/frames.mts";
import {
  changeOfRow,
  createPrng,
  createScenarios,
  describeSide,
  isNonEmpty,
  type Row,
  sortRows,
} from "../protocol/scenarios.mts";
import {
  addTiming,
  createRandomBytesPool,
  fastestTimings,
  measureRule,
  type PassTimings,
  runPasses,
  startTiming,
  type Timing,
  warmupRule,
  zeroTiming,
} from "./measure.mts";
import {
  countCalls,
  createMemoryStorage,
  createMemoryStorageSnapshot,
  type MemoryStorageEntry,
} from "./memoryStorage.mts";
import {
  type CaseResult,
  maxFrameBytes,
  type ReconcileScenarioName,
} from "./workload.mts";

/**
 * Seeds of the client's and the relay's skiplist levels in the SQLite passes,
 * one pair per topology.
 */
export const skiplistSeeds = [
  { client: 1, relay: 1_001 },
  { client: 2, relay: 1_002 },
  { client: 3, relay: 1_003 },
] as const;

/** Requests a sync may send before its outcome is `RoundLimit`. */
const roundLimit = 1_000;

export const measureReconcile = async (
  modules: Modules,
  name: ReconcileScenarioName,
): Promise<Omit<CaseResult, "maxRssKiB">> => {
  const { common, localFirst } = modules;
  const scenario = createScenarios(modules).find(
    (candidate) => candidate.name === name,
  );
  if (scenario === undefined) {
    throw new Error(`The protocol benchmark has no scenario ${name}.`);
  }
  if (scenario.heldBack.size > 0) {
    throw new Error(`${name} holds back changes, which this benchmark skips.`);
  }
  const owner = localFirst.testAppOwner;
  const ownerIdBytes = localFirst.ownerIdToOwnerIdBytes(owner.id);
  const clientRows = sortRows(scenario.client);
  const relayRows = sortRows(scenario.relay);
  const { push } = scenario;

  const workloadSha256 = createHash("sha256")
    .update(
      JSON.stringify({
        name,
        rangesMaxSize: scenario.rangesMaxSize,
        pushMessages: push?.crdtMessages.length ?? 0,
        pushEncryptionSeed: push?.encryptionSeed ?? null,
        skiplistSeeds,
        client: describeSide(clientRows),
        relay: describeSide(relayRows),
      }),
    )
    .digest("hex");

  // Both sides share the bytes of each row, which nothing mutates.
  const entriesByKey = new Map<string, MemoryStorageEntry>();
  const entryOf = (row: Row): MemoryStorageEntry => {
    let entry = entriesByKey.get(row.key);
    if (entry === undefined) {
      entry = {
        timestamp: localFirst.timestampToTimestampBytes(row.timestamp),
        // Relay storage stores changes without decrypting them.
        change: changeOfRow(row) as EncryptedDbChange,
      };
      entriesByKey.set(row.key, entry);
    }
    return entry;
  };
  const clientSnapshot = createMemoryStorageSnapshot(
    modules,
    clientRows.map(entryOf),
  );
  const relaySnapshot = createMemoryStorageSnapshot(
    modules,
    relayRows.map(entryOf),
  );
  const expectedRows = sortRows([
    ...new Map(
      [...clientRows, ...relayRows].map((row) => [row.key, row]),
    ).values(),
  ]);
  const expectedSize = expectedRows.length;

  const rangesMaxSize =
    scenario.rangesMaxSize === null
      ? {}
      : {
          rangesMaxSize: localFirst.ProtocolMessageRangesMaxSize.orThrow(
            scenario.rangesMaxSize,
          ),
        };
  // The production relay always passes broadcast, so it builds the broadcast
  // frame; only delivery is skipped.
  const relayOptions = {
    subscribe: () => undefined,
    unsubscribe: () => undefined,
    broadcast: () => undefined,
    ...rangesMaxSize,
  };
  const pushRandomBytes =
    push === null
      ? null
      : createRandomBytesPool(
          push.encryptionSeed,
          push.crdtMessages.length * nonceBytes + 1_024,
        );

  /** Syncs from the client's first request until an outcome. */
  const sync = async (
    clientStorage: Storage,
    relayStorage: Storage,
  ): Promise<SyncRecord> => {
    const clientConsole = common.testCreateConsole({ level: "warn" });
    const relayConsole = common.testCreateConsole({ level: "warn" });
    await using clientRun = common.createRun({
      storage: clientStorage,
      console: clientConsole,
    });
    await using relayRun = common.createRun({
      storage: relayStorage,
      console: relayConsole,
    });
    let changeTooLargeReports = 0;
    const clientOptions = {
      writeKey: owner.writeKey,
      ...rangesMaxSize,
      ...(modules.supportsOnChangeTooLarge
        ? {
            onChangeTooLarge: () => {
              changeTooLargeReports++;
            },
          }
        : {}),
    };
    pushRandomBytes?.reset();
    const frames: Array<Uint8Array> = [];
    let relay = zeroTiming;
    let client = zeroTiming;

    const run = async (): Promise<string> => {
      let end = startTiming();
      let message: Uint8Array =
        push === null || pushRandomBytes === null
          ? localFirst.createProtocolMessageForSync({ storage: clientStorage })(
              owner.id,
            )
          : localFirst.createProtocolMessageFromCrdtMessages({
              randomBytes: pushRandomBytes.randomBytes,
            })(owner, push.crdtMessages);
      client = addTiming(client, end());
      frames.push(message);

      for (;;) {
        end = startTiming();
        const relayResult = await relayRun(
          localFirst.applyProtocolMessageAsRelay(message, relayOptions),
        );
        relay = addTiming(relay, end());
        if (!relayResult.ok) return `Relay:${relayResult.error.type}`;
        frames.push(relayResult.value.message);

        end = startTiming();
        const clientResult = await clientRun(
          localFirst.applyProtocolMessageAsClient(
            relayResult.value.message,
            clientOptions,
          ),
        );
        client = addTiming(client, end());
        if (!clientResult.ok) return `Client:${clientResult.error.type}`;
        if (clientResult.value.type === "Converged") return "Converged";
        if (clientResult.value.type !== "Response") {
          return `Client:${clientResult.value.type}`;
        }
        if (frames.length >= roundLimit * 2) return "RoundLimit";
        message = clientResult.value.message;
        frames.push(message);
      }
    };
    const outcome = await run();

    return {
      outcome,
      frames,
      relay,
      client,
      consoleProblems: [
        ...clientConsole.getEntriesSnapshot(),
        ...relayConsole.getEntriesSnapshot(),
      ].length,
      changeTooLargeReports,
    };
  };

  const checkSyncRecord = (record: SyncRecord, label: string) => {
    if (record.outcome !== "Converged") {
      throw new Error(`${label} of ${name} ended with ${record.outcome}.`);
    }
    if (record.consoleProblems > 0 || record.changeTooLargeReports > 0) {
      throw new Error(
        `${label} of ${name} logged ${record.consoleProblems} warnings or errors and reported ${record.changeTooLargeReports} changes too large.`,
      );
    }
  };

  const checkSizes = (clientStorage: Storage, relayStorage: Storage) => {
    const sizes = [
      clientStorage.getSize(ownerIdBytes),
      relayStorage.getSize(ownerIdBytes),
    ];
    if (sizes.some((size) => size !== expectedSize)) {
      throw new Error(
        `${name} ended with ${sizes.join(" and ")} rows instead of ${expectedSize} on both sides.`,
      );
    }
  };

  // 1. The recording, with storage calls counted.
  // Every in-memory pass reuses these storages and resets them first.
  const clientStorage = createMemoryStorage(
    modules,
    clientSnapshot,
    expectedSize,
  );
  const relayStorage = createMemoryStorage(
    modules,
    relaySnapshot,
    expectedSize,
  );
  const recordingClient = countCalls(clientStorage);
  const recordingRelay = countCalls(relayStorage);
  const recording = await sync(recordingClient.storage, recordingRelay.storage);
  // Verification calls readAll and reset, which sync never calls.
  const {
    readAll: _clientReadAll,
    reset: _clientReset,
    ...clientCalls
  } = recordingClient.counts();
  const {
    readAll: _relayReadAll,
    reset: _relayReset,
    ...relayCalls
  } = recordingRelay.counts();
  checkSyncRecord(recording, "The recording");

  const parseFrame = createFrameParser(modules);
  recording.frames.forEach((frame, index) => {
    if (frame.length > maxFrameBytes) {
      throw new Error(
        `Frame ${index} of ${name} has ${frame.length} bytes, over ${maxFrameBytes}.`,
      );
    }
    parseFrame(frame);
  });
  const checkStoredRows = () => {
    for (const [side, storage] of [
      ["client", clientStorage],
      ["relay", relayStorage],
    ] as const) {
      const stored = storage.readAll();
      const matches =
        stored.length === expectedRows.length &&
        stored.every(
          ({ timestamp, change }, index) =>
            Buffer.compare(
              timestamp,
              entryOf(expectedRows[index]).timestamp,
            ) === 0 &&
            Buffer.compare(change, entryOf(expectedRows[index]).change) === 0,
        );
      if (!matches) {
        throw new Error(
          `The ${side} of ${name} does not store exactly the expected rows.`,
        );
      }
    }
  };
  checkStoredRows();

  const checkFrames = (frames: ReadonlyArray<Uint8Array>, label: string) => {
    if (frames.length !== recording.frames.length) {
      throw new Error(
        `${label} of ${name} sent ${frames.length} frames instead of the recording's ${recording.frames.length}.`,
      );
    }
    frames.forEach((frame, index) => {
      if (Buffer.compare(frame, recording.frames[index]) !== 0) {
        throw new Error(
          `${label} of ${name} sent a ${index % 2 === 0 ? "request" : "response"} in round ${Math.floor(index / 2) + 1} that differs from the recording.`,
        );
      }
    });
  };

  const memoryPass = async (): Promise<PassTimings> => {
    clientStorage.reset();
    relayStorage.reset();
    const record = await sync(clientStorage, relayStorage);
    checkSyncRecord(record, "A memory pass");
    checkFrames(record.frames, "A memory pass");
    checkSizes(clientStorage, relayStorage);
    return { relay: record.relay, client: record.client };
  };

  // 2. Warmup.
  await runPasses(warmupRule, memoryPass);

  // 3. One SQLite pass per skiplist topology.
  const sqlitePasses: Array<PassTimings> = [];
  let sqliteVersion: string | null = null;
  for (const seeds of skiplistSeeds) {
    await using client = await createSqliteSide(modules, {
      name: `${name}-client-${seeds.client}`,
      levelSeed: seeds.client,
      rows: clientRows,
      entryOf,
    });
    await using relay = await createSqliteSide(modules, {
      name: `${name}-relay-${seeds.relay}`,
      levelSeed: seeds.relay,
      rows: relayRows,
      entryOf,
    });
    sqliteVersion = client.sqliteVersion;
    const label = `The SQLite pass with skiplist seeds ${seeds.client} and ${seeds.relay}`;
    const record = await sync(client.storage, relay.storage);
    checkSyncRecord(record, label);
    checkFrames(record.frames, label);
    checkSizes(client.storage, relay.storage);
    sqlitePasses.push({
      sqliteRelay: record.relay,
      sqliteClient: record.client,
    });
  }
  // A macrotask lets V8 release the SQLite passes' data before collecting it.
  await setTimeout(0);
  // Without --expose-gc, gc is not defined at all.
  if (typeof gc === "undefined") {
    throw new TypeError("Run the protocol runtime child with --expose-gc.");
  }
  gc();

  // 4. Measurement.
  const memoryPasses = await runPasses(measureRule, memoryPass);
  checkStoredRows();

  const memory = fastestTimings(memoryPasses);
  const sqlite = fastestTimings(sqlitePasses);
  const requests = recording.frames.filter((_, index) => index % 2 === 0);
  const responses = recording.frames.filter((_, index) => index % 2 === 1);
  const framesHash = createHash("sha256");
  for (const frame of recording.frames) framesHash.update(frame);

  return {
    name,
    workloadSha256,
    sqliteVersion,
    work: {
      rounds: requests.length,
      upBytes: sumLengths(requests),
      downBytes: sumLengths(responses),
      framesSha256: framesHash.digest("hex"),
      ...prefixKeys("relay.", relayCalls),
      ...prefixKeys("client.", clientCalls),
    },
    cpuNs: {
      [`${name}.relay`]: memory.relay.cpuNs,
      [`${name}.client`]: memory.client.cpuNs,
    },
    reportedCpuNs: {
      [`${name}.sqliteRelay`]: sqlite.sqliteRelay.cpuNs,
      [`${name}.sqliteClient`]: sqlite.sqliteClient.cpuNs,
    },
    wallNs: {
      [`${name}.relay`]: memory.relay.wallNs,
      [`${name}.client`]: memory.client.wallNs,
      [`${name}.sqliteRelay`]: sqlite.sqliteRelay.wallNs,
      [`${name}.sqliteClient`]: sqlite.sqliteClient.wallNs,
    },
    passes: memoryPasses.length,
  };
};

const nonceBytes = 24;

interface SyncRecord {
  readonly outcome: string;
  /** Requests and responses in order, starting with the first request. */
  readonly frames: ReadonlyArray<Uint8Array>;
  readonly relay: Timing;
  readonly client: Timing;
  /** Warnings and errors either side's Run logged. */
  readonly consoleProblems: number;
  readonly changeTooLargeReports: number;
}

/** Real in-memory SQLite relay storage, loaded outside any measured region. */
const createSqliteSide = async (
  { common, localFirst, createBetterSqliteDriver, timingSafeEqual }: Modules,
  {
    name,
    levelSeed,
    rows,
    entryOf,
  }: {
    name: string;
    levelSeed: number;
    rows: ReadonlyArray<Row>;
    entryOf: (row: Row) => MemoryStorageEntry;
  },
): Promise<
  AsyncDisposable & {
    readonly storage: Storage;
    readonly sqliteVersion: string;
  }
> => {
  const ownerIdBytes = localFirst.ownerIdToOwnerIdBytes(
    localFirst.testAppOwner.id,
  );
  await using stack = new AsyncDisposableStack();
  const run = stack.use(
    common.createRun({ createSqliteDriver: createBetterSqliteDriver }),
  );
  const sqlite = stack.use(
    await run.ok(
      common.createSqlite(common.Name.orThrow(name), { mode: "memory" }),
    ),
  );
  localFirst.createBaseSqliteStorageTables({ sqlite });
  localFirst.createRelayStorageTables({ sqlite });

  const nextLevel = createPrng(levelSeed);
  const storage = localFirst.createRelaySqliteStorage({
    sqlite,
    random: { next: () => nextLevel() as RandomNumber },
    timingSafeEqual,
  })({ isOwnerWithinQuota: () => true });
  for (let index = 0; index < rows.length; index += loadBatchSize) {
    const messages = rows.slice(index, index + loadBatchSize).map((row) => ({
      timestamp: row.timestamp,
      change: entryOf(row).change,
    }));
    if (isNonEmpty(messages)) {
      await run.orThrow(storage.writeMessages(ownerIdBytes, messages));
    }
  }
  const [{ sqliteVersion }] = sqlite.exec<{ sqliteVersion: string }>(
    common.sql`select sqlite_version() as sqliteVersion;`,
  ).rows;

  const disposables = stack.move();
  return {
    storage,
    sqliteVersion,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

const loadBatchSize = 10_000;

const sumLengths = (frames: ReadonlyArray<Uint8Array>): number =>
  frames.reduce((sum, frame) => sum + frame.length, 0);

const prefixKeys = (
  prefix: string,
  values: Readonly<Record<string, number>>,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [`${prefix}${key}`, value]),
  );
