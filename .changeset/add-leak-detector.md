---
"@evolu/common": minor
---

Added `LeakDetector` for development-time leak detection

`LeakDetector` uses `FinalizationRegistry` to report handles that are garbage-collected without explicit cleanup, including the stack where each handle was tracked. It is a no-op in production and in runtimes without `FinalizationRegistry`.

Evolu developers do not need to use `LeakDetector` directly. The upcoming Evolu Task and Resource APIs enable it by default in development mode.
