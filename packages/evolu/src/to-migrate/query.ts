import { readonlyArray, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { createPatches } from "./diff.js";
import {
  DbEnv,
  OnCompleteId,
  PostDbWorkerOutputEnv,
  queryFromString,
  QueryPatches,
  QueryString,
  RowsCacheEnv,
  UnknownError,
} from "./types.js";

export const query =
  ({
    queries,
    onCompleteIds = readonlyArray.empty,
  }: {
    readonly queries: readonly QueryString[];
    readonly onCompleteIds?: readonly OnCompleteId[];
  }): ReaderTaskEither<
    DbEnv & RowsCacheEnv & PostDbWorkerOutputEnv,
    UnknownError,
    void
  > =>
  ({ db, rowsCache, postDbWorkerOutput }) =>
    pipe(
      queries,
      taskEither.traverseSeqArray((query) =>
        pipe(
          queryFromString(query),
          db.execQuery,
          taskEither.map((rows) => [query, rows] as const)
        )
      ),
      taskEither.map((queriesRows) => {
        const previous = rowsCache.read();
        rowsCache.write(new Map([...previous, ...queriesRows]))();

        const queriesPatches = pipe(
          queriesRows,
          readonlyArray.map(
            ([query, rows]): QueryPatches => ({
              query,
              patches: createPatches(previous.get(query), rows),
            })
          )
        );

        if (queriesPatches.length > 0 || onCompleteIds.length > 0)
          postDbWorkerOutput({
            type: "onQuery",
            queriesPatches,
            onCompleteIds,
          })();
      })
    );
