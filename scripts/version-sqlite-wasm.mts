/**
 * Versions `@evolu/sqlite-wasm` like SQLite's own npm package: the version of
 * SQLite the package builds, followed by `-build<n>`, which numbers Evolu's
 * builds of that SQLite release.
 *
 * Changesets cannot compute such versions, so it bumps the package by semver,
 * and this script, which runs after `changeset version`, replaces the version
 * Changesets computed with the next build in the package's `package.json` and
 * `CHANGELOG.md` and in the changelogs that list it as an updated dependency.
 * Packages depend on it with `workspace:*`, which pnpm replaces with the
 * version when it packs them, so no other `package.json` holds the version.
 *
 * Usage: `node scripts/version-sqlite-wasm.mts` in the repository root, which
 * the root `version` script runs after `changeset version`. The last release is
 * the version at `HEAD`, and the SQLite version is the `SQLITE_VERSION` of the
 * package, generated from the pins of the wasm build.
 *
 * @module
 */

import { getOrThrow, object, record, String, Unknown } from "@evolu/common";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SQLITE_VERSION } from "../packages/sqlite-wasm/src/Constants.ts";

/** The repository and versions {@link versionSqliteWasm} works with. */
export interface VersionSqliteWasmOptions {
  /** The repository root. */
  readonly directory: string;
  /** The SQLite version the build pins. */
  readonly sqliteVersion: string;
  /** The version of the last release, which `changeset version` bumped. */
  readonly releasedVersion: string;
  /** Changelogs that list updated dependencies, relative to `directory`. */
  readonly changelogs: ReadonlyArray<string>;
}

/**
 * Replaces the version Changesets computed for `@evolu/sqlite-wasm` with
 * {@link nextSqliteWasmVersion}: in its `package.json`, in the heading of its
 * `CHANGELOG.md`, and in the dependency lines of `changelogs`. It returns the
 * version, or null when Changesets did not bump the package. It writes nothing
 * unless the package's changelog has one heading for the computed version and,
 * once replaced, one for the next.
 */
export const versionSqliteWasm = ({
  directory,
  sqliteVersion,
  releasedVersion,
  changelogs,
}: VersionSqliteWasmOptions): string | null => {
  const packageJsonPath = "packages/sqlite-wasm/package.json";
  const changelogPath = "packages/sqlite-wasm/CHANGELOG.md";
  const read = (path: string): string =>
    readFileSync(join(directory, path), "utf8");

  const packageJson = getOrThrow(
    PackageJson.fromUnknown(JSON.parse(read(packageJsonPath))),
  );
  const computedVersion = packageJson.version;
  if (computedVersion === releasedVersion) return null;
  const nextVersion = nextSqliteWasmVersion(sqliteVersion, releasedVersion);

  const computedHeading = `## ${computedVersion}`;
  const nextHeading = `## ${nextVersion}`;
  const changelog = read(changelogPath);
  const computedHeadings = countLine(changelog, computedHeading);
  if (computedHeadings !== 1)
    throw new Error(
      `${changelogPath} has ${computedHeadings} headings ${computedHeading}, not 1.`,
    );
  const nextChangelog = replaceLine(changelog, computedHeading, nextHeading);
  // Running changeset version again before the last release is committed
  // would number the same build twice.
  if (countLine(nextChangelog, nextHeading) !== 1)
    throw new Error(`${changelogPath} already has a heading ${nextHeading}.`);

  const files = new Map([
    [
      packageJsonPath,
      `${JSON.stringify({ ...packageJson, version: nextVersion }, null, 2)}\n`,
    ],
    [changelogPath, nextChangelog],
  ]);
  for (const path of changelogs) {
    const text = read(path);
    const nextText = replaceLine(
      text,
      `  - @evolu/sqlite-wasm@${computedVersion}`,
      `  - @evolu/sqlite-wasm@${nextVersion}`,
    );
    if (nextText !== text) files.set(path, nextText);
  }

  for (const [path, text] of files) writeFileSync(join(directory, path), text);
  return nextVersion;
};

const PackageJson = object({ version: String }, record(String, Unknown));

const countLine = (text: string, line: string): number =>
  text.split("\n").filter((each) => each === line).length;

const replaceLine = (text: string, line: string, replacement: string): string =>
  text
    .split("\n")
    .map((each) => (each === line ? replacement : each))
    .join("\n");

/**
 * Returns the version that follows `releasedVersion`, the last release: the
 * next build when it is a build of `sqliteVersion`, and build 1 of
 * `sqliteVersion` otherwise.
 *
 * It throws when that version would not sort above `releasedVersion` in semver
 * order: when the build pins an older SQLite than the last release, or when the
 * build number gains a digit, because semver compares `build10` and `build9` as
 * text.
 */
export const nextSqliteWasmVersion = (
  sqliteVersion: string,
  releasedVersion: string,
): string => {
  const buildPrefix = `${sqliteVersion}-build`;
  const releasedBuild = releasedVersion.startsWith(buildPrefix)
    ? Number(releasedVersion.slice(buildPrefix.length))
    : 0;
  const nextVersion = `${buildPrefix}${releasedBuild + 1}`;
  if (!isVersionBelow(releasedVersion, nextVersion))
    throw new Error(
      `@evolu/sqlite-wasm ${nextVersion} would not sort above ${releasedVersion}, the last release, in semver order.`,
    );
  return nextVersion;
};

/**
 * Whether `a` sorts below `b` in semver order. Of prerelease versions, it
 * accepts only Evolu's builds.
 */
const isVersionBelow = (a: string, b: string): boolean => {
  const [aRelease, aBuild] = parseVersion(a);
  const [bRelease, bBuild] = parseVersion(b);
  const i = aRelease.findIndex((part, index) => part !== bRelease[index]);
  if (i !== -1) return aRelease[i] < bRelease[i];
  // A prerelease sorts below its release, and semver compares a prerelease
  // identifier with letters, such as build10, as text.
  return aBuild != null && (bBuild == null || aBuild < bBuild);
};

const parseVersion = (
  version: string,
): readonly [release: ReadonlyArray<number>, build: string | undefined] => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(build\d+))?$/u.exec(version);
  if (match == null)
    throw new Error(`${version} is neither x.y.z nor x.y.z-build<n>.`);
  return [match.slice(1, 4).map(Number), match[4]];
};

if (import.meta.main) {
  const git = (...args: ReadonlyArray<string>): string =>
    execFileSync("git", args, { encoding: "utf8" });
  const version = versionSqliteWasm({
    directory: process.cwd(),
    sqliteVersion: SQLITE_VERSION,
    // The version action resets the checkout to the commit it versions, whose
    // package.json holds the last release.
    releasedVersion: getOrThrow(
      PackageJson.fromUnknown(
        JSON.parse(git("show", "HEAD:./packages/sqlite-wasm/package.json")),
      ),
    ).version,
    // The changelog of a package released for the first time is untracked.
    changelogs: git(
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*CHANGELOG.md",
    )
      .split("\n")
      .filter((path) => path !== ""),
  });
  // oxlint-disable-next-line eslint/no-console -- Report the version.
  if (version != null) console.log(`Versioned @evolu/sqlite-wasm ${version}.`);
}
