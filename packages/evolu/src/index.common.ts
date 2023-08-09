import * as S from "@effect/schema/Schema";
import { Effect, Layer } from "effect";
import { Config, ConfigLive } from "./Config.js";
import { NanoIdLive } from "./CryptoLive.web.js";
import { Schema } from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { EvoluLive } from "./Evolu.js";
import { LoadingPromisesLive } from "./LoadingPromises.js";
import { MutateLive } from "./Mutate.js";
import { OnCompletesLive } from "./OnCompletes.js";
import { FlushSyncLive } from "./Platform.web.js";
import { QueryStoreLive } from "./QueryStore.js";
import { React, ReactLive } from "./React.js";
import { RowsCacheStoreLive } from "./RowsCache.js";
import { SubscribedQueriesLive } from "./SubscribedQueries.js";
import { TimeLive } from "./Timestamp.js";
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
          Layer.mergeAll(
            DbWorkerLive,
            FlushSyncLive,
            LoadingPromisesLive,
            OnCompletesLive,
            RowsCacheStoreLive,
            SubscribedQueriesLive
          ).pipe(Layer.provide(QueryStoreLive)),
          Layer.mergeAll(
            DbWorkerLive,
            LoadingPromisesLive,
            NanoIdLive,
            OnCompletesLive,
            SubscribedQueriesLive,
            TimeLive
          ).pipe(Layer.provide(MutateLive))
        ).pipe(Layer.provide(EvoluLive(schema)), Layer.provide(ReactLive))
      ),
      runSync
    );
