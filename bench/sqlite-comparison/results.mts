/**
 * The results of the SQLite comparison: their Types, which validate what a
 * child process, a web worker or the React Native app returns, the checks of a
 * run against the reference, the statistics, the regression verdict and the
 * Markdown summary. It runs in Node.js only, and everything here is pure, so
 * [`results.test.mts`](./results.test.mts) covers it without running SQLite.
 *
 * @module
 */
import {
  array,
  Boolean,
  type InferType,
  literal,
  NonNegativeInt,
  NonNegativeNumber,
  nullOr,
  object,
  record,
  String,
  union,
} from "@evolu/common";
import { median, summarizeRatios } from "../protocol-runtime/timing.mts";
import { workloads } from "../sqlite-wasm/workload.mts";
import {
  driverOperations,
  driverPointSelectCount,
  driverRowCount,
  driverSelectAllCount,
  encryptionPragmas,
  recordedPragmas,
  type DriverOperation,
} from "./workload.mts";

/** The version of the results' format, bumped when it changes. */
export const resultsFormatVersion = 1;

export const BenchFileSummary = /*#__PURE__*/ object({
  byteLength: NonNegativeInt,
  zeroByteShare: NonNegativeNumber,
  sqliteHeaderOffsets: /*#__PURE__*/ array(NonNegativeInt),
  containsPlaintextMarker: Boolean,
});
export interface BenchFileSummary extends InferType<typeof BenchFileSummary> {}

export const DriverMs = /*#__PURE__*/ object({
  insert: NonNegativeNumber,
  selectByKey: NonNegativeNumber,
  selectAll: NonNegativeNumber,
});
export interface DriverMs extends InferType<typeof DriverMs> {}

/** What `runBench` of `run.mts` returns, as a child, worker or app sends it. */
export const BenchRunOutput = /*#__PURE__*/ object({
  sqliteVersion: String,
  sqliteSourceId: String,
  compileOptions: /*#__PURE__*/ array(String),
  pragmas: /*#__PURE__*/ record(String, String),
  workloadMs: /*#__PURE__*/ array(NonNegativeNumber),
  totalChanges: /*#__PURE__*/ array(NonNegativeInt),
  contentChecksum: /*#__PURE__*/ nullOr(String),
  schemaObjectsAfter: NonNegativeInt,
  file: /*#__PURE__*/ nullOr(BenchFileSummary),
  driverMs: DriverMs,
});
export interface BenchRunOutput extends InferType<typeof BenchRunOutput> {}

/**
 * What every stack must produce, from the same statements run by `node:sqlite`
 * in memory: `total_changes()` after each workload, and the tables' checksum
 * before the last one drops them.
 */
export interface BenchReference {
  readonly totalChanges: ReadonlyArray<number>;
  readonly contentChecksum: string;
}

/** What a run must satisfy besides its stack's definition. */
export interface CheckRunOptions {
  readonly reference: BenchReference;
  readonly encrypted: boolean;
  /** The first run of the stack, whose pragmas every later run must have. */
  readonly first: BenchRunOutput | null;
}

// Ciphertext has about 1/256 zero bytes. A plaintext file after these
// workloads has several percent, and with secure_delete almost only zeros.
const maxEncryptedZeroByteShare = 0.01;

/**
 * Checks that a run did all the work its reference did, that an encrypted
 * stack's file is ciphertext and a plain one's plaintext SQLite, and that its
 * pragmas are those of the stack's first run. It throws an error that says what
 * differs.
 */
export const checkRun = (
  output: BenchRunOutput,
  { reference, encrypted, first }: CheckRunOptions,
): void => {
  if (output.workloadMs.length !== workloads.length)
    throw new Error(`The run timed ${output.workloadMs.length} workloads.`);
  if (
    output.totalChanges.length !== reference.totalChanges.length ||
    output.totalChanges.some(
      (changes, index) => changes !== reference.totalChanges[index],
    )
  )
    throw new Error(
      `total_changes() after each workload is ${output.totalChanges.join(", ")}, not ${reference.totalChanges.join(", ")}.`,
    );
  if (
    output.contentChecksum != null &&
    output.contentChecksum !== reference.contentChecksum
  )
    throw new Error(
      `The tables' checksum is ${output.contentChecksum}, not ${reference.contentChecksum}.`,
    );
  if (output.schemaObjectsAfter !== 0)
    throw new Error(
      `The last workload left ${output.schemaObjectsAfter} schema objects.`,
    );

  const { file } = output;
  if (file?.byteLength === 0) throw new Error("The database file is empty.");
  if (encrypted) {
    if (file == null)
      throw new Error("The encrypted stack cannot read its file.");
    if (file.sqliteHeaderOffsets.length > 0)
      throw new Error(
        `The encrypted file has SQLite's header at ${file.sqliteHeaderOffsets.join(", ")}.`,
      );
    if (file.zeroByteShare >= maxEncryptedZeroByteShare)
      throw new Error(
        `${(file.zeroByteShare * 100).toFixed(2)}% of the encrypted file's bytes are zeros.`,
      );
    if (file.containsPlaintextMarker)
      throw new Error("The encrypted file contains the workloads' text.");
  } else if (file != null && file.sqliteHeaderOffsets[0] !== 0)
    throw new Error("The plaintext file does not start with SQLite's header.");

  if (
    first != null &&
    JSON.stringify(output.pragmas) !== JSON.stringify(first.pragmas)
  )
    throw new Error("The pragmas differ between runs.");
};

/** The timings of one run of a stack. */
export const RunTimings = /*#__PURE__*/ object({
  /** The round, counting from 0 within warm-up and measured rounds alike. */
  round: NonNegativeInt,
  /** The stack's position in the round's order, counting from 0. */
  position: NonNegativeInt,
  workloadMs: /*#__PURE__*/ array(NonNegativeNumber),
  driverMs: DriverMs,
});
export interface RunTimings extends InferType<typeof RunTimings> {}

export const MeasuredStackResult = /*#__PURE__*/ object({
  type: /*#__PURE__*/ literal("Measured"),
  id: String,
  label: String,
  /** The library and its version, such as `better-sqlite3 13.0.3`. */
  library: String,
  /** How the stack reaches SQLite, its binding and VFS. */
  binding: String,
  encrypted: Boolean,
  sqliteVersion: String,
  sqliteSourceId: String,
  compileOptions: /*#__PURE__*/ array(String),
  pragmas: /*#__PURE__*/ record(String, String),
  warmupRuns: /*#__PURE__*/ array(RunTimings),
  runs: /*#__PURE__*/ array(RunTimings),
});
export interface MeasuredStackResult extends InferType<
  typeof MeasuredStackResult
> {}

export const FailedStackResult = /*#__PURE__*/ object({
  type: /*#__PURE__*/ literal("Failed"),
  id: String,
  label: String,
  library: String,
  binding: String,
  encrypted: Boolean,
  error: String,
});
export interface FailedStackResult extends InferType<
  typeof FailedStackResult
> {}

export const StackResult = /*#__PURE__*/ union(
  MeasuredStackResult,
  FailedStackResult,
);
export type StackResult = InferType<typeof StackResult>;

/** A platform the comparison ran on, such as Node.js on macOS or WebKit. */
export const TargetResult = /*#__PURE__*/ object({
  /** A key such as `node-darwin-arm64` or `web-webkit`. */
  id: String,
  /** The heading of the target's section. */
  label: String,
  /** When the target started. */
  createdAt: String,
  /** Facts that make results comparable, such as the CPU and versions. */
  environment: /*#__PURE__*/ record(String, String),
  /** The 1, 5 and 15 minute load averages before and after, when known. */
  loadAverages: /*#__PURE__*/ nullOr(
    /*#__PURE__*/ object({
      start: /*#__PURE__*/ array(NonNegativeNumber),
      end: /*#__PURE__*/ array(NonNegativeNumber),
    }),
  ),
  /** Notes the summary prints, such as a development build of a stack. */
  notes: /*#__PURE__*/ array(String),
  /** The plain stack of Evolu's SQLite. */
  evoluStackId: String,
  /** The encrypted stack of Evolu's SQLite. */
  evoluEncryptedStackId: String,
  /** The stack the verdict compares Evolu's with. */
  referenceStackId: String,
  stacks: /*#__PURE__*/ array(StackResult),
});
export interface TargetResult extends InferType<typeof TargetResult> {}

export const BenchResults = /*#__PURE__*/ object({
  formatVersion: /*#__PURE__*/ literal(resultsFormatVersion),
  createdAt: String,
  configuration: /*#__PURE__*/ object({
    warmupRounds: NonNegativeInt,
    measuredRounds: NonNegativeInt,
    waSqliteCommit: String,
    /** The SHA-256 of the workloads' SQL. */
    workloadSha256: String,
    pragmas: /*#__PURE__*/ array(String),
  }),
  targets: /*#__PURE__*/ array(TargetResult),
});
export interface BenchResults extends InferType<typeof BenchResults> {}

/** Durations of a stack's measured runs, in milliseconds. */
export interface DurationStats {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export const toDurationStats = (
  values: ReadonlyArray<number>,
): DurationStats => ({
  medianMs: median(values),
  minMs: Math.min(...values),
  maxMs: Math.max(...values),
});

/**
 * A metric of a run: a workload's duration, the total, the total without
 * workload 1, which mostly measures flushes, or a driver operation.
 */
export type Metric =
  | { readonly type: "Workload"; readonly index: number }
  | { readonly type: "Total" }
  | { readonly type: "TotalWithoutFirst" }
  | { readonly type: "Driver"; readonly operation: DriverOperation };

export const metrics: ReadonlyArray<Metric> = [
  .../*#__PURE__*/ workloads.map((_, index): Metric => ({
    type: "Workload",
    index,
  })),
  { type: "Total" },
  { type: "TotalWithoutFirst" },
  .../*#__PURE__*/ driverOperations.map((operation): Metric => ({
    type: "Driver",
    operation,
  })),
];

export const metricMs = (run: RunTimings, metric: Metric): number => {
  switch (metric.type) {
    case "Workload":
      return run.workloadMs[metric.index] ?? Number.NaN;
    case "Total":
      return sum(run.workloadMs);
    case "TotalWithoutFirst":
      return sum(run.workloadMs.slice(1));
    case "Driver":
      return run.driverMs[metric.operation];
  }
};

export const metricLabel = (metric: Metric): string => {
  switch (metric.type) {
    case "Workload":
      return `${metric.index + 1}. ${workloads[metric.index]?.title ?? ""}`;
    case "Total":
      return "Total";
    case "TotalWithoutFirst":
      return "Total without 1";
    case "Driver":
      return driverOperationLabels[metric.operation];
  }
};

const driverOperationLabels: Readonly<Record<DriverOperation, string>> = {
  insert: `${driverRowCount} single-row inserts`,
  selectByKey: `${driverPointSelectCount} point selects`,
  selectAll: `${driverSelectAllCount} reads of ${driverRowCount} rows`,
};

/** How many calls a driver operation makes, to report per call. */
const driverCallCounts: Readonly<Record<DriverOperation, number>> = {
  insert: driverRowCount,
  selectByKey: driverPointSelectCount,
  selectAll: driverSelectAllCount,
};

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const sum = (values: ReadonlyArray<number>): number =>
  values.reduce((total, value) => total + value, 0);

/**
 * A head/base ratio is slower when its median is above this and every round was
 * slower, and faster for the inverse. Separate runs on a machine in use vary by
 * tens of percent, so paired ratios within a round are compared.
 */
export const verdictThreshold = 1.1;

export type Verdict = "Slower" | "Faster" | "Same";

export interface PairedRatio {
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly verdict: Verdict;
}

/**
 * The ratio of a metric of `head` to `base` in each measured round both ran,
 * summarized, or null when they share no round. Runs of the same round ran one
 * after the other, so most load that slows one slows both.
 */
export const pairedRatio = (
  head: MeasuredStackResult,
  base: MeasuredStackResult,
  metric: Metric,
): PairedRatio | null => {
  const pairs = head.runs.flatMap((headRun) => {
    const baseRun = base.runs.find((run) => run.round === headRun.round);
    return baseRun == null
      ? []
      : [{ head: metricMs(headRun, metric), base: metricMs(baseRun, metric) }];
  });
  if (pairs.length === 0) return null;
  const { median, min, max } = summarizeRatios(pairs);
  return {
    median,
    min,
    max,
    verdict:
      median > verdictThreshold && min > 1
        ? "Slower"
        : median < 1 / verdictThreshold && max < 1
          ? "Faster"
          : "Same",
  };
};

/** The metrics Evolu's plain stack is slower in than the reference stack. */
export const findRegressions = (
  target: TargetResult,
): ReadonlyArray<{ readonly metric: Metric; readonly ratio: PairedRatio }> => {
  const evolu = findMeasured(target, target.evoluStackId);
  const reference = findMeasured(target, target.referenceStackId);
  if (evolu == null || reference == null) return [];
  return metrics.flatMap((metric) => {
    const ratio = pairedRatio(evolu, reference, metric);
    return ratio?.verdict === "Slower" ? [{ metric, ratio }] : [];
  });
};

export const findMeasured = (
  target: TargetResult,
  id: string,
): MeasuredStackResult | null => {
  const stack = target.stacks.find((candidate) => candidate.id === id);
  return stack?.type === "Measured" ? stack : null;
};

const formatMs = (ms: number): string =>
  ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2);

const formatStats = ({ medianMs, minMs, maxMs }: DurationStats): string =>
  `${formatMs(medianMs)} (${formatMs(minMs)}–${formatMs(maxMs)})`;

const formatMicroseconds = (ms: number): string => {
  const us = ms * 1000;
  return us >= 100 ? us.toFixed(0) : us >= 10 ? us.toFixed(1) : us.toFixed(2);
};

const formatRatio = (ratio: PairedRatio | null): string =>
  ratio == null
    ? ""
    : `${ratio.median.toFixed(2)} (${ratio.min.toFixed(2)}–${ratio.max.toFixed(2)})`;

const verdictLabels: Readonly<Record<Verdict, string>> = {
  Slower: "slower",
  Faster: "faster",
  Same: "",
};

const formatLoadAverages = (loads: ReadonlyArray<number>): string =>
  loads.map((load) => load.toFixed(2)).join(", ");

const formatPragma = (pragma: string, value: string | undefined): string => {
  if (value == null) return "";
  const names =
    pragma === "synchronous"
      ? ["OFF", "NORMAL", "FULL", "EXTRA"]
      : pragma === "temp_store"
        ? ["DEFAULT", "FILE", "MEMORY"]
        : pragma === "auto_vacuum"
          ? ["NONE", "FULL", "INCREMENTAL"]
          : pragma === "secure_delete"
            ? ["OFF", "ON", "FAST"]
            : null;
  const name = names?.[Number(value)];
  return name == null ? value : `${value} (${name})`;
};

const escapeCell = (text: string): string => text.replaceAll("|", "\\|");

const table = (
  header: ReadonlyArray<string>,
  alignments: ReadonlyArray<"left" | "right">,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<string> => [
  `| ${header.map(escapeCell).join(" | ")} |`,
  `| ${alignments.map((alignment) => (alignment === "right" ? "---:" : "---")).join(" | ")} |`,
  ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
];

/**
 * Checks that the plain stacks of a target ran with the same pragmas, and the
 * encrypted ones with the same but {@link encryptionPragmas}, and returns the
 * pragmas that differ.
 */
export const findPragmaDifferences = (
  target: TargetResult,
): ReadonlyArray<string> => {
  const measured = target.stacks.filter((stack) => stack.type === "Measured");
  const [first] = measured;
  if (first == null) return [];
  return recordedPragmas.filter((pragma) =>
    measured.some(
      (stack) =>
        stack.pragmas[pragma] !== first.pragmas[pragma] &&
        !(
          stack.encrypted !== first.encrypted &&
          encryptionPragmas.includes(pragma)
        ),
    ),
  );
};

/** Formats one target's section of the summary. */
export const formatTarget = (
  target: TargetResult,
  { warmupRounds, measuredRounds }: BenchResults["configuration"],
): string => {
  const measured = target.stacks.filter((stack) => stack.type === "Measured");
  const labels = measured.map((stack) => stack.label);
  const lines: Array<string> = [`## ${target.label}`, ""];

  const environment = Object.entries(target.environment)
    .map(([name, value]) => `${name} ${value}`)
    .join("; ");
  lines.push(`Run ${target.createdAt}. ${environment}.`, "");
  if (target.loadAverages != null)
    lines.push(
      `Load averages: ${formatLoadAverages(target.loadAverages.start)} before, ${formatLoadAverages(target.loadAverages.end)} after.`,
      "",
    );
  for (const note of target.notes) lines.push(`> ${note}`, "");
  for (const stack of target.stacks)
    if (stack.type === "Failed")
      lines.push(`${stack.label} failed: ${stack.error.split("\n")[0]}`, "");
  lines.push(
    `Milliseconds: the median of ${plural(measuredRounds, "measured round")} after ${plural(warmupRounds, "warm-up round")}, with the fastest and slowest run in parentheses.`,
    "",
  );

  const statsOf = (stack: MeasuredStackResult, metric: Metric) =>
    toDurationStats(stack.runs.map((run) => metricMs(run, metric)));

  lines.push(
    "### wa-sqlite's workloads",
    "",
    ...table(
      ["Workload", ...labels],
      ["left", ...labels.map(() => "right" as const)],
      metrics
        .filter((metric) => metric.type !== "Driver")
        .map((metric) => [
          metricLabel(metric),
          ...measured.map((stack) => formatStats(statsOf(stack, metric))),
        ]),
    ),
    "",
    "### Driver workload",
    "",
    "Microseconds per call for the inserts and point selects, and milliseconds per read of every row.",
    "",
    ...table(
      ["Operation", ...labels],
      ["left", ...labels.map(() => "right" as const)],
      driverOperations.map((operation) => {
        const metric: Metric = { type: "Driver", operation };
        return [
          metricLabel(metric),
          ...measured.map((stack) => {
            const stats = statsOf(stack, metric);
            const calls = driverCallCounts[operation];
            return operation === "selectAll"
              ? formatStats({
                  medianMs: stats.medianMs / calls,
                  minMs: stats.minMs / calls,
                  maxMs: stats.maxMs / calls,
                })
              : `${formatMicroseconds(stats.medianMs / calls)} (${formatMicroseconds(stats.minMs / calls)}–${formatMicroseconds(stats.maxMs / calls)})`;
          }),
        ];
      }),
    ),
    "",
  );

  const evolu = findMeasured(target, target.evoluStackId);
  const evoluEncrypted = findMeasured(target, target.evoluEncryptedStackId);
  const reference = findMeasured(target, target.referenceStackId);
  if (evolu != null && reference != null) {
    const regressions = findRegressions(target);
    lines.push(
      `### ${evolu.label} relative to ${reference.label}`,
      "",
      `The median over rounds of ${evolu.label}'s time divided by ${reference.label}'s in the same round, with the range. A ratio is slower or faster when its median is beyond ${verdictThreshold} or its inverse and every round agrees.${evoluEncrypted == null ? "" : ` The last column divides ${evoluEncrypted.label}'s time by ${evolu.label}'s, what encryption costs.`}`,
      "",
      ...table(
        [
          "Metric",
          `${evolu.label} / ${reference.label}`,
          "",
          ...(evoluEncrypted == null
            ? []
            : [`${evoluEncrypted.label} / ${evolu.label}`]),
        ],
        [
          "left",
          "right",
          "left",
          ...(evoluEncrypted == null ? [] : ["right" as const]),
        ],
        metrics.map((metric) => {
          const ratio = pairedRatio(evolu, reference, metric);
          return [
            metricLabel(metric),
            formatRatio(ratio),
            ratio == null ? "" : verdictLabels[ratio.verdict],
            ...(evoluEncrypted == null
              ? []
              : [formatRatio(pairedRatio(evoluEncrypted, evolu, metric))]),
          ];
        }),
      ),
      "",
      regressions.length === 0
        ? `**Verdict:** ${evolu.label} is not slower than ${reference.label} in any metric.`
        : `**Verdict:** ${evolu.label} is slower than ${reference.label} in ${regressions.map(({ metric }) => metricLabel(metric)).join("; ")}.`,
      "",
    );
  }

  const pragmaDifferences = findPragmaDifferences(target);
  lines.push(
    "### SQLite and pragmas",
    "",
    pragmaDifferences.length === 0
      ? "Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`."
      : `**The stacks differ in ${pragmaDifferences.join(", ")}.**`,
    "",
    ...table(
      [
        "Stack",
        "Library",
        "Binding",
        "SQLite",
        "Source ID",
        ...recordedPragmas,
      ],
      [
        "left",
        "left",
        "left",
        "left",
        "left",
        ...recordedPragmas.map(() => "left" as const),
      ],
      measured.map((stack) => [
        stack.label,
        stack.library,
        stack.binding,
        stack.sqliteVersion,
        // Its date and the start of its hash.
        stack.sqliteSourceId.slice(0, 30),
        ...recordedPragmas.map((pragma) =>
          formatPragma(pragma, stack.pragmas[pragma]),
        ),
      ]),
    ),
    "",
  );

  // The compile options that differ between the stacks' builds.
  const optionsByStack = measured.map(
    (stack) =>
      new Map(
        stack.compileOptions.map((option) => {
          const separator = option.indexOf("=");
          return separator === -1
            ? [option, "set"]
            : [option.slice(0, separator), option.slice(separator + 1)];
        }),
      ),
  );
  const differingOptions = [
    ...new Set(optionsByStack.flatMap((options) => [...options.keys()])),
  ]
    .toSorted()
    .filter(
      (name) =>
        new Set(optionsByStack.map((options) => options.get(name))).size > 1,
    );
  if (differingOptions.length > 0)
    lines.push(
      "### Compile options that differ",
      "",
      "An empty cell is an option the build doesn't report.",
      "",
      ...table(
        ["Option", ...labels],
        ["left", ...labels.map(() => "left" as const)],
        differingOptions.map((name) => [
          name,
          ...optionsByStack.map((options) => options.get(name) ?? ""),
        ]),
      ),
      "",
    );
  return lines.join("\n");
};

/** Formats the summary of results, a section per target. */
export const formatResults = (results: BenchResults): string =>
  [
    "# SQLite comparison",
    "",
    `Every stack runs wa-sqlite's ${workloads.length} benchmark workloads, at commit ${results.configuration.waSqliteCommit.slice(0, 9)}, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs ${results.configuration.pragmas.map((pragma) => `\`${pragma}\``).join(", ")}.`,
    "",
    ...results.targets.map((target) =>
      formatTarget(target, results.configuration),
    ),
  ].join("\n");
