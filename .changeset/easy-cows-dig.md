---
"@evolu/common": patch
"@evolu/nodejs": patch
"@evolu/oxlint-config": patch
"@evolu/react": patch
"@evolu/react-native": patch
"@evolu/react-web": patch
"@evolu/sqlite-wasm": patch
"@evolu/svelte": patch
"@evolu/vitest": patch
"@evolu/vue": patch
"@evolu/web": patch
---

Added links to bundled source, API documentation, and tests

Package READMEs now point to the source, JSDoc documentation, usage examples,
and tests included in the installed version. They also clarify that application
imports use public package exports, since tests may import internal helpers.
