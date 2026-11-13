import type {
  EvoluSchema,
  Queries,
  Query,
  QueryRows,
} from "@evolu/common/local-first";
import type { Ref } from "vue";
import type { createEvoluBinding } from "./createEvoluBinding.ts";
import { useDeviceQuery, useQuery, type waitForRows } from "./useQuery.ts";

export type QueriesToQueryRowsRef<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<any, infer R>
    ? Readonly<Ref<QueryRows<R>>>
    : never;
};

/**
 * The same as {@link useQuery}, but for many queries. {@link waitForRows} takes
 * the rows it returns, such as `await waitForRows(...rows)`.
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
 * import { useQueries } from "@evolu/vue";
 * import type { Ref } from "vue";
 *
 * const createQuery = createQueryBuilder(testEvoluSchema);
 * const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
 * const allProjects = createQuery((db) =>
 *   db.selectFrom("project").selectAll(),
 * );
 *
 * // Call composables in component setup. The rows of the once queries come
 * // last.
 * const useTodosAndProjects = () =>
 *   useQueries([allTodos], { once: [allProjects] });
 *
 * assertType<
 *   ReturnType<typeof useTodosAndProjects>,
 *   [
 *     Readonly<Ref<QueryRows<typeof allTodos.Row>>>,
 *     Readonly<Ref<QueryRows<typeof allProjects.Row>>>,
 *   ]
 * >();
 * ```
 */
export const useQueries = <
  S extends EvoluSchema,
  Q extends Queries<S>,
  OQ extends Queries<S>,
>(
  queries: [...Q],
  { once }: UseQueriesOptions<OQ> = {},
): [...QueriesToQueryRowsRef<Q>, ...QueriesToQueryRowsRef<OQ>] =>
  useQueriesWith(useQuery, queries, once) as never;

/** Options of {@link useQueries} and {@link useDeviceQueries}. */
export interface UseQueriesOptions<OQ extends Queries> {
  /** Queries that are only loaded, not subscribed to. */
  readonly once?: [...OQ];
}

/**
 * The same as {@link useDeviceQuery}, but for many queries.
 * {@link createEvoluBinding} returns it typed with the app's device schema.
 */
export const useDeviceQueries = <
  S extends EvoluSchema,
  Q extends Queries<S>,
  OQ extends Queries<S>,
>(
  queries: [...Q],
  { once }: UseQueriesOptions<OQ> = {},
): [...QueriesToQueryRowsRef<Q>, ...QueriesToQueryRowsRef<OQ>] =>
  useQueriesWith(useDeviceQuery, queries, once) as never;

const useQueriesWith = (
  useOneQuery: typeof useQuery,
  queries: ReadonlyArray<Query<any, any>>,
  once: ReadonlyArray<Query<any, any>> | undefined,
): Array<Readonly<Ref<QueryRows>>> => {
  const allQueries = once ? queries.concat(once) : queries;

  return allQueries.map((query, index) =>
    // oxlint-disable-next-line react/rules-of-hooks -- useQuery is a Vue composable and the query order must remain stable.
    useOneQuery(query, { once: index > queries.length - 1 }),
  );
};
