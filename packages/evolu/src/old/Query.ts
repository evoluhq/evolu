import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as Ref from "@effect/io/Ref";
import { createPatches } from "./Diff.js";
import {
  Db,
  DbWorkerOnMessage,
  DbWorkerRowsCache,
  OnCompleteId,
  Query,
  QueryObject,
  QueryPatches,
} from "./Types.js";
import { Row } from "../Sqlite.js";

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

export const QueryToQueryObject = (s: Query): QueryObject =>
  JSON.parse(s) as QueryObject;

export const query = ({
  queries,
  onCompleteIds = ReadonlyArray.empty(),
}: {
  readonly queries: ReadonlyArray<Query>;
  readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
}): Effect.Effect<Db | DbWorkerRowsCache | DbWorkerOnMessage, never, void> =>
  Effect.gen(function* ($) {
    const db = yield* $(Db);
    const queriesRows = yield* $(
      Effect.forEach(queries, (query) =>
        db
          .exec(QueryToQueryObject(query))
          .pipe(Effect.map((rows) => [query, rows] as const))
      )
    );

    const rowsCache = yield* $(DbWorkerRowsCache);
    const previous = yield* $(Ref.get(rowsCache));
    yield* $(Ref.set(rowsCache, new Map([...previous, ...queriesRows])));

    const queriesPatches = queriesRows.map(
      ([query, rows]): QueryPatches => ({
        query,
        patches: createPatches(previous.get(query), rows),
      })
    );

    const dbWorkerOnMessage = yield* $(DbWorkerOnMessage);
    dbWorkerOnMessage({ _tag: "onQuery", queriesPatches, onCompleteIds });
  });
