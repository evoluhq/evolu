import { constNull, pipe } from "@effect/data/Function";
import * as Option from "@effect/data/Option";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Schema from "@effect/schema/Schema";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { Config, createConfig } from "./config.js";
import { createDbWorker } from "./createDbWorker.js";
import { createEvolu } from "./createEvolu.js";
import { kysely } from "./kysely.js";
import {
  Create,
  DbSchema,
  Hooks,
  Query,
  Row,
  Update,
  UseMutation,
  UseQuery,
  queryToString,
} from "./types.js";

// https://github.com/microsoft/TypeScript/issues/42873
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Brand } from "@effect/data/Brand";

/**
 * `createHooks` defines the database schema and returns React Hooks.
 * Evolu uses [Schema](https://github.com/effect-ts/schema) for domain modeling.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * const TodoId = Evolu.id("Todo");
 * type TodoId = Schema.To<typeof TodoId>;
 *
 * const TodoTable = Schema.struct({
 *   id: TodoId,
 *   title: Evolu.NonEmptyString1000,
 *   isCompleted: Evolu.SqliteBoolean,
 * });
 * type TodoTable = Schema.To<typeof TodoTable>;
 *
 * const Database = Schema.struct({
 *   todo: TodoTable,
 * });
 *
 * export const {
 *   useQuery,
 *   useMutation,
 *   useEvoluError,
 *   useOwner,
 *   useOwnerActions,
 * } = Evolu.createHooks(Database);
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
  dbSchema: Schema.Schema<From, To>,
  config?: Partial<Config>
): Hooks<To> => {
  const evolu = createEvolu(dbSchema)({
    config: createConfig(config),
    createDbWorker,
  });
  const cache = new WeakMap<Row, Option.Option<Row>>();

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

    const filterMapRow = (row: Row): Option.Option<Row> => {
      let cachedRow = cache.get(row);
      if (cachedRow !== undefined) return cachedRow;
      cachedRow = pipe(filterMapRef.current(row as never), (row) =>
        row ? Option.some(row) : Option.none
      ) as never;
      cache.set(row, cachedRow);
      return cachedRow;
    };

    const rows = useMemo(
      () =>
        pipe(
          rowsWithLoadingState?.rows,
          Option.fromNullable,
          Option.map(ReadonlyArray.filterMap(filterMapRow)),
          Option.getOrNull
        ),
      [rowsWithLoadingState?.rows]
    );

    return useMemo(
      () => ({
        rows: (rows || []) as never,
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
