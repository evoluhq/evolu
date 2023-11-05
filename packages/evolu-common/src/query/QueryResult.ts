import * as Kysely from "kysely";
import { Row } from "../Sqlite.js";

export interface QueryResult<R extends Row> {
  readonly rows: ReadonlyArray<Readonly<Kysely.Simplify<R>>>;
  readonly firstRow: Readonly<Kysely.Simplify<R>> | null;
}

export const makeQueryResult = <R extends Row>(
  rows: ReadonlyArray<R>,
): QueryResult<R> => ({ rows, firstRow: rows[0] });
