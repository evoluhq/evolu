/**
 * Runs the Node.js target: a child process per stack, each with a directory of
 * its own in the same temporary directory, driven through the rounds.
 *
 * @module
 */
import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TargetResult } from "../results.mts";
import {
  createStackRecorder,
  runRounds,
  type StackRecorder,
  type StackSession,
} from "../rounds.mts";
import {
  describeMachine,
  type LoadedWorkloads,
  type Rounds,
} from "../setup.mts";
import type { NodeChildMessage, NodeChildRequest } from "./child.mts";
import { createNodeStackDefinitions, nodeReferenceStackId } from "./stacks.mts";

const childPath = fileURLToPath(new URL("child.mts", import.meta.url));
const runTimeoutMs = 10 * 60 * 1000;

export const runNodeTarget = async ({
  workloads,
  rounds,
  id,
  label,
  environment = {},
  log,
}: {
  workloads: LoadedWorkloads;
  rounds: Rounds;
  /** The target's key, such as `node-darwin-arm64`. */
  id: string;
  label: string;
  /** Facts about the target beyond the machine, such as its container. */
  environment?: Readonly<Record<string, string>>;
  log: (message: string) => void;
}): Promise<TargetResult> => {
  const createdAt = new Date().toISOString();
  const definitions = createNodeStackDefinitions();
  const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-comparison-"));
  const children: Array<{
    readonly child: ChildProcess;
    readonly recorder: StackRecorder;
  }> = [];
  try {
    const sessions: Array<StackSession> = [];
    // One after another, so their starts don't overlap.
    for (const definition of definitions) {
      const recorder = createStackRecorder(definition, workloads.reference);
      const child = fork(
        childPath,
        [
          `--stack=${definition.id}`,
          `--directory=${join(directory, definition.id)}`,
          `--wa-sqlite=${workloads.directory}`,
          ...(definition.encrypted ? ["--encrypted"] : []),
        ],
        {
          // node:sqlite warns that it's experimental.
          execArgv: ["--disable-warning=ExperimentalWarning"],
          stdio: ["ignore", "inherit", "inherit", "ipc"],
        },
      );
      children.push({ child, recorder });
      const ready = await nextMessage(child);
      if (ready.type !== "Ready") {
        const error =
          ready.type === "Failed" ? ready.error : "The child didn't start.";
        recorder.fail(error);
        log(`${definition.id} failed to start: ${error}`);
      }
      sessions.push({
        recorder,
        run: async ({ name, verifyContent }) => {
          child.send({
            type: "Run",
            name,
            verifyContent,
          } satisfies NodeChildRequest);
          const message = await nextMessage(child);
          if (message.type === "Failed") throw new Error(message.error);
          if (message.type !== "Done")
            throw new Error(`The child sent ${message.type}.`);
          return message.value;
        },
      });
    }

    const loadAveragesStart = loadavg();
    await runRounds({ sessions, ...rounds, log });
    const loadAveragesEnd = loadavg();

    // A failed stack's child may never answer, so it's killed instead.
    for (const { child, recorder } of children)
      if (child.connected && !recorder.hasFailed()) {
        child.send({ type: "End" } satisfies NodeChildRequest);
        await once(child, "exit");
      }

    return TargetResult.orThrow({
      id,
      label,
      createdAt,
      environment: { ...describeMachine(), ...environment },
      loadAverages: { start: loadAveragesStart, end: loadAveragesEnd },
      notes: [],
      evoluStackId: "evolu",
      evoluEncryptedStackId: "evoluEncrypted",
      referenceStackId: nodeReferenceStackId,
      stacks: sessions.map((session) => session.recorder.toResult()),
    });
  } finally {
    for (const { child } of children) child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
};

/**
 * The child's next message, or a failure when it exits or times out first. A
 * child that times out is killed, so a run that hangs doesn't keep running
 * beside the other stacks' runs.
 */
export const nextMessage = (
  child: ChildProcess,
  timeoutMs = runTimeoutMs,
): Promise<NodeChildMessage> =>
  new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ type: "Failed", error: "The child timed out." });
    }, timeoutMs);
    const onMessage = (message: NodeChildMessage) => {
      finish(message);
    };
    const onExit = (code: number | null, signal: string | null) => {
      finish({
        type: "Failed",
        error: `The child exited with ${signal ?? code}.`,
      });
    };
    const finish = (message: NodeChildMessage) => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
      resolve(message);
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
  });
