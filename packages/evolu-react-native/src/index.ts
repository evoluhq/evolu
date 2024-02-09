import {
  Bip39,
  DbWorkerLive,
  EvoluCommonLive,
  FetchLive,
  InvalidMnemonicError,
  Mnemonic,
  NanoIdLive,
  SecretBoxLive,
  SyncWorkerLive,
  makeCreateEvolu,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AppStateLive,
  Bip39Live,
  FlushSyncLive,
  SyncLockLive,
} from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";

// export * from "@evolu/common/public"
// https://github.com/facebook/metro/issues/1128
// So we have to export manually.
// TODO: Recheck after RN 0.73 release.
export {
  Id,
  NonEmptyString1000,
  PositiveInt,
  SqliteBoolean,
  SqliteDate,
  String,
  String1000,
  canUseDom,
  cast,
  database,
  id,
  table,
} from "@evolu/common";
export type {
  EvoluError,
  ExtractRow,
  InvalidMnemonicError,
  Mnemonic,
  NotNull,
  Owner,
  OwnerId,
  QueryResult,
  SyncState,
  Timestamp,
  TimestampError,
  UnexpectedError,
} from "@evolu/common";
export { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";

export * from "@evolu/common-react";

/** Evolu for native platform. */
const EvoluNativeLive = EvoluCommonLive.pipe(
  Layer.provide(Layer.mergeAll(FlushSyncLive, AppStateLive, DbWorkerLive)),
  Layer.provide(
    Layer.mergeAll(Bip39Live, NanoIdLive, SqliteLive, SyncWorkerLive),
  ),
  Layer.provide(Layer.mergeAll(SecretBoxLive, SyncLockLive, FetchLive)),
);

/**
 * Create Evolu for React Native.
 *
 * Tables with a name prefixed with `_` are local-only, which means they are
 * never synced. It's useful for device-specific or temporal data.
 *
 * @example
 *   import * as S from "@effect/schema/Schema";
 *   import {
 *     NonEmptyString1000,
 *     createEvolu,
 *     id,
 *   } from "@evolu/react-native";
 *
 *   const TodoId = id("Todo");
 *   type TodoId = S.Schema.To<typeof TodoId>;
 *
 *   const TodoTable = S.struct({
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *   });
 *   type TodoTable = S.Schema.To<typeof TodoTable>;
 *
 *   const Database = S.struct({
 *     // _todo is local-only table
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.To<typeof Database>;
 *
 *   const evolu = createEvolu(Database);
 */
export const createEvolu = makeCreateEvolu(EvoluNativeLive);

/** Parse a string to {@link Mnemonic}. */
export const parseMnemonic: (
  mnemonic: string,
) => Effect.Effect<Mnemonic, InvalidMnemonicError> = Bip39.pipe(
  Effect.provide(Bip39Live),
  Effect.runSync,
).parse;
