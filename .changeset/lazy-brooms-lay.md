---
"@evolu/nodejs": patch
---

Allowed documentation examples to install Evolu's polyfills themselves

`testJSDocExamples` now preloads Evolu's polyfills in the process that runs the examples instead of adding an `installPolyfills` import to each example. An example that imports and calls `installPolyfills` itself no longer fails with a duplicate identifier, and the modules an example imports run with the polyfills already installed.
