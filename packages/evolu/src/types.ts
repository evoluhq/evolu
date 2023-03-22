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
  /**
   * Alternate URL to Evolu sync&backup server.
   */
  syncUrl: string;
  /**
   * Alternate URL to reload browser tabs after `Owner` reset or restore.
   * The default value is `/`.
   */
  reloadUrl: string;
  /**
   * Maximum physical clock drift allowed in ms.
   * The default value is 60000 (1 minute).
   */
  maxDrift: number;
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
 */
export type CrdtValue = null | string | number | Uint8Array;

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
// TODO: Rename to Query
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

/**
 * EvoluError represents an error that can occur within Evolu.
 *
 * @property {string} type - A string literal indicating the type of the error
 * @property {TimestampDuplicateNodeError | TimestampDriftError | TimestampCounterOverflowError | TimestampParseError | UnknownError | SyncError} error - The specific error that occurred, represented by one of several possible sub-types.
 */
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

// TODO: Rename to Row
export type SqliteRow = ReadonlyRecord<string, CrdtValue>;

// TODO: Rename to Rows
export type SqliteRows = readonly SqliteRow[];

export interface RowsWithLoadingState {
  readonly rows: SqliteRows;
  readonly isLoading: boolean;
}

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

export type OrNullOrFalse<T> = T | null | false;
export type ExcludeNullAndFalse<T> = Exclude<T, null | false>;

export type UseQuery<S extends DbSchema> = <
  QueryRow extends SqliteRow,
  Row extends SqliteRow
>(
  query: OrNullOrFalse<Query<S, QueryRow>>,
  filterMap: (row: QueryRow) => OrNullOrFalse<Row>
) => {
  /**
   * Rows from the database. They can be filtered and mapped by `filterMap`.
   */
  readonly rows: readonly Readonly<Simplify<ExcludeNullAndFalse<Row>>>[];
  /**
   * The first row from `rows`. For empty rows, it's null.
   */
  readonly row: Readonly<Simplify<ExcludeNullAndFalse<Row>>> | null;
  /**
   * `isLoaded` becomes true when rows are loaded for the first time.
   * Rows are cached per SQL query, so this happens only once.
   */
  readonly isLoaded: boolean;
  /**
   * `isLoading` becomes true whenever rows are loading.
   */
  readonly isLoading: boolean;
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
  /**
   * Creates a new row with the given values.
   *
   * ### Examples
   *
   * To create a new row:
   *
   * ```
   * const { create } = useMutation();
   * create("todo", { title });
   * ```
   *
   * To get a new row's `Id`:
   *
   * ```
   * const { create } = useMutation();
   * const { id } = create("todo", { title });
   * ```
   *
   * To wait until a new row is rendered:
   *
   * ```
   * const { create } = useMutation();
   * create("todo", { title }, onComplete);
   * ```
   */
  readonly create: Create<S>;
  /**
   * Update a row with the given values.
   *
   * ### Examples
   *
   * To update a row:
   *
   * ```
   * const { update } = useMutation();
   * update("todo", { id, title });
   * ```
   *
   * To wait until the updated row is rendered:
   *
   * ```
   * const { update } = useMutation();
   * update("todo", { id, title }, onComplete);
   * ```
   *
   * To delete a row.
   *
   * ```
   * const { update } = useMutation();
   * update("todo", { id, isDeleted: true });
   * ```
   */
  readonly update: Update<S>;
};

export interface RestoreOwnerError {
  readonly type: "invalid mnemonic";
}

export interface OwnerActions {
  /**
   * Use `reset` to delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly reset: IO<void>;
  /**
   * Use `restore` to restore `Owner` with synced data on a different device.
   */
  readonly restore: (
    mnemonic: string
  ) => Promise<Either<RestoreOwnerError, void>>;
}

// For some reason, VSCode terminates JSDoc parsing on any @ character here,
// so we can't use JSDoc tags. I spent a few hours googling and trying
// anything, but without success. That's why we can't use @param a @example.
export interface Hooks<S extends DbSchema> {
  /**
   * `useQuery` React Hook performs a database query and returns rows that
   * are automatically updated when data changes.
   *
   * It takes two callbacks, a Kysely type-safe SQL query builder,
   * and a filterMap helper.
   *
   * `useQuery` also returns `isLoaded` and `isLoading` props that indicate
   * loading progress. `isLoaded` becomes true when rows are loaded for the
   *  first time. `isLoading` becomes true whenever rows are loading.
   *
   * ### Examples
   *
   * The most simple example:
   *
   * ```
   * const { rows } = useQuery(
   *   (db) => db.selectFrom("todo").selectAll(),
   *   (row) => row
   * );
   * ```
   *
   * If you mouse hover over `rows`, you will see that all columns except `Id`
   * are nullable regardless of the database Schema.
   *
   * There are two good reasons for that. The first is the local-first app
   * database schema can be changed anytime, but already-created data can't
   * because it's not feasible to migrate all local data. The second reason
   * is that sync messages can arrive in any order in distributed systems.
   *
   * The remedy for nullability is ad-hoc filtering and mapping via filterMap
   * helper. This example filters out rows with falsy titles:
   *
   * ```
   * const { rows } = useQuery(
   *   (db) => db.selectFrom("todo").selectAll(),
   *   ({ title, ...rest }) => title && { title, ...rest }
   * );
   * ```
   *
   * A real app would filterMap all versions of the table schema defined
   * by a union of types, therefore safely enforced by the TypeScript compiler.
   *
   * The next example shows the usage of columns that Evolu automatically
   * adds to all tables. Those columns are: `createdAt`, `createdBy`,
   * `updatedAt`, and `isDeleted`.
   *
   * ```
   * const { rows } = useQuery(
   *   (db) =>
   *     db
   *       .selectFrom("todoCategory")
   *       .select(["id", "name"])
   *       .where("isDeleted", "is not", E.cast(true))
   *       .orderBy("createdAt"),
   *   ({ name, ...rest }) => name && { name, ...rest }
   * );
   * ```
   *
   * Note `E.cast` usage. It's Evolu's helper to cast booleans and dates
   * that SQLite does not support natively.
   */
  readonly useQuery: UseQuery<S>;
  /**
   * `useMutation` React Hook returns an object with two functions for creating
   * and updating rows in the database.
   *
   * Note that Evolu does not use SQL for mutations. It's not a bug;
   * it's a feature. SQL for mutations is dangerous for local-first apps.
   * One wrong update can accidentally affect many rows.
   *
   * Local-first data are meant to last forever. Imagine an SQL update that
   * changes tons of data. That would generate a lot of sync messages making
   * sync slow and backup huge.
   *
   * Explicit mutations also allow Evolu to automatically add and update
   * a few useful columns common to all tables.
   *
   * Those columns are: `createdAt`, `createdBy`, `updatedAt`, and `isDeleted`.
   */
  readonly useMutation: UseMutation<S>;
  /**
   * `useEvoluError` React Hook returns `EvoluError`.
   *
   * Evolu should never fail; that's one of the advantages of local-first apps,
   * but if an error still occurs, please report it in Evolu GitHub issues.
   *
   * The reason why Evolu should never fail is that there is no reason it should.
   * Mutations are saved immediately and synced when the internet is available.
   * The only expectable error is QuotaExceeded (TODO).
   */
  readonly useEvoluError: () => EvoluError | null;
  /**
   * `useOwner` React Hook returns `Owner`.
   */
  readonly useOwner: () => Owner | null;
  /**
   * `useOwnerActions` React Hook returns `OwnerActions` that can be used to
   * reset `Owner` on the current device or restore `Owner` on a different one.
   */
  readonly useOwnerActions: () => OwnerActions;
}

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
  readonly rowsCache: IORef<ReadonlyMap<SqlQueryString, SqliteRows>>;
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

  readonly subscribeRowsWithLoadingState: (
    queryString: SqlQueryString | null
    // Can't be IO, it's not compatible with eslint-plugin-react-hooks
  ) => (listener: IO<void>) => Unsubscribe;

  readonly getRowsWithLoadingState: (
    queryString: SqlQueryString | null
  ) => IO<RowsWithLoadingState | null>;

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
