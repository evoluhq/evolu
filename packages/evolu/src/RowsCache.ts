import { Context, Layer, Ref } from "effect";
import { Query, Row } from "./Db.js";
import { Store, makeStore } from "./Store.js";

export type RowsCacheMap = ReadonlyMap<Query, ReadonlyArray<Row>>;

export type RowsCacheRef = Ref.Ref<RowsCacheMap>;
export const RowsCacheRef = Context.Tag<RowsCacheRef>("evolu/RowsCacheRef");
export const RowsCacheRefLive = Layer.effect(RowsCacheRef, Ref.make(new Map()));

export type RowsCacheStore = Store<RowsCacheMap>;
export const RowsCacheStore = Context.Tag<RowsCacheStore>(
  "evolu/RowsCacheStore"
);
export const RowsCacheStoreLive = Layer.succeed(
  RowsCacheStore,
  makeStore<RowsCacheMap>(new Map())
);
