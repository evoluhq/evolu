---
"@evolu/react-native": patch
"@evolu/react-web": patch
"@evolu/common": patch
"@evolu/nodejs": patch
"@evolu/svelte": patch
"@evolu/react": patch
"@evolu/vue": patch
"@evolu/web": patch
---

Rename `Evolu` directory to `local-first`

Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.
