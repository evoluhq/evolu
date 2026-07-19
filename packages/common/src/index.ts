/**
 * TypeScript library and local-first platform.
 *
 * @module
 */

export * from "./Array.ts";
export * from "./Assert.ts";
export * from "./BigInt.ts";
export * from "./Brand.ts";
export * from "./Buffer.ts";
export * from "./Cache.ts";
export * from "./Callbacks.ts";
export * from "./Console.ts";
export * from "./Crypto.ts";
export * from "./Eq.ts";
export * from "./Error.ts";
export * from "./Function.ts";
export * from "./Http.ts";
export * from "./Identicon.ts";
export * from "./LeakDetector.ts";
export * from "./LockManager.ts";
export * from "./Lookup.ts";
export * from "./Microtask.ts";
export * from "./Number.ts";
export * from "./Object.ts";
export * from "./Option.ts";
export * from "./Order.ts";
export * from "./Platform.ts";
export * from "./Random.ts";
export * from "./Redacted.ts";
export * from "./Ref.ts";
export * from "./RefCount.ts";
export * from "./Relation.ts";
export * from "./Resource.ts";
export * from "./Result.ts";
export * from "./Schedule.ts";
export * from "./Set.ts";
export * from "./Sqlite.ts";
export * from "./Store.ts";
export * from "./String.ts";
export * from "./Task.ts";
export * from "./Test.ts";
export * from "./Time.ts";
export * from "./Tracer.ts";
export * from "./Type.ts";
export * from "./Types.ts";
export * from "./WebSocket.ts";
export * from "./Worker.ts";

// Local-first essentials.
export type { EvoluError } from "./local-first/Error.ts";
export { AppName, createEvolu } from "./local-first/Evolu.ts";
export type {
  AppNameError,
  Evolu,
  EvoluConfig,
  EvoluDeps,
  UnuseOwner,
} from "./local-first/Evolu.ts";
export * from "./local-first/LocalAuth.ts";
export * from "./local-first/Owner.ts";
export type { SyncOwner } from "./local-first/Owner.ts";
export {
  evoluJsonArrayFrom,
  evoluJsonBuildObject,
  evoluJsonObjectFrom,
  getJsonObjectArgs,
  kyselySql,
  type InferRow,
  type KyselyNotNull,
  type Query,
  type QueryRows,
  type Row,
} from "./local-first/Query.ts";
export { createQueryBuilder } from "./local-first/Schema.ts";
export type {
  AnyStandardSchemaV1,
  EvoluSchema,
  InsertValues,
  Mutation,
  MutationKind,
  MutationOptions,
  MutationValues,
  NullableColumnsToOptional,
  OptionalColumnKeys,
  RequiredColumnKeys,
  TableSchema,
  UpdateValues,
  UpsertValues,
} from "./local-first/Schema.ts";
export type {
  // NetworkError,
  // PaymentRequiredError,
  // ServerError,
  SyncState,
} from "./local-first/Shared.ts";
export {
  Timestamp,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "./local-first/Timestamp.ts";
export type {
  TimestampBytes,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampError,
  TimestampTimeOutOfRangeError,
} from "./local-first/Timestamp.ts";
