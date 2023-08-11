import { Effect, Layer } from "effect";
import {
  Bip39Live,
  HmacLive,
  NanoIdLive,
  Sha512Live,
} from "./CryptoLive.web.js";
import { DbInitLive } from "./Db.js";
import { DbWorker, DbWorkerInput, DbWorkerLive } from "./DbWorker.js";
import { SqliteLive } from "./SqliteLive.web.js";
import { SyncWorker, SyncWorkerOutput } from "./SyncWorker.js";

const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.sync(() => {
    const syncWorker = new Worker(
      new URL("SyncWorker.web.worker.js", import.meta.url),
      { type: "module" }
    );

    const postMessage: SyncWorker["postMessage"] = (input) => {
      syncWorker.postMessage(input);
    };

    const onMessage: SyncWorker["onMessage"] = (callback) => {
      onmessage = (e: MessageEvent<SyncWorkerOutput>): void => {
        callback(e.data);
      };
    };

    return SyncWorker.of({ postMessage, onMessage });
  })
);

Effect.gen(function* (_) {
  const dbWorker = yield* _(DbWorker);
  dbWorker.onMessage(postMessage);
  onmessage = (e: MessageEvent<DbWorkerInput>): void => {
    dbWorker.postMessage(e.data);
  };
}).pipe(
  Effect.provideLayer(
    Layer.mergeAll(
      SqliteLive,
      SyncWorkerLive,
      Layer.mergeAll(
        SqliteLive,
        Bip39Live,
        HmacLive,
        Sha512Live,
        NanoIdLive
      ).pipe(Layer.provide(DbInitLive))
    ).pipe(Layer.provide(DbWorkerLive))
  ),
  Effect.runSync
);
