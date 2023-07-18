export * from "./Exports.js";

import * as S from "@effect/schema/Schema";
import { Effect, Layer } from "effect";
import { Config, ConfigLive } from "./Config.js";
import { Schema, EvoluLive } from "./Evolu.js";
import { React, ReactLive } from "./React.js";

const Live = <From, To extends Schema>(
  config: Partial<Config> | undefined,
  schema: S.Schema<From, To>
): Layer.Layer<never, never, React<Schema>> =>
  ConfigLive(config).pipe(
    Layer.provide(EvoluLive(schema)),
    Layer.provide(ReactLive)
  );

export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>
): React<To>["hooks"] =>
  React.pipe(
    Effect.map((react) => react.hooks as React<To>["hooks"]),
    Effect.provideLayer(Live<From, To>(config, schema)),
    Effect.runSync
  );
