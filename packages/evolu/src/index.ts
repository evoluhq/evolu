import * as S from "@effect/schema/Schema";
import { Effect, Function, Layer } from "effect";
import { Config, ConfigLive } from "./Config.js";
import { Schema, schemaToTables } from "./Db.js";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { Evolu, makeEvoluForPlatform } from "./Evolu.js";
import { Platform } from "./Platform.js";
import { ReactHooks, ReactHooksLive } from "./React.js";
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

// For React Fast Refresh, to ensure only one instance of Evolu exists.
let evolu: Evolu<Schema> | null = null;

export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>,
): ReactHooks<To> => {
  const tables = schemaToTables(schema);

  if (evolu == null) {
    evolu = makeEvoluForPlatform<To>(
      Layer.mergeAll(
        Layer.use(DbWorkerLive, PlatformLive),
        Bip39Live,
        NanoIdLive,
        FlushSyncLive,
        Layer.use(AppStateLive, Layer.merge(PlatformLive, ConfigLive(config))),
      ),
      tables,
      config,
    ) as Evolu<Schema>;
  } else {
    evolu.ensureSchema(tables);
  }

  return Effect.provideLayer(
    ReactHooks<To>(),
    Layer.use(
      ReactHooksLive<To>(),
      Layer.merge(PlatformLive, Layer.succeed(Evolu<To>(), evolu as Evolu<To>)),
    ),
  ).pipe(Effect.runSync);
};
