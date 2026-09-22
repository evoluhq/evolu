---
"@evolu/nodejs": patch
---

Measured production code in Vite bundle tests

The Vite adapter in `testBundle` now replaces `process.env.NODE_ENV` with
`"production"`, matching webpack. Development-only branches are removed before
bundles are executed and measured, so size snapshots no longer include that
development code.
