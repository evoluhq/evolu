import * as DbWorkerWorkflow from "./DbWorkerWorkflow.js";
import * as Sqlite from "./Sqlite.web.js";

export const createDbWorker = DbWorkerWorkflow.create(
  Sqlite.create("localStorage")
);
