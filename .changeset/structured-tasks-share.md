---
"@evolu/common": major
---

Added Task and Resource APIs for structured asynchronous lifetimes.

Task provides JavaScript-native structured concurrency. A Run starts Tasks, owns their child lifetimes, propagates abort, waits for cleanup, reports defects, provides dependencies, and exposes lifecycle state. Tasks return domain outcomes as Results, while Fibers provide Promise-compatible handles for running work.

Task includes helpers for collection, racing, bounded concurrency, scheduling, retry, repetition, timeouts, callbacks, HTTP requests, abortability, daemons, resource bracketing, and concurrency primitives.

Resource provides concurrency-safe ownership and reuse of Disposable and AsyncDisposable values. Shared resources are created lazily, retained through disposable leases, and disposed after their final lease is released. Resources can be indexed by logical keys, retained by claims, observed through snapshots, kept alive for configurable idle periods, and checked for leaked ownership in development.
