---
"@evolu/oxlint-config": patch
---

Allowed Node.js test registration promises to be ignored

Calls such as `describe` and `it` from `node:test` no longer require a `void` prefix. Other floating promises in test files remain errors.
