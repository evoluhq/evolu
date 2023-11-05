import { Context, Effect, Either, Layer } from "effect";
import * as Kysely from "kysely";
import { CommonColumns, Owner, Schema, Tables } from "./Db.js";
import { EvoluError } from "./Errors.js";
import { SqliteBoolean, SqliteDate } from "./Model.js";
import { Row } from "./Sqlite.js";
import { Listener, Unsubscribe } from "./Store.js";
import { SyncState } from "./SyncWorker.js";
import { CreateQuery, CreateQueryLive } from "./query/CreateQuery.js";
import { LoadQuery } from "./query/LoadQuery.js";
import { Query } from "./query/Query.js";
import { QueryResult } from "./query/QueryResult.js";

export interface Evolu2<S extends Schema> {
  readonly createQuery: CreateQuery<S>;
  readonly loadQuery: LoadQuery;

  readonly subscribeQuery: (
    query: Query<Row>,
  ) => (listener: Listener) => Unsubscribe;

  readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R> | null;

  readonly subscribeError: (listener: Listener) => Unsubscribe;
  readonly getError: () => EvoluError | null;

  readonly subscribeSyncState: (listener: Listener) => Unsubscribe;
  readonly getSyncState: () => SyncState;

  readonly subscribeOwner: (listener: Listener) => Unsubscribe;
  readonly getOwner: () => Owner | null;

  create: <K extends keyof S>(
    table: K,
    values: Kysely.Simplify<PartialForNullable<Castable<Omit<S[K], "id">>>>,
    onComplete?: () => void,
  ) => {
    readonly id: S[K]["id"];
  };

  update: <K extends keyof S>(
    table: K,
    values: Kysely.Simplify<
      Partial<Castable<Omit<S[K], "id"> & Pick<CommonColumns, "isDeleted">>> & {
        readonly id: S[K]["id"];
      }
    >,
    onComplete?: () => void,
  ) => {
    readonly id: S[K]["id"];
  };

  /**
   * Delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly resetOwner: () => void;

  /**
   * Restore `Owner` with synced data from different devices.
   */
  readonly restoreOwner: (
    mnemonic: string,
  ) => Promise<Either.Either<{ readonly _tag: "RestoreOwnerError" }, void>>;

  /** Ensure schema ad-hoc for hot reloading. */
  readonly ensureSchema: (tables: Tables) => void;
}

export const Evolu2 = <S extends Schema>() =>
  Context.Tag<Evolu2<S>>("evolu/Evolu");

// https://stackoverflow.com/a/54713648/233902
type PartialForNullable<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
> = { [K in keyof NP]: NP[K] };

/**
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them
 * with {@link SqliteBoolean} and {@link SqliteDate}.
 *
 * For {@link SqliteBoolean}, you can use JavaScript boolean.
 * For {@link SqliteDate}, you can use JavaScript Date.
 */
type Castable<T> = {
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

const EvoluLive = <S extends Schema>(
  _tables: Tables,
): Layer.Layer<
  CreateQuery<S>, // | Bip39 | Config | FlushSync | NanoId | Time | AppState,
  never,
  Evolu2<S>
> =>
  Layer.effect(
    Evolu2<S>(),
    Effect.gen(function* (_) {
      const createQuery = yield* _(CreateQuery<S>());

      return {
        createQuery,

        loadQuery(_query) {
          // getLoadingPromise(query).pipe(Effect.provide, runSync)?
          // priserny, a co?
          // getLoadingPromise(query)(loadingPromises)?
          // divny
          // getLoadingPromise(query) s tim, ze je to lokalni?
          // jako, ted to zase chci
          // nebo teda
          // loadingPromises.get()

          // const { promise, isNew } = getPromise(query.query);
          // if (isNew) queue.add(query);
          // if (queue.size === 1) {
          //   queueMicrotask(() => {
          //     const queries = [...queue];
          //     queue.clear();
          //     if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
          //       dbWorker.postMessage({ _tag: "query", queries });
          //   });
          // }
          // return promise;
          throw "";
        },

        subscribeQuery(_query) {
          throw "";
        },

        getQuery() {
          throw "";
        },

        subscribeError() {
          throw "";
        },

        getError() {
          throw "";
        },

        subscribeSyncState() {
          throw "";
        },

        getSyncState() {
          throw "";
        },

        subscribeOwner() {
          throw "";
        },

        getOwner() {
          throw "";
        },

        create() {
          throw "";
        },

        update() {
          throw "";
        },

        resetOwner() {
          throw "";
        },

        restoreOwner() {
          throw "";
        },

        ensureSchema() {
          throw "";
        },
      };
    }),
  );

export const EvoluFoo = <S extends Schema>(_tables: Tables) =>
  EvoluLive<S>(_tables).pipe(Layer.use(CreateQueryLive<S>()));
