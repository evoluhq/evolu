import { emptyArray } from "@evolu/common";
import {
  type EvoluSchema,
  type Query,
  type QueryRows,
  type Row,
} from "@evolu/common/local-first";
import { onScopeDispose, type Ref, shallowReadonly, shallowRef } from "vue";
import { isServerRendering } from "./isServerRendering.ts";
import { useEvolu } from "./useEvolu.ts";

/**
 * Load and subscribe to the query, returning a ref that stays in sync with
 * Evolu changes.
 *
 * During server rendering, it only loads the query, so the rows are empty, as
 * on the client before the query loads. Server rendering starts when the server
 * renderer does, so a call on the server before that, such as from a store that
 * a router guard uses first, subscribes as on the client.
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
 *
 * // Use prefetched rows.
 * const rows = useQuery(allTodos, { promise: allTodosPromise });
 * ```
 */
export const useQuery = <S extends EvoluSchema, R extends Row>(
  query: Query<S, R>,
  options: Partial<{
    /** Without subscribing to changes. */
    readonly once: boolean;
    /** Reuse existing promise instead of loading so query will not suspense. */
    readonly promise: Promise<QueryRows<R>>;
  }> = {},
): Readonly<Ref<QueryRows<R>>> => {
  const evolu = useEvolu();
  const rows = shallowRef(emptyArray as QueryRows<R>);

  void (options.promise ?? evolu.loadQuery(query)).then((result) => {
    rows.value = result;
  });

  if (!options.once && !isServerRendering()) {
    const unsubscribe = evolu.subscribeQuery(query)(() => {
      rows.value = evolu.getQueryRows(query);
    });

    onScopeDispose(unsubscribe);
  }

  return shallowReadonly(rows);
};
