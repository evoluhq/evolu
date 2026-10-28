/**
 * Source-based coverage of the C core: the flags that instrument a compile
 * unit, and what the runs of an instrumented binary left uncovered in a
 * directory's sources, read with the llvm-profdata and llvm-cov of the clang
 * that compiled it.
 *
 * The C test runner compiles the core's src/ and the native binding layer's
 * binding/ with {@link coverageFlags}, each run writes a profile, and
 * core.test.mts requires the runs on both crypto paths to cover every line,
 * function and branch of both on the host's platform. A branch counts each of
 * its outcomes, as llvm-cov does: the true and the false of each condition of
 * an `if`, a loop, `&&`, `||` or `?:`. The gaps list every uncovered line,
 * function and outcome. Two outcomes no test can take stay out of the core: a
 * `switch` without `default` counts its implicit default, which a switch over
 * every case never takes, and a condition clang folded, such as `while (0)`,
 * which the gaps list as never true.
 *
 * @module
 */
import type { Typed } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { run } from "./compile.mts";

/** The flags that make clang instrument a compile unit and its link. */
export const coverageFlags: ReadonlyArray<string> = [
  "-fprofile-instr-generate",
  "-fcoverage-mapping",
  // The tests run code on several threads at once. Without atomic counters
  // their updates get lost, and since llvm-cov derives some outcomes from
  // differences of counters, an outcome that happened can read as never.
  "-fprofile-update=atomic",
];

/** How many of a kind of coverable thing there are and how many ran. */
export interface CoverageCount {
  readonly count: number;
  readonly covered: number;
}

export interface CoverageReport {
  /**
   * The files the report covers, which are the sources compiled with
   * {@link coverageFlags}, and the headers they include.
   */
  readonly files: ReadonlyArray<string>;
  readonly lines: CoverageCount;
  readonly functions: CoverageCount;
  readonly branches: CoverageCount;
  readonly gaps: ReadonlyArray<CoverageGap>;
}

export type CoverageGap = UncoveredLine | UncoveredFunction | UncoveredBranch;

export interface UncoveredLine extends Typed<"UncoveredLine"> {
  readonly file: string;
  readonly line: number;
}

export interface UncoveredFunction extends Typed<"UncoveredFunction"> {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

/**
 * A condition at least one of whose outcomes never happened. A condition of a
 * macro is where the macro defines it, and `expandedAt` is the line that
 * expanded the macro.
 */
export interface UncoveredBranch extends Typed<"UncoveredBranch"> {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly never: "true" | "false" | "evaluated";
  readonly expandedAt: { readonly file: string; readonly line: number } | null;
}

/**
 * Merges the profiles that the runs of `binary` wrote into `profileDirectory`
 * and reports the coverage of the sources under `sourceDirectories`. Throws
 * when the directory has no profile or clang has no llvm-profdata or llvm-cov.
 */
export const measureCoverage = ({
  binary,
  profileDirectory,
  sourceDirectories,
  cc = "clang",
}: {
  binary: string;
  profileDirectory: string;
  sourceDirectories: ReadonlyArray<string>;
  cc?: string;
}): CoverageReport => {
  const profiles = readdirSync(profileDirectory)
    .filter((name) => name.endsWith(".profraw"))
    .toSorted()
    .map((name) => join(profileDirectory, name));
  if (profiles.length === 0)
    throw new Error(`${profileDirectory} has no profile of ${binary}`);
  const merged = join(profileDirectory, "merged.profdata");
  llvmTool(cc, "llvm-profdata", [
    "merge",
    "-sparse",
    ...profiles,
    "-o",
    merged,
  ]);
  const exportArgs = (format: string) => [
    "export",
    `-format=${format}`,
    `-instr-profile=${merged}`,
    binary,
    ...sourceDirectories,
  ];
  const [data] = (
    JSON.parse(llvmTool(cc, "llvm-cov", exportArgs("text"))) as LlvmCovExport
  ).data;
  const isSource = (file: string) =>
    sourceDirectories.some(
      (directory) => !relative(directory, file).startsWith(".."),
    );

  const lines: Array<UncoveredLine> = [];
  let file = "";
  const lcov = llvmTool(cc, "llvm-cov", exportArgs("lcov"));
  for (const record of lcov.split("\n")) {
    if (record.startsWith("SF:")) file = record.slice(3);
    const executions = /^DA:(\d+),0$/u.exec(record);
    if (executions)
      lines.push({ type: "UncoveredLine", file, line: Number(executions[1]) });
  }

  const functions: Array<UncoveredFunction> = data.functions
    .filter(({ count, filenames }) => count === 0 && isSource(filenames[0]))
    .map(({ name, regions, filenames }) => ({
      type: "UncoveredFunction",
      file: filenames[0],
      line: regions[0][0],
      // A static function's name starts with its file's.
      name: name.slice(name.lastIndexOf(":") + 1),
    }));

  // A file's branches include its macros' with a file index other than 0,
  // which only the expansions' file names resolve, so those come from the
  // expansions, once per expanding file and line.
  const branchesByKey = new Map<string, UncoveredBranch>();
  const addBranch = (
    [line, column, , , trueCount, falseCount]: LlvmCovBranch,
    file: string,
    expandedAt: UncoveredBranch["expandedAt"],
  ) => {
    if (trueCount > 0 && falseCount > 0) return;
    const key = `${file}:${line}:${column}:${expandedAt?.file}:${expandedAt?.line}`;
    branchesByKey.set(key, {
      type: "UncoveredBranch",
      file,
      line,
      column,
      never:
        trueCount === 0 && falseCount === 0
          ? "evaluated"
          : trueCount === 0
            ? "true"
            : "false",
      expandedAt,
    });
  };
  for (const { filename, branches, expansions } of data.files) {
    for (const branch of branches)
      if (branch[6] === 0) addBranch(branch, filename, null);
    for (const { branches, filenames, source_region } of expansions)
      for (const branch of branches)
        if (branch[6] !== 0)
          addBranch(branch, filenames[branch[6]], {
            file: filename,
            line: source_region[0],
          });
  }

  const { totals } = data;
  return {
    files: data.files.map(({ filename }) => filename),
    lines: { count: totals.lines.count, covered: totals.lines.covered },
    functions: {
      count: totals.functions.count,
      covered: totals.functions.covered,
    },
    branches: {
      count: totals.branches.count,
      covered: totals.branches.covered,
    },
    gaps: [...lines, ...functions, ...branchesByKey.values()],
  };
};

/**
 * Whether the C tests can cover every line, function and branch of the core's C
 * on a host: where the CPU has every feature of evolu_crypto.h whose hardware
 * paths the core compiles for the architecture, AES, SHA-512 and DIT on arm64
 * and AES on x86-64. On a CPU without some, such as an arm64 one without
 * SHA-512 or DIT, nothing can run those paths.
 */
export const isFullCoverageExpected = ({
  arch,
  cpuFeatures,
}: {
  arch: string;
  cpuFeatures: number;
}): boolean => cpuFeatures === (arch === "arm64" ? 7 : arch === "x64" ? 1 : 0);

/** One line per gap, with paths relative to `directory`. */
export const formatCoverageGap = (
  gap: CoverageGap,
  directory: string,
): string => {
  const at = `${relative(directory, gap.file)}:${gap.line}`;
  switch (gap.type) {
    case "UncoveredLine":
      return `${at}: line never ran`;
    case "UncoveredFunction":
      return `${at}: function ${gap.name} never ran`;
    case "UncoveredBranch": {
      const outcome =
        gap.never === "evaluated" ? "never evaluated" : `never ${gap.never}`;
      const expansion =
        gap.expandedAt == null
          ? ""
          : `, expanded at ${relative(directory, gap.expandedAt.file)}:${gap.expandedAt.line}`;
      return `${at}:${gap.column}: condition ${outcome}${expansion}`;
    }
  }
};

/**
 * Runs the LLVM tool named `name` that clang `cc` uses, so its profile format
 * matches the compiler's, and returns its standard output, which can exceed
 * spawnSync's default limit.
 */
const llvmTool = (
  cc: string,
  name: string,
  args: ReadonlyArray<string>,
): string => {
  // clang prints the name as given when its own directory lacks the tool,
  // which then runs from PATH.
  const tool = run(cc, [`-print-prog-name=${name}`]).trim();
  const result = spawnSync(tool, args, {
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
  if (result.error)
    throw new Error(`${cc} has no ${name}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${tool} exited with ${result.status}\n${result.stderr}`);
  return result.stdout;
};

/** The parts of `llvm-cov export -format=text`'s JSON read above. */
interface LlvmCovExport {
  readonly data: readonly [
    {
      readonly files: ReadonlyArray<{
        readonly filename: string;
        readonly branches: ReadonlyArray<LlvmCovBranch>;
        readonly expansions: ReadonlyArray<{
          readonly filenames: ReadonlyArray<string>;
          readonly source_region: ReadonlyArray<number>;
          readonly branches: ReadonlyArray<LlvmCovBranch>;
        }>;
      }>;
      readonly functions: ReadonlyArray<{
        readonly name: string;
        readonly count: number;
        readonly regions: ReadonlyArray<ReadonlyArray<number>>;
        readonly filenames: ReadonlyArray<string>;
      }>;
      readonly totals: Record<
        "lines" | "functions" | "branches",
        { readonly count: number; readonly covered: number }
      >;
    },
  ];
}

/**
 * Line and column where the condition starts, then where it ends, how often it
 * was true, how often false, and its file's index in the record's filenames.
 */
type LlvmCovBranch = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  ...Array<number>,
];
