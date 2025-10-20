---
"@evolu/react-native": patch
"@evolu/common": patch
"@evolu/web": patch
---

Replace Mnemonic with OwnerSecret

OwnerSecret is the fundamental cryptographic primitive from which all owner keys are derived via SLIP-21. Mnemonic is just a representation of this underlying entropy. This change makes the type system more accurate and the cryptographic relationships clearer.
