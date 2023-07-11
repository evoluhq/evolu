import { createCreateDbWorker } from "./DbWorker.js";
import { createSqlite } from "./Sqlite.web.js";

export const createDbWorker = createCreateDbWorker(
  createSqlite("localStorage"),
);
