---
"@evolu/common": patch
---

Replace NanoID with Evolu Id

Evolu now uses its own ID format instead of NanoID:

- **Evolu Id**: 16 random bytes from a cryptographically secure random generator, encoded as 22-character Base64Url string (128 bits of entropy)
- **Breaking change**: ID format changes from 21 to 22 characters
- **Why**: Provides standard binary serialization (16 bytes), more entropy than NanoID (128 bits vs ~126 bits), and native Base64Url encoding support across platforms

See the `Id` type documentation for detailed design rationale comparing to NanoID, UUID v4, and UUID v7.
