// The local-first prelude of the package root. ../index.ts star-exports this
// module, so TypeScript reports a name that clashes with another root
// module (TS2308). An explicit re-export in index.ts would silently shadow it.
export { createDeviceSecret, DeviceSecret, DeviceSecretKeyId } from "./Auth.ts";
export type {
  DeviceSecretAuth,
  DeviceSecretError,
  DeviceSecretKeyError,
  DeviceSecretKeyProvider,
  DeviceSecretKeyRefusedError,
  DeviceSecretKeyUnavailableError,
  DeviceSecretUnwrapError,
  EvoluAppAuth,
  InstantStartAuth,
  WrappedDeviceSecretNotPersistedError,
  WrappedDeviceSecretStoredError,
} from "./Auth.ts";
export type { DatabaseHeldError, UnsupportedDbVersionError } from "./Db.ts";
export {
  AppName,
  createEvolu,
  createEvoluApp,
  forgetWrappedDeviceSecret,
  hasWrappedDeviceSecret,
  unlockWrappedDeviceSecret,
  maxMutationSize,
  subscribeAppOwnerState,
  testAppName,
} from "./Evolu.ts";
export type {
  AppNameError,
  AppOwnerEntry,
  AppOwnerEvolu,
  AppOwnerState,
  CurrentAppOwner,
  DeleteDatabaseError,
  DeleteOwnerError,
  DeviceEvolu,
  DeviceMutation,
  EmptyEvoluSchema,
  Evolu,
  EvoluApp,
  EvoluAppConfig,
  EvoluAppDeviceConfig,
  EvoluConfig,
  EvoluDeps,
  EvoluDisposedError,
  EvoluError,
  LoadQueryOptions,
  NoAppOwnerState,
  OpenAppOwnerState,
  OpeningAppOwnerState,
  RemoveAppOwnerError,
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
