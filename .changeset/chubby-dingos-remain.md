---
"@evolu/common": patch
---

Fixed Mnemonic and SimplePassword errors exposing the secret

`Mnemonic` errors contained the rejected mnemonic and printed it, so a single
mistyped word exposed the rest of the secret. A valid mnemonic with surrounding
whitespace, such as one pasted with a trailing newline, failed with a `Trimmed`
error that printed the whole secret. `SimplePassword` errors printed the
password the same way.

Every string these Types reject now fails with a `MnemonicError` that has no
`value`, or with a `SimplePasswordError` whose `reason` is `"Untrimmed"`,
`"TooLong"`, or `"TooShort"`. Their messages no longer contain the input, and
both Types keep their Output types. Code that read `value` from a
`MnemonicError`, or that handled `Trimmed`, `MinLength`, or `MaxLength` errors
from these Types, must use the input it validated and the new errors instead.
In `localizeTypes`, these Types now take the `String` formatter and their own
`formatMnemonicError` or `formatSimplePasswordError` instead of the `Trimmed`,
`MinLength`, and `MaxLength` formatters, and every locale of
`@evolu/common/intl` exports `formatSimplePasswordError`.

```ts
import {
  assert,
  assertEqual,
  assertErr,
  Mnemonic,
  SimplePassword,
} from "@evolu/common";

const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const result = Mnemonic.fromUnknown(`${mnemonic}\n`);
assertErr(result, { type: "Mnemonic" });
assert(result.error.type === "Mnemonic", "Expected a MnemonicError.");
// @ts-expect-error MnemonicError no longer contains the rejected value.
const _withValue: { readonly value: string } = result.error;
assertEqual(
  Mnemonic.formatError(result.error),
  "The value is not a valid English BIP39 mnemonic.",
);

assertErr(SimplePassword.fromUnknown(" correct horse "), {
  type: "SimplePassword",
  reason: "Untrimmed",
});
```
