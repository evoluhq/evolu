---
"@evolu/common": patch
---

Add MaybeAsync type and isAsync type guard

`MaybeAsync<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This pattern provides performance benefits by avoiding microtask overhead for synchronous operations while maintaining composability.

`isAsync()` is a type guard to check if a MaybeAsync value is async, allowing conditional await only when necessary.
