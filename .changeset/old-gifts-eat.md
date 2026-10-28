---
"@evolu/oxlint-config": patch
"@evolu/nodejs": patch
---

Required oxlint-tsgolint 7.0.2005

oxlint 1.90 and later require oxlint-tsgolint 7.0.2005 or later, so the previous pin to 7.0.2004 conflicted with current oxlint. `@evolu/oxlint-config` and `@evolu/nodejs` now require oxlint-tsgolint 7.0.2005 and still accept oxlint `^1.87.0`.
