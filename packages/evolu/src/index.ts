import * as S from "@effect/schema/Schema";
import { Effect, Function, Layer } from "effect";
import { Config, ConfigLive } from "./Config.js";
import { Schema, Tables, schemaToTables } from "./Db.js";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { EvoluLive } from "./Evolu.js";
import { LoadingPromisesLive } from "./LoadingPromises.js";
import { MutateLive } from "./Mutate.js";
import { OnCompletesLive } from "./OnCompletes.js";
import { OwnerActionsLive } from "./OwnerActions.js";
import { Platform } from "./Platform.js";
import { QueryStoreLive } from "./QueryStore.js";
import { React, ReactLive } from "./React.js";
import { RowsCacheStoreLive } from "./RowsCache.js";
import { SubscribedQueriesLive } from "./SubscribedQueries.js";
import { TimeLive } from "./Timestamp.js";
export * from "./exports.js";

import { Bip39Live, NanoIdLive } from "./CryptoLive.web.js";
import { AppStateLive, FlushSyncLive, PlatformLive } from "./Platform.web.js";

const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.gen(function* (_) {
    const platform = yield* _(Platform);

    if (platform.name === "web-with-opfs") {
      const worker = new Worker(
        new URL("DbWorker.worker.js", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (e: MessageEvent<DbWorkerOutput>): void => {
        dbWorker.onMessage(e.data);
      };
      const dbWorker: DbWorker = {
        postMessage: (input) => {
          worker.postMessage(input);
        },
        onMessage: Function.constVoid,
      };
      return dbWorker;
    }

    if (platform.name === "web-without-opfs") {
      const promise = Effect.promise(() => import("./DbWorker.web.js")).pipe(
        Effect.map(({ dbWorker: importedDbWorker }) => {
          importedDbWorker.onMessage = dbWorker.onMessage;
          return importedDbWorker.postMessage;
        }),
        Effect.runPromise,
      );
      const dbWorker: DbWorker = {
        postMessage: (input) => {
          void promise.then((postMessage) => {
            postMessage(input);
          });
        },
        onMessage: Function.constVoid,
      };
      return dbWorker;
    }

    return DbWorker.of({
      postMessage: Function.constVoid,
      onMessage: Function.constVoid,
    });
  }),
);

export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>,
): React<To>["hooks"] => {
  const dbWorkerLive = PlatformLive.pipe(Layer.provide(DbWorkerLive));

  // console.log(schemaToEvoluSchema(schema));

  return React.pipe(
    Effect.map((react) => react.hooks as React<To>["hooks"]),
    Effect.provideLayer(
      Layer.mergeAll(
        Layer.mergeAll(
          dbWorkerLive,
          ConfigLive(config),
          Layer.mergeAll(PlatformLive, ConfigLive(config)).pipe(
            Layer.provide(AppStateLive),
          ),
          Layer.mergeAll(
            dbWorkerLive,
            NanoIdLive,
            OnCompletesLive,
            TimeLive,
            SubscribedQueriesLive,
            LoadingPromisesLive,
          ).pipe(Layer.provide(MutateLive)),
          Layer.mergeAll(dbWorkerLive, Bip39Live).pipe(
            Layer.provide(OwnerActionsLive),
          ),
          Layer.mergeAll(
            dbWorkerLive,
            OnCompletesLive,
            SubscribedQueriesLive,
            LoadingPromisesLive,
            RowsCacheStoreLive,
            FlushSyncLive,
          ).pipe(Layer.provide(QueryStoreLive)),
          SubscribedQueriesLive,
          Layer.succeed(Tables, schemaToTables(schema)),
        ).pipe(Layer.provide(EvoluLive)),
        PlatformLive,
      ).pipe(Layer.provide(ReactLive)),
    ),
    Effect.runSync,
  );
};
