---
"@evolu/common": minor
---

Added Task-aware HTTP helpers.

`fetch` consumes the native `Response` within the Task lifetime and supports text, JSON, bytes, headers-only, and custom response consumers. It distinguishes transport, HTTP status, and response body errors while preserving Task abort semantics.

`NativeFetchDep` makes the underlying fetch implementation replaceable at the composition root. Added deterministic native fetch test helpers for recording requests, queueing responses, and testing response body failures.
