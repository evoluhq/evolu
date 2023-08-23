// import { Effect, Function, Layer } from "effect";
// import { Slip21Live } from "./Crypto.js";
// import {
//   Bip39Live,
//   HmacLive,
//   NanoIdLive,
//   Sha512Live,
// } from "./CryptoLive.native.js";
// import { DbWorker, DbWorkerLive } from "./DbWorker.js";
// import { SqliteLive } from "./SqliteLive.native.js";
// import { SyncWorker, SyncWorkerOutput } from "./SyncWorker.js";

// // It's a separate file because it's imported dynamically and by Web Worker.

// const SyncWorkerLive = Layer.effect(
//   SyncWorker,
//   Effect.sync(() => {
//     const worker = new Worker(
//       new URL("SyncWorker.worker.js", import.meta.url),
//       { type: "module" },
//     );
//     worker.onmessage = (e: MessageEvent<SyncWorkerOutput>): void => {
//       syncWorker.onMessage(e.data);
//     };
//     const syncWorker: SyncWorker = {
//       postMessage: (input) => {
//         worker.postMessage(input);
//       },
//       onMessage: Function.constVoid,
//     };
//     return syncWorker;
//   }),
// );

// export const dbWorker = Effect.provideLayer(
//   DbWorker,
//   Layer.use(
//     DbWorkerLive,
//     Layer.mergeAll(
//       SqliteLive,
//       Bip39Live,
//       Layer.use(Slip21Live, Layer.merge(HmacLive, Sha512Live)),
//       NanoIdLive,
//       SyncWorkerLive,
//     ),
//   ),
// ).pipe(Effect.runSync);
