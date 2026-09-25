import { formatDuration } from "@paulmillr/jsbt/benchmark.js";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { Worker } from "node:worker_threads";
import {
  array,
  getOrThrow,
  type InferType,
  object,
  PositiveInt,
  String,
} from "@evolu/common";
import { parseBenchmarkMode } from "../index.mts";
import {
  batchSize,
  type ScenarioName,
  labelsByScenarioName,
  scenarioNames,
} from "./workload.mts";

const repeatCount = 5;
const maxRegressionPercent = 10;

const benchmarkMode = parseBenchmarkMode({
  args: process.argv.slice(2),
  benchmarkName: "Type runtime",
});
const updateBaseline =
  benchmarkMode === "update-baseline" ||
  benchmarkMode === "force-update-baseline";

const TypeRuntimeBenchmarkEnvironment = object({
  platform: String,
  arch: String,
  cpu: String,
  nodeVersion: String,
  batchSize: PositiveInt,
  repeatCount: PositiveInt,
  // Results are comparable only for the same schema, data, and scenarios.
  workloadSha256: String,
});
interface TypeRuntimeBenchmarkEnvironment extends InferType<
  typeof TypeRuntimeBenchmarkEnvironment
> {}

const TypeRuntimeBenchmarkMeasurements = object({
  create: PositiveInt,
  isValid: PositiveInt,
  isInvalid: PositiveInt,
  fromUnknownValid: PositiveInt,
  fromUnknownInvalidFirst: PositiveInt,
  fromUnknownInvalidAll: PositiveInt,
  standardValid: PositiveInt,
  standardInvalid: PositiveInt,
} satisfies Record<ScenarioName, typeof PositiveInt>);

const TypeRuntimeBenchmarkBaseline = object({
  environment: TypeRuntimeBenchmarkEnvironment,
  measurementsNs: TypeRuntimeBenchmarkMeasurements,
});
interface TypeRuntimeBenchmarkBaseline extends InferType<
  typeof TypeRuntimeBenchmarkBaseline
> {}

const TypeRuntimeBenchmarkBaselines = object({
  baselines: array(TypeRuntimeBenchmarkBaseline),
});
interface TypeRuntimeBenchmarkBaselines extends InferType<
  typeof TypeRuntimeBenchmarkBaselines
> {}

const baselinesUrl = new URL("./baselines.json", import.meta.url);
const baselines = getOrThrow(
  TypeRuntimeBenchmarkBaselines.fromUnknown(
    JSON.parse(await readFile(baselinesUrl, "utf8")),
  ),
);

const workerUrl = new URL("./worker.mts", import.meta.url);
const workloadSha256 = createHash("sha256")
  .update(await readFile(new URL("./workload.mts", import.meta.url)))
  .digest("hex");
const fastestDurationNsByScenarioName = new Map<ScenarioName, bigint>();

process.stderr.write(
  `Type runtime benchmark (${scenarioNames.length} scenarios, ${batchSize} operations per batch, ${repeatCount} repeats, each in a fresh Worker)\n`,
);

// Each run measures every scenario once, so a short burst of machine load
// slows at most one of the repeats a scenario keeps the fastest of.
for (let repeat = 1; repeat <= repeatCount; repeat++) {
  process.stderr.write(`\n# Run ${repeat}\n`);

  for (const name of scenarioNames) {
    const durationNs = await new Promise<unknown>((resolve, reject) => {
      const worker = new Worker(workerUrl, { workerData: name });
      worker.once("message", resolve);
      worker.once("error", reject);
      // Rejecting after the message has resolved is a no-op.
      worker.once("exit", (code) => {
        reject(
          new Error(
            `${labelsByScenarioName[name]} worker exited with code ${code} before reporting.`,
          ),
        );
      });
    });
    if (typeof durationNs !== "bigint" || durationNs <= 0n) {
      throw new Error(
        `${labelsByScenarioName[name]} measured an invalid duration: ${globalThis.String(durationNs)}`,
      );
    }
    const fastestDurationNs = fastestDurationNsByScenarioName.get(name);
    if (fastestDurationNs === undefined || durationNs < fastestDurationNs) {
      fastestDurationNsByScenarioName.set(name, durationNs);
    }
    process.stderr.write(
      `${labelsByScenarioName[name]}: ${formatDuration(durationNs)} per operation\n`,
    );
  }
}

const benchmarkResults = scenarioNames.map((name) => {
  const durationNs = fastestDurationNsByScenarioName.get(name);
  if (durationNs === undefined) {
    throw new Error(`${labelsByScenarioName[name]} produced no measurements.`);
  }
  return { name, durationNs };
});

const environment = getOrThrow(
  TypeRuntimeBenchmarkEnvironment.fromUnknown({
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    nodeVersion: process.versions.node,
    batchSize,
    repeatCount,
    workloadSha256,
  }),
);
const existingBaseline = baselines.baselines.find(
  (baseline) =>
    baseline.environment.platform === environment.platform &&
    baseline.environment.arch === environment.arch &&
    baseline.environment.cpu === environment.cpu &&
    baseline.environment.nodeVersion === environment.nodeVersion &&
    baseline.environment.batchSize === environment.batchSize &&
    baseline.environment.repeatCount === environment.repeatCount &&
    baseline.environment.workloadSha256 === environment.workloadSha256,
);

const formatChange = (durationNs: bigint, baselineDurationNs: bigint) => {
  const scale = 10_000n;
  const scaledRatio =
    (durationNs * scale + baselineDurationNs - 1n) / baselineDurationNs;
  const change = Number(scaledRatio - scale) / 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
};

process.stderr.write(
  `\n# Overall\n${environment.cpu}; ${environment.platform} ${environment.arch}; Node ${environment.nodeVersion}\n\n`,
);

const regressions: Array<string> = [];
for (const { name, durationNs } of benchmarkResults) {
  const baselineMeasurement = existingBaseline?.measurementsNs[name];
  const baselineDuration =
    baselineMeasurement === undefined ? undefined : BigInt(baselineMeasurement);
  const change =
    baselineDuration === undefined
      ? ""
      : `, baseline ${formatDuration(baselineDuration)}, ${formatChange(durationNs, baselineDuration)}`;
  process.stderr.write(
    `${labelsByScenarioName[name]}: ${formatDuration(durationNs)} per operation, ${(1_000_000_000n / durationNs).toLocaleString()} operations/sec${change}\n`,
  );

  if (
    baselineDuration !== undefined &&
    durationNs * 100n > baselineDuration * BigInt(100 + maxRegressionPercent)
  ) {
    regressions.push(
      `${labelsByScenarioName[name]} ${formatChange(durationNs, baselineDuration)}`,
    );
  }
}

if (existingBaseline) {
  if (regressions.length > 0) {
    if (benchmarkMode === "force-update-baseline") {
      process.stderr.write(
        `\nForcing Type runtime baseline update despite regressions exceeding ${maxRegressionPercent}%: ${regressions.join(", ")}\n`,
      );
    } else {
      throw new Error(
        `Type runtime performance regression exceeded ${maxRegressionPercent}%: ${regressions.join(", ")}`,
      );
    }
  } else {
    process.stderr.write(
      `\nType runtime benchmark passed (maximum regression ${maxRegressionPercent}%).\n`,
    );
  }
} else if (updateBaseline) {
  process.stderr.write(
    "\nNo Type runtime baseline matches this environment; creating one.\n",
  );
}

const nextBaseline: TypeRuntimeBenchmarkBaseline = {
  environment,
  measurementsNs: getOrThrow(
    TypeRuntimeBenchmarkMeasurements.fromUnknown(
      Object.fromEntries(
        benchmarkResults.map(({ name, durationNs }) => [
          name,
          Number(durationNs),
        ]),
      ),
    ),
  ),
};

if (updateBaseline) {
  const baselineIndex = baselines.baselines.findIndex(
    (baseline) => baseline === existingBaseline,
  );
  const nextBaselines = [...baselines.baselines];
  if (baselineIndex === -1) nextBaselines.push(nextBaseline);
  else nextBaselines[baselineIndex] = nextBaseline;
  await writeFile(
    baselinesUrl,
    `${JSON.stringify({ baselines: nextBaselines } satisfies TypeRuntimeBenchmarkBaselines, null, 2)}\n`,
  );
  process.stderr.write("\nUpdated Type runtime benchmark baseline\n");
} else if (!existingBaseline) {
  throw new Error(
    `Type runtime benchmark cannot check regressions because no baseline matches this environment. Add this entry to bench/type-runtime/baselines.json:\n${JSON.stringify(nextBaseline, null, 2)}`,
  );
}
