/**
 * The command of the SQLite comparison: `pnpm bench:sqlite-comparison
 * <command>`, one command per platform. README.md describes them.
 *
 * @module
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getOrThrow } from "@evolu/common";
import {
  dockerLibcs,
  runDockerTargets,
  type DockerLibc,
} from "./node/docker.mts";
import { runNodeTarget } from "./node/runner.mts";
import {
  reactNativePlatforms,
  runReactNativeTarget,
  type ReactNativePlatform,
} from "./react-native/runner.mts";
import type { WebEngine } from "./web/runner.mts";
import { BenchResults, formatResults, type TargetResult } from "./results.mts";
import { formatRelayResults, RelayResults } from "./relay/results.mts";
import { runRelayGate } from "./relay/runner.mts";
import { waSqliteCommit } from "./workload.mts";
import {
  defaultRounds,
  describeMachine,
  loadWorkloads,
  resultsDirectory,
  writeResults,
  type LoadedWorkloads,
  type Rounds,
} from "./setup.mts";

const commands = [
  "node",
  "docker",
  "web",
  ...reactNativePlatforms,
  "relay",
  "report",
] as const;
type Command = (typeof commands)[number];

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "wa-sqlite": { type: "string" },
    "measured-rounds": { type: "string" },
    "warmup-rounds": { type: "string" },
    // The node command in a container that the docker command started.
    name: { type: "string" },
    container: { type: "string" },
    "workloads-sha256": { type: "string" },
    libc: { type: "string", multiple: true },
    engine: { type: "string", multiple: true },
    device: { type: "string" },
    "skip-build": { type: "boolean", default: false },
    base: { type: "string" },
    head: { type: "string" },
  },
  strict: true,
});

const [command, ...extra] = positionals;
if (
  command == null ||
  !commands.includes(command as Command) ||
  extra.length > 0
)
  throw new Error(
    `Run pnpm bench:sqlite-comparison <command>, where the command is one of ${commands.join(", ")}. See bench/sqlite-comparison/README.md.`,
  );

const parseRounds = (): Rounds => {
  const parse = (
    value: string | undefined,
    fallback: number,
    minimum: number,
  ) => {
    if (value == null) return fallback;
    const rounds = Number(value);
    if (!Number.isInteger(rounds) || rounds < minimum)
      throw new Error(
        `Rounds must be an integer of at least ${minimum}: ${value}`,
      );
    return rounds;
  };
  return {
    warmupRounds: parse(values["warmup-rounds"], defaultRounds.warmupRounds, 1),
    measuredRounds: parse(
      values["measured-rounds"],
      defaultRounds.measuredRounds,
      1,
    ),
  };
};

const relayResultsName = "relay";

const log = (message: string) => {
  process.stderr.write(`${message}\n`);
};

const printWritten = (name: string) => {
  log(`\nWrote bench/sqlite-comparison/results/${name}.json and ${name}.md.`);
};

/** Writes a target's results, after which a failed stack fails the command. */
const writeTarget = (
  target: TargetResult,
  workloads: LoadedWorkloads,
  rounds: Rounds,
) => {
  writeResults({
    name: target.id,
    targets: [target],
    workloadSha256: workloads.sha256,
    rounds,
  });
  printWritten(target.id);
  const failed = target.stacks.filter((stack) => stack.type === "Failed");
  if (failed.length > 0) {
    log(
      `${failed.map((stack) => stack.id).join(", ")} failed in ${target.id}.`,
    );
    process.exitCode = 1;
  }
};

switch (command as Command) {
  case "node": {
    const workloads = loadWorkloads(
      values["wa-sqlite"],
      values["workloads-sha256"],
    );
    const rounds = parseRounds();
    const id = values.name ?? `node-${process.platform}-${process.arch}`;
    const { container } = values;
    const target = await runNodeTarget({
      workloads,
      rounds,
      id,
      label: `Node.js ${process.versions.node}, ${container == null ? describeMachine().OS : `${container} on ${process.arch}`}`,
      environment: container == null ? {} : { Container: container },
      log,
    });
    writeTarget(target, workloads, rounds);
    break;
  }
  case "docker": {
    const libcs = values.libc ?? dockerLibcs;
    for (const libc of libcs)
      if (!dockerLibcs.includes(libc as DockerLibc))
        throw new Error(`Unknown C library: ${libc}`);
    const workloads = loadWorkloads(values["wa-sqlite"]);
    runDockerTargets({
      libcs: libcs as ReadonlyArray<DockerLibc>,
      workloads,
      rounds: parseRounds(),
      log,
    });
    break;
  }
  case "web": {
    // Imported here, as Playwright's and Vite's native code loads only on the
    // host, not in the node command's containers.
    const { runWebTargets, webEngines } = await import("./web/runner.mts");
    const engines = values.engine ?? webEngines;
    for (const engine of engines)
      if (!webEngines.includes(engine as WebEngine))
        throw new Error(`Unknown engine: ${engine}`);
    const workloads = loadWorkloads(values["wa-sqlite"]);
    const rounds = parseRounds();
    await runWebTargets({
      engines: engines as ReadonlyArray<WebEngine>,
      workloads,
      rounds,
      waSqliteCommit,
      onTarget: (target) => {
        writeTarget(target, workloads, rounds);
      },
      log,
    });
    break;
  }
  case "ios":
  case "android": {
    const workloads = loadWorkloads(values["wa-sqlite"]);
    const rounds = parseRounds();
    const target = await runReactNativeTarget({
      platform: command as ReactNativePlatform,
      device: values.device,
      build: !values["skip-build"],
      workloads,
      rounds,
      log,
    });
    writeTarget(target, workloads, rounds);
    break;
  }
  case "relay": {
    if (values.base == null)
      throw new Error(
        "The relay gate needs the old code's checkout: --base=<directory>. See bench/sqlite-comparison/README.md.",
      );
    const results = await runRelayGate({
      base: values.base,
      head: values.head ?? fileURLToPath(new URL("../../", import.meta.url)),
      rounds: parseRounds(),
      log,
    });
    mkdirSync(resultsDirectory, { recursive: true });
    writeFileSync(
      new URL(`${relayResultsName}.json`, resultsDirectory),
      `${JSON.stringify(results, null, 2)}\n`,
    );
    writeFileSync(
      new URL(`${relayResultsName}.md`, resultsDirectory),
      formatRelayResults(results),
    );
    printWritten(relayResultsName);
    if (results.error != null) throw new Error(results.error);
    break;
  }
  case "report": {
    // Every target's results file, each target once, in the files' order.
    const files = readdirSync(resultsDirectory)
      .filter(
        (file) => file.endsWith(".json") && file !== `${relayResultsName}.json`,
      )
      .toSorted();
    const results = files.map((file) => {
      const parsed = BenchResults.fromUnknown(
        JSON.parse(readFileSync(new URL(file, resultsDirectory), "utf8")),
      );
      if (!parsed.ok)
        throw new Error(
          `${file} isn't results of this version of the benchmark. Run its target again or remove it: ${JSON.stringify(parsed.error).slice(0, 300)}`,
        );
      return parsed.value;
    });
    const [first] = results;
    if (first == null)
      throw new Error(
        "There are no results in bench/sqlite-comparison/results.",
      );
    // One report, one configuration, so a dry run can't hide among them.
    const differing = files.filter(
      (_, index) =>
        JSON.stringify(results[index]?.configuration) !==
        JSON.stringify(first.configuration),
    );
    if (differing.length > 0)
      throw new Error(
        `${differing.join(", ")} ran with another configuration than ${files[0]}: rounds, workloads or pragmas. Run them again or remove them.`,
      );
    const relayUrl = new URL(`${relayResultsName}.json`, resultsDirectory);
    const relay = existsSync(relayUrl)
      ? getOrThrow(
          RelayResults.fromUnknown(JSON.parse(readFileSync(relayUrl, "utf8"))),
        )
      : null;
    writeFileSync(
      new URL("report.md", resultsDirectory),
      [
        formatResults({
          ...first,
          targets: results.flatMap((result) => result.targets),
        }),
        ...(relay == null
          ? []
          : [formatRelayResults(relay).replace(/^# /u, "## ")]),
      ].join("\n"),
    );
    log("Wrote bench/sqlite-comparison/results/report.md.");
    break;
  }
}
