import { eq } from "fp-ts";
import { Either } from "fp-ts/Either";
import { IO } from "fp-ts/IO";
import { IORef } from "fp-ts/IORef";
import { Reader } from "fp-ts/lib/Reader.js";
import { Option } from "fp-ts/Option";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { TaskEither } from "fp-ts/TaskEither";
import type { Kysely, SelectQueryBuilder } from "kysely";
import { customAlphabet } from "nanoid";
import { BRAND, z } from "zod";
import {
  ID,
  Mnemonic,
  OwnerId,
  SqliteBoolean,
  SqliteDateTime,
} from "./model.js";

export type Config = {
  syncUrl: string;
  /** Maximum physical clock drift allowed, in ms. */
  maxDrift: number;
  reloadUrl: string;
};

// CRDT

const nodeIdRegex = /^[0-9a-f]{16}$/i;
export const NodeId = z
  .string()
  .refine((s) => nodeIdRegex.test(s))
  .brand<"NodeId">();
export type NodeId = z.infer<typeof NodeId>;
const nodeIdNanoId = customAlphabet("0123456789abcdef", 16);
export const createNodeId = (): NodeId => nodeIdNanoId() as NodeId;

export type Millis = number & BRAND<"Millis">;
export const Millis = z.number().refine((n: number): n is Millis => n >= 0);

export const MAX_COUNTER = 65535;
export type Counter = number & BRAND<"Counter">;
export const Counter = z
  .number()
  .refine((n: number): n is Counter => n >= 0 && n <= MAX_COUNTER);

export interface Timestamp {
  readonly millis: Millis;
  readonly counter: Counter;
  readonly node: NodeId;
}

export type TimestampString = string & BRAND<"TimestampString">;

/** A murmurhash of stringified Timestamp. */
export type TimestampHash = number & BRAND<"TimestampHash">;

export interface MerkleTree {
  readonly hash?: TimestampHash;
  readonly "0"?: MerkleTree;
  readonly "1"?: MerkleTree;
  readonly "2"?: MerkleTree;
}

export type MerkleTreeString = string & BRAND<"MerkleTreeString">;

export const merkleTreeToString = (m: MerkleTree): MerkleTreeString =>
  JSON.stringify(m) as MerkleTreeString;

export const merkleTreeFromString = (m: MerkleTreeString): MerkleTree =>
  JSON.parse(m) as MerkleTree;

// TODO: Add Int8Array, https://github.com/evolu-io/evolu/issues/13
export type CrdtValue = null | string | number;

export interface NewCrdtMessage {
  readonly table: string;
  readonly row: ID<string>;
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

/** Like Kysely CompiledQuery but without a `query` prop. */
export interface SqlQuery {
  readonly sql: string;
  readonly parameters: readonly SqliteCompatibleType[];
}

export type SqlQueryString = string & BRAND<"SqlQueryString">;
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

// DB

// TODO: Binary.
export type SqliteCompatibleType = number | string | null;

export type SqliteRow = ReadonlyRecord<string, SqliteCompatibleType>;

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

/* A database owner. */
export interface Owner {
  readonly id: OwnerId;
  readonly mnemonic: Mnemonic;
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

export interface PurgePatch {
  readonly op: "purge";
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch | PurgePatch;

export interface QueryPatches {
  readonly query: SqlQueryString;
  readonly patches: readonly Patch[];
}

type DbTableSchema = {
  readonly id: z.ZodBranded<z.ZodEffects<z.ZodString, string, string>, string>;
} & ReadonlyRecord<string, z.ZodTypeAny>;

export type DbSchema = Record<string, DbTableSchema>;

export const CommonColumns = z.object({
  createdAt: SqliteDateTime,
  createdBy: OwnerId,
  updatedAt: SqliteDateTime,
  isDeleted: SqliteBoolean,
});
export type CommonColumns = z.infer<typeof CommonColumns>;
export const commonColumns = Object.keys(CommonColumns.shape);

type NullableExceptOfId<T> = {
  readonly [P in keyof T]: P extends "id" ? T[P] : T[P] | null;
};

export type DbSchemaToType<S extends DbSchema, A> = {
  readonly [TableName in keyof S]: NullableExceptOfId<
    {
      readonly [ColumnName in keyof S[TableName]]: z.TypeOf<
        S[TableName][ColumnName]
      >;
    } & A
  >;
};

type KyselyOnlyForReading<DB> = Omit<
  Kysely<DB>,
  | "connection"
  | "deleteFrom"
  | "destroy"
  | "dynamic"
  | "fn"
  | "getExecutor"
  | "insertInto"
  | "introspection"
  | "isTransaction"
  | "migration"
  | "raw"
  | "replaceInto"
  | "schema"
  | "transaction"
  | "updateTable"
  | "with"
  | "withoutPlugins"
  | "withPlugin"
  | "withRecursive"
  | "withSchema"
  | "withTables"
>;

// Hooks.

export type Query<S extends DbSchema, T> = (
  db: KyselyOnlyForReading<DbSchemaToType<S, CommonColumns>>
) => SelectQueryBuilder<never, never, T>;

// Typescript function overloading in arrow functions.
// https://stackoverflow.com/a/53143568/233902
export interface UseQuery<S extends DbSchema> {
  <T>(query: Query<S, T> | null | false): {
    readonly rows: readonly T[];
    readonly row: T | null;
    readonly isLoaded: boolean;
  };
  <T, U>(query: Query<S, T> | null | false, initialFilterMap: (row: T) => U): {
    readonly rows: readonly NonNullable<U>[];
    readonly row: NonNullable<U> | null;
    readonly isLoaded: boolean;
  };
}

type AllowCasting<T> = {
  readonly [P in keyof T]: T[P] extends SqliteBoolean | null
    ? T[P] | boolean
    : T[P] extends SqliteDateTime | null
    ? T[P] | Date
    : T[P];
};

export type OnCompleteId = ID<"OnComplete">;

export type Mutate<S extends DbSchema> = <
  V extends DbSchemaToType<S, Pick<CommonColumns, "isDeleted">>,
  T extends keyof V
>(
  table: T,
  values: Partial<AllowCasting<V[T]>>,
  onComplete?: IO<void>
) => {
  readonly id: V[T]["id"];
};

export type UseMutation<S extends DbSchema> = () => {
  readonly mutate: Mutate<S>;
};

export interface RestoreOwnerError {
  readonly type: "invalid mnemonic";
}

export interface OwnerActions {
  readonly reset: IO<void>;
  readonly restore: (mnemonic: string) => Either<RestoreOwnerError, void>;
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
 * A kitchen sink error for errors from OpenPGP, Sqlite, etc. that
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

// Workers.

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
      readonly purgeCache?: boolean;
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
  | {
      readonly type: "onError";
      readonly error: EvoluError["error"];
    }
  | {
      readonly type: "onOwner";
      readonly owner: Owner;
    }
  | DbWorkerOutputOnQuery
  | {
      readonly type: "onReceive";
    }
  | { readonly type: "onResetOrRestore" };

export type PostDbWorkerInput = (message: DbWorkerInput) => IO<void>;

export interface DbWorker {
  readonly post: PostDbWorkerInput;
}

export type CreateDbWorker = (
  onMessage: (message: DbWorkerOutput) => void
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

  readonly subscribeRows: (listener: IO<void>) => Unsubscribe;
  readonly getRows: (query: SqlQueryString | null) => IO<SqliteRows | null>;

  // TODO: Remove, should not be required.
  readonly subscribeQuery: (sqlQueryString: SqlQueryString) => Unsubscribe;

  readonly mutate: Mutate<S>;

  readonly ownerActions: OwnerActions;
}

export type EvoluEnv = {
  readonly config: Config;
  readonly createDbWorker: CreateDbWorker;
};

export type CreateEvolu = <S extends DbSchema>(
  dbSchema: S
) => Reader<EvoluEnv, Evolu<S>>;
