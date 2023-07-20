import { Effect, Logger, LoggerLevel } from "effect";

const debug = false;

// TODO: Use custom Runtime
// https://discord.com/channels/795981131316985866/1131649520200065045
export const runSync: <E, A>(effect: Effect.Effect<never, E, A>) => A = (
  effect
) =>
  effect.pipe(
    Logger.withMinimumLogLevel(debug ? LoggerLevel.Debug : LoggerLevel.Info),
    Effect.runSync
  );
