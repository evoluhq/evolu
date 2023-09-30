import { concatBytes } from "@noble/ciphers/utils";
import { BinaryReader, BinaryWriter } from "@protobuf-ts/runtime";
import {
  Context,
  Effect,
  Function,
  Layer,
  Option,
  Predicate,
  ReadonlyArray,
  absurd,
  identity,
} from "effect";
import { SecretBox } from "./Crypto.js";
import { Owner } from "./Db.js";
import { UnexpectedError, makeUnexpectedError } from "./Errors.js";
import {
  MerkleTree,
  merkleTreeToString,
  unsafeMerkleTreeFromString,
} from "./MerkleTree.js";
import { Id } from "./Model.js";
import { Fetch, SyncLock } from "./Platform.js";
import {
  EncryptedMessage,
  MessageContent,
  SyncRequest,
  SyncResponse,
} from "./Protobuf.js";
import { JsonObjectOrArray, Value } from "./Sqlite.js";
import { Millis, Timestamp, TimestampString } from "./Timestamp.js";

export interface SyncWorker {
  readonly postMessage: (input: SyncWorkerInput) => void;
  onMessage: (output: SyncWorkerOutput) => void;
}

export const SyncWorker = Context.Tag<SyncWorker>("evolu/SyncWorker");

export type SyncWorkerPostMessage = SyncWorker["postMessage"];

export const SyncWorkerPostMessage = Context.Tag<SyncWorkerPostMessage>(
  "evolu/SyncWorkerPostMessage",
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

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}

interface SyncWorkerInputSyncCompleted {
  readonly _tag: "syncCompleted";
}

type SyncWorkerOnMessage = SyncWorker["onMessage"];

const SyncWorkerOnMessage = Context.Tag<SyncWorkerOnMessage>(
  "evolu/SyncWorkerOnMessage",
);

export type SyncWorkerOutput =
  | UnexpectedError
  | SyncWorkerOutputSyncResponse
  | SyncStateIsNotSyncedError
  | SyncStateIsSyncing;

export type SyncWorkerOutputSyncResponse = {
  readonly _tag: "SyncWorkerOutputSyncResponse";
  readonly messages: ReadonlyArray<Message>;
  readonly merkleTree: MerkleTree;
  readonly syncLoopCount: number;
};

export type SyncState =
  | SyncStateInitial
  | SyncStateIsSyncing
  | SyncStateIsSynced
  | SyncStateIsNotSyncedError;

export interface SyncStateInitial {
  readonly _tag: "SyncStateInitial";
}

export interface SyncStateIsSyncing {
  readonly _tag: "SyncStateIsSyncing";
}

export interface SyncStateIsSynced {
  readonly _tag: "SyncStateIsSynced";
  readonly time: Millis;
}

export interface SyncStateIsNotSyncedError {
  readonly _tag: "SyncStateIsNotSyncedError";
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

const version1 = new Uint8Array([0, 1]);

const valueToProtobuf = (value: Value): MessageContent["value"] => {
  switch (typeof value) {
    case "string":
      return { oneofKind: "stringValue", stringValue: value };
    case "number":
      return { oneofKind: "numberValue", numberValue: value };
  }
  if (value == null) return { oneofKind: undefined };
  if (Predicate.isUint8Array(value))
    return { oneofKind: "bytesValue", bytesValue: value };
  return { oneofKind: "jsonValue", jsonValue: JSON.stringify(value) };
};

const valueFromProtobuf = (value: MessageContent["value"]): Value => {
  switch (value.oneofKind) {
    case "numberValue":
      return value.numberValue;
    case "stringValue":
      return value.stringValue;
    case "bytesValue":
      return value.bytesValue;
    case "jsonValue":
      return JSON.parse(value.jsonValue) as JsonObjectOrArray;
    case undefined:
      return null;
    default:
      return absurd(value);
  }
};

const newMessageToBinary = ({ value, ...rest }: NewMessage): Uint8Array =>
  concatBytes(
    version1,
    MessageContent.toBinary(
      { value: valueToProtobuf(value), ...rest },
      binaryWriteOptions,
    ),
  );

const startsWithArray = (array: Uint8Array, prefix: Uint8Array): boolean => {
  if (prefix.length > array.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (array[i] !== prefix[i]) return false;
  }
  return true;
};

const newMessageFromBinary = (
  binary: Uint8Array,
): Option.Option<NewMessage> => {
  if (!startsWithArray(binary, version1)) return Option.none();
  const { value, ...content } = MessageContent.fromBinary(
    binary.slice(version1.length),
    binaryReadOptions,
  );
  return Option.some({ value: valueFromProtobuf(value), ...content });
};

// The 'protobuf-ts' uses TextEncoder, but polyfill fast-text-encoding
// doesn't support the fatal option.
// https://github.com/timostamm/protobuf-ts/issues/184#issuecomment-1658443836
const binaryWriteOptions = {
  writerFactory: (): BinaryWriter =>
    new BinaryWriter({
      encode: (input: string): Uint8Array => new TextEncoder().encode(input),
    }),
};
const binaryReadOptions = {
  readerFactory: (bytes: Uint8Array): BinaryReader =>
    new BinaryReader(bytes, {
      decode: (input: Uint8Array): string => new TextDecoder().decode(input),
    }),
};

const sync = (
  input: SyncWorkerInputSync,
): Effect.Effect<
  SyncLock | SyncWorkerOnMessage | Fetch | SecretBox,
  never,
  void
> =>
  Effect.gen(function* (_) {
    const syncLock = yield* _(SyncLock);
    const syncWorkerOnMessage = yield* _(SyncWorkerOnMessage);
    const fetch = yield* _(Fetch);
    const secretBox = yield* _(SecretBox);

    if (input.syncLoopCount === 0) {
      if (!(yield* _(syncLock.acquire))) return;
      syncWorkerOnMessage({ _tag: "SyncStateIsSyncing" });
    }

    yield* _(
      Effect.forEach(input.messages, ({ timestamp, ...newMessage }) =>
        secretBox
          .seal(input.owner.encryptionKey, newMessageToBinary(newMessage))
          .pipe(
            Effect.map((content): EncryptedMessage => ({ timestamp, content })),
          ),
      ),
      Effect.map((messages) =>
        SyncRequest.toBinary(
          {
            messages,
            userId: input.owner.id,
            nodeId: input.timestamp.node,
            merkleTree: merkleTreeToString(input.merkleTree),
          },
          binaryWriteOptions,
        ),
      ),
      Effect.flatMap((body) => fetch(input.syncUrl, body)),
      Effect.catchTag("FetchError", () =>
        Effect.fail<SyncStateIsNotSyncedError>({
          _tag: "SyncStateIsNotSyncedError",
          error: { _tag: "NetworkError" },
        }),
      ),
      Effect.flatMap((response) => {
        switch (response.status) {
          case 402:
            return Effect.fail<SyncStateIsNotSyncedError>({
              _tag: "SyncStateIsNotSyncedError",
              error: { _tag: "PaymentRequiredError" },
            });
          case 200:
            return Effect.promise(() =>
              response
                .arrayBuffer()
                .then((buffer) => new Uint8Array(buffer))
                .then((array) =>
                  SyncResponse.fromBinary(array, binaryReadOptions),
                ),
            );
          default:
            return Effect.fail<SyncStateIsNotSyncedError>({
              _tag: "SyncStateIsNotSyncedError",
              error: { _tag: "ServerError", status: response.status },
            });
        }
      }),
      Effect.flatMap((syncResponse) =>
        Effect.forEach(syncResponse.messages, ({ timestamp, content }) =>
          secretBox
            .open(input.owner.encryptionKey, content)
            .pipe(
              Effect.map(newMessageFromBinary),
              Effect.map(
                Option.map(
                  (newMessage): Message => ({ timestamp, ...newMessage }),
                ),
              ),
            ),
        ).pipe(
          Effect.map(
            (messages): SyncWorkerOutputSyncResponse => ({
              _tag: "SyncWorkerOutputSyncResponse",
              messages: ReadonlyArray.filterMap(messages, identity),
              merkleTree: unsafeMerkleTreeFromString(syncResponse.merkleTree),
              syncLoopCount: input.syncLoopCount,
            }),
          ),
        ),
      ),
      Effect.tapError(() => syncLock.release),
      Effect.merge,
      Effect.map(syncWorkerOnMessage),
    );
  });

export const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.gen(function* (_) {
    const syncLock = yield* _(SyncLock);
    const fetch = yield* _(Fetch);
    const secretBox = yield* _(SecretBox);

    const onError = (
      error: UnexpectedError,
    ): Effect.Effect<never, never, void> =>
      Effect.sync(() => {
        syncWorker.onMessage(error);
      });

    const mapInputToEffect = (
      input: SyncWorkerInput,
    ): Effect.Effect<
      SyncLock | SyncWorkerOnMessage | Fetch | SecretBox,
      never,
      void
    > => {
      switch (input._tag) {
        case "sync":
          return sync(input);
        case "syncCompleted":
          return syncLock.release;
      }
    };

    const postMessage: SyncWorker["postMessage"] = (input) => {
      void mapInputToEffect(input).pipe(
        Effect.catchAllDefect(makeUnexpectedError),
        Effect.catchAll(onError),
        Effect.provideService(SyncLock, syncLock),
        Effect.provideService(Fetch, fetch),
        Effect.provideService(SecretBox, secretBox),
        Effect.provideService(SyncWorkerOnMessage, syncWorker.onMessage),
        Effect.runPromise,
      );
    };

    const syncWorker: SyncWorker = {
      postMessage,
      onMessage: Function.constVoid,
    };

    return syncWorker;
  }),
);
