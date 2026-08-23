---
"@evolu/common": patch
---

Removed `SetUnexpectedPrototypeError` from Set validation

The `set` Type no longer reports a prototype-specific error.
`SetUnexpectedPrototypeError` was removed, and `SetError` now contains only
`SetNotSetError` and `SetItemsError`.

Evolu does not support subclassing native JavaScript objects. Code must pass
ordinary Sets and must not depend on how a Set subclass is classified.
