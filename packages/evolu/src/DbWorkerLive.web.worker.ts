import { Effect, Layer } from "effect";
import { DbLive } from "./DbLive.web.js";
import { DbWorker, DbWorkerInput, DbWorkerLive } from "./DbWorker.js";
import { runSync } from "./run.js";

DbWorker.pipe(
  Effect.map((dbWorker) => {
    onmessage = (e: MessageEvent<DbWorkerInput>): void => {
      dbWorker.postMessage(e.data);
    };
    dbWorker.onMessage(postMessage);
  }),
  Effect.provideLayer(DbLive.pipe(Layer.provide(DbWorkerLive))),
  runSync
);
