import { pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Equivalence from "@effect/data/typeclass/Equivalence";
import * as Effect from "@effect/io/Effect";
import * as Ref from "@effect/io/Ref";
import { createPatches } from "./Diff.js";
import {
  Db,
  DbWorkerOnMessage,
  DbWorkerRowsCache,
  OnCompleteId,
  Query,
  QueryPatches,
  QueryString,
} from "./Types.js";

export const QueryStringEquivalence: Equivalence.Equivalence<QueryString> =
  Equivalence.string;

export const queryToString = ({ sql, parameters }: Query): QueryString =>
  JSON.stringify({ sql, parameters }) as QueryString;

export const queryFromString = (s: QueryString): Query =>
  JSON.parse(s) as Query;

export const query = ({
  queries,
  onCompleteIds = ReadonlyArray.empty(),
}: {
  readonly queries: ReadonlyArray.NonEmptyReadonlyArray<QueryString>;
  readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
}): Effect.Effect<Db | DbWorkerRowsCache | DbWorkerOnMessage, never, void> =>
  Effect.gen(function* ($) {
    const db = yield* $(Db);
    const queriesRows = yield* $(
      Effect.forEach(queries, (query) =>
        pipe(
          queryFromString(query),
          db.exec,
          Effect.map((rows) => [query, rows] as const)
        )
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
    if (queriesPatches.length > 0 || onCompleteIds.length > 0)
      dbWorkerOnMessage({ _tag: "onQuery", queriesPatches, onCompleteIds });
  });
