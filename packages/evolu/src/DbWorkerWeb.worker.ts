import { DbWorkerInput } from "./DbWorker.js";

// TODO: DbWorkerLive

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  // eslint-disable-next-line no-console
  console.log(e.data);
};
