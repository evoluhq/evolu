/**
 * Runs the Node.js target in Linux containers, one at a time: Debian with glibc
 * and Alpine with musl, which the relay's image is built on. Each container
 * gets the checkout and the wa-sqlite clone at their own paths, runs the `node`
 * command with its container named, and writes its results into the checkout's
 * results directory. The databases stay in the container's own file system.
 *
 * Better-sqlite3 ships its Linux addons in its package, so the checkout's
 * install serves the containers too. Evolu's stacks need `@evolu/nodejs`'s
 * addon for the container's target, built as `@evolu/nodejs`'s CI builds it,
 * which README.md shows.
 *
 * @module
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  describeCheckout,
  describeMachine,
  type LoadedWorkloads,
  type Rounds,
} from "../setup.mts";

/** The C libraries the containers run. */
export const dockerLibcs = ["glibc", "musl"] as const;
export type DockerLibc = (typeof dockerLibcs)[number];

interface DockerImage {
  /** The image, pinned by its index digest. */
  readonly image: string;
  readonly description: string;
  /** `@evolu/nodejs`'s target on arm64; `arm64` becomes `x64` on x64. */
  readonly target: string;
}

const images: Readonly<Record<DockerLibc, DockerImage>> = {
  glibc: {
    image:
      "node:24.22.0-trixie-slim@sha256:a6155384446670e9719bdc4fd0ebe4d4b29fb32a8d6aa523da3547a6cfbcf22c",
    description: "node:24.22.0-trixie-slim (Debian 13, glibc)",
    target: "linux-arm64-gnu",
  },
  musl: {
    // The image @evolu/nodejs builds its musl addons in.
    image:
      "node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f",
    description: "node:24.22.0-alpine (musl)",
    target: "linux-arm64-musl",
  },
};

const repositoryDirectory = fileURLToPath(
  new URL("../../../", import.meta.url),
);

/**
 * Runs the containers of the C libraries one after another. It throws when
 * Docker is missing, and after the last container when a container failed, such
 * as because a stack failed.
 */
export const runDockerTargets = ({
  libcs,
  workloads,
  rounds,
  log,
}: {
  libcs: ReadonlyArray<DockerLibc>;
  workloads: LoadedWorkloads;
  rounds: Rounds;
  log: (message: string) => void;
}): void => {
  const version = spawnSync(
    "docker",
    ["version", "--format", "{{.Server.Arch}}"],
    {
      encoding: "utf8",
    },
  );
  if (version.status !== 0)
    throw new Error(
      `Docker isn't running: ${version.stderr.trim()}. Start it, such as with colima start.`,
    );
  const arch = version.stdout.trim() === "amd64" ? "x64" : "arm64";
  const host = describeMachine();

  const failed: Array<string> = [];
  for (const libc of libcs) {
    const image = images[libc];
    const target = image.target.replace("arm64", arch);
    const addon = `${repositoryDirectory}packages/nodejs/native/${target}/evolu.node`;
    if (!existsSync(addon))
      throw new Error(
        `The ${libc} container needs @evolu/nodejs's addon for ${target}, ${addon}. Build it as bench/sqlite-comparison/README.md shows.`,
      );
    const name = `node-linux-${arch}-${libc}`;
    log(`\n${image.description}\n`);
    const run = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "--init",
        `--volume=${repositoryDirectory}:${repositoryDirectory}`,
        `--volume=${workloads.directory}:${workloads.directory}:ro`,
        `--workdir=${repositoryDirectory}`,
        // The container has no git and can't read its host.
        `--env=EVOLU_BENCH_CHECKOUT=${describeCheckout()}`,
        `--env=EVOLU_BENCH_HOST=${host.CPU}; ${host.OS}`,
        image.image,
        "node",
        "bench/sqlite-comparison/benchmark.mts",
        "node",
        `--wa-sqlite=${workloads.directory}`,
        `--workloads-sha256=${workloads.sha256}`,
        `--warmup-rounds=${rounds.warmupRounds}`,
        `--measured-rounds=${rounds.measuredRounds}`,
        `--name=${name}`,
        `--container=${image.description}`,
      ],
      { stdio: "inherit" },
    );
    if (run.status !== 0)
      failed.push(`${libc} with ${run.status ?? run.signal}`);
  }
  if (failed.length > 0)
    throw new Error(`The containers failed: ${failed.join(", ")}.`);
};
