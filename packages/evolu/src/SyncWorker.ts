import { Cause, Context, Effect, Either, Layer, Match } from "effect";
import { Owner } from "./Db.js";
import { UnexpectedError, makeUnexpectedError } from "./Errors.js";
import { MerkleTree, merkleTreeToString } from "./MerkleTree.js";
import { Message } from "./Message.js";
import { Fetch, SyncLock } from "./Platform.js";
import { Millis, Timestamp } from "./Timestamp.js";
import { notImplemented } from "./Utils.js";
import { EncryptedMessage, MessageContent, SyncRequest } from "./Protobuf.js";
import { AesGcm } from "./Crypto.js";
import { AesGcmLive } from "./CryptoLive.web.js";
import { Value } from "./Sqlite.js";
import { FetchLive } from "./Platform.web.js";

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
  readonly syncLoopCount: number;
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
  readonly syncLoopCount: number;
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

const valueToProtobuf = (value: Value): MessageContent["value"] => {
  switch (typeof value) {
    case "string":
      return { oneofKind: "stringValue", stringValue: value };
    case "number":
      return { oneofKind: "numberValue", numberValue: value };
  }
  if (value) return { oneofKind: "bytesValue", bytesValue: value };
  return { oneofKind: undefined };
};

const sync = (
  input: SyncWorkerInputSync
): Effect.Effect<
  SyncLock | SyncWorkerOnMessage | AesGcm | Fetch,
  never,
  void
> =>
  Effect.gen(function* (_) {
    const syncLock = yield* _(SyncLock);
    const syncWorkerOnMessage = yield* _(SyncWorkerOnMessage);
    const aesGcm = yield* _(AesGcm);
    const fetch = yield* _(Fetch);

    if (input.syncLoopCount === 0) {
      if (!(yield* _(syncLock.acquire))) return;
      syncWorkerOnMessage({ _tag: "SyncStateIsSyncing" });
    }

    yield* _(
      Effect.forEach(input.messages, ({ timestamp, ...rest }) =>
        aesGcm
          .encrypt(
            input.owner.encryptionKey,
            MessageContent.toBinary({
              table: rest.table,
              row: rest.row,
              column: rest.column,
              value: valueToProtobuf(rest.value),
            })
          )
          .pipe(
            Effect.map((content): EncryptedMessage => ({ timestamp, content }))
          )
      ),
      Effect.map((messages) =>
        SyncRequest.toBinary({
          messages,
          userId: input.owner.id,
          nodeId: input.timestamp.node,
          merkleTree: merkleTreeToString(input.merkleTree),
        })
      ),
      Effect.flatMap((body) => fetch(input.syncUrl, body)),
      Effect.catchTag("FetchError", () => {
        return Effect.succeed(1);
      })
    );
  });

export const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.gen(function* (_) {
    const syncLock = yield* _(SyncLock);

    const handleError = (error: UnexpectedError): void => {
      syncWorker.onMessage(error);
    };

    const postMessage: SyncWorker["postMessage"] = (input) => {
      void Match.value(input).pipe(
        Match.tagsExhaustive({
          sync,
          syncCompleted: () => syncLock.release,
        }),
        // to mozna nebude nutne, ne?
        // errory proste rovnou poslu
        Effect.catchAllCause((cause) =>
          Cause.failureOrCause(cause).pipe(
            Either.match({
              onLeft: handleError,
              onRight: (cause) =>
                handleError(makeUnexpectedError(Cause.squash(cause))),
            }),
            () => Effect.succeed(undefined)
          )
        ),
        Effect.provideService(SyncLock, syncLock),
        Effect.provideService(SyncWorkerOnMessage, syncWorker.onMessage),
        Effect.provideLayer(Layer.mergeAll(AesGcmLive, FetchLive)),
        Effect.runPromise
      );
    };

    const syncWorker: SyncWorker = {
      postMessage,
      onMessage: notImplemented,
    };

    return syncWorker;
  })
);
