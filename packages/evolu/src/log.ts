import { Effect } from "effect";

// TODO: https://www.effect.website/docs/guide/observability/custom-logger

export const logDebug = (
  message: string,
  json?: unknown
): Effect.Effect<never, never, void> =>
  Effect.logDebug(`${message} ${JSON.stringify(json, null, 2)}`);
