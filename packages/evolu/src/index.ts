export * from "./Exports.js";

import * as S from "@effect/schema/Schema";
import { Effect, Layer, identity } from "effect";
import { Config } from "./Config.js";
import { EvoluLive, Schema } from "./Evolu.js";
import { React, ReactLive } from "./React.js";

export const create = <From, To extends Schema>(
  _schema: S.Schema<From, To>,
  _config?: Partial<Config>
): React<To>["hooks"] => {
  const program = Effect.map(React, identity).pipe(
    Effect.provideLayer(EvoluLive.pipe(Layer.provide(ReactLive))),
    Effect.runSync
  );
  return program.hooks as React<To>["hooks"];
};
