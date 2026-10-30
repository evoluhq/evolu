/**
 * The workloads and measurement of the storage benchmark, which
 * [`benchmark.mts`](./benchmark.mts) runs. A comparison with another checkout
 * requires this file to be the same in both, so it holds everything that
 * affects what a run measures, and the progress a default run prints between
 * measured regions, but not the command line, the baselines or the comparison.
 */
import {
  ansi,
  benchmarkRaw,
  calcStats,
  envFlag,
  paintFormattedDuration,
  printCsvRow,
  type CbFn,
  wantColor,
} from "@paulmillr/jsbt/benchmark.js";
import { strictEqual } from "node:assert";
import {
  computeBalancedBuckets,
  createRandom,
  createRun,
  createSqlite,
  eqArrayNumber,
  getOrThrow,
  Millis,
  Name,
  NonNegativeInt,
  ok,
  type Sqlite,
  sql,
  testCreateRandom,
} from "@evolu/common";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  createTimestamp,
  getTimestampByIndex,
  OwnerIdBytes,
  type TimestampBytes,
  timestampToTimestampBytes,
} from "@evolu/common/local-first";
import { createNodeJsSqliteDriver, type HrDuration } from "@evolu/nodejs";

const timestampCount = 50_000;
const checkpointSize = 10_000;
strictEqual(timestampCount % checkpointSize, 0);
const getTimestampByIndexCount = 1_000;
const fingerprintRangesCount = 250;
const repeatCount = 3;
const fingerprintRangesRepeatCount = 5;
// Ascending, descending and shuffled timestamps.
const strategies = ["append", "prepend", "insert"] as const;
export const benchmarkMethods = [
  ...strategies,
  "getTimestampByIndex",
  "fingerprintRanges",
] as const;
export type StorageBenchmarkMethod = (typeof benchmarkMethods)[number];
const ownerId = OwnerIdBytes.orThrow(new Uint8Array(16));

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
  (typeof strategies)[number],
  ReadonlyArray<TimestampBytes>
> = {
  append: timestampsAsc,
  prepend: timestampsAsc.toReversed(),
  insert: timestampIndexesRandom.map((index) => timestampsAsc[index]),
};

export interface StorageBenchmarkResult {
  readonly method: StorageBenchmarkMethod;
  readonly durationNs: HrDuration;
  readonly runCount: number;
  readonly amount: number;
  readonly unit: "inserts" | "calls";
}

/**
 * Runs every workload and returns each method's result. A silent run prints
 * nothing, for the child process of a comparison whose output would interleave
 * with its parent's report.
 */
export const measure = async (
  isSilent: boolean,
): Promise<{
  readonly results: ReadonlyArray<StorageBenchmarkResult>;
  readonly sqliteVersion: string;
}> => {
  const benchmarkCsv =
    envFlag(process.env.JSBT_CSV) ||
    !wantColor(process.env, process.stderr.isTTY || process.stdout.isTTY);
  let sqliteVersion: string | undefined;
  let benchmarkSection = "";
  let benchmarkOutputStarted = false;
  let benchmarkCsvHeaderPrinted = false;

  const setupStorage = async () => {
    await using disposer = new AsyncDisposableStack();
    const run = disposer.use(
      createRun({ createSqliteDriver: createNodeJsSqliteDriver }),
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

  const setBenchmarkSection = (title: string) => {
    benchmarkSection = title;
    if (benchmarkCsv || isSilent) return;

    process.stdout.write(
      `${benchmarkOutputStarted ? "\n" : ""}${ansi.cyan}# ${title}${ansi.reset}\n`,
    );
    benchmarkOutputStarted = true;
  };

  const benchmarkOnce = async (
    label: string,
    callback: CbFn,
  ): Promise<bigint> => {
    const result = await benchmarkRaw(callback, 0n);
    if (isSilent) return result.stats.mean;
    if (benchmarkCsv) {
      if (!benchmarkCsvHeaderPrinted) {
        printCsvRow(["name", "nanoseconds", "rme"]);
        benchmarkCsvHeaderPrinted = true;
      }
      printCsvRow([
        `${benchmarkSection}; ${label}`,
        result.stats.mean,
        result.stats.rme.toFixed(2),
      ]);
    } else {
      process.stdout.write(
        `${label} ${paintFormattedDuration(result.perItemStr, ansi.blue)}\n`,
      );
    }
    benchmarkOutputStarted = true;
    return result.stats.mean;
  };

  const benchmarkResults: Array<StorageBenchmarkResult> = [];

  setBenchmarkSection("Storage insertTimestamp");

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
        runTotal += await benchmarkOnce(label, () =>
          insertTimestamps(
            sqlite,
            storage,
            timestamps,
            checkpoint - checkpointSize,
            checkpoint,
          ),
        );
      }

      strictEqual(storage.getSize(ownerId), timestampCount);
      runTotals.push(runTotal);
    }

    benchmarkResults.push({
      method: strategy,
      durationNs: hrDurationFromJsbt(
        calcStats(Float64Array.from(runTotals, Number)).p50,
      ),
      runCount: runTotals.length,
      amount: timestampCount,
      unit: "inserts",
    });
  }

  setBenchmarkSection("Storage getTimestampByIndex");

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
    insertTimestamps(sqlite, storage, timestampsAsc, 0, timestampsAsc.length);
    const getTimestamp = getTimestampByIndex({ sqlite });
    let timestamp = getTimestamp(ownerId, getTimestampByIndexIndexes[0]);
    getTimestampByIndexMeasurements.push(
      await benchmarkOnce(label, () => {
        for (const index of getTimestampByIndexIndexes) {
          timestamp = getTimestamp(ownerId, index);
        }
        return timestamp;
      }),
    );
    strictEqual(
      eqArrayNumber(timestamp, timestampsAsc[timestampCount - 1]),
      true,
    );
  }

  benchmarkResults.push({
    method: "getTimestampByIndex",
    durationNs: hrDurationFromJsbt(
      calcStats(Float64Array.from(getTimestampByIndexMeasurements, Number)).p50,
    ),
    runCount: getTimestampByIndexMeasurements.length,
    amount: getTimestampByIndexCount,
    unit: "calls",
  });

  setBenchmarkSection("Storage fingerprintRanges");

  const fingerprintRangesMeasurements: Array<bigint> = [];

  for (let run = 1; run <= fingerprintRangesRepeatCount; run++) {
    const label = `fingerprintRanges run ${run}`;

    await using setup = await setupStorage();
    const { sqlite, storage } = setup;
    insertTimestamps(sqlite, storage, timestampsAsc, 0, timestampsAsc.length);
    const buckets = getOrThrow(
      computeBalancedBuckets(NonNegativeInt.orThrow(timestampCount)),
    );
    let fingerprintRanges = storage.fingerprintRanges(ownerId, buckets);
    fingerprintRangesMeasurements.push(
      await benchmarkOnce(label, () => {
        for (let index = 0; index < fingerprintRangesCount; index++) {
          fingerprintRanges = storage.fingerprintRanges(ownerId, buckets);
        }
        return fingerprintRanges.length;
      }),
    );
    strictEqual(fingerprintRanges.length, buckets.length);
  }

  benchmarkResults.push({
    method: "fingerprintRanges",
    durationNs: hrDurationFromJsbt(
      calcStats(Float64Array.from(fingerprintRangesMeasurements, Number)).min,
    ),
    runCount: fingerprintRangesMeasurements.length,
    amount: fingerprintRangesCount,
    unit: "calls",
  });

  strictEqual(benchmarkResults.length, benchmarkMethods.length);
  if (sqliteVersion === undefined) {
    throw new Error("SQLite version was not detected");
  }
  return { results: benchmarkResults, sqliteVersion };
};

const insertTimestamps = (
  sqlite: Sqlite,
  storage: ReturnType<typeof createBaseSqliteStorage>,
  timestamps: ReadonlyArray<TimestampBytes>,
  begin: number,
  end: number,
) =>
  sqlite.transaction(() => {
    for (let index = begin; index < end; index++) {
      storage.insertTimestamp(ownerId, timestamps[index]);
    }
    return ok();
  });

// jsbt measures with process.hrtime.bigint() and reports nanoseconds.
const hrDurationFromJsbt = (duration: bigint): HrDuration =>
  duration as HrDuration;
