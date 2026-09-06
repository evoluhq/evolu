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

  for (const [currentVersion, expectedTags] of [
    ["3.1.0", ["3.1.0", "3.1", "3", "latest"]],
    ["3.2.0", ["3.1.0"]],
  ] as const) {
    it(`repairs the existing digest's tags with ${currentVersion} on main`, () => {
      const script = setupWorkflowScript(
        setupWorkflowStep("name: Reconcile image tags"),
      );
      const digest = `sha256:${"b".repeat(64)}`;
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
    });
  }
});
