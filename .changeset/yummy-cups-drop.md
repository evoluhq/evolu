---
"@evolu/common": patch
---

Improve getOrThrow: throw a standard Error with `cause` instead of stringifying the error.

- Before: `new Error(`Result error: ${JSON.stringify(err)}`)`
- After: `new Error("getOrThrow failed", { cause: err })`

Why:

- Preserve structured business errors for machine parsing via `error.cause`.
- Avoid brittle stringified error messages and preserve a proper stack trace.
