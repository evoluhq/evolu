import {
  Queries,
  QueryResultsFromQueries,
  QueryResultsPromisesFromQueries,
  Row,
} from "@evolu/common";
import { useRef } from "react";
import { use } from "./use.js";
import { useEvolu } from "./useEvolu.js";
import { useQuerySubscription } from "./useQuerySubscription.js";
import { useWasSSR } from "./useWasSSR.js";

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

    /** Reuse existing promises instead of loading so query will not suspense. */
    readonly promises: [
      ...QueryResultsPromisesFromQueries<Q>,
      ...QueryResultsPromisesFromQueries<OQ>,
    ];
  }> = {},
): [...QueryResultsFromQueries<Q>, ...QueryResultsFromQueries<OQ>] => {
  const evolu = useEvolu();
  const once = useRef(options).current.once;
  const allQueries = once ? queries.concat(once) : queries;
  const wasSSR = useWasSSR();
  if (wasSSR) {
    if (!options.promises) evolu.loadQueries(allQueries);
  } else {
    if (options.promises) options.promises.map(use);
    else evolu.loadQueries(allQueries).map(use);
  }
  return allQueries.map((query, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuerySubscription(query, { once: i > queries.length - 1 }),
  ) as never;
};
