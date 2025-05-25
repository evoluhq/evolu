import { Queries, QueriesToQueryRows, Row } from "@evolu/common/evolu";
import { createResource } from "solid-js";
import { useEvolu } from "./useEvolu.js";
import { useQuerySubscription } from "./useQuerySubscription.js";

/** The same as {@link useQuery}, but for many queries. */
export const useQueries = <
  R extends Row,
  Q extends Queries<R>,
  OQ extends Queries<R>,
>(
  queries: [...Q],
  options: Partial<{
    /** Queries that should be only loaded, not subscribed to. */
    readonly once: [...OQ];
  }> = {},
): [...QueriesToQueryRows<Q>, ...QueriesToQueryRows<OQ>] => {
  const evolu = useEvolu();
  const once = options.once ?? [];
  const allQueries = once.length > 0 ? queries.concat(once) : queries;

  // Load all queries (triggers suspense)
  const [_data] = createResource(() => evolu.loadQueries(allQueries));

  return allQueries.map((query, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuerySubscription(query, { once: i > queries.length - 1 }),
  ) as never;
};
