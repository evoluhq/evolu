import { Function, Layer } from "effect";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";

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
  const dbWorker = new Worker(
    new URL("DbWorkerLive.web.worker.js", import.meta.url),
    { type: "module" }
  );

  const postMessage: DbWorker["postMessage"] = (input) => {
    dbWorker.postMessage(input);
  };

  const onMessage: DbWorker["onMessage"] = (callback) => {
    dbWorker.onmessage = (e: MessageEvent<DbWorkerOutput>): void => {
      callback(e.data);
    };
  };

  return { postMessage, onMessage };
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
