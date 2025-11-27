/**
 * Public local-first API exported from "@evolu/common"
 *
 * This module provides the supported consumer-facing API for Evolu's
 * local-first system: prefer importing from `@evolu/common` (this module) when
 * using Evolu in applications. If you require access to lower level internals,
 * consider importing from `@evolu/common/local-first`.
 *
 * @module
 */

export { createEvolu } from "./Evolu.js";
export type { Evolu, EvoluConfig, EvoluDeps, EvoluError } from "./Evolu.js";
export type { UnuseOwner } from "./Evolu.js";
export * from "./LocalAuth.js";
export * from "./Owner.js";
export * as kysely from "./PublicKysely.js";
export type { InferRow, Query, QueryRows, Row } from "./Query.js";
export type { EvoluSchema } from "./Schema.js";
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
} from "./Sync.js";
export {
  Timestamp,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "./Timestamp.js";
export type {
  TimestampBytes,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampError,
  TimestampTimeOutOfRangeError,
} from "./Timestamp.js";
