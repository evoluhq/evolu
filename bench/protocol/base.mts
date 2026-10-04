/**
 * The `--base=<ref>` option of the protocol benchmarks: parsing it and
 * extracting the ref into a snapshot the benchmark loads Evolu from.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * Removes `--base=<ref>` from `args`, so the strict mode parser does not see
 * it, and returns the ref, or null without one.
 */
export const parseBaseArgs = (
  args: ReadonlyArray<string>,
  benchmarkName: string,
): {
  readonly baseRef: string | null;
  readonly otherArgs: ReadonlyArray<string>;
} => {
  const baseArgs = args.filter(
    (arg) => arg === "--base" || arg.startsWith("--base="),
  );
  if (baseArgs.length > 1) {
    throw new Error(`The ${benchmarkName} benchmark accepts only one --base.`);
  }
  const baseRef = baseArgs.at(0)?.slice("--base=".length) ?? null;
  if (baseRef === "") {
    throw new Error("Pass the base as --base=<ref>, such as --base=HEAD.");
  }
  return {
    baseRef,
    otherArgs: args.filter((arg) => !baseArgs.includes(arg)),
  };
};

/**
 * Extracts `ref` into the gitignored `tmp/bench-base/<sha>` and returns it.
 *
 * The snapshot holds the sources and package.json files of `@evolu/common` and
 * `@evolu/nodejs` without tests. Its own `node_modules/@evolu/common` links to
 * its `packages/common`, so its `@evolu/nodejs` sources do not resolve to the
 * working tree. Third-party packages resolve to the current install, which is
 * why a ref with another `pnpm-lock.yaml` is refused. An existing snapshot is
 * reused, and `created` tells whether this call extracted it.
 */
export const materializeBase = (
  ref: string,
): {
  readonly sha: string;
  readonly root: string;
  readonly created: boolean;
} => {
  if (ref.startsWith("-")) throw new Error(`Invalid base ref: ${ref}`);
  const revParse = runGit([
    "rev-parse",
    "--verify",
    "--quiet",
    `${ref}^{commit}`,
  ]);
  const sha = revParse.stdout.toString().trim();
  if (revParse.status !== 0 || sha === "") {
    throw new Error(`The base ref ${ref} does not name a commit.`);
  }

  // The lockfile records every workspace package's dependencies, while a
  // release changes only package.json versions, which the snapshot keeps.
  const lockfileDiff = runGit([
    "diff",
    "--name-only",
    sha,
    "--",
    "pnpm-lock.yaml",
  ]);
  if (lockfileDiff.status !== 0) {
    throw new Error(`git diff failed: ${lockfileDiff.stderr.toString()}`);
  }
  if (lockfileDiff.stdout.toString().trim() !== "") {
    throw new Error(
      `The base reuses the current install, so it must have the same dependencies, but pnpm-lock.yaml differs from ${ref}.`,
    );
  }

  const root = join(repoRoot, "tmp", "bench-base", sha);
  if (existsSync(root)) return { sha, root, created: false };

  // Extracting into a staging directory keeps an interrupted run from leaving
  // a partial snapshot to reuse.
  const staging = `${root}.partial-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, "node_modules", "@evolu"), { recursive: true });
  const archive = runGit([
    "archive",
    "--format=tar",
    sha,
    "--",
    "packages/common/package.json",
    "packages/common/src",
    "packages/nodejs/package.json",
    "packages/nodejs/src",
    ":(exclude)*.test.ts",
  ]);
  if (archive.status !== 0) {
    throw new Error(`git archive failed: ${archive.stderr.toString()}`);
  }
  const extract = spawnSync("tar", ["-x", "-f", "-", "-C", staging], {
    input: archive.stdout,
  });
  if (extract.status !== 0) {
    throw new Error(`tar failed: ${extract.stderr.toString()}`);
  }
  symlinkSync(
    join("..", "..", "packages", "common"),
    join(staging, "node_modules", "@evolu", "common"),
  );
  try {
    renameSync(staging, root);
  } catch (error) {
    // Another run created the same snapshot first.
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(root)) throw error;
  }
  return { sha, root, created: true };
};

const runGit = (args: ReadonlyArray<string>) =>
  spawnSync("git", args, {
    cwd: repoRoot,
    // Read-only commands must not refresh the index either.
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 1024 ** 3,
  });
