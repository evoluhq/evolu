import { pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as Ref from "@effect/io/Ref";
import * as Db from "./Db.js";
import * as DbWorker from "./DbWorker.js";
import * as Diff from "./Diff.js";

export const query = ({
  queries,
  onCompleteIds = ReadonlyArray.empty(),
}: {
  readonly queries: ReadonlyArray<Db.QueryString>;
  readonly onCompleteIds?: ReadonlyArray<DbWorker.OnCompleteId>;
}): Effect.Effect<
  Db.Db | DbWorker.RowsCache | DbWorker.OnMessage,
  never,
  void
> =>
  Effect.gen(function* ($) {
    const db = yield* $(Db.Db);
    const queriesRows = yield* $(
      Effect.forEach(queries, (query) =>
        pipe(
          Db.queryFromString(query),
          db.exec,
          Effect.map((rows) => [query, rows] as const)
        )
      )
    );

    const rowsCache = yield* $(DbWorker.RowsCache);
    const previous = yield* $(Ref.get(rowsCache));
    yield* $(Ref.set(rowsCache, new Map([...previous, ...queriesRows])));

    const queriesPatches = queriesRows.map(
      ([query, rows]): Diff.QueryPatches => ({
        query,
        patches: Diff.createPatches(previous.get(query), rows),
      })
    );

    const onMessage = yield* $(DbWorker.OnMessage);
    if (queriesPatches.length > 0 || onCompleteIds.length > 0)
      onMessage({ _tag: "onQuery", queriesPatches, onCompleteIds });
  });
