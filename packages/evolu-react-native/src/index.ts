import {
  Config,
  DbWorkerLive,
  Evolu,
  EvoluCommonLive,
  FetchLive,
  NanoIdLive,
  Schema,
  SecretBoxLive,
  SyncWorkerLive,
} from "@evolu/common";
import { EvoluCommonReactLive, makeCreate } from "@evolu/common-react";
import { Layer } from "effect";
import {
  AppStateLive,
  Bip39Live,
  FlushSyncLive,
  SyncLockLive,
} from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";

// export * from "@evolu/common/public" isn't working in RN for some reason,
// so we have to export manually.
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
  id,
} from "@evolu/common";
export type {
  EvoluError,
  Mnemonic,
  Owner,
  OwnerId,
  Timestamp,
  TimestampError,
  UnexpectedError,
  SyncState,
} from "@evolu/common";
export { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";

const EvoluCommonNativeLive: Layer.Layer<
  Config,
  never,
  Evolu<Schema>
> = EvoluCommonLive.pipe(
  Layer.use(EvoluCommonLive),
  Layer.use(Layer.mergeAll(FlushSyncLive, AppStateLive, DbWorkerLive)),
  Layer.use(Layer.mergeAll(Bip39Live, NanoIdLive, SqliteLive, SyncWorkerLive)),
  Layer.use(Layer.mergeAll(SecretBoxLive, SyncLockLive, FetchLive)),
);

/**
 * Create Evolu for React Native from database schema.
 *
 * @example
 *   import * as S from "@effect/schema/Schema";
 *   import * as Evolu from "@evolu/react-native";
 *
 *   const TodoId = Evolu.id("Todo");
 *   type TodoId = S.Schema.To<typeof TodoId>;
 *
 *   const TodoTable = S.struct({
 *     id: TodoId,
 *     title: Evolu.NonEmptyString1000,
 *   });
 *   type TodoTable = S.Schema.To<typeof TodoTable>;
 *
 *   const Database = S.struct({
 *     todo: TodoTable,
 *   });
 *
 *   export const {
 *     evolu,
 *     useEvoluError,
 *     createQuery,
 *     useQuery,
 *     useCreate,
 *     useUpdate,
 *     useOwner,
 *     useEvolu,
 *   } = Evolu.create(Database);
 */
export const create = EvoluCommonReactLive.pipe(
  Layer.use(EvoluCommonNativeLive),
  makeCreate,
);
