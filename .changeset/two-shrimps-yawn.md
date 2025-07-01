---
"@evolu/common": patch
---

Add protocol versioning to EncryptedDbChange

Protocol version is now encoded as the first field in EncryptedDbChange binary format. This enables safe evolution of the format while maintaining backward compatibility.
