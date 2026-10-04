/**
 * Scenarios, harness, and verification of the protocol benchmark.
 *
 * [`benchmark.mts`](./benchmark.mts) runs this module as a child process for
 * one source root: `node bench/protocol/workload.mts <root> [--canary]`. The
 * child loads every Evolu module from that root, so the same harness measures
 * the working tree and a `git archive` snapshot of another commit. It
 * statically imports only Node.js modules, erased types, and shared modules
 * that do the same, and a load hook fails when it loads an Evolu source from
 * any other root. The child sends its {@link ChildResult} over the IPC channel,
 * or prints it as JSON without one.
 *
 * [`scenarios.mts`](./scenarios.mts) generates all inputs from a harness-owned
 * PRNG, so a dependency upgrade cannot shift them, and the harness hashes them
 * itself rather than through Evolu.
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { inspect } from "node:util";
import type { RandomNumber, SqliteQuery, SqliteRow } from "@evolu/common";
import type {
  EncryptedCrdtMessage,
  EncryptedDbChange,
  ProtocolChangeTooLargeError,
  Storage,
} from "@evolu/common/local-first";
import {
  guardSourceRoot,
  loadModules,
  type Modules,
  type RequiredExports,
  sendToParent,
} from "./child.mts";
import { createFrameParser, type ParsedFrame } from "./frames.mts";
import {
  changeOfRow,
  createPrng,
  createScenarios,
  createSeededRandomBytes,
  describeSide,
  isNonEmpty,
  type Row,
  type SyncScenario,
  type SideWorkload,
  sortRows,
  timestampToKey,
} from "./scenarios.mts";

/** Requests a scenario may send before its outcome is `RoundLimit`. */
export const roundLimit = 1_000;

export const costMetricNames = [
  "rounds",
  "bytes",
  "redundantMessages",
  "clientSqlStatements",
  "clientSqlRows",
  "relaySqlStatements",
  "relaySqlRows",
] as const;
export type CostMetricName = (typeof costMetricNames)[number];

export const directionMetricNames = [
  "bytes",
  "maxFrameBytes",
  "rangesBytes",
  "maxRangesBytes",
  "messages",
  "changeBytes",
  "skipRanges",
  "fingerprintRanges",
  "timestampsRanges",
  "listedTimestamps",
] as const;
export type DirectionMetricName = (typeof directionMetricNames)[number];

/** The inputs of a scenario. Any change means the workload changed. */
export interface ScenarioWorkload {
  /** The `rangesMaxSize` both sides use, or null for the library default. */
  readonly rangesMaxSize: number | null;
  /** CRDT messages the client pushes in its first request. */
  readonly pushMessages: number;
  readonly client: SideWorkload;
  readonly relay: SideWorkload;
}

/** Gated work metrics; any increase is a regression. */
export type ScenarioCost = Readonly<Record<CostMetricName, number>>;

/** Frame totals of one direction, from the harness frame parser. */
export type DirectionDiagnostics = Readonly<
  Record<DirectionMetricName, number>
>;

/**
 * Calls of each Storage method by name, plus `iterateRows`,
 * `fingerprintRangesBuckets`, `sqlTransactions`, and `unsentReads` (changes
 * read but not sent).
 */
export type SideDiagnostics = Readonly<Partial<Record<string, number>>>;

/** Metrics that explain a cost change but never gate. */
export interface ScenarioDiagnostics {
  readonly request: DirectionDiagnostics;
  readonly response: DirectionDiagnostics;
  readonly client: SideDiagnostics;
  readonly relay: SideDiagnostics;
  readonly changeTooLargeReports: number;
  /** SHA-256 over every frame in order, each prefixed with its length. */
  readonly framesSha256: string;
}

export interface ScenarioMeasurement {
  readonly workload: ScenarioWorkload;
  /**
   * `Converged`, `RoundLimit`, `Relay:<error>`, `Client:<error or result>`, or
   * `Threw`.
   */
  readonly outcome: string;
  readonly cost: ScenarioCost;
  readonly diagnostics: ScenarioDiagnostics;
}

export interface ScenarioResult {
  readonly name: string;
  readonly measurement: ScenarioMeasurement;
  /** Invariant violations, which no baseline stores. */
  readonly violations: ReadonlyArray<string>;
  /** Wall time of setup, sync, and verification, printed only. */
  readonly durationMs: number;
}

export interface ChildResult {
  readonly results: ReadonlyArray<ScenarioResult>;
  /** Null when the canary did not run, otherwise the scenarios that changed. */
  readonly canaryMismatches: ReadonlyArray<string> | null;
  readonly maxRssKiB: number;
}

const runChild = async (): Promise<void> => {
  const [rootArgument, ...flags] = process.argv.slice(2);
  if (rootArgument === undefined || flags.some((flag) => flag !== canaryFlag)) {
    throw new Error(
      `Usage: node bench/protocol/workload.mts <source root> [${canaryFlag}]`,
    );
  }
  const root = realpathSync(rootArgument);

  guardSourceRoot(root, "protocol");

  const modules = await loadModules(root, requiredExports);
  const scenarios = createScenarios(modules);
  const unknownCanaryNames = [...canaryScenarioNames].filter(
    (name) => !scenarios.some((scenario) => scenario.name === name),
  );
  if (unknownCanaryNames.length > 0) {
    throw new Error(
      `The canary scenarios ${unknownCanaryNames.join(", ")} match no scenario.`,
    );
  }

  const results: Array<ScenarioResult> = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(modules, scenario, ""));
    // A macrotask lets V8 collect the previous scenario's databases.
    await setTimeout(0);
  }

  let canaryMismatches: Array<string> | null = null;
  if (flags.includes(canaryFlag)) {
    canaryMismatches = [];
    for (const scenario of scenarios) {
      const index = results.findIndex(
        (result) => result.name === scenario.name,
      );
      if (!canaryScenarioNames.has(scenario.name) || index === -1) continue;
      const first = results[index];
      const again = await runScenario(modules, scenario, "canary ");
      if (
        JSON.stringify(again.measurement) !== JSON.stringify(first.measurement)
      ) {
        canaryMismatches.push(scenario.name);
      }
      // The parent fails on a scenario's violations, so the rerun's join them.
      results[index] = {
        ...first,
        violations: [
          ...first.violations,
          ...again.violations.map((violation) => `canary run: ${violation}`),
        ],
      };
      await setTimeout(0);
    }
  }

  const result: ChildResult = {
    results,
    canaryMismatches,
    maxRssKiB: process.resourceUsage().maxRSS,
  };
  await sendToParent(result);
};

const canaryFlag = "--canary";

/**
 * Scenarios the canary runs again after the full run. Their measurements must
 * equal the first run's, or the metrics are nondeterministic.
 */
const canaryScenarioNames: ReadonlySet<string> = new Set([
  "large-changes-upload",
  "oversized-change-upload",
  "wide-halves-5k-3000",
  "push-5k-into-20k",
]);

const requiredExports: RequiredExports = {
  common: [
    "createBuffer",
    "createRun",
    "createSqlite",
    "decodeLength",
    "decodeNonNegativeInt",
    "decodeRle",
    "Millis",
    "Name",
    "NonNegativeInt",
    "sql",
    "testCreateRun",
  ],
  localFirst: [
    "applyProtocolMessageAsClient",
    "applyProtocolMessageAsRelay",
    "Counter",
    "createBaseSqliteStorageTables",
    "createProtocolMessageForSync",
    "createProtocolMessageFromCrdtMessages",
    "createRelaySqliteStorage",
    "createRelayStorageTables",
    "DbChange",
    "defaultProtocolMessageRangesMaxSize",
    "encodeAndEncryptDbChange",
    "NodeId",
    "ownerIdToOwnerIdBytes",
    "ProtocolMessageRangesMaxSize",
    "testAppOwner",
  ],
};

/**
 * Loads both sides, syncs them, and verifies the result. Counting covers only
 * the sync loop: from building the first request until the client converges,
 * fails, or reaches {@link roundLimit}.
 */
const runScenario = async (
  modules: Modules,
  scenario: SyncScenario,
  progressPrefix: string,
): Promise<ScenarioResult> => {
  const start = performance.now();
  const { common, localFirst } = modules;
  const owner = localFirst.testAppOwner;
  const clientRows = sortRows(scenario.client);
  const relayRows = sortRows(scenario.relay);

  await using client = await createSide(modules, `${scenario.name}-client`, 1);
  await using relay = await createSide(modules, `${scenario.name}-relay`, 2);
  await client.load(clientRows);
  await relay.load(relayRows);

  const workload: ScenarioWorkload = {
    rangesMaxSize: scenario.rangesMaxSize,
    pushMessages: scenario.push?.crdtMessages.length ?? 0,
    client: describeSide(clientRows),
    relay: describeSide(relayRows),
  };

  const rangesMaxSize =
    scenario.rangesMaxSize === null
      ? null
      : localFirst.ProtocolMessageRangesMaxSize.orThrow(scenario.rangesMaxSize);
  // The first request has no rangesMaxSize option, so it uses the default.
  const defaultRangesMaxSize = localFirst.defaultProtocolMessageRangesMaxSize;
  const reportedKeys = new Set<string>();
  let changeTooLargeReports = 0;
  const relayOptions = rangesMaxSize === null ? {} : { rangesMaxSize };
  const clientOptions = {
    writeKey: owner.writeKey,
    ...relayOptions,
    ...(modules.supportsOnChangeTooLarge
      ? {
          onChangeTooLarge: (error: ProtocolChangeTooLargeError) => {
            changeTooLargeReports++;
            reportedKeys.add(timestampToKey(error.timestamp));
          },
        }
      : {}),
  };

  const violationsByKind = new Map<
    string,
    { readonly first: string; count: number }
  >();
  const addViolation = (kind: string, message: string) => {
    const existing = violationsByKind.get(kind);
    if (existing) existing.count++;
    else violationsByKind.set(kind, { first: message, count: 1 });
  };

  const framesHash = createHash("sha256");
  const frameLength = Buffer.alloc(4);
  const request = createDirectionCounts();
  const response = createDirectionCounts();
  const parseFrame = createFrameParser(modules);

  /** Returns the frame's message count. */
  const addFrame = (
    direction: "request" | "response",
    frame: Uint8Array,
    rangesLimit: number,
  ): number => {
    const counts = direction === "request" ? request : response;
    frameLength.writeUInt32BE(frame.length);
    framesHash.update(frameLength).update(frame);
    counts.frames++;
    counts.bytes += frame.length;
    counts.maxFrameBytes = Math.max(counts.maxFrameBytes, frame.length);
    if (frame.length > maxFrameBytes) {
      addViolation(
        `${direction} size`,
        `${direction} ${counts.frames} has ${frame.length} bytes, over ${maxFrameBytes}`,
      );
    }

    let parsed: ParsedFrame;
    try {
      parsed = parseFrame(frame);
    } catch (error) {
      addViolation(
        `${direction} parse`,
        `${direction} ${counts.frames} does not parse: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
    if (parsed.rangesBytes > rangesLimit) {
      addViolation(
        `${direction} ranges`,
        `${direction} ${counts.frames} has a ${parsed.rangesBytes}-byte ranges section, over ${rangesLimit}`,
      );
    }
    counts.rangesBytes += parsed.rangesBytes;
    counts.maxRangesBytes = Math.max(counts.maxRangesBytes, parsed.rangesBytes);
    counts.messages += parsed.messages;
    counts.changeBytes += parsed.changeBytes;
    counts.skipRanges += parsed.skipRanges;
    counts.fingerprintRanges += parsed.fingerprintRanges;
    counts.timestampsRanges += parsed.timestampsRanges;
    counts.listedTimestamps += parsed.listedTimestamps;
    return parsed.messages;
  };

  await using clientRun = common.testCreateRun({ storage: client.storage });
  await using relayRun = common.testCreateRun({ storage: relay.storage });

  // Messages of a pushed first request, which the client did not read.
  let firstRequestMessages = 0;
  const sync = async (): Promise<string> => {
    let message: Uint8Array =
      scenario.push === null
        ? localFirst.createProtocolMessageForSync({ storage: client.storage })(
            owner.id,
          )
        : localFirst.createProtocolMessageFromCrdtMessages({
            randomBytes: createSeededRandomBytes(scenario.push.encryptionSeed),
          })(owner, scenario.push.crdtMessages);
    firstRequestMessages = addFrame("request", message, defaultRangesMaxSize);

    for (;;) {
      const relayResult = await relayRun(
        localFirst.applyProtocolMessageAsRelay(message, relayOptions),
      );
      if (!relayResult.ok) return `Relay:${relayResult.error.type}`;
      addFrame(
        "response",
        relayResult.value.message,
        rangesMaxSize ?? defaultRangesMaxSize,
      );

      const clientResult = await clientRun(
        localFirst.applyProtocolMessageAsClient(
          relayResult.value.message,
          clientOptions,
        ),
      );
      if (!clientResult.ok) return `Client:${clientResult.error.type}`;
      if (clientResult.value.type === "Converged") return "Converged";
      if (clientResult.value.type !== "Response") {
        return `Client:${clientResult.value.type}`;
      }
      if (request.frames === roundLimit) return "RoundLimit";
      message = clientResult.value.message;
      addFrame("request", message, rangesMaxSize ?? defaultRangesMaxSize);
    }
  };

  client.startCounting();
  relay.startCounting();
  let outcome: string;
  try {
    outcome = await sync();
  } catch (error) {
    outcome = "Threw";
    addViolation(
      "threw",
      `sync threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const clientCounts = client.stopCounting();
  const relayCounts = relay.stopCounting();

  // Verification, outside counting.
  if (outcome !== "Converged") {
    addViolation(
      "outcome",
      `the outcome is ${outcome}, not Converged within ${roundLimit} rounds`,
    );
  }

  const consoleErrors = [
    ...clientRun.deps.console.getEntriesSnapshot(),
    ...relayRun.deps.console.getEntriesSnapshot(),
  ].filter((entry) => entry.method === "error");
  if (consoleErrors.length > 0) {
    addViolation(
      "console",
      `console.error was called ${consoleErrors.length} times, first with ${inspect(consoleErrors[0].args, { depth: 3 })}`,
    );
  }

  for (const key of scenario.heldBack) {
    if (!reportedKeys.has(key)) {
      addViolation(
        `held back ${key}`,
        `the held-back change ${key} was not reported through onChangeTooLarge`,
      );
    }
  }

  const expectedRowsByKey = new Map<string, Row>();
  for (const row of [...clientRows, ...relayRows]) {
    expectedRowsByKey.set(row.key, row);
  }
  const expectedKeys = [...expectedRowsByKey.keys()].toSorted();
  for (const [sideName, side, ownRows] of [
    ["client", client, clientRows],
    ["relay", relay, relayRows],
  ] as const) {
    const ownKeys = new Set(ownRows.map((row) => row.key));
    const keys =
      scenario.heldBack.size === 0
        ? expectedKeys
        : expectedKeys.filter(
            (key) => !scenario.heldBack.has(key) || ownKeys.has(key),
          );
    const stored = side.readAll();
    if (stored.length !== keys.length) {
      addViolation(
        `${sideName} rows`,
        `the ${sideName} stores ${stored.length} rows instead of ${keys.length}`,
      );
    }
    for (let index = 0; index < Math.min(stored.length, keys.length); index++) {
      const key = Buffer.from(stored[index].timestamp).toString("hex");
      if (key !== keys[index]) {
        addViolation(
          `${sideName} timestamps`,
          `the ${sideName} row ${index} has timestamp ${key} instead of ${keys[index]}`,
        );
        break;
      }
      const expectedRow = expectedRowsByKey.get(key);
      if (
        expectedRow === undefined ||
        Buffer.compare(stored[index].change, changeOfRow(expectedRow)) !== 0
      ) {
        addViolation(
          `${sideName} changes`,
          `the ${sideName} row ${index} (${key}) stores a different change`,
        );
        break;
      }
    }
  }

  const measurement: ScenarioMeasurement = {
    workload,
    outcome,
    cost: {
      rounds: request.frames,
      bytes: request.bytes + response.bytes,
      redundantMessages:
        clientCounts.redundantMessages + relayCounts.redundantMessages,
      clientSqlStatements: clientCounts.sqlStatements,
      clientSqlRows: clientCounts.sqlRows,
      relaySqlStatements: relayCounts.sqlStatements,
      relaySqlRows: relayCounts.sqlRows,
    },
    diagnostics: {
      request: toDirectionDiagnostics(request),
      response: toDirectionDiagnostics(response),
      client: toSideDiagnostics(
        clientCounts,
        request.messages - firstRequestMessages,
      ),
      relay: toSideDiagnostics(relayCounts, response.messages),
      changeTooLargeReports,
      framesSha256: framesHash.digest("hex"),
    },
  };

  const durationMs = Math.round(performance.now() - start);
  process.stderr.write(
    `  ${progressPrefix}${scenario.name.padEnd(26)} ${outcome.padEnd(10)} ${String(request.frames).padStart(4)} rounds ${(request.bytes + response.bytes).toLocaleString("en-US").padStart(12)} bytes ${(durationMs / 1000).toFixed(1).padStart(5)} s\n`,
  );

  return {
    name: scenario.name,
    measurement,
    violations: [...violationsByKind.values()].map(({ first, count }) =>
      count === 1 ? first : `${first} (${count} times)`,
    ),
    durationMs,
  };
};

/** Both peers' default frame size limit. */
const maxFrameBytes = 1_000_000;

interface DirectionCounts {
  frames: number;
  bytes: number;
  maxFrameBytes: number;
  rangesBytes: number;
  maxRangesBytes: number;
  messages: number;
  changeBytes: number;
  skipRanges: number;
  fingerprintRanges: number;
  timestampsRanges: number;
  listedTimestamps: number;
}

const createDirectionCounts = (): DirectionCounts => ({
  frames: 0,
  bytes: 0,
  maxFrameBytes: 0,
  rangesBytes: 0,
  maxRangesBytes: 0,
  messages: 0,
  changeBytes: 0,
  skipRanges: 0,
  fingerprintRanges: 0,
  timestampsRanges: 0,
  listedTimestamps: 0,
});

// Frames per direction equal rounds, so `frames` is not a diagnostic.
const toDirectionDiagnostics = ({
  frames: _frames,
  ...diagnostics
}: DirectionCounts): DirectionDiagnostics => diagnostics;

const toSideDiagnostics = (
  counts: SideCounts,
  sentMessages: number,
): SideDiagnostics => ({
  ...Object.fromEntries(counts.callsByMethod),
  iterateRows: counts.iterateRows,
  fingerprintRangesBuckets: counts.fingerprintRangesBuckets,
  sqlTransactions: counts.sqlTransactions,
  unsentReads: (counts.callsByMethod.get("readDbChange") ?? 0) - sentMessages,
});

/** A real in-memory SQLite relay storage; it also stands in for the client. */
interface Side extends AsyncDisposable {
  /** Counts every method call while counting. */
  readonly storage: Storage;
  /** Writes rows in timestamp order without counting. */
  readonly load: (sortedRows: ReadonlyArray<Row>) => Promise<void>;
  readonly readAll: () => ReadonlyArray<StoredRow>;
  readonly startCounting: () => void;
  readonly stopCounting: () => SideCounts;
}

interface SideCounts {
  /** Every Storage method, including uncalled ones. */
  readonly callsByMethod: ReadonlyMap<string, number>;
  readonly iterateRows: number;
  readonly fingerprintRangesBuckets: number;
  /** Messages written to a side that already stored their timestamp. */
  readonly redundantMessages: number;
  readonly sqlStatements: number;
  readonly sqlRows: number;
  readonly sqlTransactions: number;
}

interface StoredRow extends SqliteRow {
  readonly timestamp: Uint8Array;
  readonly change: Uint8Array;
}

const createSide = async (
  { common, localFirst, createBetterSqliteDriver, timingSafeEqual }: Modules,
  name: string,
  levelSeed: number,
): Promise<Side> => {
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

  let counting = false;
  const callsByMethod = new Map<string, number>();
  let iterateRows = 0;
  let fingerprintRangesBuckets = 0;
  let redundantMessages = 0;
  let sqlStatements = 0;
  let sqlRows = 0;
  let sqlTransactions = 0;
  const storedKeys = new Set<string>();

  // Storage hides statements such as timestamp lookups and usage updates, so
  // the SQLite layer is counted too.
  const countedSqlite = createCountingProxy(
    sqlite,
    {
      exec: <R extends SqliteRow = SqliteRow>(query: SqliteQuery) => {
        const result = sqlite.exec<R>(query);
        if (counting) sqlRows += result.rows.length;
        return result;
      },
    },
    (method) => {
      if (!counting) return;
      if (method === "exec") sqlStatements++;
      else if (method === "transaction") sqlTransactions++;
    },
  );

  // Skiplist levels come from the harness PRNG. They do not change any
  // metric, because statements per insert depend on the insert strategy.
  const nextLevel = createPrng(levelSeed);
  const storage = localFirst.createRelaySqliteStorage({
    sqlite: countedSqlite,
    random: { next: () => nextLevel() as RandomNumber },
    timingSafeEqual,
  })({ isOwnerWithinQuota: () => true });
  for (const [method, value] of Object.entries(storage)) {
    if (typeof value === "function") callsByMethod.set(method, 0);
  }

  const countedStorage = createCountingProxy(
    storage,
    {
      iterate: (ownerId, begin, end, callback) => {
        storage.iterate(ownerId, begin, end, (timestamp, index) => {
          if (counting) iterateRows++;
          return callback(timestamp, index);
        });
      },
      fingerprintRanges: (ownerId, buckets, upperBound) => {
        if (counting) fingerprintRangesBuckets += buckets.length;
        return storage.fingerprintRanges(ownerId, buckets, upperBound);
      },
      writeMessages: (ownerId, messages) => {
        for (const message of messages) {
          const key = timestampToKey(message.timestamp);
          if (!storedKeys.has(key)) storedKeys.add(key);
          else if (counting) redundantMessages++;
        }
        return storage.writeMessages(ownerId, messages);
      },
    },
    (method) => {
      if (counting)
        callsByMethod.set(method, (callsByMethod.get(method) ?? 0) + 1);
    },
  );

  const disposables = stack.move();
  return {
    storage: countedStorage,
    load: async (sortedRows) => {
      for (let index = 0; index < sortedRows.length; index += loadBatchSize) {
        const batch = sortedRows.slice(index, index + loadBatchSize);
        const messages = batch.map((row): EncryptedCrdtMessage => ({
          timestamp: row.timestamp,
          // Relay storage stores changes without decrypting them.
          change: changeOfRow(row) as EncryptedDbChange,
        }));
        if (!isNonEmpty(messages)) continue;
        await run.orThrow(storage.writeMessages(ownerIdBytes, messages));
        for (const row of batch) storedKeys.add(row.key);
      }
    },
    readAll: () =>
      sqlite.exec<StoredRow>(common.sql`
        select timestamp, change
        from evolu_message
        where ownerId = ${ownerIdBytes}
        order by timestamp;
      `).rows,
    startCounting: () => {
      counting = true;
    },
    stopCounting: () => {
      counting = false;
      return {
        callsByMethod: new Map(callsByMethod),
        iterateRows,
        fingerprintRangesBuckets,
        redundantMessages,
        sqlStatements,
        sqlRows,
        sqlTransactions,
      };
    },
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

const loadBatchSize = 10_000;

/**
 * Wraps every method of a shallow copy of `target` so that `onCall` sees each
 * call by name, using `overrides` in place of the target's own methods.
 */
const createCountingProxy = <T extends object>(
  target: T,
  overrides: Partial<T>,
  onCall: (method: string) => void,
): T => {
  const wrappersByMethod = new Map<string, unknown>();
  return new Proxy(
    { ...target },
    {
      get: (copy, property) => {
        const value: unknown = Object.hasOwn(overrides, property)
          ? Reflect.get(overrides, property)
          : Reflect.get(copy, property);
        if (typeof property !== "string" || typeof value !== "function") {
          return value;
        }
        let wrapper = wrappersByMethod.get(property);
        if (wrapper === undefined) {
          wrapper = (...args: Array<unknown>): unknown => {
            onCall(property);
            const result: unknown = Reflect.apply(value, target, args);
            return result;
          };
          wrappersByMethod.set(property, wrapper);
        }
        return wrapper;
      },
    },
  );
};

if (import.meta.main) await runChild();
