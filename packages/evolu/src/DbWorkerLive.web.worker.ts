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
import { runSync } from "./run.js";

Effect.gen(function* (_) {
  const dbWorker = yield* _(DbWorker);
  dbWorker.onMessage(postMessage);
  onmessage = (e: MessageEvent<DbWorkerInput>): void => {
    dbWorker.postMessage(e.data);
  };
}).pipe(
  Effect.provideLayer(
    Layer.merge(
      SqliteLive,
      Layer.mergeAll(
        SqliteLive,
        Bip39Live,
        HmacLive,
        Sha512Live,
        NanoIdLive
      ).pipe(Layer.provide(DbInitLive))
    ).pipe(Layer.provide(DbWorkerLive))
  ),
  runSync
);
