---
"@evolu/common": patch
---

Rejected encrypted changes in a newer format

The plaintext of an encrypted change starts with a format version, but
`encodeAndEncryptDbChange` wrote `protocolVersion` there and
`decryptAndDecodeDbChange` ignored it, so a change in a future layout would have
been decoded into wrong values. The format version is now independent of
`protocolVersion`. New changes still carry 1, so their bytes do not change.
`decryptAndDecodeDbChange` returns `ProtocolInvalidDataError` for a version
greater than 1, so a client skips such a change and shows it on the relay's
route, as it does with any change it cannot decode, and stores it once an app
update can read it. Version 0, which 6.0.1-preview.35 wrote in the same layout,
still decodes.
