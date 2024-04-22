import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Config } from "./Config.js";

/**
 * FlushSync is a service for libraries like React to synchronously flush
 * updates inside the provided callback to ensure the DOM is updated
 * immediately.
 *
 * https://react.dev/reference/react-dom/flushSync
 */
export type FlushSync = (callback: () => void) => void;
export const FlushSync = Context.GenericTag<FlushSync>("FlushSync");

export class AppState extends Context.Tag("AppState")<
  AppState,
  {
    readonly init: (options: {
      readonly reloadUrl: string;
      readonly onRequestSync: () => void;
    }) => Effect.Effect<AppStateReset>;
  }
>() {}

interface AppStateReset {
  readonly reset: Effect.Effect<void>;
}

// TODO: Ask the Effect team for review.
export class SyncLock extends Context.Tag("SyncLock")<
  SyncLock,
  {
    readonly tryAcquire: Effect.Effect<
      Option.Option<SyncLockRelease>,
      never,
      Config
    >;
  }
>() {}

export interface SyncLockRelease {
  readonly release: Effect.Effect<void>;
}
