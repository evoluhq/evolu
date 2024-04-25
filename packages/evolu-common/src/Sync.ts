import * as Http from "@effect/platform/HttpClient";
import * as S from "@effect/schema/Schema";
import { concatBytes } from "@noble/ciphers/utils";
import { BinaryReader, BinaryWriter } from "@protobuf-ts/runtime";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Scope from "effect/Scope";
import { Config } from "./Config.js";
import {
  MerkleTree,
  Millis,
  Timestamp,
  TimestampString,
  merkleTreeToString,
  unsafeMerkleTreeFromString,
} from "./Crdt.js";
import { SecretBox } from "./Crypto.js";
import { Id } from "./Model.js";
import { Owner } from "./Owner.js";
import * as Protobuf from "./Protobuf.js";
import { JsonObjectOrArray, Value } from "./Sqlite.js";

export interface Sync {
  readonly init: (owner: Owner) => Effect.Effect<void>;
  readonly sync: (
    syncData: SyncData,
  ) => Effect.Effect<SyncResult, SyncStateIsNotSynced, Config>;
}

export const Sync = Context.GenericTag<Sync>("Sync");

export interface SyncData {
  merkleTree: MerkleTree;
  timestamp: Timestamp;
  messages?: ReadonlyArray<Message>;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface SyncResult {
  readonly messages: ReadonlyArray<Message>;
  readonly merkleTree: MerkleTree;
}

/**
 * The SyncState type represents the various states that a synchronization
 * process can be in.
 */
export type SyncState =
  | SyncStateInitial
  | SyncStateIsSyncing
  | SyncStateIsSynced
  | SyncStateIsNotSynced;

/** On app start, we need to find out whether the state is synced. */
export interface SyncStateInitial {
  readonly _tag: "SyncStateInitial";
}

// To preserve identity.
export const initialSyncState: SyncStateInitial = { _tag: "SyncStateInitial" };

export interface SyncStateIsSyncing {
  readonly _tag: "SyncStateIsSyncing";
}

export interface SyncStateIsSynced {
  readonly _tag: "SyncStateIsSynced";
  readonly time: Millis;
}

export interface SyncStateIsNotSynced {
  readonly _tag: "SyncStateIsNotSynced";
  readonly error: NetworkError | ServerError | PaymentRequiredError;
}

export interface NetworkError {
  readonly _tag: "NetworkError";
}

export interface ServerError {
  readonly _tag: "ServerError";
  readonly status: number;
}

export interface PaymentRequiredError {
  readonly _tag: "PaymentRequiredError";
}

export class SyncFactory extends Context.Tag("SyncFactory")<
  SyncFactory,
  {
    readonly createSync: Effect.Effect<Sync, never, Scope.Scope>;
  }
>() {}

export const createSync = Effect.gen(function* (_) {
  const initContext = Context.empty().pipe(
    Context.add(SecretBox, yield* _(SecretBox)),
  );

  const afterInitContext = yield* _(
    Deferred.make<Context.Context<SecretBox | Owner>>(),
  );

  return Sync.of({
    init: (owner) =>
      Effect.logDebug(["Sync init", { owner }]).pipe(
        Effect.tap(
          Deferred.succeed(
            afterInitContext,
            initContext.pipe(Context.add(Owner, owner)),
          ),
        ),
      ),
    sync: ({ merkleTree, timestamp, messages }) =>
      Effect.gen(function* (_) {
        yield* _(
          Effect.logDebug([
            "Sync request",
            { merkleTree, timestamp, messages },
          ]),
        );
        const secretBox = yield* _(SecretBox);
        const owner = yield* _(Owner);
        const config = yield* _(Config);

        return yield* _(
          Effect.forEach(messages || [], ({ timestamp, ...newMessage }) =>
            Effect.map(
              secretBox.seal(
                owner.encryptionKey,
                newMessageToBinary(newMessage),
              ),
              (content): Protobuf.EncryptedMessage => ({ timestamp, content }),
            ),
          ),
          Effect.map((encrypedMessages) =>
            Protobuf.SyncRequest.toBinary(
              {
                messages: encrypedMessages,
                userId: owner.id,
                nodeId: timestamp.node,
                merkleTree: merkleTreeToString(merkleTree),
              },
              binaryWriteOptions,
            ),
          ),
          Effect.flatMap((body) =>
            Http.request
              .post(config.syncUrl)
              .pipe(
                Http.request.uint8ArrayBody(body, "application/x-protobuf"),
                Http.client.fetchOk,
                Http.response.arrayBuffer,
              ),
          ),
          Effect.map((buffer) =>
            Protobuf.SyncResponse.fromBinary(
              new Uint8Array(buffer),
              binaryReadOptions,
            ),
          ),
          Effect.flatMap((syncResponse) =>
            Effect.forEach(syncResponse.messages, (encrypedMessage) =>
              Effect.map(
                secretBox.open(owner.encryptionKey, encrypedMessage.content),
                (binary) => [binary, encrypedMessage.timestamp] as const,
              ),
            ).pipe(
              Effect.map(
                Arr.filterMap(([binary, timestamp]) =>
                  Option.map(
                    newMessageFromBinary(binary),
                    (newMessage): Message => ({ ...newMessage, timestamp }),
                  ),
                ),
              ),
              Effect.map((messages) => ({
                messages,
                merkleTree: unsafeMerkleTreeFromString(syncResponse.merkleTree),
              })),
              Effect.tap((response) =>
                Effect.logDebug(["Sync response", response]),
              ),
            ),
          ),
          Effect.catchTag("RequestError", () =>
            Effect.fail<SyncStateIsNotSynced>({
              _tag: "SyncStateIsNotSynced",
              error: { _tag: "NetworkError" },
            }),
          ),
          Effect.catchTag("ResponseError", ({ response: { status } }) => {
            switch (status) {
              case 402:
                return Effect.fail<SyncStateIsNotSynced>({
                  _tag: "SyncStateIsNotSynced",
                  error: { _tag: "PaymentRequiredError" },
                });
              default:
                return Effect.fail<SyncStateIsNotSynced>({
                  _tag: "SyncStateIsNotSynced",
                  error: { _tag: "ServerError", status },
                });
            }
          }),
        );
      }).pipe((effect) =>
        Effect.flatMap(Deferred.await(afterInitContext), (context) =>
          Effect.provide(effect, context),
        ),
      ),
  });
});

const newMessageToBinary = ({ value, ...rest }: NewMessage): Uint8Array =>
  concatBytes(
    version1,
    Protobuf.MessageContent.toBinary(
      { value: valueToProtobuf(value), ...rest },
      binaryWriteOptions,
    ),
  );

const version1 = new Uint8Array([0, 1]);

const valueToProtobuf = (value: Value): Protobuf.MessageContent["value"] => {
  switch (typeof value) {
    case "string":
      return { oneofKind: "stringValue", stringValue: value };
    case "number":
      return {
        oneofKind: "numberValue",
        numberValue: S.encodeSync(S.NumberFromString)(value),
      };
  }
  if (value == null) return { oneofKind: undefined };
  if (Predicate.isUint8Array(value))
    return { oneofKind: "bytesValue", bytesValue: value };
  return { oneofKind: "jsonValue", jsonValue: JSON.stringify(value) };
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

const newMessageFromBinary = (
  binary: Uint8Array,
): Option.Option<NewMessage> => {
  if (!startsWithArray(binary, version1)) return Option.none();
  const { value, ...content } = Protobuf.MessageContent.fromBinary(
    binary.slice(version1.length),
    binaryReadOptions,
  );
  return Option.some({ value: valueFromProtobuf(value), ...content });
};

const startsWithArray = (array: Uint8Array, prefix: Uint8Array): boolean => {
  if (prefix.length > array.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (array[i] !== prefix[i]) return false;
  }
  return true;
};

const valueFromProtobuf = (value: Protobuf.MessageContent["value"]): Value => {
  switch (value.oneofKind) {
    case "numberValue":
      return S.decodeSync(S.NumberFromString)(value.numberValue);
    case "stringValue":
      return value.stringValue;
    case "bytesValue":
      return value.bytesValue;
    case "jsonValue":
      return JSON.parse(value.jsonValue) as JsonObjectOrArray;
    case undefined:
      return null;
    default:
      return Function.absurd(value);
  }
};
