import {
  Query,
  QueryResult,
  Row,
  emptyRows,
  queryResultFromRows,
} from "@evolu/common";
import { constVoid } from "effect/Function";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link Query} {@link QueryResult} changes. */
export const useQuerySubscription = <R extends Row>(
  query: Query<R>,
  options: Partial<{
    /**
     * Just subscribe and get the current value once. Subscribed query will not
     * invoke React Suspense after a mutation.
     */
    readonly once: boolean;
  }> = {},
): QueryResult<R> => {
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
    return evolu.getQuery(query);
  }
  return useSyncExternalStore(
    useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
    useMemo(() => () => evolu.getQuery(query), [evolu, query]),
    () => queryResultFromRows(emptyRows()),
    /* eslint-enable react-hooks/rules-of-hooks */
  );
};
