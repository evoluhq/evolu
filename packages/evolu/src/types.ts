import { Brand } from "@effect/data/Brand";
import * as S from "@effect/schema";
import { Schema } from "@effect/schema";
import { eq } from "fp-ts";
import { Either } from "fp-ts/Either";
import { IO } from "fp-ts/IO";
import { IORef } from "fp-ts/IORef";
import { pipe } from "fp-ts/lib/function.js";
import { Option } from "fp-ts/Option";
import { Reader } from "fp-ts/Reader";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { TaskEither } from "fp-ts/TaskEither";
import { Kysely, SelectQueryBuilder } from "kysely";
import { customAlphabet } from "nanoid";
import {
  Id,
  id,
  Mnemonic,
  Owner,
  OwnerId,
  SqliteBoolean,
  SqliteDate,
} from "./model.js";

// https://github.com/sindresorhus/type-fest/blob/main/source/simplify.d.ts
// eslint-disable-next-line @typescript-eslint/ban-types
type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export type Config = {
  syncUrl: string;
  /** Maximum physical clock drift allowed, in ms. */
  maxDrift: number;
  reloadUrl: string;
};

// CRDT

export const NodeId = pipe(
  S.string,
  S.pattern(/^[\w-]{16}$/),
  S.brand("NodeId")
);
export type NodeId = S.Infer<typeof NodeId>;

export const createNodeId: IO<NodeId> = pipe(
  customAlphabet("0123456789abcdef", 16),
  (nanoid) => () => nanoid() as NodeId
);

export const Millis = pipe(
  S.number,
  S.greaterThanOrEqualTo(0),
  S.brand("Millis")
);
export type Millis = S.Infer<typeof Millis>;

export const Counter = pipe(S.number, S.between(0, 65535), S.brand("Counter"));
export type Counter = S.Infer<typeof Counter>;

export interface Timestamp {
  readonly node: NodeId;
  readonly millis: Millis;
  readonly counter: Counter;
}

// TODO: Add Schema and use it in Evolu Server.
export type TimestampString = string & Brand<"TimestampString">;

export type TimestampHash = number & Brand<"TimestampHash">;

// TODO: Add Schema and use it in Evolu Server.
export interface MerkleTree {
  readonly hash?: TimestampHash;
  readonly "0"?: MerkleTree;
  readonly "1"?: MerkleTree;
  readonly "2"?: MerkleTree;
}

export type MerkleTreeString = string & Brand<"MerkleTreeString">;

export const merkleTreeToString = (m: MerkleTree): MerkleTreeString =>
  JSON.stringify(m) as MerkleTreeString;

export const merkleTreeFromString = (m: MerkleTreeString): MerkleTree =>
  JSON.parse(m) as MerkleTree;

/**
 * CrdtValue represents what Evolu can save in SQLite.
 * TODO: Add Int8Array, https://github.com/evoluhq/evolu/issues/4
 */
export type CrdtValue =
  // Remember to update DbSchema when changing.
  null | string | number;

export interface NewCrdtMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: CrdtValue;
}

export interface CrdtMessage extends NewCrdtMessage {
  readonly timestamp: TimestampString;
}

export interface CrdtClock {
  readonly timestamp: Timestamp;
  readonly merkleTree: MerkleTree;
}

// SQL

// Like Kysely CompiledQuery but without a `query` prop.
export interface SqlQuery {
  readonly sql: string;
  readonly parameters: readonly CrdtValue[];
}

export type SqlQueryString = string & Brand<"SqlQueryString">;
export const eqSqlQueryString: eq.Eq<SqlQueryString> = eq.eqStrict;

export const sqlQueryToString = ({
  sql,
  parameters,
}: SqlQuery): SqlQueryString =>
  JSON.stringify({ sql, parameters }) as SqlQueryString;

export const sqlQueryFromString = (s: SqlQueryString): SqlQuery =>
  JSON.parse(s) as SqlQuery;

export interface TableDefinition {
  readonly name: string;
  readonly columns: readonly string[];
}

// Errors.

export interface TimestampDuplicateNodeError {
  readonly type: "TimestampDuplicateNodeError";
  readonly node: NodeId;
}

export interface TimestampDriftError {
  readonly type: "TimestampDriftError";
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampCounterOverflowError {
  readonly type: "TimestampCounterOverflowError";
}

export interface TimestampParseError {
  readonly type: "TimestampParseError";
}

/**
 * We can't use the whole error because of WebWorker postMessage
 * DataCloneError in Safari and Firefox.
 */
interface TransferableError {
  readonly message: string;
  readonly stack: string | undefined;
}

export const errorToTransferableError = (error: unknown): TransferableError => {
  const isError = error instanceof Error;
  return {
    message: isError ? error.message : String(error),
    stack: isError ? error.stack : undefined,
  };
};

/**
 * A kitchen sink error for errors from Sqlite, micro-aes-gcm, etc. that
 * we don't handle specifically.
 */
export interface UnknownError {
  readonly type: "UnknownError";
  readonly error: TransferableError;
}

export const errorToUnknownError = (error: unknown): UnknownError => ({
  type: "UnknownError",
  error: errorToTransferableError(error),
});

/**
 * The client was unable to get in sync with the server.
 * This error can happen only when MerkleTree has a bug or
 * server did not update itself.
 */
export interface SyncError {
  readonly type: "SyncError";
}

export interface EvoluError {
  readonly type: "EvoluError";
  readonly error:
    | TimestampDuplicateNodeError
    | TimestampDriftError
    | TimestampCounterOverflowError
    | TimestampParseError
    | UnknownError
    | SyncError;
}

// DB

export type SqliteRow = ReadonlyRecord<string, CrdtValue>;

export type SqliteRows = readonly SqliteRow[];

export type RowsCache = ReadonlyRecord<SqlQueryString, SqliteRows>;

/**
 * Functional wrapper for various SQLite implementations.
 * It's async because some platforms are.
 */
export interface Database {
  readonly SQLite3Error: unknown;
  readonly exec: (sql: string) => TaskEither<UnknownError, SqliteRows>;
  readonly execSqlQuery: (s: SqlQuery) => TaskEither<UnknownError, SqliteRows>;
  readonly changes: () => TaskEither<UnknownError, number>;
}

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: SqliteRows;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: SqliteRow;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface QueryPatches {
  readonly query: SqlQueryString;
  readonly patches: readonly Patch[];
}

export type DbSchema = Readonly<
  Record<string, { id: Id } & Record<string, CrdtValue>>
>;

interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: OwnerId;
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

const commonColumnsObject: ReadonlyRecord<keyof CommonColumns, null> = {
  createdAt: null,
  createdBy: null,
  updatedAt: null,
  isDeleted: null,
};

export const commonColumns = Object.keys(commonColumnsObject);

type KyselySelectFrom<DB> = Pick<Kysely<DB>, "selectFrom">;

// Hooks.

type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

type DbSchemaForQuery<S extends DbSchema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

export type Query<S extends DbSchema, QueryRow> = (
  db: KyselySelectFrom<DbSchemaForQuery<S>>
) => SelectQueryBuilder<never, never, QueryRow>;

export type NullableOrFalse<T> = T | null | false;
export type ExcludeNullAndFalse<T> = Exclude<T, null | false>;

export type UseQuery<S extends DbSchema> = <
  QueryRow extends SqliteRow,
  Row extends SqliteRow
>(
  /** TODO */
  query: NullableOrFalse<Query<S, QueryRow>>,
  /** TODO */
  filterMap: (row: QueryRow) => NullableOrFalse<Row>
) => {
  readonly rows: readonly Readonly<ExcludeNullAndFalse<Row>>[];
  readonly row: Readonly<ExcludeNullAndFalse<Row>> | null;
  readonly isLoaded: boolean;
};

type DbSchemaForMutate<S extends DbSchema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

type AllowCasting<T> = {
  readonly [K in keyof T]: T[K] extends SqliteBoolean
    ? boolean | SqliteBoolean
    : T[K] extends null | SqliteBoolean
    ? null | boolean | SqliteBoolean
    : T[K] extends SqliteDate
    ? Date | SqliteDate
    : T[K] extends null | SqliteDate
    ? null | Date | SqliteDate
    : T[K];
};

export type Mutate<S extends DbSchema> = <
  U extends DbSchemaForMutate<S>,
  T extends keyof U
>(
  table: T,
  values: Simplify<Partial<AllowCasting<U[T]>>>,
  onComplete?: IO<void>
) => {
  readonly id: U[T]["id"];
};

// https://stackoverflow.com/a/54713648/233902
type NullablePartial<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>
> = { [K in keyof NP]: NP[K] };

export type Create<S extends DbSchema> = <T extends keyof S>(
  table: T,
  values: Simplify<NullablePartial<AllowCasting<Omit<S[T], "id">>>>,
  onComplete?: IO<void>
) => {
  readonly id: S[T]["id"];
};

export type Update<S extends DbSchema> = <T extends keyof S>(
  table: T,
  values: Simplify<
    Partial<
      AllowCasting<Omit<S[T], "id"> & Pick<CommonColumns, "isDeleted">>
    > & { id: S[T]["id"] }
  >,
  onComplete?: IO<void>
) => {
  readonly id: S[T]["id"];
};

export type UseMutation<S extends DbSchema> = () => {
  readonly create: Create<S>;
  readonly update: Update<S>;
};

export interface RestoreOwnerError {
  readonly type: "invalid mnemonic";
}

export interface OwnerActions {
  readonly reset: IO<void>;
  readonly restore: (
    mnemonic: string
  ) => Promise<Either<RestoreOwnerError, void>>;
}

export interface Hooks<S extends DbSchema> {
  readonly useQuery: UseQuery<S>;
  readonly useMutation: UseMutation<S>;
  readonly useEvoluError: IO<EvoluError | null>;
  readonly useOwner: IO<Owner | null>;
  readonly useOwnerActions: IO<OwnerActions>;
}

export type CreateHooks = <S extends DbSchema>(
  dbSchema: S,
  config?: Partial<Config>
) => Hooks<S>;

// DbWorker environments.
// https://andywhite.xyz/posts/2021-01-28-rte-react/

export interface DbEnv {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly db: Database;
}

export interface OwnerEnv {
  readonly owner: Owner;
}

export interface PostDbWorkerOutputEnv {
  readonly postDbWorkerOutput: (message: DbWorkerOutput) => IO<void>;
}

export interface PostSyncWorkerInputEnv {
  readonly postSyncWorkerInput: (message: SyncWorkerInput) => IO<void>;
}

export interface RowsCacheEnv {
  readonly rowsCache: IORef<RowsCache>;
}

export interface TimeEnv {
  readonly now: () => Millis;
}

export interface LockManagerEnv {
  readonly locks: LockManager;
}

export interface ConfigEnv {
  readonly config: Config;
}

export type DbWorkerEnvs = DbEnv &
  OwnerEnv &
  PostDbWorkerOutputEnv &
  PostSyncWorkerInputEnv &
  RowsCacheEnv &
  TimeEnv &
  LockManagerEnv &
  ConfigEnv;

// Workers.

export const OnCompleteId = id("OnComplete");
export type OnCompleteId = S.Infer<typeof OnCompleteId>;

export type DbWorkerInputReceive = {
  readonly type: "receive";
  readonly messages: readonly CrdtMessage[];
  readonly merkleTree: MerkleTree;
  readonly previousDiff: Option<Millis>;
};

export type DbWorkerInput =
  | {
      readonly type: "init";
      readonly config: Config;
      readonly tableDefinitions: readonly TableDefinition[];
    }
  | {
      readonly type: "updateDbSchema";
      readonly tableDefinitions: readonly TableDefinition[];
    }
  | {
      readonly type: "send";
      readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
      readonly onCompleteIds: readonly OnCompleteId[];
      readonly queries: readonly SqlQueryString[];
    }
  | {
      readonly type: "query";
      readonly queries: ReadonlyNonEmptyArray<SqlQueryString>;
    }
  | DbWorkerInputReceive
  | {
      readonly type: "sync";
      readonly queries: Option<ReadonlyNonEmptyArray<SqlQueryString>>;
    }
  | {
      readonly type: "resetOwner";
    }
  | {
      readonly type: "restoreOwner";
      readonly mnemonic: Mnemonic;
    };

export type DbWorkerOutputOnQuery = {
  readonly type: "onQuery";
  readonly queriesPatches: readonly QueryPatches[];
  readonly onCompleteIds: readonly OnCompleteId[];
};

export type DbWorkerOutput =
  | { readonly type: "onError"; readonly error: EvoluError["error"] }
  | { readonly type: "onOwner"; readonly owner: Owner }
  | DbWorkerOutputOnQuery
  | { readonly type: "onReceive" }
  | { readonly type: "onResetOrRestore" };

export type PostDbWorkerInput = (message: DbWorkerInput) => IO<void>;

export interface DbWorker {
  readonly post: PostDbWorkerInput;
}

export type CreateDbWorker = (
  onMessage: (message: DbWorkerOutput) => IO<void>
) => DbWorker;

export type SyncWorkerInput = {
  readonly syncUrl: string;
  readonly messages: Option<ReadonlyNonEmptyArray<CrdtMessage>>;
  readonly clock: CrdtClock;
  readonly owner: Owner;
  readonly previousDiff: Option<Millis>;
};

export type SyncWorkerOutput = Either<UnknownError, DbWorkerInputReceive>;

export type Unsubscribe = IO<void>;

export interface Store<T> {
  readonly subscribe: (listener: IO<void>) => Unsubscribe;
  readonly setState: (state: T) => IO<void>;
  readonly getState: IO<T>;
}

export interface Evolu<S extends DbSchema> {
  readonly subscribeError: (listener: IO<void>) => Unsubscribe;
  readonly getError: IO<EvoluError | null>;

  readonly subscribeOwner: (listener: IO<void>) => Unsubscribe;
  readonly getOwner: IO<Owner | null>;

  readonly subscribeQuery: (
    sqlQueryString: SqlQueryString | null
  ) => (listener: IO<void>) => Unsubscribe;
  readonly getQuery: (query: SqlQueryString | null) => IO<SqliteRows | null>;

  readonly mutate: Mutate<S>;

  readonly ownerActions: OwnerActions;
}

export type EvoluEnv = {
  readonly config: Config;
  readonly createDbWorker: CreateDbWorker;
};

export type CreateEvolu = <S extends DbSchema>(
  dbSchema: Schema<S>
) => Reader<EvoluEnv, Evolu<S>>;
