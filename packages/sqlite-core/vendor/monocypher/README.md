# Monocypher

Monocypher provides the XChaCha20-Poly1305 that `src/evolu_xchacha.c` wraps
for Evolu's sync messages.

## Origin

- Project: https://github.com/LoupVaillant/Monocypher
- Release: 4.0.3, published 2026-06-15, tag `4.0.3` (commit
  `ab2b16dd619ad5f6979a4fbe69cfa324a6fcc35f`)
- Source: the release asset
  https://github.com/LoupVaillant/Monocypher/releases/download/4.0.3/monocypher-4.0.3.tar.gz,
  SHA-256 `8cc9bc341a66249016db9bd70e9142d8d0aef9945973744b1ac05dbc55d8ee66`,
  which matches the digest GitHub lists for the asset
- Licence: BSD-2-Clause or CC0-1.0, at the user's choice (`LICENCE.md`)

## Files

The files are copied byte for byte from the release archive and must not be
edited, which `test/vendor.test.mts` checks against the digests below. To
upgrade, copy them from a newer release whose digest was checked,
then update this file.

| File           | From archive path                   | SHA-256                                                            | Why                                                                                                        |
| -------------- | ----------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `monocypher.c` | `monocypher-4.0.3/src/monocypher.c` | `57eb914fc88136119bd41655cccb8c250048bf54d470540625186f8ab16f64be` | The implementation: `crypto_aead_lock`, `crypto_aead_unlock` (XChaCha20-Poly1305) and `crypto_wipe`        |
| `monocypher.h` | `monocypher-4.0.3/src/monocypher.h` | `c494da712122da7ff679fdcf318a5317e84972b6c950fe9d896212947797facd` | Declarations of the above                                                                                  |
| `LICENCE.md`   | `monocypher-4.0.3/LICENCE.md`       | `5f8360e4c06ddcc584bdb4b210c6af824c4bb301e6a9a521869b6d90795ca4b3` | The licence and copyright notices, which artifacts containing Monocypher ship in their third-party notices |

Nothing else is copied: not `src/optional/` (SHA-512 and Ed25519, which the
core takes from BearSSL or doesn't need), the tests, the documentation or the
scripts. The rest of `monocypher.c` (BLAKE2b, Argon2, X25519, EdDSA, Elligator)
is compiled but unused.

## Symbols

Monocypher defines its functions under global `crypto_*` names. The Node.js
addon hides them with `-fvisibility=hidden`, but hidden visibility limits only
the dynamic symbol table: a static link, as the React Native module's iOS pod
and Android library are, still resolves and can clash with another library's
`crypto_*` symbols. So the React Native build renames every vendored symbol,
SQLite's, Monocypher's `crypto_*` and BearSSL's `br_*`, with one compile-time
prefixing header, `evolu_names.h`, which
`packages/react-native/scripts/vendor-native.mts` writes, and which keeps these
files byte for byte.
