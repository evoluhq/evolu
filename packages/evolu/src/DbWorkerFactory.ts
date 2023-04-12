import { constVoid } from "@effect/data/Function";
import * as Browser from "./Browser.js";
import * as DbWorker from "./DbWorker.js";

const createOpfsDbWorker: DbWorker.CreateDbWorker = (callback) => {
  const dbWorker = new Worker(new URL("./DbWorker.worker.js", import.meta.url));

  dbWorker.onmessage = (e: MessageEvent<DbWorker.Output>): void =>
    callback(e.data);

  return {
    post: (input) => dbWorker.postMessage(input),
  };
};

const createLocalStorageDbWorker: DbWorker.CreateDbWorker = (callback) => {
  const worker = import("./DbWorker.window.js");

  let dbWorker: DbWorker.DbWorker | null = null;

  return {
    post: (input): void => {
      worker.then(({ createDbWorker }) => {
        if (dbWorker == null) dbWorker = createDbWorker(callback);
        dbWorker.post(input);
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
