import { Schema } from "@effect/schema";
import { readonlyArray } from "fp-ts";
import { constNull, pipe } from "fp-ts/lib/function.js";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { createConfig } from "./createConfig.js";
import { createDbWorker } from "./createDbWorker.js";
import { createEvolu } from "./createEvolu.js";
import { kysely } from "./kysely.js";
import {
  Config,
  Create,
  DbSchema,
  Hooks,
  OrNullOrFalse,
  SqliteRow,
  SqlQuery,
  sqlQueryToString,
  Update,
  UseMutation,
  UseQuery,
} from "./types.js";

/**
 * `createHooks` defines the database schema and returns React Hooks.
 * Evolu uses [Schema](https://github.com/effect-ts/schema) for domain modeling.
 *
 * ### Example
 *
 * ```
 * import * as S from "@effect/schema";
 * import * as E from "evolu";
 *
 * const TodoId = E.id("Todo");
 * type TodoId = S.Infer<typeof TodoId>;
 *
 * const TodoTable = S.struct({
 *   id: TodoId,
 *   title: E.NonEmptyString1000,
 *   isCompleted: E.SqliteBoolean,
 * });
 * type TodoTable = S.Infer<typeof TodoTable>;
 *
 * const Database = S.struct({
 *   todo: TodoTable,
 * });
 *
 * export const {
 *   useQuery,
 *   useMutation,
 *   useEvoluError,
 *   useOwner,
 *   useOwnerActions,
 * } = E.createHooks(Database);
 * ```
 *
 * There is one simple rule for local-first apps domain modeling:
 * After the initial release, models shall be append-only.
 *
 * Tables and columns shall not be removed because there is a possibility
 * that somebody is already using them. Column types shall be enriched only.
 *
 * With this simple rule, any app version can handle any schema version.
 * Evolu database is schemaless and doesn't have to be migrated when
 * a schema is changed. Migrations are not feasible for local-first apps.
 *
 * If an obsolete app gets a sync message with a newer schema, Evolu
 * automatically updates the database schema to store the message safely,
 * and `useQuery` filterMap helper will ignore unknown rows until
 * the app is updated.
 *
 * To learn more about migration-less schema evolving, check the `useQuery`
 * documentation.
 */
export const createHooks = <S extends DbSchema>(
  dbSchema: Schema<S>,
  config?: Partial<Config>
): Hooks<S> => {
  const evolu = createEvolu(dbSchema)({
    config: createConfig(config),
    createDbWorker,
  });
  const cache = new WeakMap<SqliteRow, OrNullOrFalse<SqliteRow>>();

  const useQuery: UseQuery<S> = (query, filterMap) => {
    const sqlQueryString = query
      ? pipe(query(kysely as never).compile() as SqlQuery, sqlQueryToString)
      : null;

    const queryRows = useSyncExternalStore(
      useMemo(() => evolu.subscribeQuery(sqlQueryString), [sqlQueryString]),
      evolu.getQuery(sqlQueryString),
      constNull
    );

    const filterMapRef = useRef(filterMap);

    const getRowFromCache = (row: SqliteRow): OrNullOrFalse<SqliteRow> => {
      let cachedRow = cache.get(row);
      if (cachedRow !== undefined) return cachedRow;
      cachedRow = filterMapRef.current(row as never);
      cache.set(row, cachedRow);
      return cachedRow;
    };

    const rows = useMemo(() => {
      if (queryRows == null) return null;
      const rows: Array<SqliteRow> = [];
      queryRows.forEach((queryRow) => {
        const row = getRowFromCache(queryRow);
        if (row) rows.push(row);
      });
      return rows;
    }, [queryRows]);

    return useMemo(
      () => ({
        rows: (rows || readonlyArray.empty) as never,
        row: ((rows && rows[0]) || null) as never,
        isLoaded: rows != null,
      }),
      [rows]
    );
  };

  const useMutation: UseMutation<S> = () =>
    useMemo(
      () => ({
        create: evolu.mutate as Create<S>,
        update: evolu.mutate as Update<S>,
      }),
      []
    );

  const useEvoluError: Hooks<S>["useEvoluError"] = () =>
    useSyncExternalStore(evolu.subscribeError, evolu.getError, constNull);

  const useOwner: Hooks<S>["useOwner"] = () =>
    useSyncExternalStore(evolu.subscribeOwner, evolu.getOwner, constNull);

  const useOwnerActions: Hooks<S>["useOwnerActions"] = () => evolu.ownerActions;

  return {
    useQuery,
    useMutation,
    useEvoluError,
    useOwner,
    useOwnerActions,
  };
};
