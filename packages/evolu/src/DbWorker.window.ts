import * as DbWorker from "./DbWorker.js";
import * as Sqlite from "./Sqlite.web.js";

export const createDbWorker: DbWorker.CreateDbWorker = DbWorker.create(
  Sqlite.create("localStorage")
);
