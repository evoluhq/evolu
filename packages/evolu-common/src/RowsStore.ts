import { Context, Layer } from "effect";
import { Row, SerializedSqliteQuery } from "./Sqlite.js";
import { Store, makeStore2 } from "./Store.js";

export type RowsStore = Store<RowsStoreValue>;

type RowsStoreValue = ReadonlyMap<SerializedSqliteQuery, ReadonlyArray<Row>>;

export const RowsStore = Context.Tag<RowsStore>("evolu/RowsStore");

export const RowsStoreLive = Layer.effect(
  RowsStore,
  makeStore2<RowsStoreValue>(() => new Map()),
);
