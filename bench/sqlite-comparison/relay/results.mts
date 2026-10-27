/**
 * The results of the relay regression gate: their Types, the check that the old
 * and the new code returned the same, the paired ratios and verdict, and the
 * Markdown summary. Everything here is pure, so
 * [`results.test.mts`](./results.test.mts) covers it.
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
} from "@evolu/common";
import { median, summarizeRatios } from "../../protocol-runtime/timing.mts";
import { verdictThreshold, type PairedRatio } from "../results.mts";
import {
  relayPhaseLabels,
  relayPhases,
  relayWorkload,
  type RelayPhase,
} from "./workload.mts";

export const relayResultsFormatVersion = 1;

const PhasesMs = /*#__PURE__*/ object({
  write: NonNegativeNumber,
  fingerprint: NonNegativeNumber,
  iterate: NonNegativeNumber,
  read: NonNegativeNumber,
});

const Digests = /*#__PURE__*/ object({
  fingerprints: String,
  iterated: String,
  read: String,
});

/** What the child prints, as `workload.mts`'s `RelayRunOutput` describes. */
export const RelayRunOutput = /*#__PURE__*/ object({
  sizeAfterWrites: NonNegativeInt,
  databaseBytes: NonNegativeInt,
  phasesMs: PhasesMs,
  digests: Digests,
});
export interface RelayRunOutput extends InferType<typeof RelayRunOutput> {}

export const RelayRun = /*#__PURE__*/ object({
  round: NonNegativeInt,
  /** 0 when the checkout ran first in its round, 1 when second. */
  position: NonNegativeInt,
  phasesMs: PhasesMs,
  databaseBytes: NonNegativeInt,
});
export interface RelayRun extends InferType<typeof RelayRun> {}

export const RelayCheckoutResult = /*#__PURE__*/ object({
  commit: String,
  subject: String,
  /** Whether the checkout had changes that aren't committed. */
  isDirty: Boolean,
  /** The relay's SQLite driver in the checkout. */
  driver: String,
  /** How the checkout's Storage keeps its timestamps. */
  storage: String,
  warmupRuns: /*#__PURE__*/ array(RelayRun),
  runs: /*#__PURE__*/ array(RelayRun),
});
export interface RelayCheckoutResult extends InferType<
  typeof RelayCheckoutResult
> {}

export const RelayResults = /*#__PURE__*/ object({
  formatVersion: /*#__PURE__*/ literal(relayResultsFormatVersion),
  createdAt: String,
  environment: /*#__PURE__*/ record(String, String),
  loadAverages: /*#__PURE__*/ object({
    start: /*#__PURE__*/ array(NonNegativeNumber),
    end: /*#__PURE__*/ array(NonNegativeNumber),
  }),
  /** The digests both checkouts returned in every run. */
  digests: Digests,
  sizeAfterWrites: NonNegativeInt,
  base: RelayCheckoutResult,
  head: RelayCheckoutResult,
  /** The first failure, after which the gate stopped, or null. */
  error: /*#__PURE__*/ nullOr(String),
});
export interface RelayResults extends InferType<typeof RelayResults> {}

/**
 * Checks that a run returned what the first run did and returns null, or
 * returns what differs. The old and the new code store timestamps differently,
 * so their fingerprints, iterations and reads prove they agree.
 */
export const compareRelayDigests = (
  output: RelayRunOutput,
  first: RelayRunOutput,
): string | null => {
  if (output.sizeAfterWrites !== first.sizeAfterWrites)
    return `The owner has ${output.sizeAfterWrites} timestamps, not ${first.sizeAfterWrites}.`;
  const differing = (["fingerprints", "iterated", "read"] as const).filter(
    (name) => output.digests[name] !== first.digests[name],
  );
  return differing.length === 0
    ? null
    : `The ${differing.join(", ")} differ from the first run's.`;
};

export type RelayMetric = RelayPhase | "total";

export const relayMetrics: ReadonlyArray<RelayMetric> = [
  ...relayPhases,
  "total",
];

export const relayMetricMs = (run: RelayRun, metric: RelayMetric): number =>
  metric === "total"
    ? relayPhases.reduce((sum, phase) => sum + run.phasesMs[phase], 0)
    : run.phasesMs[metric];

/** The head/base ratio of a metric in each measured round both ran. */
export const relayRatio = (
  head: RelayCheckoutResult,
  base: RelayCheckoutResult,
  metric: RelayMetric,
): PairedRatio | null => {
  const pairs = head.runs.flatMap((headRun) => {
    const baseRun = base.runs.find((run) => run.round === headRun.round);
    return baseRun == null
      ? []
      : [
          {
            head: relayMetricMs(headRun, metric),
            base: relayMetricMs(baseRun, metric),
          },
        ];
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

/** The metrics the new code is slower in. */
export const findRelayRegressions = (
  results: RelayResults,
): ReadonlyArray<RelayMetric> =>
  relayMetrics.filter(
    (metric) =>
      relayRatio(results.head, results.base, metric)?.verdict === "Slower",
  );

const formatMs = (ms: number): string =>
  ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2);

const metricLabel = (metric: RelayMetric): string =>
  metric === "total" ? "Total" : relayPhaseLabels[metric];

const describeCheckout = (checkout: RelayCheckoutResult): string =>
  `\`${checkout.commit.slice(0, 9)}\` ${checkout.subject}${checkout.isDirty ? " (with uncommitted changes)" : ""}: ${checkout.driver}, ${checkout.storage}`;

/** Formats the relay gate's summary. */
export const formatRelayResults = (results: RelayResults): string => {
  const { base, head } = results;
  const statsCell = (checkout: RelayCheckoutResult, metric: RelayMetric) => {
    if (checkout.runs.length === 0) return "";
    const values = checkout.runs.map((run) => relayMetricMs(run, metric));
    return `${formatMs(median(values))} (${formatMs(Math.min(...values))}–${formatMs(Math.max(...values))})`;
  };
  const regressions = findRelayRegressions(results);
  const lines = [
    "# Relay regression gate",
    "",
    `Run ${results.createdAt}. ${Object.entries(results.environment)
      .map(([name, value]) => `${name} ${value}`)
      .join(
        "; ",
      )}. Load averages ${results.loadAverages.start.map((load) => load.toFixed(2)).join(", ")} before, ${results.loadAverages.end.map((load) => load.toFixed(2)).join(", ")} after.`,
    "",
    `- Old: ${describeCheckout(base)}`,
    `- New: ${describeCheckout(head)}`,
    "",
    `Each run is a fresh process and a fresh \`relay.db\`, opened as each checkout's relay opens it. It writes ${relayWorkload.messageCount} messages of ${relayWorkload.minChangeBytes} to ${relayWorkload.maxChangeBytes} bytes in batches of ${relayWorkload.batchSize}, takes ${relayWorkload.fingerprintRepeats} fingerprints of ${relayWorkload.bucketCount} buckets, iterates every timestamp ${relayWorkload.iterateRepeats} times and reads ${relayWorkload.readCount} random changes. Rounds alternate which checkout runs first. Milliseconds: the median of ${base.runs.length} measured runs after ${base.warmupRuns.length} warm-up, with the fastest and slowest in parentheses; the ratio is the median of new/old in the same round.`,
    "",
    ...(results.error == null
      ? [
          `Both checkouts returned the same fingerprints, iterations and reads in every run (${results.sizeAfterWrites} timestamps).`,
        ]
      : [`**The gate failed:** ${results.error}`]),
    "",
    "| Metric | Old | New | New / old |  |",
    "| --- | ---: | ---: | ---: | --- |",
    ...relayMetrics.map((metric) => {
      const ratio = relayRatio(head, base, metric);
      return `| ${metricLabel(metric)} | ${statsCell(base, metric)} | ${statsCell(head, metric)} | ${ratio == null ? "" : `${ratio.median.toFixed(2)} (${ratio.min.toFixed(2)}–${ratio.max.toFixed(2)})`} | ${ratio == null || ratio.verdict === "Same" ? "" : ratio.verdict.toLowerCase()} |`;
    }),
    "",
    `Database file: ${base.runs[0]?.databaseBytes ?? "?"} bytes old, ${head.runs[0]?.databaseBytes ?? "?"} bytes new.`,
    "",
    results.error != null
      ? "**Verdict:** none, as the gate failed."
      : regressions.length === 0
        ? `**Verdict:** the new code is not slower in any metric (a ratio is slower when its median is above ${verdictThreshold} and every round agrees).`
        : `**Verdict:** the new code is slower in ${regressions.map(metricLabel).join("; ")}.`,
    "",
  ];
  return lines.join("\n");
};
