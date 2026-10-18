/**
 * Compares the upstream inputs Evolu's SQLite core pins, SQLite's source zip,
 * BearSSL's commit and Monocypher's release, with the latest of each upstream,
 * so a newer one doesn't go unnoticed. Upgrading stays a reviewed change.
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
}

/**
 * Reads the latest SQLite release from the line sqlite.org's download page
 * gives its source zip for scripts.
 */
export const downloadPageToSqliteVersion = (downloadPage: string): string =>
  match(downloadPage, /^PRODUCT,(\d+\.\d+\.\d+),\d+\/sqlite-src-\d+\.zip,/mu);

/** Reads the highest `x.y.z` tag from the output of `git ls-remote --tags`. */
export const lsRemoteToLatestTag = (lsRemote: string): string => {
  const versions = [...lsRemote.matchAll(/refs\/tags\/(\d+)\.(\d+)\.(\d+)$/gmu)]
    .map((found) => found.slice(1, 4).map(Number))
    .toSorted((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const latest = versions.at(-1);
  if (latest == null) throw new Error("No release tag");
  return latest.join(".");
};

/** Reads the pinned BearSSL commit from its vendor README. */
export const readmeToBearSslPin = (readme: string): string =>
  match(readme, /Pinned commit: `([0-9a-f]{40})`/u);

/** Reads the pinned Monocypher release from its vendor README. */
export const readmeToMonocypherPin = (readme: string): string =>
  match(readme, /Release: (\d+\.\d+\.\d+),/u);

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
        `| ${pin.name} | ${pin.pinned} | ${pin.latest} | \`${pin.file}\` |`,
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
