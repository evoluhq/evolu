import * as S from "@effect/schema/Schema";
import { option, readonlyArray } from "fp-ts";
import { constNull, pipe } from "fp-ts/lib/function.js";
import { Option } from "fp-ts/Option";
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
  Query,
  queryToString,
  Row,
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
 * import * as S from "@effect/schema/Schema";
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
export const createHooks = <From, To extends DbSchema>(
  dbSchema: S.Schema<From, To>,
  config?: Partial<Config>
): Hooks<To> => {
  const evolu = createEvolu(dbSchema)({
    config: createConfig(config),
    createDbWorker,
  });
  const cache = new WeakMap<Row, Option<Row>>();

  const useQuery: UseQuery<To> = (query, filterMap) => {
    // `query` can and will change, compile() is cheap
    const queryString = query
      ? pipe(query(kysely as never).compile() as Query, queryToString)
      : null;
    // filterMap is expensive but must be static, hence useRef
    const filterMapRef = useRef(filterMap);

    const rowsWithLoadingState = useSyncExternalStore(
      useMemo(
        // Can't be IO, it's not compatible with eslint-plugin-react-hooks
        () => evolu.subscribeRowsWithLoadingState(queryString),
        [queryString]
      ),
      evolu.getRowsWithLoadingState(queryString),
      constNull
    );

    const filterMapRow = (row: Row): Option<Row> => {
      let cachedRow = cache.get(row);
      if (cachedRow !== undefined) return cachedRow;
      cachedRow = pipe(filterMapRef.current(row as never), (row) =>
        row ? option.some(row) : option.none
      );
      cache.set(row, cachedRow);
      return cachedRow;
    };

    const rows = useMemo(
      () =>
        pipe(
          rowsWithLoadingState?.rows,
          option.fromNullable,
          option.map(readonlyArray.filterMap(filterMapRow)),
          option.toNullable
        ),
      [rowsWithLoadingState?.rows]
    );

    return useMemo(
      () => ({
        rows: (rows || readonlyArray.empty) as never,
        row: ((rows && rows[0]) || null) as never,
        isLoaded: rows != null,
        isLoading: rowsWithLoadingState ? rowsWithLoadingState.isLoading : true,
      }),
      [rows, rowsWithLoadingState]
    );
  };

  const useMutation: UseMutation<To> = () =>
    useMemo(
      () => ({
        create: evolu.mutate as Create<To>,
        update: evolu.mutate as Update<To>,
      }),
      []
    );

  const useEvoluError: Hooks<To>["useEvoluError"] = () =>
    useSyncExternalStore(evolu.subscribeError, evolu.getError, constNull);

  const useOwner: Hooks<To>["useOwner"] = () =>
    useSyncExternalStore(evolu.subscribeOwner, evolu.getOwner, constNull);

  const useOwnerActions: Hooks<To>["useOwnerActions"] = () =>
    evolu.ownerActions;

  return {
    useQuery,
    useMutation,
    useEvoluError,
    useOwner,
    useOwnerActions,
  };
};
