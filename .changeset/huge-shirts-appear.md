---
"@evolu/common": patch
---

Fixed JSON text with a lone surrogate reading differently on older devices

`JSON.stringify` writes a lone surrogate, such as one left by cutting a string
in the middle of an emoji, as an escape like `\ud83d`. Evolu sent a string value
holding such JSON text in its compact JSON encoding, which `@evolu/common` 8.6
and earlier decode with the surrogate replaced by U+FFFD. Devices on those
versions stored different text for the same change without noticing. Such text
is now sent as a plain string, which every version decodes exactly.
