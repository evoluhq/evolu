import { Context, Layer } from "effect";
import { Row, SerializedSqliteQuery } from "./Sqlite.js";
import { Store, makeStore2 } from "./Store.js";

type RowsMap = ReadonlyMap<SerializedSqliteQuery, ReadonlyArray<Row>>;

export type RowsStore = Store<RowsMap>;

export const RowsStore = Context.Tag<RowsStore>("evolu/RowsStore");

export const RowsStoreLive = Layer.effect(
  RowsStore,
  makeStore2<RowsMap>(() => new Map()),
);
