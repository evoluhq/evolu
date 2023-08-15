import { Effect, Layer } from "effect";
import { Slip21Live } from "./Crypto.js";
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
import { throwNotImplemented } from "./Utils.js";

const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.sync(() => {
    const worker = new Worker(
      new URL("SyncWorker.web.worker.js", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e: MessageEvent<SyncWorkerOutput>): void => {
      syncWorker.onMessage(e.data);
    };

    const syncWorker: SyncWorker = {
      postMessage: (input) => {
        worker.postMessage(input);
      },
      onMessage: throwNotImplemented,
    };

    return syncWorker;
  })
);

Effect.gen(function* (_) {
  const dbWorker = yield* _(DbWorker);
  dbWorker.onMessage = (output): void => postMessage(output);
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
        Layer.mergeAll(HmacLive, Sha512Live).pipe(Layer.provide(Slip21Live)),
        NanoIdLive
      ).pipe(Layer.provide(DbInitLive)),
      Bip39Live,
      Layer.mergeAll(HmacLive, Sha512Live).pipe(Layer.provide(Slip21Live)),
      NanoIdLive
    ).pipe(Layer.provide(DbWorkerLive))
  ),
  Effect.runSync
);
