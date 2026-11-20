---
"@evolu/common": minor
---

Added MnemonicFromString

`Mnemonic` accepts only its canonical spelling, lowercase words separated by single spaces, so apps had to convert what a user typed before validating it, and a mnemonic typed on a phone, whose keyboard capitalizes the first word, failed. `MnemonicFromString` converts typed or pasted text to lowercase NFKD with single spaces between its words and validates it as a `Mnemonic`.

```ts
import { assertOk, MnemonicFromString } from "@evolu/common";

const typed =
  "Abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

assertOk(
  MnemonicFromString.fromUnknown(typed),
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
);
```
