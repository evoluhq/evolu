/**
 * TypeScript library and local-first platform.
 *
 * @module
 */

import { ensurePolyfills } from "./Polyfills.js";

ensurePolyfills();

export * from "./Array.js";
export * from "./Assert.js";
export * from "./BigInt.js";
export * from "./Brand.js";
export * from "./Buffer.js";
export * from "./Cache.js";
export * from "./Callbacks.js";
export * from "./Console.js";
export * from "./Crypto.js";
export * from "./Eq.js";
export * from "./Error.js";
export * from "./Function.js";
export * from "./Identicon.js";
export * from "./Instances.js";
export * from "./Listeners.js";
export * from "./Number.js";
export * from "./Object.js";
export * from "./OldTask.js";
export * from "./Order.js";
export * from "./Platform.js";
export * from "./Random.js";
export * from "./Redacted.js";
export * from "./Ref.js";
export * from "./Relation.js";
export * from "./Resources.js";
export * from "./Result.js";
export * from "./Set.js";
export * from "./Sqlite.js";
export * from "./Store.js";
export * from "./String.js";
export * from "./Task.js";
export * from "./Test.js";
export * from "./Time.js";
export * from "./Tracer.js";
export * from "./Type.js";
export * from "./Types.js";
export * from "./WebSocket.js";
export * from "./Worker.js";

// Local-first essentials.
export type { EvoluError } from "./local-first/Error.js";
export { createEvolu } from "./local-first/Evolu.js";
export type {
  Evolu,
  EvoluConfig,
  EvoluDeps,
  UnuseOwner,
} from "./local-first/Evolu.js";
export * as kysely from "./local-first/Kysely.js";
export * from "./local-first/LocalAuth.js";
export * from "./local-first/Owner.js";
export type { InferRow, Query, QueryRows, Row } from "./local-first/Query.js";
export type { EvoluSchema } from "./local-first/Schema.js";
export type {
  NetworkError,
  PaymentRequiredError,
  ServerError,
  SyncOwner,
  SyncState,
  SyncStateInitial,
  SyncStateIsNotSynced,
  SyncStateIsSynced,
  SyncStateIsSyncing,
} from "./local-first/Sync.js";
export {
  Timestamp,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "./local-first/Timestamp.js";
export type {
  TimestampBytes,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampError,
  TimestampTimeOutOfRangeError,
} from "./local-first/Timestamp.js";
