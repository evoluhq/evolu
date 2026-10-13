---
"@evolu/web": patch
---

Fixed createEvoluDeps throwing in Safari when the app didn't call installPolyfills

Safari doesn't have `DisposableStack` yet, and `createEvoluDeps` used it before
anything installed a polyfill, so a web app that didn't call `installPolyfills`
first threw on start in browsers without it. `createEvoluDeps` now installs
Evolu's polyfills itself where the browser lacks them: the resource-management
ones, such as `DisposableStack`, and the `Map` and `WeakMap` upsert methods.
Apps that already call `installPolyfills` don't need to change anything.
