---
"@evolu/oxlint-config": patch
---

Updated eslint-plugin-jsdoc to 65.3.1

Its `no-undefined-types` rule now knows the ECMAScript library types, such as `ReadonlyArray`, `PromiseLike`, and `Disposable`, so the shared config no longer lists them in `definedTypes`. Linting results stay the same.
