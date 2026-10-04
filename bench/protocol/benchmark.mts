import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  array,
  getOrThrow,
  type InferType,
  Int,
  NonNegativeInt,
  nullOr,
  object,
  objectFrom,
  PositiveInt,
  record,
  String,
  Unknown,
} from "@evolu/common";
import { type BenchmarkMode, parseBenchmarkMode } from "../index.mts";
import { materializeBase, parseBaseArgs } from "./base.mts";
import { compareMeasurements, type MetricValue } from "./baseline.mts";
import { spawnChild } from "./child.mts";
import { formatGigabytes, formatTable } from "./format.mts";
import {
  costMetricNames,
  directionMetricNames,
  type ScenarioMeasurement,
  type ScenarioResult,
} from "./workload.mts";

const main = async (): Promise<void> => {
  const { baseRef, otherArgs } = parseBaseArgs(
    process.argv.slice(2),
    "Protocol",
  );
  // parseBenchmarkMode is strict, so --base is removed first.
  const benchmarkMode = parseBenchmarkMode({
    args: otherArgs,
    benchmarkName: "Protocol",
  });

  if (baseRef === null) {
    await runAgainstBaseline(benchmarkMode);
  } else if (benchmarkMode === "default") {
    await compareWithBase(baseRef);
  } else {
    throw new Error(
      `--base never writes baselines, so it cannot be combined with --mode=${benchmarkMode}.`,
    );
  }
};

const repoRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const workloadPath = fileURLToPath(new URL("workload.mts", import.meta.url));
const baselinesUrl = new URL("baselines.json", import.meta.url);

/**
 * Bump when the harness changes what a metric counts, or adds or removes a
 * metric.
 */
const protocolBenchmarkSuiteVersion = PositiveInt.orThrow(1);

const ProtocolBenchmarkSideWorkload = object({
  rows: NonNegativeInt,
  changeBytes: NonNegativeInt,
  sha256: String,
});

const ProtocolBenchmarkDirection = object(
  objectFrom(directionMetricNames, () => NonNegativeInt),
);

const ProtocolBenchmarkMeasurement = object({
  workload: object({
    rangesMaxSize: nullOr(PositiveInt),
    pushMessages: NonNegativeInt,
    client: ProtocolBenchmarkSideWorkload,
    relay: ProtocolBenchmarkSideWorkload,
  }),
  outcome: String,
  cost: object(objectFrom(costMetricNames, () => NonNegativeInt)),
  diagnostics: object({
    request: ProtocolBenchmarkDirection,
    response: ProtocolBenchmarkDirection,
    client: record(String, Int),
    relay: record(String, Int),
    changeTooLargeReports: NonNegativeInt,
    framesSha256: String,
  }),
});

/**
 * Entries of other suite versions may have another metric shape, so only the
 * entry of {@link protocolBenchmarkSuiteVersion} is validated, with
 * {@link ProtocolBenchmarkMeasurements}.
 */
const ProtocolBenchmarkBaselines = object({
  baselines: array(
    object({ suiteVersion: PositiveInt, measurements: Unknown }),
  ),
});

const ProtocolBenchmarkMeasurements = record(
  String,
  ProtocolBenchmarkMeasurement,
);

const ProtocolBenchmarkChildResult = object({
  results: array(
    object({
      name: String,
      measurement: ProtocolBenchmarkMeasurement,
      violations: array(String),
      durationMs: NonNegativeInt,
    }),
  ),
  canaryMismatches: nullOr(array(String)),
  maxRssKiB: NonNegativeInt,
});
interface ProtocolBenchmarkChildResult extends InferType<
  typeof ProtocolBenchmarkChildResult
> {}

/**
 * Runs the working tree with the determinism canary and compares it with the
 * baseline of {@link protocolBenchmarkSuiteVersion}.
 */
const runAgainstBaseline = async (mode: BenchmarkMode): Promise<void> => {
  const existingBaseline = getOrThrow(
    ProtocolBenchmarkBaselines.fromUnknown(
      JSON.parse(await readFile(baselinesUrl, "utf8")),
    ),
  ).baselines.find(
    (baseline) => baseline.suiteVersion === protocolBenchmarkSuiteVersion,
  );
  const existingMeasurements =
    existingBaseline === undefined
      ? undefined
      : getOrThrow(
          ProtocolBenchmarkMeasurements.fromUnknown(
            existingBaseline.measurements,
          ),
        );

  print("Protocol benchmark: the working tree, then the determinism canary\n");
  const child = await runChild(repoRoot, true);
  print(`\nPeak RSS ${formatGigabytes(child.maxRssKiB)}.\n\n`);
  print(
    formatTable(
      ["scenario", "outcome", ...costMetricNames],
      child.results.map(({ name, measurement }) => [
        name,
        measurement.outcome,
        ...costMetricNames.map((metric) =>
          formatValue(measurement.cost[metric]),
        ),
      ]),
    ),
  );

  const integrityFailures = [
    ...child.results.flatMap(({ name, violations }) =>
      violations.map((violation) => `${name}: ${violation}`),
    ),
    ...(child.canaryMismatches ?? []).map(
      (name) =>
        `${name}: nondeterministic metrics, the canary run measured something else`,
    ),
  ];
  if (integrityFailures.length > 0) {
    throw new Error(
      `The Protocol benchmark failed its integrity checks, so no result is compared or written:\n${integrityFailures.join("\n")}`,
    );
  }

  const measurements = Object.fromEntries(
    child.results.map(({ name, measurement }) => [name, measurement]),
  );
  const nextBaseline = {
    suiteVersion: protocolBenchmarkSuiteVersion,
    measurements,
  };

  if (existingMeasurements === undefined) {
    if (mode === "default") {
      throw new Error(
        `No Protocol benchmark baseline matches suite version ${protocolBenchmarkSuiteVersion}. Run "pnpm bench:protocol --mode=update-baseline" or add this entry to bench/protocol/baselines.json:\n${JSON.stringify(nextBaseline, null, 2)}`,
      );
    }
    print("\nNo Protocol benchmark baseline matches; creating one.\n");
  } else {
    const comparison = compareMeasurements(measurements, existingMeasurements);
    if (comparison.scenarioChanges.length > 0) {
      print(`\nScenario changes: ${comparison.scenarioChanges.join(", ")}.\n`);
    }
    if (comparison.changes.length > 0) {
      print("\nChanges from the baseline:\n");
      for (const scenario of unique(
        comparison.changes.map((change) => change.scenario),
      )) {
        print(`\n  ${scenario}\n`);
        print(
          formatTable(
            ["", "baseline", "current", "change", ""],
            comparison.changes
              .filter((change) => change.scenario === scenario)
              .map((change) => [
                change.metric,
                formatValue(change.baseline),
                formatValue(change.current),
                typeof change.baseline === "number" &&
                typeof change.current === "number"
                  ? formatDelta(change.current - change.baseline)
                  : "",
                comparison.regressions.includes(change)
                  ? "regression"
                  : comparison.improvements.includes(change)
                    ? "improvement"
                    : "",
              ]),
            "    ",
          ),
        );
      }
    }
    const regressions = comparison.regressions.map(
      (change) =>
        `${change.scenario} ${change.metric} ${formatValue(change.baseline)} → ${formatValue(change.current)}`,
    );

    if (mode === "default") {
      if (comparison.scenarioChanges.length > 0) {
        throw new Error(
          `The Protocol benchmark scenarios differ from the baseline (${comparison.scenarioChanges.join(", ")}). Review them and run "pnpm bench:protocol --mode=update-baseline".`,
        );
      }
      if (comparison.workloadChanges.length > 0) {
        throw new Error(
          `The Protocol benchmark workload differs from the baseline in ${unique(comparison.workloadChanges.map((change) => change.scenario)).join(", ")}. Review it and run "pnpm bench:protocol --mode=update-baseline".`,
        );
      }
      if (regressions.length > 0) {
        throw new Error(`Protocol cost regression: ${regressions.join(", ")}.`);
      }
      print(
        comparison.improvements.length > 0
          ? `\nProtocol benchmark passed with ${comparison.improvements.length} lower cost metrics. Run "pnpm bench:protocol --mode=update-baseline" to lock them in.\n`
          : comparison.changes.length > 0
            ? '\nProtocol benchmark passed; only diagnostics changed. Run "pnpm bench:protocol --mode=update-baseline" to record them.\n'
            : "\nProtocol benchmark passed; all metrics match the baseline.\n",
      );
    } else if (regressions.length > 0) {
      if (mode === "update-baseline") {
        throw new Error(
          `Protocol cost regression: ${regressions.join(", ")}. Use --mode=force-update-baseline only for an understood and intentional regression.`,
        );
      }
      print(
        `\nForcing the Protocol benchmark baseline update despite cost increases: ${regressions.join(", ")}.\n`,
      );
    }
  }

  if (mode === "default") return;
  // Entries of other suite versions are dropped.
  await writeFile(
    baselinesUrl,
    `${JSON.stringify({ baselines: [nextBaseline] }, null, 2)}\n`,
  );
  print("\nUpdated the Protocol benchmark baseline.\n");
};

/**
 * Runs `ref` and the working tree in separate child processes and prints them
 * side by side. Only an invariant violation in the working tree fails.
 */
const compareWithBase = async (ref: string): Promise<void> => {
  const base = materializeBase(ref);
  print(
    base.created
      ? `Extracted ${ref} into ${relative(repoRoot, base.root)}.\n`
      : `Reusing the ${ref} snapshot.\n`,
  );
  const baseLabel = `${ref} (${base.sha.slice(0, 9)})`;
  print(
    `Protocol benchmark: ${baseLabel} against the working tree. Baselines are neither read nor written.\n\n${baseLabel} from ${relative(repoRoot, base.root)}\n`,
  );
  const baseResult = await runChild(base.root, false);
  print("\nWorking tree\n");
  const workingResult = await runChild(repoRoot, false);
  print(
    `\nPeak RSS: base ${formatGigabytes(baseResult.maxRssKiB)}, working tree ${formatGigabytes(workingResult.maxRssKiB)}.\n`,
  );

  const baseByName = new Map(
    baseResult.results.map((result) => [result.name, result]),
  );
  const pairs = workingResult.results.flatMap((working) => {
    const base = baseByName.get(working.name);
    return base === undefined ? [] : [{ base, working }];
  });
  const onlyOneSide = [
    ...workingResult.results.filter((result) => !baseByName.has(result.name)),
    ...baseResult.results.filter(
      (result) =>
        !workingResult.results.some(({ name }) => name === result.name),
    ),
  ].map(({ name }) => name);

  const isSameOutcome = ({ base, working }: ScenarioPair) =>
    base.measurement.outcome === working.measurement.outcome;
  const isSameWorkload = ({ base, working }: ScenarioPair) =>
    JSON.stringify(base.measurement.workload) ===
    JSON.stringify(working.measurement.workload);
  const isSameFrames = ({ base, working }: ScenarioPair) =>
    base.measurement.diagnostics.framesSha256 ===
    working.measurement.diagnostics.framesSha256;

  for (const pair of pairs) {
    const { base: baseScenario, working } = pair;
    const rows = sideBySideMetrics.map(([label, read]) => {
      const baseValue = read(baseScenario.measurement);
      const workingValue = read(working.measurement);
      return [
        label,
        formatValue(baseValue),
        formatValue(workingValue),
        typeof baseValue === "number" && typeof workingValue === "number"
          ? formatDelta(workingValue - baseValue)
          : baseValue === workingValue
            ? ""
            : "differs",
      ];
    });
    const isSameMetrics = rows.every(([, baseValue, workingValue]) =>
      Object.is(baseValue, workingValue),
    );
    const labels = [
      ...(isSameOutcome(pair) ? [] : ["OUTCOME DIFFERS"]),
      ...(isSameWorkload(pair) ? [] : ["WORKLOAD DIFFERS"]),
      isSameFrames(pair) ? "same frames" : "frames differ",
      ...(isSameMetrics
        ? [`same metrics, ${working.measurement.outcome}`]
        : []),
    ];
    print(`\n== ${working.name} [${labels.join(", ")}]\n`);
    if (!isSameMetrics) {
      print(formatTable(["", baseLabel, "working tree", "change"], rows));
    }
    for (const [label, violations] of [
      [baseLabel, baseScenario.violations],
      ["working tree", working.violations],
    ] as const) {
      for (const violation of violations) {
        print(`  ${label} violates: ${violation}\n`);
      }
    }
  }

  const namesOf = (selected: ReadonlyArray<ScenarioPair>) =>
    selected.map(({ working }) => working.name).join(", ") || "none";
  const comparable = pairs.filter(
    (pair) => isSameOutcome(pair) && isSameWorkload(pair),
  );
  print(
    `\nSummary of ${pairs.length} scenarios\n  Same frames: ${pairs.filter(isSameFrames).length}\n  Outcome differs: ${namesOf(pairs.filter((pair) => !isSameOutcome(pair)))}\n  Workload differs: ${namesOf(pairs.filter((pair) => !isSameWorkload(pair)))}\n${onlyOneSide.length > 0 ? `  Only on one side: ${onlyOneSide.join(", ")}\n` : ""}\nWorking tree cost against the base in the ${comparable.length} scenarios with the same outcome and workload:\n`,
  );
  print(
    formatTable(
      ["metric", "lower", "same", "higher"],
      costMetricNames.map((metric) => {
        const deltas = comparable.map(
          ({ base, working }) =>
            working.measurement.cost[metric] - base.measurement.cost[metric],
        );
        return [
          metric,
          ...[
            deltas.filter((delta) => delta < 0),
            deltas.filter((delta) => delta === 0),
            deltas.filter((delta) => delta > 0),
          ].map(({ length }) => globalThis.String(length)),
        ];
      }),
    ),
  );

  const workingViolations = workingResult.results.flatMap(
    ({ name, violations }) =>
      violations.map((violation) => `${name}: ${violation}`),
  );
  if (workingViolations.length > 0) {
    throw new Error(
      `The working tree violates Protocol benchmark invariants:\n${workingViolations.join("\n")}`,
    );
  }
};

interface ScenarioPair {
  readonly base: ScenarioResult;
  readonly working: ScenarioResult;
}

/** Labels and readers of the metrics a base comparison prints. */
const sideBySideMetrics: ReadonlyArray<
  readonly [string, (measurement: ScenarioMeasurement) => number | string]
> = [
  ["outcome", (measurement) => measurement.outcome],
  ...costMetricNames.map(
    (metric) =>
      [
        metric,
        (measurement: ScenarioMeasurement) => measurement.cost[metric],
      ] as const,
  ),
  ...(["request", "response"] as const).flatMap((direction) =>
    (
      [
        "bytes",
        "maxFrameBytes",
        "maxRangesBytes",
        "messages",
        "fingerprintRanges",
        "timestampsRanges",
      ] as const
    ).map(
      (metric) =>
        [
          `${direction}.${metric}`,
          (measurement: ScenarioMeasurement) =>
            measurement.diagnostics[direction][metric],
        ] as const,
    ),
  ),
  ...(["client", "relay"] as const).flatMap((side) =>
    (["readDbChange", "unsentReads", "iterateRows"] as const).map(
      (metric) =>
        [
          `${side}.${metric}`,
          (measurement: ScenarioMeasurement) =>
            measurement.diagnostics[side][metric] ?? 0,
        ] as const,
    ),
  ),
  [
    "changeTooLargeReports",
    (measurement) => measurement.diagnostics.changeTooLargeReports,
  ],
];

/**
 * Runs the workload in a child process for `root`. Each source root needs its
 * own process: Evolu sentinels, polyfills, and peak RSS are per process.
 */
const runChild = async (
  root: string,
  canary: boolean,
): Promise<ProtocolBenchmarkChildResult> => {
  const message = await spawnChild({
    script: workloadPath,
    args: [root, ...(canary ? ["--canary"] : [])],
    cwd: repoRoot,
    label: `Protocol benchmark child for ${root}`,
  });
  const result = ProtocolBenchmarkChildResult.fromUnknown(message);
  if (!result.ok) {
    throw new Error(
      `The Protocol benchmark child for ${root} sent an invalid result: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
};

const formatValue = (value: MetricValue | undefined): string =>
  value === undefined
    ? "-"
    : value === null
      ? "default"
      : typeof value === "number"
        ? value.toLocaleString("en-US")
        : value;

const formatDelta = (delta: number): string =>
  delta === 0 ? "" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-US")}`;

const unique = <T,>(values: ReadonlyArray<T>): ReadonlyArray<T> => [
  ...new Set(values),
];

const print = (text: string): void => {
  process.stdout.write(text);
};

await main();
