import { bench, section, utils } from "@paulmillr/jsbt/bench.js";
import { strictEqual } from "node:assert";
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
  object,
  ok,
  type Sqlite,
  sql,
  String,
  testCreateRandom,
} from "../../packages/common/dist/src/index.js";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  createTimestamp,
  OwnerIdBytes,
  type StorageInsertTimestampStrategy,
  type TimestampBytes,
  timestampToTimestampBytes,
} from "../../packages/common/dist/src/local-first/index.js";
import { createBetterSqliteDriver } from "../../packages/nodejs/dist/src/index.js";

const timestampCount = 50_000;
const checkpointSize = 10_000;
const checkpointCount = timestampCount / checkpointSize;
const maxRegressionPercent = 10;
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
  append: String,
  prepend: String,
  insert: String,
});
interface StorageBenchmarkMethodMeasurements extends InferType<
  typeof StorageBenchmarkMethodMeasurements
> {}

const StorageBenchmarkBaseline = object({
  environment: StorageBenchmarkEnvironment,
  measurementsNs: object({
    memory: StorageBenchmarkMethodMeasurements,
    file: StorageBenchmarkMethodMeasurements,
  }),
});
interface StorageBenchmarkBaseline extends InferType<
  typeof StorageBenchmarkBaseline
> {}

const StorageBenchmarkBaselines = object({
  version: literal(1),
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
const setupStorage = async (mode: SqliteMode) => {
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
      random: testCreateRandom("Storage.bench Skiplist levels"),
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
  readonly strategy: StorageInsertTimestampStrategy;
  readonly durationNs: bigint;
  readonly runCount: number;
}

const formatChange = (durationNs: bigint, baselineDurationNs: bigint) => {
  const change =
    Number((durationNs * 10_000n) / baselineDurationNs - 10_000n) / 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
};

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
  process.stderr.write("\n# Overall\n");
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
        strategy,
        durationNs: stats.median,
        runCount: runTotals.length,
      });
    }
  }

  if (benchmarkResults.length > 0) {
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
      const baselineDuration = existingBaseline
        ? BigInt(existingBaseline.measurementsNs[result.mode][result.strategy])
        : undefined;
      const change = baselineDuration
        ? `, baseline ${utils.formatDuration(baselineDuration)}, ${formatChange(result.durationNs, baselineDuration)}`
        : "";
      process.stderr.write(
        `${result.mode} ${result.strategy}: ${utils.formatDuration(result.durationNs)}, ${((BigInt(timestampCount) * 1_000_000_000n) / result.durationNs).toLocaleString()} inserts/sec, n=${result.runCount}${change}\n`,
      );
      if (
        check &&
        baselineDuration !== undefined &&
        result.durationNs * 100n >
          baselineDuration * BigInt(100 + maxRegressionPercent)
      ) {
        regressions.push(
          `${result.mode} ${result.strategy} ${formatChange(result.durationNs, baselineDuration)}`,
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

    if (profile === "full" && benchmarkResults.length === 6) {
      const getDuration = (
        mode: SqliteMode,
        strategy: StorageInsertTimestampStrategy,
      ) => {
        const result = benchmarkResults.find(
          (result) => result.mode === mode && result.strategy === strategy,
        );
        if (!result) throw new Error(`Missing ${mode} ${strategy} result`);
        return result.durationNs.toString();
      };
      const nextBaseline: StorageBenchmarkBaseline = {
        environment,
        measurementsNs: {
          memory: {
            append: getDuration("memory", "append"),
            prepend: getDuration("memory", "prepend"),
            insert: getDuration("memory", "insert"),
          },
          file: {
            append: getDuration("file", "append"),
            prepend: getDuration("file", "prepend"),
            insert: getDuration("file", "insert"),
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
          version: 1,
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
