import { Effect, Layer } from "effect";
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
  Effect.provideLayer(SqliteLive.pipe(Layer.provide(DbWorkerLive))),
  runSync
);
