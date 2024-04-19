import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { Config } from "./Config.js";
import { Millis } from "./Crdt.js";

export class Sync extends Context.Tag("Sync")<
  Sync,
  {
    readonly sync: () => Effect.Effect<void>;
    readonly dispose: () => Effect.Effect<void>;
  }
>() {}

export interface SyncService extends Context.Tag.Service<typeof Sync> {}

export class SyncFactory extends Context.Tag("SyncFactory")<
  SyncFactory,
  {
    readonly createSync: Effect.Effect<SyncService, never, Config>;
  }
>() {}

export const createSync: Effect.Effect<SyncService, never, never> = Effect.gen(
  function* (_) {
    yield* _(Effect.void);

    return Sync.of({
      sync: () => Effect.void,
      dispose: () => Effect.void,
    });
  },
);

/**
 * The SyncState type represents the various states that a synchronization
 * process can be in.
 */
export type SyncState =
  | SyncStateInitial
  | SyncStateIsSyncing
  | SyncStateIsSynced
  | SyncStateIsNotSyncedError;

export interface SyncStateInitial {
  readonly _tag: "SyncStateInitial";
}

export interface SyncStateIsSyncing {
  readonly _tag: "SyncStateIsSyncing";
}

export interface SyncStateIsSynced {
  readonly _tag: "SyncStateIsSynced";
  readonly time: Millis;
}

export interface SyncStateIsNotSyncedError {
  readonly _tag: "SyncStateIsNotSyncedError";
  readonly error:
    | SyncStateNetworkError
    | SyncStateServerError
    | SyncStatePaymentRequiredError;
}

export interface SyncStateNetworkError {
  readonly _tag: "NetworkError";
}

export interface SyncStateServerError {
  readonly _tag: "ServerError";
  readonly status: number;
}

export interface SyncStatePaymentRequiredError {
  readonly _tag: "PaymentRequiredError";
}
