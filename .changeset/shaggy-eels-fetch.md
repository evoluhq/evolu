---
"@evolu/common": patch
---

Dedupe messages created within the microtask queue

That's only for a case where someone accidentally calls mutate with the same values repeatedly. There is no reason to create identical messages.
