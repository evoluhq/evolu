import {
  Queries,
  QueriesToQueryRows,
  QueriesToQueryRowsPromises,
  Row,
} from "@evolu/common/local-first";
import { use, useRef } from "react";
import { useEvolu } from "./useEvolu.js";
import type { useQuery } from "./useQuery.js";
import { useQuerySubscription } from "./useQuerySubscription.js";
import { useIsSsr } from "./useIsSsr.js";

/**
 * The same as {@link useQuery}, but for many queries.
 *
 * The number of queries must remain stable across renders.
 */
export const useQueries = <
  R extends Row,
  Q extends Queries<R>,
  OQ extends Queries<R>,
>(
  queries: [...Q],
  options: Partial<{
    /** Queries that should be only loaded, not subscribed to. */
    readonly once: [...OQ];

    /** Reuse existing promises instead of loading so query will not suspense. */
    readonly promises: [
      ...QueriesToQueryRowsPromises<Q>,
      ...QueriesToQueryRowsPromises<OQ>,
    ];
  }> = {},
): [...QueriesToQueryRows<Q>, ...QueriesToQueryRows<OQ>] => {
  const evolu = useEvolu();
  const once = useRef(options).current.once;
  const allQueries = once ? queries.concat(once) : queries;
  const wasSSR = useIsSsr();
  if (wasSSR) {
    if (!options.promises) void evolu.loadQueries(allQueries);
  } else {
    if (options.promises) options.promises.map(use);
    // No waterfall: loadQuery batches all queries in the same microtask,
    // so React suspends once and all promises resolve together.
    else evolu.loadQueries(allQueries).map(use);
  }
  return allQueries.map((query, i) =>
    // Safe until the number of queries is stable.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuerySubscription(query, { once: i > queries.length - 1 }),
  ) as never;
};
