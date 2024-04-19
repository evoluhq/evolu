import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { Config } from "./Config.js";
import { Millis } from "./Crdt.js";

export class SyncWorker extends Context.Tag("SyncWorker")<
  SyncWorker,
  {
    readonly sync: () => Effect.Effect<void>;
    readonly dispose: () => Effect.Effect<void>;
  }
>() {}

export interface SyncWorkerService
  extends Context.Tag.Service<typeof SyncWorker> {}

export class SyncWorkerFactory extends Context.Tag("SyncWorkerFactory")<
  SyncWorkerFactory,
  {
    readonly createSyncWorker: Effect.Effect<SyncWorkerService, never, Config>;
  }
>() {}

export const createSyncWorker: Effect.Effect<SyncWorkerService, never, never> =
  Effect.gen(function* (_) {
    yield* _(Effect.void);

    return SyncWorker.of({
      sync: () => Effect.void,
      dispose: () => Effect.void,
    });
  });

/**
 * The SyncState type represents the various states that a synchronization
 * process can be in.
 */
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

// import * as S from "@effect/schema/Schema";
// import { concatBytes } from "@noble/ciphers/utils";
// import { BinaryReader, BinaryWriter } from "@protobuf-ts/runtime";
// import * as Arr from "effect/Array";
// import * as Context from "effect/Context";
// import * as Effect from "effect/Effect";
// import { absurd, constVoid, identity } from "effect/Function";
// import * as Layer from "effect/Layer";
// import * as Match from "effect/Match";
// import * as Option from "effect/Option";
// import * as Predicate from "effect/Predicate";
// import {
//   MerkleTree,
//   Millis,
//   Timestamp,
//   TimestampString,
//   merkleTreeToString,
//   unsafeMerkleTreeFromString,
// } from "./Crdt.js";
// import { SecretBox } from "./Crypto.js";
// import { UnexpectedError, makeUnexpectedError } from "./ErrorStore.js";
// import { Id } from "./Model.js";
// import { Owner } from "./Owner.js";
// import { Fetch, SyncLock } from "./Platform.js";
// import {
//   EncryptedMessage,
//   MessageContent,
//   SyncRequest,
//   SyncResponse,
// } from "./Protobuf.js";
// import { JsonObjectOrArray, Value } from "./Sqlite.js";
// import { Messaging } from "./Types.js";

// export interface SyncWorker
//   extends Messaging<SyncWorkerInput, SyncWorkerOutput> {}
// export const SyncWorker = Context.GenericTag<SyncWorker>(
//   "@services/SyncWorker",
// );

// export type SyncWorkerPostMessage = SyncWorker["postMessage"];

// export const SyncWorkerPostMessage = Context.GenericTag<SyncWorkerPostMessage>(
//   "@services/SyncWorkerPostMessage",
// );

// export type SyncWorkerInput =
//   | SyncWorkerInputSync
//   | SyncWorkerInputSyncCompleted;

// interface SyncWorkerInputSync {
//   readonly _tag: "sync";
//   readonly syncUrl: string;
//   readonly messages: ReadonlyArray<Message>;
//   readonly merkleTree: MerkleTree;
//   readonly timestamp: Timestamp;
//   readonly owner: Owner;
//   readonly syncLoopCount: number;
// }

// interface SyncWorkerInputSyncCompleted {
//   readonly _tag: "syncCompleted";
// }

// type SyncWorkerOnMessage = SyncWorker["onMessage"];

// const SyncWorkerOnMessage = Context.GenericTag<SyncWorkerOnMessage>(
//   "@services/SyncWorkerOnMessage",
// );

// export type SyncWorkerOutput =
//   | UnexpectedError
//   | SyncWorkerOutputSyncResponse
//   | SyncStateIsNotSyncedError
//   | SyncStateIsSyncing;

// export type SyncWorkerOutputSyncResponse = {
//   readonly _tag: "SyncWorkerOutputSyncResponse";
//   readonly messages: ReadonlyArray<Message>;
//   readonly merkleTree: MerkleTree;
//   readonly syncLoopCount: number;
// };

// const version1 = new Uint8Array([0, 1]);

// const valueToProtobuf = (value: Value): MessageContent["value"] => {
//   switch (typeof value) {
//     case "string":
//       return { oneofKind: "stringValue", stringValue: value };
//     case "number":
//       return {
//         oneofKind: "numberValue",
//         numberValue: S.encodeSync(S.NumberFromString)(value),
//       };
//   }
//   if (value == null) return { oneofKind: undefined };
//   if (Predicate.isUint8Array(value))
//     return { oneofKind: "bytesValue", bytesValue: value };
//   return { oneofKind: "jsonValue", jsonValue: JSON.stringify(value) };
// };

// const valueFromProtobuf = (value: MessageContent["value"]): Value => {
//   switch (value.oneofKind) {
//     case "numberValue":
//       return S.decodeSync(S.NumberFromString)(value.numberValue);
//     case "stringValue":
//       return value.stringValue;
//     case "bytesValue":
//       return value.bytesValue;
//     case "jsonValue":
//       return JSON.parse(value.jsonValue) as JsonObjectOrArray;
//     case undefined:
//       return null;
//     default:
//       return absurd(value);
//   }
// };

// const newMessageToBinary = ({ value, ...rest }: NewMessage): Uint8Array =>
//   concatBytes(
//     version1,
//     MessageContent.toBinary(
//       { value: valueToProtobuf(value), ...rest },
//       binaryWriteOptions,
//     ),
//   );

// const startsWithArray = (array: Uint8Array, prefix: Uint8Array): boolean => {
//   if (prefix.length > array.length) return false;
//   for (let i = 0; i < prefix.length; i++) {
//     if (array[i] !== prefix[i]) return false;
//   }
//   return true;
// };

// const newMessageFromBinary = (
//   binary: Uint8Array,
// ): Option.Option<NewMessage> => {
//   if (!startsWithArray(binary, version1)) return Option.none();
//   const { value, ...content } = MessageContent.fromBinary(
//     binary.slice(version1.length),
//     binaryReadOptions,
//   );
//   return Option.some({ value: valueFromProtobuf(value), ...content });
// };

// // The 'protobuf-ts' uses TextEncoder, but polyfill fast-text-encoding
// // doesn't support the fatal option.
// // https://github.com/timostamm/protobuf-ts/issues/184#issuecomment-1658443836
// const binaryWriteOptions = {
//   writerFactory: (): BinaryWriter =>
//     new BinaryWriter({
//       encode: (input: string): Uint8Array => new TextEncoder().encode(input),
//     }),
// };
// const binaryReadOptions = {
//   readerFactory: (bytes: Uint8Array): BinaryReader =>
//     new BinaryReader(bytes, {
//       decode: (input: Uint8Array): string => new TextDecoder().decode(input),
//     }),
// };

// const sync = (
//   input: SyncWorkerInputSync,
// ): Effect.Effect<
//   void,
//   never,
//   SyncLock | SyncWorkerOnMessage | Fetch | SecretBox
// > =>
//   Effect.gen(function* (_) {
//     const syncLock = yield* _(SyncLock);
//     const syncWorkerOnMessage = yield* _(SyncWorkerOnMessage);
//     const fetch = yield* _(Fetch);
//     const secretBox = yield* _(SecretBox);

//     if (input.syncLoopCount === 0) {
//       if (!(yield* _(syncLock.acquire))) return;
//       syncWorkerOnMessage({ _tag: "SyncStateIsSyncing" });
//     }

//     yield* _(
//       Effect.forEach(input.messages, ({ timestamp, ...newMessage }) =>
//         secretBox
//           .seal(input.owner.encryptionKey, newMessageToBinary(newMessage))
//           .pipe(
//             Effect.map((content): EncryptedMessage => ({ timestamp, content })),
//           ),
//       ),
//       Effect.map((messages) =>
//         SyncRequest.toBinary(
//           {
//             messages,
//             userId: input.owner.id,
//             nodeId: input.timestamp.node,
//             merkleTree: merkleTreeToString(input.merkleTree),
//           },
//           binaryWriteOptions,
//         ),
//       ),
//       Effect.flatMap((body) => fetch(input.syncUrl, body)),
//       Effect.catchTag("FetchError", () =>
//         Effect.fail<SyncStateIsNotSyncedError>({
//           _tag: "SyncStateIsNotSyncedError",
//           error: { _tag: "NetworkError" },
//         }),
//       ),
//       Effect.flatMap((response) => {
//         switch (response.status) {
//           case 402:
//             return Effect.fail<SyncStateIsNotSyncedError>({
//               _tag: "SyncStateIsNotSyncedError",
//               error: { _tag: "PaymentRequiredError" },
//             });
//           case 200:
//             return Effect.promise(() =>
//               response
//                 .arrayBuffer()
//                 .then((buffer) => new Uint8Array(buffer))
//                 .then((array) =>
//                   SyncResponse.fromBinary(array, binaryReadOptions),
//                 ),
//             );
//           default:
//             return Effect.fail<SyncStateIsNotSyncedError>({
//               _tag: "SyncStateIsNotSyncedError",
//               error: { _tag: "ServerError", status: response.status },
//             });
//         }
//       }),
//       Effect.flatMap((syncResponse) =>
//         Effect.forEach(syncResponse.messages, ({ timestamp, content }) =>
//           secretBox
//             .open(input.owner.encryptionKey, content)
//             .pipe(
//               Effect.map(newMessageFromBinary),
//               Effect.map(
//                 Option.map(
//                   (newMessage): Message => ({ timestamp, ...newMessage }),
//                 ),
//               ),
//             ),
//         ).pipe(
//           Effect.map(
//             (messages): SyncWorkerOutputSyncResponse => ({
//               _tag: "SyncWorkerOutputSyncResponse",
//               messages: Array.filterMap(messages, identity),
//               merkleTree: unsafeMerkleTreeFromString(syncResponse.merkleTree),
//               syncLoopCount: input.syncLoopCount,
//             }),
//           ),
//         ),
//       ),
//       Effect.tapError(() => syncLock.release),
//       Effect.merge,
//       Effect.map(syncWorkerOnMessage),
//     );
//   });

// export const SyncWorkerCommonLive = Layer.effect(
//   SyncWorker,
//   Effect.gen(function* (_) {
//     const syncLock = yield* _(SyncLock);

//     const onError = (error: UnexpectedError): Effect.Effect<void> =>
//       Effect.sync(() => {
//         syncWorker.onMessage(error);
//       });

//     const context = Context.empty().pipe(
//       Context.add(SyncLock, syncLock),
//       Context.add(Fetch, yield* _(Fetch)),
//       Context.add(SecretBox, yield* _(SecretBox)),
//     );

//     const syncWorker: SyncWorker = {
//       postMessage: (input) => {
//         Match.value(input).pipe(
//           Match.tagsExhaustive({
//             sync,
//             syncCompleted: () => syncLock.release,
//           }),
//           Effect.catchAllDefect(makeUnexpectedError),
//           Effect.catchAll(onError),
//           Effect.provide(context),
//           Effect.provideService(SyncWorkerOnMessage, syncWorker.onMessage),
//           Effect.runPromise,
//         );
//       },
//       onMessage: constVoid,
//     };

//     return syncWorker;
//   }),
// );
