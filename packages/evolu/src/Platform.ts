import { Context, Effect } from "effect";

export type FlushSync = (callback: () => void) => void;

export const FlushSync = Context.Tag<FlushSync>("evolu/FlushSync");

export interface SyncLock {
  readonly acquire: Effect.Effect<never, never, boolean>;
  readonly release: Effect.Effect<never, never, void>;
}

export const SyncLock = Context.Tag<SyncLock>("evolu/SyncLock");

/**
 * This error occurs when there is a problem with the network connection,
 * or the server cannot be reached.
 */
export interface FetchError {
  readonly _tag: "FetchError";
}

export type Fetch = (
  url: string,
  body: Uint8Array
) => Effect.Effect<never, FetchError, Response>;

export const Fetch = Context.Tag<Fetch>("evolu/Fetch");
