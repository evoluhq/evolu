import { Row, SerializedSqliteQuery } from "../Sqlite.js";
import { FilterMap } from "./FilterMap.js";

export interface Query<To extends Row, From extends Row = To> {
  readonly query: SerializedSqliteQuery;
  readonly filterMap: FilterMap<From, To>;
}
