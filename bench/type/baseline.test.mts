import {
  assertEqual,
  assertFalse,
  assertLength,
  assertThrowsInstanceOf,
  assertTrue,
  getOrThrow,
  objectFrom,
} from "@evolu/common";
import { describe, it } from "node:test";
import {
  compareTypeBenchmarkMeasurements,
  deterministicMetricNames,
  findTypeBenchmarkBaseline,
  matchesTypeBenchmarkFilter,
  subtractDeterministicDiagnostics,
  type TypeBenchmarkBaseline,
  TypeBenchmarkBaselines,
  typeBenchmarkSuiteVersion,
  upsertTypeBenchmarkBaseline,
} from "./baseline.mts";

const diagnostics = objectFrom(
  deterministicMetricNames,
  (metric) => deterministicMetricNames.indexOf(metric) + 1,
);

const baseline: TypeBenchmarkBaseline = {
  suiteVersion: typeBenchmarkSuiteVersion,
  typescriptVersion: "7.0.2",
  compilerArguments: ["--strict"],
  measurements: { "factory-output-01": diagnostics },
};

describe("Type benchmark baselines", () => {
  it("matches complete workload names and individual fixtures", () => {
    assertTrue(matchesTypeBenchmarkFilter("nested-object-all-32", []));
    assertTrue(
      matchesTypeBenchmarkFilter("nested-object-all-32", ["nested-object-all"]),
    );
    assertTrue(
      matchesTypeBenchmarkFilter("nested-object-all-32", [
        "nested-object-all-32",
      ]),
    );
    assertFalse(
      matchesTypeBenchmarkFilter("object-union-all-32", ["nested-object-all"]),
    );
  });

  it("parses and finds a compatible baseline", () => {
    const baselines = getOrThrow(
      TypeBenchmarkBaselines.fromUnknown({ baselines: [baseline] }),
    );
    assertEqual(findTypeBenchmarkBaseline(baselines, baseline), baseline);
    assertEqual(
      findTypeBenchmarkBaseline(baselines, {
        ...baseline,
        typescriptVersion: "7.1.0",
      }),
      undefined,
    );
  });

  it("rejects a malformed deterministic metric", () => {
    assertTrue(
      assertThrowsInstanceOf(
        () =>
          getOrThrow(
            TypeBenchmarkBaselines.fromUnknown({
              baselines: [
                {
                  ...baseline,
                  measurements: {
                    "factory-output-01": { ...diagnostics, types: 1.5 },
                  },
                },
              ],
            }),
          ),
        Error,
      ).message.includes("getOrThrow"),
    );
  });

  it("subtracts the shared compiler baseline", () => {
    assertEqual(
      subtractDeterministicDiagnostics(
        { ...diagnostics, instantiations: 20 },
        { ...diagnostics, instantiations: 7 },
      ).instantiations,
      13,
    );
  });

  it("classifies regressions, improvements, and workload changes", () => {
    const comparison = compareTypeBenchmarkMeasurements(
      {
        "factory-output-01": {
          ...diagnostics,
          files: diagnostics.files + 1,
          instantiations: diagnostics.instantiations + 1,
          types: diagnostics.types - 1,
          symbols: diagnostics.symbols + 1,
        },
      },
      baseline.measurements,
    );
    assertEqual(
      comparison.regressions.map((change) => change.metric),
      ["instantiations"],
    );
    assertEqual(
      comparison.workloadChanges.map((change) => change.metric),
      ["files"],
    );
    assertLength(comparison.changes, 4);
    assertEqual(comparison.fixtureChanges, []);
  });

  it("reports fixture-set changes", () => {
    assertEqual(
      compareTypeBenchmarkMeasurements({}, baseline.measurements)
        .fixtureChanges,
      ["removed factory-output-01"],
    );
  });

  it("adds and replaces compatible baselines", () => {
    const added = upsertTypeBenchmarkBaseline({ baselines: [] }, baseline);
    assertEqual(added.baselines, [baseline]);

    assertEqual(
      upsertTypeBenchmarkBaseline(added, {
        ...baseline,
        measurements: {},
      }).baselines,
      [{ ...baseline, measurements: {} }],
    );
  });
});
