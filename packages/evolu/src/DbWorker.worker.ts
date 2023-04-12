import * as DbWorker from "./DbWorker.js";
import * as Sqlite from "./Sqlite.web.js";

const dbWorker = DbWorker.create(Sqlite.create("opfs"))((output) =>
  postMessage(output)
);

onmessage = ({ data: input }: MessageEvent<DbWorker.Input>): void =>
  dbWorker.post(input);
