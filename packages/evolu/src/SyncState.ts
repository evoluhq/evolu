import { Millis } from "./Timestamp.js";

export type SyncState =
  | SyncStateIsSyncing
  | SyncStateIsSynced
  | SyncStateIsNotSynced;

export interface SyncStateIsSyncing {
  readonly _tag: "SyncStateIsSyncing";
}

export interface SyncStateIsSynced {
  readonly _tag: "SyncStateIsSynced";
  readonly time: Millis;
}

export interface SyncStateIsNotSynced {
  readonly _tag: "SyncStateIsNotSynced";
  readonly error:
    | SyncStateNetworkError
    | SyncStateServerError
    | SyncStatePaymentRequiredError;
}

/**
 * This error occurs when there is a problem with the network connection,
 * or the server cannot be reached.
 */
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
