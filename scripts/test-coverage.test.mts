import { assertEqual } from "@evolu/common";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("test-coverage.mts", import.meta.url));

const nestedIfs = `export const f = (a, b) => {
  if (a) {
    if (b) {
      return "never";
    }
    return "a";
  }
  return "other";
};
`;

describe("test-coverage.mts", () => {
  it("reports a block that no test process runs", (t) => {
    const project = setupProject(t, {
      "mod.mjs": nestedIfs,
      // Runs if (a) but not if (b).
      "a.test.mjs": callingTest("f(true, false);\n  f(false, false);"),
      // Runs neither.
      "b.test.mjs": callingTest("f(false, false);"),
    });
    const args = [
      "--test-coverage-include=mod.mjs",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      "--test-coverage-lines=100",
      "a.test.mjs",
      "b.test.mjs",
    ];

    // Node.js 24.22.0 reports 100% and passes. Its merge drops the if (b)
    // block a.test.mjs reports as never run, because b.test.mjs reports the
    // if (a) block holding it as never run. When this fails, Node.js merges
    // coverage correctly, and the script can be deleted.
    const nodeResult = spawnSync(
      process.execPath,
      [
        "--experimental-default-config-file",
        "--experimental-test-coverage",
        "--test-reporter=lcov",
        ...args,
      ],
      { cwd: project.directory, encoding: "utf8", env: project.nodeEnv },
    );
    assertEqual(
      {
        status: nodeResult.status,
        totals: nodeResult.stdout.match(/^(?:BRF|BRH|LF|LH):\d+$/gmu),
      },
      { status: 0, totals: ["BRF:4", "BRH:4", "LH:9", "LF:9"] },
    );

    // The script reports what Node.js reports when one process runs both.
    const expected = {
      status: 1,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

mod.mjs: lines 77.78% (4-5), branches 80.00% (3), functions 100.00%

All files: lines 77.78%, branches 80.00%, functions 100.00%
Error: 77.78% line coverage does not meet threshold of 100%.
Error: 80.00% branch coverage does not meet threshold of 100%.
`,
    };
    assertEqual(project.nodeCoverage(args, "none"), expected);
    assertEqual(project.run(args), { ...expected, temporaryFiles: [] });
  });

  it("reports a never-run block that ranges of different processes cross", (t) => {
    const project = setupProject(t, {
      "mod.mjs": nestedIfs,
      // V8 leaves out if (a) and if (b), which ran as often as f, and joins
      // the never-run return "a" and the code after if (a) into one range.
      "a.test.mjs": callingTest("f(true, true);"),
      // Reports the if (a) block, which the joined range crosses, as never
      // run.
      "b.test.mjs": callingTest("f(false, false);"),
    });
    const args = [
      "--test-coverage-include=mod.mjs",
      "a.test.mjs",
      "b.test.mjs",
    ];

    // The script reports what Node.js reports when one process runs both.
    const expected = {
      status: 0,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

mod.mjs: lines 77.78% (6-7), branches 80.00% (5), functions 100.00%

All files: lines 77.78%, branches 80.00%, functions 100.00%
`,
    };
    assertEqual(project.nodeCoverage(args, "none"), expected);
    assertEqual(project.run(args), { ...expected, temporaryFiles: [] });
  });

  it("counts the branches the processes report, which one process can count differently", (t) => {
    const project = setupProject(t, {
      "mod.mjs": `export const f = (a, b) => {
  if (a) {
    if (b) {
      return 1;
    }
    return 2;
  }
  if (b) {
    return 3;
  }
  return 4;
};
`,
      "a.test.mjs": callingTest("f(false, false);"),
      // V8 joins the never-run code after the first if (b) and after if (a)
      // into one range, which crosses the if (a) block a.test.mjs reports.
      "b.test.mjs": callingTest("f(true, true);"),
    });
    const args = [
      "--test-coverage-include=mod.mjs",
      "a.test.mjs",
      "b.test.mjs",
    ];

    // One process also reports the code after the second if (b), which ran,
    // as a branch, and neither of these processes does. The uncovered lines
    // and branches match, the branch totals don't.
    assertEqual(project.nodeCoverage(args, "none"), {
      status: 0,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

mod.mjs: lines 66.67% (6-7 9-10), branches 71.43% (5 8), functions 100.00%

All files: lines 66.67%, branches 71.43%, functions 100.00%
`,
    });
    assertEqual(project.run(args), {
      status: 0,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

mod.mjs: lines 66.67% (6-7 9-10), branches 66.67% (5 8), functions 100.00%

All files: lines 66.67%, branches 66.67%, functions 100.00%
`,
      temporaryFiles: [],
    });
  });

  it("counts the files, lines, branches, and functions Node.js counts", (t) => {
    const project = setupProject(t, {
      "node.config.json": JSON.stringify({
        test: {
          "experimental-test-module-mocks": true,
          test: true,
          "test-coverage-exclude": ["excluded.mjs"],
        },
      }),
      "excluded.mjs": unusedFunction("excluded"),
      "excluded-by-argument.mjs": unusedFunction("excludedByArgument"),
      "excluded-by-path.mjs": unusedFunction("excludedByPath"),
      "node_modules/package/package.json": JSON.stringify({
        name: "package",
        type: "module",
        exports: "./index.mjs",
      }),
      "node_modules/package/index.mjs": unusedFunction("packaged"),
      "mocked.mjs": unusedFunction("mocked"),
      "mod.mjs": `import { excluded } from "./excluded.mjs";
import { excludedByArgument } from "./excluded-by-argument.mjs";
import { excludedByPath } from "./excluded-by-path.mjs";
import { packaged } from "package";

export const covered = () =>
  excluded() + excludedByArgument() + excludedByPath() + packaged();

/* node:coverage ignore next */
export const ignored = () => "ignored";

/* node:coverage ignore next 2 */
export const ignoredTwo = () =>
  "ignored";

/* node:coverage disable */
export const disabled = () => "disabled";
/* node:coverage enable */

export const uncovered = (a) => {
  if (a) return "a";
  return "b";
};
`,
      "mod.test.mjs": `import assert from "node:assert";
import { rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { covered } from "./mod.mjs";

test("covered", async (t) => {
  assert.strictEqual(covered(), 4);
  t.mock.module("./mocked.mjs", { namedExports: { mocked: () => 2 } });
  const { mocked } = await import("./mocked.mjs");
  assert.strictEqual(mocked(), 2);
  writeFileSync("deleted.mjs", "export const deleted = () => 1;\\n");
  const { deleted } = await import("./deleted.mjs");
  rmSync("deleted.mjs");
  assert.strictEqual(deleted(), 1);
});
`,
    });
    const args = [
      "--test-coverage-exclude",
      "excluded-by-argument.mjs",
      `--test-coverage-exclude=${join(realpathSync(project.directory), "excluded-by-path.mjs")}`,
      "mod.test.mjs",
    ];

    // Excludes from node.config.json and arguments, relative or absolute,
    // node_modules, the module mock.module created, and the deleted module
    // are left out, and ignored lines count as covered.
    const expected = {
      status: 0,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

mod.mjs: lines 91.30% (21-22), branches 100.00%, functions 80.00% (20)

All files: lines 94.74%, branches 100.00%, functions 85.71%
`,
    };
    assertEqual(project.nodeCoverage(args), expected);
    assertEqual(project.run(args), { ...expected, temporaryFiles: [] });
  });

  it("resolves coverage options as Node.js does", (t) => {
    const project = setupProject(t, {
      "node.config.json": JSON.stringify({
        test: {
          test: true,
          "test-coverage-include": ["a.mjs"],
          "test-coverage-exclude": ["b.mjs"],
          "test-coverage-functions": 100,
        },
      }),
      "a.mjs": unusedFunction("a"),
      "b.mjs": unusedFunction("b"),
      "c.mjs": unusedFunction("c"),
      "d.mjs": unusedFunction("d"),
      "t.test.mjs": `import assert from "node:assert";
import { test } from "node:test";
import { a } from "./a.mjs";
import { b } from "./b.mjs";
import { c } from "./c.mjs";
import { d } from "./d.mjs";

test("t", () => {
  assert.strictEqual(a() + b() + c() + d(), 4);
});
`,
    });

    // Includes and excludes from node.config.json and arguments combine, an
    // exclude beats an include, and the function threshold of node.config.json
    // applies.
    const combined = [
      "--test-coverage-include",
      "b.mjs",
      "--test-coverage-include=c.mjs",
      "t.test.mjs",
    ];
    const expectedCombined = {
      status: 1,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

a.mjs: lines 100.00%, branches 100.00%, functions 50.00% (2)
c.mjs: lines 100.00%, branches 100.00%, functions 50.00% (2)

All files: lines 100.00%, branches 100.00%, functions 50.00%
Error: 50.00% function coverage does not meet threshold of 100%.
`,
    };
    assertEqual(project.nodeCoverage(combined), expectedCombined);
    assertEqual(project.run(combined), {
      ...expectedCombined,
      temporaryFiles: [],
    });

    // A threshold argument overrides node.config.json.
    const overridden = ["--test-coverage-functions", "50", "t.test.mjs"];
    const expectedOverridden = {
      status: 0,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

a.mjs: lines 100.00%, branches 100.00%, functions 50.00% (2)

All files: lines 100.00%, branches 100.00%, functions 50.00%
`,
    };
    assertEqual(project.nodeCoverage(overridden), expectedOverridden);
    assertEqual(project.run(overridden), {
      ...expectedOverridden,
      temporaryFiles: [],
    });
  });

  it("leaves out test files without excludes, as Node.js does", (t) => {
    const project = setupProject(t, {
      "mod.mjs": unusedFunction("used"),
      "mod.test.mjs": `import assert from "node:assert";
import { test } from "node:test";
import { used } from "./mod.mjs";

const unused = () => 0;

test("t", () => {
  assert.strictEqual(used(), 1);
});
`,
    });
    const args = ["mod.test.mjs"];

    const expected = {
      status: 0,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

mod.mjs: lines 100.00%, branches 100.00%, functions 50.00% (2)

All files: lines 100.00%, branches 100.00%, functions 50.00%
`,
    };
    assertEqual(project.nodeCoverage(args), expected);
    assertEqual(project.run(args), { ...expected, temporaryFiles: [] });
  });

  it("passes at exactly the thresholds", (t) => {
    const project = setupProject(t, {
      "mod.mjs": `export const f = () => 1;
`,
      "mod.test.mjs": callingTest("f();"),
    });
    const args = [
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      "--test-coverage-lines=100",
      "mod.test.mjs",
    ];

    const expected = {
      status: 0,
      stdout: `
All files: lines 100.00%, branches 100.00%, functions 100.00%
`,
    };
    assertEqual(project.nodeCoverage(args), expected);
    assertEqual(project.run(args), { ...expected, temporaryFiles: [] });
  });

  it("rejects a missing value or an invalid threshold", (t) => {
    const project = setupProject(t, {
      "mod.test.mjs": `import { test } from "node:test";

test("t", () => {});
`,
    });

    for (const [args, error] of [
      [["--test-coverage-lines"], "--test-coverage-lines needs a value."],
      // As in Node.js, an argument starting with a dash is no value, so an
      // option after a missing one isn't taken as its value.
      [
        ["--test-coverage-exclude", "--test-coverage-lines=100"],
        "--test-coverage-exclude needs a value.",
      ],
      [
        ["--test-coverage-functions", "-5"],
        "--test-coverage-functions needs a value.",
      ],
      [
        ["--test-coverage-lines="],
        '--test-coverage-lines needs a number from 0 to 100, not "".',
      ],
      [
        ["--test-coverage-branches=abc"],
        '--test-coverage-branches needs a number from 0 to 100, not "abc".',
      ],
      [
        ["--test-coverage-functions", "101"],
        '--test-coverage-functions needs a number from 0 to 100, not "101".',
      ],
    ] as const) {
      const result = spawnSync(
        process.execPath,
        [scriptPath, "mod.test.mjs", ...args],
        { cwd: project.directory, encoding: "utf8", env: project.env },
      );
      assertEqual(
        {
          status: result.status,
          stdout: result.stdout,
          error: /^Error: (.*)$/mu.exec(result.stderr)?.[1],
        },
        { status: 1, stdout: "", error },
      );
    }
  });

  it("rejects a loaded file whose path has a dot segment", (t) => {
    const project = setupProject(t, {
      "src/.hidden/mod.mjs": unusedFunction("used"),
      "mod.test.mjs": `import assert from "node:assert";
import { test } from "node:test";
import { used } from "./src/.hidden/mod.mjs";

test("t", () => {
  assert.strictEqual(used(), 1);
});
`,
    });

    const result = spawnSync(process.execPath, [scriptPath, "mod.test.mjs"], {
      cwd: project.directory,
      encoding: "utf8",
      env: project.env,
    });

    // Node.js matches globs to dot segments of the relative path, which
    // path.matchesGlob can't, so the script fails rather than count it
    // differently.
    assertEqual(
      {
        status: result.status,
        error: /^Error: (.*)$/mu.exec(result.stderr)?.[1],
        temporaryFiles: readdirSync(project.env.TMPDIR),
      },
      {
        status: 1,
        error:
          "src/.hidden/mod.mjs: a path with a dot segment isn't supported, because Node.js matches globs to it differently.",
        temporaryFiles: [],
      },
    );
  });

  it("fails when a test fails", (t) => {
    const project = setupProject(t, {
      "mod.mjs": unusedFunction("used"),
      "failing.test.mjs": `import assert from "node:assert";
import { test } from "node:test";
import { used } from "./mod.mjs";

test("fails", () => {
  assert.strictEqual(used(), 2);
});
`,
    });
    const args = ["failing.test.mjs"];

    const expected = {
      status: 1,
      stdout: `
Coverage below 100%, with uncovered lines and the lines of uncovered branches and functions:

mod.mjs: lines 100.00%, branches 100.00%, functions 50.00% (2)

All files: lines 100.00%, branches 100.00%, functions 50.00%
`,
    };
    assertEqual(project.nodeCoverage(args), expected);
    assertEqual(project.run(args), { ...expected, temporaryFiles: [] });
  });

  it("stops the tests and removes their coverage when interrupted", async (t) => {
    const project = setupProject(t, {
      "waiting.test.mjs": `import { writeFileSync } from "node:fs";
import { test } from "node:test";

test("waits", async () => {
  writeFileSync("started", "");
  await new Promise((resolve) => setTimeout(resolve, 60_000));
});
`,
    });
    const script = spawn(process.execPath, [scriptPath, "waiting.test.mjs"], {
      cwd: project.directory,
      env: project.env,
      stdio: "ignore",
    });
    const exit = once(script, "exit");
    while (
      script.exitCode === null &&
      !existsSync(join(project.directory, "started"))
    )
      await setTimeout(10);
    assertEqual(script.exitCode, null);

    script.kill("SIGINT");

    assertEqual(await exit, [1, null]);
    assertEqual(readdirSync(project.env.TMPDIR), []);
  });
});

/** A test file calling `f` of `mod.mjs`. */
const callingTest = (
  calls: string,
): string => `import { test } from "node:test";
import { f } from "./mod.mjs";

test("calls f", () => {
  ${calls}
});
`;

/** A module exporting a function returning 1 and one nothing calls. */
const unusedFunction = (name: string): string =>
  `export const ${name} = () => 1;\nexport const unused = () => 2;\n`;

/**
 * Creates a project in a temporary directory, with a node.config.json running
 * tests unless the files include one, and runs the script or Node.js's own
 * coverage there, each with its own temporary directory.
 */
const setupProject = (
  t: TestContext,
  files: Readonly<Record<string, string>>,
) => {
  const root = mkdtempSync(join(tmpdir(), "test-coverage-test-"));
  t.after(() => {
    rmSync(root, { force: true, recursive: true });
  });
  const directory = join(root, "project");
  // Without the variable through which this test runner tells its child
  // processes apart, the script's tests run their own test runner. Without
  // FORCE_COLOR, which CI sets, the script's piped report stays plain text.
  const { NODE_TEST_CONTEXT: _, FORCE_COLOR: ___, ...inherited } = process.env;
  const env = { ...inherited, TMPDIR: join(root, "tmp") };
  mkdirSync(env.TMPDIR);
  // Without the coverage directory of the tests running this one, which
  // Node.js's own coverage would copy its files to.
  const { NODE_V8_COVERAGE: __, ...uncovered } = inherited;
  const nodeEnv = { ...uncovered, TMPDIR: env.TMPDIR };
  for (const [path, content] of Object.entries({
    "node.config.json": JSON.stringify({ test: { test: true } }),
    ...files,
  })) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  }

  return {
    directory,
    env,
    nodeEnv,
    run: (args: ReadonlyArray<string>) => {
      // Test results go to stderr, so stdout has only the coverage.
      const result = spawnSync(
        process.execPath,
        [
          scriptPath,
          "--test-reporter=dot",
          "--test-reporter-destination=stderr",
          ...args,
        ],
        { cwd: directory, encoding: "utf8", env },
      );
      return {
        status: result.status,
        stdout: result.stdout,
        temporaryFiles: readdirSync(env.TMPDIR),
      };
    },
    /**
     * What the script prints for the coverage Node.js reports itself, from its
     * lcov report and the threshold errors of its TAP report, and Node.js's
     * exit code.
     */
    nodeCoverage: (
      args: ReadonlyArray<string>,
      isolation: "process" | "none" = "process",
    ) => {
      const result = spawnSync(
        process.execPath,
        [
          "--experimental-default-config-file",
          "--experimental-test-coverage",
          `--test-isolation=${isolation}`,
          "--test-reporter=lcov",
          "--test-reporter-destination=stdout",
          "--test-reporter=tap",
          "--test-reporter-destination=stderr",
          ...args,
        ],
        { cwd: directory, encoding: "utf8", env: nodeEnv },
      );
      const totals: Record<
        "lines" | "branches" | "functions",
        [covered: number, total: number]
      > = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
      const rows: Array<string> = [];
      for (const record of result.stdout
        .split("end_of_record\n")
        .slice(0, -1)) {
        const values = (key: string) =>
          Array.from(
            record.matchAll(new RegExp(`^${key}:(.*)$`, "gmu")),
            ([, value]) => value.split(",").map(Number),
          );
        const count = (key: string) => values(key)[0][0];
        // Node.js leaves ignored lines out of DA.
        const lines = values("DA");
        const isIgnored = (line: number) => !lines.some(([n]) => n === line);
        const uncoveredLines = lines.filter(([, n]) => n === 0).map(([n]) => n);
        const uncoveredBranchLines = values("BRDA")
          .filter(([line, , , n]) => n === 0 && !isIgnored(line))
          .map(([line]) => line);
        const functionLines = values("FN").map(([line]) => line);
        const uncoveredFunctionLines = values("FNDA")
          .map(([n], i) => [n, functionLines[i]])
          .filter(([n, line]) => n === 0 && !isIgnored(line))
          .map(([, line]) => line);
        const file = {
          lines: [count("LH"), count("LF")],
          branches: [count("BRH"), count("BRF")],
          functions: [count("FNH"), count("FNF")],
        } as const;
        // What this reads from lcov adds up to what Node.js counts.
        assertEqual(
          [
            uncoveredLines.length,
            uncoveredBranchLines.length,
            uncoveredFunctionLines.length,
          ],
          [
            file.lines[1] - file.lines[0],
            file.branches[1] - file.branches[0],
            file.functions[1] - file.functions[0],
          ],
        );
        for (const metric of ["lines", "branches", "functions"] as const) {
          totals[metric][0] += file[metric][0];
          totals[metric][1] += file[metric][1];
        }
        if (
          uncoveredLines.length +
            uncoveredBranchLines.length +
            uncoveredFunctionLines.length >
          0
        )
          rows.push(
            `${record.match(/^SF:(.*)$/mu)?.[1]}: ` +
              `lines ${percentage(file.lines)}${lineRanges(uncoveredLines)}, ` +
              `branches ${percentage(file.branches)}${lineRanges(uncoveredBranchLines)}, ` +
              `functions ${percentage(file.functions)}${lineRanges(uncoveredFunctionLines)}\n`,
          );
      }
      const errors = Array.from(
        result.stderr.matchAll(/^# (Error: .+ does not meet threshold .+)$/gmu),
        ([, error]) => `${error}\n`,
      );
      return {
        status: result.status,
        stdout:
          (rows.length > 0
            ? `\nCoverage below 100%, with uncovered lines and the lines of uncovered branches and functions:\n\n${rows.join("")}`
            : "") +
          `\nAll files: lines ${percentage(totals.lines)}, branches ${percentage(totals.branches)}, functions ${percentage(totals.functions)}\n` +
          errors.join(""),
      };
    },
  };
};

const percentage = ([covered, total]: ReadonlyArray<number>): string =>
  `${(total === 0 ? 100 : (covered / total) * 100).toFixed(2)}%`;

/** Line numbers as ranges, such as " (4-5 9)". */
const lineRanges = (lineNumbers: ReadonlyArray<number>): string => {
  const ranges: Array<[number, number]> = [];
  for (const line of [...new Set(lineNumbers)].toSorted((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last?.[1] === line - 1) last[1] = line;
    else ranges.push([line, line]);
  }
  return ranges.length === 0
    ? ""
    : ` (${ranges.map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`)).join(" ")})`;
};
