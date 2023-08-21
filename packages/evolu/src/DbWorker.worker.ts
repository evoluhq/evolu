import { DbWorkerInput } from "./DbWorker.js";
import { dbWorker } from "./DbWorker.web.js";

dbWorker.onMessage = (output): void => {
  postMessage(output);
};

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  dbWorker.postMessage(e.data);
};
