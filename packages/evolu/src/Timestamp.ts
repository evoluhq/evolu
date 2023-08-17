import * as Schema from "@effect/schema/Schema";
import { Brand, Context, Effect, Either, Layer, Number, pipe } from "effect";
import { Config } from "./Config.js";
import { NanoId, NodeId } from "./Crypto.js";
import { murmurhash } from "./Murmurhash.js";

// https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
// https://jaredforsyth.com/posts/hybrid-logical-clocks/
// https://github.com/clintharris/crdt-example-app_annotated/blob/master/shared/timestamp.js
export interface Timestamp {
  readonly node: NodeId;
  readonly millis: Millis;
  readonly counter: Counter;
}

export const Millis = Schema.number.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.brand("Millis")
);
export type Millis = Schema.To<typeof Millis>;

const initialMillis = Schema.parseSync(Millis)(0);

export const Counter = Schema.number.pipe(
  Schema.between(0, 65535),
  Schema.brand("Counter")
);
export type Counter = Schema.To<typeof Counter>;

const initialCounter = Schema.parseSync(Counter)(0);

export type TimestampHash = number & Brand.Brand<"TimestampHash">;

export type TimestampString = string & Brand.Brand<"TimestampString">;

export const timestampToString = (t: Timestamp): TimestampString =>
  [
    new Date(t.millis).toISOString(),
    t.counter.toString(16).toUpperCase().padStart(4, "0"),
    t.node,
  ].join("-") as TimestampString;

export const unsafeTimestampFromString = (s: TimestampString): Timestamp => {
  const a = s.split("-");
  return {
    millis: Date.parse(a.slice(0, 3).join("-")).valueOf() as Millis,
    counter: parseInt(a[3], 16) as Counter,
    node: a[4] as NodeId,
  };
};

export const timestampToHash = (t: Timestamp): TimestampHash =>
  murmurhash(timestampToString(t)) as TimestampHash;

const syncNodeId = Schema.parseSync(NodeId)("0000000000000000");

export const makeSyncTimestamp = (
  millis: Millis = initialMillis
): Timestamp => ({
  millis,
  counter: initialCounter,
  node: syncNodeId,
});

export const makeInitialTimestamp = NanoId.pipe(
  Effect.flatMap(({ nanoidAsNodeId }) => nanoidAsNodeId),
  Effect.map(
    (node): Timestamp => ({
      millis: initialMillis,
      counter: initialCounter,
      node,
    })
  )
);

export interface Time {
  readonly now: Effect.Effect<never, never, Millis>;
}

export const Time = Context.Tag<Time>("evolu/Time");

export const TimeLive = Layer.succeed(
  Time,
  Time.of({
    now: Effect.sync(() => Date.now() as Millis),
  })
);

export type TimestampError =
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError;

export interface TimestampDriftError {
  readonly _tag: "TimestampDriftError";
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampCounterOverflowError {
  readonly _tag: "TimestampCounterOverflowError";
}

const getNextMillis = (
  millis: Millis[]
): Effect.Effect<Time | Config, TimestampDriftError, Millis> =>
  Effect.gen(function* (_) {
    const time = yield* _(Time);
    const config = yield* _(Config);

    const now = yield* _(time.now);
    const next = Math.max(now, ...millis) as Millis;

    if (next - now > config.maxDrift)
      yield* _(
        Effect.fail<TimestampDriftError>({
          _tag: "TimestampDriftError",
          now,
          next,
        })
      );

    return next;
  });

const incrementCounter = (
  counter: Counter
): Either.Either<TimestampCounterOverflowError, Counter> =>
  pipe(
    Number.increment(counter),
    Schema.parseEither(Counter),
    Either.mapLeft(() => ({ _tag: "TimestampCounterOverflowError" }))
  );

const counterMin = Schema.parseSync(Counter)(0);

export const sendTimestamp = (
  timestamp: Timestamp
): Effect.Effect<
  Time | Config,
  TimestampDriftError | TimestampCounterOverflowError,
  Timestamp
> =>
  Effect.gen(function* (_) {
    const millis = yield* _(getNextMillis([timestamp.millis]));
    const counter =
      millis === timestamp.millis
        ? yield* _(incrementCounter(timestamp.counter))
        : counterMin;
    return { ...timestamp, millis, counter };
  });

export interface TimestampDuplicateNodeError {
  readonly _tag: "TimestampDuplicateNodeError";
  readonly node: NodeId;
}

export const receiveTimestamp = ({
  local,
  remote,
}: {
  readonly local: Timestamp;
  readonly remote: Timestamp;
}): Effect.Effect<
  Time | Config,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError,
  Timestamp
> =>
  Effect.gen(function* (_) {
    if (local.node === remote.node)
      yield* _(
        Effect.fail<TimestampDuplicateNodeError>({
          _tag: "TimestampDuplicateNodeError",
          node: local.node,
        })
      );

    const millis = yield* _(getNextMillis([local.millis, remote.millis]));
    const counter = yield* _(
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
