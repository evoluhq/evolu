/**
 * This file needs to be named .svelte.ts to be recognized by the Svelte
 * compiler in the app itself.
 */

import { emptyArray } from "@evolu/common";
import type {
  Evolu,
  EvoluDeps,
  EvoluSchema,
  Query,
  QueryRows,
  Row,
} from "@evolu/common/local-first";
import { createEvoluDeps } from "@evolu/web";

// Svelte's declaration generation loses createEvoluDeps' return type here.
// Keep the explicit public type so consumers do not receive any.
export const evoluSvelteDeps: EvoluDeps = /*#__PURE__*/ createEvoluDeps();

/**
 * Load and subscribe to the Query, and return an object with `rows` property
 * that are automatically updated when data changes. `rows` holds only rows of
 * the current query, so it is empty until that query loads and while there is
 * no query.
 *
 * ### Example
 *
 * ```ts
 * // Create your query
 * const allTodos = evolu.createQuery((db) =>
 *   db.selectFrom("todo").selectAll(),
 * );
 *
 * // Get all rows.
 * const allTodosState = queryState(evolu, () => allTodos);
 * ```
 *
 * ### Example
 *
 * ```ts
 * // some kind of state
 * let someKindOfState = $state("someId");
 *
 * // derive your query based other props
 * const allTodos = $derived(
 *   evolu.createQuery((db) =>
 *     db.selectFrom("todo").where("id", "=", someKindOfState).selectAll(),
 *   ),
 * );
 *
 * // Get all rows, once someKindOfState changes, this allTodosState will be updated with the evolu query result
 * const allTodosState = queryState(evolu, () => allTodos);
 *
 * // use allTodosState.rows in further calculations / UI
 * ```
 */
export const queryState = <R extends Row, Schema extends EvoluSchema>(
  evolu: Evolu<Schema>,
  /**
   * Can be a normal query or a derived query.
   *
   * Svelte reactivity: it needs to be a callback, if the query is $derived this
   * will re-trigger the load/subscription based on the new query.
   */
  observedQuery: () => Query<Schema, R> | undefined,
): { readonly rows: QueryRows<R> } => {
  {
    // Evolu replaces rows and never mutates them, so raw state keeps them
    // unproxied. Proxies would cost work and the identity of unchanged rows.
    let writableState: QueryRows<R> = $state.raw(emptyArray);

    $effect(() => {
      const query = observedQuery();

      if (!query) {
        writableState = emptyArray;
        return;
      }

      const updateRows = (): void => {
        writableState = evolu.getQueryRows(query);
      };

      // Rows come only from the store, never from a load result, because a
      // load of a previous query can resolve after the current query's rows.
      // The load stores the rows and notifies the subscription.
      void evolu.loadQuery(query);
      updateRows();

      return evolu.subscribeQuery(query)(updateRows);
    });

    return {
      // Svelte reactivity: it needs to be a getter
      get rows() {
        return writableState;
      },
    };
  }
};
