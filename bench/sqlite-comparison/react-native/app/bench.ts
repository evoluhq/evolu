/**
 * The app's side of the React Native target, as `../protocol.mts` describes: it
 * fetches the plan and the workloads from the runner, creates every stack,
 * drives the rounds in this one process, and reports each run.
 *
 * @module
 */
import { Platform } from "react-native";
import { rotate, runBench, type BenchStack } from "../../run.mts";
import { splitStatements } from "../../workload.mts";
import {
  reactNativeServerPort,
  type ReactNativeMeta,
  type ReactNativePlan,
  type ReactNativeRunReport,
  type ReactNativeStackId,
} from "../protocol.mts";
import { createReactNativeStack } from "./stacks.ts";

const serverUrl = `http://localhost:${reactNativeServerPort}`;

const post = async (path: string, body: unknown): Promise<Response> => {
  const response = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`POST ${path} failed (${response.status}).`);
  return response;
};

const describeError = (error: unknown): string =>
  error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
    : String(error);

/** Runs the session the runner planned, reporting progress to `onStatus`. */
export const runReactNativeBench = async (
  onStatus: (status: string) => void,
): Promise<void> => {
  try {
    onStatus("Fetching the plan");
    const plan = (await (
      await fetch(`${serverUrl}/plan`)
    ).json()) as ReactNativePlan;
    const workloads: Array<ReadonlyArray<string>> = [];
    for (let index = 0; index < plan.workloadCount; index++) {
      const response = await fetch(`${serverUrl}/workload/${index}`);
      if (!response.ok)
        throw new Error(`Cannot fetch workload ${index} (${response.status}).`);
      workloads.push(splitStatements(await response.text()));
    }

    const { reactNativeVersion } = Platform.constants;
    const hermes = (
      globalThis as {
        readonly HermesInternal?: {
          readonly getRuntimeProperties?: () => Record<string, string>;
        };
      }
    ).HermesInternal?.getRuntimeProperties?.()["OSS Release Version"];
    await post("/meta", {
      platform: Platform.OS,
      // A number on Android and a string on iOS.
      os: String(Platform.Version),
      dev: __DEV__,
      reactNative: `${reactNativeVersion.major}.${reactNativeVersion.minor}.${reactNativeVersion.patch}`,
      hermes: hermes ?? null,
    } satisfies ReactNativeMeta);

    const sessions: ReadonlyArray<{
      readonly id: ReactNativeStackId;
      readonly encrypted: boolean;
      stack: BenchStack | null;
      failed: boolean;
    }> = plan.stacks.map(({ id, encrypted }) => ({
      id,
      encrypted,
      stack: null,
      failed: false,
    }));

    const runRound = async (round: number, isWarmup: boolean) => {
      for (const [position, session] of rotate(sessions, round).entries()) {
        if (session.failed) continue;
        const name = `${isWarmup ? "warmup" : "run"}-${round + 1}`;
        onStatus(`${session.id} ${name}`);
        const report = { stackId: session.id, round, position, isWarmup };
        try {
          session.stack ??= createReactNativeStack(session.id);
          const output = await runBench(session.stack, {
            name,
            workloads,
            encrypted: session.encrypted,
            verifyContent: isWarmup && round === 0,
          });
          const response = await post("/run", {
            ...report,
            type: "Done",
            output,
          } satisfies ReactNativeRunReport);
          // The runner rejected a run that didn't do all the work.
          session.failed = (
            (await response.json()) as { isFailed: boolean }
          ).isFailed;
        } catch (error) {
          session.failed = true;
          await post("/run", {
            ...report,
            type: "Failed",
            error: describeError(error),
          } satisfies ReactNativeRunReport);
        }
      }
    };
    for (let round = 0; round < plan.warmupRounds; round++)
      await runRound(round, true);
    for (let round = 0; round < plan.measuredRounds; round++)
      await runRound(round, false);

    for (const session of sessions) await session.stack?.dispose();
    await post("/done", {});
    onStatus("Done");
  } catch (error) {
    onStatus(`Failed: ${describeError(error)}`);
    await post("/fatal", { error: describeError(error) }).catch(
      () => undefined,
    );
  }
};
