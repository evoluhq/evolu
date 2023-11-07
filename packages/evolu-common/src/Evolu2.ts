import { Context, Effect, Layer } from "effect";
import { Schema, Tables } from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { CreateQuery, CreateQueryLive } from "./query/CreateQuery.js";
import { LoadQuery, LoadQueryLive } from "./query/LoadQuery.js";
import { LoadingPromisesLive } from "./query/LoadingPromises.js";

export interface Evolu2<S extends Schema> {
  /**
   * TODO: ... and naming, todosAll, productById, etc.
   */
  readonly createQuery: CreateQuery<S>;

  readonly loadQuery: LoadQuery;

  // readonly subscribeQuery: (
  //   query: Query<Row>,
  // ) => (listener: Listener) => Unsubscribe;

  // readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R> | null;

  // readonly subscribeError: (listener: Listener) => Unsubscribe;
  // readonly getError: () => EvoluError | null;

  // readonly subscribeSyncState: (listener: Listener) => Unsubscribe;
  // readonly getSyncState: () => SyncState;

  // readonly subscribeOwner: (listener: Listener) => Unsubscribe;
  // readonly getOwner: () => Owner | null;

  // create: <K extends keyof S>(
  //   table: K,
  //   values: Kysely.Simplify<PartialForNullable<Castable<Omit<S[K], "id">>>>,
  //   onComplete?: () => void,
  // ) => {
  //   readonly id: S[K]["id"];
  // };

  // update: <K extends keyof S>(
  //   table: K,
  //   values: Kysely.Simplify<
  //     Partial<Castable<Omit<S[K], "id"> & Pick<CommonColumns, "isDeleted">>> & {
  //       readonly id: S[K]["id"];
  //     }
  //   >,
  //   onComplete?: () => void,
  // ) => {
  //   readonly id: S[K]["id"];
  // };

  // /**
  //  * Delete all local data from the current device.
  //  * After the deletion, Evolu reloads all browser tabs that use Evolu.
  //  */
  // readonly resetOwner: () => void;

  // /**
  //  * Restore `Owner` with synced data from different devices.
  //  */
  // readonly restoreOwner: (
  //   mnemonic: string,
  // ) => Promise<Either.Either<{ readonly _tag: "RestoreOwnerError" }, void>>;

  // /** Ensure schema ad-hoc for hot reloading. */
  // readonly ensureSchema: (tables: Tables) => void;
}

export const Evolu2 = <S extends Schema>(): Context.Tag<Evolu2<S>, Evolu2<S>> =>
  Context.Tag<Evolu2<S>>("evolu/Evolu");

// // https://stackoverflow.com/a/54713648/233902
// type PartialForNullable<
//   T,
//   NK extends keyof T = {
//     [K in keyof T]: null extends T[K] ? K : never;
//   }[keyof T],
//   NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
// > = { [K in keyof NP]: NP[K] };

// /**
//  * SQLite doesn't support Date nor Boolean types, so Evolu emulates them
//  * with {@link SqliteBoolean} and {@link SqliteDate}.
//  *
//  * For {@link SqliteBoolean}, you can use JavaScript boolean.
//  * For {@link SqliteDate}, you can use JavaScript Date.
//  */
// type Castable<T> = {
//   readonly [K in keyof T]: T[K] extends SqliteBoolean
//     ? boolean | SqliteBoolean
//     : T[K] extends null | SqliteBoolean
//     ? null | boolean | SqliteBoolean
//     : T[K] extends SqliteDate
//     ? Date | SqliteDate
//     : T[K] extends null | SqliteDate
//     ? null | Date | SqliteDate
//     : T[K];
// };

const EvoluLayer = <S extends Schema>(
  _tables: Tables,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) =>
  Layer.effect(
    Evolu2<S>(),
    Effect.gen(function* (_) {
      const createQuery = yield* _(CreateQuery<S>());
      const loadQuery = yield* _(LoadQuery);

      return {
        createQuery,
        loadQuery,

        // subscribeQuery(_query) {
        //   throw "";
        // },

        // getQuery() {
        //   throw "";
        // },

        // subscribeError() {
        //   throw "";
        // },

        // getError() {
        //   throw "";
        // },

        // subscribeSyncState() {
        //   throw "";
        // },

        // getSyncState() {
        //   throw "";
        // },

        // subscribeOwner() {
        //   throw "";
        // },

        // getOwner() {
        //   throw "";
        // },

        // create() {
        //   throw "";
        // },

        // update() {
        //   throw "";
        // },

        // resetOwner() {
        //   throw "";
        // },

        // restoreOwner() {
        //   throw "";
        // },

        // ensureSchema() {
        //   throw "";
        // },
      };
    }),
  );

export const EvoluPlatform = <S extends Schema>(
  _tables: Tables,
): Layer.Layer<
  DbWorker, // | Bip39 | NanoId | FlushSync | AppState,
  never,
  Evolu2<S>
> =>
  EvoluLayer<S>(_tables).pipe(
    Layer.use(
      Layer.mergeAll(
        CreateQueryLive<S>(),
        LoadQueryLive.pipe(Layer.use(LoadingPromisesLive)),
      ),
    ),
  );
