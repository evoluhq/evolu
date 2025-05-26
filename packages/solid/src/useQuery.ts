import { Query, QueryRows, Row } from "@evolu/common/evolu";
import { createResource } from "solid-js";
import { useEvolu } from "./useEvolu.js";
import { useQuerySubscription } from "./useQuerySubscription.js";

/**
 * Load and subscribe to the Query, and return an object with `rows` and `row`
 * properties that are automatically updated when data changes.
 *
 * Note that {@link useQuery} uses Solid's createResource for suspense-like
 * behavior. It means every usage of {@link useQuery} blocks rendering until
 * loading is completed.
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
 * ```
 */
export const useQuery = <R extends Row>(
  query: Query<R>,
  options: Partial<{
    /** Without subscribing to changes. */
    readonly once: boolean;
  }> = {},
): (() => QueryRows<R>) => {
  const evolu = useEvolu();

  // Load the query data (triggers suspense)
  const [_data] = createResource(() => evolu.loadQuery(query));

  // Subscribe to changes
  const subscription = useQuerySubscription(query, options);

  // Return the subscription which will be reactive
  return subscription;
};
