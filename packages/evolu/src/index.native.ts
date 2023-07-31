export * from "./exports.js";
import { DbWorkerLive } from "./DbWorkerLive.native.js";
import { makeEvoluCreate } from "./index.common.js";

export const create = makeEvoluCreate(DbWorkerLive);
