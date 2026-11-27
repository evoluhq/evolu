import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { shouldRunSqliteCore } from "./select-sqlite-core.mts";

const git = (cwd: string, ...args: Array<string>): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const setupRepository = (t: TestContext) => {
  const root = mkdtempSync(join(tmpdir(), "evolu-select-sqlite-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin");
  mkdirSync(origin);
  git(origin, "init", "-q");
  git(origin, "config", "user.email", "ci@example.org");
  git(origin, "config", "user.name", "CI Test");
  writeFileSync(join(origin, "README.md"), "baseline\n");
  git(origin, "add", ".");
  git(origin, "commit", "-qm", "Baseline");
  const base = git(origin, "rev-parse", "HEAD");
  const clone = join(root, "checkout");
  git(root, "clone", "-q", origin, clone);
  git(clone, "config", "user.email", "ci@example.org");
  git(clone, "config", "user.name", "CI Test");
  const write = (path: string) => {
    const file = join(clone, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "changed: " + path + "\n");
  };
  const commit = () => {
    git(clone, "add", "-A");
    git(clone, "commit", "-qm", "Changed files");
  };
  return { base, clone, write, commit };
};

const shouldRun = (
  repo: ReturnType<typeof setupRepository>,
  event = "push",
  base = repo.base,
) => shouldRunSqliteCore({ event, base, cwd: repo.clone });

describe("shouldRunSqliteCore", () => {
  it("defaults to full validation in the reusable Checks workflow", () => {
    const checks = readFileSync(
      new URL("../.github/workflows/checks.yaml", import.meta.url),
      "utf8",
    );
    assert.match(
      checks,
      /skip-sqlite-core:\n        type: boolean\n        default: false/u,
    );
    assert.match(
      checks,
      /\n  sqlite-core:\n    if: \$\{\{ !inputs\.skip-sqlite-core \}\}/u,
    );
    assert.match(
      checks,
      /\n  sqlite-core-c:\n    if: \$\{\{ !inputs\.skip-sqlite-core \}\}/u,
    );
  });

  it("skips SQLite core in Release only after a successful selection", () => {
    const release = readFileSync(
      new URL("../.github/workflows/release.yaml", import.meta.url),
      "utf8",
    );
    assert.match(
      release,
      /if: github\.repository == 'evoluhq\/evolu' && github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/u,
    );
    assert.match(
      release,
      /-f branch=main -f event=push -f status=success -f per_page=1/u,
    );
    assert.match(
      release,
      /needs\.select-sqlite-core\.result == 'success' && needs\.select-sqlite-core\.outputs\.skip == 'true'/u,
    );
  });

  for (const path of [
    "README.md",
    "docs/guide.mdx",
    "apps/web/src/page.tsx",
    "bench/type/index.mts",
    "examples/react-expo/App.tsx",
    ".changeset/fix.md",
    "packages/react-native/src/Sqlite.ts",
    "packages/sqlite-wasm/src/driver.ts",
  ])
    it("skips both jobs when only " + path + " changes", (t) => {
      const repo = setupRepository(t);
      repo.write(path);
      repo.commit();
      assert.equal(shouldRun(repo), false);
    });

  for (const path of [
    "packages/sqlite-core/src/evolu_crypto.c",
    "packages/sqlite-core/test/core.test.mts",
    "packages/sqlite-core/scripts/test.mts",
    "packages/common/src/Type.ts",
    "packages/nodejs/src/NativeSqlite.ts",
    "scripts/test-coverage.mts",
    "scripts/select-sqlite-core.mts",
    ".github/workflows/checks.yaml",
    "pnpm-lock.yaml",
    "package.json",
    "unexpected/new-file.dat",
  ])
    it("runs both jobs when " + path + " changes", (t) => {
      const repo = setupRepository(t);
      repo.write(path);
      repo.commit();
      assert.equal(shouldRun(repo), true);
    });

  it("runs after a relevant commit followed by an unrelated commit", (t) => {
    const repo = setupRepository(t);
    repo.write("packages/sqlite-core/src/crypto.c");
    repo.commit();
    repo.write("docs/new.md");
    repo.commit();
    assert.equal(shouldRun(repo), true);
  });

  it("runs for a mixed change", (t) => {
    const repo = setupRepository(t);
    repo.write("docs/new.md");
    repo.write("packages/sqlite-core/binding/core.c");
    repo.commit();
    assert.equal(shouldRun(repo), true);
  });

  it("runs for a renamed SQLite path even when moved to an unrelated directory", (t) => {
    const repo = setupRepository(t);
    repo.write("packages/sqlite-core/test/remove.mts");
    repo.commit();
    const preRename = git(repo.clone, "rev-parse", "HEAD");
    git(repo.clone, "push", "-q", "origin", "HEAD:refs/heads/baseline");
    mkdirSync(join(repo.clone, "docs"), { recursive: true });
    renameSync(
      join(repo.clone, "packages/sqlite-core/test/remove.mts"),
      join(repo.clone, "docs/remove.mts"),
    );
    repo.commit();
    assert.equal(shouldRun(repo, "push", preRename), true);
  });

  it("runs for a deleted SQLite path", (t) => {
    const repo = setupRepository(t);
    repo.write("packages/sqlite-core/test/delete.mts");
    repo.commit();
    const preDelete = git(repo.clone, "rev-parse", "HEAD");
    git(repo.clone, "push", "-q", "origin", "HEAD:refs/heads/baseline");
    unlinkSync(join(repo.clone, "packages/sqlite-core/test/delete.mts"));
    repo.commit();
    assert.equal(shouldRun(repo, "push", preDelete), true);
  });

  it("skips when the tested baseline and head have exactly the same tree", (t) => {
    const repo = setupRepository(t);
    assert.equal(shouldRun(repo), false);
  });

  it("runs without a valid last successful baseline", (t) => {
    const repo = setupRepository(t);
    assert.equal(shouldRun(repo, "push", ""), true);
    assert.equal(shouldRun(repo, "push", "0".repeat(40)), true);
    assert.equal(shouldRun(repo, "push", "not-a-sha"), true);
    assert.equal(shouldRun(repo, "push", "f".repeat(40)), true);
  });

  for (const event of ["workflow_dispatch", "pull_request", "merge_group"])
    it("never skips SQLite jobs for " + event, (t) => {
      const repo = setupRepository(t);
      repo.write("docs/guide.md");
      repo.commit();
      assert.equal(shouldRun(repo, event), true);
    });

  it("runs when the repository comparison is unavailable", (t) => {
    const repo = setupRepository(t);
    assert.equal(
      shouldRunSqliteCore({
        event: "push",
        base: repo.base,
        cwd: "/nonexistent",
      }),
      true,
    );
  });
});
