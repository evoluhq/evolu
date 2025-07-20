import { Query, QueryRows, Row, emptyRows } from "@evolu/common/evolu";
import { useEvolu } from "./useEvolu.js";
import { onScopeDispose, Ref, shallowReadonly, shallowRef } from "vue";

/**
 * Load and subscribe to the Query, and return an object with `rows` and `row`
 * properties that are automatically updated when data changes.
 *
 * Note that {@link useQuery} uses React Suspense. It means every usage of
 * {@link useQuery} blocks rendering until loading is completed. To avoid loading
 * waterfall with more queries, use {@link useQueries}.
 *
 * ### Example
 *
 * ```ts
 * // Get all rows.
 * const rows = useQuery(allTodos);
 *
 * // Get rows for a specific todo (the first row can be null).
 * const rows = useQuery(todoById(1));
 *
 * // Get all rows, but without subscribing to changes.
 * const rows = useQuery(allTodos, { once: true });
 *
 * // Prefetch rows.
 * const allTodos = evolu.createQuery((db) =>
 *   db.selectFrom("todo").selectAll(),
 * );
 * const allTodosPromise = evolu.loadQuery(allTodos);
 * // Use prefetched rows.
 * const rows = useQuery(allTodos, { promise: allTodosPromise });
 * ```
 */
export const useQuery = <R extends Row>(
  query: Query<R>,
  options: Partial<{
    /** Without subscribing to changes. */
    readonly once: boolean;

    /** Reuse existing promise instead of loading so query will not suspense. */
    readonly promise: Promise<QueryRows<R>>;
  }> = {},
): Readonly<Ref<QueryRows<R>>> => {
  const evolu = useEvolu();

  const rows = shallowRef(emptyRows as QueryRows<R>);

  // TODO: this had suspense before. Vue's is in beta and not stable yet. Should we add it back?
  //       https://vuejs.org/guide/built-ins/suspense
  void (options.promise ?? evolu.loadQuery(query)).then((result) => {
    rows.value = result;
  });

  if (!options.once) {
    const unsubscribe = evolu.subscribeQuery(query)(() => {
      rows.value = evolu.getQueryRows(query);
    });

    onScopeDispose(() => {
      unsubscribe();
    });
  }

  return shallowReadonly(rows);
};
