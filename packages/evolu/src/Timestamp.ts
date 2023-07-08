import * as Either from "@effect/data/Either";
import { pipe } from "@effect/data/Function";
import * as Number from "@effect/data/Number";
import * as Effect from "@effect/io/Effect";
import * as Schema from "@effect/schema/Schema";
import { customAlphabet } from "nanoid";
import { murmurhash } from "./Murmurhash.js";
import {
  Config,
  Counter,
  Millis,
  NodeId,
  Time,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampDuplicateNodeError,
  TimestampHash,
  TimestampString,
} from "./Types.js";

// https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
// https://jaredforsyth.com/posts/hybrid-logical-clocks/
// https://github.com/clintharris/crdt-example-app_annotated/blob/master/shared/timestamp.js

const createNodeId = pipe(
  customAlphabet("0123456789abcdef", 16),
  (createNodeId) => Effect.sync(() => createNodeId() as NodeId),
);

export const timestampToString = (t: Timestamp): TimestampString =>
  [
    new Date(t.millis).toISOString(),
    t.counter.toString(16).toUpperCase().padStart(4, "0"),
    t.node,
  ].join("-") as TimestampString;

// TODO: Use Schema and Effect
export const unsafeTimestampFromString = (s: TimestampString): Timestamp =>
  pipe(
    s.split("-"),
    (a): Timestamp => ({
      millis: Date.parse(a.slice(0, 3).join("-")).valueOf() as Millis,
      counter: parseInt(a[3], 16) as Counter,
      node: a[4] as NodeId,
    }),
  );

export const timestampToHash = (t: Timestamp): TimestampHash =>
  pipe(timestampToString(t), murmurhash) as TimestampHash;

export const createInitialTimestamp = pipe(
  createNodeId,
  Effect.flatMap((nodeId) =>
    Effect.sync(
      (): Timestamp => ({
        millis: 0 as Millis,
        counter: 0 as Counter,
        node: nodeId,
      }),
    ),
  ),
);

const syncNodeId = Schema.parseSync(NodeId)("0000000000000000");

export const createSyncTimestamp = (
  millis: Millis = 0 as Millis,
): Timestamp => ({
  millis,
  counter: 0 as Counter,
  node: syncNodeId,
});

const getNextMillis = (
  millis: Millis[],
): Effect.Effect<Time | Config, TimestampDriftError, Millis> =>
  pipe(
    Effect.all(Time, Config),
    Effect.flatMap(([time, config]) => {
      const now = time.now();
      const next = Math.max(now, ...millis) as Millis;

      if (next - now > config.maxDrift)
        return Effect.fail<TimestampDriftError>({
          _tag: "TimestampDriftError",
          now,
          next,
        });

      return Effect.succeed(next);
    }),
  );

const incrementCounter = (
  counter: Counter,
): Either.Either<TimestampCounterOverflowError, Counter> =>
  pipe(
    Number.increment(counter),
    Schema.parseEither(Counter),
    Either.mapLeft(() => ({ _tag: "TimestampCounterOverflowError" })),
  );

const counterMin = Schema.parseSync(Counter)(0);

export const sendTimestamp = (
  timestamp: Timestamp,
): Effect.Effect<
  Time | Config,
  TimestampDriftError | TimestampCounterOverflowError,
  Timestamp
> =>
  Effect.gen(function* ($) {
    const millis = yield* $(getNextMillis([timestamp.millis]));
    const counter =
      millis === timestamp.millis
        ? yield* $(incrementCounter(timestamp.counter))
        : counterMin;
    return { ...timestamp, millis, counter };
  });

export const receiveTimestamp = (
  local: Timestamp,
  remote: Timestamp,
): Effect.Effect<
  Time | Config,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError,
  Timestamp
> =>
  Effect.gen(function* ($) {
    if (local.node === remote.node)
      yield* $(
        Effect.fail<TimestampDuplicateNodeError>({
          _tag: "TimestampDuplicateNodeError",
          node: local.node,
        }),
      );

    const millis = yield* $(getNextMillis([local.millis, remote.millis]));
    const counter = yield* $(
      millis === local.millis && millis === remote.millis
        ? incrementCounter(Math.max(local.counter, remote.counter) as Counter)
        : millis === local.millis
        ? incrementCounter(local.counter)
        : millis === remote.millis
        ? incrementCounter(remote.counter)
        : Either.right(counterMin),
    );

    return { ...local, millis, counter };
  });
