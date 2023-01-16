import { either, option, task, taskEither } from "fp-ts";
import { IO } from "fp-ts/IO";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { Task } from "fp-ts/Task";
import { TaskEither } from "fp-ts/TaskEither";
import "nested-worker/worker";
import {
  createMessage,
  decrypt,
  encrypt,
  readMessage,
} from "openpgp/lightweight";
import { ID, Mnemonic, OwnerId } from "./model.js";
import {
  CrdtMessageContent,
  EncryptedCrdtMessage,
  SyncRequest,
  SyncResponse,
} from "./protobuf.js";
import { requestSync } from "./syncLock.js";
import {
  CrdtClock,
  CrdtMessage,
  CrdtValue,
  errorToUnknownError,
  merkleTreeFromString,
  MerkleTreeString,
  merkleTreeToString,
  SyncWorkerInput,
  SyncWorkerOutput,
  TimestampString,
  UnknownError,
} from "./types.js";

const crdtValueToProtobufFormat = (
  value: CrdtValue
): CrdtMessageContent["value"] => {
  switch (typeof value) {
    case "string":
      return { oneofKind: "stringValue", stringValue: value };
    case "number":
      return { oneofKind: "numberValue", numberValue: value };
    default:
      return { oneofKind: undefined };
  }
};

const encryptMessages = ({
  messages,
  mnemonic,
}: {
  readonly messages: readonly CrdtMessage[];
  readonly mnemonic: Mnemonic;
}): TaskEither<UnknownError, readonly EncryptedCrdtMessage[]> =>
  pipe(
    messages,
    taskEither.traverseArray(({ timestamp, ...props }) =>
      pipe(
        CrdtMessageContent.toBinary({
          ...props,
          value: crdtValueToProtobufFormat(props.value),
        }),
        (binary) =>
          taskEither.tryCatch(
            () => createMessage({ binary }),
            errorToUnknownError
          ),
        taskEither.chain((message) =>
          taskEither.tryCatch(
            () =>
              encrypt({
                message,
                passwords: mnemonic,
                format: "binary",
                // https://github.com/openpgpjs/openpgpjs/discussions/1481#discussioncomment-2125162
                config: { s2kIterationCountByte: 0 },
              }),
            errorToUnknownError
          )
        ),
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
  mnemonic,
}: {
  readonly messages: readonly EncryptedCrdtMessage[];
  readonly mnemonic: Mnemonic;
}): TaskEither<UnknownError, readonly CrdtMessage[]> =>
  pipe(
    messages,
    taskEither.traverseArray((message) =>
      pipe(
        taskEither.tryCatch(
          () =>
            readMessage({ binaryMessage: message.content })
              .then((message) =>
                decrypt({ message, passwords: mnemonic, format: "binary" })
              )
              .then(({ data }) =>
                CrdtMessageContent.fromBinary(data as Uint8Array)
              ),
          errorToUnknownError
        ),
        taskEither.map(
          (content): CrdtMessage => ({
            timestamp: message.timestamp as TimestampString,
            table: content.table,
            row: content.row as ID<string>,
            column: content.column,
            value:
              content.value.oneofKind === "numberValue"
                ? content.value.numberValue
                : content.value.oneofKind === "stringValue"
                ? content.value.stringValue
                : null,
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
  owner: { mnemonic, id: ownerId },
  postSyncWorkerOutput,
  previousDiff,
}: SyncWorkerInput & {
  readonly postSyncWorkerOutput: PostSyncWorkerOutput;
}): Task<void> =>
  pipe(
    encryptMessages({
      messages: pipe(
        messages,
        option.getOrElseW(() => [])
      ),
      mnemonic,
    }),
    taskEither.map(createSyncRequest({ ownerId, clock })),
    taskEither.chainW(postSyncRequest(syncUrl)),
    taskEither.chainW(({ merkleTree, messages }) =>
      pipe(
        decryptMessages({ messages, mnemonic }),
        taskEither.map((messages) => ({
          messages,
          merkleTree: merkleTreeFromString(merkleTree as MerkleTreeString),
          previousDiff,
        }))
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
  self.postMessage(message);

addEventListener("message", ({ data }: MessageEvent<SyncWorkerInput>) => {
  requestSync(sync({ ...data, postSyncWorkerOutput }));
});
