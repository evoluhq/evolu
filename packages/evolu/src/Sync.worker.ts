import { requestSync } from "./Browser.js";
import { sync } from "./SyncWorker.js";
import { SyncWorkerInput, SyncWorkerOnMessage } from "./Types.js";

const onMessage: SyncWorkerOnMessage = (message) => postMessage(message);

onmessage = ({ data }: MessageEvent<SyncWorkerInput>): void =>
  requestSync(() => sync({ ...data, onMessage }));
