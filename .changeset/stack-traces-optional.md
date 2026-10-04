---
"@evolu/common": patch
---

Fixed binary encoding errors in Safari before 17.2 and Firefox before 138

`BufferError` and the protocol's decoding error called
`Error.captureStackTrace`, which is not part of the JavaScript standard and
which Safari added in 17.2 and Firefox in 138. In earlier versions, creating
either error threw a `TypeError` instead. Decoding invalid bytes failed with
that `TypeError` rather than a `BufferError`, a malformed protocol message was
reported with it rather than the reason, and a mutation with a JSON string
nested more than 1,000 levels deep threw instead of storing the string. Neither
error calls it anymore; the `Error` constructor already records the stack trace.
