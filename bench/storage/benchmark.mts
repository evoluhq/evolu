import { bench, section, utils } from "@paulmillr/jsbt/bench.js";
import { strictEqual } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import {
  array,
  computeBalancedBuckets,
  createRandom,
  createRun,
  createSqlite,
  eqArrayNumber,
  getOrThrow,
  type InferType,
  Millis,
  Name,
  NonNegativeInt,
  object,
  ok,
  PositiveMillis,
  type Sqlite,
  sql,
  String,
  testCreateRandom,
} from "@evolu/common";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  createTimestamp,
  getTimestampByIndex,
  OwnerIdBytes,
  type StorageInsertTimestampStrategy,
  type TimestampBytes,
  timestampToTimestampBytes,
} from "@evolu/common/local-first";
import {
  createBetterSqliteDriver,
  type HrDuration,
  hrDurationToMillis,
  millisToHrDuration,
} from "@evolu/nodejs";
import { parseBenchmarkMode } from "../index.mts";

const timestampCount = 50_000;
const checkpointSize = 10_000;
strictEqual(timestampCount % checkpointSize, 0);
const getTimestampByIndexCount = 1_000;
const fingerprintRangesCount = 250;
const repeatCount = 3;
const fingerprintRangesRepeatCount = 5;
const maxRegressionPercent = 10;
const benchmarkMode = parseBenchmarkMode({
  args: process.argv.slice(2),
  benchmarkName: "Storage",
});
const updateBaseline =
  benchmarkMode === "update-baseline" ||
  benchmarkMode === "force-update-baseline";
const strategies = [
  "append",
  "prepend",
  "insert",
] as const satisfies ReadonlyArray<StorageInsertTimestampStrategy>;
const benchmarkMethods = [
  ...strategies,
  "getTimestampByIndex",
  "fingerprintRanges",
] as const;
type StorageBenchmarkMethod = (typeof benchmarkMethods)[number];
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
  append: PositiveMillis,
  prepend: PositiveMillis,
  insert: PositiveMillis,
  getTimestampByIndex: PositiveMillis,
  fingerprintRanges: PositiveMillis,
});
interface StorageBenchmarkMethodMeasurements extends InferType<
  typeof StorageBenchmarkMethodMeasurements
> {}

const StorageBenchmarkBaseline = object({
  environment: StorageBenchmarkEnvironment,
  measurementsMs: StorageBenchmarkMethodMeasurements,
});
interface StorageBenchmarkBaseline extends InferType<
  typeof StorageBenchmarkBaseline
> {}

const StorageBenchmarkBaselines = object({
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

let sqliteVersion: string | undefined;
const setupStorage = async () => {
  await using disposer = new AsyncDisposableStack();
  const run = disposer.use(
    createRun({ createSqliteDriver: createBetterSqliteDriver }),
  );
  const sqlite = disposer.use(
    await run.ok(
      createSqlite(Name.orThrow("Storage-bench"), { mode: "memory" }),
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
      random: createRandom(),
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

interface StorageBenchmarkResult {
  readonly method: StorageBenchmarkMethod;
  readonly durationNs: HrDuration;
  readonly runCount: number;
  readonly amount: number;
  readonly unit: "inserts" | "calls";
}

// jsbt measures with process.hrtime.bigint() and reports nanoseconds.
const hrDurationFromJsbt = (duration: bigint): HrDuration =>
  duration as HrDuration;

const getJsbtRunOnceDuration = (
  label: string,
  result: Awaited<ReturnType<typeof bench>>,
): bigint => {
  if (!result) {
    throw new Error(`jsbt unexpectedly skipped benchmark "${label}"`);
  }
  return result.stats.mean;
};

const formatChange = (
  durationNs: HrDuration,
  baselineDurationNs: HrDuration,
) => {
  const scale = 10_000n;
  const scaledRatio =
    (durationNs * scale + baselineDurationNs - 1n) / baselineDurationNs;
  const change = Number(scaledRatio - scale) / 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
};

const benchmarkResults: Array<StorageBenchmarkResult> = [];

section("Storage insertTimestamp");

for (const strategy of strategies) {
  const timestamps = timestampsByStrategy[strategy];
  const runTotals: Array<bigint> = [];

  for (let run = 1; run <= repeatCount; run++) {
    await using setup = await setupStorage();
    const { sqlite, storage } = setup;
    let runTotal = 0n;

    for (
      let checkpoint = checkpointSize;
      checkpoint <= timestampCount;
      checkpoint += checkpointSize
    ) {
      const label = `${strategy} run ${run} ${checkpoint - checkpointSize}-${checkpoint} rows`;
      const result = await bench(
        label,
        () =>
          insertTimestamps(
            sqlite,
            storage,
            timestamps,
            strategy,
            checkpoint - checkpointSize,
            checkpoint,
          ),
        {
          mode: "runOnce",
          returnStats: true,
          throughput: {
            amount: checkpointSize,
            unit: "inserts",
          },
        },
      );
      runTotal += getJsbtRunOnceDuration(label, result);
    }

    strictEqual(storage.getSize(ownerId), timestampCount);
    runTotals.push(runTotal);
  }

  benchmarkResults.push({
    method: strategy,
    durationNs: hrDurationFromJsbt(utils.calcStats([...runTotals]).median),
    runCount: runTotals.length,
    amount: timestampCount,
    unit: "inserts",
  });
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

const getTimestampByIndexMeasurements: Array<bigint> = [];

for (let run = 1; run <= repeatCount; run++) {
  const label = `getTimestampByIndex run ${run}`;

  await using setup = await setupStorage();
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
  let timestamp = getTimestamp(ownerId, getTimestampByIndexIndexes[0]);
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
  getTimestampByIndexMeasurements.push(getJsbtRunOnceDuration(label, result));
  strictEqual(
    eqArrayNumber(timestamp, timestampsAsc[timestampCount - 1]),
    true,
  );
}

benchmarkResults.push({
  method: "getTimestampByIndex",
  durationNs: hrDurationFromJsbt(
    utils.calcStats([...getTimestampByIndexMeasurements]).median,
  ),
  runCount: getTimestampByIndexMeasurements.length,
  amount: getTimestampByIndexCount,
  unit: "calls",
});

section("Storage fingerprintRanges");

const fingerprintRangesMeasurements: Array<bigint> = [];

for (let run = 1; run <= fingerprintRangesRepeatCount; run++) {
  const label = `fingerprintRanges run ${run}`;

  await using setup = await setupStorage();
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
  let fingerprintRanges = storage.fingerprintRanges(ownerId, buckets);
  const result = await bench(
    label,
    () => {
      for (let index = 0; index < fingerprintRangesCount; index++) {
        fingerprintRanges = storage.fingerprintRanges(ownerId, buckets);
      }
      return fingerprintRanges.length;
    },
    {
      mode: "runOnce",
      returnStats: true,
      throughput: { amount: fingerprintRangesCount, unit: "calls" },
    },
  );
  fingerprintRangesMeasurements.push(getJsbtRunOnceDuration(label, result));
  strictEqual(fingerprintRanges.length, buckets.length);
}

benchmarkResults.push({
  method: "fingerprintRanges",
  durationNs: hrDurationFromJsbt(
    utils.calcStats([...fingerprintRangesMeasurements]).min,
  ),
  runCount: fingerprintRangesMeasurements.length,
  amount: fingerprintRangesCount,
  unit: "calls",
});

strictEqual(benchmarkResults.length, benchmarkMethods.length);
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
  const baselineMeasurement = existingBaseline?.measurementsMs[result.method];
  const baselineDuration =
    baselineMeasurement === undefined
      ? undefined
      : millisToHrDuration(baselineMeasurement);
  const change = baselineDuration
    ? `, baseline ${utils.formatDuration(baselineDuration)}, ${formatChange(result.durationNs, baselineDuration)}`
    : "";
  process.stderr.write(
    `${result.method}: ${utils.formatDuration(result.durationNs)}, ${((BigInt(result.amount) * 1_000_000_000n) / result.durationNs).toLocaleString()} ${result.unit}/sec, n=${result.runCount}${change}\n`,
  );
  if (
    baselineDuration !== undefined &&
    result.durationNs * 100n >
      baselineDuration * BigInt(100 + maxRegressionPercent)
  ) {
    regressions.push(
      `${result.method} ${formatChange(result.durationNs, baselineDuration)}`,
    );
  }
}

if (existingBaseline) {
  if (regressions.length > 0) {
    if (benchmarkMode === "force-update-baseline") {
      process.stderr.write(
        `\nForcing storage baseline update despite regressions exceeding ${maxRegressionPercent}%: ${regressions.join(", ")}\n`,
      );
    } else {
      throw new Error(
        `Storage performance regression exceeded ${maxRegressionPercent}%: ${regressions.join(", ")}`,
      );
    }
  } else {
    process.stderr.write(
      `\nStorage benchmark passed (maximum regression ${maxRegressionPercent}%).\n`,
    );
  }
} else if (updateBaseline) {
  process.stderr.write(
    "\nNo storage baseline matches this environment; creating one.\n",
  );
}

const nextBaseline: StorageBenchmarkBaseline = {
  environment,
  measurementsMs: getOrThrow(
    StorageBenchmarkMethodMeasurements.fromUnknown(
      Object.fromEntries(
        benchmarkResults.map((result) => [
          result.method,
          hrDurationToMillis(result.durationNs),
        ]),
      ),
    ),
  ),
};

if (updateBaseline) {
  const baselineIndex = storageBenchmarkBaselines.baselines.findIndex(
    (baseline) => baseline === existingBaseline,
  );
  const baselines = [...storageBenchmarkBaselines.baselines];
  if (baselineIndex === -1) baselines.push(nextBaseline);
  else baselines[baselineIndex] = nextBaseline;
  await writeFile(
    storageBenchmarkBaselinesUrl,
    `${JSON.stringify({ baselines } satisfies StorageBenchmarkBaselines, null, 2)}\n`,
  );
  process.stderr.write("\nUpdated storage benchmark baseline\n");
} else if (!existingBaseline) {
  throw new Error(
    `Storage benchmark cannot check regressions because no baseline matches this environment. Add this entry to bench/storage/baselines.json:\n${JSON.stringify(nextBaseline, null, 2)}`,
  );
}
