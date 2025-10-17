/**
 * This file needs to be named .svelte.ts to be recognized by the Svelte
 * compiler in the app itself.
 */

import {evoluWebDeps} from "@evolu/web";
import {
  type AppOwner,
  type Evolu,
  type EvoluDeps,
  type EvoluSchema,
  type InferRow,
  type Query,
  type QueryRows,
  type Row,
} from "@evolu/common/evolu";

// just in case we need to add some svelte specific deps
export const evoluSvelteDeps: EvoluDeps = {
  ...evoluWebDeps,
};

/**
 * Load and subscribe to the Query, and return an object with `rows` property
 * that are automatically updated when data changes.
 *
 * ### Example
 *
 * ```ts
 * // Create your query
 * const allTodos = evolu.createQuery((db) => ...);
 *
 * // Get all rows.
 * const allTodosState = queryState(evolu, () => allTodos);
 * ```
 *
 * ### Example
 *
 * ```ts
 * // some kind of state
 * let someKindOfState = $state('someId');
 *
 * // derive your query based other props
 * const allTodos = $derived(evolu.createQuery((db) => use someKindOfState here ));
 *
 * // Get all rows, once someKindOfState changes, this allTodosState will be updated with the evolu query result
 * const allTodosState = queryState(evolu, () => allTodos);
 *
 * // use allTodosState.rows in further calculations / UI
 * ```
 */
export function queryState<
  R extends Row,
  Schema extends EvoluSchema,
  MappedRow = InferRow<Query<R>>,
>(
  evolu: Evolu<Schema>,
  /**
   * Can be a normal query or a derived query.
   *
   * Svelte reactivity: it needs to be a callback, if the query is $derived this
   * will re-trigger the load/subscription based on the new query.
   */
  observedQuery: () => Query<R> | undefined,
  options?: {
    /**
     * This is a little helper so that you can map the results instead of using
     * a $derive operation.
     *
     * @param row
     */
    mapping?: (row: R) => MappedRow;
  },
): { readonly rows: Array<MappedRow> } {
  {
    // writing to this variable - svelte's compiler will track it
    let writableState: Array<MappedRow> = $state([]);

    function updateState(rows: QueryRows<R>): void {
      if (options?.mapping) {
        // re-assigning because somehow typescript thinks its still nullable here
        // remove again once no issue anymore
        const mapper = options.mapping;
        writableState = rows.map((row) => mapper(row));
      }

      writableState = rows as Array<MappedRow>;
    }

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
}

/**
 * Load and subscribe to the current AppOwner, and return an object with `current` property
 * that are automatically updated when the appOwner changes.
 *
 * ### Example
 *
 * ```ts
 * import { appOwnerState } from "@evolu/svelte";
 *
 * const owner = appOwnerState(evolu);
 *
 * // use owner.current to get the always up-to-date AppOwner,
 * // so when you restore it owner.current will be updated immediately
 * ```

 */
export function appOwnerState(
  evolu: Evolu,
): { readonly current: AppOwner | null } {
  {
    // writing to this variable - svelte's compiler will track it
    let writableState: AppOwner | null = $state(null);

    function updateState(appOwner: AppOwner | null): void {
      writableState = appOwner;
    }

    const initialAppOwner = evolu.getAppOwner();
    updateState(initialAppOwner);

    $effect(() => {
      return evolu.subscribeAppOwner(() => {
        updateState(evolu.getAppOwner());
      });
    });

    return {
      // Svelte reactivity: it needs to be a getter
      get current() {
        return writableState;
      },
    };
  }
}
