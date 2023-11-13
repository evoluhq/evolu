import * as S from "@effect/schema/Schema";
import { Config, ConfigLive, Evolu, EvoluLive, Schema } from "@evolu/common";
import { Effect, Layer } from "effect";
import { DbWorkerLive } from "./DbWorkerLive.js";
import { Bip39Live, FlushSyncLive } from "./PlatformLive.js";

export const createEvolu = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>,
): Evolu<To> =>
  Evolu<To>().pipe(
    Effect.provide(EvoluLive<From, To>(schema)),
    Effect.provide(
      Layer.mergeAll(
        Bip39Live,
        FlushSyncLive,
        DbWorkerLive,
        ConfigLive(config),
      ),
    ),
    Effect.runSync,
  );
