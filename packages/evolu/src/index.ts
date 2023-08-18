import "client-only";
export * from "./exports.js";

import "@effect/schema/Schema";
import * as S from "@effect/schema/Schema";
import { Effect, Function, Layer } from "effect";
import { Config, ConfigLive } from "./Config.js";
import { Bip39Live, NanoIdLive } from "./CryptoLive.web.js";
import { Schema } from "./Db.js";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { EvoluLive } from "./Evolu.js";
import { LoadingPromisesLive } from "./LoadingPromises.js";
import { MutateLive } from "./Mutate.js";
import { OnCompletesLive } from "./OnCompletes.js";
import { OwnerActionsLive } from "./OwnerActions.js";
import { Platform } from "./Platform.js";
import { AppStateLive, FlushSyncLive, PlatformLive } from "./Platform.web.js";
import { QueryStoreLive } from "./QueryStore.js";
import { React, ReactLive } from "./React.js";
import { RowsCacheStoreLive } from "./RowsCache.js";
import { SubscribedQueriesLive } from "./SubscribedQueries.js";
import { TimeLive } from "./Timestamp.js";

const NoOpServerDbWorker = Effect.sync(() =>
  DbWorker.of({
    postMessage: Function.constVoid,
    onMessage: Function.constVoid,
  }),
);

const OpfsDbWorker = Effect.sync(() => {
  const worker = new Worker(new URL("DbWorker.worker.js", import.meta.url), {
    type: "module",
  });

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
});

const LocalStorageDbWorker = Effect.sync(() => {
  const promise = Effect.promise(() => import("./DbWorkerWebLive.js")).pipe(
    Effect.map((a) => {
      const importedDbWorker = DbWorker.pipe(
        Effect.provideLayer(a.DbWorkerWebLive),
        Effect.runSync,
      );
      importedDbWorker.onMessage = dbWorker.onMessage;
      return importedDbWorker.postMessage;
    }),
    Effect.runPromise,
  );

  const dbWorker = DbWorker.of({
    postMessage: (input) => {
      void promise.then((postMessage) => {
        postMessage(input);
      });
    },
    onMessage: Function.constVoid,
  });

  return dbWorker;
});

const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.gen(function* (_) {
    const platform = yield* _(Platform);
    return yield* _(
      platform.name === "server"
        ? NoOpServerDbWorker
        : platform.name === "web-with-opfs"
        ? OpfsDbWorker
        : LocalStorageDbWorker,
    );
  }),
);

export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>,
): React<To>["hooks"] => {
  const configLive = ConfigLive(config);

  const dbWorkerLive = PlatformLive.pipe(Layer.provide(DbWorkerLive));

  const appStateLive = Layer.mergeAll(PlatformLive, configLive).pipe(
    Layer.provide(AppStateLive),
  );

  const mutateLive = Layer.mergeAll(
    dbWorkerLive,
    NanoIdLive,
    OnCompletesLive,
    TimeLive,
    SubscribedQueriesLive,
    LoadingPromisesLive,
  ).pipe(Layer.provide(MutateLive));

  const ownerActionsLive = Layer.mergeAll(dbWorkerLive, Bip39Live).pipe(
    Layer.provide(OwnerActionsLive),
  );

  const queryStoreLive = Layer.mergeAll(
    dbWorkerLive,
    OnCompletesLive,
    SubscribedQueriesLive,
    LoadingPromisesLive,
    RowsCacheStoreLive,
    FlushSyncLive,
  ).pipe(Layer.provide(QueryStoreLive));

  const evoluLive = Layer.mergeAll(
    dbWorkerLive,
    configLive,
    appStateLive,
    mutateLive,
    ownerActionsLive,
    queryStoreLive,
    SubscribedQueriesLive,
  ).pipe(Layer.provide(EvoluLive(schema)));

  const reactLive = Layer.mergeAll(evoluLive, PlatformLive).pipe(
    Layer.provide(ReactLive),
  );

  return React.pipe(
    Effect.map((react) => react.hooks as React<To>["hooks"]),
    Effect.provideLayer(reactLive),
    Effect.runSync,
  );
};
