---
"@evolu/common": minor
---

Fixed the leak detector ignoring the console passed to createRun

`createRun` built its development leak detector with a default console of its
own, so a worker's leak warnings never reached the console the worker passed,
and its tabs never saw them. The leak detector now reports to the console passed
to `createRun`, and `createRunDefaultDeps` accepts a `console` for the same
purpose. `testCreateRun` does the same, so a test that passes a console sees the
warnings of `leakDetector.collect()` there.
