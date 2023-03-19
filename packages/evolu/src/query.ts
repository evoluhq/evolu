import { readonlyArray, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { createPatches } from "./diff.js";
import {
  DbEnv,
  OnCompleteId,
  PostDbWorkerOutputEnv,
  QueryPatches,
  RowsCacheEnv,
  sqlQueryFromString,
  SqlQueryString,
  UnknownError,
} from "./types.js";

export const query =
  ({
    queries,
    onCompleteIds = readonlyArray.empty,
  }: {
    readonly queries: readonly SqlQueryString[];
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
          sqlQueryFromString(query),
          db.execSqlQuery,
          taskEither.map((rows) => ({ query, rows }))
        )
      ),
      taskEither.map((queriesRows) => {
        const previous = rowsCache.read();
        const next = pipe(
          queriesRows,
          readonlyArray.reduce(previous, (a, { query, rows }) => ({
            ...a,
            [query]: rows,
          }))
        );

        const queriesPatches = pipe(
          queriesRows.map((a) => a.query),
          readonlyArray.map(
            (query): QueryPatches => ({
              query,
              patches: createPatches(previous[query], next[query]),
            })
          )
        );

        rowsCache.write(next)();

        if (queriesPatches.length > 0 || onCompleteIds.length > 0)
          postDbWorkerOutput({
            type: "onQuery",
            queriesPatches,
            onCompleteIds,
          })();
      })
    );
