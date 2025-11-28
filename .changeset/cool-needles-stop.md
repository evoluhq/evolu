---
"@evolu/common": minor
---

Added Redacted type for safely wrapping sensitive values

- `Redacted<A>` wrapper prevents accidental exposure via logging, serialization, or inspection
- `createRedacted(value)` creates a wrapper that returns `<redacted>` for toString/toJSON/inspect
- `revealRedacted(redacted)` explicitly retrieves the hidden value
- `isRedacted(value)` type guard for runtime checking
- `createEqRedacted(eq)` creates equality for redacted values
- Implements `Disposable` for automatic cleanup via `using` syntax
- Type-level distinction via branded inner types (e.g., `Redacted<ApiKey>` ≠ `Redacted<DbPassword>`)
