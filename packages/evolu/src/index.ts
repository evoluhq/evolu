import * as S from "@effect/schema/Schema";
import { Effect, Function, Layer } from "effect";
import { Config, ConfigLive } from "./Config.js";
import { Schema, Tables, schemaToTables } from "./Db.js";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { EvoluLive } from "./Evolu.js";
import { Platform } from "./Platform.js";
import { ReactHooks, ReactHooksLive } from "./React.js";
export * from "./exports.js";

import { Bip39Live, NanoIdLive } from "./CryptoLive.web.js";
import { AppStateLive, FlushSyncLive, PlatformLive } from "./Platform.web.js";
import { TimeLive } from "./Timestamp.js";

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
): ReactHooks<To> => {
  return ReactHooks<To>().pipe(
    Effect.provideLayer(
      Layer.use(
        ReactHooksLive<To>(),
        Layer.merge(
          PlatformLive,
          Layer.use(
            EvoluLive<To>(),
            Layer.mergeAll(
              Layer.use(DbWorkerLive, PlatformLive),
              Bip39Live,
              ConfigLive(config),
              Layer.succeed(Tables, schemaToTables(schema)),
              FlushSyncLive,
              NanoIdLive,
              TimeLive,
              Layer.use(
                AppStateLive,
                Layer.merge(PlatformLive, ConfigLive(config)),
              ),
            ),
          ),
        ),
      ),
    ),
    Effect.runSync,
  );
};
