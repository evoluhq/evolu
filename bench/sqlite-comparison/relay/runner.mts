/**
 * Runs the relay regression gate: the relay workload in two checkouts, the old
 * code and the new, each with its own install, in alternating order, a fresh
 * process and database per run. It fails, recording why, when a run fails or
 * returns other fingerprints, iterations or reads than the first run did.
 *
 * @module
 */
import { getOrThrow, NonNegativeInt } from "@evolu/common";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Rounds } from "../setup.mts";
import { describeMachine } from "../setup.mts";
import {
  compareRelayDigests,
  RelayResults,
  relayResultsFormatVersion,
  RelayRunOutput,
  type RelayCheckoutResult,
  type RelayRun,
} from "./results.mts";

const childPath = fileURLToPath(new URL("child.mts", import.meta.url));

/** Describes the checkout, which must have its dependencies installed. */
const describeCheckout = (
  directory: string,
): Omit<RelayCheckoutResult, "warmupRuns" | "runs"> => {
  const git = (args: ReadonlyArray<string>) =>
    execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
    }).trim();
  if (!existsSync(join(directory, "node_modules")))
    throw new Error(
      `${directory} has no node_modules. Run pnpm install --frozen-lockfile in it.`,
    );
  const hasEvoluSqlite = existsSync(
    join(directory, "packages/nodejs/src/NativeSqlite.ts"),
  );
  const betterSqliteVersion = (): string => {
    const require = createRequire(
      join(directory, "packages/nodejs/package.json"),
    );
    return (
      JSON.parse(
        readFileSync(require.resolve("better-sqlite3/package.json"), "utf8"),
      ) as { readonly version: string }
    ).version;
  };
  return {
    commit: git(["rev-parse", "HEAD"]),
    subject: git(["log", "-1", "--format=%s"]),
    isDirty: git(["status", "--porcelain", "--untracked-files=no"]) !== "",
    driver: hasEvoluSqlite
      ? "Evolu's SQLite (@evolu/nodejs's addon)"
      : `better-sqlite3 ${betterSqliteVersion()}`,
    storage: readFileSync(
      join(directory, "packages/common/src/local-first/Storage.ts"),
      "utf8",
    ).includes("evolu_skiplist")
      ? "Storage on the C skiplist functions"
      : "Storage on recursive CTEs",
  };
};

/** Runs the child in a fresh working directory and returns its output. */
const runChild = (repository: string): Promise<unknown> => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-relay-gate-"));
  return new Promise<unknown>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        childPath,
        `--repo=${repository}`,
      ],
      { cwd: directory, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `The run in ${repository} exited with ${signal ?? code}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      const lastLine = stdout.trim().split("\n").at(-1) ?? "";
      try {
        resolvePromise(JSON.parse(lastLine));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }).finally(() => {
    rmSync(directory, { recursive: true, force: true });
  });
};

export const runRelayGate = async ({
  base,
  head,
  rounds: { warmupRounds, measuredRounds },
  log,
}: {
  base: string;
  head: string;
  rounds: Rounds;
  log: (message: string) => void;
}): Promise<RelayResults> => {
  const directories = { base: resolve(base), head: resolve(head) };
  const checkouts = {
    base: describeCheckout(directories.base),
    head: describeCheckout(directories.head),
  };
  const runs = {
    base: { warmupRuns: [] as Array<RelayRun>, runs: [] as Array<RelayRun> },
    head: { warmupRuns: [] as Array<RelayRun>, runs: [] as Array<RelayRun> },
  };
  for (const side of ["base", "head"] as const)
    log(
      `${side}: ${directories[side]}, ${checkouts[side].driver}, ${checkouts[side].storage}`,
    );

  // Set inside runRound, so not narrowed to null.
  let first = null as RelayRunOutput | null;
  let error = null as string | null;
  const loadAveragesStart = loadavg();
  const runRound = async (round: number, isWarmup: boolean) => {
    // Alternated, so neither checkout always runs first.
    const order =
      round % 2 === 0
        ? (["base", "head"] as const)
        : (["head", "base"] as const);
    for (const [position, side] of order.entries()) {
      if (error != null) return;
      try {
        const output = getOrThrow(
          RelayRunOutput.fromUnknown(await runChild(directories[side])),
        );
        first ??= output;
        const difference = compareRelayDigests(output, first);
        if (difference != null) throw new Error(`${side}: ${difference}`);
        (isWarmup ? runs[side].warmupRuns : runs[side].runs).push({
          round: NonNegativeInt.orThrow(round),
          position: NonNegativeInt.orThrow(position),
          phasesMs: output.phasesMs,
          databaseBytes: output.databaseBytes,
        });
        log(
          `${side} ${isWarmup ? "warmup" : "run"}-${round + 1}: ${Object.entries(
            output.phasesMs,
          )
            .map(([phase, ms]) => `${phase} ${ms.toFixed(0)}`)
            .join(", ")} ms`,
        );
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        log(`Failed: ${error}`);
      }
    }
  };
  for (let round = 0; round < warmupRounds; round++)
    await runRound(round, true);
  for (let round = 0; round < measuredRounds; round++)
    await runRound(round, false);

  return RelayResults.orThrow({
    formatVersion: relayResultsFormatVersion,
    createdAt: new Date().toISOString(),
    environment: describeMachine(),
    loadAverages: { start: loadAveragesStart, end: loadavg() },
    digests: first?.digests ?? { fingerprints: "", iterated: "", read: "" },
    sizeAfterWrites: first?.sizeAfterWrites ?? 0,
    base: { ...checkouts.base, ...runs.base },
    head: { ...checkouts.head, ...runs.head },
    error,
  });
};
