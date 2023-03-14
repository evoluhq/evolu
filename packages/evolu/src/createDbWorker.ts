import { IO } from "fp-ts/IO";
import { constVoid } from "fp-ts/lib/function.js";
import {
  CreateDbWorker,
  DbWorker,
  DbWorkerOutput,
  PostDbWorkerInput,
} from "./types.js";
import { isServer } from "./utils.js";

const isChromeWithOpfs: IO<boolean> = () =>
  navigator.userAgentData != null &&
  navigator.userAgentData.brands.find(
    ({ brand, version }) =>
      // Chrome or Chromium
      brand.includes("Chrom") && Number(version) >= 109
  ) != null;

const isFirefoxWithOpfs: IO<boolean> = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.indexOf("firefox") === -1) return false;
  const matches = userAgent.match(/firefox\/([0-9]+\.*[0-9]*)/);
  if (matches == null) return false;
  return Number(matches[1]) >= 111;
};

const createNoOpServerDbWorker: CreateDbWorker = () => ({
  post: () => constVoid,
});

const createOpfsDbWorker: CreateDbWorker = (onMessage) => {
  const dbWorker = new Worker(new URL("./opfs.worker.js", import.meta.url));

  const post: PostDbWorkerInput = (message) => () =>
    dbWorker.postMessage(message);

  dbWorker.onmessage = (e: MessageEvent<DbWorkerOutput>): void =>
    onMessage(e.data)();

  return { post };
};

const createLocalStorageDbWorker: CreateDbWorker = (onMessage) => {
  const promise = import("./createLocalStorageDbWorker");
  let dbWorker: DbWorker | null = null;

  const post: PostDbWorkerInput = (message) => () => {
    promise.then(({ createLocalStorageDbWorker }) => {
      if (dbWorker == null) dbWorker = createLocalStorageDbWorker(onMessage);
      dbWorker.post(message)();
    });
  };

  return { post };
};

// TODO: React Native, Electron.
export const createDbWorker: CreateDbWorker = isServer
  ? createNoOpServerDbWorker
  : isChromeWithOpfs() || isFirefoxWithOpfs()
  ? createOpfsDbWorker
  : createLocalStorageDbWorker;
