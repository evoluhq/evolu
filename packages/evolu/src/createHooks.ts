import { readonlyArray } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { useEffect, useSyncExternalStore } from "react";
import * as db from "./db.js";
import { kysely } from "./kysely.js";
import { DbSchema, Mutate, Query, sqlQueryToString } from "./types.js";

/**
 * Define database schema and create `useQuery` and `useMutation` React Hooks.
 */
export const createHooks =
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  <S extends DbSchema>(dbSchema: S) => {
    db.updateDbSchema(dbSchema)();

    const useQuery = <T>(
      query: Query<S, T> | null | false
    ): {
      readonly rows: readonly T[];
      readonly row: T | null;
    } => {
      const sqlQueryString = query
        ? pipe(query(kysely as never).compile(), sqlQueryToString)
        : null;

      const rows = useSyncExternalStore<readonly T[]>(
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

    const mutate = db.createMutate<S>();

    const useMutation = (): { readonly mutate: Mutate<S> } => {
      return { mutate };
    };

    return {
      useQuery,
      useMutation,
    };
  };
