import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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

export type Fetch = (
  url: string,
  body: Uint8Array,
) => Effect.Effect<Response, FetchError>;

export const Fetch = Context.GenericTag<Fetch>("@services/Fetch");

/**
 * This error occurs when there is a problem with the network connection, or the
 * server cannot be reached.
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
            "Content-Type": "application/x-protobuf",
            "Content-Length": body.length.toString(),
          },
        }),
      catch: (): FetchError => ({ _tag: "FetchError" }),
    }),
  ),
);
