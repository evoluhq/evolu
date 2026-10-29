/**
 * Compares the upstream inputs Evolu's SQLite core pins, SQLite's source zip,
 * BearSSL's commit and Monocypher's release, and the libraries Evolu's
 * benchmarks measure it against, with the latest of each upstream, so a newer
 * one doesn't go unnoticed. Upgrading stays a reviewed change.
 *
 * The libraries solve what Evolu's own code solves: msgpackr encodes
 * MessagePack, better-sqlite3 is a Node.js SQLite addon,
 * `@sqlite.org/sqlite-wasm` and wa-sqlite run SQLite in the browser with
 * synchronous OPFS VFSes, and op-sqlite is a React Native SQLite binding. Their
 * fixes can show bugs Evolu's code has too, so each of their rows links to the
 * commits since the pin.
 *
 * Usage: `node scripts/check-upstream-pins.mts` in the repository root prints a
 * Markdown report. With `--issue`, as the weekly Upstream pins workflow runs
 * it, it also opens or updates the repository's one issue listing the pins
 * behind, or closes it once none is, through the GitHub CLI.
 *
 * @module
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** A pinned upstream input and the latest its upstream has. */
export interface UpstreamPin {
  readonly name: string;
  readonly pinned: string;
  readonly latest: string;
  /** The file that holds the pin, relative to the repository root. */
  readonly file: string;
  /** A page listing what changed between the pinned and the latest version. */
  readonly changes?: string;
}

/**
 * Reads the latest SQLite release from the line sqlite.org's download page
 * gives its source zip for scripts.
 */
export const downloadPageToSqliteVersion = (downloadPage: string): string =>
  match(downloadPage, /^PRODUCT,(\d+\.\d+\.\d+),\d+\/sqlite-src-\d+\.zip,/mu);

/**
 * Reads the highest release tag from the output of `git ls-remote --tags`: an
 * `x.y.z` tag, also with a `v` prefix, which it leaves out, or a `-build<n>`
 * suffix, which it keeps.
 */
export const lsRemoteToLatestTag = (lsRemote: string): string => {
  const versions = [
    ...lsRemote.matchAll(
      /refs\/tags\/v?((\d+)\.(\d+)\.(\d+)(?:-build(\d+))?)$/gmu,
    ),
  ].toSorted((a, b) => {
    // A tag without a build number sorts before the builds of its version.
    for (const index of [2, 3, 4, 5]) {
      const difference = Number(a[index] ?? -1) - Number(b[index] ?? -1);
      if (difference !== 0) return difference;
    }
    return 0;
  });
  const latest = versions.at(-1);
  if (latest == null) throw new Error("No release tag");
  return latest[1];
};

/** Reads the pinned BearSSL commit from its vendor README. */
export const readmeToBearSslPin = (readme: string): string =>
  match(readme, /Pinned commit: `([0-9a-f]{40})`/u);

/** Reads the pinned Monocypher release from its vendor README. */
export const readmeToMonocypherPin = (readme: string): string =>
  match(readme, /Release: (\d+\.\d+\.\d+),/u);

/** Reads the version a package.json pins exactly for the dependency `name`. */
export const packageJsonToPin = (packageJson: string, name: string): string =>
  match(
    packageJson,
    new RegExp(
      `"${name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}": "(\\d+\\.\\d+\\.\\d+(?:-build\\d+)?)"`,
      "u",
    ),
  );

/** Reads the wa-sqlite commit the SQLite comparison reads its workloads from. */
export const workloadToWaSqlitePin = (workload: string): string =>
  match(workload, /waSqliteCommit = "([0-9a-f]{40})"/u);

/** A Markdown table of the pins behind their upstreams, then the current ones. */
export const pinsToReport = (pins: ReadonlyArray<UpstreamPin>): string => {
  const behind = pins.filter((pin) => pin.pinned !== pin.latest);
  const current = pins
    .filter((pin) => pin.pinned === pin.latest)
    .map((pin) => pin.name);
  if (behind.length === 0)
    return `All upstream pins are current: ${current.join(", ")}.`;
  return [
    "| Pin | Pinned | Latest | File |",
    "| --- | --- | --- | --- |",
    ...behind.map(
      (pin) =>
        `| ${pin.name} | ${pin.pinned} | ${pin.changes == null ? pin.latest : `[${pin.latest}](${pin.changes})`} | \`${pin.file}\` |`,
    ),
    ...(current.length > 0
      ? [
          "",
          `${current.join(", ")} ${current.length > 1 ? "are" : "is"} current.`,
        ]
      : []),
  ].join("\n");
};

const match = (text: string, pattern: RegExp): string => {
  const found = pattern.exec(text);
  if (found?.[1] == null) throw new Error(`No match for ${String(pattern)}`);
  return found[1];
};

const issueTitle = "Upstream pins are behind";

if (import.meta.main) {
  // Imported here, so the tests, which pnpm test:unit measures, don't load the
  // SQLite core's build scripts.
  const { sqliteSource } =
    await import("../packages/sqlite-core/scripts/sqlite-source.mts");
  const root = new URL("../", import.meta.url);
  const vendor = (path: string) =>
    readFileSync(new URL(`packages/sqlite-core/vendor/${path}`, root), "utf8");
  const lsRemote = (...args: ReadonlyArray<string>) =>
    execFileSync("git", ["ls-remote", ...args], { encoding: "utf8" });
  const downloadPage = await fetch("https://sqlite.org/download.html");
  if (!downloadPage.ok)
    throw new Error(`sqlite.org download page: HTTP ${downloadPage.status}`);
  const read = (path: string) => readFileSync(new URL(path, root), "utf8");
  // A library a benchmark measures Evolu against, pinned exactly in the
  // package.json `file` and released as tags of the GitHub `repo`.
  const library = (
    name: string,
    file: string,
    repo: string,
    tagPrefix: string,
  ): UpstreamPin => {
    const pinned = packageJsonToPin(read(file), name);
    const latest = lsRemoteToLatestTag(
      lsRemote("--tags", `https://github.com/${repo}`),
    );
    return {
      name,
      pinned,
      latest,
      file,
      changes: `https://github.com/${repo}/compare/${tagPrefix}${pinned}...${tagPrefix}${latest}`,
    };
  };
  const waSqlitePin = workloadToWaSqlitePin(
    read("bench/sqlite-comparison/workload.mts"),
  );
  const waSqliteLatest = match(
    lsRemote("https://github.com/rhashimoto/wa-sqlite", "HEAD"),
    /^([0-9a-f]{40})\tHEAD$/mu,
  );

  const pins: ReadonlyArray<UpstreamPin> = [
    {
      name: "SQLite",
      pinned: sqliteSource.version,
      latest: downloadPageToSqliteVersion(await downloadPage.text()),
      file: "packages/sqlite-core/scripts/sqlite-source.mts",
    },
    {
      name: "BearSSL",
      pinned: readmeToBearSslPin(vendor("bearssl/README.md")),
      latest: match(
        lsRemote("https://www.bearssl.org/git/BearSSL", "HEAD"),
        /^([0-9a-f]{40})\tHEAD$/mu,
      ),
      file: "packages/sqlite-core/vendor/bearssl/README.md",
    },
    {
      name: "Monocypher",
      pinned: readmeToMonocypherPin(vendor("monocypher/README.md")),
      latest: lsRemoteToLatestTag(
        lsRemote("--tags", "https://github.com/LoupVaillant/Monocypher"),
      ),
      file: "packages/sqlite-core/vendor/monocypher/README.md",
    },
    library("msgpackr", "package.json", "kriszyp/msgpackr", "v"),
    library(
      "better-sqlite3",
      "bench/sqlite-comparison/package.json",
      "WiseLibs/better-sqlite3",
      "v",
    ),
    library(
      "@sqlite.org/sqlite-wasm",
      "bench/sqlite-comparison/package.json",
      "sqlite/sqlite-wasm",
      "",
    ),
    {
      name: "wa-sqlite",
      pinned: waSqlitePin,
      latest: waSqliteLatest,
      file: "bench/sqlite-comparison/workload.mts",
      changes: `https://github.com/rhashimoto/wa-sqlite/compare/${waSqlitePin}...${waSqliteLatest}`,
    },
    library(
      "@op-engineering/op-sqlite",
      "bench/sqlite-comparison/react-native/app/package.json",
      "OP-Engineering/op-sqlite",
      "",
    ),
  ];
  const report = pinsToReport(pins);
  process.stdout.write(`${report}\n`);

  if (process.argv.includes("--issue")) {
    const gh = (args: ReadonlyArray<string>, input?: string) =>
      execFileSync("gh", args, { encoding: "utf8", input });
    // The number of the open issue with exactly this title, or "".
    const open = gh([
      "issue",
      "list",
      "--state",
      "open",
      "--search",
      `in:title "${issueTitle}"`,
      "--json",
      "number,title",
      "--jq",
      `[.[] | select(.title == "${issueTitle}")][0].number // ""`,
    ]).trim();
    const isBehind = pins.some((pin) => pin.pinned !== pin.latest);
    const body = `${report}\n\nThe weekly Upstream pins workflow keeps this issue up to date.\n`;
    if (isBehind && open !== "")
      gh(["issue", "edit", open, "--body-file", "-"], body);
    else if (isBehind)
      gh(["issue", "create", "--title", issueTitle, "--body-file", "-"], body);
    else if (open !== "") gh(["issue", "close", open, "--comment", report]);
  }
}
