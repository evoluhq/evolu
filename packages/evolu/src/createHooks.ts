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
  NullableOrFalse,
  SqliteRow,
  SqlQuery,
  sqlQueryToString,
  Update,
  UseMutation,
  UseQuery,
} from "./types.js";

/**
 * Create React Hooks for a given DB schema.
 *
 * @example
 * const {
 *   useQuery,
 *   useMutation,
 *   useOwner
 * } = createHooks({
 *   todo: { columns: ['id', 'title', 'isCompleted'], indexes: ['title'] },
 * });
 */
export const createHooks = <S extends DbSchema>(
  dbSchema: Schema<S>,
  config?: Partial<Config>
): Hooks<S> => {
  const evolu = createEvolu(dbSchema)({
    config: createConfig(config),
    createDbWorker,
  });
  const cache = new WeakMap<SqliteRow, NullableOrFalse<SqliteRow>>();

  const useQuery: UseQuery<S> = (query, initialFilterMap) => {
    const sqlQueryString = query
      ? pipe(query(kysely as never).compile() as SqlQuery, sqlQueryToString)
      : null;

    const queryRows = useSyncExternalStore(
      useMemo(() => evolu.subscribeQuery(sqlQueryString), [sqlQueryString]),
      evolu.getQuery(sqlQueryString),
      constNull
    );

    const filterMapRef = useRef(initialFilterMap);

    const getRowFromCache = (row: SqliteRow): NullableOrFalse<SqliteRow> => {
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
