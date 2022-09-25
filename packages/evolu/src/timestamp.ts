import { either } from "fp-ts";
import { Either } from "fp-ts/Either";
import { increment, pipe } from "fp-ts/lib/function.js";
import { IO } from "fp-ts/IO";
import { ReaderEither } from "fp-ts/ReaderEither";
import murmurhash from "murmurhash";
import { config } from "./config.js";
import {
  Counter,
  createNodeId,
  MAX_COUNTER,
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

const syncNodeId = NodeId.parse("0000000000000000");

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

// timestampFromUnsafeString
// export const parseTimestamp = (
//   s: string
// ): Either<TimestampParseError, Timestamp> =>
//   pipe(
//     s.split("-"),
//     option.fromPredicate((a) => a.length === 5),
//     option.chain((a) =>
//       apply.sequenceS(option.Applicative)({
//         millis: option.fromEither(
//           pipe(
//             Millis.safeParse(Date.parse(a.slice(0, 3).join("-")).valueOf()),
//             safeParseToEither
//           )
//         ),
//         counter: option.fromEither(
//           pipe(Counter.safeParse(parseInt(a[3], 16)), safeParseToEither)
//         ),
//         node: option.fromEither(
//           pipe(NodeId.safeParse(a[4]), safeParseToEither)
//         ),
//       })
//     ),
//     either.fromOption(
//       (): TimestampParseError => ({
//         type: "TimestampParseError",
//       })
//     )
//   );

export const timestampToHash = (t: Timestamp): TimestampHash =>
  pipe(timestampToString(t), murmurhash) as TimestampHash;

const incrementCounter = (
  counter: Counter
): Either<TimestampCounterOverflowError, Counter> =>
  counter < MAX_COUNTER
    ? either.right(increment(counter) as Counter)
    : either.left({ type: "TimestampCounterOverflowError" });

export const sendTimestamp =
  (
    timestamp: Timestamp
  ): ReaderEither<
    TimeEnv,
    TimestampDriftError | TimestampCounterOverflowError,
    Timestamp
  > =>
  ({ now }) =>
    pipe(
      Math.max(timestamp.millis, now) as Millis,
      either.fromPredicate(
        (next) => next - now <= config.maxDrift,
        (next): TimestampDriftError => ({
          type: "TimestampDriftError",
          next,
          now,
        })
      ),
      either.bindTo("millis"),
      either.bindW("counter", ({ millis }) =>
        millis === timestamp.millis
          ? incrementCounter(timestamp.counter)
          : either.right(0 as Counter)
      ),
      either.map((a) => ({ ...a, node: timestamp.node }))
    );

export const receiveTimestamp =
  (
    local: Timestamp,
    remote: Timestamp
  ): ReaderEither<
    TimeEnv,
    | TimestampDriftError
    | TimestampCounterOverflowError
    | TimestampDuplicateNodeError,
    Timestamp
  > =>
  ({ now }) =>
    pipe(
      Math.max(local.millis, remote.millis, now) as Millis,
      either.fromPredicate(
        (next) => next - now <= config.maxDrift,
        (next): TimestampDriftError => ({
          type: "TimestampDriftError",
          next,
          now,
        })
      ),
      either.filterOrElseW(
        () => local.node !== remote.node,
        (): TimestampDuplicateNodeError => ({
          type: "TimestampDuplicateNodeError",
          node: local.node,
        })
      ),
      either.bindTo("millis"),
      either.bindW("counter", ({ millis }) =>
        millis === local.millis && millis === remote.millis
          ? incrementCounter(Math.max(local.counter, remote.counter) as Counter)
          : millis === local.millis
          ? incrementCounter(local.counter)
          : millis === remote.millis
          ? incrementCounter(remote.counter)
          : either.right(0 as Counter)
      ),
      either.map((a) => ({ ...a, node: local.node }))
    );
