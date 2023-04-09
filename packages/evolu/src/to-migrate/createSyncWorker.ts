import { IO } from "fp-ts/lib/IO.js";

export const createSyncWorker: IO<Worker> = () =>
  new Worker(new URL("./sync.worker.js", import.meta.url));
