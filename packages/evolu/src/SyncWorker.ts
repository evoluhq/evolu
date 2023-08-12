import { Context, Effect, Layer } from "effect";
import { Owner } from "./Db.js";
import { UnexpectedError } from "./Errors.js";
import { MerkleTree } from "./MerkleTree.js";
import { Message } from "./Message.js";
import { SyncLock } from "./Platform.js";
import { Millis, Timestamp } from "./Timestamp.js";
import { notImplemented } from "./Utils.js";

export interface SyncWorker {
  readonly postMessage: (input: SyncWorkerInput) => void;
  onMessage: (output: SyncWorkerOutput) => void;
}

export const SyncWorker = Context.Tag<SyncWorker>("evolu/SyncWorker");

export type SyncWorkerPostMessage = SyncWorker["postMessage"];

export const SyncWorkerPostMessage = Context.Tag<SyncWorkerPostMessage>(
  "evolu/SyncWorkerPostMessage"
);

export type SyncWorkerInput =
  | SyncWorkerInputSync
  | SyncWorkerInputSyncCompleted;

interface SyncWorkerInputSync {
  readonly _tag: "sync";
  readonly syncUrl: string;
  readonly messages: ReadonlyArray<Message>;
  readonly merkleTree: MerkleTree;
  readonly timestamp: Timestamp;
  readonly owner: Owner;
  readonly syncCount: number;
}

interface SyncWorkerInputSyncCompleted {
  readonly _tag: "syncCompleted";
}

type SyncWorkerOnMessage = SyncWorker["onMessage"];

const SyncWorkerOnMessage = Context.Tag<SyncWorkerOnMessage>(
  "evolu/SyncWorkerOnMessage"
);

export type SyncWorkerOutput =
  | UnexpectedError
  | SyncWorkerInputReceiveMessages
  | SyncStateIsNotSynced
  | SyncStateIsSyncing;

export type SyncWorkerInputReceiveMessages = {
  readonly _tag: "receiveMessages";
  readonly messages: ReadonlyArray<Message>;
  readonly merkleTree: MerkleTree;
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

export const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.gen(function* (_) {
    const syncLock = yield* _(SyncLock);

    const postMessage: SyncWorker["postMessage"] = (_input) => {
      // Match.value(input).pipe(
      //   Match.tagsExhaustive({
      //     sync: () => Effect.succeed(undefined),
      //     syncCompleted: () => syncLock.release,
      //   })
      //   // Effect.provideLayer(writeLayer),
      //   // run
      // );
      //   const writer = stream.getWriter();
      //   void writer.write(input);
      //   writer.releaseLock();
    };

    const syncWorker: SyncWorker = {
      postMessage,
      onMessage: notImplemented,
    };

    return syncWorker;
  })
);
