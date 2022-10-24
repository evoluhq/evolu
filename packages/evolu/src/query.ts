import { ioOption, readonlyArray, readonlyRecord, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { createPatch } from "rfc6902";
import {
  DbEnv,
  OnCompleteId,
  PostDbWorkerOutputEnv,
  QueriesRowsCacheEnv,
  QueryPatches,
  sqlQueryFromString,
  SqlQueryString,
  UnknownError,
} from "./types.js";

export const query =
  ({
    queries,
    onCompleteIds,
  }: {
    readonly queries: readonly SqlQueryString[];
    readonly onCompleteIds?: readonly OnCompleteId[];
  }): ReaderTaskEither<
    DbEnv & QueriesRowsCacheEnv & PostDbWorkerOutputEnv,
    UnknownError,
    void
  > =>
  ({ db, queriesRowsCache, postDbWorkerOutput }) =>
    pipe(
      queries,
      taskEither.traverseSeqArray((query) =>
        pipe(
          sqlQueryFromString(query),
          db.execSqlQuery,
          taskEither.map((rows) => [query, rows] as const)
        )
      ),
      taskEither.map(readonlyRecord.fromEntries),
      taskEither.map((queriesRows) => {
        const previous = queriesRowsCache.read();
        const next = { ...previous, ...queriesRows };

        const queriesPatches = pipe(
          Object.keys(queriesRows),
          readonlyArray.map(
            (query): QueryPatches => ({
              query: query as SqlQueryString,
              // TODO: Replace createPatch with own logic.
              // For inspiration: https://github.com/chbrown/rfc6902/pull/88
              patches: createPatch(
                previous[query as SqlQueryString],
                next[query as keyof typeof next]
              ),
            })
          ),
          readonlyArray.filter((a) => a.patches.length > 0)
        );

        pipe(
          queriesRowsCache.write(next),
          ioOption.fromIO,
          ioOption.filter(
            () =>
              (onCompleteIds && onCompleteIds.length > 0) ||
              queriesPatches.length > 0
          ),
          ioOption.chainIOK(() =>
            postDbWorkerOutput({
              type: "onQuery",
              queriesPatches,
              onCompleteIds,
            })
          )
        )();
      })
    );
