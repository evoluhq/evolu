import "@effect/schema/Schema";
import "client-only";
import { Effect, Function, Layer } from "effect";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { throwNotImplemented } from "./Utils.js";
import { makeEvoluCreate } from "./index.common.js";
export * from "./exports.js";

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

const NoOpServerDbWorker = Effect.sync(() =>
  DbWorker.of({
    postMessage: Function.constVoid,
    onMessage: Function.constVoid,
  })
);

const OpfsDbWorker = Effect.sync(() => {
  const worker = new Worker(new URL("DbWorker.worker.js", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (e: MessageEvent<DbWorkerOutput>): void => {
    dbWorker.onMessage(e.data);
  };

  const dbWorker: DbWorker = {
    postMessage: (input) => {
      worker.postMessage(input);
    },
    onMessage: throwNotImplemented,
  };

  return dbWorker;
});

const LocalStorageDbWorker = Effect.sync(() => {
  const promise = Effect.promise(() => import("./DbWorker.web.js")).pipe(
    Effect.flatMap((a) => a.makeDbWorker),
    Effect.map((importedDbWorker) => {
      importedDbWorker.onMessage = dbWorker.onMessage;
      return importedDbWorker.postMessage;
    }),
    Effect.runPromise
  );

  const dbWorker = DbWorker.of({
    postMessage: (input) => {
      void promise.then((postMessage) => {
        postMessage(input);
      });
    },
    onMessage: throwNotImplemented,
  });

  return dbWorker;
});

const DbWorkerLive = Layer.effect(
  DbWorker,
  isServer
    ? NoOpServerDbWorker
    : isChromeWithOpfs() || isFirefoxWithOpfs()
    ? OpfsDbWorker
    : LocalStorageDbWorker
);

export const create = makeEvoluCreate(DbWorkerLive);
