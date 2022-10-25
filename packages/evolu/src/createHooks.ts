import { readonlyArray } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { useEffect, useSyncExternalStore } from "react";
import * as db from "./db.js";
import { kysely } from "./kysely.js";
import { DbSchema, sqlQueryToString, UseMutation, UseQuery } from "./types.js";

/**
 * Create `useQuery` and `useMutation` React Hooks for a given DB schema.
 *
 * @example
 * const { useQuery, useMutation } = createHooks({
 *   todo: {
 *     id: TodoId,
 *     title: model.NonEmptyString1000,
 *     isCompleted: model.SqliteBoolean,
 *   },
 * });
 */
export const createHooks = <S extends DbSchema>(
  dbSchema: S
): {
  readonly useQuery: UseQuery<S>;
  readonly useMutation: UseMutation<S>;
} => {
  db.updateDbSchema(dbSchema)();

  const useQuery: UseQuery<S> = (query) => {
    const sqlQueryString = query
      ? pipe(query(kysely as never).compile(), sqlQueryToString)
      : null;

    const rows = useSyncExternalStore(
      db.listen,
      () => db.getSubscribedQueryRows(sqlQueryString) as never,
      () => null
    );

    useEffect(() => {
      if (!sqlQueryString) return;
      return db.subscribeQuery(sqlQueryString);
    }, [sqlQueryString]);

    return {
      rows: rows || readonlyArray.empty,
      row: (rows && rows[0]) || null,
      isLoaded: rows != null,
    };
  };

  const mutate = db.createMutate<S>();
  const useMutation: UseMutation<S> = () => ({
    mutate,
  });

  return {
    useQuery,
    useMutation,
  };
};
