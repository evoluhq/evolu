import { constVoid } from "@evolu/common";
import {
  type Query,
  type QueryRows,
  type Row,
  emptyRows,
} from "@evolu/common/local-first";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link Query} {@link QueryRows} changes. */
export const useQuerySubscription = <R extends Row>(
  query: Query<R>,
  options: Partial<{
    /**
     * Only subscribe and get the current value once. Subscribed query will not
     * invoke React Suspense after a mutation.
     */
    readonly once: boolean;
  }> = {},
): QueryRows<R> => {
  const evolu = useEvolu();

  // useRef to not break "rules-of-hooks"
  const { once } = useRef(options).current;

  if (once) {
    /* eslint-disable react-hooks/rules-of-hooks */
    useEffect(
      // No useSyncExternalStore, no unnecessary updates.
      () => evolu.subscribeQuery(query)(constVoid),
      [evolu, query],
    );
    return evolu.getQueryRows(query);
  }

  return useSyncExternalStore(
    useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
    useMemo(() => () => evolu.getQueryRows(query), [evolu, query]),
    () => emptyRows as QueryRows<R>,
    /* eslint-enable react-hooks/rules-of-hooks */
  );
};
