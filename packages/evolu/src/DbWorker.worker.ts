import { Effect } from "effect";
import { DbWorkerInput } from "./DbWorker.js";
import { DbWorkerWeb } from "./DbWorker.web.js";

const dbWorker = DbWorkerWeb.pipe(Effect.runSync);

dbWorker.onMessage = (output): void => postMessage(output);

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  dbWorker.postMessage(e.data);
};
