---
"@evolu/common": patch
"@evolu/nodejs": patch
---

Stopped logging the bytes of a request the relay can't decode

When the Node.js relay couldn't decode a request, it logged the whole failed
result with the request's bytes, which hold the OwnerId and the write key and
can be up to a megabyte. It now logs `invalid protocol request` with the
request's byte length and the decoding error.

`ProtocolInvalidDataError` no longer has a `data` property with the malformed
message's or change's bytes, so logging the error can't leak an OwnerId or a
write key. Code that read `data` can use the message or change it passed to
the function that returned the error.
