import {
  array,
  assertNonNullable,
  Int,
  object,
  objectFrom,
  record,
  String,
} from "@evolu/common";

export const typeBenchmarkSuiteVersion = 1;

export const deterministicMetricNames = [
  "files",
  "lines",
  "identifiers",
  "instantiations",
  "types",
  "symbols",
] as const;

export type DeterministicMetricName = (typeof deterministicMetricNames)[number];

export type DeterministicDiagnostics = Readonly<
  Record<DeterministicMetricName, number>
>;

export interface TypeBenchmarkConfiguration {
  readonly suiteVersion: number;
  readonly typescriptVersion: string;
  readonly compilerArguments: ReadonlyArray<string>;
}

export interface TypeBenchmarkBaseline extends TypeBenchmarkConfiguration {
  readonly measurements: Readonly<
    Partial<Record<string, DeterministicDiagnostics>>
  >;
}

export interface TypeBenchmarkBaselines {
  readonly baselines: ReadonlyArray<TypeBenchmarkBaseline>;
}

export interface TypeBenchmarkMetricChange {
  readonly fixture: string;
  readonly metric: DeterministicMetricName;
  readonly baseline: number;
  readonly current: number;
  readonly delta: number;
}

export interface TypeBenchmarkComparison {
  readonly changes: ReadonlyArray<TypeBenchmarkMetricChange>;
  readonly regressions: ReadonlyArray<TypeBenchmarkMetricChange>;
  readonly workloadChanges: ReadonlyArray<TypeBenchmarkMetricChange>;
  readonly fixtureChanges: ReadonlyArray<string>;
}

export const matchesTypeBenchmarkFilter = (
  fixture: string,
  filters: ReadonlyArray<string>,
): boolean =>
  filters.length === 0 ||
  filters.some(
    (filter) => fixture === filter || fixture.startsWith(`${filter}-`),
  );

export const TypeBenchmarkBaselines = /*#__PURE__*/ object({
  baselines: /*#__PURE__*/ array(
    /*#__PURE__*/ object({
      suiteVersion: Int,
      typescriptVersion: String,
      compilerArguments: /*#__PURE__*/ array(String),
      measurements: /*#__PURE__*/ record(
        String,
        /*#__PURE__*/ object({
          files: Int,
          lines: Int,
          identifiers: Int,
          instantiations: Int,
          types: Int,
          symbols: Int,
        }),
      ),
    }),
  ),
});

export const findTypeBenchmarkBaseline = (
  baselines: TypeBenchmarkBaselines,
  configuration: TypeBenchmarkConfiguration,
): TypeBenchmarkBaseline | undefined =>
  baselines.baselines.find(
    (baseline) =>
      baseline.suiteVersion === configuration.suiteVersion &&
      baseline.typescriptVersion === configuration.typescriptVersion &&
      baseline.compilerArguments.length ===
        configuration.compilerArguments.length &&
      baseline.compilerArguments.every(
        (argument, index) =>
          argument === configuration.compilerArguments[index],
      ),
  );

export const subtractDeterministicDiagnostics = (
  current: DeterministicDiagnostics,
  baseline: DeterministicDiagnostics,
): DeterministicDiagnostics =>
  objectFrom(
    deterministicMetricNames,
    (metric) => current[metric] - baseline[metric],
  );

export const compareTypeBenchmarkMeasurements = (
  current: Readonly<Partial<Record<string, DeterministicDiagnostics>>>,
  baseline: Readonly<Partial<Record<string, DeterministicDiagnostics>>>,
): TypeBenchmarkComparison => {
  const currentFixtures = Object.keys(current).toSorted();
  const baselineFixtures = Object.keys(baseline).toSorted();
  const currentFixtureSet = new Set(currentFixtures);
  const baselineFixtureSet = new Set(baselineFixtures);

  const changes: Array<TypeBenchmarkMetricChange> = [];
  for (const fixture of currentFixtures.filter((fixture) =>
    baselineFixtureSet.has(fixture),
  )) {
    const currentDiagnostics = current[fixture];
    const baselineDiagnostics = baseline[fixture];
    assertNonNullable(currentDiagnostics);
    assertNonNullable(baselineDiagnostics);
    for (const metric of deterministicMetricNames) {
      const delta = currentDiagnostics[metric] - baselineDiagnostics[metric];
      if (delta === 0) continue;
      changes.push({
        fixture,
        metric,
        baseline: baselineDiagnostics[metric],
        current: currentDiagnostics[metric],
        delta,
      });
    }
  }

  return {
    changes,
    regressions: changes.filter(
      (change) =>
        (change.metric === "instantiations" || change.metric === "types") &&
        change.delta > 0,
    ),
    workloadChanges: changes.filter(
      (change) =>
        change.metric === "files" ||
        change.metric === "lines" ||
        change.metric === "identifiers",
    ),
    fixtureChanges: [
      ...currentFixtures
        .filter((fixture) => !baselineFixtureSet.has(fixture))
        .map((fixture) => `added ${fixture}`),
      ...baselineFixtures
        .filter((fixture) => !currentFixtureSet.has(fixture))
        .map((fixture) => `removed ${fixture}`),
    ],
  };
};

export const upsertTypeBenchmarkBaseline = (
  baselines: TypeBenchmarkBaselines,
  baseline: TypeBenchmarkBaseline,
): TypeBenchmarkBaselines => {
  const existing = findTypeBenchmarkBaseline(baselines, baseline);
  if (existing === undefined) {
    return { baselines: [...baselines.baselines, baseline] };
  }
  return {
    baselines: baselines.baselines.map((value) =>
      value === existing ? baseline : value,
    ),
  };
};
