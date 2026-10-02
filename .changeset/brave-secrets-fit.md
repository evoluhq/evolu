---
"@evolu/common": minor
---

Fixed OwnerSecret rejecting secrets from mnemonics shorter than 24 words

`mnemonicToOwnerSecret` accepts any valid `Mnemonic`, but it cast the decoded
entropy to an `OwnerSecret` typed as 32 bytes, although only a 24-word mnemonic
holds 32 bytes. A 12-word mnemonic produced a 16-byte secret that
`OwnerSecret.is` rejected. `OwnerSecret` now accepts 16, 20, 24, 28, or 32
bytes, the entropy of every BIP-39 mnemonic length, and `mnemonicToOwnerSecret`
validates instead of casting. Owners keep the same keys.

Shorter secrets are accepted for owners created by other apps, with less margin
against a future quantum computer, which can be an acceptable trade-off for
shorter backup phrases. `createOwnerSecret` still generates 32 random bytes, and
an owner is post-quantum safe only when its secret has 256 bits of entropy. See
[Post-quantum resistance](https://www.evolu.dev/docs/privacy#post-quantum-resistance).

Code that passed an `OwnerSecret` where `Entropy32` is required must now check
its length with `Entropy32.is`. The new `Entropy20` and `Entropy28` Types cover
the remaining lengths, and `createSlip21` accepts them.
