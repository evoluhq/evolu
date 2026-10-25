import {
  assertEqual,
  assertNotNull,
  assertNotUndefined,
  assertSame,
  assertTrue,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const workflow = readFileSync(
  new URL(".github/workflows/docker.yaml", root),
  "utf8",
);

const setupWorkflowStep = (name: string) => {
  const step = workflow
    .split("\n      - ")
    .find((step) => step.startsWith(name));
  assertNotUndefined(step);
  return step;
};

const setupWorkflowScript = (step: string) => {
  const match = step.match(/        run: \|\n((?:          [^\n]*\n|\n)+)/u);
  assertNotNull(match);
  return match[1].replaceAll(/^          /gmu, "");
};

describe("relay Docker release recovery", () => {
  for (const [status, body, exitCode, published] of [
    ["200", JSON.stringify({ digest: `sha256:${"a".repeat(64)}` }), 0, "true"],
    ["404", "{}", 0, "false"],
    ["403", "{}", 0, undefined],
    ["429", "{}", 0, undefined],
    ["503", "{}", 0, undefined],
    ["000", "{}", 6, undefined],
    ["200", "{}", 0, undefined],
    ["200", '{"digest":"invalid"}', 0, undefined],
  ] as const) {
    it(`handles lookup ${status}, exit ${exitCode}, body ${body}`, () => {
      const directory = mkdtempSync(join(tmpdir(), "evolu-docker-release-"));
      try {
        const output = join(directory, "output");
        writeFileSync(output, "");
        const script = setupWorkflowScript(
          setupWorkflowStep("name: Check Docker Hub"),
        );
        const result = spawnSync(
          "bash",
          [
            "-euo",
            "pipefail",
            "-c",
            `curl() {
              while [ "$#" -gt 0 ]; do
                if [ "$1" = --output ]; then output="$2"; shift; fi
                shift
              done
              printf '%s' "$CURL_BODY" > "$output"
              printf '%s' "$CURL_STATUS"
              return "$CURL_EXIT"
            }
            ${script}`,
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              IMAGE: "docker.io/evoluhq/relay",
              VERSION: "3.1.0",
              GITHUB_OUTPUT: output,
              CURL_STATUS: status,
              CURL_BODY: body,
              CURL_EXIT: `${exitCode}`,
            },
            encoding: "utf8",
            timeout: 5000,
          },
        );
        assertSame(result.error, undefined);
        const outputs = readFileSync(output, "utf8");
        if (published === undefined) {
          assertTrue(result.status !== 0);
          assertSame(outputs.includes("published="), false);
        } else {
          assertSame(result.status, 0);
          assertTrue(outputs.includes(`published=${published}\n`));
          if (published === "true") {
            assertTrue(outputs.includes(`digest=sha256:${"a".repeat(64)}\n`));
          }
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  it("runs after Release and hourly, and pushes from the docker-hub environment", () => {
    const jobs = workflow.split(/\n {2}(?=\S)/u);
    const version = jobs.find((job) => job.startsWith("version:\n"));
    const push = jobs.find((job) => job.startsWith("push:\n"));
    const release = readFileSync(
      new URL(".github/workflows/release.yaml", root),
      "utf8",
    );

    assertTrue(
      workflow.includes(
        [
          "on:",
          "  workflow_run:",
          "    workflows: [Release]",
          "    types: [completed]",
          "    branches: [main]",
          "  schedule:",
          '    - cron: "17 * * * *"',
          "  workflow_dispatch:",
          "",
        ].join("\n"),
      ),
    );
    // Only a successful Release run of this repository, or a scheduled or
    // manual run on main, goes on.
    assertEqual(
      version?.match(/\n {4}if: >-\n((?: {6}.+\n)+)/u)?.[1],
      [
        "      github.repository == 'evoluhq/evolu' && github.ref == 'refs/heads/main' &&",
        "      (github.event_name != 'workflow_run' ||",
        "      (github.event.workflow_run.conclusion == 'success' &&",
        "      github.event.workflow_run.head_repository.full_name == github.repository))",
        "",
      ].join("\n"),
    );
    // Watching npm fits in the job's timeout, which fits in GitHub's limit,
    // and only one run after Release watches at a time.
    assertEqual(version?.match(/\n {4}timeout-minutes: (.+)\n/u)?.[1], "355");
    assertTrue(
      version?.includes(
        "    concurrency:\n      group: ${{ github.event_name == 'workflow_run' && 'relay-docker-watch' || github.run_id }}\n      cancel-in-progress: false\n",
      ),
    );
    // Both jobs read the Release run's commit, also when rerun.
    for (const job of [version, push]) {
      assertTrue(
        job?.includes(
          "        with:\n          ref: ${{ github.event.workflow_run.head_sha }}\n          persist-credentials: false\n",
        ),
      );
    }
    // The npm check runs only for a missing image, watches only after Release,
    // and the push job reads it.
    assertTrue(
      version?.includes("      served: ${{ steps.npm.outputs.served }}\n"),
    );
    const npmCheck = setupWorkflowStep("name: Check that npm serves the relay");
    assertTrue(
      npmCheck.includes(
        "        id: npm\n        if: steps.exists.outputs.exists == 'false'\n",
      ),
    );
    assertTrue(
      npmCheck.includes(
        "          WATCH_SECONDS: ${{ github.event_name == 'workflow_run' && 19800 || 0 }}\n",
      ),
    );
    // Only pushes of one version wait for each other.
    assertSame(workflow.includes("\nconcurrency:"), false);
    assertTrue(
      push?.includes(
        "    concurrency:\n      group: relay-docker-${{ needs.version.outputs.version }}\n      cancel-in-progress: false\n",
      ),
    );
    // Only an image npm serves, or a manual run whose image exists, is pushed.
    assertEqual(
      push?.match(/\n {4}if: >-\n((?: {6}.+\n)+)/u)?.[1],
      [
        "      needs.version.outputs.served == 'true' ||",
        "      (github.event_name == 'workflow_dispatch' && needs.version.outputs.exists == 'true')",
        "",
      ].join("\n"),
    );
    assertEqual(push?.match(/\n {4}environment: (.+)\n/u)?.[1], "docker-hub");
    assertSame(release.includes("docker.yaml"), false);
    assertSame(release.includes("secrets: inherit"), false);
  });

  for (const [status, curlExit, exists] of [
    ["200", 0, "true"],
    ["404", 0, "false"],
    ["503", 0, undefined],
    ["000", 6, undefined],
  ] as const) {
    it(`looks up the image, failing unless Docker Hub returns 200 or 404, here ${status} with exit ${curlExit}`, () => {
      const directory = mkdtempSync(join(tmpdir(), "evolu-docker-exists-"));
      try {
        const output = join(directory, "output");
        writeFileSync(output, "");
        const script = setupWorkflowScript(
          setupWorkflowStep("name: Look up the image on Docker Hub"),
        );
        const result = spawnSync(
          "bash",
          [
            "-euo",
            "pipefail",
            "-c",
            `curl() { printf '%s' "$CURL_STATUS"; return "$CURL_EXIT"; }
            ${script}`,
          ],
          {
            env: {
              ...process.env,
              VERSION: "3.1.0",
              GITHUB_OUTPUT: output,
              CURL_STATUS: status,
              CURL_EXIT: `${curlExit}`,
            },
            encoding: "utf8",
            timeout: 5000,
          },
        );
        assertSame(result.error, undefined);
        const outputs = readFileSync(output, "utf8");
        if (exists === undefined) {
          assertTrue(result.status !== 0);
          assertSame(outputs, "");
        } else {
          assertSame(result.status, 0);
          assertSame(outputs, `exists=${exists}\n`);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  const relayPacks = [
    "@evolu/relay@3.1.0",
    "@evolu/common@8.22.1",
    "@evolu/nodejs@4.3.2",
  ];
  for (const [
    watchSeconds,
    failing,
    viewFailures,
    served,
    expectedViews,
    expectedPacks,
  ] of [
    // A scheduled or manual run checks once.
    [0, "", 0, "true", 1, relayPacks],
    [0, "@evolu/nodejs@4.3.2", 0, "false", 1, relayPacks],
    [0, "@evolu/relay@3.1.0", 0, "false", 1, ["@evolu/relay@3.1.0"]],
    [0, "", 1, "false", 1, []],
    // A run after Release checks every 30 seconds until npm serves the relay
    // or 19800 seconds pass.
    [19800, "", 3, "true", 4, relayPacks],
    [19800, "", 1000, "false", 661, []],
  ] as const) {
    it(`reports npm serves the relay only when it can download each package, watching ${watchSeconds} seconds, failing ${failing || "nothing"} and ${viewFailures} views`, () => {
      const directory = mkdtempSync(join(tmpdir(), "evolu-docker-npm-"));
      try {
        const output = join(directory, "output");
        const viewLog = join(directory, "view.log");
        const packLog = join(directory, "pack.log");
        writeFileSync(output, "");
        writeFileSync(viewLog, "");
        writeFileSync(packLog, "");
        const script = setupWorkflowScript(
          setupWorkflowStep("name: Check that npm serves the relay"),
        );
        const result = spawnSync(
          "bash",
          [
            "-euo",
            "pipefail",
            "-c",
            `npm() {
              case "$1 $3" in
                "view dependencies")
                  printf 'view\\n' >> "$VIEW_LOG"
                  [ "$(( $(wc -l < "$VIEW_LOG") ))" -gt "$VIEW_FAILURES" ] || return 1
                  printf '{"@evolu/common":"8.22.1","@evolu/nodejs":"4.3.2","ws":"8.22.0"}\\n'
                  ;;
                "pack --dry-run")
                  [ "$4" = --prefer-online ] || return 1
                  printf '%s\\n' "$2" >> "$PACK_LOG"
                  [ "$2" != "$FAILING" ]
                  ;;
                *) return 1 ;;
              esac
            }
            # Bash counts SECONDS from the value assigned to it.
            sleep() { SECONDS=$(( SECONDS + $1 )); }
            ${script}`,
          ],
          {
            env: {
              ...process.env,
              VERSION: "3.1.0",
              WATCH_SECONDS: `${watchSeconds}`,
              GITHUB_OUTPUT: output,
              VIEW_LOG: viewLog,
              PACK_LOG: packLog,
              FAILING: failing,
              VIEW_FAILURES: `${viewFailures}`,
            },
            encoding: "utf8",
            timeout: 5000,
          },
        );
        assertSame(result.error, undefined);
        assertSame(result.status, 0);
        assertSame(readFileSync(output, "utf8"), `served=${served}\n`);
        assertSame(
          readFileSync(viewLog, "utf8").split("\n").filter(Boolean).length,
          expectedViews,
        );
        assertEqual(
          readFileSync(packLog, "utf8").split("\n").filter(Boolean),
          expectedPacks,
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  for (const [currentVersion, expectedTags] of [
    ["3.1.0", ["3.1.0", "3.1", "3", "latest"]],
    ["3.2.0", ["3.1.0"]],
  ] as const) {
    it(`repairs the existing digest's tags with ${currentVersion} on main and lists them`, () => {
      const script = setupWorkflowScript(
        setupWorkflowStep("name: Reconcile image tags"),
      );
      const digest = `sha256:${"b".repeat(64)}`;
      const directory = mkdtempSync(join(tmpdir(), "evolu-docker-tags-"));
      try {
        const summary = join(directory, "summary");
        writeFileSync(summary, "");
        const result = spawnSync(
          "bash",
          [
            "-euo",
            "pipefail",
            "-c",
            `docker() { printf '%s\\n' "$@"; }
        git() {
          case "$1" in
            fetch) return 0 ;;
            show) printf '{"version":"%s"}' "$CURRENT_VERSION" ;;
            *) return 1 ;;
          esac
        }
        ${script}`,
          ],
          {
            env: {
              ...process.env,
              IMAGE: "docker.io/evoluhq/relay",
              DIGEST: digest,
              VERSION: "3.1.0",
              CURRENT_VERSION: currentVersion,
              TAGS: "docker.io/evoluhq/relay:3.1.0\ndocker.io/evoluhq/relay:3.1\ndocker.io/evoluhq/relay:3\ndocker.io/evoluhq/relay:latest\n",
              GITHUB_STEP_SUMMARY: summary,
            },
            encoding: "utf8",
            timeout: 5000,
          },
        );
        assertSame(result.error, undefined);
        assertSame(result.status, 0);
        assertEqual(result.stdout.trim().split("\n"), [
          "buildx",
          "imagetools",
          "create",
          "--prefer-index=false",
          ...expectedTags.flatMap((tag) => [
            "--tag",
            `docker.io/evoluhq/relay:${tag}`,
          ]),
          `docker.io/evoluhq/relay@${digest}`,
        ]);
        // The summary lists only the tags the step set.
        assertEqual(readFileSync(summary, "utf8").split("\n"), [
          "### Relay image",
          "",
          ...expectedTags.map((tag) => `- docker.io/evoluhq/relay:${tag}`),
          "",
          `Digest: \`${digest}\``,
          "",
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

describe("relay Dockerfile", () => {
  it("installs only day-old dependencies, except Evolu's own packages", () => {
    const dockerfile = readFileSync(
      new URL("apps/relay/Dockerfile", root),
      "utf8",
    );
    const install = dockerfile
      .replaceAll("\\\n", " ")
      .split("\n")
      .find((line) => line.includes("npm install --global"));
    assertNotUndefined(install);
    const args = install.split(/\s+/u);
    assertEqual(
      [
        "--ignore-scripts",
        "--min-release-age=1",
        '"--min-release-age-exclude=@evolu/*"',
      ].filter((flag) => !args.includes(flag)),
      [],
    );
  });
});
