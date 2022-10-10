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

    const rows = useSyncExternalStore<readonly never[]>(
      db.listen,
      () => db.getSubscribedQueryRows(sqlQueryString) as never,
      () => readonlyArray.empty
    );

    useEffect(() => {
      if (!sqlQueryString) return;
      return db.subscribeQuery(sqlQueryString);
    }, [sqlQueryString]);

    return {
      rows,
      row: rows[0] || null,
    };
  };

  const useMutation: UseMutation<S> = () => ({
    mutate: db.createMutate<S>(),
  });

  return {
    useQuery,
    useMutation,
  };
};
