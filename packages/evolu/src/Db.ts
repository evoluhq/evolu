import * as Context from "@effect/data/Context";
import * as Effect from "@effect/io/Effect";
import * as Query from "./Query.js";
import * as Schema from "./Schema.js";

export interface Db {
  readonly exec: (
    arg: string | Query.Query
  ) => Effect.Effect<never, never, Schema.Rows>;

  readonly changes: () => Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>();
