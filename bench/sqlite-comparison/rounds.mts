/**
 * The rounds of a target, which the Node.js and web runners drive, and the
 * recorder of a stack's runs, which the React Native runner also uses for the
 * runs the app drives itself.
 *
 * A warm-up round runs every stack once, and so does each measured round, in an
 * order rotated by one each round, so a burst of load slows one run of several
 * stacks rather than every run of one, and no stack always runs right after the
 * same one.
 *
 * @module
 */
import { NonNegativeInt } from "@evolu/common";
import { rotate } from "./run.mts";
import {
  BenchRunOutput,
  checkRun,
  type BenchReference,
  type RunTimings,
  type StackResult,
} from "./results.mts";

/** What the results say about a stack besides its runs. */
export interface StackInfo {
  readonly id: string;
  readonly label: string;
  readonly library: string;
  readonly binding: string;
  readonly encrypted: boolean;
}

/** Records a stack's runs, checking each, and its first failure. */
export interface StackRecorder {
  readonly info: StackInfo;
  /** Whether the stack failed, after which it runs no more. */
  readonly hasFailed: () => boolean;
  /**
   * Validates and checks a run's output and records its timings, or records the
   * failure and returns false.
   */
  readonly record: (
    output: unknown,
    run: {
      readonly round: number;
      readonly position: number;
      readonly isWarmup: boolean;
    },
  ) => boolean;
  readonly fail: (error: unknown) => void;
  readonly toResult: () => StackResult;
}

export const createStackRecorder = (
  { id, label, library, binding, encrypted }: StackInfo,
  reference: BenchReference,
): StackRecorder => {
  // Only these, as a stack's definition can hold more.
  const info: StackInfo = { id, label, library, binding, encrypted };
  let first: BenchRunOutput | null = null;
  let error: string | null = null;
  const warmupRuns: Array<RunTimings> = [];
  const runs: Array<RunTimings> = [];

  const fail = (cause: unknown) => {
    error ??= cause instanceof Error ? cause.message : String(cause);
  };

  return {
    info,
    hasFailed: () => error != null,
    record: (rawOutput, { round, position, isWarmup }) => {
      if (error != null) return false;
      try {
        const parsed = BenchRunOutput.fromUnknown(rawOutput);
        if (!parsed.ok)
          throw new Error(
            `The run's output isn't a BenchRunOutput: ${JSON.stringify(parsed.error).slice(0, 500)}`,
          );
        const output = parsed.value;
        checkRun(output, { reference, encrypted: info.encrypted, first });
        first ??= output;
        (isWarmup ? warmupRuns : runs).push({
          round: NonNegativeInt.orThrow(round),
          position: NonNegativeInt.orThrow(position),
          workloadMs: output.workloadMs,
          driverMs: output.driverMs,
        });
        return true;
      } catch (cause) {
        fail(cause);
        return false;
      }
    },
    fail,
    toResult: () =>
      error != null || first == null || runs.length === 0
        ? { type: "Failed", ...info, error: error ?? "No measured run." }
        : {
            type: "Measured",
            ...info,
            sqliteVersion: first.sqliteVersion,
            sqliteSourceId: first.sqliteSourceId,
            compileOptions: first.compileOptions,
            pragmas: first.pragmas,
            warmupRuns,
            runs,
          },
  };
};

/** A stack the runner drives, one run at a time. */
export interface StackSession {
  readonly recorder: StackRecorder;
  /** Runs the workloads once and returns the raw output. */
  readonly run: (request: {
    readonly name: string;
    readonly verifyContent: boolean;
  }) => Promise<unknown>;
}

/**
 * Runs the warm-up and measured rounds. The first warm-up run of each stack
 * also checksums its tables. A stack that fails is recorded as failed, and the
 * others go on.
 */
export const runRounds = async ({
  sessions,
  warmupRounds,
  measuredRounds,
  log,
}: {
  sessions: ReadonlyArray<StackSession>;
  warmupRounds: number;
  measuredRounds: number;
  log: (message: string) => void;
}): Promise<void> => {
  const runRound = async (round: number, isWarmup: boolean) => {
    for (const [position, session] of rotate(sessions, round).entries()) {
      const { recorder } = session;
      if (recorder.hasFailed()) continue;
      const name = `${isWarmup ? "warmup" : "run"}-${round + 1}`;
      try {
        const output = await session.run({
          name,
          verifyContent: isWarmup && round === 0,
        });
        if (recorder.record(output, { round, position, isWarmup }))
          log(`${recorder.info.id} ${name}: ${formatRunTotal(output)}`);
      } catch (error) {
        recorder.fail(error);
      }
      if (recorder.hasFailed()) {
        const result = recorder.toResult();
        log(
          `${recorder.info.id} failed: ${result.type === "Failed" ? result.error : ""}`,
        );
      }
    }
  };
  for (let round = 0; round < warmupRounds; round++)
    await runRound(round, true);
  for (let round = 0; round < measuredRounds; round++)
    await runRound(round, false);
};

const formatRunTotal = (output: unknown): string => {
  const parsed = BenchRunOutput.fromUnknown(output);
  if (!parsed.ok) return "";
  const total = parsed.value.workloadMs.reduce((sum, ms) => sum + ms, 0);
  return `${total.toFixed(1)} ms, driver ${Object.values(parsed.value.driverMs)
    .map((ms) => ms.toFixed(1))
    .join(" / ")} ms`;
};
