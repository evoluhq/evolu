import { formatDuration } from "@paulmillr/jsbt/benchmark.js";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { basename, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  array,
  getOrThrow,
  type InferType,
  object,
  PositiveInt,
  PositiveMillis,
  String,
} from "@evolu/common";
import {
  type HrDuration,
  hrDurationToMillis,
  millisToHrDuration,
} from "@evolu/nodejs";
import { buildNativeSqlite } from "../../packages/nodejs/scripts/build-native.mts";
import { defaultCacheDirectory } from "../../packages/sqlite-core/scripts/paths.mts";
import {
  type BenchmarkMode,
  parseBenchmarkMode,
  parseComparisonArgs,
} from "../index.mts";
import { sendToParent, spawnChild } from "../protocol/child.mts";
import { formatTable } from "../protocol/format.mts";
import {
  isBaseFirst,
  ratioVerdict,
  slowerRatio,
  summarizeRatios,
} from "../protocol-runtime/timing.mts";
import {
  benchmarkMethods,
  measure,
  type StorageBenchmarkResult,
} from "./measure.mts";

const main = async (): Promise<void> => {
  const {
    baseCheckout,
    maxRegressionPercent: comparisonPercent,
    otherArgs,
  } = parseComparisonArgs(process.argv.slice(2), "Storage");
  const isMeasureOnly = otherArgs.includes(measureOnlyFlag);
  // parseBenchmarkMode is strict, so the other options are removed first.
  const benchmarkMode = parseBenchmarkMode({
    args: otherArgs.filter((arg) => arg !== measureOnlyFlag),
    benchmarkName: "Storage",
  });
  if ((baseCheckout !== null || isMeasureOnly) && benchmarkMode !== "default") {
    throw new Error(
      `A comparison never writes baselines, so it cannot be combined with --mode=${benchmarkMode}.`,
    );
  }

  if (baseCheckout !== null) {
    if (isMeasureOnly) {
      throw new Error(`${measureOnlyFlag} is the child of --base-checkout.`);
    }
    await compareWithCheckout(
      baseCheckout,
      comparisonPercent ?? maxRegressionPercent,
    );
    return;
  }
  if (comparisonPercent !== null) {
    throw new Error("--max-regression is the threshold of --base-checkout.");
  }

  if (isMeasureOnly) {
    // A checkout without an install of its own would load an enclosing
    // checkout's Evolu and measure that.
    for (const specifier of ["@evolu/common", "@evolu/nodejs"]) {
      const path = fileURLToPath(import.meta.resolve(specifier));
      if (!path.startsWith(`${repoRoot}${sep}`)) {
        throw new Error(
          `${repoRoot} has no install of its own: ${specifier} resolves to ${path}.`,
        );
      }
    }
  }
  // Read before measuring, so an invalid file fails at once.
  const storageBenchmarkBaselines = isMeasureOnly
    ? null
    : getOrThrow(
        StorageBenchmarkBaselines.fromUnknown(
          JSON.parse(await readFile(storageBenchmarkBaselinesUrl, "utf8")),
        ),
      );
  await buildNativeSqlite();
  const { results, sqliteVersion } = await measure(isMeasureOnly);
  if (isMeasureOnly) {
    await sendToParent(
      getOrThrow(
        StorageBenchmarkMeasurement.fromUnknown({
          sqliteVersion,
          durationsNs: Object.fromEntries(
            results.map(({ method, durationNs }) => [
              method,
              Number(durationNs),
            ]),
          ),
        }),
      ),
    );
    return;
  }
  if (storageBenchmarkBaselines !== null) {
    await checkBaseline(
      benchmarkMode,
      storageBenchmarkBaselines,
      results,
      sqliteVersion,
    );
  }
};

/** The child mode of {@link compareWithCheckout}, which prints nothing. */
const measureOnlyFlag = "--measure-only";

const repoRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const maxRegressionPercent = 10;

const pairCount = 5;

/** What a {@link measureOnlyFlag} child sends: nanoseconds by method. */
const StorageBenchmarkMeasurement = object({
  sqliteVersion: String,
  durationsNs: object({
    append: PositiveInt,
    prepend: PositiveInt,
    insert: PositiveInt,
    getTimestampByIndex: PositiveInt,
    fingerprintRanges: PositiveInt,
  }),
});
interface StorageBenchmarkMeasurement extends InferType<
  typeof StorageBenchmarkMeasurement
> {}

/**
 * Runs the checkout at `dir`, which has its own install, and the working tree
 * in pairs of child processes in ABBA order, each running its own copy of this
 * file, and compares each method's paired ratios. It fails when their
 * [`measure.mts`](./measure.mts) differ, which would measure the versions
 * differently, and when a method's median ratio exceeds `thresholdPercent` and
 * every pair is slower.
 */
const compareWithCheckout = async (
  dir: string,
  thresholdPercent: number,
): Promise<void> => {
  const root = realpathSync(dir);
  const [ownSource, otherSource] = await Promise.all(
    [repoRoot, root].map((sourceRoot) =>
      readFile(join(sourceRoot, "bench", "storage", "measure.mts")),
    ),
  );
  if (!ownSource.equals(otherSource)) {
    throw new Error(
      `The storage measurement of ${dir} differs from the working tree's, so the two are not comparable.`,
    );
  }
  const head = spawnSync("git", ["-C", root, "rev-parse", "--short=9", "HEAD"]);
  const baseLabel =
    head.status === 0
      ? `${basename(root)} (${head.stdout.toString().trim()})`
      : basename(root);
  process.stdout.write(
    `Storage benchmark: ${baseLabel} against the working tree, ${pairCount} pairs of child processes in ABBA order. Baselines are neither read nor written.\n`,
  );

  const pairs: Array<{
    readonly base: StorageBenchmarkMeasurement;
    readonly head: StorageBenchmarkMeasurement;
  }> = [];
  for (let pair = 0; pair < pairCount; pair++) {
    const runSide = async (side: "base" | "head") => {
      const sideRoot = side === "base" ? root : repoRoot;
      const message = await spawnChild({
        script: join(sideRoot, "bench", "storage", "benchmark.mts"),
        args: [measureOnlyFlag],
        cwd: sideRoot,
        label: `Storage benchmark child in ${sideRoot}`,
        env:
          side === "head"
            ? process.env
            : {
                ...process.env,
                // The other checkout builds its own addon, from this
                // checkout's SQLite source cache.
                SQLITE_CORE_CACHE: defaultCacheDirectory(process.env),
                SQLITE_CORE_BUILD: "",
              },
      });
      const result = StorageBenchmarkMeasurement.fromUnknown(message);
      if (!result.ok) {
        throw new Error(
          `The storage benchmark child in ${sideRoot} sent an invalid result: ${JSON.stringify(result.error)}`,
        );
      }
      const measurement = result.value;
      process.stderr.write(
        `  ${side} ${benchmarkMethods.map((method) => `${method} ${formatMs(measurement.durationsNs[method])}`).join(", ")}; SQLite ${measurement.sqliteVersion}\n`,
      );
      return measurement;
    };
    process.stderr.write(
      `\n# Pair ${pair + 1} of ${pairCount}: ${isBaseFirst(pair) ? "base first" : "working tree first"}\n`,
    );
    if (isBaseFirst(pair)) {
      const base = await runSide("base");
      pairs.push({ base, head: await runSide("head") });
    } else {
      const head = await runSide("head");
      pairs.push({ base: await runSide("base"), head });
    }
  }

  const failures: Array<string> = [];
  const rows = benchmarkMethods.map((method) => {
    const durations = pairs.map(({ base, head }) => ({
      base: base.durationsNs[method],
      head: head.durationsNs[method],
    }));
    const summary = summarizeRatios(durations);
    const verdict = ratioVerdict(summary, thresholdPercent);
    if (verdict === "regression") {
      failures.push(`${method} ${summary.median.toFixed(3)}`);
    }
    return [
      method,
      formatMs(Math.min(...durations.map(({ base }) => base))),
      formatMs(Math.min(...durations.map(({ head }) => head))),
      `${summary.median.toFixed(3)} [${summary.min.toFixed(3)}..${summary.max.toFixed(3)}]`,
      verdict === "same"
        ? ""
        : verdict === "regression"
          ? `FAILS, over ${thresholdPercent}%`
          : verdict,
    ];
  });
  process.stdout.write(
    `\nRatios are working tree / base wall time: the median of ${pairCount} paired child processes, then [min..max]. A median from ${slowerRatio.toFixed(2)} is slower, and above ${(1 + thresholdPercent / 100).toFixed(2)} with every pair slower fails.\n`,
  );
  process.stdout.write(
    `SQLite: base ${pairs[0].base.sqliteVersion}, working tree ${pairs[0].head.sqliteVersion}\n`,
  );
  process.stdout.write(
    formatTable(
      ["", `${baseLabel} fastest`, "working tree fastest", "ratio", ""],
      rows,
    ),
  );
  if (failures.length > 0) {
    throw new Error(
      `The working tree is more than ${thresholdPercent}% slower than ${baseLabel}: ${failures.join(", ")}`,
    );
  }
};

const formatMs = (ns: number): string => {
  const ms = ns / 1e6;
  return `${ms.toFixed(ms < 10 ? 3 : ms < 100 ? 2 : 1)} ms`;
};

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

/**
 * Compares `results` with the exact-environment baseline and fails on a
 * regression, or writes the baseline in an update mode.
 */
const checkBaseline = async (
  benchmarkMode: BenchmarkMode,
  storageBenchmarkBaselines: StorageBenchmarkBaselines,
  benchmarkResults: ReadonlyArray<StorageBenchmarkResult>,
  sqliteVersion: string,
): Promise<void> => {
  const updateBaseline =
    benchmarkMode === "update-baseline" ||
    benchmarkMode === "force-update-baseline";
  process.stderr.write("\n# Overall\n");
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
      ? `, baseline ${formatDuration(baselineDuration)}, ${formatChange(result.durationNs, baselineDuration)}`
      : "";
    process.stderr.write(
      `${result.method}: ${formatDuration(result.durationNs)}, ${((BigInt(result.amount) * 1_000_000_000n) / result.durationNs).toLocaleString()} ${result.unit}/sec, n=${result.runCount}${change}\n`,
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

await main();
