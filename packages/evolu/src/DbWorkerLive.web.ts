import { Function, Layer } from "effect";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { notImplemented } from "./Utils.js";

const isServer = typeof document === "undefined";

const isChromeWithOpfs = (): boolean =>
  navigator.userAgentData != null &&
  navigator.userAgentData.brands.find(
    ({ brand, version }) =>
      // Chrome or Chromium
      brand.includes("Chrom") && Number(version) >= 109
  ) != null;

const isFirefoxWithOpfs = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.indexOf("firefox") === -1) return false;
  const matches = userAgent.match(/firefox\/([0-9]+\.*[0-9]*)/);
  if (matches == null) return false;
  return Number(matches[1]) >= 111;
};

const makeNoOpServerDbWorker = (): DbWorker => ({
  postMessage: Function.constVoid,
  onMessage: Function.constVoid,
});

const makeOpfsDbWorker = (): DbWorker => {
  const worker = new Worker(
    new URL("DbWorkerLive.web.worker.js", import.meta.url),
    { type: "module" }
  );

  worker.onmessage = (e: MessageEvent<DbWorkerOutput>): void => {
    dbWorker.onMessage(e.data);
  };

  const dbWorker: DbWorker = {
    postMessage: (input) => worker.postMessage(input),
    onMessage: notImplemented,
  };

  return dbWorker;
};

const makeLocalStorageDbWorker = (): DbWorker => ({
  postMessage: Function.constVoid,
  onMessage: Function.constVoid,
});

export const DbWorkerLive = Layer.succeed(
  DbWorker,
  isServer
    ? makeNoOpServerDbWorker()
    : isChromeWithOpfs() || isFirefoxWithOpfs()
    ? makeOpfsDbWorker()
    : makeLocalStorageDbWorker()
);
