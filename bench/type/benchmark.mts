/* eslint-disable no-console */
import {
  allSettled,
  assertNonNullable,
  err,
  getOrThrow,
  objectFrom,
  ok,
} from "@evolu/common";
import { availableParallelism, runMain } from "@evolu/nodejs";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { parseBenchmarkMode } from "../index.mts";
import {
  compareTypeBenchmarkMeasurements,
  type DeterministicDiagnostics,
  deterministicMetricNames,
  findTypeBenchmarkBaseline,
  matchesTypeBenchmarkFilter,
  subtractDeterministicDiagnostics,
  type TypeBenchmarkBaseline,
  TypeBenchmarkBaselines,
  type TypeBenchmarkConfiguration,
  typeBenchmarkSuiteVersion,
  upsertTypeBenchmarkBaseline,
} from "./baseline.mts";

// oxlint-disable-next-line typescript/strict-void-return -- Node's callback-based execFile returns a ChildProcess that promisify intentionally ignores.
const execFileAsync = promisify(execFile);
const benchmarkDirectory = import.meta.dirname;
const fixtureDirectory = join(benchmarkDirectory, "fixtures");
const tscPath = resolve(
  dirname(
    fileURLToPath(import.meta.resolve("@typescript/native/package.json")),
  ),
  "bin/tsc",
);
const depths = [1, 2, 4, 8, 16, 32] as const;
const widths = [2, 4, 8, 16, 32] as const;
const templateLiteralWidths = [4, 8, 12, 16] as const;
const fixtureKinds = [
  "factory-output",
  "factory-errors",
  "factory-from-unknown",
  "factory-deepest",
  "factory-all",
  "factory-or-throw",
  "factory-or-null",
  "factory-semantic-all",
  "array-output",
  "array-errors",
  "array-from-unknown",
  "array-all",
  "array-semantic-all",
  "set-output",
  "set-errors",
  "set-from-unknown",
  "set-all",
  "set-semantic-all",
  "nested-array-all",
  "nested-set-all",
  "nested-object-all",
  "object-all",
  "record-all",
  "declaration-output",
  "declaration-errors",
  "declaration-all",
] as const;
const widthFixtureKinds = [
  "union-all",
  "literal-union-all",
  "mixed-union-all",
  "object-width-all",
  "object-union-all",
  "discriminated-union-all",
] as const;
const templateLiteralFixtureKinds = [
  "template-literal-canonical-input",
] as const;
const standaloneFixtureKinds = [
  "brand-direct-all",
  "brand-factory-all",
  "constraints-all",
  "literal-all",
  "transform-all",
  "union-array-all",
  "array-child-all",
  "union-object-all",
  "transform-object-all",
  "typed-all",
  "object-transform-all",
  "object-array-all",
  "object-child-all",
  "object-record-all",
  "record-transform-all",
  "lazy-direct-all",
  "lazy-mutual-all",
  "localize-lazy-direct-all",
  "localize-lazy-mutual-all",
] as const;
const typecheckFixtures = [
  "factory-all-32.mts",
  "factory-from-unknown-32.mts",
  "factory-or-throw-32.mts",
  "factory-or-null-32.mts",
  "factory-semantic-all-32.mts",
  "array-all-32.mts",
  "array-semantic-all-32.mts",
  "set-all-32.mts",
  "set-semantic-all-32.mts",
  "nested-array-all-32.mts",
  "nested-set-all-32.mts",
  "nested-object-all-32.mts",
  "object-all-32.mts",
  "record-all-32.mts",
  "declaration-all-32.mts",
  "brand-direct-all.mts",
  "brand-factory-all.mts",
  "constraints-all.mts",
  "literal-all.mts",
  "union-all-32.mts",
  "literal-union-all-32.mts",
  "mixed-union-all-32.mts",
  "object-width-all-32.mts",
  "object-union-all-32.mts",
  "discriminated-union-all-32.mts",
  "transform-all.mts",
  "union-array-all.mts",
  "array-child-all.mts",
  "union-object-all.mts",
  "transform-object-all.mts",
  "typed-all.mts",
  "object-transform-all.mts",
  "object-array-all.mts",
  "object-child-all.mts",
  "object-record-all.mts",
  "record-transform-all.mts",
  "lazy-direct-all.mts",
  "lazy-mutual-all.mts",
  "localize-lazy-direct-all.mts",
  "localize-lazy-mutual-all.mts",
  "template-literal-canonical-input-16.mts",
] as const;
const { tokens: benchmarkArgumentTokens, values: benchmarkArgumentValues } =
  parseArgs({
    args: process.argv.slice(2),
    options: {
      filter: { multiple: true, type: "string" },
      mode: { type: "string" },
    },
    strict: true,
    tokens: true,
  });
const benchmarkMode = parseBenchmarkMode({
  args: benchmarkArgumentTokens
    .filter((token) => token.kind === "option" && token.name === "mode")
    .map((token) => `--mode=${token.value}`),
  benchmarkName: "Type",
});
const fixtureFilters = benchmarkArgumentValues.filter ?? [];
const filteredBenchmark = fixtureFilters.length > 0;
const updateBaseline = benchmarkMode !== "default";
if (filteredBenchmark && updateBaseline) {
  throw new Error("A filtered Type benchmark cannot update the baseline.");
}
const compilerArguments = [
  "--ignoreConfig",
  "--noEmit",
  "--allowImportingTsExtensions",
  "--strict",
  "--exactOptionalPropertyTypes",
  "--skipLibCheck",
  "--verbatimModuleSyntax",
  "--isolatedModules",
  "--module",
  "nodenext",
  "--moduleResolution",
  "nodenext",
  "--target",
  "es2022",
  "--lib",
  "dom,esnext",
  "--types",
  "node",
  "--singleThreaded",
  "--extendedDiagnostics",
  "--pretty",
  "false",
] as const;
const typecheckCompilerArguments = compilerArguments.filter(
  (argument) =>
    argument !== "--singleThreaded" && argument !== "--extendedDiagnostics",
);
const typeBenchmarkBaselinesUrl = new URL("./baselines.json", import.meta.url);

type FixtureKind =
  | (typeof fixtureKinds)[number]
  | (typeof widthFixtureKinds)[number]
  | (typeof templateLiteralFixtureKinds)[number]
  | (typeof standaloneFixtureKinds)[number];

interface Fixture {
  readonly kind: FixtureKind;
  readonly depth?: number;
  readonly width?: number;
}

interface CompilerDiagnostics extends DeterministicDiagnostics {
  readonly memoryUsedKiB: number;
  readonly checkTimeMs: number;
}

interface FixtureResult extends Fixture {
  readonly diagnostics?: CompilerDiagnostics;
  readonly failure?: string;
}

const getFixtureName = ({ kind, depth, width }: Fixture): string => {
  const size = depth ?? width;
  return size === undefined ? kind : `${kind}-${String(size).padStart(2, "0")}`;
};

const allFixtures: ReadonlyArray<Fixture> = [
  ...fixtureKinds.flatMap((kind) => depths.map((depth) => ({ kind, depth }))),
  ...widthFixtureKinds.flatMap((kind) =>
    widths.map((width) => ({ kind, width })),
  ),
  ...templateLiteralFixtureKinds.flatMap((kind) =>
    templateLiteralWidths.map((width) => ({ kind, width })),
  ),
  ...standaloneFixtureKinds.map((kind) => ({ kind })),
];
const fixtures = allFixtures.filter((fixture) =>
  matchesTypeBenchmarkFilter(getFixtureName(fixture), fixtureFilters),
);
if (fixtures.length === 0) {
  throw new Error(
    `No Type benchmark fixture matches: ${fixtureFilters.join(", ")}.`,
  );
}
const selectedTypecheckFixtures = filteredBenchmark
  ? typecheckFixtures.filter((fixture) =>
      matchesTypeBenchmarkFilter(fixture.slice(0, -4), fixtureFilters),
    )
  : typecheckFixtures;

const parseIntegerMetric = (output: string, name: string): number => {
  const match = new RegExp(`^${name}:\\s+([\\d,]+)`, "mu").exec(output);
  if (match == null) throw new Error(`Missing ${name} in tsc diagnostics.`);
  return Number(match[1].replaceAll(",", ""));
};

const compileFixture = async (
  fixturePath: string,
  signal: AbortSignal,
): Promise<CompilerDiagnostics> => {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tscPath, ...compilerArguments, fixturePath],
      {
        cwd: resolve(benchmarkDirectory, "../.."),
        maxBuffer: 10 * 1024 * 1024,
        signal,
      },
    );
    if (stderr.length > 0) throw new Error(stderr);
    const checkTimeMatch = /^Check time:\s+([\d.]+)s/mu.exec(stdout);
    if (checkTimeMatch == null) {
      throw new Error("Missing Check time in tsc diagnostics.");
    }
    return {
      files: parseIntegerMetric(stdout, "Files"),
      lines: parseIntegerMetric(stdout, "Lines"),
      identifiers: parseIntegerMetric(stdout, "Identifiers"),
      instantiations: parseIntegerMetric(stdout, "Instantiations"),
      types: parseIntegerMetric(stdout, "Types"),
      symbols: parseIntegerMetric(stdout, "Symbols"),
      memoryUsedKiB: parseIntegerMetric(stdout, "Memory used"),
      checkTimeMs: Math.round(Number(checkTimeMatch[1]) * 1_000),
    };
  } catch (error) {
    signal.throwIfAborted();
    const processError = error as Error & {
      readonly stdout?: string;
      readonly stderr?: string;
    };
    throw new Error(
      [processError.message, processError.stdout, processError.stderr]
        .filter((value) => value != null && value.length > 0)
        .join("\n"),
      { cause: error },
    );
  }
};

const typecheckFixture = async (
  fixturePath: string,
  signal: AbortSignal,
): Promise<void> => {
  try {
    const { stderr } = await execFileAsync(
      process.execPath,
      [tscPath, ...typecheckCompilerArguments, fixturePath],
      {
        cwd: resolve(benchmarkDirectory, "../.."),
        maxBuffer: 10 * 1024 * 1024,
        signal,
      },
    );
    if (stderr.length > 0) throw new Error(stderr);
  } catch (error) {
    signal.throwIfAborted();
    const processError = error as Error & {
      readonly stdout?: string;
      readonly stderr?: string;
    };
    throw new Error(
      [processError.message, processError.stdout, processError.stderr]
        .filter((value) => value != null && value.length > 0)
        .join("\n"),
      { cause: error },
    );
  }
};

const formatDelta = (value: number, baseline: number): string => {
  const delta = value - baseline;
  return `${delta >= 0 ? "+" : ""}${delta}`;
};

const formatValueAndDelta = (value: number, baseline: number): string =>
  `${value} (${formatDelta(value, baseline)})`;

const toDeterministicDiagnostics = (
  diagnostics: CompilerDiagnostics,
): DeterministicDiagnostics =>
  objectFrom(deterministicMetricNames, (metric) => diagnostics[metric]);

await runMain(
  { availableParallelism },
  { mode: "command" },
)(async (run) => {
  const availableParallelism = run.deps.availableParallelism();
  const normalizeAbort = async <T,>(promise: Promise<T>): Promise<T> => {
    try {
      return await promise;
    } catch (error) {
      run.signal.throwIfAborted();
      throw error;
    }
  };

  const typescriptVersion = (
    await normalizeAbort(
      execFileAsync(process.execPath, [tscPath, "--version"], {
        signal: run.signal,
      }),
    )
  ).stdout
    .trim()
    .replace(/^Version\s+/u, "");
  if (!typescriptVersion.startsWith("7.")) {
    throw new Error(
      `The Type benchmark requires TypeScript 7, but resolved TypeScript ${typescriptVersion}.`,
    );
  }
  const configuration: TypeBenchmarkConfiguration = {
    suiteVersion: typeBenchmarkSuiteVersion,
    typescriptVersion,
    compilerArguments,
  };
  const typeBenchmarkBaselines = getOrThrow(
    TypeBenchmarkBaselines.fromUnknown(
      JSON.parse(
        await normalizeAbort(
          readFile(typeBenchmarkBaselinesUrl, {
            encoding: "utf8",
            signal: run.signal,
          }),
        ),
      ),
    ),
  );
  const existingBaseline = findTypeBenchmarkBaseline(
    typeBenchmarkBaselines,
    configuration,
  );
  console.log(
    `Typechecking ${selectedTypecheckFixtures.length} representative fixtures with the default checker...`,
  );
  await Promise.all(
    selectedTypecheckFixtures.map((fixture) =>
      typecheckFixture(join(fixtureDirectory, fixture), run.signal),
    ),
  );
  console.log("Typecheck fixtures passed with the default checker.");
  console.log("Measuring the shared root baseline...");
  const sharedRootBaseline = await compileFixture(
    join(fixtureDirectory, "baseline.mts"),
    run.signal,
  );
  console.log(
    `Measuring ${fixtures.length} fixtures with concurrency ${availableParallelism}...`,
  );
  let completedFixtureCount = 0;
  const reportCompletedFixture = (): void => {
    completedFixtureCount++;
    if (
      completedFixtureCount % 10 === 0 ||
      completedFixtureCount === fixtures.length
    ) {
      console.log(
        `Completed ${completedFixtureCount}/${fixtures.length} fixtures.`,
      );
    }
  };
  const results: ReadonlyArray<FixtureResult> = (
    await run.ok(
      allSettled(
        fixtures,
        (fixture) => async (run) => {
          try {
            return ok(
              await compileFixture(
                join(fixtureDirectory, `${getFixtureName(fixture)}.mts`),
                run.signal,
              ),
            );
          } catch (error) {
            run.signal.throwIfAborted();
            return err(error instanceof Error ? error.message : String(error));
          } finally {
            reportCompletedFixture();
          }
        },
        { concurrency: availableParallelism },
      ),
    )
  ).map((result, index) => {
    const fixture = fixtures[index];
    return result.ok
      ? { ...fixture, diagnostics: result.value }
      : { ...fixture, failure: result.error };
  });

  console.log(`Type compiler benchmark (Version ${typescriptVersion})`);
  console.log(`Compiler concurrency: ${availableParallelism}`);
  if (filteredBenchmark) {
    console.log(`Fixture filters: ${fixtureFilters.join(", ")}`);
  }
  console.log("Shared root baseline:", sharedRootBaseline);
  console.log("Primary diagnostics:");
  console.table(
    results.map((result) => ({
      workload: result.kind,
      depth: result.depth ?? "-",
      width: result.width ?? "-",
      instantiations: result.diagnostics?.instantiations ?? "FAIL",
      "instantiations Δ": result.diagnostics
        ? formatDelta(
            result.diagnostics.instantiations,
            sharedRootBaseline.instantiations,
          )
        : "-",
      types: result.diagnostics?.types ?? "FAIL",
      "types Δ": result.diagnostics
        ? formatDelta(result.diagnostics.types, sharedRootBaseline.types)
        : "-",
      symbols: result.diagnostics?.symbols ?? "FAIL",
      "symbols Δ": result.diagnostics
        ? formatDelta(result.diagnostics.symbols, sharedRootBaseline.symbols)
        : "-",
      "check ms": result.diagnostics?.checkTimeMs ?? "FAIL",
      "check ms Δ": result.diagnostics
        ? formatDelta(
            result.diagnostics.checkTimeMs,
            sharedRootBaseline.checkTimeMs,
          )
        : "-",
    })),
  );

  console.log("Supporting diagnostics (raw value and baseline delta):");
  console.table(
    results.map((result) => ({
      workload: result.kind,
      depth: result.depth ?? "-",
      width: result.width ?? "-",
      files: result.diagnostics
        ? formatValueAndDelta(
            result.diagnostics.files,
            sharedRootBaseline.files,
          )
        : "FAIL",
      lines: result.diagnostics
        ? formatValueAndDelta(
            result.diagnostics.lines,
            sharedRootBaseline.lines,
          )
        : "FAIL",
      identifiers: result.diagnostics
        ? formatValueAndDelta(
            result.diagnostics.identifiers,
            sharedRootBaseline.identifiers,
          )
        : "FAIL",
      "memory KiB": result.diagnostics
        ? formatValueAndDelta(
            result.diagnostics.memoryUsedKiB,
            sharedRootBaseline.memoryUsedKiB,
          )
        : "FAIL",
    })),
  );

  for (const result of results) {
    if (result.failure == null) continue;
    console.error(`\n${getFixtureName(result)} failed:\n`);
    console.error(result.failure);
  }

  if (results.some((result) => result.failure != null)) {
    process.exitCode = 1;
  } else {
    const measurements: Record<string, DeterministicDiagnostics> = {};
    for (const result of results) {
      if (result.diagnostics === undefined) {
        throw new Error(`Missing diagnostics for ${getFixtureName(result)}.`);
      }
      measurements[getFixtureName(result)] = subtractDeterministicDiagnostics(
        toDeterministicDiagnostics(result.diagnostics),
        toDeterministicDiagnostics(sharedRootBaseline),
      );
    }

    const nextBaseline: TypeBenchmarkBaseline = {
      ...configuration,
      measurements,
    };

    if (existingBaseline === undefined) {
      if (!updateBaseline) {
        throw new Error(
          `No Type benchmark baseline matches TypeScript ${configuration.typescriptVersion} and the current compiler arguments. Run "pnpm bench:type --mode=update-baseline" to create it.\nProposed baseline:\n${JSON.stringify({ baselines: [nextBaseline] }, null, 2)}`,
        );
      }
      console.log(
        "No compatible Type benchmark baseline exists; creating one.",
      );
    } else {
      const comparedBaselineMeasurements = filteredBenchmark
        ? objectFrom(
            globalThis.Object.keys(existingBaseline.measurements).filter(
              (fixture) => matchesTypeBenchmarkFilter(fixture, fixtureFilters),
            ),
            (fixture) => {
              const measurement = existingBaseline.measurements[fixture];
              assertNonNullable(measurement);
              return measurement;
            },
          )
        : existingBaseline.measurements;
      const comparison = compareTypeBenchmarkMeasurements(
        measurements,
        comparedBaselineMeasurements,
      );
      if (comparison.changes.length > 0) {
        console.log("Changes from the committed deterministic baseline:");
        console.table(
          comparison.changes.map((change) => ({
            fixture: change.fixture,
            metric: change.metric,
            baseline: change.baseline,
            current: change.current,
            change: formatDelta(change.current, change.baseline),
          })),
        );
      }
      if (comparison.fixtureChanges.length > 0) {
        console.log(
          `Fixture-set changes: ${comparison.fixtureChanges.join(", ")}.`,
        );
      }

      if (
        comparison.regressions.length > 0 &&
        benchmarkMode !== "force-update-baseline"
      ) {
        throw new Error(
          `Type compiler regression: ${comparison.regressions
            .map(
              (change) =>
                `${change.fixture} ${change.metric} ${formatDelta(change.current, change.baseline)}`,
            )
            .join(", ")}.`,
        );
      }

      if (
        benchmarkMode === "default" &&
        (comparison.workloadChanges.length > 0 ||
          (!filteredBenchmark && comparison.fixtureChanges.length > 0))
      ) {
        throw new Error(
          'The Type benchmark workload differs from its baseline. Review it and run with "--mode=update-baseline".',
        );
      }

      if (benchmarkMode === "force-update-baseline") {
        console.log("Forcing the Type benchmark baseline update.");
      } else if (benchmarkMode === "default") {
        console.log(
          filteredBenchmark
            ? "Filtered Type benchmark passed."
            : comparison.changes.length === 0
              ? "Type benchmark passed; all deterministic metrics match."
              : "Type benchmark passed; no gated compiler metric regressed.",
        );
      }
    }

    if (updateBaseline) {
      await normalizeAbort(
        writeFile(
          typeBenchmarkBaselinesUrl,
          `${JSON.stringify(
            upsertTypeBenchmarkBaseline(typeBenchmarkBaselines, nextBaseline),
            null,
            2,
          )}\n`,
          { signal: run.signal },
        ),
      );
      console.log("Updated Type benchmark baseline.");
    }
  }

  return ok();
});
