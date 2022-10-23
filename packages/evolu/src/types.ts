import { eq } from "fp-ts";
import { IO } from "fp-ts/IO";
import { IORef } from "fp-ts/IORef";
import { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { TaskEither } from "fp-ts/TaskEither";
import type { JSONPatchDocument } from "immutable-json-patch";
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

export type LogTarget =
  | "clock:read"
  | "clock:update"
  | "sync:request"
  | "sync:response"
  | "dev";

/* eslint-disable functional/prefer-readonly-type */
export type Config = {
  syncUrl: string;
  log: boolean | LogTarget | LogTarget[];
  /** Maximum physical clock drift allowed, in ms. */
  maxDrift: number;
};
/* eslint-enable functional/prefer-readonly-type */

export type Unsubscribe = IO<void>;

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

// A subset of SQLiteCompatibleType.
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
  readonly parameters: readonly unknown[];
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

// This is a workaround for:
// https://github.com/rhashimoto/wa-sqlite/blob/29a38da3dc001f8e6844837f6f3dffcdda2cdb10/src/types/index.d.ts#L18
// It should be possible to import it, but it's somehow ambient.
export type SQLiteCompatibleType =
  | number
  | string
  | Int8Array
  // eslint-disable-next-line functional/prefer-readonly-type
  | Array<number>
  | null;

export type SQLiteRow = readonly SQLiteCompatibleType[];

/** SQLiteRowRecord is SQLiteRow with columns. */
export type SQLiteRowRecord = ReadonlyRecord<string, SQLiteCompatibleType>;

export interface TableDefinition {
  readonly name: string;
  readonly columns: readonly string[];
}

// DB

/* A database owner. */
export interface Owner {
  readonly id: OwnerId;
  readonly mnemonic: Mnemonic;
}

export interface PreparedStatement {
  readonly exec: (
    bindings: readonly CrdtValue[]
  ) => TaskEither<UnknownError, readonly SQLiteRowRecord[]>;
  readonly release: () => TaskEither<UnknownError, void>;
}

export interface Database {
  readonly exec: (
    sql: string
  ) => TaskEither<UnknownError, readonly SQLiteRow[]>;

  readonly changes: () => number;

  readonly execSqlQuery: (
    sqlQuery: SqlQuery
  ) => TaskEither<UnknownError, readonly SQLiteRowRecord[]>;

  readonly prepare: (
    sql: string
  ) => TaskEither<UnknownError, PreparedStatement>;
}

export type QueriesRowsCache = ReadonlyRecord<
  SqlQueryString,
  readonly SQLiteRowRecord[]
>;

export interface QueryPatches {
  readonly query: SqlQueryString;
  readonly patches: JSONPatchDocument;
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

export type UseQuery<S extends DbSchema> = <T>(
  query: Query<S, T> | null | false
) => {
  readonly rows: readonly T[];
  readonly row: T | null;
  readonly isLoaded: boolean;
};

type AllowCasting<T> = {
  readonly [P in keyof T]: T[P] extends SqliteBoolean | null
    ? T[P] | boolean
    : T[P] extends SqliteDateTime | null
    ? T[P] | Date
    : T[P];
};

export type Mutate<S extends DbSchema> = <
  V extends DbSchemaToType<S, Pick<CommonColumns, "isDeleted">>,
  T extends keyof V
>(
  table: T,
  values: Partial<AllowCasting<V[T]>>
) => {
  readonly id: V[T]["id"];
};

export type UseMutation<S extends DbSchema> = () => {
  readonly mutate: Mutate<S>;
};

// Environments.
// https://andywhite.xyz/posts/2021-01-28-rte-react/

export interface DbEnv {
  readonly db: Database;
}

export interface DbTransactionEnv {
  readonly dbTransaction: <E, A>(
    te: TaskEither<E, A>
  ) => TaskEither<E | UnknownError, A>;
}

export interface OwnerEnv {
  readonly owner: Owner;
}

export interface QueriesRowsCacheEnv {
  readonly queriesRowsCache: IORef<QueriesRowsCache>;
}

export interface TimeEnv {
  readonly now: Millis;
}

export const createTimeEnv: IO<TimeEnv> = () => ({
  now: Date.now() as Millis,
});

export interface LockManagerEnv {
  readonly locks: LockManager;
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

export interface StringMaxLengthError {
  readonly type: "StringMaxLengthError";
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
 * A kitchen sink error for errors from OpenPGP, wa-sqlite, etc. that
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

/**
 * This error should happen only in Firefox's private mode,
 * which does not support IndexedDB.
 */
export interface SQLiteError {
  readonly type: "SQLiteError";
}

export interface EvoluError {
  readonly type: "EvoluError";
  readonly error:
    | TimestampDuplicateNodeError
    | TimestampDriftError
    | TimestampCounterOverflowError
    | TimestampParseError
    | StringMaxLengthError
    | UnknownError
    | SyncError
    | SQLiteError;
}
