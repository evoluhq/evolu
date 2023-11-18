import * as S from "@effect/schema/Schema";
import { Config, ConfigLive, Schema } from "@evolu/common";
import { EvoluCommonReact, EvoluCommonReactLive } from "@evolu/common-react";
import { EvoluCommonWebLive, PlatformNameLive } from "@evolu/common-web";
import { Effect, Layer } from "effect";

export * from "@evolu/common/public";

// https://nextjs.org/docs/architecture/fast-refresh
let fastRefreshRef: EvoluCommonReact | null = null;

export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>,
): EvoluCommonReact<To> => {
  if (!fastRefreshRef)
    fastRefreshRef = EvoluCommonReact.pipe(
      Effect.provide(
        EvoluCommonReactLive.pipe(
          Layer.use(Layer.merge(EvoluCommonWebLive, PlatformNameLive)),
          Layer.use(ConfigLive(config)),
        ),
      ),
      Effect.runSync,
    );
  fastRefreshRef.evolu.ensureSchema(schema);
  return fastRefreshRef as EvoluCommonReact<To>;
};
