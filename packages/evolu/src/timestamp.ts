import type { Brand } from "@effect/data/Brand";
import * as S from "@effect/schema/Schema";
import { either, readerEither } from "fp-ts";
import { Either } from "fp-ts/lib/Either.js";
import { increment, pipe } from "fp-ts/lib/function.js";
import { IO } from "fp-ts/lib/IO.js";
import { ReaderEither } from "fp-ts/lib/ReaderEither.js";
import murmurhash from "murmurhash";
import { customAlphabet } from "nanoid";
import { ConfigEnv } from "./config.js";

// https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
// https://jaredforsyth.com/posts/hybrid-logical-clocks/
// https://github.com/jlongster/crdt-example-app/blob/master/shared/timestamp.js

export const NodeId = pipe(
  S.string,
  S.pattern(/^[\w-]{16}$/),
  S.brand("NodeId")
);
export type NodeId = S.To<typeof NodeId>;

export const createNodeId: IO<NodeId> = pipe(
  customAlphabet("0123456789abcdef", 16),
  (nanoid) => () => nanoid() as NodeId
);

export const Millis = pipe(
  S.number,
  S.greaterThanOrEqualTo(0),
  S.brand("Millis")
);
export type Millis = S.To<typeof Millis>;

export interface TimeEnv {
  readonly now: () => Millis;
}

export const Counter = pipe(S.number, S.between(0, 65535), S.brand("Counter"));
export type Counter = S.To<typeof Counter>;

export interface Timestamp {
  readonly node: NodeId;
  readonly millis: Millis;
  readonly counter: Counter;
}

export interface TimestampDuplicateNodeError {
  readonly type: "TimestampDuplicateNodeError";
  readonly node: NodeId;
}

export interface TimestampDriftError {
  readonly type: "TimestampDriftError";
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampCounterOverflowError {
  readonly type: "TimestampCounterOverflowError";
}

export interface TimestampParseError {
  readonly type: "TimestampParseError";
}

// TODO: Add Schema and use it in Evolu Server.
export type TimestampString = string & Brand<"TimestampString">;

export type TimestampHash = number & Brand<"TimestampHash">;

export const createInitialTimestamp: IO<Timestamp> = () => ({
  millis: 0 as Millis,
  counter: 0 as Counter,
  node: createNodeId(),
});

const syncNodeId = S.parse(NodeId)("0000000000000000");

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
    S.parseEither(Counter),
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
