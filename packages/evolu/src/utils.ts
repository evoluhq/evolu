import * as AST from "@effect/schema/AST";
import { Schema, make } from "@effect/schema/Schema";
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

// https://github.com/Effect-TS/schema/releases/tag/v0.18.0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getPropertySignatures = <I extends { [K in keyof A]: any }, A>(
  schema: Schema<I, A>
): { [K in keyof A]: Schema<I[K], A[K]> } => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<PropertyKey, Schema<any>> = {};
  const propertySignatures = AST.getPropertySignatures(schema.ast);
  for (let i = 0; i < propertySignatures.length; i++) {
    const propertySignature = propertySignatures[i];
    out[propertySignature.name] = make(propertySignature.type);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  return out as any;
};

// TODO: https://www.effect.website/docs/guide/observability/custom-logger
export const logDebug = (
  message: string,
  json?: unknown
): Effect.Effect<never, never, void> =>
  Effect.logDebug(`${message} ${JSON.stringify(json, null, 2)}`);
