import { Effect } from "effect";
import { DbWorker, DbWorkerInput } from "./DbWorker.js";
import { DbWorkerWebLive } from "./DbWorkerWebLive.js";

const dbWorker = DbWorker.pipe(
  Effect.provideLayer(DbWorkerWebLive),
  Effect.runSync
);

dbWorker.onMessage = (output): void => postMessage(output);

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  dbWorker.postMessage(e.data);
};
