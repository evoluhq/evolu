---
"@evolu/sqlite-wasm": patch
---

Computed the build guard hash with fnv1a32 from @evolu/common

The build guard that checks a loaded binary against the pinned build now hashes
with `fnv1a32` from `@evolu/common` instead of its own copy of FNV-1a, so this
release requires the `@evolu/common` release that adds `fnv1a32`. The hash and
`sqliteWasmBuildHash` are unchanged.
