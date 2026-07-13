---
"@evolu/common": minor
---

Added `disposable` and `isDisposable` for safe object disposal

`disposable` adds synchronous or asynchronous disposal to an object and prevents its methods from being called after disposal. It can own an existing `DisposableStack` or `AsyncDisposableStack`, transferring the stack's resources to the returned object.

`isDisposable` checks whether a value implements synchronous or asynchronous JavaScript disposal.
