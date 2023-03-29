import { either, option, task, taskEither } from "fp-ts";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { IO } from "fp-ts/lib/IO.js";
import { Task } from "fp-ts/lib/Task.js";
import { TaskEither } from "fp-ts/lib/TaskEither.js";
import { decrypt, encrypt } from "micro-aes-gcm";
import {
  merkleTreeFromString,
  MerkleTreeString,
  merkleTreeToString,
} from "./merkleTree.js";
import { Id, OwnerId } from "./model.js";
import {
  CrdtMessageContent,
  EncryptedCrdtMessage,
  SyncRequest,
  SyncResponse,
} from "./protobuf.js";
import { requestSync } from "./syncLock.js";
import { TimestampString } from "./timestamp.js";
import {
  CrdtClock,
  CrdtMessage,
  CrdtValue,
  DbWorkerInputReceive,
  errorToUnknownError,
  SyncWorkerInput,
  SyncWorkerOutput,
  UnknownError,
} from "./types.js";

const crdtValueToProtobuf = (value: CrdtValue): CrdtMessageContent["value"] => {
  switch (typeof value) {
    case "string":
      return { oneofKind: "stringValue", stringValue: value };
    case "number":
      return { oneofKind: "numberValue", numberValue: value };
  }
  if (value) return { oneofKind: "bytesValue", bytesValue: value };
  return { oneofKind: undefined };
};

const protobufToCrdtValue = (value: CrdtMessageContent["value"]): CrdtValue => {
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

const encryptMessages = ({
  messages,
  key,
}: {
  readonly messages: readonly CrdtMessage[];
  readonly key: Uint8Array;
}): TaskEither<UnknownError, readonly EncryptedCrdtMessage[]> =>
  pipe(
    messages,
    taskEither.traverseArray(({ timestamp, ...props }) =>
      pipe(
        CrdtMessageContent.toBinary({
          ...props,
          value: crdtValueToProtobuf(props.value),
        }),
        (binary) =>
          taskEither.tryCatch(() => encrypt(key, binary), errorToUnknownError),
        taskEither.map(
          (content): EncryptedCrdtMessage => ({
            timestamp,
            content: content as Uint8Array,
          })
        )
      )
    )
  );

const createSyncRequest =
  ({
    ownerId,
    clock,
  }: {
    readonly ownerId: OwnerId;
    readonly clock: CrdtClock;
  }) =>
  (messages: readonly EncryptedCrdtMessage[]): Uint8Array =>
    SyncRequest.toBinary({
      messages: messages as EncryptedCrdtMessage[],
      userId: ownerId,
      nodeId: clock.timestamp.node,
      merkleTree: merkleTreeToString(clock.merkleTree),
    });

interface FetchError {
  readonly type: "FetchError";
  readonly error: unknown;
}

// TODO: Add ServerError (can't parse a response or HttpStatus 500 etc.)
const postSyncRequest =
  (syncUrl: string) =>
  (body: Uint8Array): TaskEither<FetchError, SyncResponse> =>
    taskEither.tryCatch(
      () =>
        fetch(syncUrl, {
          method: "POST",
          body,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": body.length.toString(),
          },
        })
          .then((res) => res.arrayBuffer())
          .then(Buffer.from)
          .then((b) => SyncResponse.fromBinary(b)),
      (error): FetchError => ({ type: "FetchError", error })
    );

const decryptMessages = ({
  messages,
  key,
}: {
  readonly messages: readonly EncryptedCrdtMessage[];
  readonly key: Uint8Array;
}): TaskEither<UnknownError, readonly CrdtMessage[]> =>
  pipe(
    messages,
    taskEither.traverseArray((message) =>
      pipe(
        taskEither.tryCatch(
          () =>
            decrypt(key, message.content).then((data) =>
              CrdtMessageContent.fromBinary(data)
            ),
          errorToUnknownError
        ),
        taskEither.map(
          (content): CrdtMessage => ({
            timestamp: message.timestamp as TimestampString,
            table: content.table,
            row: content.row as Id,
            column: content.column,
            value: protobufToCrdtValue(content.value),
          })
        )
      )
    )
  );

type PostSyncWorkerOutput = (message: SyncWorkerOutput) => IO<void>;

const sync = ({
  syncUrl,
  messages,
  clock,
  owner: { id: ownerId },
  postSyncWorkerOutput,
  previousDiff,
  key,
}: SyncWorkerInput & {
  readonly postSyncWorkerOutput: PostSyncWorkerOutput;
  readonly key: Uint8Array;
}): Task<void> =>
  pipe(
    encryptMessages({
      messages: pipe(
        messages,
        option.getOrElseW(() => [])
      ),
      key,
    }),
    taskEither.map(createSyncRequest({ ownerId, clock })),
    taskEither.chainW(postSyncRequest(syncUrl)),
    taskEither.chainW(({ merkleTree, messages }) =>
      pipe(
        decryptMessages({ messages, key }),
        taskEither.map(
          (messages): DbWorkerInputReceive => ({
            type: "receive",
            messages,
            merkleTree: merkleTreeFromString(merkleTree as MerkleTreeString),
            previousDiff,
          })
        )
      )
    ),
    task.chainIOK(
      either.match((e) => {
        // Ignore FetchError, because it's not an error we should handle
        // elsewhere. It happens when it's impossible to make a request.
        // Theoretically, we could use `navigator.onLine`, but it's not
        // reliable. onLine can be false negative in Chrome and false
        // positive everywhere, so we would have to ignore FetchError anyway.
        // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
        // https://bugs.chromium.org/p/chromium/issues/detail?id=678075,
        if (e.type === "FetchError") return constVoid;
        return postSyncWorkerOutput(either.left(e));
      }, flow(either.right, postSyncWorkerOutput))
    )
  );

const postSyncWorkerOutput: PostSyncWorkerOutput = (message) => () =>
  postMessage(message);

onmessage = ({ data }: MessageEvent<SyncWorkerInput>): void =>
  requestSync(
    sync({
      ...data,
      postSyncWorkerOutput,
      key: data.owner.encryptionKey,
    })
  );
