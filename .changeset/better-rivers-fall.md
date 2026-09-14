---
"@evolu/common": patch
---

Reduced SQL template parameter validation overhead

The `sql` tagged template now validates only numeric parameters with `FiniteNumber`,
continuing to reject `NaN` and infinities while trusting the declared input types
for strings, blobs, and `null`. Invalid numbers now report `FiniteNumber` validation
errors directly.
