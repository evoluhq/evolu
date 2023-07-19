export * from "./exports.js";

import * as S from "@effect/schema/Schema";
import { Effect, Layer } from "effect";
import { Config, makeConfig } from "./Config.js";
import { EvoluLive, Schema } from "./Evolu.js";
import { React, ReactLive } from "./React.js";
import { DbWorker } from "./DbWorker.js";

const ConfigLive = makeConfig({
  syncUrl: "https://evolu.world",
  maxDrift: 5 * 60 * 1000,
  reloadUrl: "/",
});

const DbWorkerLive = Layer.succeed(
  DbWorker,
  DbWorker.of({
    post: (a) => {
      // eslint-disable-next-line no-console
      console.log(a);
    },
    onMessage: () => {
      //
    },
  })
);

export const create = <From, To extends Schema>(
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
    Effect.runSync
  );
