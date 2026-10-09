// The local-first prelude of the package root. ../index.ts star-exports this
// module, so TypeScript reports a name that clashes with another root
// module (TS2308). An explicit re-export in index.ts would silently shadow it.
// StandardSchemaV1 is here because schema columns are Standard Schema
// validators.
export type { StandardSchemaV1 } from "@standard-schema/spec";
export type { DatabaseHeldError, UnsupportedDbVersionError } from "./Db.ts";
export { AppName, createEvolu, maxMutationSize, testAppName } from "./Evolu.ts";
export type {
  AppNameError,
  Evolu,
  EvoluConfig,
  EvoluDeps,
  EvoluError,
  UnuseOwner,
} from "./Evolu.ts";
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
} from "./Query.ts";
export {
  createQueryBuilder,
  QuarantineOrigin,
  QuarantineReason,
  testEvoluSchema,
  testLocalOnlyEvoluSchema,
  TestProjectId,
  testProjectId,
  TestTodoId,
  testTodoId,
} from "./Schema.ts";
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
  TestEvoluSchema,
  UpdateValues,
  UpsertValues,
} from "./Schema.ts";
export type { SyncState } from "./Shared.ts";
export {
  Timestamp,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "./Timestamp.ts";
export type {
  TimestampBytes,
  TimestampDriftError,
  TimestampError,
} from "./Timestamp.ts";
