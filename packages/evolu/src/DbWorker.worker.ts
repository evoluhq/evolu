import { Effect } from "effect";
import { DbWorker, DbWorkerInput } from "./DbWorker.js";
import { dbWorkerLive } from "./DbWorkerLive.web.js";

const dbWorker = DbWorker.pipe(
  Effect.provideLayer(dbWorkerLive),
  Effect.runSync,
);

dbWorker.onMessage = (output): void => postMessage(output);

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  dbWorker.postMessage(e.data);
};
