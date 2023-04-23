import { createCreateDbWorker } from "./DbWorker.js";
import { createSqlite } from "./Sqlite.web.js";
import { DbWorkerInput } from "./Types.js";

const dbWorker = createCreateDbWorker(createSqlite("opfs"))((message) => {
  postMessage(message);
});

onmessage = ({ data: message }: MessageEvent<DbWorkerInput>): void => {
  dbWorker.post(message);
};
