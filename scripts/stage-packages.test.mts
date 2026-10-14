import { assertEqual, assertNotUndefined, assertSame } from "@evolu/common";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const script = fileURLToPath(new URL("scripts/stage-packages.mts", root));

describe("stage-packages.mts", () => {
  it("stages the downloaded pack in the release workflow's publish job", () => {
    const job = readFileSync(
      new URL(".github/workflows/release.yaml", root),
      "utf8",
    )
      .split(/\n {2}(?=\S)/u)
      .find((job) => job.startsWith("publish:\n"));
    assertNotUndefined(job);

    assertEqual(job.match(/\n {4}environment: (.+)\n/u)?.[1], "npm");
    // The job holding the OIDC token runs no code from dependencies, so it
    // runs only these actions and the step that edits a GitHub release.
    assertEqual(
      Array.from(
        job.matchAll(/\n {6}(?:- | {2})uses: ([^@\n]+)@/gu),
        ([, name]) => name,
      ),
      [
        "actions/checkout",
        "actions/setup-node",
        "actions/download-artifact",
        "changesets/action/publish",
      ],
    );
    assertEqual(Array.from(job.matchAll(/\n {6}(?:- | {2})run: /gu)).length, 1);
    assertEqual(
      job.match(/\n {10}path: (.+)\n/u)?.[1],
      "${{ runner.temp }}/pack",
    );
    assertEqual(
      job.match(/\n {10}script: (.+)\n/u)?.[1],
      "node scripts/stage-packages.mts ${{ runner.temp }}/pack",
    );
  });

  it("stages each untagged release in plan order and reports its tag", (t) => {
    const common = release("@evolu/common", "8.23.0");
    const sqliteWasm = release("@evolu/sqlite-wasm", "3.54.0-build2", {
      tag: "next",
      access: "restricted",
    });
    const setup = setupStage(t, {
      plan: [[common], [release("@evolu/web", "3.7.0"), sqliteWasm]],
      tags: ["@evolu/common@8.22.0", "@evolu/web@3.7.0"],
    });

    const status = setup.run();

    assertSame(status, 0);
    assertEqual(setup.npmCalls(), [
      setup.npmCall(common),
      setup.npmCall(sqliteWasm),
    ]);
    assertEqual(setup.events(), [
      gitTagEvent("@evolu/common", "8.23.0"),
      gitTagEvent("@evolu/sqlite-wasm", "3.54.0-build2"),
    ]);
  });

  it("stops at the first release npm fails to stage", (t) => {
    const common = release("@evolu/common", "8.23.0");
    const web = release("@evolu/web", "3.7.0");
    const setup = setupStage(t, {
      plan: [[common], [web, release("@evolu/react", "11.1.0")]],
      failingTarball: "evolu-web-3.7.0.tgz",
    });

    const status = setup.run();

    assertSame(status, 1);
    assertEqual(setup.npmCalls(), [setup.npmCall(common), setup.npmCall(web)]);
    assertEqual(setup.events(), [gitTagEvent("@evolu/common", "8.23.0")]);
  });

  it("writes an empty output when every release is tagged", (t) => {
    const setup = setupStage(t, {
      plan: [[release("@evolu/common", "8.23.0")]],
      tags: ["@evolu/common@8.23.0"],
    });

    const status = setup.run();

    assertSame(status, 0);
    assertEqual(setup.npmCalls(), []);
    assertEqual(setup.events(), []);
  });

  it("stages nothing when the tags cannot be listed", (t) => {
    const setup = setupStage(t, {
      plan: [[release("@evolu/common", "8.23.0")]],
      origin: false,
    });

    const status = setup.run();

    assertSame(status, 1);
    assertEqual(setup.npmCalls(), []);
    assertEqual(setup.events(), []);
  });

  it("stages nothing without CHANGESETS_OUTPUT", (t) => {
    const setup = setupStage(t, {
      plan: [[release("@evolu/common", "8.23.0")]],
      output: false,
    });

    const status = setup.run();

    assertSame(status, 1);
    assertEqual(setup.npmCalls(), []);
    assertEqual(setup.events(), null);
  });

  it("stages nothing when the plan has a tag-only release", (t) => {
    const setup = setupStage(t, {
      plan: [
        [release("@evolu/common", "8.23.0")],
        [{ ...release("web", "1.0.0"), kind: "tag-only" }],
      ],
    });

    const status = setup.run();

    assertSame(status, 1);
    assertEqual(setup.npmCalls(), []);
    assertEqual(setup.events(), []);
  });
});

const release = (
  name: string,
  version: string,
  { tag = "latest", access = "public" } = {},
) => ({
  kind: "publish",
  name,
  version,
  access,
  tag,
  tarball: { path: `packages/${tarballName(name, version)}` },
});

const tarballName = (name: string, version: string): string =>
  `${name.replace("@", "").replace("/", "-")}-${version}.tgz`;

const gitTagEvent = (name: string, version: string) => ({
  type: "git-tag",
  tag: `${name}@${version}`,
  packageName: name,
});

const setupStage = (
  t: TestContext,
  {
    plan,
    tags = [],
    failingTarball,
    origin = true,
    output: hasOutput = true,
  }: {
    plan: ReadonlyArray<ReadonlyArray<ReturnType<typeof release>>>;
    tags?: ReadonlyArray<string>;
    failingTarball?: string;
    origin?: boolean;
    output?: boolean;
  },
) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-stage-packages-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  // Global or system git config, such as tag signing, must not apply.
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (cwd: string, ...args: ReadonlyArray<string>) =>
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      { cwd, env, stdio: "ignore" },
    );

  const originDirectory = join(directory, "origin");
  mkdirSync(originDirectory);
  git(originDirectory, "init", "--quiet");
  git(originDirectory, "commit", "--quiet", "--allow-empty", "-m", "Release");
  for (const tag of tags) git(originDirectory, "tag", tag);

  const repository = join(directory, "repository");
  mkdirSync(repository);
  git(repository, "init", "--quiet");
  if (origin) git(repository, "remote", "add", "origin", originDirectory);

  const packDir = join(directory, "pack");
  mkdirSync(packDir);
  writeFileSync(
    join(packDir, "publish-plan.json"),
    JSON.stringify({ version: 1, plan }),
  );

  // A fake npm that logs its arguments and fails for one tarball.
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const npmLog = join(directory, "npm.log");
  writeFileSync(
    join(bin, "npm"),
    '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$NPM_LOG"\n[ "${3##*/}" != "$NPM_FAILING_TARBALL" ]\n',
    { mode: 0o755 },
  );

  const output = join(directory, "changesets-output.ndjson");

  return {
    run: () =>
      spawnSync(process.execPath, [script, packDir], {
        cwd: repository,
        env: {
          ...env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          CHANGESETS_OUTPUT: hasOutput ? output : undefined,
          NPM_LOG: npmLog,
          NPM_FAILING_TARBALL: failingTarball ?? "",
        },
        stdio: "ignore",
      }).status,
    npmCall: ({ tarball, tag, access }: ReturnType<typeof release>) =>
      `stage publish ${join(packDir, tarball.path)} --tag ${tag} --access ${access} --provenance --ignore-scripts`,
    npmCalls: () =>
      existsSync(npmLog)
        ? readFileSync(npmLog, "utf8").trimEnd().split("\n")
        : [],
    /** The events the script wrote, or null when it created no output. */
    events: () =>
      existsSync(output)
        ? readFileSync(output, "utf8")
            .split("\n")
            .filter((line) => line !== "")
            .map((line) => JSON.parse(line) as unknown)
        : null,
  };
};
