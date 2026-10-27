/**
 * The child process of one Node.js stack, which the runner forks with the
 * stack's id, its databases' directory and the workloads' directory. It reads
 * and splits the workloads, creates the stack, and answers the runner's
 * requests one at a time over IPC: a run, which returns `runBench`'s output,
 * and the end, which disposes the stack.
 *
 * @module
 */
import { exhaustiveCheck } from "@evolu/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { workloads, workloadsPath } from "../../sqlite-wasm/workload.mts";
import { runBench, type BenchStack } from "../run.mts";
import { splitStatements } from "../workload.mts";
import { createNodeStack, type NodeStackId } from "./stacks.mts";

/** A request from the runner. */
export type NodeChildRequest =
  | {
      readonly type: "Run";
      readonly name: string;
      readonly verifyContent: boolean;
    }
  | { readonly type: "End" };

/** A message to the runner: ready after starting, then one per request. */
export type NodeChildMessage =
  | { readonly type: "Ready" }
  | { readonly type: "Done"; readonly value: unknown }
  | { readonly type: "Failed"; readonly error: string };

const { values } = parseArgs({
  options: {
    stack: { type: "string" },
    directory: { type: "string" },
    "wa-sqlite": { type: "string" },
    encrypted: { type: "boolean", default: false },
  },
  strict: true,
});

const send = (message: NodeChildMessage): void => {
  process.send?.(message);
};

const describeError = (error: unknown): string =>
  error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
    : String(error);

let stack: BenchStack;
let workloadStatements: ReadonlyArray<ReadonlyArray<string>>;
try {
  if (values.stack == null || values.directory == null)
    throw new Error("The child needs --stack and --directory.");
  const waSqliteDirectory = values["wa-sqlite"];
  if (waSqliteDirectory == null)
    throw new Error("The child needs --wa-sqlite.");
  workloadStatements = workloads.map((workload) =>
    splitStatements(
      readFileSync(
        join(waSqliteDirectory, workloadsPath, workload.file),
        "utf8",
      ),
    ),
  );
  stack = await createNodeStack(values.stack as NodeStackId, values.directory);
  send({ type: "Ready" });
} catch (error) {
  send({ type: "Failed", error: describeError(error) });
  process.exit(1);
}

// Each request starts when the previous one settles.
let queue = Promise.resolve();
process.on("message", (request: NodeChildRequest) => {
  queue = queue.then(async () => {
    switch (request.type) {
      case "Run":
        try {
          send({
            type: "Done",
            value: await runBench(stack, {
              name: request.name,
              workloads: workloadStatements,
              encrypted: values.encrypted,
              verifyContent: request.verifyContent,
            }),
          });
        } catch (error) {
          send({ type: "Failed", error: describeError(error) });
        }
        break;
      case "End":
        await stack.dispose();
        process.disconnect();
        break;
      default:
        exhaustiveCheck(request);
    }
  });
});
