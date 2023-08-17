import { Context, Layer } from "effect";
import { Query } from "./Sqlite.js";

export type SubscribedQueries = Map<Query, number>;

export const SubscribedQueries = Context.Tag<SubscribedQueries>(
  "evolu/SubscribedQueries",
);

export const SubscribedQueriesLive = Layer.succeed(
  SubscribedQueries,
  SubscribedQueries.of(new Map()),
);
