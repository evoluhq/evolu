import { either, readerEither } from "fp-ts";
import * as S from "@effect/schema";
import { Either } from "fp-ts/Either";
import { increment, pipe } from "fp-ts/lib/function.js";
import { IO } from "fp-ts/IO";
import { ReaderEither } from "fp-ts/ReaderEither";
import murmurhash from "murmurhash";
import {
  ConfigEnv,
  Counter,
  createNodeId,
  Millis,
  NodeId,
  TimeEnv,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampDuplicateNodeError,
  TimestampHash,
  TimestampString,
} from "./types.js";

// https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
// https://jaredforsyth.com/posts/hybrid-logical-clocks/
// https://github.com/jlongster/crdt-example-app/blob/master/shared/timestamp.js

export const createInitialTimestamp: IO<Timestamp> = () => ({
  millis: 0 as Millis,
  counter: 0 as Counter,
  node: createNodeId(),
});

const syncNodeId = S.decodeOrThrow(NodeId)("0000000000000000");

export const createSyncTimestamp = (
  millis: Millis = 0 as Millis
): Timestamp => ({
  millis,
  counter: 0 as Counter,
  node: syncNodeId,
});

export const timestampToString = (t: Timestamp): TimestampString =>
  [
    new Date(t.millis).toISOString(),
    t.counter.toString(16).toUpperCase().padStart(4, "0"),
    t.node,
  ].join("-") as TimestampString;

export const timestampFromString = (s: TimestampString): Timestamp =>
  pipe(s.split("-"), (a) => ({
    millis: Date.parse(a.slice(0, 3).join("-")).valueOf() as Millis,
    counter: parseInt(a[3], 16) as Counter,
    node: a[4] as NodeId,
  }));

export const timestampToHash = (t: Timestamp): TimestampHash =>
  pipe(timestampToString(t), murmurhash) as TimestampHash;

const incrementCounter = (
  counter: Counter
): Either<TimestampCounterOverflowError, Counter> =>
  pipe(
    increment(counter),
    S.decode(Counter),
    either.mapLeft(() => ({ type: "TimestampCounterOverflowError" }))
  );

const getNextMillis =
  (
    millis: Millis[]
  ): ReaderEither<TimeEnv & ConfigEnv, TimestampDriftError, Millis> =>
  ({ now, config }) =>
    pipe(
      now(),
      (now) => ({ now, next: Math.max(now, ...millis) as Millis }),
      either.fromPredicate(
        ({ now, next }) => next - now <= config.maxDrift,
        ({ now, next }): TimestampDriftError => ({
          type: "TimestampDriftError",
          now,
          next,
        })
      ),
      either.map(({ next }) => next)
    );

export const sendTimestamp = (
  timestamp: Timestamp
): ReaderEither<
  TimeEnv & ConfigEnv,
  TimestampDriftError | TimestampCounterOverflowError,
  Timestamp
> =>
  pipe(
    getNextMillis([timestamp.millis]),
    readerEither.chainEitherKW((millis) =>
      pipe(
        millis === timestamp.millis
          ? incrementCounter(timestamp.counter)
          : either.right(0 as Counter),
        either.map(
          (counter): Timestamp => ({ millis, counter, node: timestamp.node })
        )
      )
    )
  );

export const receiveTimestamp = (
  local: Timestamp,
  remote: Timestamp
): ReaderEither<
  TimeEnv & ConfigEnv,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError,
  Timestamp
> =>
  local.node === remote.node
    ? pipe(
        either.left<TimestampDuplicateNodeError>({
          type: "TimestampDuplicateNodeError",
          node: local.node,
        }),
        readerEither.fromEither
      )
    : pipe(
        getNextMillis([local.millis, remote.millis]),
        readerEither.chainEitherKW((millis) =>
          pipe(
            millis === local.millis && millis === remote.millis
              ? incrementCounter(
                  Math.max(local.counter, remote.counter) as Counter
                )
              : millis === local.millis
              ? incrementCounter(local.counter)
              : millis === remote.millis
              ? incrementCounter(remote.counter)
              : either.right(0 as Counter),
            either.map((counter) => ({ millis, counter, node: local.node }))
          )
        )
      );
