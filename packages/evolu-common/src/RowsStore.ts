import { Context, Layer } from "effect";
import { Query, Row } from "./Db.js";
import { Store, makeStore } from "./Store.js";

export type RowsStore = Store<RowsStoreValue>;
export const RowsStore = Context.Tag<RowsStore>("evolu/RowsStore");

type RowsStoreValue = ReadonlyMap<Query, ReadonlyArray<Row>>;

export const RowsStoreLive = Layer.effect(
  RowsStore,
  makeStore<RowsStoreValue>(() => new Map()),
);
