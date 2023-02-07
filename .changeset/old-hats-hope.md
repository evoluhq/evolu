---
"evolu": patch
---

Improve mnemonic code

- fix validateMnemonic checksum
- replace custom mnemonic code with audited lib @scure/bip39
- import code on demand to decrease library size
