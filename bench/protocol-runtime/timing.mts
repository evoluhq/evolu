/**
 * Aggregation, gating, ratio statistics, and estimates of the protocol runtime
 * benchmark. Everything here is pure, so [`timing.test.mts`](./timing.test.mts)
 * covers it without running Evolu.
 */
import { createHash } from "node:crypto";

/** A gated metric fails when it is more than this percentage slower. */
export const maxRegressionPercent = 10;

/** A base comparison prints a paired ratio from this one on as slower. */
export const slowerRatio = 1.03;

/** Each metric's fastest value across measurements of the same metrics. */
export const fastestByMetric = (
  measurements: ReadonlyArray<Readonly<Partial<Record<string, number>>>>,
): Readonly<Record<string, number>> => {
  const [first, ...others] = measurements;
  if (first === undefined) throw new Error("There are no measurements.");
  const fastest: Record<string, number> = {};
  for (const [metric, value] of Object.entries(first)) {
    if (value !== undefined) fastest[metric] = value;
  }
  const metrics = Object.keys(fastest).toSorted();
  for (const measurement of others) {
    if (
      JSON.stringify(Object.keys(measurement).toSorted()) !==
      JSON.stringify(metrics)
    ) {
      throw new Error("Measurements must have the same metrics.");
    }
    for (const metric of metrics) {
      fastest[metric] = Math.min(
        fastest[metric],
        metricOf(measurement, metric),
      );
    }
  }
  return fastest;
};

/** Reads a metric that must exist. */
export const metricOf = (
  values: Readonly<Partial<Record<string, number>>>,
  metric: string,
): number => {
  const value = values[metric];
  if (value === undefined) throw new Error(`The metric ${metric} is missing.`);
  return value;
};

/** The middle value, or the mean of the two middle values. */
export const median = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) throw new Error("A median needs values.");
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export interface PairedTiming {
  readonly base: number;
  readonly head: number;
}

export interface RatioSummary {
  /** The median of the paired head/base ratios. */
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

/** Summarizes the head/base ratio of each pair. */
export const summarizeRatios = (
  pairs: ReadonlyArray<PairedTiming>,
): RatioSummary => {
  const ratios = pairs.map(({ base, head }) => {
    if (!(base > 0 && head > 0)) {
      throw new Error("Paired timings must be positive.");
    }
    return head / base;
  });
  return {
    median: median(ratios),
    min: Math.min(...ratios),
    max: Math.max(...ratios),
  };
};

export type RatioVerdict = "faster" | "same" | "slower" | "regression";

/**
 * Classifies a head/base ratio: above the regression threshold fails, and from
 * {@link slowerRatio} on, or its inverse for faster, it is printed.
 */
export const ratioVerdict = (ratio: number): RatioVerdict =>
  ratio > 1 + maxRegressionPercent / 100
    ? "regression"
    : ratio >= slowerRatio
      ? "slower"
      : ratio <= 1 / slowerRatio
        ? "faster"
        : "same";

/**
 * Whether the base child process runs first in a pair, so pairs run base, head,
 * head, base, and so on, and neither side always runs first.
 */
export const isBaseFirst = (pairIndex: number): boolean => pairIndex % 2 === 0;

export interface TimingChange {
  readonly metric: string;
  readonly baselineNs: number;
  readonly currentNs: number;
}

export interface BaselineComparison {
  /**
   * Metrics more than {@link maxRegressionPercent} slower than the baseline, in
   * the current order.
   */
  readonly regressions: ReadonlyArray<TimingChange>;
  /** Metrics the baseline lacks. */
  readonly added: ReadonlyArray<string>;
  /** Baseline metrics the current results lack. */
  readonly removed: ReadonlyArray<string>;
}

/** Compares integer nanosecond metrics with a baseline. */
export const compareWithBaseline = (
  current: Readonly<Record<string, number>>,
  baseline: Readonly<Partial<Record<string, number>>>,
): BaselineComparison => {
  const changes: Array<TimingChange> = [];
  const added: Array<string> = [];
  for (const [metric, currentNs] of Object.entries(current)) {
    const baselineNs = baseline[metric];
    if (baselineNs === undefined) added.push(metric);
    else changes.push({ metric, baselineNs, currentNs });
  }
  return {
    // Integer arithmetic, so a result exactly at the threshold passes.
    regressions: changes.filter(
      ({ baselineNs, currentNs }) =>
        currentNs * 100 > baselineNs * (100 + maxRegressionPercent),
    ),
    added,
    removed: Object.keys(baseline).filter(
      (metric) => !Object.hasOwn(current, metric),
    ),
  };
};

/** Formats the change from a baseline as a signed percentage. */
export const formatChange = (currentNs: number, baselineNs: number): string => {
  const change = (currentNs / baselineNs - 1) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
};

/** Values describing the work a measurement did, such as rounds and bytes. */
export type Work = Readonly<Partial<Record<string, number | string>>>;

/** The work keys whose values differ, including keys only one side has. */
export const workDifferences = (
  base: Work,
  head: Work,
): ReadonlyArray<string> =>
  [...new Set([...Object.keys(base), ...Object.keys(head)])].filter(
    (key) => base[key] !== head[key],
  );

/**
 * Combines each case's workload hash, in the given order, into the hash a
 * baseline matches.
 */
export const combineWorkloadHashes = (
  hashesByCase: ReadonlyArray<readonly [string, string]>,
): string =>
  createHash("sha256").update(JSON.stringify(hashesByCase)).digest("hex");

/** The one value every measurement gave, or an error naming the values. */
export const sameValue = <T extends number | string>(
  description: string,
  values: ReadonlyArray<T>,
): T => {
  const unique = [...new Set(values)];
  if (unique.length === 0) throw new Error(`${description} has no value.`);
  if (unique.length > 1) {
    throw new Error(
      `${description} differs between runs: ${unique.join(", ")}`,
    );
  }
  return unique[0];
};

export interface NetworkProfile {
  readonly name: string;
  readonly rttMs: number;
  readonly downMbitPerSecond: number;
  readonly upMbitPerSecond: number;
}

/** Fixed link profiles of the end-to-end estimate. */
export const networkProfiles: ReadonlyArray<NetworkProfile> = [
  { name: "broadband", rttMs: 20, downMbitPerSecond: 50, upMbitPerSecond: 10 },
  // Lighthouse's mobileSlow4G throttling.
  { name: "mobile", rttMs: 150, downMbitPerSecond: 1.6, upMbitPerSecond: 0.75 },
];

export interface EndToEndInput {
  readonly rounds: number;
  /** Request bytes, from the client to the relay. */
  readonly upBytes: number;
  /** Response bytes, from the relay to the client. */
  readonly downBytes: number;
  /** CPU time of both sides together. */
  readonly cpuNs: number;
}

/**
 * Estimates a sync's duration in milliseconds: a round trip per round, the
 * bytes of each direction at its bandwidth, and the CPU time of both sides.
 * Sync is strict request and response, so nothing overlaps; TCP slow start is
 * ignored.
 */
export const estimateEndToEndMs = (
  { rounds, upBytes, downBytes, cpuNs }: EndToEndInput,
  { rttMs, downMbitPerSecond, upMbitPerSecond }: NetworkProfile,
): number =>
  rounds * rttMs +
  (upBytes * 8) / (upMbitPerSecond * 1_000) +
  (downBytes * 8) / (downMbitPerSecond * 1_000) +
  cpuNs / 1e6;

/**
 * Whether a one-minute load average is high enough to slow measurements: above
 * a quarter of the logical CPUs.
 */
export const isLoadHigh = (
  oneMinuteLoad: number,
  logicalCpus: number,
): boolean => oneMinuteLoad > logicalCpus / 4;
