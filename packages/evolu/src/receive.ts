import {
  either,
  option,
  readerEither,
  readerTaskEither,
  readonlyNonEmptyArray,
  taskEither,
} from "fp-ts";
import { Either } from "fp-ts/Either";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { Option } from "fp-ts/Option";
import { ReaderEither } from "fp-ts/ReaderEither";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { applyMessages } from "./applyMessages.js";
import { diffMerkleTrees } from "./merkleTree.js";
import { readClock } from "./readClock.js";
import { syncIsPendingOrHeld } from "./syncLock.js";
import {
  createSyncTimestamp,
  receiveTimestamp,
  timestampFromString,
  timestampToString,
} from "./timestamp.js";
import {
  ConfigEnv,
  CrdtClock,
  CrdtMessage,
  DbEnv,
  LockManagerEnv,
  MerkleTree,
  Millis,
  OwnerEnv,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  SyncError,
  TimeEnv,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampDuplicateNodeError,
  UnknownError,
} from "./types.js";
import { updateClock } from "./updateClock.js";

const receiveMessages =
  (timestamp: Timestamp) =>
  (
    messages: ReadonlyNonEmptyArray<CrdtMessage>
  ): ReaderEither<
    TimeEnv & ConfigEnv,
    | TimestampDriftError
    | TimestampCounterOverflowError
    | TimestampDuplicateNodeError,
    Timestamp
  > =>
    pipe(
      messages,
      readerEither.traverseArray((message) =>
        pipe(
          receiveTimestamp(timestamp, timestampFromString(message.timestamp)),
          // eslint-disable-next-line no-param-reassign
          readerEither.map((t) => (timestamp = t))
        )
      ),
      readerEither.map(() => timestamp)
    );

const handleReceivedMessages =
  (clock: CrdtClock) =>
  (
    messages: ReadonlyNonEmptyArray<CrdtMessage>
  ): ReaderTaskEither<
    TimeEnv & DbEnv & PostDbWorkerOutputEnv & ConfigEnv,
    | UnknownError
    | TimestampDuplicateNodeError
    | TimestampDriftError
    | TimestampCounterOverflowError,
    CrdtClock
  > =>
    pipe(
      messages,
      receiveMessages(clock.timestamp),
      readerTaskEither.fromReaderEither,
      readerTaskEither.bindTo("timestamp"),
      readerTaskEither.bindW("merkleTree", () =>
        pipe(messages, applyMessages(clock.merkleTree))
      ),
      readerTaskEither.chainFirstW(updateClock),
      readerTaskEither.chainFirstW(() =>
        pipe(
          readerTaskEither.ask<PostDbWorkerOutputEnv>(),
          readerTaskEither.chainFirstIOK(({ postDbWorkerOutput }) =>
            postDbWorkerOutput({ type: "onReceive" })
          )
        )
      )
    );

const ensureDiffIsDifferent =
  (previousDiff: Option<Millis>) =>
  (diff: Millis): Either<SyncError, Millis> =>
    option.isSome(previousDiff) && previousDiff.value === diff
      ? either.left({ type: "SyncError" })
      : either.right(diff);

const handleMerkleTreesDiff =
  ({
    diff,
    clock,
  }: {
    readonly diff: Millis;
    readonly clock: CrdtClock;
  }): ReaderTaskEither<
    DbEnv & PostSyncWorkerInputEnv & OwnerEnv & ConfigEnv,
    UnknownError,
    void
  > =>
  ({ db, postSyncWorkerInput, owner, config }) =>
    pipe(
      db.execSqlQuery({
        sql: `
          select * from "__message" where "timestamp" > ? order by "timestamp"
        `,
        parameters: [pipe(diff, createSyncTimestamp, timestampToString)],
      }),
      taskEither.map((a) => a as unknown as readonly CrdtMessage[]),
      taskEither.chainIOK(
        flow(
          readonlyNonEmptyArray.fromReadonlyArray,
          option.map((messages) =>
            postSyncWorkerInput({
              syncUrl: config.syncUrl,
              clock,
              messages: option.some(messages),
              owner,
              previousDiff: option.some(diff),
            })
          ),
          option.getOrElse(() => constVoid)
        )
      )
    );

export const receive = ({
  messages,
  merkleTree,
  previousDiff,
}: {
  readonly messages: readonly CrdtMessage[];
  readonly merkleTree: MerkleTree;
  readonly previousDiff: Option<Millis>;
}): ReaderTaskEither<
  DbEnv &
    TimeEnv &
    PostDbWorkerOutputEnv &
    PostSyncWorkerInputEnv &
    OwnerEnv &
    LockManagerEnv &
    ConfigEnv,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError
  | SyncError
  | UnknownError,
  void
> =>
  pipe(
    readClock,
    readerTaskEither.chain((clock) =>
      pipe(
        readonlyNonEmptyArray.fromReadonlyArray(messages),
        option.match(
          () => readerTaskEither.right(clock),
          handleReceivedMessages(clock)
        )
      )
    ),
    readerTaskEither.chainW((clock) =>
      pipe(
        diffMerkleTrees(merkleTree, clock.merkleTree),
        option.match(
          () => readerTaskEither.right(undefined),
          flow(
            ensureDiffIsDifferent(previousDiff),
            readerTaskEither.fromEither,
            readerTaskEither.bindTo("diff"),
            readerTaskEither.bindW(
              "syncIsPendingOrHeld",
              () => syncIsPendingOrHeld
            ),
            readerTaskEither.chainW(({ diff, syncIsPendingOrHeld }) =>
              syncIsPendingOrHeld
                ? readerTaskEither.right(undefined)
                : handleMerkleTreesDiff({ diff, clock })
            )
          )
        )
      )
    )
  );
