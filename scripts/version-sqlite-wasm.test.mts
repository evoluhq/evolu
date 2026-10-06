import { assertEqual, assertInstanceOf, assertThrows } from "@evolu/common";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { SQLITE_VERSION } from "../packages/sqlite-wasm/src/Constants.ts";
import {
  nextSqliteWasmVersion,
  versionSqliteWasm,
  type VersionSqliteWasmOptions,
} from "./version-sqlite-wasm.mts";

describe("version-sqlite-wasm.mts", () => {
  it("runs after changeset version in the version script the release workflow runs", () => {
    const root = new URL("../", import.meta.url);
    const { scripts } = JSON.parse(
      readFileSync(new URL("package.json", root), "utf8"),
    ) as { readonly scripts: Readonly<Record<string, string>> };
    const step = readFileSync(
      new URL(".github/workflows/release.yaml", root),
      "utf8",
    )
      .split("\n      - ")
      .find((step) => step.startsWith("name: Version packages"));

    assertEqual(
      scripts.version,
      "changeset version && node scripts/version-sqlite-wasm.mts",
    );
    assertEqual(
      step?.match(/\n {8}with:\n {10}script: (.+)\n/u)?.[1],
      "pnpm run version",
    );
  });

  it("versions the package Changesets bumped from the release at HEAD", (t) => {
    const repository = setupRepository(t, {
      "packages/sqlite-wasm/package.json": sqliteWasmPackageJson("2.2.4"),
      "packages/web/CHANGELOG.md": "# @evolu/web\n",
    });
    setupCommit(repository.directory);
    // What changeset version writes for a major change. The changelog of a
    // dependent released for the first time is untracked.
    repository.write({
      "packages/sqlite-wasm/package.json": sqliteWasmPackageJson("3.0.0"),
      "packages/sqlite-wasm/CHANGELOG.md": firstChangelog("3.0.0"),
      "packages/web/CHANGELOG.md": firstWebChangelog("3.0.0"),
      "packages/dependent/CHANGELOG.md": firstWebChangelog("3.0.0"),
    });

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: repository.directory,
      encoding: "utf8",
    });

    assertEqual(
      { status: result.status, stderr: result.stderr },
      { status: 0, stderr: "" },
    );
    const version = `${SQLITE_VERSION}-build1`;
    assertEqual(result.stdout, `Versioned @evolu/sqlite-wasm ${version}.\n`);
    assertEqual(repository.read(), {
      "packages/sqlite-wasm/package.json": sqliteWasmPackageJson(version),
      "packages/sqlite-wasm/CHANGELOG.md": firstChangelog(version),
      "packages/web/CHANGELOG.md": firstWebChangelog(version),
      "packages/dependent/CHANGELOG.md": firstWebChangelog(version),
    });
  });
});

describe("versionSqliteWasm", () => {
  it("replaces the version Changesets computed with the next build", (t) => {
    // Changesets bumped 3.53.4-build1 by a patch to 3.53.4.
    const repository = setupRepository(t, {
      "packages/sqlite-wasm/package.json": sqliteWasmPackageJson("3.53.4"),
      "packages/sqlite-wasm/CHANGELOG.md": sqliteWasmChangelog("3.53.4"),
      "packages/web/CHANGELOG.md": webChangelog("3.53.4"),
      "packages/common/CHANGELOG.md": commonChangelog,
    });
    const options = {
      directory: repository.directory,
      sqliteVersion: "3.53.4",
      releasedVersion: "3.53.4-build1",
      changelogs: [
        "packages/common/CHANGELOG.md",
        "packages/sqlite-wasm/CHANGELOG.md",
        "packages/web/CHANGELOG.md",
      ],
    };
    const expected = {
      "packages/sqlite-wasm/package.json":
        sqliteWasmPackageJson("3.53.4-build2"),
      "packages/sqlite-wasm/CHANGELOG.md": sqliteWasmChangelog("3.53.4-build2"),
      "packages/web/CHANGELOG.md": webChangelog("3.53.4-build2"),
      "packages/common/CHANGELOG.md": commonChangelog,
    };

    assertEqual(versionSqliteWasm(options), "3.53.4-build2");
    assertEqual(repository.read(), expected);

    // Running it again changes nothing.
    assertEqual(versionSqliteWasm(options), "3.53.4-build2");
    assertEqual(repository.read(), expected);
  });

  it("does nothing when Changesets did not bump the package", (t) => {
    const files = {
      "packages/sqlite-wasm/package.json":
        sqliteWasmPackageJson("3.53.4-build1"),
    };
    const repository = setupRepository(t, files);

    assertEqual(
      versionSqliteWasm({
        directory: repository.directory,
        sqliteVersion: "3.53.4",
        releasedVersion: "3.53.4-build1",
        changelogs: [],
      }),
      null,
    );
    assertEqual(repository.read(), files);
  });

  it("writes nothing when the changelog has no heading for the computed version", (t) => {
    const files = {
      "packages/sqlite-wasm/package.json": sqliteWasmPackageJson("3.53.4"),
      "packages/sqlite-wasm/CHANGELOG.md": sqliteWasmChangelog("3.53.5"),
      "packages/web/CHANGELOG.md": webChangelog("3.53.4"),
    };
    const repository = setupRepository(t, files);

    assertThrowsMessage(
      () =>
        versionSqliteWasm({
          directory: repository.directory,
          sqliteVersion: "3.53.4",
          releasedVersion: "3.53.4-build1",
          changelogs: ["packages/web/CHANGELOG.md"],
        }),
      "packages/sqlite-wasm/CHANGELOG.md has 0 headings ## 3.53.4, not 1.",
    );
    assertEqual(repository.read(), files);
  });

  it("writes nothing when the changelog already has the next version", (t) => {
    // changeset version ran again before 3.53.4-build1 was committed, so the
    // release at HEAD is still 2.2.4.
    const files = {
      "packages/sqlite-wasm/package.json": sqliteWasmPackageJson("3.53.4"),
      "packages/sqlite-wasm/CHANGELOG.md": sqliteWasmChangelog("3.53.4"),
      "packages/web/CHANGELOG.md": webChangelog("3.53.4"),
    };
    const repository = setupRepository(t, files);

    assertThrowsMessage(
      () =>
        versionSqliteWasm({
          directory: repository.directory,
          sqliteVersion: "3.53.4",
          releasedVersion: "2.2.4",
          changelogs: ["packages/web/CHANGELOG.md"],
        }),
      "packages/sqlite-wasm/CHANGELOG.md already has a heading ## 3.53.4-build1.",
    );
    assertEqual(repository.read(), files);
  });

  it("takes readonly options", () => {
    const options: VersionSqliteWasmOptions = {
      directory: "",
      sqliteVersion: "3.53.4",
      releasedVersion: "3.53.4-build1",
      changelogs: [],
    };
    // @ts-expect-error Cannot assign to 'directory' because it is a read-only property.
    options.directory = "/";
  });
});

describe("nextSqliteWasmVersion", () => {
  it("starts at build 1 of the pinned SQLite after a release of another version", () => {
    assertEqual(nextSqliteWasmVersion("3.53.4", "2.2.4"), "3.53.4-build1");
    assertEqual(
      nextSqliteWasmVersion("3.54.0", "3.53.4-build3"),
      "3.54.0-build1",
    );
  });

  it("numbers the next build of the same SQLite", () => {
    assertEqual(
      nextSqliteWasmVersion("3.53.4", "3.53.4-build1"),
      "3.53.4-build2",
    );
    assertEqual(
      nextSqliteWasmVersion("3.53.4", "3.53.4-build10"),
      "3.53.4-build11",
    );
  });

  it("throws when the next version would not sort above the last release", () => {
    // The build pins an older SQLite than the last release.
    assertThrowsMessage(
      () => nextSqliteWasmVersion("3.53.4", "3.54.0-build1"),
      "@evolu/sqlite-wasm 3.53.4-build1 would not sort above 3.54.0-build1, the last release, in semver order.",
    );
    // Semver orders a prerelease below its release.
    assertThrowsMessage(
      () => nextSqliteWasmVersion("3.53.4", "3.53.4"),
      "@evolu/sqlite-wasm 3.53.4-build1 would not sort above 3.53.4, the last release, in semver order.",
    );
    // Semver compares build10 and build9 as text.
    assertThrowsMessage(
      () => nextSqliteWasmVersion("3.53.4", "3.53.4-build9"),
      "@evolu/sqlite-wasm 3.53.4-build10 would not sort above 3.53.4-build9, the last release, in semver order.",
    );
  });

  it("throws on a version that is neither x.y.z nor x.y.z-build<n>", () => {
    assertThrowsMessage(
      () => nextSqliteWasmVersion("3.53.4", "3.53.4-next.0"),
      "3.53.4-next.0 is neither x.y.z nor x.y.z-build<n>.",
    );
    assertThrowsMessage(
      () => nextSqliteWasmVersion("3.53", "2.2.4"),
      "3.53-build1 is neither x.y.z nor x.y.z-build<n>.",
    );
  });
});

const assertThrowsMessage = (run: () => unknown, message: string): void => {
  assertThrows(run, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });
};

const scriptPath = fileURLToPath(
  new URL("version-sqlite-wasm.mts", import.meta.url),
);

const setupRepository = (
  t: TestContext,
  files: Readonly<Record<string, string>>,
) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-version-sqlite-wasm-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const paths = new Set<string>();
  const write = (files: Readonly<Record<string, string>>): void => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), content);
      paths.add(path);
    }
  };
  write(files);
  return {
    directory,
    write,
    read: (): Readonly<Record<string, string>> =>
      Object.fromEntries(
        [...paths].map((path) => [
          path,
          readFileSync(join(directory, path), "utf8"),
        ]),
      ),
  };
};

/** Commits every file, isolated from the user's and the system's Git config. */
const setupCommit = (directory: string): void => {
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const args of [
    ["init", "--quiet"],
    ["add", "--all"],
    [
      "-c",
      "user.name=Evolu",
      "-c",
      "user.email=evolu@example.com",
      "commit",
      "--quiet",
      "--message=Release",
    ],
  ])
    execFileSync("git", args, { cwd: directory, env });
};

const firstChangelog = (version: string): string =>
  [
    "# @evolu/sqlite-wasm",
    "",
    `## ${version}`,
    "",
    "### Major Changes",
    "",
    "- abc1234: Replaced SQLite3 Multiple Ciphers",
    "",
  ].join("\n");

const firstWebChangelog = (sqliteWasmVersion: string): string =>
  [
    "# @evolu/web",
    "",
    "## 3.5.0",
    "",
    "### Patch Changes",
    "",
    "- Updated dependencies [abc1234]",
    `  - @evolu/sqlite-wasm@${sqliteWasmVersion}`,
    "",
  ].join("\n");

const sqliteWasmPackageJson = (version: string): string =>
  `${JSON.stringify(
    {
      name: "@evolu/sqlite-wasm",
      version,
      keywords: ["sqlite"],
      dependencies: { "@awasm/noble": "^0.1.4" },
    },
    null,
    2,
  )}\n`;

const sqliteWasmChangelog = (version: string): string =>
  [
    "# @evolu/sqlite-wasm",
    "",
    `## ${version}`,
    "",
    "### Patch Changes",
    "",
    "- abc1234: Fixed the pool",
    "",
    "## 3.53.4-build1",
    "",
    "### Major Changes",
    "",
    "- def5678: Replaced SQLite3 Multiple Ciphers",
    "",
  ].join("\n");

const webChangelog = (sqliteWasmVersion: string): string =>
  [
    "# @evolu/web",
    "",
    "## 3.4.2",
    "",
    "### Patch Changes",
    "",
    "- Updated dependencies [abc1234]",
    `  - @evolu/sqlite-wasm@${sqliteWasmVersion}`,
    "  - @evolu/common@8.13.1",
    "",
    "## 3.4.1",
    "",
    "### Patch Changes",
    "",
    "- Updated dependencies [def5678]",
    "  - @evolu/sqlite-wasm@3.53.4-build1",
    "",
  ].join("\n");

const commonChangelog = [
  "# @evolu/common",
  "",
  "## 8.13.1",
  "",
  "### Patch Changes",
  "",
  "- abc1234: Fixed the pool",
  "",
].join("\n");
