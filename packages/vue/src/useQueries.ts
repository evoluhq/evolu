import type {
  EvoluSchema,
  Queries,
  Query,
  QueryRows,
} from "@evolu/common/local-first";
import type { Ref } from "vue";
import { useQuery } from "./useQuery.ts";

export type QueriesToQueryRowsRef<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<any, infer R> ? Ref<QueryRows<R>> : never;
};

/** The same as {@link useQuery}, but for many queries. */
export const useQueries = <
  S extends EvoluSchema,
  Q extends Queries<S>,
  OQ extends Queries<S>,
>(
  queries: [...Q],
  options: Partial<{
    /** Queries that should be only loaded, not subscribed to. */
    readonly once: [...OQ];
  }> = {},
): [...QueriesToQueryRowsRef<Q>, ...QueriesToQueryRowsRef<OQ>] => {
  const allQueries = options.once ? queries.concat(options.once) : queries;

  return allQueries.map((query, index) =>
    // oxlint-disable-next-line react/rules-of-hooks -- useQuery is a Vue composable and the query order must remain stable.
    useQuery(query, { once: index > queries.length - 1 }),
  ) as never;
};
