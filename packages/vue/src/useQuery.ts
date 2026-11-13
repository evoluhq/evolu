import {
  assert,
  constVoid,
  emptyArray,
  type UnknownError,
} from "@evolu/common";
import {
  isDatabaseDeleted,
  type DeviceEvolu,
  type EvoluErrorDep,
  type EvoluSchema,
  type Query,
  type QueryRows,
  type Row,
} from "@evolu/common/local-first";
import { getCurrentScope, type Ref, shallowReadonly, shallowRef } from "vue";
import type { createEvoluBinding } from "./createEvoluBinding.ts";
import { isServerRendering } from "./isServerRendering.ts";
import { subscribeForScope } from "./subscribeForScope.ts";
import { useDeviceEvolu } from "./useDeviceEvolu.ts";
import type { useDeviceQueries, useQueries } from "./useQueries.ts";
import { useEvolu } from "./useEvolu.ts";

/**
 * Load and subscribe to the query, returning a ref that stays in sync with
 * Evolu changes.
 *
 * The rows are empty until the query loads, so to tell a loading query from an
 * empty one, an async setup under `<Suspense>` awaits {@link waitForRows}. When
 * SQLite fails the query, the rows stay empty or show rows the query loaded
 * earlier in this Evolu instance, so they do not signal the failure;
 * {@link waitForRows} rejects with it. A failed load that no {@link waitForRows}
 * awaits, also a cached failure, is reported as an unhandled rejection. When
 * SQLite fails a later refresh, the rows keep their values, and nothing is
 * reported.
 *
 * To start loading earlier, such as in a router guard, call `evolu.loadQuery`.
 * The composable then reuses that load unless a mutation or sync drops it
 * first.
 *
 * During server rendering, it only loads the query, so the rows are empty, as
 * on the client before the query loads. Server rendering starts when the server
 * renderer does, so a call on the server before that, such as from a store that
 * a router guard uses first, subscribes as on the client.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertType,
 *   createQueryBuilder,
 *   testEvoluSchema,
 *   type Evolu,
 *   type QueryRows,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { useQuery } from "@evolu/vue";
 *
 * const createQuery = createQueryBuilder(testEvoluSchema);
 * const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
 *
 * // Call composables in component setup.
 * const useTodos = () => useQuery(allTodos);
 *
 * // Load the rows without subscribing to changes.
 * const useTodosOnce = () => useQuery(allTodos, { once: true });
 *
 * // Prefetch the rows, for example in a router guard. useQuery then reuses
 * // that load unless a mutation or sync drops it first.
 * const prefetchTodos = (evolu: Evolu<TestEvoluSchema>) =>
 *   evolu.loadQuery(allTodos);
 *
 * type TodoRows = QueryRows<typeof allTodos.Row>;
 * assertType<
 *   [
 *     ReturnType<typeof useTodos>["value"],
 *     ReturnType<typeof useTodosOnce>["value"],
 *     ReturnType<typeof prefetchTodos>,
 *   ],
 *   [TodoRows, TodoRows, Promise<TodoRows>]
 * >();
 * ```
 */
export const useQuery = <S extends EvoluSchema, R extends Row>(
  query: Query<S, R>,
  { once = false }: UseQueryOptions = {},
): Readonly<Ref<QueryRows<R>>> => useQueryOf(useEvolu(), query, once);

/** Options of {@link useQuery} and {@link useDeviceQuery}. */
export interface UseQueryOptions {
  /** Without subscribing to changes. */
  readonly once?: boolean;
}

/**
 * The same as {@link useQuery}, for a query of the app's device tables, read
 * from {@link useDeviceEvolu}, so {@link waitForRows} takes its rows too.
 * {@link createEvoluBinding} returns it typed with the app's device schema.
 */
export const useDeviceQuery = <S extends EvoluSchema, R extends Row>(
  query: Query<S, R>,
  { once = false }: UseQueryOptions = {},
): Readonly<Ref<QueryRows<R>>> => useQueryOf(useDeviceEvolu(), query, once);

/**
 * Waits for the first load of each query whose rows {@link useQuery},
 * {@link useQueries}, {@link useDeviceQuery}, or {@link useDeviceQueries}
 * returned, so an async setup under `<Suspense>` renders once they loaded, and
 * `<Suspense>` shows its fallback meanwhile. Call the composables before
 * awaiting it, because a composable can't run after an `await` in `setup()`.
 *
 * It rejects with the {@link UnknownError} of the first load SQLite fails, so
 * the error reaches `onErrorCaptured` of a component above, and it's not also
 * reported as an unhandled rejection. A later refresh, also one SQLite fails,
 * changes nothing it waited for. It stays pending for rows of an instance whose
 * database's deletion, or its AppOwner's removal, disposed it, as React's
 * `useQuery` stays suspended until the app replaces the instance, and while a
 * refused database answers no load, until the instance's disposal resolves the
 * load with no rows. Observe {@link EvoluErrorDep.evoluError} to show the
 * refusal. Rows that none of these composables returned are a defect, so it
 * throws.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertType,
 *   createQueryBuilder,
 *   testEvoluSchema,
 *   type QueryRows,
 * } from "@evolu/common";
 * import { useQueries, useQuery, waitForRows } from "@evolu/vue";
 * import type { Ref } from "vue";
 *
 * const createQuery = createQueryBuilder(testEvoluSchema);
 * const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
 * const allProjects = createQuery((db) =>
 *   db.selectFrom("project").selectAll(),
 * );
 *
 * // An async setup of a component under <Suspense>.
 * const setup = async () => {
 *   // oxlint-disable-next-line react/rules-of-hooks -- Composables run before the await.
 *   const todos = useQuery(allTodos);
 *   // oxlint-disable-next-line react/rules-of-hooks -- Composables run before the await.
 *   const [projects] = useQueries([allProjects]);
 *   // A failure reaches onErrorCaptured of a component above.
 *   await waitForRows(todos, projects);
 *   return { todos, projects };
 * };
 *
 * assertType<
 *   Awaited<ReturnType<typeof setup>>["todos"],
 *   Readonly<Ref<QueryRows<typeof allTodos.Row>>>
 * >();
 * ```
 */
export const waitForRows = (
  ...rows: ReadonlyArray<Readonly<Ref<QueryRows>>>
): Promise<void> =>
  Promise.all(
    rows.map((ref) => {
      const load = loadsByRows.get(ref);
      assert(
        load,
        "waitForRows takes only rows that useQuery, useQueries, useDeviceQuery, or useDeviceQueries returned.",
      );
      return load;
    }),
  ).then(constVoid);

/** The query composable over an instance, an AppOwner's or the device's. */
const useQueryOf = <S extends EvoluSchema, R extends Row>(
  evolu: DeviceEvolu<EvoluSchema>,
  query: Query<S, R>,
  once: boolean,
): Readonly<Ref<QueryRows<R>>> => {
  const rows = shallowRef(emptyArray as QueryRows<R>);
  const readonlyRows = shallowReadonly(rows);

  // A disposed instance's methods throw, so a component shows no rows when the
  // deletion of its database or the removal of its AppOwner disposed it, and
  // when its scope stopped before the call, such as of a component that
  // unmounted while its async setup awaited, as the app may have disposed the
  // instance meanwhile. Its load never settles, as React's useQuery stays
  // suspended, so waitForRows waits until the app replaces the component.
  if (isDatabaseDeleted(evolu) || getCurrentScope()?.active === false) {
    loadsByRows.set(readonlyRows, new Promise(constVoid));
    return readonlyRows;
  }

  // The load never overwrites newer rows or brings back a deleted database's:
  // it settles in the handler of a worker's message, which the web's
  // MessageChannel delivers as a task, so this microtask runs before any later
  // OnPatchesByQuery or OnDatabaseDeleted, and OnDatabaseDeleted drops the
  // pending loads without settling them. Its failure rejects only the promise
  // waitForRows awaits, so a failure no waitForRows awaits is reported once,
  // as an unhandled rejection.
  loadsByRows.set(
    readonlyRows,
    evolu.loadQuery(query).then((result) => {
      rows.value = result;
    }),
  );

  if (!once && !isServerRendering())
    subscribeForScope(() =>
      evolu.subscribeQuery(query)(() => {
        rows.value = evolu.getQueryRows(query);
      }),
    );

  return readonlyRows;
};

// The first load of the rows each query composable returned.
const loadsByRows = /*#__PURE__*/ new WeakMap<object, Promise<void>>();
