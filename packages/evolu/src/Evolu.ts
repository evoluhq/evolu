import * as S from "@effect/schema/Schema";
import {
  Brand,
  Context,
  Effect,
  Either,
  Function,
  Layer,
  ReadonlyArray,
  ReadonlyRecord,
  pipe,
} from "effect";
import * as Kysely from "kysely";
import { Config } from "./Config.js";
import { Query, QueryObject, Row, queryObjectToQuery } from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { EvoluError } from "./EvoluError.js";
import { Owner } from "./Owner.js";
import { Schema } from "./Schema.js";
import { StoreListener, StoreUnsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./SyncState.js";
import { getPropertySignatures, logDebug, runSync } from "./utils.js";

export interface Evolu<S extends Schema = Schema> {
  readonly subscribeError: (listener: StoreListener) => StoreUnsubscribe;
  readonly getError: () => EvoluError | null;

  readonly subscribeOwner: (listener: StoreListener) => StoreUnsubscribe;
  readonly getOwner: () => Owner | null;

  readonly createQuery: (queryCallback: QueryCallback<S, Row>) => Query;
  readonly subscribeQuery: (
    query: Query | null
  ) => (listener: StoreListener) => StoreUnsubscribe;
  readonly getQuery: (query: Query | null) => ReadonlyArray<Row> | null;
  readonly loadQuery: (query: Query) => Promise<ReadonlyArray<Row>>;

  readonly subscribeSyncState: (listener: StoreListener) => StoreUnsubscribe;
  readonly getSyncState: () => SyncState;

  readonly mutate: Mutate<S>;
  readonly ownerActions: OwnerActions;
}

export const Evolu = Context.Tag<Evolu>();

export type QueryCallback<S extends Schema, QueryRow> = (
  db: KyselyWithoutMutation<SchemaForQuery<S>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, QueryRow>;

export type KyselyWithoutMutation<DB> = Pick<
  Kysely.Kysely<DB>,
  "selectFrom" | "fn"
>;

export type SchemaForQuery<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: Owner["id"];
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

const commonColumns = ["createdAt", "createdBy", "updatedAt", "isDeleted"];

/**
 * SQLite doesn't support the Date type, so Evolu uses SqliteDate instead.
 * Use the {@link cast} helper to cast SqliteDate from Date and back.
 * https://www.sqlite.org/quirks.html#no_separate_datetime_datatype
 */
export const SqliteDate: S.BrandSchema<
  string,
  string & Brand.Brand<"SqliteDate">
> = S.string.pipe(
  S.filter((s) => !isNaN(Date.parse(s)), {
    message: () => "a date as a string value in ISO format",
    identifier: "SqliteDate",
  }),
  S.brand("SqliteDate")
);
export type SqliteDate = S.To<typeof SqliteDate>;

/**
 * SQLite doesn't support the boolean type, so Evolu uses SqliteBoolean instead.
 * Use the {@link cast} helper to cast SqliteBoolean from boolean and back.
 * https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 */
export const SqliteBoolean = S.union(S.literal(0), S.literal(1));
export type SqliteBoolean = S.To<typeof SqliteBoolean>;

type Mutate<S extends Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U,
>(
  table: T,
  values: Kysely.Simplify<Partial<AllowAutoCasting<U[T]>>>,
  onComplete?: () => void
) => {
  readonly id: U[T]["id"];
};

type SchemaForMutate<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

export type AllowAutoCasting<T> = {
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

export interface OwnerActions {
  /**
   * Use `reset` to delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly reset: () => void;

  /**
   * Use `restore` to restore `Owner` with synced data on a different device.
   */
  readonly restore: (
    mnemonic: string
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

/**
 * A helper for casting types not supported by SQLite.
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them
 * with {@link SqliteBoolean} and {@link SqliteDate}.
 *
 * ### Example
 *
 * ```
 * // isDeleted is SqliteBoolean
 * .where("isDeleted", "is not", cast(true))
 * ```
 */
export function cast(value: boolean): SqliteBoolean;
export function cast(value: SqliteBoolean): boolean;
export function cast(value: Date): SqliteDate;
export function cast(value: SqliteDate): Date;
export function cast(
  value: boolean | SqliteBoolean | Date | SqliteDate
): boolean | SqliteBoolean | Date | SqliteDate {
  if (typeof value === "boolean") return value === true ? 1 : 0;
  if (typeof value === "number") return value === 1;
  if (value instanceof Date) return value.toISOString() as SqliteDate;
  return new Date(value);
}

// No side-effect, no reason to use Effect.
const makeCreateQuery = (): Evolu["createQuery"] => {
  const kysely: Kysely.Kysely<SchemaForQuery<Schema>> = new Kysely.Kysely({
    dialect: {
      createAdapter: () => new Kysely.SqliteAdapter(),
      createDriver: () => new Kysely.DummyDriver(),
      createIntrospector(): Kysely.DatabaseIntrospector {
        throw "Not implemeneted";
      },
      createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
    },
  });
  return (queryCallback) =>
    queryObjectToQuery(queryCallback(kysely).compile() as QueryObject);
};

// No side-effect, no reason to use Effect.
const makeLoadQuery = (
  dbWorkerPost: DbWorker["postMessage"]
): Evolu["loadQuery"] => {
  const promises = new Map<
    Query,
    {
      readonly promise: Promise<ReadonlyArray<Row>>;
      readonly resolve: (_rows: ReadonlyArray<Row>) => void;
    }
  >();

  const getPromise = (
    query: Query
  ): {
    readonly promise: Promise<ReadonlyArray<Row>>;
    readonly isNew: boolean;
  } => {
    const item = promises.get(query);
    if (item) return { promise: item.promise, isNew: false };
    let resolve: (rows: ReadonlyArray<Row>) => void = Function.constVoid;
    const promise = new Promise<ReadonlyArray<Row>>((_resolve) => {
      resolve = _resolve;
    });
    promises.set(query, { promise, resolve });
    return { promise, isNew: true };
  };

  const queue = new Set<Query>();

  return (query) => {
    const { promise, isNew } = getPromise(query);
    if (isNew) queue.add(query);
    if (queue.size === 1) {
      queueMicrotask(() => {
        const queries = [...queue];
        queue.clear();
        if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
          dbWorkerPost({ _tag: "query", queries });
      });
    }
    return promise;
  };
};

const dbWorkerToDbWorkerWithLogDebug = (dbWorker: DbWorker): DbWorker => {
  const postMessage: DbWorker["postMessage"] = (input) => {
    runSync(logDebug("Evolu DbWorker.postMessage", input));
    dbWorker.postMessage(input);
  };
  const onMessage: DbWorker["onMessage"] = (callback) => {
    dbWorker.onMessage((output) => {
      runSync(logDebug("Evolu DbWorker.onMessage", output));
      callback(output);
    });
  };
  return { postMessage, onMessage };
};

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

const schemaToTables = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: S.Schema<any, any>
): ReadonlyArray<Table> =>
  pipe(
    getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)).concat(
          commonColumns
        ),
      })
    )
  );

const makeEvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>
): Effect.Effect<DbWorker | Config, never, Evolu<Schema>> =>
  Effect.all([
    Config,
    DbWorker.pipe(Effect.map(dbWorkerToDbWorkerWithLogDebug)),
  ]).pipe(
    Effect.map(([config, dbWorker]) => {
      const errorStore = makeStore<EvoluError | null>(null);
      const ownerStore = makeStore<Owner | null>(null);

      const createQuery = makeCreateQuery();
      const loadQuery = makeLoadQuery(dbWorker.postMessage);

      dbWorker.onMessage((output) => {
        // eslint-disable-next-line no-console
        console.log(output);
      });

      dbWorker.postMessage({
        _tag: "init",
        config,
        tableDefinitions: schemaToTables(schema),
      });

      return Evolu.of({
        subscribeError: errorStore.subscribe,
        getError: errorStore.getState,

        subscribeOwner: ownerStore.subscribe,
        getOwner: ownerStore.getState,

        createQuery,
        loadQuery,
        subscribeQuery: () => {
          throw "subscribeQuery";
        },
        getQuery: () => {
          throw "getQuery";
        },

        subscribeSyncState: () => {
          throw "subscribeSyncState";
        },
        getSyncState: () => {
          throw "getSyncState";
        },

        mutate: () => {
          throw "mutate";
        },

        ownerActions: {
          reset: () => {
            throw "reset";
          },
          restore: () => {
            throw "restore";
          },
        },
      });
    })
  );

export const EvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>
): Layer.Layer<Config | DbWorker, never, Evolu> =>
  Layer.effect(Evolu, makeEvoluLive<From, To>(schema));
