import { option, readerEither, readerTaskEither, task } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderEither } from "fp-ts/lib/ReaderEither.js";
import { ReaderTask } from "fp-ts/lib/ReaderTask.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { ReadonlyNonEmptyArray } from "fp-ts/lib/ReadonlyNonEmptyArray.js";
import { applyMessages } from "./applyMessages.js";
import { ConfigEnv } from "./config.js";
import { query } from "./query.js";
import { readClock } from "./readClock.js";
import {
  sendTimestamp,
  TimeEnv,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  timestampToString,
} from "./timestamp.js";
import {
  CrdtClock,
  CrdtMessage,
  DbEnv,
  NewCrdtMessage,
  OnCompleteId,
  OwnerEnv,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  QueryString,
  RowsCacheEnv,
  UnknownError,
} from "./types.js";
import { updateClock } from "./updateClock.js";

const sendMessages =
  (timestamp: Timestamp) =>
  (
    messages: ReadonlyNonEmptyArray<NewCrdtMessage>
  ): ReaderEither<
    TimeEnv & ConfigEnv,
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
  }): ReaderTask<PostSyncWorkerInputEnv & OwnerEnv & ConfigEnv, void> =>
  ({ postSyncWorkerInput, owner, config }) =>
    task.fromIO(
      postSyncWorkerInput({
        syncUrl: config.syncUrl,
        messages: option.some(messages),
        clock,
        owner,
        previousDiff: option.none,
      })
    );

export const send = ({
  messages,
  onCompleteIds,
  queries,
}: {
  readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
  readonly onCompleteIds: readonly OnCompleteId[];
  readonly queries: readonly QueryString[];
}): ReaderTaskEither<
  DbEnv &
    OwnerEnv &
    RowsCacheEnv &
    PostDbWorkerOutputEnv &
    PostSyncWorkerInputEnv &
    TimeEnv &
    ConfigEnv,
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
            applyMessages({ merkleTree: clock.merkleTree, messages }),
            readerTaskEither.map((merkleTree) => ({
              messages,
              clock: { merkleTree, timestamp },
            }))
          )
        )
      )
    ),
    readerTaskEither.chainFirstW(({ clock }) => updateClock(clock)),
    readerTaskEither.chainReaderTaskKW(callSync),
    readerTaskEither.chainW(() => query({ queries, onCompleteIds }))
  );
