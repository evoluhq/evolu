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
 * When SQLite fails the query, the rows stay empty or show rows the query
 * loaded earlier in this Evolu instance, so they do not signal the failure.
 * Each failed load the composable awaits, including a cached failure, is
 * reported as an unhandled rejection. When SQLite fails a later refresh, the
 * rows keep their values, and nothing is reported.
 *
 * To start loading earlier, such as in a router guard, call `evolu.loadQuery`.
 * The composable then reads the same cached load.
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
 * // Prefetch the rows, for example in a router guard. useQuery then reads
 * // the same cached load.
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
  options: Partial<{
    /** Without subscribing to changes. */
    readonly once: boolean;
  }> = {},
): Readonly<Ref<QueryRows<R>>> => {
  const evolu = useEvolu();
  const rows = shallowRef(emptyArray as QueryRows<R>);

  void evolu.loadQuery(query).then((result) => {
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
