/**
 * This file needs to be named .svelte.ts to be recognized by the Svelte
 * compiler in the app itself.
 */

import { emptyArray } from "@evolu/common";
import type {
  Evolu,
  EvoluSchema,
  Query,
  QueryRows,
  Row,
} from "@evolu/common/local-first";
import { createEvoluDeps } from "@evolu/web";

export const evoluSvelteDeps = /*#__PURE__*/ createEvoluDeps();

/**
 * Loads and subscribes to the query that `observedQuery` returns, and returns
 * an object whose `rows` update when the data changes. `rows` holds only rows
 * of the current query, so it is empty until that query loads and while there
 * is no query.
 *
 * It creates an `$effect`, so call it where Svelte allows one, such as during
 * component initialization or inside `$effect.root`. The subscription ends when
 * that component or root is destroyed. When `observedQuery` reads reactive
 * state, such as a `$derived` query, `queryState` loads the new query whenever
 * it changes. Derive values from `rows` with `$derived`.
 *
 * ### Example
 *
 * Runes such as `$state` work only in Svelte components and `.svelte.ts` or
 * `.svelte.js` modules. A component calls `todoTitlesState` during its
 * initialization.
 *
 * ```ts
 * import {
 *   assertType,
 *   createQueryBuilder,
 *   sqliteTrue,
 *   testEvoluSchema,
 *   type Evolu,
 *   type NonEmptyTrimmedString100,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { queryState } from "@evolu/svelte";
 *
 * const createQuery = createQueryBuilder(testEvoluSchema);
 *
 * const todoTitlesState = (evolu: Evolu<TestEvoluSchema>) => {
 *   let showCompleted = $state(false);
 *
 *   const todosQuery = $derived(
 *     createQuery((db) =>
 *       db
 *         .selectFrom("todo")
 *         .select(["id", "title"])
 *         .where("isDeleted", "is not", sqliteTrue)
 *         .$if(!showCompleted, (qb) =>
 *           qb.where("isCompleted", "is not", sqliteTrue),
 *         ),
 *     ),
 *   );
 *   const todos = queryState(evolu, () => todosQuery);
 *   const titles = $derived(todos.rows.map((todo) => todo.title));
 *
 *   return {
 *     titles: () => titles,
 *     toggleCompleted: () => {
 *       showCompleted = !showCompleted;
 *     },
 *   };
 * };
 *
 * assertType<
 *   ReturnType<ReturnType<typeof todoTitlesState>["titles"]>,
 *   Array<NonEmptyTrimmedString100 | null>
 * >();
 * ```
 */
export const queryState = <R extends Row, Schema extends EvoluSchema>(
  evolu: Evolu<Schema>,
  observedQuery: () => Query<Schema, R> | undefined,
): { readonly rows: QueryRows<R> } => {
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
    // Each read of `rows` reads the state, so templates and effects track it.
    // A plain property would hold only the initial rows. A getter rather than
    // a function follows how Svelte exposes reactive state.
    get rows() {
      return writableState;
    },
  };
};
