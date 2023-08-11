import { Context } from "effect";
import { Millis } from "./Timestamp.js";
import { UnexpectedError } from "./Errors.js";

export interface SyncWorker {
  readonly postMessage: (input: SyncWorkerInput) => void;
  readonly onMessage: (callback: SyncWorkerOnMessageCallback) => void;
}

export const SyncWorker = Context.Tag<SyncWorker>("evolu/SyncWorker");

export type SyncWorkerInput =
  | SyncWorkerInputSync
  | SyncWorkerInputSyncCompleted;

interface SyncWorkerInputSync {
  readonly _tag: "sync";
  readonly syncUrl: string;
  //   readonly messages: ReadonlyArray<Message>;
  //   readonly clock: Clock;
  //   readonly owner: Owner;
  readonly syncCount: number;
}

interface SyncWorkerInputSyncCompleted {
  readonly _tag: "syncCompleted";
}

type SyncWorkerOnMessageCallback = (output: SyncWorkerOutput) => void;

const SyncWorkerOnMessageCallback = Context.Tag<SyncWorkerOnMessageCallback>(
  "evolu/SyncWorkerOnMessageCallback"
);

export type SyncWorkerOutput =
  | UnexpectedError
  | SyncWorkerInputReceiveMessages
  | SyncStateIsNotSynced
  | SyncStateIsSyncing;

export type SyncWorkerInputReceiveMessages = {
  readonly _tag: "receiveMessages";
  //   readonly messages: ReadonlyArray<Message>;
  //   readonly merkleTree: MerkleTree;
  readonly syncCount: number;
};

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
