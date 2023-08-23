import { Effect, Function, Layer } from "effect";
import {
  AppState,
  Fetch,
  FetchError,
  FlushSync,
  Platform,
  SyncLock,
} from "./Platform.js";

export const PlatformLive = Layer.succeed(Platform, {
  name: "react-native",
});

export const FlushSyncLive = Layer.succeed(FlushSync, Function.constVoid);

export const SyncLockLive = Layer.effect(
  SyncLock,
  Effect.sync(() => {
    let hasLock = false;

    const acquire: SyncLock["acquire"] = Effect.sync(() => {
      if (hasLock) return false;
      hasLock = true;
      return true;
    });

    const release: SyncLock["release"] = Effect.sync(() => {
      hasLock = false;
    });

    return { acquire, release };
  }),
);

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

export const AppStateLive = Layer.effect(
  AppState,
  Effect.sync(() => {
    const onFocus: AppState["onFocus"] = (_callback) => {
      // TODO:
    };

    const onReconnect: AppState["onReconnect"] = (_listener) => {
      // TODO:
    };

    const reset: AppState["reset"] = Effect.sync(() => {
      // TODO:
    });

    return AppState.of({ onFocus, onReconnect, reset });
  }),
);
