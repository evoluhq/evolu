import { Effect, Layer } from "effect";
import { DbWeb } from "./DbWeb.js";
import { DbWorker, DbWorkerInput, DbWorkerLive } from "./DbWorker.js";
import { runSync } from "./utils.js";

DbWorker.pipe(
  Effect.map((dbWorker) => {
    onmessage = (e: MessageEvent<DbWorkerInput>): void => {
      dbWorker.postMessage(e.data);
    };
    dbWorker.onMessage(postMessage);
  }),
  Effect.provideLayer(DbWeb.pipe(Layer.provide(DbWorkerLive))),
  runSync
);
