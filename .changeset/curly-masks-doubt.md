---
"evolu": major
---

Better and more versatile encryption

For the upcoming integration of Evolu with Trezor (a cryptographic hardware wallet developed by SatoshiLabs), we changed the owner id and encryption key derivation to use SLIP-21 (hierarchical derivation of symmetric keys).

As a result, the existing owner will get a new id and encryption key, requiring all data to be re-sync. Evolu provides automatic migration for these breaking changes, so no further actions are needed.
