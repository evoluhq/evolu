import * as Either from "@effect/data/Either";
import { absurd, flow, identity, pipe } from "@effect/data/Function";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import { decrypt, encrypt } from "micro-aes-gcm";
import {
  merkleTreeToString,
  unsafeMerkleTreeFromString,
} from "./MerkleTree.js";
import { Id } from "./Model.js";
import {
  EncryptedMessage,
  MessageContent,
  SyncRequest,
  SyncResponse,
} from "./Protobuf.js";
import {
  CreateSyncWorker,
  DbWorkerInputReceiveMessages,
  MerkleTreeString,
  Message,
  SyncWorkerInputSync,
  TimestampString,
  Value,
} from "./Types.js";
import { unknownError } from "./UnknownError.js";

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

const encryptMessage =
  (encryptionKey: Uint8Array) =>
  ({
    timestamp,
    value,
    ...rest
  }: Message): Effect.Effect<never, never, EncryptedMessage> =>
    pipe(
      MessageContent.toBinary({
        ...rest,
        value: valueToProtobuf(value),
      }),
      (binary) => Effect.promise(() => encrypt(encryptionKey, binary)),
      Effect.map((content): EncryptedMessage => ({ timestamp, content }))
    );

const protobufToValue = (value: MessageContent["value"]): Value => {
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

const decryptMessage =
  (encryptionKey: Uint8Array) =>
  (message: EncryptedMessage): Effect.Effect<never, never, Message> =>
    pipe(
      Effect.promise(() =>
        decrypt(encryptionKey, message.content).then((data) =>
          MessageContent.fromBinary(data)
        )
      ),
      Effect.map(
        (content): Message => ({
          timestamp: message.timestamp as TimestampString,
          table: content.table,
          row: content.row as Id,
          column: content.column,
          value: protobufToValue(content.value),
        })
      )
    );

// TODO: Add ServerError (can't parse a response or HttpStatus 500 etc.)
interface FetchError {
  readonly _tag: "FetchError";
  readonly error: unknown;
}

const sync = ({
  syncUrl,
  messages,
  clock,
  owner,
  previousDiff,
}: SyncWorkerInputSync): Effect.Effect<
  never,
  FetchError,
  DbWorkerInputReceiveMessages
> =>
  pipe(
    messages,
    Effect.forEach(encryptMessage(owner.encryptionKey)),
    Effect.map((messages) =>
      SyncRequest.toBinary({
        messages,
        userId: owner.id,
        nodeId: clock.timestamp.node,
        merkleTree: merkleTreeToString(clock.merkleTree),
      })
    ),
    Effect.flatMap((body) =>
      Effect.tryCatchPromise(
        () =>
          fetch(syncUrl, {
            method: "POST",
            body,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": body.length.toString(),
            },
          })
            .then((response) => response.arrayBuffer())
            .then(Buffer.from)
            .then((data) => SyncResponse.fromBinary(data)),
        (error): FetchError => ({ _tag: "FetchError", error })
      )
    ),
    Effect.flatMap(({ merkleTree, messages }) =>
      pipe(
        messages,
        Effect.forEach(decryptMessage(owner.encryptionKey)),
        Effect.map(
          (messages): DbWorkerInputReceiveMessages => ({
            _tag: "receiveMessages",
            messages,
            merkleTree: unsafeMerkleTreeFromString(
              merkleTree as MerkleTreeString
            ),
            previousDiff,
          })
        )
      )
    )
  );

export const createCreateSyncWorker =
  ({
    isSyncing,
    setIsSyncing,
  }: {
    isSyncing: Effect.Effect<never, never, boolean>;
    setIsSyncing: (isSyncing: boolean) => void;
  }): CreateSyncWorker =>
  (onMessage) => ({
    post: (message): void => {
      switch (message._tag) {
        case "syncCompleted":
          setIsSyncing(false);
          return;
        case "sync":
          pipe(
            Effect.gen(function* ($) {
              // To keep client-server sync loop until it finishes.
              // previousDiff is null when the sync loop is started.
              if (message.previousDiff == null && (yield* $(isSyncing))) {
                console.log("skip");

                return;
              }
              setIsSyncing(true);
              return yield* $(sync(message));
            }),
            Effect.catchAllCause(
              flow(
                Cause.failureOrCause,
                Either.map(Cause.squash),
                Either.map(unknownError)
              )
            ),
            Effect.match(identity, identity),
            Effect.runPromise
          ).then((message) => {
            // Sync was skipped.
            if (!message) return;
            // FetchError stops syncing but doesn't have to be propagated.
            if (message._tag === "FetchError") {
              setIsSyncing(false);
              return;
            }
            // UnknownError also stops syncing.
            if (message._tag === "UnknownError") setIsSyncing(false);
            onMessage(message);
          });
          return;
        default:
          absurd(message);
      }
    },
  });
