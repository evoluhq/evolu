---
"@evolu/common": patch
---

Fixed stale Run state inside abort callbacks

Abort callbacks could previously see their Run or shutting-down ancestors as
`Running`, because state updates happened after callbacks executed.

`Run.getState()` and `Run.snapshot()` now expose the abort request before
descendant callbacks execute, and the observed abort before the Run's own
callbacks execute.

A recorded request does not mean the Run's signal has aborted: ancestors can
still have `observed: null` during descendant callbacks, and abort masks can
delay observation.

Disposing an ancestor Run from an abort callback no longer emits duplicate
`StateChanged` events for that Run.
