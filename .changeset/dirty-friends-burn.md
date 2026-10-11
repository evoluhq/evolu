---
"@evolu/common": patch
---

Rejected TimestampBytes that encode no Timestamp

`TimestampBytes` accepted any 16 bytes, including a millis part of 2^48 - 1,
which `Millis` reserves for infinity, so `timestampBytesToTimestamp` turned such
bytes into a `Timestamp` with invalid `Millis`. `TimestampBytes` now rejects
them with `TimestampBytesError`. `decryptAndDecodeDbChange` validates the
timestamp inside a decrypted change, so a change that carries such a timestamp
is a `ProtocolInvalidDataError`, which sync skips like any change it cannot
decode, instead of a `ProtocolTimestampMismatchError` with an invalid
timestamp.
