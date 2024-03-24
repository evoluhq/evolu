import * as S from "@effect/schema/Schema";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Kysely from "kysely";
import { DatabaseSchema, serializeQuery } from "./Db.js";
import { SqliteQuery, isSqlMutation } from "./Sqlite.js";
import { Config, createEvoluRunSync } from "./_Config.js";
import { makeErrorStore } from "./_ErrorStore.js";
import { Evolu } from "./_Evolu.js";

// `### Example` is used instead of `@example` because of TypeScript JSDoc bug.
// For some reason, TS strips anything starting `@` on assignment.

export class EvoluFactory extends Context.Tag("EvoluFactory")<
  EvoluFactory,
  {
    /**
     * Create Evolu from the database schema.
     *
     * Tables with a name prefixed with `_` are local-only, which means they are
     * never synced. It's useful for device-specific or temporal data.
     *
     * ### Example
     *
     * ```ts
     * import * as S from "@effect/schema/Schema";
     *
     * import * as E from "@evolu/react";
     * // The same API for different platforms
     * // import * as E from "@evolu/react-native";
     * // import * as E from "@evolu/common-web";
     *
     * const TodoId = E.id("Todo");
     * type TodoId = S.Schema.Type<typeof TodoId>;
     *
     * const TodoTable = E.table({
     *   id: TodoId,
     *   title: E.NonEmptyString1000,
     * });
     * type TodoTable = S.Schema.Type<typeof TodoTable>;
     *
     * const Database = E.database({
     *   todo: TodoTable,
     *
     *   // Prefix `_` makes the table local-only (it will not sync)
     *   _todo: TodoTable,
     * });
     * type Database = S.Schema.Type<typeof Database>;
     *
     * const evolu = E.createEvolu(Database);
     * ```
     */
    readonly _createEvolu: <T extends DatabaseSchema, I>(
      schema: S.Schema<T, I>,
      config?: Partial<Config>,
    ) => Evolu<T>;
  }
>() {}

export const EvoluFactoryCommon = Layer.effect(
  EvoluFactory,
  Effect.gen(function* (_) {
    // const dbWorker = yield* _(DbWorker);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const foo = yield* _(Effect.succeed(1));

    // For hot/live reload and future Evolu dynamic import.
    const instances = new Map<string, Evolu>();

    return {
      _createEvolu: <T extends DatabaseSchema, I>(
        schema: S.Schema<T, I>,
        config?: Partial<Config>,
      ): Evolu<T> => {
        const runSync = createEvoluRunSync(config);
        const { name } = Config.pipe(runSync);
        let evolu = instances.get(name);
        if (evolu == null) evolu = createEvolu(schema).pipe(runSync);
        evolu.ensureSchema(schema);
        return evolu as Evolu<T>;
      },
    };
  }),
);

const createEvolu = <T extends DatabaseSchema, I, R>(
  _schema: S.Schema<T, I, R>,
): Effect.Effect<Evolu, never, Config> =>
  Effect.gen(function* (_) {
    const config = yield* _(Config);
    const errorStore = yield* _(makeErrorStore);

    const loadQuery: Evolu["loadQuery"] = () => {
      // const loadingPromises = yield * _(LoadingPromises);
      // const dbWorker = yield* _(DbWorker);
      // let queries: ReadonlyArray<Query> = [];

      // return LoadQuery.of((query) => {
      //   const { promise, isNew } = loadingPromises.get(query);
      //   if (isNew) queries = [...queries, query];
      //   if (queries.length === 1) {
      //     queueMicrotask(() => {
      //       if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
      //         dbWorker.postMessage({ _tag: "query", queries });
      //       queries = [];
      //     });
      //   }
      //   return promise;

      throw "";
    };

    const loadQueries: Evolu["loadQueries"] = () => {
      throw "";
    };

    const subscribeQuery: Evolu["subscribeQuery"] = () => {
      throw "";
    };

    const getQuery: Evolu["getQuery"] = () => {
      throw "";
    };

    const subscribeOwner: Evolu["subscribeOwner"] = () => {
      throw "";
    };

    const getOwner: Evolu["getOwner"] = () => {
      throw "";
    };

    const subscribeSyncState: Evolu["subscribeSyncState"] = () => {
      throw "";
    };

    const getSyncState: Evolu["getSyncState"] = () => {
      throw "";
    };

    const create: Evolu["create"] = () => {
      throw "";
    };

    const update: Evolu["update"] = () => {
      throw "";
    };

    const createOrUpdate: Evolu["createOrUpdate"] = () => {
      throw "";
    };

    const resetOwner: Evolu["resetOwner"] = () => {
      throw "";
    };

    const restoreOwner: Evolu["restoreOwner"] = () => {
      throw "";
    };

    const ensureSchema: Evolu["ensureSchema"] = () => {
      throw "";
    };

    const sync: Evolu["sync"] = () => {
      throw "";
    };

    return {
      subscribeError: errorStore.subscribe,
      getError: errorStore.getState,
      createQuery,
      loadQuery,
      loadQueries,
      subscribeQuery,
      getQuery,
      subscribeOwner,
      getOwner,
      subscribeSyncState,
      getSyncState,
      create,
      update,
      createOrUpdate,
      resetOwner,
      restoreOwner,
      ensureSchema,
      sync,
    };
  });

const createQuery: Evolu["createQuery"] = (queryCallback, options) =>
  pipe(
    queryCallback(kysely).compile(),
    (compiledQuery): SqliteQuery => {
      if (isSqlMutation(compiledQuery.sql))
        throw new Error(
          "SQL mutation (INSERT, UPDATE, DELETE, etc.) isn't allowed in the Evolu `createQuery` function. Kysely suggests it because there is no read-only Kysely yet, and removing such an API is not possible. For mutations, use Evolu mutation API.",
        );
      const parameters = compiledQuery.parameters as NonNullable<
        SqliteQuery["parameters"]
      >;
      return {
        sql: compiledQuery.sql,
        parameters,
        ...(options && { options }),
      };
    },
    (query) => serializeQuery(query),
  );

// https://kysely.dev/docs/recipes/splitting-query-building-and-execution
const kysely = new Kysely.Kysely({
  dialect: {
    createAdapter: (): Kysely.DialectAdapter => new Kysely.SqliteAdapter(),
    createDriver: (): Kysely.Driver => new Kysely.DummyDriver(),
    createIntrospector(): Kysely.DatabaseIntrospector {
      throw "Not implemeneted";
    },
    createQueryCompiler: (): Kysely.QueryCompiler =>
      new Kysely.SqliteQueryCompiler(),
  },
});
