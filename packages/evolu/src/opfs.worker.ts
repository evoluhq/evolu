import { createDbWorkerLogic } from "./createDbWorkerLogic.js";
import { createWebDbEnv } from "./createWebDbEnv.js";
import { DbWorkerInput } from "./types.js";

const dbWorker = createDbWorkerLogic(createWebDbEnv("opfs"))(
  (message) => (): void => {
    postMessage(message);
  }
);

onmessage = ({ data: message }: MessageEvent<DbWorkerInput>): void => {
  dbWorker.post(message)();
};
