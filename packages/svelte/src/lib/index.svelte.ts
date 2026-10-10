/**
 * This file needs to be named .svelte.ts to be recognized by the Svelte
 * compiler in the app itself.
 */

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
 * that are automatically updated when data changes.
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
    let writableState: QueryRows<R> = $state.raw([]);

    const updateState = (rows: QueryRows<R>): void => {
      writableState = rows;
    };

    $effect(() => {
      const query = observedQuery();

      if (!query) {
        return;
      }

      // always setting the state on first load
      // for a) if the query changes we definitely need current content immediately
      // for b) if you sub/unsub in a very short time can cause the subscription not to trigger a callback
      // => this is also for HMR
      void evolu.loadQuery(query).then(updateState);

      return evolu.subscribeQuery(query)(() => {
        const rows = evolu.getQueryRows(query);

        updateState(rows);
      });
    });

    return {
      // Svelte reactivity: it needs to be a getter
      get rows() {
        return writableState;
      },
    };
  }
};
