import { getOrThrow, objectFrom } from "@evolu/common";
import { describe, expect, test } from "vitest";
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
  test("matches complete workload names and individual fixtures", () => {
    expect(matchesTypeBenchmarkFilter("nested-object-all-32", [])).toBe(true);
    expect(
      matchesTypeBenchmarkFilter("nested-object-all-32", [
        "nested-object-all",
      ]),
    ).toBe(true);
    expect(
      matchesTypeBenchmarkFilter("nested-object-all-32", [
        "nested-object-all-32",
      ]),
    ).toBe(true);
    expect(
      matchesTypeBenchmarkFilter("object-union-all-32", [
        "nested-object-all",
      ]),
    ).toBe(false);
  });

  test("parses and finds a compatible baseline", () => {
    const baselines = getOrThrow(
      TypeBenchmarkBaselines.fromUnknown({ baselines: [baseline] }),
    );
    expect(findTypeBenchmarkBaseline(baselines, baseline)).toEqual(baseline);
    expect(
      findTypeBenchmarkBaseline(baselines, {
        ...baseline,
        typescriptVersion: "7.1.0",
      }),
    ).toBeUndefined();
  });

  test("rejects a malformed deterministic metric", () => {
    expect(() =>
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
    ).toThrow("getOrThrow");
  });

  test("subtracts the shared compiler baseline", () => {
    expect(
      subtractDeterministicDiagnostics(
        { ...diagnostics, instantiations: 20 },
        { ...diagnostics, instantiations: 7 },
      ).instantiations,
    ).toBe(13);
  });

  test("classifies regressions, improvements, and workload changes", () => {
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
    expect(comparison.regressions.map((change) => change.metric)).toEqual([
      "instantiations",
    ]);
    expect(comparison.workloadChanges.map((change) => change.metric)).toEqual([
      "files",
    ]);
    expect(comparison.changes).toHaveLength(4);
    expect(comparison.fixtureChanges).toEqual([]);
  });

  test("reports fixture-set changes", () => {
    expect(
      compareTypeBenchmarkMeasurements({}, baseline.measurements)
        .fixtureChanges,
    ).toEqual(["removed factory-output-01"]);
  });

  test("adds and replaces compatible baselines", () => {
    const added = upsertTypeBenchmarkBaseline({ baselines: [] }, baseline);
    expect(added.baselines).toEqual([baseline]);

    expect(
      upsertTypeBenchmarkBaseline(added, {
        ...baseline,
        measurements: {},
      }).baselines,
    ).toEqual([{ ...baseline, measurements: {} }]);
  });
});
