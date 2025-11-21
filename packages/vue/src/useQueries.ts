import type {
  Queries,
  QueriesToQueryRowsPromises,
  Query,
  QueryRows,
  Row,
} from "@evolu/common/local-first";
import type { Ref } from "vue";
import { useQuery } from "./useQuery.js";

export type QueriesToQueryRowsRef<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? Ref<QueryRows<R>> : never;
};

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
      ...QueriesToQueryRowsPromises<Q>,
      ...QueriesToQueryRowsPromises<OQ>,
    ];
  }> = {},
): [...QueriesToQueryRowsRef<Q>, ...QueriesToQueryRowsRef<OQ>] => {
  const allQueries = options.once ? queries.concat(options.once) : queries;

  return allQueries.map((query, index) => {
    const promise = options.promises?.[index];
    const queryOptions = { once: index > queries.length - 1 };

    return useQuery(
      query,
      promise ? { ...queryOptions, promise } : queryOptions,
    );
  }) as never;
};
