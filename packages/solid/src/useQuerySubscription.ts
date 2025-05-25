import { constVoid } from "@evolu/common";
import { Query, QueryRows, Row } from "@evolu/common/evolu";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link Query} {@link QueryRows} changes. */
export const useQuerySubscription = <R extends Row>(
  query: Query<R>,
  options: Partial<{
    /**
     * Only subscribe and get the current value once. Subscribed query will not
     * trigger reactivity after a mutation.
     */
    readonly once: boolean;
  }> = {},
): (() => QueryRows<R>) => {
  const evolu = useEvolu();
  const [rows, setRows] = createSignal<QueryRows<R>>(evolu.getQueryRows(query));

  if (options.once) {
    createEffect(() => {
      const unsubscribe = evolu.subscribeQuery(query)(constVoid);
      onCleanup(unsubscribe);
    });
    return () => evolu.getQueryRows(query);
  }

  createEffect(() => {
    const unsubscribe = evolu.subscribeQuery(query)(() => {
      setRows(evolu.getQueryRows(query));
    });
    onCleanup(unsubscribe);
  });

  return rows;
};
