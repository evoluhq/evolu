import type { Accessor } from "solid-js";
import {
  Query,
  QueryResult,
  Row,
  emptyRows,
  queryResultFromRows,
} from "@evolu/common";
import * as Function from "effect/Function";
// import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";
import { createEffect, createMemo, createSignal } from "solid-js";
import { useSyncExternalStore } from "./useSyncExternalStore.js";

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
): Accessor<QueryResult<R>> => {
  const evolu = useEvolu();
  if (options.once) {
    createEffect(
      // No useSyncExternalStore, no unnecessary updates.
      () => evolu.subscribeQuery(query)(Function.constVoid)
    );
    return () => evolu.getQuery(query);
  }
  return useSyncExternalStore(
    () => () => evolu.subscribeQuery(query),
    () => queryResultFromRows(emptyRows()),
  );
};
