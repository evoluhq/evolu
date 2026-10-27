/**
 * What the React Native app and the runner on the host say to each other over
 * HTTP. The runner serves on {@link reactNativeServerPort} of the host's
 * loopback, which the iOS simulator shares and the Android emulator reaches
 * through `adb reverse`. The app, a Release build, starts at launch:
 *
 * 1. `GET /plan` returns a {@link ReactNativePlan}, and `GET /workload/<index>` the
 *    SQL of each workload, which the app splits.
 * 2. `POST /meta` sends a {@link ReactNativeMeta}.
 * 3. `POST /run` sends a {@link ReactNativeRunReport} after every run, and the
 *    answer, `{ isFailed }`, tells whether the runner rejected the stack, which
 *    then runs no more.
 * 4. `POST /done` ends the session, or `POST /fatal` with `{ error }` when the app
 *    can't go on.
 *
 * It imports nothing, so the app and the runner share it.
 *
 * @module
 */

/** The host's port, next to the web target's. */
export const reactNativeServerPort = 63323;

export type ReactNativeStackId =
  "evolu" | "evoluEncrypted" | "expoSqlite" | "opSqlite";

export interface ReactNativePlan {
  readonly warmupRounds: number;
  readonly measuredRounds: number;
  /** The stacks, in the order of the first round. */
  readonly stacks: ReadonlyArray<{
    readonly id: ReactNativeStackId;
    readonly encrypted: boolean;
  }>;
  readonly workloadCount: number;
}

export interface ReactNativeMeta {
  readonly platform: string;
  readonly os: string;
  /** Whether the app is a development build, which the runner refuses. */
  readonly dev: boolean;
  readonly reactNative: string;
  readonly hermes: string | null;
}

export type ReactNativeRunReport = {
  readonly stackId: ReactNativeStackId;
  readonly round: number;
  readonly position: number;
  readonly isWarmup: boolean;
} & (
  | { readonly type: "Done"; readonly output: unknown }
  | { readonly type: "Failed"; readonly error: string }
);
