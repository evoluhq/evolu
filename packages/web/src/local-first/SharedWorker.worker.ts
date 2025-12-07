/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

// // SharedWorker tracks leaders by instance name
// const leaders = new Map<SimpleName, {
//   port: MessagePort;
//   lastHeartbeat: number;
// }>();

// // Multiple ports can be registered for the same instance name
// // (same app open in multiple tabs)
// const portsByInstance = new Map<SimpleName, Set<MessagePort>>();

self.onconnect = (e) => {
  const _port = e.ports[0];

  //   port.onmessage = (ev) => {
  //     port.postMessage(ev.data + "_jo");
  //   };

  //   port.addEventListener("message", (e) => {
  //     const workerResult = `Result: ${e.data[0] * e.data[1]}`;
  //     port.postMessage(workerResult);
  //   });

  //   port.start(); // Required when using addEventListener. Otherwise called implicitly by onmessage setter.
};
