import { Effect, Exit, Logger, LoggerLevel } from "effect";

// TODO: Use custom Runtime? How?

const debug = false;

const logger = Logger.withMinimumLogLevel(
  debug ? LoggerLevel.Debug : LoggerLevel.Info
);

export const runSync: <E, A>(effect: Effect.Effect<never, E, A>) => A = (
  effect
) => effect.pipe(logger, Effect.runSync);

export const runSyncExit: <E, A>(
  effect: Effect.Effect<never, E, A>
) => Exit.Exit<E, A> = (effect) => effect.pipe(logger, Effect.runSyncExit);

export const runPromise: <E, A>(
  effect: Effect.Effect<never, E, A>
) => Promise<A> = (effect) => effect.pipe(logger, Effect.runPromise);

export const runPromiseExit: <E, A>(
  effect: Effect.Effect<never, E, A>
) => Promise<Exit.Exit<E, A>> = (effect) =>
  effect.pipe(logger, Effect.runPromiseExit);
