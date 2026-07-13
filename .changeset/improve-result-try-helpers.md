---
"@evolu/common": minor
---

Improved `trySync` and `tryAsync` exception handling

`trySync` and `tryAsync` now return the original thrown or rejected value as `Err` when no error mapper is provided. Error mappers can throw when a failure must be escalated instead of represented as a `Result`.

`tryAsync` now accepts synchronous and asynchronous return values while preserving its asynchronous boundary.