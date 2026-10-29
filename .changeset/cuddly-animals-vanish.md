---
"@evolu/common": patch
---

Bounded the memory decodeJsonValue uses for nested arrays

`decodeJsonValue` reserved room for each array's declared length before reading it, so a deliberately crafted value of many nested arrays could make it use hundreds of megabytes before reporting the value as invalid. Evolu decodes JSON columns of synced changes with it only after decrypting them, so such a value could come only from a device that holds the owner's keys. The arrays of one value can now reserve no more elements than the value has bytes, and valid values decode as before.
