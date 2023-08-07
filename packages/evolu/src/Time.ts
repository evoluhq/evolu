import { Context, Effect, Layer } from "effect";
import { Millis } from "./Timestamp.js";

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
