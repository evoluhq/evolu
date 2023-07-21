import * as S from "@effect/schema/Schema";
import { Effect, Layer } from "effect";
import { Config, makeConfig } from "./Config.js";
import { DbWorker } from "./DbWorker.js";
import { EvoluLive } from "./Evolu.js";
import { React, ReactLive } from "./React.js";
import { runSync } from "./utils.js";
import { Schema } from "./Schema.js";

const ConfigLive = makeConfig({
  syncUrl: "https://evolu.world",
  maxDrift: 5 * 60 * 1000,
  reloadUrl: "/",
});

export const makeEvoluCreate =
  (DbWorkerLive: Layer.Layer<never, never, DbWorker>) =>
  <From, To extends Schema>(
    schema: S.Schema<From, To>,
    config?: Partial<Config>
  ): React<To>["hooks"] =>
    React.pipe(
      Effect.map((react) => react.hooks as React<To>["hooks"]),
      Effect.provideLayer(
        Layer.merge(ConfigLive(config), DbWorkerLive).pipe(
          Layer.provide(EvoluLive(schema)),
          Layer.provide(ReactLive)
        )
      ),
      runSync
    );
