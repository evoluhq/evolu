---
"@evolu/common": patch
---

Stopped reporting aborts during resource cleanup as defects

When a Task was aborted while an `await using` resource was open and the
resource's cleanup also observed the abort, for example by awaiting a Fiber or
disposing a DisposableRun whose finalizer defected, JavaScript threw a
`SuppressedError` holding only AbortErrors. The Run reported it as a defect and
panicked, so aborting one `AbortableFiber` disposed the whole Run tree, and a
panic or a DisposableRun finalizer defect was reported a second time. Such a
`SuppressedError` is now an abort, as the same cleanup in `try`/`finally` is:
the Task aborts with the last cleanup AbortError. A DisposableRun finalizer that
rejects with an AbortError, such as one awaiting another DisposableRun whose
finalizer defected, is no longer reported either; async disposal rejects with
that AbortError. A `SuppressedError` containing any other error is still
reported whole.
