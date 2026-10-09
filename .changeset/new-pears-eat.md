---
"@evolu/common": patch
---

Fixed Mnemonic accepting other spellings of a mnemonic

`Mnemonic` checked the NFKD form of the text, so it accepted a mnemonic whose
words were separated by no-break or ideographic spaces, or written with
fullwidth letters, and kept that spelling. One mnemonic had many valid
spellings, and `ownerSecretToMnemonic` did not return the one that was
validated. `Mnemonic` now accepts only lowercase ASCII words separated by
single spaces. Convert other input to NFKD and separate its words with single
spaces before validating it.

```ts
import { assertErr, assertOk, Mnemonic } from "@evolu/common";

const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const fullwidth = mnemonic.replace("about", "\uFF41bout");

assertErr(Mnemonic.fromUnknown(fullwidth), { type: "Mnemonic" });
assertOk(Mnemonic.fromUnknown(fullwidth.normalize("NFKD")), mnemonic);
```
