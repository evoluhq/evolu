import { Context, Effect } from "effect";
import type { QueryObject, Row } from "./Evolu.js";

export interface Db {
  readonly exec: (
    arg: string | QueryObject
  ) => Effect.Effect<never, never, ReadonlyArray<Row>>;
  readonly changes: () => Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>();
