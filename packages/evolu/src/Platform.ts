import { Context, Effect, Layer } from "effect";

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

export type Fetch = (
  url: string,
  body: Uint8Array,
) => Effect.Effect<never, FetchError, Response>;

export const Fetch = Context.Tag<Fetch>("evolu/Fetch");

/**
 * This error occurs when there is a problem with the network connection,
 * or the server cannot be reached.
 */
export interface FetchError {
  readonly _tag: "FetchError";
}

export const FetchLive = Layer.succeed(
  Fetch,
  Fetch.of((url, body) =>
    Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "POST",
          body,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": body.length.toString(),
          },
        }),
      catch: (): FetchError => ({ _tag: "FetchError" }),
    }),
  ),
);

export interface AppState {
  readonly onFocus: (callback: () => void) => void;
  readonly onReconnect: (callback: () => void) => void;
  readonly reset: Effect.Effect<never, never, void>;
}

export const AppState = Context.Tag<AppState>("evolu/AppState");
