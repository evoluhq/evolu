import { assertEqual, assertFalse, assertTrue } from "@evolu/common";
import { describe, it } from "node:test";
import { workloads } from "../sqlite-wasm/workload.mts";
import { rotate } from "./run.mts";
import {
  createStackRecorder,
  runRounds,
  type StackInfo,
  type StackSession,
} from "./rounds.mts";

const reference = {
  totalChanges: workloads.map((_, index) => index),
  contentChecksum: "1;2;3",
};

const createOutput = (workloadMs = 1) => ({
  sqliteVersion: "3.54.1",
  sqliteSourceId: "2026-06-26 20:14:12 d4c0e51e4aeb",
  compileOptions: ["THREADSAFE=2"],
  pragmas: { cache_size: "-16000" },
  workloadMs: workloads.map(() => workloadMs),
  totalChanges: reference.totalChanges,
  contentChecksum: null,
  schemaObjectsAfter: 0,
  file: null,
  driverMs: { insert: 1, selectByKey: 2, selectAll: 3 },
});

const info = (id: string): StackInfo => ({
  id,
  label: id,
  library: id,
  binding: "Node-API",
  encrypted: false,
});

describe("rotate", () => {
  it("shifts the order by one each round", () => {
    assertEqual(rotate(["a", "b", "c"], 0), ["a", "b", "c"]);
    assertEqual(rotate(["a", "b", "c"], 1), ["b", "c", "a"]);
    assertEqual(rotate(["a", "b", "c"], 4), ["b", "c", "a"]);
    assertEqual(rotate([], 3), []);
  });
});

describe("createStackRecorder", () => {
  it("records warm-up and measured runs apart", () => {
    const recorder = createStackRecorder(info("evolu"), reference);
    assertTrue(
      recorder.record(createOutput(2), {
        round: 0,
        position: 1,
        isWarmup: true,
      }),
    );
    assertTrue(
      recorder.record(createOutput(3), {
        round: 0,
        position: 0,
        isWarmup: false,
      }),
    );
    const result = recorder.toResult();
    assertEqual(result.type, "Measured");
    if (result.type !== "Measured") return;
    assertEqual(
      result.warmupRuns.map(({ round, position, workloadMs }) => [
        round,
        position,
        workloadMs[0],
      ]),
      [[0, 1, 2]],
    );
    assertEqual(
      result.runs.map(({ round, position, workloadMs }) => [
        round,
        position,
        workloadMs[0],
      ]),
      [[0, 0, 3]],
    );
    assertEqual(result.sqliteVersion, "3.54.1");
  });

  it("fails on output its Type rejects and records nothing after", () => {
    const recorder = createStackRecorder(info("evolu"), reference);
    assertFalse(
      recorder.record(
        { ...createOutput(), workloadMs: [-1] },
        { round: 0, position: 0, isWarmup: false },
      ),
    );
    assertTrue(recorder.hasFailed());
    const failed = recorder.toResult();
    assertTrue(
      failed.type === "Failed" &&
        failed.error.startsWith("The run's output isn't a BenchRunOutput: "),
    );
    assertFalse(
      recorder.record(createOutput(), {
        round: 1,
        position: 0,
        isWarmup: false,
      }),
    );
    assertEqual(recorder.toResult().type, "Failed");
  });

  it("fails on a run that doesn't match the reference", () => {
    const recorder = createStackRecorder(info("evolu"), reference);
    assertFalse(
      recorder.record(
        { ...createOutput(), schemaObjectsAfter: 2 },
        { round: 0, position: 0, isWarmup: false },
      ),
    );
    const result = recorder.toResult();
    assertEqual(
      result.type === "Failed" ? result.error : null,
      "The last workload left 2 schema objects.",
    );
  });

  it("keeps the first failure", () => {
    const recorder = createStackRecorder(info("evolu"), reference);
    recorder.fail(new Error("first"));
    recorder.fail("second");
    const result = recorder.toResult();
    assertEqual(result.type === "Failed" ? result.error : null, "first");
  });

  it("fails a stack without a measured run", () => {
    const recorder = createStackRecorder(info("evolu"), reference);
    recorder.record(createOutput(), { round: 0, position: 0, isWarmup: true });
    const result = recorder.toResult();
    assertEqual(
      result.type === "Failed" ? result.error : null,
      "No measured run.",
    );
  });
});

describe("runRounds", () => {
  it("runs every stack each round in a rotated order, and skips a failed one", async () => {
    const calls: Array<string> = [];
    const createSession = (
      id: string,
      failAt: string | null,
    ): StackSession => ({
      recorder: createStackRecorder(info(id), reference),
      run: ({ name, verifyContent }) => {
        calls.push(`${id} ${name}${verifyContent ? " verified" : ""}`);
        if (name === failAt) return Promise.reject(new Error("failed"));
        return Promise.resolve(createOutput());
      },
    });
    const sessions = [
      createSession("a", null),
      createSession("b", "run-1"),
      createSession("c", null),
    ];
    const logs: Array<string> = [];
    await runRounds({
      sessions,
      warmupRounds: 1,
      measuredRounds: 3,
      log: (message) => {
        logs.push(message);
      },
    });
    assertEqual(calls, [
      "a warmup-1 verified",
      "b warmup-1 verified",
      "c warmup-1 verified",
      "a run-1",
      "b run-1",
      "c run-1",
      "c run-2",
      "a run-2",
      "c run-3",
      "a run-3",
    ]);
    assertTrue(logs.includes("b failed: failed"));
    assertEqual(
      sessions.map((session) => session.recorder.toResult().type),
      ["Measured", "Failed", "Measured"],
    );
    const c = sessions[2]?.recorder.toResult();
    assertEqual(
      c?.type === "Measured" ? c.runs.map((run) => run.position) : null,
      [2, 1, 0],
    );
  });
});
