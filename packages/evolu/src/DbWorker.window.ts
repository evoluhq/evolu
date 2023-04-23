import * as DbWorkerWorkflow from "./DbWorkerWorkflow.js";
import { createSqlite } from "./Sqlite.web.js";

export const createDbWorker = DbWorkerWorkflow.create(
  createSqlite("localStorage")
);
