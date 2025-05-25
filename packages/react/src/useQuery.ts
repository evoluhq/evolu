import { Query, QueryRows, Row } from "@evolu/common/evolu";
import { use } from "react";
import { useEvolu } from "./useEvolu.js";
import type { useQueries } from "./useQueries.js";
import { useQuerySubscription } from "./useQuerySubscription.js";
import { useWasSSR } from "./useWasSSR.js";

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
 * // Get the first row (it can be null).
 * const row = useQuery(todoById(1));
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
): QueryRows<R> => {
  const evolu = useEvolu();
  const wasSSR = useWasSSR();
  if (wasSSR) {
    if (!options.promise) void evolu.loadQuery(query);
  } else {
    use(options.promise ?? evolu.loadQuery(query));
  }
  return useQuerySubscription(query, options);
};
