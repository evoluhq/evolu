---
"@evolu/common": patch
---

Added WriteKey rotation protocol support

- Added WriteKeyMode enum for protocol header (None/Single/Rotation)
- Updated protocol message structure with separate initiator/non-initiator headers
- Added createProtocolMessageForWriteKeyRotation function
- Added storage interface setWriteKey method
