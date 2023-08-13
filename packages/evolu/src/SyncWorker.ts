import { Cause, Context, Effect, Either, Layer, Match } from "effect";
import { AesGcm } from "./Crypto.js";
import { AesGcmLive } from "./CryptoLive.web.js";
import { Owner } from "./Db.js";
import { UnexpectedError, makeUnexpectedError } from "./Errors.js";
import {
  MerkleTree,
  MerkleTreeString,
  merkleTreeToString,
  unsafeMerkleTreeFromString,
} from "./MerkleTree.js";
import { Message } from "./Message.js";
import { Id } from "./Model.js";
import { Fetch, SyncLock } from "./Platform.js";
import { FetchLive } from "./Platform.web.js";
import {
  EncryptedMessage,
  MessageContent,
  SyncRequest,
  SyncResponse,
} from "./Protobuf.js";
import { Value } from "./Sqlite.js";
import { Millis, Timestamp, TimestampString } from "./Timestamp.js";
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

const valueFromProtobuf = (value: MessageContent["value"]): Value => {
  switch (value.oneofKind) {
    case "numberValue":
      return value.numberValue;
    case "stringValue":
      return value.stringValue;
    case "bytesValue":
      return value.bytesValue;
    default:
      return null;
  }
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
      Effect.catchTag("FetchError", () =>
        Effect.fail<SyncStateIsNotSynced>({
          _tag: "SyncStateIsNotSynced",
          error: { _tag: "NetworkError" },
        })
      ),
      Effect.flatMap((response) => {
        switch (response.status) {
          case 402:
            return Effect.fail<SyncStateIsNotSynced>({
              _tag: "SyncStateIsNotSynced",
              error: { _tag: "PaymentRequiredError" },
            });
          case 200:
            return Effect.promise(() =>
              response
                .arrayBuffer()
                .then((buffer) => new Uint8Array(buffer))
                .then((array) => SyncResponse.fromBinary(array))
            );
          default:
            return Effect.fail<SyncStateIsNotSynced>({
              _tag: "SyncStateIsNotSynced",
              error: { _tag: "ServerError", status: response.status },
            });
        }
      }),
      Effect.flatMap((syncResponse) =>
        Effect.forEach(syncResponse.messages, (message) =>
          aesGcm.decrypt(input.owner.encryptionKey, message.content).pipe(
            Effect.map((array) => MessageContent.fromBinary(array)),
            Effect.map(
              (content): Message => ({
                timestamp: message.timestamp as TimestampString,
                table: content.table,
                row: content.row as Id,
                column: content.column,
                value: valueFromProtobuf(content.value),
              })
            )
          )
        ).pipe(
          Effect.map(
            (messages): SyncWorkerInputReceiveMessages => ({
              _tag: "receiveMessages",
              messages,
              merkleTree: unsafeMerkleTreeFromString(
                syncResponse.merkleTree as MerkleTreeString
              ),
              syncLoopCount: input.syncLoopCount,
            })
          )
        )
      ),
      Effect.tapError(() => syncLock.release),
      Effect.match({
        onFailure: syncWorkerOnMessage,
        onSuccess: syncWorkerOnMessage,
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
