/**
 * Typed wrapper for Web Worker
 *
 * While Comlink DX is nice, there are still memory leaks and unresolved bugs.
 * Use plain Web Worker with a typed wrapper if maximum performance and
 * reliability are required.
 *
 * @module
 */

// import { constVoid, Worker } from "@evolu/common";

// /**
//  * Wraps a Web Worker to provide a typed interface for sending and receiving
//  * messages.
//  */
// export const wrapWebWorker = <Input, Output>(
//   createWebWorker: () => globalThis.Worker,
// ): Worker<Input, Output> => {
//   // Server.
//   if (typeof document === "undefined")
//     return {
//       postMessage: constVoid,
//       onMessage: constVoid,
//       [Symbol.dispose]: constVoid,
//     };

//   const webWorker = createWebWorker();

//   const worker: Worker<Input, Output> = {
//     postMessage: (message) => {
//       webWorker.postMessage(message);
//     },

//     onMessage: (callback) => {
//       webWorker.onmessage = (event: MessageEvent<Output>) => {
//         callback(event.data);
//       };
//     },

//     [Symbol.dispose]: () => {
//       throw new Error("TODO");
//     },
//   };

//   return worker;
// };

// export const wrapWebWorkerSelf = <Input, Output>(
//   worker: Worker<Input, Output>,
// ): void => {
//   worker.onMessage((message) => {
//     postMessage(message);
//   });

//   self.onmessage = (event: MessageEvent<Input>) => {
//     worker.postMessage(event.data);
//   };
// };
