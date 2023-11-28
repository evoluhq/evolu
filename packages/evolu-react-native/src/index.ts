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
import { EvoluReactLive, makeCreateEvoluReact } from "@evolu/common-react";
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
  canUseDom,
  cast,
  id,
  Id,
  NonEmptyString1000,
  PositiveInt,
  SqliteBoolean,
  SqliteDate,
  String,
  String1000,
} from "@evolu/common";
export type {
  EvoluError,
  InvalidMnemonicError,
  Mnemonic,
  Owner,
  OwnerId,
  SyncState,
  Timestamp,
  TimestampError,
  UnexpectedError,
} from "@evolu/common";
export { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";

/** Evolu for native platform. */
const EvoluNativeLive: Layer.Layer<
  Config,
  never,
  Evolu<Schema>
> = EvoluCommonLive.pipe(
  Layer.use(Layer.mergeAll(FlushSyncLive, AppStateLive, DbWorkerLive)),
  Layer.use(Layer.mergeAll(Bip39Live, NanoIdLive, SqliteLive, SyncWorkerLive)),
  Layer.use(Layer.mergeAll(SecretBoxLive, SyncLockLive, FetchLive)),
);

/**
 * Create Evolu for React Native.
 *
 * ### Example
 *
 * ```ts
 * import * as S from "@effect/schema/Schema";
 * import * as Evolu from "@evolu/react-native";
 *
 * const TodoId = Evolu.id("Todo");
 * type TodoId = S.Schema.To<typeof TodoId>;
 *
 * const TodoTable = S.struct({
 *   id: TodoId,
 *   title: Evolu.NonEmptyString1000,
 * });
 * type TodoTable = S.Schema.To<typeof TodoTable>;
 *
 * const Database = S.struct({
 *   todo: TodoTable,
 * });
 *
 * const { useEvolu, useEvoluError, useQuery, useOwner } =
 *   Evolu.create(Database);
 * ```
 */
export const create = EvoluReactLive.pipe(
  Layer.use(EvoluNativeLive),
  makeCreateEvoluReact,
);
