import * as S from "@effect/schema/Schema";
import { Effect, Layer } from "effect";
import { Config, ConfigLive } from "./Config.js";
import { OwnerStoreLive, Schema } from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { ErrorStoreLive } from "./Errors.js";
import { EvoluLive } from "./Evolu.js";
import { LoadingPromisesLive } from "./LoadingPromises.js";
import { OnCompletesLive } from "./OnCompletes.js";
import {
  GetQueryLive,
  LoadQueryLive,
  OnQueryLive,
  SubscribeQueryLive,
  SubscribedQueriesLive,
} from "./Query.js";
import { React, ReactLive } from "./React.js";
import { RowsCacheStoreLive } from "./RowsCache.js";
import { runSync } from "./run.js";

export const makeEvoluCreate =
  (DbWorkerLive: Layer.Layer<never, never, DbWorker>) =>
  <From, To extends Schema>(
    schema: S.Schema<From, To>,
    config?: Partial<Config>
  ): React<To>["hooks"] =>
    React.pipe(
      Effect.map((react) => react.hooks as React<To>["hooks"]),
      Effect.provideLayer(
        Layer.mergeAll(
          ConfigLive(config),
          DbWorkerLive,
          ErrorStoreLive,
          OwnerStoreLive,
          Layer.merge(LoadingPromisesLive, DbWorkerLive).pipe(
            Layer.provide(LoadQueryLive)
          ),
          Layer.mergeAll(
            LoadingPromisesLive,
            OnCompletesLive,
            RowsCacheStoreLive
          ).pipe(Layer.provide(OnQueryLive)),
          Layer.merge(SubscribedQueriesLive, RowsCacheStoreLive).pipe(
            Layer.provide(SubscribeQueryLive)
          ),
          RowsCacheStoreLive.pipe(Layer.provide(GetQueryLive))
        ).pipe(Layer.provide(EvoluLive(schema)), Layer.provide(ReactLive))
      ),
      runSync
    );
