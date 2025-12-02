---
"@evolu/common": minor
---

Added Resource Management polyfills

Provides `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack`, and `AsyncDisposableStack` for environments without native support (e.g., Safari). This enables the `using` and `await using` declarations for automatic resource cleanup.

Polyfills are installed automatically when importing `@evolu/common`.

See `Result.test.ts` for usage patterns combining `Result` with `using`, `DisposableStack`, and `AsyncDisposableStack`.
