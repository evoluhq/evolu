import { assertEqual } from "@evolu/common";
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
import { selectReactNativeAppJobs } from "./select-react-native-app.mts";

const script = fileURLToPath(
  new URL("select-react-native-app.mts", import.meta.url),
);

const all = "all";
const expoOnly = "expo";
const none = "none";

describe("selectReactNativeAppJobs", () => {
  for (const [files, expected] of [
    [["packages/react-native/src/index.ts"], expoOnly],
    [["packages/react-native/cpp/EvoluSqlite.cpp"], expoOnly],
    [["packages/sqlite-core/src/evolu_codec.c"], expoOnly],
    [["packages/sqlite-core/binding/evolu_database.c"], expoOnly],
    [["packages/sqlite-core/vendor/monocypher/monocypher.c"], expoOnly],
    [["packages/sqlite-core/scripts/compile.mts"], expoOnly],
    [["examples/react-expo/app/index.tsx"], expoOnly],
    [["pnpm-lock.yaml"], expoOnly],
    [[".github/workflows/react-native-app.yaml"], all],
    [["examples/react-native/App.tsx"], all],
    [["packages/react-native/react-native.config.js"], all],
    [["packages/react-native/EvoluReactNative.podspec"], all],
    [["packages/react-native/android/build.gradle"], all],
    // Git quotes a name that isn't ASCII, unless asked for raw names.
    [["examples/react-native/Ünïcode.tsx"], all],
    [["packages/sqlite-core/node/binding.c"], none],
    [["packages/sqlite-core/test/codec_test.c"], none],
    [["packages/common/src/Type.ts", "README.md"], none],
    [
      ["examples/react-expo-other/a.ts", "packages/react-native-web/a.ts"],
      none,
    ],
  ] as const)
    it(`selects ${JSON.stringify(expected)} for a pull request that changes ${files.join(" and ")}`, (t) => {
      const repository = setupRepository(t, files);

      assertEqual(
        selectReactNativeAppJobs({
          event: "pull_request",
          base: repository.base,
          cwd: repository.clone,
        }),
        expected,
      );
    });

  it("selects every app job for a pull request that renames packages/react-native/react-native.config.js to react-native.config.cjs", (t) => {
    const repository = setupRepository(t, [], {
      renames: [
        [
          "packages/react-native/react-native.config.js",
          "packages/react-native/react-native.config.cjs",
        ],
      ],
    });

    assertEqual(
      selectReactNativeAppJobs({
        event: "pull_request",
        base: repository.base,
        cwd: repository.clone,
      }),
      all,
    );
  });

  it("selects the Expo example's app jobs for a pull request that deletes a file under packages/react-native/", (t) => {
    const repository = setupRepository(t, [], {
      deletes: ["packages/react-native/src/Removed.ts"],
    });

    assertEqual(
      selectReactNativeAppJobs({
        event: "pull_request",
        base: repository.base,
        cwd: repository.clone,
      }),
      expoOnly,
    );
  });

  it("diffs a merge-queue run against its base, fetched into the shallow checkout", (t) => {
    const repository = setupRepository(t, ["README.md"]);

    assertEqual(
      selectReactNativeAppJobs({
        event: "merge_group",
        base: repository.base,
        cwd: repository.clone,
      }),
      none,
    );
  });

  for (const [what, base] of [
    ["a missing", ""],
    ["an all-zero", "0".repeat(40)],
    ["an unfetchable", "1".repeat(40)],
  ] as const)
    it(`selects every app job for ${what} base`, (t) => {
      const repository = setupRepository(t, ["README.md"]);

      assertEqual(
        selectReactNativeAppJobs({
          event: "pull_request",
          base,
          cwd: repository.clone,
        }),
        all,
      );
    });

  it("selects every app job for a workflow_dispatch run, as for a branch", (t) => {
    const repository = setupRepository(t, ["README.md"]);

    assertEqual(
      selectReactNativeAppJobs({
        event: "workflow_dispatch",
        base: repository.base,
        cwd: repository.clone,
      }),
      all,
    );
  });
});

describe("select-react-native-app.mts", () => {
  it("prints the selection without GITHUB_OUTPUT", (t) => {
    const repository = setupRepository(t, ["pnpm-lock.yaml"]);
    const { GITHUB_OUTPUT: _, ...env } = process.env;

    const result = spawnSync(
      process.execPath,
      [script, "--event=merge_group", `--base=${repository.base}`],
      { cwd: repository.clone, encoding: "utf8", env },
    );

    assertEqual(
      [result.status, result.stdout, result.stderr],
      [0, "app-jobs=true\nwithout-expo=false\n", ""],
    );
  });

  it("writes the selection to GITHUB_OUTPUT", (t) => {
    const repository = setupRepository(t, ["examples/react-native/App.tsx"]);
    const output = join(repository.directory, "output");
    writeFileSync(output, "earlier=1\n");

    const result = spawnSync(
      process.execPath,
      [script, "--event=pull_request", `--base=${repository.base}`],
      {
        cwd: repository.clone,
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: output },
      },
    );

    assertEqual([result.status, result.stderr], [0, ""]);
    assertEqual(
      readFileSync(output, "utf8"),
      "earlier=1\napp-jobs=true\nwithout-expo=true\n",
    );
  });
});

/**
 * An origin with a base commit and a commit on top that changes `files`, moves
 * each `[from, to]` of `renames` with `git mv` and removes each of `deletes`
 * with `git rm`, from where the base commit holds them, and a shallow clone of
 * the latter, as CI checks out.
 */
const setupRepository = (
  t: TestContext,
  files: ReadonlyArray<string>,
  {
    renames = [],
    deletes = [],
  }: {
    renames?: ReadonlyArray<readonly [string, string]>;
    deletes?: ReadonlyArray<string>;
  } = {},
) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-select-app-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const origin = join(directory, "origin");
  const git = (cwd: string, ...args: ReadonlyArray<string>) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Evolu",
        "-c",
        "user.email=evolu@example.com",
        "-c",
        "init.defaultBranch=main",
        ...args,
      ],
      { cwd, encoding: "utf8" },
    ).trim();
  mkdirSync(origin);
  git(origin, "init", "--quiet");
  writeFileSync(join(origin, "README.md"), "Evolu\n");
  for (const file of [...renames.map(([from]) => from), ...deletes]) {
    mkdirSync(dirname(join(origin, file)), { recursive: true });
    writeFileSync(join(origin, file), `${file}\n`);
  }
  git(origin, "add", ".");
  git(origin, "commit", "--quiet", "-m", "Base");
  const base = git(origin, "rev-parse", "HEAD");
  for (const file of files) {
    mkdirSync(dirname(join(origin, file)), { recursive: true });
    writeFileSync(join(origin, file), `${file}\n`);
  }
  for (const [from, to] of renames) git(origin, "mv", from, to);
  for (const file of deletes) git(origin, "rm", "--quiet", file);
  git(origin, "add", ".");
  git(origin, "commit", "--quiet", "-m", "Change");
  const clone = join(directory, "clone");
  git(directory, "clone", "--quiet", "--depth=1", `file://${origin}`, clone);
  return { directory, base, clone };
};
