/**
 * Runs Node.js tests and checks their coverage, counting lines, branches, and
 * functions as `--experimental-test-coverage` does in Node.js 24.22.0, but
 * merging the coverage of the test processes without hiding never-run blocks.
 * Delete it once the Node.js version in `.nvmrc` merges coverage correctly.
 *
 * Usage: `node scripts/test-coverage.mts <arguments>` runs `node
 * --experimental-default-config-file --no-experimental-test-coverage
 * <arguments>` with `NODE_V8_COVERAGE` set to a temporary directory, where
 * every process the tests start writes its V8 coverage. It takes the
 * `--test-coverage-include`, `-exclude`, `-lines`, `-branches` and `-functions`
 * options out of the arguments and resolves them with those of
 * `node.config.json` as Node.js does. It lists the files below 100%, with their
 * uncovered lines and the lines of their uncovered branches and functions, and
 * fails when a test fails or a threshold is not met. It also fails on a loaded
 * file whose path relative to the working directory has a segment starting with
 * a dot, which Node.js matches to globs differently.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, matchesGlob, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";

interface Offsets {
  readonly startOffset: number;
  readonly endOffset: number;
}

interface Range extends Offsets {
  readonly count: number;
}

interface FunctionCoverage {
  readonly functionName: string;
  readonly ranges: ReadonlyArray<Range>;
  readonly isBlockCoverage: boolean;
}

interface Line {
  readonly line: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly ignore: boolean;
  count: number;
}

// Each metric and its name in the messages of Node.js.
const metrics = {
  lines: "line",
  branches: "branch",
  functions: "function",
} as const;
type Metric = keyof typeof metrics;

const toPercentage = ([covered, total]: readonly [number, number]): number =>
  total === 0 ? 100 : (covered / total) * 100;

const formatPercentage = (ratio: readonly [number, number]): string =>
  `${toPercentage(ratio).toFixed(2)}%`;

// Formats line numbers as ranges, such as " (4-5 9)".
const formatLines = (lineNumbers: Iterable<number>): string => {
  const ranges: Array<[number, number]> = [];
  for (const line of [...lineNumbers].toSorted((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last?.[1] === line - 1) last[1] = line;
    else ranges.push([line, line]);
  }
  if (ranges.length === 0) return "";
  const formatted = ranges.map(([first, last]) =>
    first === last ? `${first}` : `${first}-${last}`,
  );
  return ` (${formatted.join(" ")})`;
};

// Ranges hold their nested ranges, so the longest come first.
const byLengthDescending = (a: Offsets, b: Offsets): number =>
  b.endOffset - b.startOffset - (a.endOffset - a.startOffset);

// Whether a starts before b and ends inside it.
const crosses = (a: Offsets, b: Offsets): boolean =>
  a.startOffset < b.startOffset &&
  b.startOffset < a.endOffset &&
  a.endOffset < b.endOffset;

const distinctOffsets = (
  ranges: ReadonlyArray<Offsets>,
): ReadonlyArray<Offsets> => [
  ...new Map(
    ranges.map(({ startOffset, endOffset }) => [
      `${startOffset}:${endOffset}`,
      { startOffset, endOffset },
    ]),
  ).values(),
];

const toThreshold = (option: string, value: string | number): number => {
  const threshold = value === "" ? Number.NaN : Number(value);
  if (!(threshold >= 0 && threshold <= 100))
    throw new Error(
      `${option} needs a number from 0 to 100, not ${JSON.stringify(value)}.`,
    );
  return threshold;
};

const cwd = process.cwd();

// As in Node.js, includes and excludes of node.config.json and arguments
// combine, a threshold argument overrides node.config.json, and without
// excludes, the patterns of test files are excluded.
const { test: config = {} } = JSON.parse(
  readFileSync("node.config.json", "utf8"),
) as {
  readonly test?: Partial<
    Record<`test-coverage-${"include" | "exclude"}`, ReadonlyArray<string>> &
      Record<`test-coverage-${Metric}`, number>
  >;
};
const globs = {
  include: [...(config["test-coverage-include"] ?? [])],
  exclude: [...(config["test-coverage-exclude"] ?? [])],
};
const thresholds: Record<Metric, number> = {
  lines: 0,
  branches: 0,
  functions: 0,
};
for (const metric of Object.keys(metrics) as Array<Metric>) {
  const value = config[`test-coverage-${metric}`];
  if (value !== undefined)
    thresholds[metric] = toThreshold(`test-coverage-${metric}`, value);
}
const nodeArgs: Array<string> = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const option =
    /^--test-coverage-(?<name>include|exclude|lines|branches|functions)(?:=(?<value>.*))?$/u.exec(
      args[i],
    )?.groups;
  if (option == null) {
    nodeArgs.push(args[i]);
    continue;
  }
  const name = `--test-coverage-${option.name}`;
  // As in Node.js, an argument starting with a dash is no value.
  const value =
    option.value ?? (args[i + 1]?.startsWith("-") ? undefined : args[++i]);
  if (value === undefined) throw new Error(`${name} needs a value.`);
  if (option.name === "include" || option.name === "exclude")
    globs[option.name].push(value);
  else thresholds[option.name as Metric] = toThreshold(name, value);
}
if (globs.exclude.length === 0)
  globs.exclude.push(
    "**/{test,test/**/*,test-*,*[._-]test}.{js,mjs,cjs,ts,mts,cts}",
  );

// As in Node.js, globs match the path relative to the working directory or the
// absolute one, and modules mock.module creates are left out. Node.js lets
// globs match dot segments of the relative path, which path.matchesGlob
// can't, so such a path fails instead of counting differently.
const isCounted = (url: string): boolean => {
  if (!url.startsWith("file:")) return false;
  const path = fileURLToPath(url);
  const relativePath = relative(cwd, path);
  if (
    relativePath
      .split(sep)
      .some((segment) => segment.startsWith(".") && segment !== "..")
  )
    throw new Error(
      `${relativePath}: a path with a dot segment isn't supported, because Node.js matches globs to it differently.`,
    );
  const matches = (glob: string) =>
    matchesGlob(relativePath, glob) || matchesGlob(path, glob);
  if (globs.exclude.some(matches)) return false;
  if (globs.include.length > 0) return globs.include.some(matches);
  if (new URL(url).searchParams.get("node-test-mock")) return false;
  return !url.includes("/node_modules/");
};

// The coverage of each function of each counted script from every process
// that ran the script, by script URL and by function name and range.
const coveragesByFunctionByUrl = new Map<
  string,
  Map<string, Array<FunctionCoverage>>
>();
const directory = mkdtempSync(join(tmpdir(), "test-coverage-"));
let testsPassed: boolean;
try {
  const tests = spawn(
    process.execPath,
    [
      "--experimental-default-config-file",
      "--no-experimental-test-coverage",
      ...nodeArgs,
    ],
    { env: { ...process.env, NODE_V8_COVERAGE: directory }, stdio: "inherit" },
  );
  // Passes a signal on and waits for the tests to stop, so the directory,
  // which can take hundreds of megabytes, is removed.
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      tests.kill(signal);
    });
  const [code] = (await once(tests, "exit")) as [number | null];
  testsPassed = code === 0;

  for (const name of readdirSync(directory)) {
    const { result } = JSON.parse(
      readFileSync(join(directory, name), "utf8"),
    ) as {
      readonly result: ReadonlyArray<{
        readonly url: string;
        readonly functions: ReadonlyArray<FunctionCoverage>;
      }>;
    };
    for (const { url, functions } of result) {
      if (!isCounted(url)) continue;
      let coveragesByFunction = coveragesByFunctionByUrl.get(url);
      if (coveragesByFunction == null) {
        coveragesByFunction = new Map();
        coveragesByFunctionByUrl.set(url, coveragesByFunction);
      }
      for (const coverage of functions) {
        const [{ startOffset, endOffset }] = coverage.ranges;
        const key = `${coverage.functionName}:${startOffset}:${endOffset}`;
        const coverages = coveragesByFunction.get(key);
        if (coverages == null) coveragesByFunction.set(key, [coverage]);
        else coverages.push(coverage);
      }
    }
  }
} finally {
  rmSync(directory, { force: true, recursive: true });
}

const totals: Record<Metric, [covered: number, total: number]> = {
  lines: [0, 0],
  branches: [0, 0],
  functions: [0, 0],
};
const report: Array<string> = [];
for (const [url, coveragesByFunction] of [...coveragesByFunctionByUrl].toSorted(
  ([a], [b]) => a.localeCompare(b),
)) {
  const path = fileURLToPath(url);
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    // As in Node.js, a file deleted since, such as a test's, is left out.
    continue;
  }

  // As in Node.js, lines keep their line endings for offsets, and node:coverage
  // comments ignore lines.
  let ignoreCount = 0;
  let enabled = true;
  let offset = 0;
  const lines = source.split(/(?<=\r?\n)/u).map((text, index): Line => {
    const startOffset = offset;
    offset += text.length;
    const endOffset = startOffset + text.replace(/\r?\n$/u, "").length;
    const ignore = ignoreCount > 0 || !enabled;
    if (ignoreCount > 0) ignoreCount--;
    else if (!ignore) {
      const match = /\/\* node:coverage ignore next (?<count>\d+ )?\*\//u.exec(
        text,
      );
      if (match) ignoreCount = Number.parseInt(match.groups?.count ?? "1", 10);
    }
    const status = /\/\* node:coverage (?<status>enable|disable) \*\//u.exec(
      text,
    )?.groups?.status;
    if (status != null) {
      ignoreCount = 0;
      enabled = status === "enable";
    }
    const count = startOffset === endOffset ? 1 : 0;
    return { line: index + 1, startOffset, endOffset, ignore, count };
  });

  // Node.js 24.22.0 merges the ranges of the processes as sets. V8 leaves out
  // a block that ran as often as its parent, so when one process reports a
  // block as never run and another only a block nested in it, the merge drops
  // the nested block although no process ran it.
  // https://github.com/nodejs/node/issues/66860
  // As V8 does within a process, this counts each position with the count of
  // the innermost range holding it, and sums the processes.
  const functions = [...coveragesByFunction.values()]
    .map((coverages): FunctionCoverage => {
      const offsets = [
        ...new Set(
          coverages.flatMap(({ ranges }) =>
            ranges.flatMap((range) => [range.startOffset, range.endOffset]),
          ),
        ),
      ].toSorted((a, b) => a - b);
      const indexByOffset = new Map(offsets.map((offset, i) => [offset, i]));
      // The count of each segment between consecutive offsets. V8 lists the
      // ranges of a function outermost first.
      const counts = offsets.slice(1).fill(0);
      for (const { ranges } of coverages) {
        const processCounts = offsets.slice(1).fill(0);
        for (const { startOffset, endOffset, count } of ranges)
          processCounts.fill(
            count,
            indexByOffset.get(startOffset),
            indexByOffset.get(endOffset),
          );
        for (const [i, count] of processCounts.entries()) counts[i] += count;
      }

      // As in Node.js, the ranges the processes report are the branches. V8
      // joins adjacent ranges of equal count, also across a block it leaves
      // out, so a range of one process can cross a range of another. The
      // ranges are split where others cross them until they nest, and then a
      // range ran when any of its segments did, as a block runs only when the
      // blocks holding it do. So the branches are the reported ranges split
      // where they cross. One process running all tests can report more or
      // fewer, while the uncovered lines, branches, and functions match, so a
      // 100% branch threshold is exact, and a lower one compares with this
      // count.
      let ranges = distinctOffsets(coverages.flatMap(({ ranges }) => ranges));
      while (ranges.some((a) => ranges.some((b) => crosses(a, b)))) {
        const crossed = ranges;
        ranges = distinctOffsets(
          crossed.flatMap((range) => {
            const cuts = crossed.flatMap((other) =>
              crosses(other, range)
                ? [other.endOffset]
                : crosses(range, other)
                  ? [other.startOffset]
                  : [],
            );
            const ends = [...new Set([...cuts, range.endOffset])].toSorted(
              (a, b) => a - b,
            );
            return ends.map((endOffset, i) => ({
              startOffset: i === 0 ? range.startOffset : ends[i - 1],
              endOffset,
            }));
          }),
        );
      }
      return {
        functionName: coverages[0].functionName,
        isBlockCoverage: coverages.some((fn) => fn.isBlockCoverage),
        ranges: ranges
          .map(({ startOffset, endOffset }) => ({
            startOffset,
            endOffset,
            count: Math.max(
              ...counts.slice(
                indexByOffset.get(startOffset),
                indexByOffset.get(endOffset),
              ),
            ),
          }))
          .toSorted(byLengthDescending),
      };
    })
    .toSorted((a, b) => byLengthDescending(a.ranges[0], b.ranges[0]));

  // As in Node.js, a range sets the count of the lines it holds whole, so the
  // innermost one, processed last, sets it, and a range is covered when it ran
  // or all lines it touches are ignored. The first function is the module.
  const file: Record<Metric, [covered: number, total: number]> = {
    lines: [0, 0],
    branches: [0, 0],
    functions: [0, 0],
  };
  const uncoveredBranchLines = new Set<number>();
  const uncoveredFunctionLines = new Set<number>();
  for (const [
    functionIndex,
    { ranges, isBlockCoverage },
  ] of functions.entries())
    for (const range of ranges) {
      let first = lines.length;
      let low = 0;
      let high = lines.length - 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (range.startOffset < lines[middle].startOffset) high = middle - 1;
        else if (range.startOffset > lines[middle].endOffset) low = middle + 1;
        else {
          first = middle;
          break;
        }
      }
      const touched: Array<Line> = [];
      for (
        let i = first;
        i < lines.length && range.endOffset > lines[i].startOffset;
        i++
      ) {
        if (
          range.startOffset <= lines[i].startOffset &&
          range.endOffset >= lines[i].endOffset
        )
          lines[i].count = range.count;
        touched.push(lines[i]);
      }
      const covered = range.count !== 0 || touched.every((line) => line.ignore);
      if (isBlockCoverage) {
        file.branches[1]++;
        if (covered) file.branches[0]++;
        else uncoveredBranchLines.add(touched[0].line);
      }
      if (functionIndex > 0 && range === ranges[0]) {
        file.functions[1]++;
        if (covered) file.functions[0]++;
        else uncoveredFunctionLines.add(touched[0].line);
      }
    }
  const uncoveredLines = lines
    .filter((line) => line.count === 0 && !line.ignore)
    .map(({ line }) => line);
  file.lines = [lines.length - uncoveredLines.length, lines.length];
  for (const metric of Object.keys(metrics) as Array<Metric>) {
    totals[metric][0] += file[metric][0];
    totals[metric][1] += file[metric][1];
  }

  if (
    uncoveredLines.length > 0 ||
    uncoveredBranchLines.size > 0 ||
    uncoveredFunctionLines.size > 0
  )
    report.push(
      `${relative(cwd, path)}: ` +
        `lines ${formatPercentage(file.lines)}${formatLines(uncoveredLines)}, ` +
        `branches ${formatPercentage(file.branches)}${formatLines(uncoveredBranchLines)}, ` +
        `functions ${formatPercentage(file.functions)}${formatLines(uncoveredFunctionLines)}\n`,
    );
}

if (report.length > 0)
  process.stdout.write(
    `\n${styleText("bold", "Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:")}\n\n${report.join("")}`,
  );
process.stdout.write(
  `\nAll files: lines ${formatPercentage(totals.lines)}, branches ${formatPercentage(totals.branches)}, functions ${formatPercentage(totals.functions)}\n`,
);
let thresholdsMet = true;
for (const [metric, name] of Object.entries(metrics) as Array<
  [Metric, string]
>) {
  if (toPercentage(totals[metric]) >= thresholds[metric]) continue;
  thresholdsMet = false;
  process.stdout.write(
    `Error: ${formatPercentage(totals[metric])} ${name} coverage does not meet threshold of ${thresholds[metric]}%.\n`,
  );
}
process.exitCode = testsPassed && thresholdsMet ? 0 : 1;
