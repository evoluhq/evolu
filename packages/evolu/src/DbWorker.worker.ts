import * as DbWorkerWorkflow from "./DbWorkerWorkflow.js";
import * as DbWorker from "./DbWorker.js";
import * as Sqlite from "./Sqlite.web.js";

const dbWorker = DbWorkerWorkflow.create(Sqlite.create("opfs"))((message) => {
  postMessage(message);
});

onmessage = ({ data: message }: MessageEvent<DbWorker.Input>): void => {
  dbWorker.post(message);
};
