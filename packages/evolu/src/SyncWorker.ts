import * as Either from "@effect/data/Either";
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
  DbWorkerInputReceiveMessages,
  MerkleTreeString,
  Message,
  SyncWorkerInput,
  SyncWorkerOnMessage,
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

export const sync = ({
  syncUrl,
  messages,
  clock,
  owner,
  previousDiff,
  onMessage,
}: SyncWorkerInput & {
  readonly onMessage: SyncWorkerOnMessage;
}): Promise<void> =>
  pipe(
    Effect.forEach(messages, encryptMessage(owner.encryptionKey)),
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
        Effect.forEach(messages, decryptMessage(owner.encryptionKey)),
        Effect.map(
          (messages): DbWorkerInputReceiveMessages => ({
            _tag: "receiveMessages",
            messages,
            merkleTree: unsafeMerkleTreeFromString(
              merkleTree as MerkleTreeString
            ),
            previousDiff,
          })
        ),
        Effect.map(onMessage)
      )
    ),
    // Ignore FetchError, because there is not much we can do with that.
    Effect.catchTag("FetchError", () => Effect.succeed(undefined)),
    Effect.catchAllCause(
      flow(
        Cause.failureOrCause,
        Either.match(absurd, flow(Cause.squash, unknownError, onMessage)),
        () => Effect.succeed(undefined)
      )
    ),
    Effect.runPromise
  );
