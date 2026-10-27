/**
 * What every runner does in Node.js before and after its target: reading the
 * workloads from the wa-sqlite clone, computing the reference every stack must
 * match, describing the machine, and writing the results.
 *
 * @module
 */
import { getOrThrow } from "@evolu/common";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, release, totalmem, type } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  contentChecksumSql,
  workloads,
  workloadsPath,
} from "../sqlite-wasm/workload.mts";
import {
  BenchResults,
  formatResults,
  resultsFormatVersion,
  type BenchReference,
  type TargetResult,
} from "./results.mts";
import {
  connectionPragmas,
  splitStatements,
  waSqliteCommit,
} from "./workload.mts";

/** The rounds of a run that the results can be published from. */
export const defaultRounds: Rounds = { warmupRounds: 1, measuredRounds: 5 };

export interface Rounds {
  readonly warmupRounds: number;
  readonly measuredRounds: number;
}

export const resultsDirectory = /*#__PURE__*/ new URL(
  "./results/",
  import.meta.url,
);

/** The workloads, read from a clone of wa-sqlite at {@link waSqliteCommit}. */
export interface LoadedWorkloads {
  readonly directory: string;
  /** The SQL of each workload file. */
  readonly sql: ReadonlyArray<string>;
  readonly statements: ReadonlyArray<ReadonlyArray<string>>;
  readonly sha256: string;
  readonly reference: BenchReference;
}

/**
 * Reads the workloads from the clone, which must be at {@link waSqliteCommit},
 * and computes the reference with `node:sqlite` in memory. In a container,
 * which has no git, the workloads must instead have the SHA-256 the host read.
 */
export const loadWorkloads = (
  waSqliteArgument: string | undefined,
  expectedSha256?: string,
): LoadedWorkloads => {
  if (waSqliteArgument == null)
    throw new Error(
      `The SQLite comparison needs a wa-sqlite clone at ${waSqliteCommit}: --wa-sqlite=<directory>. See bench/sqlite-comparison/README.md.`,
    );
  const directory = resolve(waSqliteArgument);
  if (expectedSha256 == null) {
    const head = execFileSync("git", ["-C", directory, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (head !== waSqliteCommit)
      throw new Error(
        `The wa-sqlite clone is at ${head}, not ${waSqliteCommit}.`,
      );
  }
  const sql = workloads.map((workload) =>
    readFileSync(join(directory, workloadsPath, workload.file), "utf8"),
  );
  const statements = sql.map(splitStatements);
  const sha256 = createHash("sha256")
    .update(JSON.stringify(statements))
    .digest("hex");
  if (expectedSha256 != null && sha256 !== expectedSha256)
    throw new Error(
      `The workloads' SHA-256 is ${sha256}, not ${expectedSha256}.`,
    );
  return {
    directory,
    sql,
    statements,
    sha256,
    reference: createReference(statements),
  };
};

/**
 * What every stack must produce, from the same statements run one at a time by
 * `node:sqlite` in memory.
 */
const createReference = (
  statements: ReadonlyArray<ReadonlyArray<string>>,
): BenchReference => {
  const database = new DatabaseSync(":memory:");
  try {
    for (const pragma of connectionPragmas(false)) database.exec(pragma);
    const selectValue = (sql: string): unknown => {
      const statement = database.prepare(sql);
      statement.setReturnArrays(true);
      return (statement.get() as ReadonlyArray<unknown> | undefined)?.[0];
    };
    const totalChanges: Array<number> = [];
    let contentChecksum = "";
    for (const [index, workload] of statements.entries()) {
      if (index === statements.length - 1)
        contentChecksum = String(selectValue(contentChecksumSql));
      for (const statement of workload) database.exec(statement);
      totalChanges.push(Number(selectValue("SELECT total_changes()")));
    }
    return { totalChanges, contentChecksum };
  } finally {
    database.close();
  }
};

/** The machine and Node.js that run the runner, as the environment notes it. */
export const describeMachine = (): Record<string, string> => {
  const [cpu] = cpus();
  return {
    CPU: `${cpu?.model ?? "unknown"}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GiB`,
    OS:
      process.platform === "darwin"
        ? `macOS ${execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim()} ${process.arch}`
        : `${type()} ${release()} ${process.arch}`,
    "Node.js": process.versions.node,
    ...(process.platform === "linux" ? { "C library": describeLibc() } : {}),
    Checkout: describeCheckout(),
    // The machine a container runs on, which it can't read.
    ...(process.env.EVOLU_BENCH_HOST == null ||
    process.env.EVOLU_BENCH_HOST === ""
      ? {}
      : { Host: process.env.EVOLU_BENCH_HOST }),
  };
};

/**
 * The commit of this checkout, and whether it has changes that aren't
 * committed, or what the host passed in `EVOLU_BENCH_CHECKOUT`, as into a
 * container, which has no git.
 */
export const describeCheckout = (): string => {
  const { EVOLU_BENCH_CHECKOUT: passed } = process.env;
  if (passed != null && passed !== "") return passed;
  const git = (args: ReadonlyArray<string>) =>
    execFileSync("git", ["-C", repositoryDirectory, ...args], {
      encoding: "utf8",
    }).trim();
  const commit = git(["rev-parse", "--short=9", "HEAD"]);
  return git(["status", "--porcelain", "--untracked-files=no"]) === ""
    ? commit
    : `${commit} with uncommitted changes`;
};

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));

/** The C library Node.js runs on, which its diagnostic report tells. */
const describeLibc = (): string => {
  const { header } = process.report.getReport() as {
    readonly header: { readonly glibcVersionRuntime?: string };
  };
  return header.glibcVersionRuntime == null
    ? "musl"
    : `glibc ${header.glibcVersionRuntime}`;
};

/** Validates the results and writes them as `<name>.json` and `<name>.md`. */
export const writeResults = ({
  name,
  targets,
  workloadSha256,
  rounds: { warmupRounds, measuredRounds },
}: {
  name: string;
  targets: ReadonlyArray<TargetResult>;
  workloadSha256: string;
  rounds: Rounds;
}): BenchResults => {
  const results = getOrThrow(
    BenchResults.fromUnknown({
      formatVersion: resultsFormatVersion,
      createdAt: new Date().toISOString(),
      configuration: {
        warmupRounds,
        measuredRounds,
        waSqliteCommit,
        workloadSha256,
        pragmas: connectionPragmas(false),
      },
      targets,
    }),
  );
  mkdirSync(resultsDirectory, { recursive: true });
  writeFileSync(
    new URL(`${name}.json`, resultsDirectory),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  writeFileSync(
    new URL(`${name}.md`, resultsDirectory),
    formatResults(results),
  );
  return results;
};
