---
"@evolu/oxlint-config": patch
"@evolu/nodejs": patch
---

Required oxlint 1.87 and oxlint-tsgolint 7.0.2004

oxlint 1.86 and later require oxlint-tsgolint 7.0.2003 or later, so the previous peers, oxlint `^1.79.0` with oxlint-tsgolint pinned to 7.0.2001, conflicted with current oxlint. `@evolu/oxlint-config` and `@evolu/nodejs` now require oxlint `^1.87.0` and oxlint-tsgolint 7.0.2004.

`@evolu/oxlint-config` also updates eslint-plugin-jsdoc to 65.
