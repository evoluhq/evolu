---
"@evolu/common": minor
---

Moved SQL logs to the trace level

SQLite logged every query, its result, and each `begin`, `commit`, and
`rollback` at the `debug` level, so `debug` output was dominated by SQL. These
logs now use `trace`. Set the console level to `"trace"` to see them.

`createNativeConsoleOutput` now writes trace entries with native
`console.debug`, because native `console.trace` printed a stack trace with every
call. To log a stack, pass `new Error().stack` as an argument.
