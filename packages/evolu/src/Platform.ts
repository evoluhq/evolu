import { Context, Effect } from "effect";
import { StoreListener } from "./Store.js";

export interface Platform {
  readonly name:
    | "server"
    | "web-with-opfs"
    | "web-without-opfs"
    | "react-native";
}

export const Platform = Context.Tag<Platform>("evolu/Platform");

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

export interface AppState {
  readonly onFocus: (listener: StoreListener) => void;
  readonly onReconnect: (listener: StoreListener) => void;
  readonly reset: Effect.Effect<never, never, void>;
}

export const AppState = Context.Tag<AppState>("evolu/AppState");
