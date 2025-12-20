---
"@evolu/common": major
---

Changed `ok()` to return `Result<T, never>` and `err()` to return `Result<never, E>` for correct type inference.
