---
"@evolu/common": major
---

Replace NanoID with Evolu Id

Evolu now uses its own ID format instead of NanoID:

- **Evolu Id**: 16 random bytes from a cryptographically secure random generator, encoded as 22-character Base64Url string (128 bits of entropy)
- **Breaking change**: ID format changes from 21 to 22 characters
- **Why**: Provides standard binary serialization (16 bytes), more entropy than NanoID, and native Base64Url encoding support across platforms
