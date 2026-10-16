---
"@evolu/common": patch
---

Kept the names of decoding errors in minified bundles

The `BufferError` or `ProtocolDecodeError` that a `ProtocolInvalidDataError`
holds took its name from its class, which a minifier renames, so production
builds showed a name such as `G`. Both now keep their names. On the web, an
error in sync state still shows `Error`, because the database worker posts it
to the shared worker, and structured cloning names every custom error `Error`.
