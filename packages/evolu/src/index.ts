export * from "./Model.js";

import * as S from "@effect/schema/Schema";
import { Effect, Layer } from "effect";
import { Config, makeConfig } from "./Config.js";
import { EvoluLive, Schema } from "./Evolu.js";
import { React, ReactLive } from "./React.js";

const ConfigLive = makeConfig({
  syncUrl: "https://evolu.world",
  maxDrift: 5 * 60 * 1000,
  reloadUrl: "/",
});

const Live = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>
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
    Effect.provideLayer(Live<From, To>(schema, config)),
    Effect.runSync
  );
