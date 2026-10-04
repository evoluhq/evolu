import type { ScenarioMeasurement } from "./workload.mts";

/** A leaf of a {@link ScenarioMeasurement}. */
export type MetricValue = number | string | null;

export interface MetricChange {
  readonly scenario: string;
  /** A dotted path into {@link ScenarioMeasurement}. */
  readonly metric: string;
  /** Undefined when the metric is missing. */
  readonly baseline: MetricValue | undefined;
  readonly current: MetricValue | undefined;
}

export interface MeasurementComparison {
  /** Added and removed scenarios. */
  readonly scenarioChanges: ReadonlyArray<string>;
  /** Every changed metric of the scenarios both sides have. */
  readonly changes: ReadonlyArray<MetricChange>;
  readonly workloadChanges: ReadonlyArray<MetricChange>;
  /**
   * Cost increases in scenarios whose workload did not change. Costs of a
   * changed workload are not comparable.
   */
  readonly regressions: ReadonlyArray<MetricChange>;
  readonly improvements: ReadonlyArray<MetricChange>;
}

/** Compares the measurements of a run with the baseline's, metric by metric. */
export const compareMeasurements = (
  current: Readonly<Partial<Record<string, ScenarioMeasurement>>>,
  baseline: Readonly<Partial<Record<string, ScenarioMeasurement>>>,
): MeasurementComparison => {
  const currentNames = Object.keys(current);
  const baselineNames = Object.keys(baseline);
  const changes: Array<MetricChange> = [];
  for (const scenario of currentNames) {
    const currentMeasurement = current[scenario];
    const baselineMeasurement = baseline[scenario];
    if (currentMeasurement === undefined || baselineMeasurement === undefined) {
      continue;
    }
    const currentValues = flattenMeasurement(currentMeasurement);
    const baselineValues = flattenMeasurement(baselineMeasurement);
    for (const metric of new Set([
      ...currentValues.keys(),
      ...baselineValues.keys(),
    ])) {
      const currentValue = currentValues.get(metric);
      const baselineValue = baselineValues.get(metric);
      if (currentValue === baselineValue) continue;
      changes.push({
        scenario,
        metric,
        baseline: baselineValue,
        current: currentValue,
      });
    }
  }

  const workloadChanges = changes.filter((change) =>
    change.metric.startsWith("workload."),
  );
  const changedWorkloads = new Set(
    workloadChanges.map((change) => change.scenario),
  );
  // A scenario whose workload changed has costs that are not comparable.
  const costChanges = changes.filter(
    (change) =>
      change.metric.startsWith("cost.") &&
      !changedWorkloads.has(change.scenario) &&
      typeof change.current === "number" &&
      typeof change.baseline === "number",
  );
  return {
    scenarioChanges: [
      ...currentNames
        .filter((name) => !Object.hasOwn(baseline, name))
        .map((name) => `added ${name}`),
      ...baselineNames
        .filter((name) => !Object.hasOwn(current, name))
        .map((name) => `removed ${name}`),
    ],
    changes,
    workloadChanges,
    regressions: costChanges.filter(
      (change) => Number(change.current) > Number(change.baseline),
    ),
    improvements: costChanges.filter(
      (change) => Number(change.current) < Number(change.baseline),
    ),
  };
};

const flattenMeasurement = (
  measurement: ScenarioMeasurement,
): ReadonlyMap<string, MetricValue> => {
  const values = new Map<string, MetricValue>();
  const visit = (value: unknown, path: string) => {
    if (
      value === null ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      values.set(path, value);
    } else if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        visit(child, path === "" ? key : `${path}.${key}`);
      }
    }
  };
  visit(measurement, "");
  return values;
};
