import { absurd, flow, pipe } from "@effect/data/Function";
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
  SyncStateIsNotSynced,
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

const sync = ({
  syncUrl,
  messages,
  clock,
  owner,
  syncCount,
}: SyncWorkerInputSync): Effect.Effect<
  never,
  SyncStateIsNotSynced,
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
          }),
        (): SyncStateIsNotSynced => ({
          _tag: "SyncStateIsNotSynced",
          error: { _tag: "NetworkError" },
        })
      )
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
              .then((buffer) => SyncResponse.fromBinary(Buffer.from(buffer)))
          );
        default:
          return Effect.fail<SyncStateIsNotSynced>({
            _tag: "SyncStateIsNotSynced",
            error: { _tag: "ServerError", status: response.status },
          });
      }
    }),
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
            syncCount,
          })
        )
      )
    )
  );

class SyncSkipped {
  readonly _tag = "SyncSkipped";
}

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
              // Skip syncing if it's already syncing.
              // `syncCount === 0` means an attempt to start another sync loop.
              if (message.syncCount === 0 && (yield* $(isSyncing)))
                yield* $(Effect.fail(new SyncSkipped()));
              setIsSyncing(true);
              return yield* $(sync(message));
            }),
            Effect.merge,
            Effect.catchAllCause(
              flow(Cause.squash, unknownError, Effect.succeed)
            ),
            Effect.runPromise
          ).then((a) => {
            if (a._tag === "SyncSkipped") return;
            if (a._tag !== "receiveMessages") setIsSyncing(false);
            onMessage(a);
          });
          return;
        default:
          absurd(message);
      }
    },
  });
