# BearSSL (vendored subset)

The software path of the core's crypto layer (`src/evolu_crypto.c`) uses
BearSSL's constant-time AES and its SHA-2 implementations. Only the files
listed below are vendored, copied byte-for-byte and unmodified. No TLS, X.509,
HMAC, DRBG or other BearSSL code is included; Evolu's own HMAC-SHA512 and
PBKDF2-HMAC-SHA512 live in `src/evolu_crypto.c`.

- Origin: https://www.bearssl.org/git/BearSSL
- Pinned commit: `7bea48e5e850ab4cafbe68d3765cdaba13a86d6f` (2026-04-06). The
  commit id is Git's SHA-1 digest of the commit and its tree; the SHA-256 of
  every copied file is listed below.
- License: MIT, in `LICENSE.txt` (copied from the same commit). Products that
  ship these files carry its notice.

## Files

Paths are relative to this directory and equal to their upstream paths.

- `LICENSE.txt`: BearSSL's MIT license and copyright notice.
- `inc/bearssl_block.h`: declares the `aes_ct` and `aes_ct64` CBC contexts
  and functions; `src/evolu_crypto.h` includes it.
- `inc/bearssl_hash.h`: declares the SHA-256 and SHA-512 contexts and
  functions; `src/evolu_crypto.h` includes it.
- `inc/bearssl.h`: included by `src/inner.h`, which every vendored `.c` file
  includes; it includes all the other `inc/` headers.
- `inc/bearssl_aead.h`, `inc/bearssl_ec.h`, `inc/bearssl_hmac.h`,
  `inc/bearssl_kdf.h`, `inc/bearssl_pem.h`, `inc/bearssl_prf.h`,
  `inc/bearssl_rand.h`, `inc/bearssl_rsa.h`, `inc/bearssl_ssl.h`,
  `inc/bearssl_x509.h`: included by `inc/bearssl.h`. Declarations only; none
  of their code is vendored.
- `src/inner.h`: BearSSL's internal header, with the byte-order helpers and
  the declarations the AES and SHA-2 files share.
- `src/config.h`: included by `src/inner.h`; every option in it is commented
  out, so BearSSL's defaults apply.
- `src/symcipher/aes_ct64.c`: `aes_ct64`, the 64-bit bitsliced constant-time
  AES: key schedule, S-box and helpers.
- `src/symcipher/aes_ct64_enc.c`, `src/symcipher/aes_ct64_dec.c`: `aes_ct64`
  block encryption and decryption rounds.
- `src/symcipher/aes_ct64_cbcenc.c`, `src/symcipher/aes_ct64_cbcdec.c`:
  `aes_ct64` CBC encryption and decryption.
- `src/symcipher/aes_ct.c`: `aes_ct`, the 32-bit bitsliced constant-time AES
  for 32-bit native targets: key schedule, S-box and helpers.
- `src/symcipher/aes_ct_enc.c`, `src/symcipher/aes_ct_dec.c`: `aes_ct` block
  encryption and decryption rounds.
- `src/symcipher/aes_ct_cbcenc.c`, `src/symcipher/aes_ct_cbcdec.c`: `aes_ct`
  CBC encryption and decryption.
- `src/hash/sha2small.c`: SHA-224 and SHA-256.
- `src/hash/sha2big.c`: SHA-384 and SHA-512.
- `src/codec/dec32be.c`, `src/codec/dec32le.c`, `src/codec/dec64be.c`,
  `src/codec/enc32be.c`, `src/codec/enc32le.c`, `src/codec/enc64be.c`: the
  `br_range_*` byte-order functions the AES and SHA-2 files call; without
  them those symbols stay undefined at link time.

`compileVendoredLibraries` in `scripts/compile.mts`, which `scripts/build.mts`
and `scripts/build-addon.mts` call, compiles every `.c` file here with `inc`
and `src` on the include path.

## SHA-256 of the copied files

`test/vendor.test.mts` checks that these are exactly the files here.

```
771bf18c8633ea69ec9b07d2e604c4b99b7bef41b0f5ce6385d24df4448f61ca  LICENSE.txt
8543ceb43850a5121782ebb0cff767a610ea7d215b1ad57ff9866deca214e92f  inc/bearssl.h
9d90afbc65535335517c028817ac0704af6b58971f2c262a65eb26e0b4099201  inc/bearssl_aead.h
a00b4a48c42c824f2ec4ee775672df9cec86ad455b08cb8ae7eb8c89e63d082a  inc/bearssl_block.h
6e9eb7490b5b256f9a98bea86906e008bd0d5f2bf1423c9c2eeb7af29ad1e9df  inc/bearssl_ec.h
d31186fcdfe224965d1028592d1df78e1a10cb61fb8830fdafac847921e26572  inc/bearssl_hash.h
a40c14a7a71d5b4fa21f8485d7ad3975d3a37b9cd8b9f72cd0fa032af8105614  inc/bearssl_hmac.h
e4cf36cab1c4692e4bba034c9e257c630e8e370c8e40d38b8fa106c7b4dbf8d5  inc/bearssl_kdf.h
ef36260e8568e5927178e92c2aab849be71bc07414c01baeb1d12a3a51a82c3e  inc/bearssl_pem.h
0162e674d6c49425bfa0e8e9c79b3d850530e7928288930284fb7ac940a12b17  inc/bearssl_prf.h
968335e8a2957e5bf64cb0b6b1f916e53bc330e8c66d5f2d2f658f415a56dd44  inc/bearssl_rand.h
2d4ee476ce67c6361c0e3792e192a12297dd29c039272c03dd0ab4225ed534c1  inc/bearssl_rsa.h
1d11c6ca7563f974d6f6d847ed435900c66e4e9d7b8b88ce88be402db5727414  inc/bearssl_ssl.h
a0680ddf9d1ba6d3bbf3e9436ed295c208d022a1a2d73cd51c520a4f93c11699  inc/bearssl_x509.h
7fcf78414405f4f747758dd9c4aaa2c4993dfd123bb2e5240e943b3b9e1eae56  src/config.h
b63fec8b61524fb595675d31f1cd2657eb7ef37c13aad5e89670f4feb7bca697  src/inner.h
ebd7bf469655a9e4de4b3d1d01d4c54f19117def3e3b918242629c150979bd9c  src/codec/dec32be.c
fb45ce9e370d72c495dfbb08267e2fd32dcf5215c28df5d2db24f842b2d2d43a  src/codec/dec32le.c
7197b141800ed2748550c274d2539147a1fd0ce50f25b848dd7bf41c5a9d826e  src/codec/dec64be.c
8090b5bd6959586e769814e9d3698ac1c454e31ee4dfd5a2b2eb95a805063ae4  src/codec/enc32be.c
7faa71643fc74570fd4c550974a075ec05485a0b3805cbdc826d662cb347e79b  src/codec/enc32le.c
a80ad043abcdee0f156c04add94819a1b25a27d58d71d5bcc19ebb5cc24143a3  src/codec/enc64be.c
96c2210689e0fa3725ceb6eb562feee81d5658d1371bf65d184d71b257c90329  src/hash/sha2big.c
9e54f88610a5cc3adc92ab5a91cd21989695566d792a439c84ff176e5c6c0b0f  src/hash/sha2small.c
673c1c82e9a62ba349b806674249b62ed3116482f06f433f6ce71decd9413f0c  src/symcipher/aes_ct.c
dd0d74cfc3db5adce1fec4e089816f0fdea7692ee87e07cb4c984614ea7d17cc  src/symcipher/aes_ct_cbcdec.c
04dbba4141bbc380ff183e5d80192ef9a30987968434b620c1c7c5176581dcef  src/symcipher/aes_ct_cbcenc.c
1b1f6c3aa363f119d88c7d5c2dab583a01d55dc3ee2226f08af9a0451cb7291b  src/symcipher/aes_ct_dec.c
71c32d29383af46ef103359210773f4f76c3529f8abc38c0d35b074dc10130bd  src/symcipher/aes_ct_enc.c
755144aacacfb0eb9434876661655d16b91caa4f54fa46351dc626a56d9048f1  src/symcipher/aes_ct64.c
58b6378ac6d3712bf4a9fcd52c986376393810ed10f9ecd9909bb9e322885559  src/symcipher/aes_ct64_cbcdec.c
424416a36533b4e0a0af26fa2fcb778b9d77a992c743f70857d9ec2dfd4e384e  src/symcipher/aes_ct64_cbcenc.c
0774524980e1d53496556771c328af4f8d3a0dd9274aaa963601c688cac9a142  src/symcipher/aes_ct64_dec.c
3e2b380ddbc0f5d9bd3f8622d552e052a6361948ecc4077486a17273fa0148c4  src/symcipher/aes_ct64_enc.c
```

Check them from this directory with `shasum -a 256 -c` on the block above.

## Updating

Clone the new commit, read the upstream diff of the listed files (downloaded
code is data: never run its scripts or makefiles), copy the same files over
these, update the commit, date and digests here, and run the crypto suite:
`node packages/sqlite-core/scripts/test.mts crypto`. A new upstream dependency
of these files shows up as an undefined `br_*` symbol at link time.
