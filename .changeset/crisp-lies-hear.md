---
"@evolu/oxlint-config": patch
---

Updated eslint-plugin-jsdoc to 65.4.2

`no-undefined-types`, the only eslint-plugin-jsdoc rule the shared config runs, no longer reports a function type's own type parameter used inside a nested type, such as `T` in `<T>(x: Array<T>) => T`.
