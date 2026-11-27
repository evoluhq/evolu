/**
 * Selects SQLite core CI jobs for a Release push by comparing the current tree
 * with the latest successful Release push on main. A successful run is the last
 * known tested baseline, not merely the preceding push: failed or superseded
 * pushes must never cause us to skip previously untested changes.
 *
 * Only paths known not to influence the SQLite core jobs are exempted. Any
 * unknown, cross-package, toolchain, test, or workflow change runs both jobs.
 * The checkout is shallow, so fetch the tested baseline before diffing. A
 * missing baseline or failed fetch/diff always runs both jobs.
 *
 * Usage: node scripts/select-sqlite-core.mts --event=push --base=<sha> Writes
 * skip=true/false to GITHUB_OUTPUT, or stdout when run locally.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

const unrelatedPrefixes = [
  ".changeset/",
  "apps/",
  "bench/",
  "docs/",
  "examples/",
  "packages/react-native/",
  "packages/sqlite-wasm/",
];

const unrelatedFiles = new Set(["README.md", "LICENSE"]);

const isUnrelatedToSqliteCore = (path: string): boolean =>
  unrelatedFiles.has(path) ||
  unrelatedPrefixes.some((prefix) => path.startsWith(prefix));

/** Returns false only when skipping the SQLite core jobs is provably safe. */
export const shouldRunSqliteCore = ({
  event,
  base,
  cwd,
}: {
  event: string;
  base: string;
  cwd: string;
}): boolean => {
  if (event !== "push" || !/^[0-9a-f]{40}$/u.test(base) || /^0+$/u.test(base))
    return true;

  const fetched = spawnSync(
    "git",
    ["fetch", "--quiet", "--no-tags", "--depth=1", "origin", base],
    { cwd, encoding: "utf8" },
  );
  if (fetched.status !== 0 || fetched.error != null) return true;

  // With --no-renames, both sides of a rename appear as paths; a rename into
  // or out of SQLite core thus remains relevant. -z preserves Unicode names.
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "-z", "--no-renames", base, "HEAD"],
    { cwd, encoding: "utf8" },
  );
  if (diff.status !== 0 || diff.error != null) return true;

  return diff.stdout
    .split("\0")
    .filter((path) => path !== "")
    .some((path) => !isUnrelatedToSqliteCore(path));
};

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      event: { type: "string", default: "" },
      base: { type: "string", default: "" },
    },
  });
  const skip = !shouldRunSqliteCore({
    event: values.event,
    base: values.base,
    cwd: process.cwd(),
  });
  const output = "skip=" + skip + "\n";
  const { GITHUB_OUTPUT } = process.env;
  if (GITHUB_OUTPUT == null) process.stdout.write(output);
  else appendFileSync(GITHUB_OUTPUT, output);
}
