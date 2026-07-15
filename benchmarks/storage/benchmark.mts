import { bench, section, utils } from "@paulmillr/jsbt/bench.js";
import { deepStrictEqual, strictEqual } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  array,
  computeBalancedBuckets,
  createRun,
  createSqlite,
  getOrThrow,
  type InferType,
  literal,
  Millis,
  Name,
  NonNegativeInt,
  object,
  ok,
  optional,
  type Random,
  type Sqlite,
  sql,
  String,
  testCreateRandom,
} from "../../packages/common/dist/src/index.js";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  createTimestamp,
  getTimestampByIndex,
  OwnerIdBytes,
  type StorageInsertTimestampStrategy,
  type TimestampBytes,
  timestampBytesToFingerprint,
  timestampToTimestampBytes,
} from "../../packages/common/dist/src/local-first/index.js";
import { createBetterSqliteDriver } from "../../packages/nodejs/dist/src/index.js";

const timestampCount = 50_000;
const checkpointSize = 10_000;
const checkpointCount = timestampCount / checkpointSize;
const levelAppendCount = 10_000;
const levelInsertCount = 1_000;
const getTimestampByIndexCount = 1_000;
const fingerprintRangesCount = 1_000;
const maxRegressionPercent = 10;
const nanosecondsPerMillisecond = 1_000_000n;
const benchmarkProfiles = {
  quick: {
    repeatCount: 1,
    sqliteModes: ["memory"],
  },
  full: {
    repeatCount: 3,
    sqliteModes: ["memory", "file"],
  },
} as const;
const {
  check,
  profile,
  "update-baseline": updateBaseline,
} = parseArgs({
  options: {
    check: {
      type: "boolean",
    },
    profile: {
      default: "full",
      type: "string",
    },
    "update-baseline": {
      type: "boolean",
    },
  },
}).values;
if (profile !== "quick" && profile !== "full") {
  throw new Error(`Unknown storage benchmark profile: ${profile}`);
}
if (check && (updateBaseline || process.env.JSBT_FILTER)) {
  throw new Error(
    "Storage benchmark regression checks cannot update baselines or use a filter",
  );
}
if (updateBaseline && (profile !== "full" || process.env.JSBT_FILTER)) {
  throw new Error(
    "Storage benchmark baselines require the unfiltered full profile",
  );
}
const { repeatCount, sqliteModes } = benchmarkProfiles[profile];
const strategies: ReadonlyArray<StorageInsertTimestampStrategy> = [
  "append",
  "prepend",
  "insert",
];
const insertLevels = [1, 2, 10] as const;
type InsertLevel = (typeof insertLevels)[number];
type StorageBenchmarkMethod =
  | StorageInsertTimestampStrategy
  | `appendLevel${InsertLevel}`
  | "appendSparseLevel10"
  | `insertLevel${InsertLevel}`
  | "getTimestampByIndex"
  | "fingerprintRanges";
const ownerId = OwnerIdBytes.orThrow(new Uint8Array(16));

const StorageBenchmarkEnvironment = object({
  platform: String,
  arch: String,
  cpu: String,
  nodeVersion: String,
  sqliteVersion: String,
});
interface StorageBenchmarkEnvironment extends InferType<
  typeof StorageBenchmarkEnvironment
> {}

const StorageBenchmarkMethodMeasurements = object({
  append: Millis,
  prepend: Millis,
  insert: Millis,
  appendLevel1: optional(Millis),
  appendLevel2: optional(Millis),
  appendLevel10: optional(Millis),
  appendSparseLevel10: optional(Millis),
  insertLevel1: optional(Millis),
  insertLevel2: optional(Millis),
  insertLevel10: optional(Millis),
  getTimestampByIndex: optional(Millis),
  fingerprintRanges: optional(Millis),
});
interface StorageBenchmarkMethodMeasurements extends InferType<
  typeof StorageBenchmarkMethodMeasurements
> {}

const StorageBenchmarkBaseline = object({
  environment: StorageBenchmarkEnvironment,
  measurementsMs: object({
    memory: StorageBenchmarkMethodMeasurements,
    file: StorageBenchmarkMethodMeasurements,
  }),
});
interface StorageBenchmarkBaseline extends InferType<
  typeof StorageBenchmarkBaseline
> {}

const StorageBenchmarkBaselines = object({
  version: literal(2),
  baselines: array(StorageBenchmarkBaseline),
});
interface StorageBenchmarkBaselines extends InferType<
  typeof StorageBenchmarkBaselines
> {}

const storageBenchmarkBaselinesUrl = new URL(
  "./baselines.json",
  import.meta.url,
);
const storageBenchmarkBaselines = getOrThrow(
  StorageBenchmarkBaselines.fromUnknown(
    JSON.parse(await readFile(storageBenchmarkBaselinesUrl, "utf8")),
  ),
);

const timestampsAsc = Array.from({ length: timestampCount }, (_, index) =>
  timestampToTimestampBytes(createTimestamp({ millis: Millis.orThrow(index) })),
);
const timestampIndexesRandom = Array.from(
  { length: timestampCount },
  (_, index) => index,
);
const timestampOrderRandom = testCreateRandom("Storage.bench timestamp order");
for (let index = timestampIndexesRandom.length - 1; index > 0; index--) {
  const otherIndex = Math.floor(timestampOrderRandom.next() * (index + 1));
  [timestampIndexesRandom[index], timestampIndexesRandom[otherIndex]] = [
    timestampIndexesRandom[otherIndex],
    timestampIndexesRandom[index],
  ];
}
const timestampsByStrategy: Record<
  StorageInsertTimestampStrategy,
  ReadonlyArray<TimestampBytes>
> = {
  append: timestampsAsc,
  prepend: timestampsAsc.toReversed(),
  insert: timestampIndexesRandom.map((index) => timestampsAsc[index]),
};
type SqliteMode = (typeof benchmarkProfiles.full.sqliteModes)[number];

let databaseId = 0;
let sqliteVersion: string | undefined;
const setupStorage = async (
  mode: SqliteMode,
  random: Random = testCreateRandom("Storage.bench Skiplist levels"),
) => {
  await using disposer = new AsyncDisposableStack();
  const run = disposer.use(
    createRun({ createSqliteDriver: createBetterSqliteDriver }),
  );
  const sqlite = disposer.use(
    await run.ok(
      createSqlite(
        Name.orThrow(`Storage-bench-${process.pid}-${databaseId++}`),
        mode === "memory" ? { mode: "memory" } : undefined,
      ),
    ),
  );
  const versionRow = sqlite.exec<{ sqliteVersion: string }>(sql`
    select sqlite_version() as sqliteVersion;
  `).rows[0];
  sqliteVersion ??= versionRow.sqliteVersion;
  strictEqual(sqliteVersion, versionRow.sqliteVersion);

  createBaseSqliteStorageTables({ sqlite });

  const disposables = disposer.move();
  return {
    sqlite,
    storage: createBaseSqliteStorage({
      sqlite,
      random,
    }),
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

const insertTimestamps = (
  sqlite: Sqlite,
  storage: ReturnType<typeof createBaseSqliteStorage>,
  timestamps: ReadonlyArray<TimestampBytes>,
  strategy: StorageInsertTimestampStrategy,
  begin: number,
  end: number,
) =>
  sqlite.transaction(() => {
    for (let index = begin; index < end; index++) {
      storage.insertTimestamp(ownerId, timestamps[index], strategy);
    }
    return ok();
  });

const getTimestampCountAtLevel = (sqlite: Sqlite, level: InsertLevel) =>
  sqlite.exec<{ count: number }>(sql`
    select count(*) as count
    from evolu_timestamp
    where ownerId = ${ownerId} and l = ${level};
  `).rows[0].count;

const createInsertLevelRandom = (level: InsertLevel): Random => {
  if (level === 1) return { next: () => 1 as ReturnType<Random["next"]> };
  if (level === 10) return { next: () => 0 as ReturnType<Random["next"]> };

  let promote = true;
  return {
    next: () => {
      promote = !promote;
      return (promote ? 1 : 0) as ReturnType<Random["next"]>;
    },
  };
};

const createLabel = (
  mode: SqliteMode,
  strategy: StorageInsertTimestampStrategy,
  run: number,
  checkpoint: number,
) =>
  `${mode} ${strategy} run ${run} ${checkpoint - checkpointSize}-${checkpoint} rows`;

const createMethodRunLabel = (
  mode: SqliteMode,
  strategy: StorageInsertTimestampStrategy,
  run: number,
) => `${mode} ${strategy} run ${run}`;

interface StorageBenchmarkResult {
  readonly mode: SqliteMode;
  readonly method: StorageBenchmarkMethod;
  readonly durationNs: bigint;
  readonly runCount: number;
  readonly amount: number;
  readonly unit: "inserts" | "calls";
}

const formatChange = (durationNs: bigint, baselineDurationNs: bigint) => {
  const change =
    Number((durationNs * 1_000n) / baselineDurationNs - 1_000n) / 10;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
};

const durationNsToBaselineMs = (durationNs: bigint): Millis =>
  Millis.orThrow(
    Number(
      (durationNs + nanosecondsPerMillisecond / 2n) / nanosecondsPerMillisecond,
    ),
  );

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "evolu-storage-benchmark-"),
);
const originalWorkingDirectory = process.cwd();
const measurementsByMethodRun = new Map<string, Array<bigint>>();
process.chdir(temporaryDirectory);

try {
  section("Storage insertTimestamp");

  for (const mode of sqliteModes) {
    for (const strategy of strategies) {
      const timestamps = timestampsByStrategy[strategy];
      const filter = process.env.JSBT_FILTER;
      const labels = Array.from(
        { length: (timestampCount / checkpointSize) * repeatCount },
        (_, index) => {
          const run = Math.floor(index / (timestampCount / checkpointSize)) + 1;
          const checkpoint =
            ((index % (timestampCount / checkpointSize)) + 1) * checkpointSize;
          return createLabel(mode, strategy, run, checkpoint);
        },
      );

      if (filter && labels.every((label) => !label.includes(filter))) continue;

      for (let run = 1; run <= repeatCount; run++) {
        if (
          filter &&
          labels.every(
            (label) =>
              !label.includes(`run ${run} `) || !label.includes(filter),
          )
        ) {
          continue;
        }

        await using setup = await setupStorage(mode);
        const { sqlite, storage } = setup;

        for (
          let checkpoint = checkpointSize;
          checkpoint <= timestampCount;
          checkpoint += checkpointSize
        ) {
          const label = createLabel(mode, strategy, run, checkpoint);
          const insertBatch = () =>
            insertTimestamps(
              sqlite,
              storage,
              timestamps,
              strategy,
              checkpoint - checkpointSize,
              checkpoint,
            );

          if (!filter || label.includes(filter)) {
            const result = await bench(label, insertBatch, {
              mode: "runOnce",
              returnStats: true,
              throughput: {
                amount: checkpointSize,
                unit: "inserts",
              },
            });
            if (result) {
              const methodRunLabel = createMethodRunLabel(mode, strategy, run);
              const methodRunMeasurements =
                measurementsByMethodRun.get(methodRunLabel) ?? [];
              methodRunMeasurements.push(result.stats.mean);
              measurementsByMethodRun.set(
                methodRunLabel,
                methodRunMeasurements,
              );
            }
          } else {
            insertBatch();
          }

          const size = storage.getSize(ownerId);
          strictEqual(size, checkpoint);
          const buckets = getOrThrow(computeBalancedBuckets(size));
          const fingerprintRanges = storage.fingerprintRanges(ownerId, buckets);
          strictEqual(fingerprintRanges.length, buckets.length);
        }
      }
    }
  }

  const benchmarkResults: Array<StorageBenchmarkResult> = [];
  for (const mode of sqliteModes) {
    for (const strategy of strategies) {
      const runTotals: Array<bigint> = [];
      for (let run = 1; run <= repeatCount; run++) {
        const measurements = measurementsByMethodRun.get(
          createMethodRunLabel(mode, strategy, run),
        );
        if (measurements?.length === checkpointCount) {
          runTotals.push(
            measurements.reduce((total, measurement) => total + measurement),
          );
        }
      }
      if (runTotals.length === 0) continue;

      const stats = utils.calcStats([...runTotals]);
      benchmarkResults.push({
        mode,
        method: strategy,
        durationNs: stats.median,
        runCount: runTotals.length,
        amount: timestampCount,
        unit: "inserts",
      });
    }
  }

  section("Storage insertTimestamp forced levels");

  const levelBaseTimestamps = Array.from(
    { length: timestampCount },
    (_, index) =>
      timestampToTimestampBytes(
        createTimestamp({ millis: Millis.orThrow(index * 2) }),
      ),
  );
  const levelInsertTimestamps = Array.from(
    { length: levelInsertCount },
    (_, index) =>
      timestampToTimestampBytes(
        createTimestamp({
          millis: Millis.orThrow(
            index * (timestampCount / levelInsertCount) * 2 + 1,
          ),
        }),
      ),
  );
  const levelAppendTimestamps = Array.from(
    { length: levelAppendCount },
    (_, index) =>
      timestampToTimestampBytes(
        createTimestamp({
          millis: Millis.orThrow(timestampCount * 2 + index),
        }),
      ),
  );

  for (const mode of sqliteModes) {
    for (const strategy of ["append", "insert"] as const) {
      const levelTimestamps =
        strategy === "append" ? levelAppendTimestamps : levelInsertTimestamps;
      const levelExpectedFingerprint = [
        ...levelBaseTimestamps,
        ...levelTimestamps,
      ]
        .map(timestampBytesToFingerprint)
        .reduce<Uint8Array>(
          (left, right) =>
            Uint8Array.from(left, (byte, index) => byte ^ right[index]),
          new Uint8Array(
            timestampBytesToFingerprint(levelBaseTimestamps[0]).length,
          ),
        );

      for (const level of insertLevels) {
        const method = `${strategy}Level${level}` as const;
        const runMeasurements: Array<bigint> = [];

        for (let run = 1; run <= repeatCount; run++) {
          const label = `${mode} ${strategy} level=${level} run ${run}`;
          const filter = process.env.JSBT_FILTER;
          if (filter && !label.includes(filter)) continue;

          await using setup = await setupStorage(mode);
          const { sqlite, storage } = setup;
          insertTimestamps(
            sqlite,
            storage,
            levelBaseTimestamps,
            "append",
            0,
            levelBaseTimestamps.length,
          );
          const levelStorage = createBaseSqliteStorage({
            sqlite,
            random: createInsertLevelRandom(level),
          });
          const levelCountBefore = getTimestampCountAtLevel(sqlite, level);
          const result = await bench(
            label,
            () =>
              insertTimestamps(
                sqlite,
                levelStorage,
                levelTimestamps,
                strategy,
                0,
                levelTimestamps.length,
              ),
            {
              mode: "runOnce",
              returnStats: true,
              throughput: { amount: levelTimestamps.length, unit: "inserts" },
            },
          );
          if (result) runMeasurements.push(result.stats.mean);
          strictEqual(
            levelStorage.getSize(ownerId),
            timestampCount + levelTimestamps.length,
          );
          strictEqual(
            getTimestampCountAtLevel(sqlite, level) - levelCountBefore,
            levelTimestamps.length,
          );
          deepStrictEqual(
            levelStorage.fingerprint(
              ownerId,
              NonNegativeInt.orThrow(0),
              NonNegativeInt.orThrow(timestampCount + levelTimestamps.length),
            ),
            levelExpectedFingerprint,
          );
        }

        if (runMeasurements.length > 0) {
          benchmarkResults.push({
            mode,
            method,
            durationNs: utils.calcStats([...runMeasurements]).median,
            runCount: runMeasurements.length,
            amount: levelTimestamps.length,
            unit: "inserts",
          });
        }
      }
    }
  }

  for (const mode of sqliteModes) {
    const runMeasurements: Array<bigint> = [];

    for (let run = 1; run <= repeatCount; run++) {
      const label = `${mode} append sparse level=10 run ${run}`;
      const filter = process.env.JSBT_FILTER;
      if (filter && !label.includes(filter)) continue;

      await using setup = await setupStorage(mode, createInsertLevelRandom(1));
      const { sqlite, storage } = setup;
      insertTimestamps(
        sqlite,
        storage,
        levelBaseTimestamps,
        "append",
        0,
        levelBaseTimestamps.length,
      );
      const levelStorage = createBaseSqliteStorage({
        sqlite,
        random: createInsertLevelRandom(10),
      });
      const result = await bench(
        label,
        () =>
          insertTimestamps(
            sqlite,
            levelStorage,
            levelAppendTimestamps,
            "append",
            0,
            1,
          ),
        {
          mode: "runOnce",
          returnStats: true,
          throughput: { amount: 1, unit: "inserts" },
        },
      );
      if (result) runMeasurements.push(result.stats.mean);
      strictEqual(levelStorage.getSize(ownerId), timestampCount + 1);
      deepStrictEqual(
        levelStorage.fingerprint(
          ownerId,
          NonNegativeInt.orThrow(0),
          NonNegativeInt.orThrow(timestampCount + 1),
        ),
        [...levelBaseTimestamps, levelAppendTimestamps[0]]
          .map(timestampBytesToFingerprint)
          .reduce<Uint8Array>(
            (left, right) =>
              Uint8Array.from(left, (byte, index) => byte ^ right[index]),
            new Uint8Array(
              timestampBytesToFingerprint(levelBaseTimestamps[0]).length,
            ),
          ),
      );
    }

    if (runMeasurements.length > 0) {
      benchmarkResults.push({
        mode,
        method: "appendSparseLevel10",
        durationNs: utils.calcStats([...runMeasurements]).median,
        runCount: runMeasurements.length,
        amount: 1,
        unit: "inserts",
      });
    }
  }

  section("Storage getTimestampByIndex");

  const getTimestampByIndexIndexes = Array.from(
    { length: getTimestampByIndexCount },
    (_, index) =>
      NonNegativeInt.orThrow(
        Math.floor(
          (index * (timestampCount - 1)) / (getTimestampByIndexCount - 1),
        ),
      ),
  );

  for (const mode of sqliteModes) {
    const runMeasurements: Array<bigint> = [];

    for (let run = 1; run <= repeatCount; run++) {
      const label = `${mode} getTimestampByIndex run ${run}`;
      const filter = process.env.JSBT_FILTER;
      if (filter && !label.includes(filter)) continue;

      await using setup = await setupStorage(mode);
      const { sqlite, storage } = setup;
      insertTimestamps(
        sqlite,
        storage,
        timestampsAsc,
        "append",
        0,
        timestampsAsc.length,
      );
      const getTimestamp = getTimestampByIndex({ sqlite });
      for (const index of getTimestampByIndexIndexes) {
        deepStrictEqual(
          Array.from(getTimestamp(ownerId, index)),
          Array.from(timestampsAsc[index]),
        );
      }
      let timestamp = timestampsAsc[0];
      const result = await bench(
        label,
        () => {
          for (const index of getTimestampByIndexIndexes) {
            timestamp = getTimestamp(ownerId, index);
          }
          return timestamp;
        },
        {
          mode: "runOnce",
          returnStats: true,
          throughput: { amount: getTimestampByIndexCount, unit: "calls" },
        },
      );
      if (result) runMeasurements.push(result.stats.mean);
    }

    if (runMeasurements.length > 0) {
      benchmarkResults.push({
        mode,
        method: "getTimestampByIndex",
        durationNs: utils.calcStats([...runMeasurements]).median,
        runCount: runMeasurements.length,
        amount: getTimestampByIndexCount,
        unit: "calls",
      });
    }
  }

  section("Storage fingerprintRanges");

  for (const mode of sqliteModes) {
    const runMeasurements: Array<bigint> = [];

    for (let run = 1; run <= repeatCount; run++) {
      const label = `${mode} fingerprintRanges run ${run}`;
      const filter = process.env.JSBT_FILTER;
      if (filter && !label.includes(filter)) continue;

      await using setup = await setupStorage(mode);
      const { sqlite, storage } = setup;
      insertTimestamps(
        sqlite,
        storage,
        timestampsAsc,
        "append",
        0,
        timestampsAsc.length,
      );
      const buckets = getOrThrow(
        computeBalancedBuckets(NonNegativeInt.orThrow(timestampCount)),
      );
      let rangesLength = 0;
      const result = await bench(
        label,
        () => {
          for (let index = 0; index < fingerprintRangesCount; index++) {
            rangesLength = storage.fingerprintRanges(ownerId, buckets).length;
          }
          return rangesLength;
        },
        {
          mode: "runOnce",
          returnStats: true,
          throughput: { amount: fingerprintRangesCount, unit: "calls" },
        },
      );
      if (result) runMeasurements.push(result.stats.mean);
      strictEqual(rangesLength, buckets.length);
    }

    if (runMeasurements.length > 0) {
      benchmarkResults.push({
        mode,
        method: "fingerprintRanges",
        durationNs: utils.calcStats([...runMeasurements]).median,
        runCount: runMeasurements.length,
        amount: fingerprintRangesCount,
        unit: "calls",
      });
    }
  }

  if (benchmarkResults.length > 0) {
    process.stderr.write("\n# Overall\n");
    if (sqliteVersion === undefined) {
      throw new Error("SQLite version was not detected");
    }
    const environment: StorageBenchmarkEnvironment = {
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
      nodeVersion: process.versions.node,
      sqliteVersion,
    };
    const existingBaseline = storageBenchmarkBaselines.baselines.find(
      (baseline) =>
        baseline.environment.platform === environment.platform &&
        baseline.environment.arch === environment.arch &&
        baseline.environment.cpu === environment.cpu &&
        baseline.environment.nodeVersion === environment.nodeVersion &&
        baseline.environment.sqliteVersion === environment.sqliteVersion,
    );
    process.stderr.write(
      `${environment.cpu}; ${environment.platform} ${environment.arch}; Node ${environment.nodeVersion}; SQLite ${environment.sqliteVersion}\n`,
    );
    const regressions: Array<string> = [];

    for (const result of benchmarkResults) {
      const baselineMeasurement =
        existingBaseline?.measurementsMs[result.mode][result.method];
      const baselineDuration =
        baselineMeasurement === undefined
          ? undefined
          : BigInt(baselineMeasurement) * nanosecondsPerMillisecond;
      const change = baselineDuration
        ? `, baseline ${utils.formatDuration(baselineDuration)}, ${formatChange(result.durationNs, baselineDuration)}`
        : "";
      process.stderr.write(
        `${result.mode} ${result.method}: ${utils.formatDuration(result.durationNs)}, ${((BigInt(result.amount) * 1_000_000_000n) / result.durationNs).toLocaleString()} ${result.unit}/sec, n=${result.runCount}${change}\n`,
      );
      if (
        check &&
        baselineDuration !== undefined &&
        result.durationNs * 100n >
          baselineDuration * BigInt(100 + maxRegressionPercent)
      ) {
        regressions.push(
          `${result.mode} ${result.method} ${formatChange(result.durationNs, baselineDuration)}`,
        );
      }
    }

    if (check) {
      if (!existingBaseline) {
        process.stderr.write(
          "\nStorage benchmark regression check skipped: no baseline matches this environment.\n",
        );
      } else if (regressions.length > 0) {
        throw new Error(
          `Storage performance regression exceeded ${maxRegressionPercent}%: ${regressions.join(", ")}`,
        );
      } else {
        process.stderr.write(
          `\nStorage benchmark regression check passed (maximum ${maxRegressionPercent}%).\n`,
        );
      }
    }

    if (profile === "full" && benchmarkResults.length === 24) {
      const getDurationMs = (
        mode: SqliteMode,
        method: StorageBenchmarkMethod,
      ) => {
        const result = benchmarkResults.find(
          (result) => result.mode === mode && result.method === method,
        );
        if (!result) throw new Error(`Missing ${mode} ${method} result`);
        return durationNsToBaselineMs(result.durationNs);
      };
      const nextBaseline: StorageBenchmarkBaseline = {
        environment,
        measurementsMs: {
          memory: {
            append: getDurationMs("memory", "append"),
            prepend: getDurationMs("memory", "prepend"),
            insert: getDurationMs("memory", "insert"),
            appendLevel1: getDurationMs("memory", "appendLevel1"),
            appendLevel2: getDurationMs("memory", "appendLevel2"),
            appendLevel10: getDurationMs("memory", "appendLevel10"),
            appendSparseLevel10: getDurationMs("memory", "appendSparseLevel10"),
            insertLevel1: getDurationMs("memory", "insertLevel1"),
            insertLevel2: getDurationMs("memory", "insertLevel2"),
            insertLevel10: getDurationMs("memory", "insertLevel10"),
            getTimestampByIndex: getDurationMs(
              "memory",
              "getTimestampByIndex",
            ),
            fingerprintRanges: getDurationMs("memory", "fingerprintRanges"),
          },
          file: {
            append: getDurationMs("file", "append"),
            prepend: getDurationMs("file", "prepend"),
            insert: getDurationMs("file", "insert"),
            appendLevel1: getDurationMs("file", "appendLevel1"),
            appendLevel2: getDurationMs("file", "appendLevel2"),
            appendLevel10: getDurationMs("file", "appendLevel10"),
            appendSparseLevel10: getDurationMs("file", "appendSparseLevel10"),
            insertLevel1: getDurationMs("file", "insertLevel1"),
            insertLevel2: getDurationMs("file", "insertLevel2"),
            insertLevel10: getDurationMs("file", "insertLevel10"),
            getTimestampByIndex: getDurationMs(
              "file",
              "getTimestampByIndex",
            ),
            fingerprintRanges: getDurationMs("file", "fingerprintRanges"),
          },
        },
      };

      if (updateBaseline) {
        const baselineIndex = storageBenchmarkBaselines.baselines.findIndex(
          (baseline) => baseline === existingBaseline,
        );
        const baselines = [...storageBenchmarkBaselines.baselines];
        if (baselineIndex === -1) baselines.push(nextBaseline);
        else baselines[baselineIndex] = nextBaseline;
        const nextBaselines: StorageBenchmarkBaselines = {
          version: 2,
          baselines,
        };
        await writeFile(
          storageBenchmarkBaselinesUrl,
          `${JSON.stringify(nextBaselines, null, 2)}\n`,
        );
        process.stderr.write("\nUpdated storage benchmark baseline\n");
      } else if (!existingBaseline) {
        process.stderr.write(
          `\nNo baseline matches this environment. Add this entry to benchmarks/storage/baselines.json:\n${JSON.stringify(nextBaseline, null, 2)}\n`,
        );
      }
    } else if (!existingBaseline) {
      process.stderr.write(
        "\nNo baseline matches this environment. Run `pnpm benchmark:storage --update-baseline` to create one.\n",
      );
    }
  }
} finally {
  process.chdir(originalWorkingDirectory);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
