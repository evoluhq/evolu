/**
 * This file needs to be named .svelte.ts to be recognized by the Svelte
 * compiler in the app itself.
 */

import type {
  AppOwner,
  Evolu,
  EvoluSchema,
  InferRow,
  Query,
  QueryRows,
  Row,
} from "@evolu/common/local-first";
import { createEvoluDeps } from "@evolu/web";

// just in case we need to add some svelte specific deps
export const evoluSvelteDeps = createEvoluDeps();

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
 * Get the {@link AppOwner} promise that resolves when available.
 *
 * ### Example
 *
 * ```ts
 * import { appOwnerState } from "@evolu/svelte";
 *
 * const owner = appOwnerState(evolu);
 *
 * // use owner.current in your Svelte templates
 * // it will be undefined initially and set once the promise resolves
 * ```
 */
export function appOwnerState<Schema extends EvoluSchema>(
  evolu: Evolu<Schema>,
): {
  readonly current: AppOwner | undefined;
} {
  {
    // writing to this variable - svelte's compiler will track it
    let writableState = $state<AppOwner | undefined>(undefined);

    $effect(() => {
      void evolu.appOwner.then((appOwner) => {
        writableState = appOwner;
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
