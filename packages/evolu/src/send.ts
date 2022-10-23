import {
  option,
  readerEither,
  readerTaskEither,
  readonlyNonEmptyArray,
  taskEither,
} from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderEither } from "fp-ts/ReaderEither";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { applyMessages } from "./applyMessages.js";
import { query } from "./query.js";
import { readClock } from "./readClock.js";
import { sendTimestamp, timestampToString } from "./timestamp.js";
import {
  CrdtClock,
  CrdtMessage,
  DbEnv,
  NewCrdtMessage,
  OwnerEnv,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  QueriesRowsCacheEnv,
  SqlQueryString,
  TimeEnv,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  UnknownError,
} from "./types.js";
import { updateClock } from "./updateClock.js";

const sendMessages =
  (timestamp: Timestamp) =>
  (
    messages: ReadonlyNonEmptyArray<NewCrdtMessage>
  ): ReaderEither<
    TimeEnv,
    TimestampDriftError | TimestampCounterOverflowError,
    {
      readonly messages: ReadonlyNonEmptyArray<CrdtMessage>;
      readonly timestamp: Timestamp;
    }
  > =>
    pipe(
      messages,
      readerEither.traverseReadonlyNonEmptyArrayWithIndex((i, message) =>
        pipe(
          sendTimestamp(timestamp),
          readerEither.map((t): CrdtMessage => {
            // eslint-disable-next-line no-param-reassign
            timestamp = t;
            return {
              timestamp: timestampToString(t),
              table: message.table,
              row: message.row,
              column: message.column,
              value: message.value,
            };
          })
        )
      ),
      readerEither.map((messages) => ({ messages, timestamp }))
    );

const callSync =
  ({
    messages,
    clock,
  }: {
    readonly messages: ReadonlyNonEmptyArray<CrdtMessage>;
    readonly clock: CrdtClock;
  }): ReaderTaskEither<PostSyncWorkerInputEnv & OwnerEnv, never, void> =>
  ({ postSyncWorkerInput, owner }) =>
    taskEither.fromIO(
      postSyncWorkerInput({
        type: "sync",
        messages: option.some(messages),
        clock,
        owner,
        previousDiff: option.none,
      })
    );

const queryQueriesIfAny =
  (queries: readonly SqlQueryString[]) =>
  (): ReaderTaskEither<
    DbEnv & QueriesRowsCacheEnv & PostDbWorkerOutputEnv,
    UnknownError,
    void
  > =>
    pipe(
      readonlyNonEmptyArray.fromReadonlyArray(queries),
      option.match(() => readerTaskEither.right(undefined), query)
    );

export const send = ({
  messages,
  queries,
}: {
  readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
  readonly queries: readonly SqlQueryString[];
}): ReaderTaskEither<
  DbEnv &
    OwnerEnv &
    QueriesRowsCacheEnv &
    PostDbWorkerOutputEnv &
    PostSyncWorkerInputEnv &
    TimeEnv,
  UnknownError | TimestampDriftError | TimestampCounterOverflowError,
  void
> =>
  pipe(
    readClock,
    readerTaskEither.chainW((clock) =>
      pipe(
        messages,
        sendMessages(clock.timestamp),
        readerTaskEither.fromReaderEither,
        readerTaskEither.chainW(({ messages, timestamp }) =>
          pipe(
            messages,
            applyMessages(clock.merkleTree),
            readerTaskEither.map((merkleTree) => ({
              messages,
              clock: { merkleTree, timestamp },
            }))
          )
        )
      )
    ),
    readerTaskEither.chainFirstW(({ clock }) => updateClock(clock)),
    readerTaskEither.chainW(callSync),
    readerTaskEither.chainW(queryQueriesIfAny(queries))
  );
