---
"@evolu/common": major
---

Add `ownerId` to all protocol errors (except ProtocolInvalidDataError) and update version negotiation to always include ownerId.

- Improved protocol documentation for versioning and error handling.
- Improved E2E tests for protocol version negotiation.
- Ensured all protocol errors (except for malformed data) are associated with the correct owner.
