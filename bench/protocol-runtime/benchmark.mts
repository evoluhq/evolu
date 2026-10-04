import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { availableParallelism, cpus, loadavg } from "node:os";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  array,
  getOrThrow,
  type InferType,
  NonNegativeInt,
  nullOr,
  object,
  PositiveInt,
  record,
  String,
  union,
  Unknown,
} from "@evolu/common";
import { type BenchmarkMode, parseBenchmarkMode } from "../index.mts";
import { materializeBase, parseBaseArgs } from "../protocol/base.mts";
import { spawnChild } from "../protocol/child.mts";
import { formatGigabytes, formatTable } from "../protocol/format.mts";
import {
  combineWorkloadHashes,
  compareWithBaseline,
  estimateEndToEndMs,
  fastestByMetric,
  formatChange,
  isBaseFirst,
  isLoadHigh,
  maxRegressionPercent,
  metricOf,
  networkProfiles,
  ratioVerdict,
  sameValue,
  slowerRatio,
  summarizeRatios,
  type Work,
  workDifferences,
} from "./timing.mts";
import {
  type CaseName,
  caseNames,
  type CaseResult,
  isReconcileScenarioName,
  type Metrics,
  microNames,
  reconcileScenarioNames,
} from "./workload.mts";

const main = async (): Promise<void> => {
  const { baseRef, otherArgs } = parseBaseArgs(
    process.argv.slice(2),
    "Protocol runtime",
  );
  // parseBenchmarkMode is strict, so --base is removed first.
  const benchmarkMode = parseBenchmarkMode({
    args: otherArgs,
    benchmarkName: "Protocol runtime",
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

const repeatCount = 5;
const pairCount = 5;

const repoRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const childPath = fileURLToPath(new URL("child.mts", import.meta.url));
const baselinesUrl = new URL("baselines.json", import.meta.url);

/**
 * Harness modules whose code runs inside measured regions: the clocks, the
 * in-memory storage, the sync driver, the micro benchmark calls, and the PRNG
 * that draws SQLite skiplist levels.
 */
const harnessModulePaths = [
  "measure.mts",
  "memoryStorage.mts",
  "micro.mts",
  "reconcile.mts",
  "../protocol/scenarios.mts",
];

const ProtocolRuntimeBenchmarkCaseResult = object({
  name: String,
  workloadSha256: String,
  sqliteVersion: nullOr(String),
  work: record(String, union(NonNegativeInt, String)),
  cpuNs: record(String, NonNegativeInt),
  reportedCpuNs: record(String, NonNegativeInt),
  wallNs: record(String, NonNegativeInt),
  passes: PositiveInt,
  maxRssKiB: NonNegativeInt,
});

const ProtocolRuntimeBenchmarkEnvironment = object({
  platform: String,
  arch: String,
  cpu: String,
  nodeVersion: String,
  sqliteVersion: String,
  repeatCount: PositiveInt,
  // Results are comparable only for the same generated inputs.
  workloadSha256: String,
  // And for the same harness code inside the measured regions.
  harnessSha256: String,
});
interface ProtocolRuntimeBenchmarkEnvironment extends InferType<
  typeof ProtocolRuntimeBenchmarkEnvironment
> {}

const ProtocolRuntimeBenchmarkBaseline = object({
  environment: ProtocolRuntimeBenchmarkEnvironment,
  /** Gated thread CPU times. */
  measurementsNs: record(String, PositiveInt),
  /** Thread CPU times with SQLite, printed against the baseline only. */
  reportedNs: record(String, PositiveInt),
});
interface ProtocolRuntimeBenchmarkBaseline extends InferType<
  typeof ProtocolRuntimeBenchmarkBaseline
> {}

const ProtocolRuntimeBenchmarkBaselines = object({
  baselines: array(ProtocolRuntimeBenchmarkBaseline),
});
interface ProtocolRuntimeBenchmarkBaselines extends InferType<
  typeof ProtocolRuntimeBenchmarkBaselines
> {}

/**
 * Measures every case in a fresh child process per case and repeat, keeps each
 * metric's fastest result, and compares it with the exact-environment
 * baseline.
 */
const runAgainstBaseline = async (mode: BenchmarkMode): Promise<void> => {
  // An entry written before an environment key was added cannot match, so it
  // is skipped rather than failing the run, and an update drops it.
  const baselines = getOrThrow(
    object({ baselines: array(Unknown) }).fromUnknown(
      JSON.parse(await readFile(baselinesUrl, "utf8")),
    ),
  ).baselines.flatMap((entry) => {
    const baseline = ProtocolRuntimeBenchmarkBaseline.fromUnknown(entry);
    return baseline.ok ? [baseline.value] : [];
  });

  print(
    `Protocol runtime benchmark: ${caseNames.length} cases, ${repeatCount} repeats, each case in a fresh child process\n`,
  );
  const wasBusyAtStart = printLoad("Start");

  const resultsByRepeat: Array<ReadonlyArray<CaseResult>> = [];
  // Each repeat measures every case once, so a short burst of machine load
  // slows at most one of the repeats a metric keeps the fastest of.
  for (let repeat = 1; repeat <= repeatCount; repeat++) {
    progress(`\n# Repeat ${repeat} of ${repeatCount}\n`);
    const results: Array<CaseResult> = [];
    for (const name of caseNames) {
      const result = await runCase(repoRoot, name);
      progress(formatProgress("", result));
      results.push(result);
    }
    resultsByRepeat.push(results);
  }
  const wasBusy = printLoad("End") || wasBusyAtStart;

  const resultsOf = (name: CaseName) =>
    resultsByRepeat.map((results) => {
      const result = results.find((candidate) => candidate.name === name);
      if (result === undefined) throw new Error(`${name} has no result.`);
      return result;
    });
  const workloadHashes = caseNames.map(
    (name) =>
      [
        name,
        sameValue(
          `The workload of ${name}`,
          resultsOf(name).map(({ workloadSha256 }) => workloadSha256),
        ),
      ] as const,
  );
  // The work must not change between repeats.
  for (const name of caseNames) sameWork(resultsOf(name));
  const sqliteVersion = sameValue(
    "The SQLite version",
    resultsByRepeat
      .flat()
      .flatMap(({ sqliteVersion }) =>
        sqliteVersion === null ? [] : [sqliteVersion],
      ),
  );

  const merge = (pick: (result: CaseResult) => Metrics) =>
    fastestByMetric(
      resultsByRepeat.map((results): Metrics =>
        Object.fromEntries(
          results.flatMap((result) => Object.entries(pick(result))),
        ),
      ),
    );
  const cpuNs = merge(({ cpuNs }) => cpuNs);
  const reportedNs = merge(({ reportedCpuNs }) => reportedCpuNs);
  const wallNs = merge(({ wallNs }) => wallNs);
  const maxRssKiB = Math.max(
    ...resultsByRepeat.flat().map((result) => result.maxRssKiB),
  );

  const harnessHash = createHash("sha256");
  for (const path of harnessModulePaths) {
    const source = await readFile(new URL(path, import.meta.url));
    harnessHash.update(`${path}\n${source.length}\n`).update(source);
  }
  const environment: ProtocolRuntimeBenchmarkEnvironment = getOrThrow(
    ProtocolRuntimeBenchmarkEnvironment.fromUnknown({
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
      nodeVersion: process.versions.node,
      sqliteVersion,
      repeatCount,
      workloadSha256: combineWorkloadHashes(workloadHashes),
      harnessSha256: harnessHash.digest("hex"),
    }),
  );
  const existingBaseline = baselines.find((baseline) =>
    (
      Object.keys(environment) as Array<
        keyof ProtocolRuntimeBenchmarkEnvironment
      >
    ).every((key) => baseline.environment[key] === environment[key]),
  );

  print(
    `\n${environment.cpu}; ${environment.platform} ${environment.arch}; Node ${environment.nodeVersion}; SQLite ${environment.sqliteVersion}; peak child RSS ${formatGigabytes(maxRssKiB)}\n`,
  );
  print(
    existingBaseline === undefined
      ? "No baseline matches this environment.\n"
      : `Results are the fastest of ${repeatCount} repeats, against the matching baseline.\n`,
  );

  const changeOf = (
    metric: string,
    values: Readonly<Record<string, number>>,
    baselineValues: Readonly<Partial<Record<string, number>>> | undefined,
  ) => {
    const baselineNs = baselineValues?.[metric];
    return baselineNs === undefined
      ? ""
      : formatChange(values[metric], baselineNs);
  };

  print(
    `\nReconcile scenarios against in-memory storage: protocol-only thread CPU time, gated at ${maxRegressionPercent}%\n`,
  );
  print(
    formatTable(
      [
        "scenario",
        "relay",
        "change",
        "client",
        "change",
        "relay wall",
        "client wall",
      ],
      reconcileScenarioNames.map((name) => [
        name,
        formatMs(cpuNs[`${name}.relay`]),
        changeOf(`${name}.relay`, cpuNs, existingBaseline?.measurementsNs),
        formatMs(cpuNs[`${name}.client`]),
        changeOf(`${name}.client`, cpuNs, existingBaseline?.measurementsNs),
        formatMs(wallNs[`${name}.relay`]),
        formatMs(wallNs[`${name}.client`]),
      ]),
    ),
  );

  print(
    "\nThe same scenarios against SQLite relay storage on both sides: fastest of 3 skiplist topologies, reported only\n",
  );
  print(
    formatTable(
      [
        "scenario",
        "relay",
        "change",
        "client",
        "change",
        "rounds",
        "up bytes",
        "down bytes",
        ...networkProfiles.map(({ name }) => name),
      ],
      reconcileScenarioNames.map((name) => {
        const work = sameWork(resultsOf(name));
        return [
          name,
          formatMs(reportedNs[`${name}.sqliteRelay`]),
          changeOf(
            `${name}.sqliteRelay`,
            reportedNs,
            existingBaseline?.reportedNs,
          ),
          formatMs(reportedNs[`${name}.sqliteClient`]),
          changeOf(
            `${name}.sqliteClient`,
            reportedNs,
            existingBaseline?.reportedNs,
          ),
          formatCount(work.rounds),
          formatCount(work.upBytes),
          formatCount(work.downBytes),
          ...networkProfiles.map(
            (profile) =>
              `${(
                estimateEndToEndMs(
                  {
                    rounds: Number(work.rounds),
                    upBytes: Number(work.upBytes),
                    downBytes: Number(work.downBytes),
                    cpuNs:
                      reportedNs[`${name}.sqliteRelay`] +
                      reportedNs[`${name}.sqliteClient`],
                  },
                  profile,
                ) / 1_000
              ).toFixed(2)} s`,
          ),
        ];
      }),
    ),
  );
  print(
    "  The last columns estimate a sync: rounds times the round trip, plus each direction's bytes at its bandwidth, plus both sides' CPU time with SQLite.\n",
  );
  print(
    `  ${networkProfiles.map(({ name, rttMs, downMbitPerSecond, upMbitPerSecond }) => `${name}: ${rttMs} ms round trip, ${downMbitPerSecond} Mbit/s down, ${upMbitPerSecond} Mbit/s up`).join("; ")}.\n`,
  );

  print(
    `\nMicro benchmarks: thread CPU time per call, gated at ${maxRegressionPercent}%\n`,
  );
  print(
    formatTable(
      ["benchmark", "per call", "change", "wall"],
      microNames.map((name) => [
        name,
        formatMs(cpuNs[name]),
        changeOf(name, cpuNs, existingBaseline?.measurementsNs),
        formatMs(wallNs[name]),
      ]),
    ),
  );

  const nextBaseline: ProtocolRuntimeBenchmarkBaseline = getOrThrow(
    ProtocolRuntimeBenchmarkBaseline.fromUnknown({
      environment,
      measurementsNs: cpuNs,
      reportedNs,
    }),
  );

  if (existingBaseline === undefined) {
    if (mode === "default") {
      throw new Error(
        `Protocol runtime benchmark cannot check regressions because no baseline matches this environment. Run "pnpm bench:protocol-runtime --mode=update-baseline" on an idle machine or add this entry to bench/protocol-runtime/baselines.json:\n${JSON.stringify(nextBaseline, null, 2)}`,
      );
    }
    print("\nNo baseline matches this environment; creating one.\n");
  } else {
    const comparison = compareWithBaseline(
      cpuNs,
      existingBaseline.measurementsNs,
    );
    if (comparison.added.length > 0 || comparison.removed.length > 0) {
      const otherMetrics = `added ${comparison.added.join(", ") || "none"}, removed ${comparison.removed.join(", ") || "none"}`;
      if (mode === "default") {
        throw new Error(
          `The matching baseline has other metrics: ${otherMetrics}. Run "pnpm bench:protocol-runtime --mode=update-baseline" on an idle machine to replace it.`,
        );
      }
      print(`\nThe matching baseline has other metrics: ${otherMetrics}.\n`);
    }
    const regressions = comparison.regressions.map(
      ({ metric, baselineNs, currentNs }) =>
        `${metric} ${formatChange(currentNs, baselineNs)}`,
    );
    if (regressions.length === 0) {
      print(
        `\nProtocol runtime benchmark passed (maximum regression ${maxRegressionPercent}%).\n`,
      );
    } else if (mode === "force-update-baseline") {
      print(
        `\nForcing the Protocol runtime baseline update despite regressions over ${maxRegressionPercent}%: ${regressions.join(", ")}\n`,
      );
    } else {
      throw new Error(
        `Protocol runtime regression over ${maxRegressionPercent}%: ${regressions.join(", ")}.${wasBusy ? " The machine was busy, so rerun on an idle machine, or compare commits with --base." : ""}${mode === "update-baseline" ? " Use --mode=force-update-baseline only for an understood and intentional regression." : ""}`,
      );
    }
  }

  if (mode === "default") return;
  const nextBaselines = existingBaseline
    ? baselines.map((baseline) =>
        baseline === existingBaseline ? nextBaseline : baseline,
      )
    : [...baselines, nextBaseline];
  await writeFile(
    baselinesUrl,
    `${JSON.stringify({ baselines: nextBaselines } satisfies ProtocolRuntimeBenchmarkBaselines, null, 2)}\n`,
  );
  print("\nUpdated the Protocol runtime benchmark baseline.\n");
};

/**
 * Runs `ref` and the working tree in pairs of child processes per case and
 * compares their paired ratios. It fails when a gated metric's median ratio
 * exceeds the threshold.
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
    `Protocol runtime benchmark: ${baseLabel} against the working tree, ${pairCount} pairs of child processes per case in ABBA order. Baselines are neither read nor written.\n`,
  );
  printLoad("Start");

  const pairsByCase = new Map<
    CaseName,
    Array<{ readonly base: CaseResult; readonly head: CaseResult }>
  >();
  for (let pair = 0; pair < pairCount; pair++) {
    progress(
      `\n# Pair ${pair + 1} of ${pairCount}: ${isBaseFirst(pair) ? "base first" : "working tree first"}\n`,
    );
    for (const name of caseNames) {
      const runSide = async (side: "base" | "head") => {
        const result = await runCase(
          side === "base" ? base.root : repoRoot,
          name,
        );
        progress(formatProgress(side === "base" ? "base " : "head ", result));
        return result;
      };
      let baseResult: CaseResult;
      let headResult: CaseResult;
      if (isBaseFirst(pair)) {
        baseResult = await runSide("base");
        headResult = await runSide("head");
      } else {
        headResult = await runSide("head");
        baseResult = await runSide("base");
      }
      const pairs = pairsByCase.get(name) ?? [];
      pairs.push({ base: baseResult, head: headResult });
      pairsByCase.set(name, pairs);
    }
  }
  printLoad("End");

  const failures: Array<string> = [];
  const verdictCounts = { faster: 0, same: 0, slower: 0, regression: 0 };
  const workloadDiffers: Array<string> = [];
  const differentWork: Array<string> = [];

  print(
    `\nRatios are working tree / base thread CPU time: the median of ${pairCount} paired child processes, then [min..max]. A median from ${slowerRatio.toFixed(2)} is slower, and above ${(1 + maxRegressionPercent / 100).toFixed(2)} fails a gated metric.\n`,
  );
  for (const name of caseNames) {
    const pairs = pairsByCase.get(name) ?? [];
    const baseResults = pairs.map((pair) => pair.base);
    const headResults = pairs.map((pair) => pair.head);
    const isSameWorkload =
      sameValue(
        `The ${ref} workload of ${name}`,
        baseResults.map(({ workloadSha256 }) => workloadSha256),
      ) ===
      sameValue(
        `The working tree workload of ${name}`,
        headResults.map(({ workloadSha256 }) => workloadSha256),
      );
    const baseWork = sameWork(baseResults);
    const headWork = sameWork(headResults);
    const differences = workDifferences(baseWork, headWork);
    if (!isSameWorkload) workloadDiffers.push(name);
    if (differences.length > 0) differentWork.push(name);
    const labels = [
      ...(isSameWorkload ? [] : ["WORKLOAD DIFFERS, not gated"]),
      differences.length > 0 ? "different work" : "same work",
    ];
    print(`\n== ${name} [${labels.join(", ")}]\n`);

    const workRows = isReconcileScenarioName(name)
      ? [
          ...["rounds", "upBytes", "downBytes"].map((key) => [
            key,
            formatWorkValue(baseWork[key]),
            formatWorkValue(headWork[key]),
          ]),
          ...(["relay", "client"] as const).map((side) => [
            `${side} storage calls`,
            formatCount(storageCalls(baseWork, side)),
            formatCount(storageCalls(headWork, side)),
          ]),
          ...differences
            .filter((key) => key.includes("."))
            .map((key) => [
              key,
              formatWorkValue(baseWork[key]),
              formatWorkValue(headWork[key]),
            ]),
          ...(differences.includes("framesSha256")
            ? [["frames", "", "differ"]]
            : []),
        ]
      : differences.map((key) => [
          key,
          formatWorkValue(baseWork[key]),
          formatWorkValue(headWork[key]),
        ]);
    if (workRows.length > 0) {
      print(formatTable(["", baseLabel, "working tree"], workRows));
    }

    const metricRows = [
      ...Object.keys(headResults[0]?.cpuNs ?? {}).map(
        (metric) => [metric, true] as const,
      ),
      ...Object.keys(headResults[0]?.reportedCpuNs ?? {}).map(
        (metric) => [metric, false] as const,
      ),
    ].map(([metric, isGated]) => {
      const read = (result: CaseResult) =>
        metricOf(isGated ? result.cpuNs : result.reportedCpuNs, metric);
      const summary = summarizeRatios(
        pairs.map((pair) => ({ base: read(pair.base), head: read(pair.head) })),
      );
      const verdict = ratioVerdict(summary.median);
      // A metric gates only when both versions measured the same workload.
      const gates = isGated && isSameWorkload;
      if (gates) {
        verdictCounts[verdict]++;
        if (verdict === "regression") {
          failures.push(`${metric} ${summary.median.toFixed(3)}`);
        }
      }
      const label =
        verdict === "same"
          ? ""
          : verdict === "regression"
            ? `over ${maxRegressionPercent}%`
            : verdict;
      return [
        metric,
        formatMs(Math.min(...baseResults.map(read))),
        formatMs(Math.min(...headResults.map(read))),
        `${summary.median.toFixed(3)} [${summary.min.toFixed(3)}..${summary.max.toFixed(3)}]`,
        gates
          ? verdict === "regression"
            ? `FAILS, ${label}`
            : label
          : label === ""
            ? "not gated"
            : `${label}, not gated`,
      ];
    });
    print(
      formatTable(
        ["", `${baseLabel} fastest`, "working tree fastest", "ratio", ""],
        metricRows,
      ),
    );
  }

  print(
    `\nSummary of the gated metrics with the same workload: ${verdictCounts.faster} faster, ${verdictCounts.same} within ${((slowerRatio - 1) * 100).toFixed(0)}%, ${verdictCounts.slower} slower below the threshold, ${verdictCounts.regression} over it.\n`,
  );
  print(`  Different work: ${differentWork.join(", ") || "none"}\n`);
  if (workloadDiffers.length > 0) {
    print(`  Workload differs: ${workloadDiffers.join(", ")}\n`);
  }
  if (failures.length > 0) {
    throw new Error(
      `The working tree is more than ${maxRegressionPercent}% slower than ${baseLabel}: ${failures.join(", ")}`,
    );
  }
};

/** Runs one case in a fresh child process for the source `root`. */
const runCase = async (root: string, name: CaseName): Promise<CaseResult> => {
  const message = await spawnChild({
    script: childPath,
    args: [root, name],
    cwd: repoRoot,
    label: `Protocol runtime benchmark child for ${name} in ${root}`,
    // The heap cap keeps a child from growing past about 1.5 GB of RSS.
    execArgv: ["--expose-gc", "--max-old-space-size=1024"],
    env: { ...process.env, NODE_ENV: "production" },
  });
  const result = ProtocolRuntimeBenchmarkCaseResult.fromUnknown(message);
  if (!result.ok) {
    throw new Error(
      `The Protocol runtime benchmark child for ${name} in ${root} sent an invalid result: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
};

/** The work every result of a case did, which must not change between runs. */
const sameWork = (results: ReadonlyArray<CaseResult>): Work =>
  JSON.parse(
    sameValue(
      `The work of ${results[0]?.name ?? "a case"}`,
      results.map(({ work }) => JSON.stringify(work)),
    ),
  ) as Work;

const storageCalls = (work: Work, side: "relay" | "client"): number =>
  Object.entries(work)
    .filter(([key]) => key.startsWith(`${side}.`))
    .reduce((sum, [, value]) => sum + Number(value), 0);

const formatProgress = (prefix: string, result: CaseResult): string =>
  `  ${prefix}${result.name.padEnd(34)} ${Object.entries({
    ...result.cpuNs,
    ...result.reportedCpuNs,
  })
    .map(
      ([metric, ns]) =>
        `${metric === result.name ? "call" : metric.slice(result.name.length + 1)} ${formatMs(ns ?? 0)}`,
    )
    .join(
      ", ",
    )}; ${result.passes} measured, ${formatGigabytes(result.maxRssKiB)}\n`;

const formatMs = (ns: number): string => {
  const ms = ns / 1e6;
  return `${ms.toFixed(ms < 10 ? 3 : ms < 100 ? 2 : 1)} ms`;
};

const formatCount = (value: number | string | undefined): string =>
  typeof value === "number" ? value.toLocaleString("en-US") : (value ?? "-");

const formatWorkValue = (value: number | string | undefined): string =>
  typeof value === "string" ? value.slice(0, 12) : formatCount(value);

/** Prints the load average and returns whether it is high. */
const printLoad = (moment: string): boolean => {
  const load = loadavg();
  const logicalCpus = availableParallelism();
  print(
    `${moment} load average ${load.map((value) => value.toFixed(2)).join(", ")} (1, 5, 15 min) on ${logicalCpus} logical CPUs.\n`,
  );
  const isHigh = isLoadHigh(load[0], logicalCpus);
  if (isHigh) {
    print(
      "Warning: the machine is busy. Threads may run on slower cores and results may be slower than on an idle machine.\n",
    );
  }
  return isHigh;
};

const print = (text: string): void => {
  process.stdout.write(text);
};

const progress = (text: string): void => {
  process.stderr.write(text);
};

await main();
