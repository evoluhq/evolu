import { constVoid } from "@effect/data/Function";
import * as Browser from "./Browser.js";
import * as DbWorker from "./DbWorker.js";

const createOpfsDbWorker: DbWorker.CreateDbWorker = (onMessage) => {
  const dbWorker = new Worker(new URL("./DbWorker.worker.js", import.meta.url));

  dbWorker.onmessage = (e: MessageEvent<DbWorker.Output>): void => {
    onMessage(e.data);
  };

  return {
    post: (message): void => {
      dbWorker.postMessage(message);
    },
  };
};

const createLocalStorageDbWorker: DbWorker.CreateDbWorker = (onMessage) => {
  const worker = import("./DbWorker.window.js");

  let dbWorker: DbWorker.DbWorker | null = null;

  return {
    post: (message): void => {
      worker.then(({ createDbWorker }) => {
        if (dbWorker == null) dbWorker = createDbWorker(onMessage);
        dbWorker.post(message);
      });
    },
  };
};

const createNoOpServerDbWorker: DbWorker.CreateDbWorker = () => ({
  post: constVoid,
});

// TODO: React Native, Electron.
export const createDbWorker: DbWorker.CreateDbWorker = Browser.isBrowser
  ? Browser.features.opfs
    ? createOpfsDbWorker
    : createLocalStorageDbWorker
  : createNoOpServerDbWorker;
