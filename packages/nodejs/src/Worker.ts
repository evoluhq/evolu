// TODO: Implement Node.js Worker API
//
// This module should provide Node.js implementations of the common Worker API:
// - createWorker
// - createWorkerSelf (with onError hooking process.on('uncaughtException') and
//   process.on('unhandledRejection'))
// - createMessageChannel
// - createMessagePort
//
// Node.js uses worker_threads module for Worker/MessageChannel/MessagePort.
// Error handling uses process events instead of globalThis.onerror.
