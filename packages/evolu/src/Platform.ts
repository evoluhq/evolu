import { Context, Effect } from "effect";

export type FlushSync = (callback: () => void) => void;

export const FlushSync = Context.Tag<FlushSync>("evolu/FlushSync");

export interface SyncLock {
  // acquire
  // release

  readonly isSyncing: Effect.Effect<never, never, boolean>;
  readonly setIsSyncing: (
    isSyncing: boolean
  ) => Effect.Effect<never, never, void>;
}

export const SyncLock = Context.Tag<SyncLock>("evolu/SyncLock");
