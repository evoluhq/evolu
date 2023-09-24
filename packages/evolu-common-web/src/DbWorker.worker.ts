import { DbWorkerInput } from "@evolu/common";
import { dbWorker } from "./DbWorker.js";

dbWorker.onMessage = (output): void => {
  postMessage(output);
};

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  dbWorker.postMessage(e.data);
};
