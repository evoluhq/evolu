import * as Brand from "@effect/data/Brand";
import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import { pipe } from "@effect/data/Function";
import * as Number from "@effect/data/Number";
import * as Effect from "@effect/io/Effect";
import * as Schema from "@effect/schema/Schema";
import murmurhash from "murmurhash";
import { customAlphabet } from "nanoid";
import * as Config from "./Config.js";

// https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
// https://jaredforsyth.com/posts/hybrid-logical-clocks/
// https://github.com/clintharris/crdt-example-app_annotated/blob/master/shared/timestamp.js

export const NodeId = pipe(
  Schema.string,
  Schema.pattern(/^[\w-]{16}$/),
  Schema.brand("NodeId")
);

export type NodeId = Schema.To<typeof NodeId>;

const createNodeId = pipe(
  customAlphabet("0123456789abcdef", 16),
  (createNodeId) => Effect.sync(() => createNodeId() as NodeId)
);

export const Millis = pipe(
  Schema.number,
  Schema.greaterThanOrEqualTo(0),
  Schema.brand("Millis")
);

export type Millis = Schema.To<typeof Millis>;

export interface Time {
  readonly get: () => Millis;
}

export const Time = Context.Tag<Time>();

export const Counter = pipe(
  Schema.number,
  Schema.between(0, 65535),
  Schema.brand("Counter")
);

export type Counter = Schema.To<typeof Counter>;

export interface Timestamp {
  readonly node: NodeId;
  readonly millis: Millis;
  readonly counter: Counter;
}

export type TimestampString = string & Brand.Brand<"TimestampString">;

export const toString = (t: Timestamp): TimestampString =>
  [
    new Date(t.millis).toISOString(),
    t.counter.toString(16).toUpperCase().padStart(4, "0"),
    t.node,
  ].join("-") as TimestampString;

// TODO: Use Schema.
export const unsafeFromString = (s: TimestampString): Timestamp =>
  pipe(s.split("-"), (a) => ({
    millis: Date.parse(a.slice(0, 3).join("-")).valueOf() as Millis,
    counter: parseInt(a[3], 16) as Counter,
    node: a[4] as NodeId,
  }));

export type TimestampHash = number & Brand.Brand<"TimestampHash">;

export const timestampToHash = (t: Timestamp): TimestampHash =>
  pipe(toString(t), murmurhash) as TimestampHash;

export interface TimestampDuplicateNodeError {
  readonly _tag: "TimestampDuplicateNodeError";
  readonly node: NodeId;
}

export interface TimestampDriftError {
  readonly _tag: "TimestampDriftError";
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampCounterOverflowError {
  readonly _tag: "TimestampCounterOverflowError";
}

export interface TimestampParseError {
  readonly _tag: "TimestampParseError";
}

export const createInitialTimestamp = pipe(
  createNodeId,
  Effect.flatMap((nodeId) =>
    Effect.sync(
      (): Timestamp => ({
        millis: 0 as Millis,
        counter: 0 as Counter,
        node: nodeId,
      })
    )
  )
);

const syncNodeId = Schema.parse(NodeId)("0000000000000000");

export const createSyncTimestamp = (
  millis: Millis = 0 as Millis
): Timestamp => ({
  millis,
  counter: 0 as Counter,
  node: syncNodeId,
});

const getNextMillis = (
  millis: Millis[]
): Effect.Effect<Time | Config.Config, TimestampDriftError, Millis> =>
  pipe(
    Effect.all(Time, Config.Config),
    Effect.flatMap(([currentMillis, config]) => {
      const now = currentMillis.get();
      const next = Math.max(now, ...millis) as Millis;

      if (next - now > config.maxDrift)
        return Effect.fail<TimestampDriftError>({
          _tag: "TimestampDriftError",
          now,
          next,
        });

      return Effect.succeed(next);
    })
  );

const incrementCounter = (
  counter: Counter
): Either.Either<TimestampCounterOverflowError, Counter> =>
  pipe(
    Number.increment(counter),
    Schema.parseEither(Counter),
    Either.mapLeft(() => ({ _tag: "TimestampCounterOverflowError" }))
  );

const counterMin = Schema.parse(Counter)(0);

export const send = (
  timestamp: Timestamp
): Effect.Effect<
  Time | Config.Config,
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

export const receive = (
  local: Timestamp,
  remote: Timestamp
): Effect.Effect<
  Time | Config.Config,
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
        })
      );

    const millis = yield* $(getNextMillis([local.millis, remote.millis]));
    const counter = yield* $(
      millis === local.millis && millis === remote.millis
        ? incrementCounter(Math.max(local.counter, remote.counter) as Counter)
        : millis === local.millis
        ? incrementCounter(local.counter)
        : millis === remote.millis
        ? incrementCounter(remote.counter)
        : Either.right(counterMin)
    );

    return { ...local, millis, counter };
  });
