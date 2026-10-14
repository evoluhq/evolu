/**
 * Stages the releases that changesets/action/pack packed, so each version
 * becomes public only after a maintainer approves it on npm with two-factor
 * authentication.
 *
 * The publish job of the release workflow passes this script to
 * changesets/action/publish, which runs it with `CHANGESETS_OUTPUT` set and
 * then creates a git tag and a GitHub release for each `git-tag` event the
 * script appends there. The tag marks a version as staged, as npm lists only
 * approved versions and CI's OIDC token can stage but not list staged ones. So
 * the script skips a release whose tag exists, which keeps a run started before
 * the approval from failing at it, as npm refuses to stage a version twice. A
 * rejected version keeps its tag and needs a new version: delete its GitHub
 * release, but keep the tag.
 *
 * Usage: `node scripts/stage-packages.mts <pack-dir>`, where `<pack-dir>` holds
 * the `publish-plan.json` and tarballs of changesets/action/pack. It stages the
 * releases in the plan's order, which puts dependencies first, and stops at the
 * first one npm fails to stage, exiting with 1. The action creates tags only
 * after the script exits, so a version staged in a run that was cancelled has
 * no tag, and npm refuses to stage it again: reject it on npm, then rerun.
 *
 * @module
 */

// Changesets cannot stage releases yet:
// https://github.com/changesets/changesets/issues/2025
// The job holding the OIDC token installs nothing, so the script imports only
// Node built-ins and does not validate the plan Changesets wrote in that run.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Release {
  readonly kind: string;
  readonly name: string;
  readonly version: string;
  readonly access: string;
  readonly tag: string;
  readonly tarball: { readonly path: string };
}

const [packDir] = process.argv.slice(2);
const output = process.env.CHANGESETS_OUTPUT;
if (packDir === undefined || output === undefined) {
  throw new Error(
    "Usage: CHANGESETS_OUTPUT=<file> node scripts/stage-packages.mts <pack-dir>",
  );
}
// The action warns about a missing output, which a run staging nothing has.
appendFileSync(output, "");

const { plan } = JSON.parse(
  readFileSync(join(packDir, "publish-plan.json"), "utf8"),
) as { readonly plan: ReadonlyArray<ReadonlyArray<Release>> };
const releases = plan.flat();

// The config versions private packages without tagging them, so Changesets
// plans no tag-only release.
for (const { kind, name } of releases) {
  if (kind !== "publish") {
    throw new Error(`Cannot stage the ${kind} release of ${name}`);
  }
}

const tags = new Set(
  execFileSync("git", ["ls-remote", "--tags", "origin"], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.split("\trefs/tags/")[1]),
);

for (const release of releases) {
  const tag = `${release.name}@${release.version}`;
  if (tags.has(tag)) {
    process.stdout.write(`Skipping ${tag}, which is tagged, so staged.\n`);
    continue;
  }
  // npm rejects a prerelease version, such as 3.54.0-build1 of
  // @evolu/sqlite-wasm, without an explicit tag. Without --provenance, npm
  // adds provenance only after looking up the package's visibility and skips
  // it silently when that lookup fails. npm runs no lifecycle scripts for a
  // tarball, but a plan naming a directory
  // would make it run that directory's scripts in the job holding the OIDC
  // token, so --ignore-scripts comes last, where no plan value can override it.
  const result = spawnSync(
    "npm",
    [
      "stage",
      "publish",
      join(packDir, release.tarball.path),
      "--tag",
      release.tag,
      "--access",
      release.access,
      "--provenance",
      "--ignore-scripts",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    process.exitCode = 1;
    break;
  }
  appendFileSync(
    output,
    `${JSON.stringify({ type: "git-tag", tag, packageName: release.name })}\n`,
  );
}
