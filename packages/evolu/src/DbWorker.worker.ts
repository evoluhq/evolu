import * as DbWorkerWorkflow from "./DbWorkerWorkflow.js";
import { createSqlite } from "./Sqlite.web.js";
import { DbWorkerInput } from "./Types.js";

const dbWorker = DbWorkerWorkflow.create(createSqlite("opfs"))((message) => {
  postMessage(message);
});

onmessage = ({ data: message }: MessageEvent<DbWorkerInput>): void => {
  dbWorker.post(message);
};
