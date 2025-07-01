---
"@evolu/common": patch
---

Enhance message integrity by embedding timestamps in encrypted data

- Add timestamp tamper-proofing to encrypted CRDT messages by embedding the timestamp within the encrypted payload
- Update `encodeAndEncryptDbChange` to accept `CrdtMessage` instead of `DbChange` and include timestamp in encrypted data
- Update `decryptAndDecodeDbChange` to verify embedded timestamp matches expected timestamp
- Add `ProtocolTimestampMismatchError` for timestamp verification failures
- Export `eqTimestamp` equality function for timestamp comparison
- Add `binaryTimestampLength` constant for consistent binary timestamp size
- Fix `Db.ts` to pass complete `CrdtMessage` to encryption functions
- Add test for timestamp tamper-proofing scenarios

This security enhancement prevents tampering with message timestamps by cryptographically binding them to the encrypted change data, ensuring message integrity and preventing replay attacks with modified timestamps.
