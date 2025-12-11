---
"@evolu/common": major
"@evolu/web": major
"@evolu/react-native": major
"@evolu/react-web": major
---

Refactored worker abstraction to support all platforms uniformly:

- Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
- Added worker-side interfaces: `WorkerScope<Input, Output>` and `SharedWorkerScope<Input, Output>` that extend `GlobalErrorScope` for unified error handling
- Changed `onMessage` from a method to a property for consistency with Web APIs
- Made all worker and message port interfaces `Disposable` for proper resource cleanup
- Added default generic parameters (`Output = never`) for simpler one-way communication patterns
- Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerScope`, `createSharedWorkerScope`, `createMessagePort`
- Added React Native polyfills for Workers and MessageChannel
