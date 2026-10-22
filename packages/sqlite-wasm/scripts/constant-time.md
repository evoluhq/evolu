# Constant time in sqlite3.wasm

`scripts/constant-time.mts` lists this from the pinned `wasm/sqlite3.wasm` and the reviews it holds, and `scripts/constant-time.test.mts` fails when it changes. Its module documentation describes the inspection.

For each function of AES, SHA-512, HMAC-SHA512, PBKDF2 and the page codec around the tag comparison, it lists every `br_if`, `if`, `select`, `br_table` and `call_indirect`, and each load, store, `memory.copy`, `memory.fill`, call argument, `global.set`, division and remainder whose address, size or operand derives from a loaded value, a call's result or a parameter that holds a secret. `#N` is a function's Nth instruction as `wasm2wat` prints it, and `local N` and `global N` are its locals, parameters first, and the module's globals. Each loaded value and call result a finding derives from is reviewed as public or secret. The `if` at the start and end of a function with a stack frame is Emscripten's stack overflow check, which compares the stack pointer, `global 0`, with the stack's limits, `global 3` and `global 4`.

This shows that the wasm keeps the C's constant time, not that a machine runs it in constant time: wasm and its JIT compilers promise none.

## `evolu_aes256_init`, function 74

The core's `evolu_aes256_init`, with `evolu_aes256_init_with` and `aes256_ct64_init` inlined: wasm has no AES instructions, so it records the `aes_ct64` table and calls `br_aes_ct64_cbcenc_init` and `br_aes_ct64_cbcdec_init`, then wipes the stack.

Code sha256 `c5dc3157c6195a7ae5653c585c8d997591b5296c82b4b6a960fcfe9b58537a66`, 16 instructions.

No findings.

## `evolu_aes256_cbc_encrypt`, function 75

The core's `evolu_aes256_cbc_encrypt`: refuses a partial block, calls the context's implementation and wipes the stack.

Code sha256 `75b71b4ba261f6473907216ed31316750717ba98ead2552e3d714a4a9e5cdd71`, 20 instructions.

- #7 `if` with condition `i32.eqz(i32.and(local 3, 15))`: secret-independent, only parameters, constants and globals
- #14 `i32.load offset=4` with address `#13`: secret-independent, #13 is public
- #15 `call_indirect (type 8)` with table index `#14`: secret-independent, #14 is public

Loaded values and call results:

- #13 `i32.load` at `local 0`: public, `aes->impl`, the table `evolu_aes256_init` records for every key, `aes_ct64` on wasm
- #14 `i32.load offset=4` at `#13`: public, that table's `cbc_encrypt`, `aes256_ct64_cbc_encrypt`

## `evolu_aes256_cbc_decrypt`, function 76

The core's `evolu_aes256_cbc_decrypt`: refuses a partial block, calls the context's implementation and wipes the stack.

Code sha256 `2570dc694b930e1ce6efb4014e653c1c94f55b8994efec383b717fcfec04ca91`, 20 instructions.

- #7 `if` with condition `i32.eqz(i32.and(local 3, 15))`: secret-independent, only parameters, constants and globals
- #14 `i32.load offset=8` with address `#13`: secret-independent, #13 is public
- #15 `call_indirect (type 8)` with table index `#14`: secret-independent, #14 is public

Loaded values and call results:

- #13 `i32.load` at `local 0`: public, `aes->impl`, the table `evolu_aes256_init` records for every key, `aes_ct64` on wasm
- #14 `i32.load offset=8` at `#13`: public, that table's `cbc_decrypt`, `aes256_ct64_cbc_decrypt`

## `aes256_ct64_init`, function 70

The core's `aes256_ct64_init`, the `aes_ct64` table's key setup, which calls `br_aes_ct64_cbcenc_init` and `br_aes_ct64_cbcdec_init`.

Code sha256 `7702a3d6be87f1f052e4af1f3a60739875649399adaec5d9a9f7bd028171f599`, 12 instructions.

No findings.

## `aes256_ct64_cbc_encrypt`, function 71

The core's `aes256_ct64_cbc_encrypt`, which calls `br_aes_ct64_cbcenc_run`.

Code sha256 `73ea35850e709cfc7cffc0ec2f29fb57f23337d0de15f2cffe3cd473129b845b`, 7 instructions.

No findings.

## `aes256_ct64_cbc_decrypt`, function 72

The core's `aes256_ct64_cbc_decrypt`, which calls `br_aes_ct64_cbcdec_run`.

Code sha256 `e08b36d48ff10bc154f6ed05afc511f855a8a714e4f79de20af8fb7605b22556`, 7 instructions.

No findings.

## `br_aes_ct64_cbcenc_init`, function 143

BearSSL's `br_aes_ct64_cbcenc_init` (`aes_ct64_cbcenc.c`), which calls `br_aes_ct64_keysched`.

Code sha256 `d441af837ce725cb1bf4de1322a798f80910ff6f6f35bcc7fe051daef48aafc6`, 11 instructions.

No findings.

## `br_aes_ct64_cbcdec_init`, function 141

BearSSL's `br_aes_ct64_cbcdec_init` (`aes_ct64_cbcdec.c`), which calls `br_aes_ct64_keysched`.

Code sha256 `0e1a0bdeb69fd9ebeda644db44399a535f962dd49afb125ae9a8759441b5f1f2`, 11 instructions.

No findings.

## `br_aes_ct64_keysched`, function 139

BearSSL's AES key schedule, `br_aes_ct64_keysched` (`aes_ct64.c`), with `sub_word` inlined.

Code sha256 `7cdff8beb16430d5e4a8ecc221f56d20289b82d07239f6f6e4dd003800723042`, 390 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 304), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #27 `br_table 2 3 3 3 3 3 3 3 0 3 3 3 3 3 3 3 1 3` with index `i32.sub(local 2, 16)`: secret-independent, only parameters, constants and globals
- #71 `if` with condition `i32.eqz(local 4)`: secret-independent, only parameters, constants and globals
- #121 `br_if 0` with condition `i32.or(local 13, i32.ne(local 4, 4))`: secret-independent, only parameters, constants and globals
- #186 `select` with condition `i32.eq(local 4, local 7)`: secret-independent, only parameters, constants and globals
- #199 `br_if 0` with condition `i32.ne(local 2, local 12)`: secret-independent, only parameters, constants and globals
- #369 `br_if 0` with condition `local 4`: secret-independent, only parameters, constants and globals
- #384 `if` with condition `i32.or(i32.gt_u(i32.add(local 3, 304), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

## `br_aes_ct64_skey_expand`, function 140

BearSSL's `br_aes_ct64_skey_expand` (`aes_ct64.c`), which expands the stored round keys before each CBC run.

Code sha256 `873ff91f9e4e151594093a0c7008bbe767bd29dee363805377cdcc3dcb08a195`, 66 instructions.

- #7 `if` with condition `i32.add(i32.shl(local 1, 1), 2)`: secret-independent, only parameters, constants and globals
- #64 `br_if 0` with condition `i32.ne(i32.add(local 3, 1), local 5)`: secret-independent, only parameters, constants and globals

## `br_aes_ct64_cbcenc_run`, function 144

BearSSL's CBC encryption, `br_aes_ct64_cbcenc_run` (`aes_ct64_cbcenc.c`), one block at a time, with Evolu's zero initialization of the state before each block.

Code sha256 `37a10c510094250bc80997453dea4bf6a7b37f916d0e8fcd16a485f33d5f4b36`, 172 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 1056), global 3), i32.lt_…`: secret-independent, only parameters, constants and globals
- #26 `call 140` with argument 1 `#22`: secret-independent, #22 is public
- #34 `if` with condition `local 3`: secret-independent, only parameters, constants and globals
- #107 `call 147` with argument 0 `#102`: secret-independent, #102 is public
- #148 `br_if 0` with condition `i32.sub(local 3, 16)`: secret-independent, only parameters, constants and globals
- #167 `if` with condition `i32.or(i32.gt_u(i32.add(local 4, 1056), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #22 `i32.load offset=248` at `local 0`: public, `ctx->num_rounds`, 14 for every 256-bit key
- #102 `i32.load offset=248` at `local 0`: public, `ctx->num_rounds`, 14 for every 256-bit key

## `br_aes_ct64_cbcdec_run`, function 142

BearSSL's CBC decryption, `br_aes_ct64_cbcdec_run` (`aes_ct64_cbcdec.c`), four blocks at a time, with Evolu's zero initialization of the input words before each batch.

Code sha256 `d117c14035a8179243eaec8fb6ed254a6010488b9a6e39852172797594c87a07`, 465 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 1168), global 3), i32.lt_…`: secret-independent, only parameters, constants and globals
- #26 `call 140` with argument 1 `#22`: secret-independent, #22 is public
- #36 `br_if 0` with condition `i32.eqz(local 3)`: secret-independent, only parameters, constants and globals
- #127 `select` with condition `i32.lt_u(local 3, 64)`: secret-independent, only parameters, constants and globals
- #159 `call 145` with argument 0 `#154`: secret-independent, #154 is public
- #215 `br_if 0` with condition `local 6`: secret-independent, only parameters, constants and globals
- #320 `br_if 1` with condition `i32.add(local 3, -64)`: secret-independent, only parameters, constants and globals
- #332 `br_if 0` with condition `i32.lt_u(local 3, 20)`: secret-independent, only parameters, constants and globals
- #338 `if` with condition `i32.ge_u(local 3, 24)`: secret-independent, only parameters, constants and globals
- #344 `select` with condition `i32.le_u(local 7, 5)`: secret-independent, only parameters, constants and globals
- #401 `br_if 0` with condition `local 6`: secret-independent, only parameters, constants and globals
- #405 `br_if 1` with condition `i32.eqz(local 10)`: secret-independent, only parameters, constants and globals
- #460 `if` with condition `i32.or(i32.gt_u(i32.add(local 4, 1168), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #22 `i32.load offset=248` at `local 0`: public, `ctx->num_rounds`, 14 for every 256-bit key
- #154 `i32.load offset=248` at `local 0`: public, `ctx->num_rounds`, 14 for every 256-bit key

## `br_aes_ct64_bitslice_encrypt`, function 147

BearSSL's `br_aes_ct64_bitslice_encrypt` (`aes_ct64_enc.c`), with `add_round_key` and `mix_columns` inlined.

Code sha256 `363f5d3f222b41e55845dc09fcaa6135c527d69568fbbb1198ace32ee178ffcb`, 350 instructions.

- #60 `if` with condition `i32.ge_u(local 0, 2)`: secret-independent, only parameters, constants and globals
- #283 `br_if 0` with condition `i32.ne(i32.add(local 18, 1), local 0)`: secret-independent, only parameters, constants and globals

## `br_aes_ct64_bitslice_decrypt`, function 145

BearSSL's `br_aes_ct64_bitslice_decrypt` (`aes_ct64_dec.c`), with `br_aes_ct64_bitslice_invSbox`, `add_round_key` and `inv_mix_columns` inlined.

Code sha256 `b54b8782e4aa43980fb99cd44639478f40cf2e96ff6b699c7acaba31b92be312`, 763 instructions.

- #66 `if` with condition `i32.sub(local 0, 1)`: secret-independent, only parameters, constants and globals
- #553 `br_if 0` with condition `i32.sub(local 0, 1)`: secret-independent, only parameters, constants and globals

## `br_aes_ct64_bitslice_Sbox`, function 135

BearSSL's bitsliced S-box, `br_aes_ct64_bitslice_Sbox` (`aes_ct64.c`).

Code sha256 `306af368c4311f85951e77b29fcc46c663510b541051c51208c0132342d4f551`, 337 instructions.

No findings.

## `br_aes_ct64_ortho`, function 136

BearSSL's `br_aes_ct64_ortho` (`aes_ct64.c`), which transposes the bitsliced state.

Code sha256 `0d42a7f6a4970117f53916f6722cef59045579ce3e74810b96c79dee55344aae`, 248 instructions.

No findings.

## `br_aes_ct64_interleave_in`, function 137

BearSSL's `br_aes_ct64_interleave_in` (`aes_ct64.c`), which spreads four words into two state words.

Code sha256 `5c609ea722263dd1ad61fc84278de09482589f459a4c901d6c5feca2759a50eb`, 76 instructions.

No findings.

## `br_aes_ct64_interleave_out`, function 138

BearSSL's `br_aes_ct64_interleave_out` (`aes_ct64.c`), which gathers two state words into four words.

Code sha256 `7cfb18b3c408d41adaf56aaa21b2669e3aef721950bda56cb7b5968ecae65a4b`, 72 instructions. Parameter 1 holds a secret: `q0`, half of the state. Parameter 2 holds a secret: `q1`, the other half.

No findings.

## `shift_rows`, function 148

`shift_rows` of BearSSL's `aes_ct64_enc.c`.

Code sha256 `8bb923078a197d9f66061f8cb4f1badc01f7498bba528ac3f4acf8d9397a8fed`, 344 instructions.

No findings.

## `inv_shift_rows`, function 146

`inv_shift_rows` of BearSSL's `aes_ct64_dec.c`.

Code sha256 `9e3bf1eaf0610c3310443346eb9c7f05c88c8d54c01a755cb360b92eaa007755`, 344 instructions.

No findings.

## `br_range_dec32le`, function 119

BearSSL's `br_range_dec32le` (`dec32le.c`), which reads blocks, IVs and keys as little-endian words.

Code sha256 `ed91ed29d8e7cd96ba3ba862668f8ea6c2048201d5aa56003613d28c4dcc1509`, 95 instructions.

- #4 `br_if 0` with condition `i32.eqz(local 1)`: secret-independent, only parameters, constants and globals
- #11 `if` with condition `i32.eqz(i32.and(local 1, 7))`: secret-independent, only parameters, constants and globals
- #41 `br_if 0` with condition `i32.ne(i32.add(local 4, 1), local 5)`: secret-independent, only parameters, constants and globals
- #47 `br_if 0` with condition `i32.lt_u(local 1, 8)`: secret-independent, only parameters, constants and globals
- #93 `br_if 0` with condition `i32.sub(local 3, 8)`: secret-independent, only parameters, constants and globals

## `br_range_enc32le`, function 122

BearSSL's `br_range_enc32le` (`enc32le.c`), which writes blocks and IVs as little-endian words.

Code sha256 `2db812acc4d29e59a3cd24cd7be782372b7a8071d2ef93fbfe2edf5672163fae`, 95 instructions.

- #4 `br_if 0` with condition `i32.eqz(local 2)`: secret-independent, only parameters, constants and globals
- #11 `if` with condition `i32.eqz(i32.and(local 2, 7))`: secret-independent, only parameters, constants and globals
- #41 `br_if 0` with condition `i32.ne(i32.add(local 4, 1), local 5)`: secret-independent, only parameters, constants and globals
- #47 `br_if 0` with condition `i32.lt_u(local 2, 8)`: secret-independent, only parameters, constants and globals
- #93 `br_if 0` with condition `i32.sub(local 3, 8)`: secret-independent, only parameters, constants and globals

## `sha512_blocks`, function 80

The core's `sha512_blocks`, with `sha512_blocks_bearssl`, `load64_be`, `store64_be` and `evolu_wipe` inlined: wasm has no SHA-512 instructions, so it runs BearSSL's compression through `br_sha512_set_state`, `br_sha512_update` and `br_sha512_state`, and wipes BearSSL's context.

Code sha256 `c166e6ed906d87c6c4e92c83dc518e386b0fe116e551a43421588dd1d2612201`, 671 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 272), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #79 `br_if 0` with condition `i32.ne(i32.add(local 4, 1), 8)`: secret-independent, only parameters, constants and globals
- #462 `br_if 0` with condition `i32.sub(local 5, 13)`: secret-independent, only parameters, constants and globals
- #666 `if` with condition `i32.or(i32.gt_u(i32.add(local 3, 272), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

## `sha512_finish`, function 81

The core's `sha512_finish`, with `store64_be` inlined: pads the message and compresses the last block or two.

Code sha256 `e5ccc96ef656f58f15bf2aa48cb74a5acad2d2fd16ba998b3c980a30f80ff63b`, 179 instructions.

- #14 `i32.store8` with address `i32.add(i32.add(local 0, 72), i32.and(i32.wrap_i64(#6), 127…`: secret-independent, #6 is public
- #23 `if` with condition `i32.lt_u(local 3, 112)`: secret-independent, #6 is public
- #32 `if` with condition `i32.xor(local 3, 127)`: secret-independent, #6 is public
- #38 `memory.fill` with destination and size `i32.add(local 4, local 5), local 3`: secret-independent, #6 is public
- #54 `if` with condition `i32.sub(112, local 6)`: secret-independent, #6 is public
- #60 `memory.fill` with destination and size `i32.add(local 4, local 6), local 5`: secret-independent, #6 is public
- #178 `br_if 0` with condition `i32.ne(i32.add(local 3, 1), 8)`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #6 `i64.load offset=64` at `local 0`: public, `sha->size`, the number of bytes hashed, a public length

## `br_sha384_update`, function 124

BearSSL's `br_sha512_update`, an alias of `br_sha384_update` (`sha2big.c`), with `sha2big_update` inlined.

Code sha256 `690b136398d87aeb415c35e65ab86b82a66424dd3ad7069badae71fb7eda51f6`, 67 instructions.

- #10 `if` with condition `local 2`: secret-independent, only parameters, constants and globals
- #33 `select` with condition `i32.lt_u(local 0, local 2)`: secret-independent, #3 is public
- #35 `if` with condition `select(i32.sub(128, local 3), local 2, i32.lt_u(local 0, lo…`: secret-independent, #3 is public
- #41 `memory.copy` with destination, source and size `i32.add(local 3, local 4), local 1, local 0`: secret-independent, #3 is public
- #53 `if` with condition `i32.eq(i32.add(local 0, local 3), 128)`: secret-independent, #3 is public
- #65 `br_if 0` with condition `local 2`: secret-independent, #3 is public

Loaded values and call results:

- #3 `i64.load offset=136` at `local 0`: public, `cc->count`, the number of bytes hashed, 0 when `sha512_blocks` calls it

## `sha2big_round`, function 125

BearSSL's SHA-512 compression function, `sha2big_round` (`sha2big.c`).

Code sha256 `c309fb21b5f910e761134090017877118c44c402ebf0c9c536c0448b952e4699`, 626 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 640), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #79 `br_if 0` with condition `i32.ne(i32.add(local 19, 1), 80)`: secret-independent, only parameters, constants and globals
- #569 `br_if 0` with condition `local 0`: secret-independent, only parameters, constants and globals
- #621 `if` with condition `i32.or(i32.gt_u(i32.add(local 20, 640), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals

## `br_sha384_state`, function 126

BearSSL's `br_sha512_state`, an alias of `br_sha384_state` (`sha2big.c`).

Code sha256 `dbd5d4f3a961182e0b31fa0f43a8de56fb10e5b301357ef94cbb93773c4b8b4e`, 8 instructions.

No findings.

## `br_sha384_set_state`, function 127

BearSSL's `br_sha512_set_state`, an alias of `br_sha384_set_state` (`sha2big.c`).

Code sha256 `f8a8b8b6898377feb022d3ee7daaa52c30c5cc7a5a53b668307536d81bdd8e7e`, 9 instructions.

No findings.

## `br_range_dec64be`, function 120

BearSSL's `br_range_dec64be` (`dec64be.c`), which reads message blocks and states as big-endian words.

Code sha256 `d6948c4ce76534d1fd5b53db50a53ec01968b69e6ee34793e78c818acd3b2e6a`, 65 instructions.

- #2 `if` with condition `local 1`: secret-independent, only parameters, constants and globals
- #63 `br_if 0` with condition `i32.sub(local 1, 1)`: secret-independent, only parameters, constants and globals

## `br_range_enc64be`, function 123

BearSSL's `br_range_enc64be` (`enc64be.c`), which writes states as big-endian words.

Code sha256 `02037cc681db8b2ea6f6794dfb3ff5cafc3c23f558b23511123230c682cd3ee5`, 65 instructions.

- #2 `if` with condition `local 2`: secret-independent, only parameters, constants and globals
- #63 `br_if 0` with condition `i32.sub(local 2, 1)`: secret-independent, only parameters, constants and globals

## `evolu_hmac_sha512_key_init`, function 82

The core's `evolu_hmac_sha512_key_init`, with `evolu_sha512_digest` inlined for a key longer than a block.

Code sha256 `560e022109733020cd25ec61bcac937e547b837b6455c842592c11626793c44b`, 358 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 336), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #26 `if` with condition `i32.ge_u(local 2, 129)`: secret-independent, only parameters, constants and globals
- #80 `if` with condition `i32.eqz(i32.or(i32.eqz(i32.and(local 2, 127)), i32.eqz(loca…`: secret-independent, only parameters, constants and globals
- #141 `br_if 0` with condition `i32.sub(local 1, 10)`: secret-independent, only parameters, constants and globals
- #147 `br_if 0` with condition `i32.eqz(local 2)`: secret-independent, only parameters, constants and globals
- #189 `br_if 0` with condition `i32.ne(i32.add(local 1, 4), 128)`: secret-independent, only parameters, constants and globals
- #263 `br_if 0` with condition `i32.ne(i32.add(local 1, 4), 128)`: secret-independent, only parameters, constants and globals
- #340 `br_if 0` with condition `i32.sub(local 1, 8)`: secret-independent, only parameters, constants and globals
- #353 `if` with condition `i32.or(i32.gt_u(i32.add(local 3, 336), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

## `evolu_hmac_sha512_init`, function 84

The core's `evolu_hmac_sha512_init`, which copies the key's two states.

Code sha256 `695331ea999563abeb321b470215c4c5b6e9c1df3249f67bef21616841a9a83b`, 70 instructions.

No findings.

## `evolu_hmac_sha512_update`, function 85

The core's `evolu_hmac_sha512_update`, with `evolu_sha512_update` inlined.

Code sha256 `60c4c653821dfb45adf5bdffaca74b91bd320cced31ad0418b1a7bb4e2b634af`, 90 instructions.

- #4 `br_if 0` with condition `i32.eqz(local 2)`: secret-independent, only parameters, constants and globals
- #18 `if` with condition `i32.and(i32.wrap_i64(local 6), 127)`: secret-independent, #7 is public
- #31 `select` with condition `i32.gt_u(local 2, local 4)`: secret-independent, #7 is public
- #33 `if` with condition `select(i32.sub(128, local 3), local 2, i32.gt_u(local 2, lo…`: secret-independent, #7 is public
- #39 `memory.copy` with destination, source and size `i32.add(local 3, local 5), local 1, local 4`: secret-independent, #7 is public
- #46 `br_if 1` with condition `i32.lt_u(i32.add(local 3, local 4), 128)`: secret-independent, #7 is public
- #64 `if (result i32)` with condition `i32.shr_u(local 2, 7)`: secret-independent, #7 is public
- #68 `call 80` with argument 1 `local 1`: secret-independent, #7 is public
- #68 `call 80` with argument 2 `local 3`: secret-independent, #7 is public
- #83 `br_if 0` with condition `i32.eqz(result of #64)`: secret-independent, #7 is public
- #89 `memory.copy` with destination, source and size `i32.add(local 0, 72), local 1, local 3`: secret-independent, #7 is public

Loaded values and call results:

- #7 `i64.load offset=64` at `local 0`: public, `mac->inner.size`, the number of bytes hashed, a public length

## `evolu_hmac_sha512_final`, function 86

The core's `evolu_hmac_sha512_final`, with `hmac_sha512_finish` and `evolu_wipe` inlined.

Code sha256 `55a63e5b779dd3fb66c6ed390b3e0966e45448f8cb2007f83c6d68cdfe804448`, 60 instructions.

- #58 `br_if 0` with condition `i32.sub(local 1, 10)`: secret-independent, only parameters, constants and globals

## `evolu_hmac_sha512_key_wipe`, function 83

The core's `evolu_hmac_sha512_key_wipe`, with `evolu_wipe` inlined.

Code sha256 `2fd4d3f6c94bfa1c8288bbf0905805903af7efa23fd39741e50d7ed85a6092bd`, 37 instructions.

- #36 `br_if 0` with condition `i32.sub(local 1, 8)`: secret-independent, only parameters, constants and globals

## `evolu_pbkdf2_sha512`, function 87

The core's `evolu_pbkdf2_sha512`, with `evolu_hmac_sha512_init`, `evolu_hmac_sha512_update`, `hmac_sha512_finish` and the wipes inlined.

Code sha256 `2443d52d156893f44d6ab9789945360ce1bd347e2b788285f0f6ff2f079fcbdc`, 1043 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 672), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #19 `if (result i32)` with condition `local 4`: secret-independent, only parameters, constants and globals
- #27 `if` with condition `local 6`: secret-independent, only parameters, constants and globals
- #150 `br_if 0` with condition `i32.eqz(local 3)`: secret-independent, only parameters, constants and globals
- #159 `if` with condition `local 14`: secret-independent, only parameters, constants and globals
- #171 `br_if 1` with condition `i32.eqz(local 17)`: secret-independent, only parameters, constants and globals
- #175 `br_if 0` with condition `i32.eqz(local 1)`: secret-independent, only parameters, constants and globals
- #196 `if` with condition `i32.eqz(i32.and(i32.wrap_i64(local 22), 127))`: secret-independent, #183 is public
- #212 `select` with condition `i32.ge_u(local 0, 4)`: secret-independent, #183 is public
- #214 `if` with condition `select(4, i32.sub(128, local 1), i32.ge_u(local 0, 4))`: secret-independent, #183 is public
- #222 `memory.copy` with destination, source and size `i32.add(local 1, local 9), i32.add(local 7, 12), local 0`: secret-independent, #183 is public
- #229 `br_if 1` with condition `i32.lt_u(i32.add(local 0, local 1), 128)`: secret-independent, #183 is public
- #239 `br_if 1` with condition `i32.lt_u(local 1, 125)`: secret-independent, #183 is public
- #253 `br_if 0` with condition `i32.eqz(local 1)`: secret-independent, #183 is public
- #257 `memory.copy` with destination, source and size `local 9, local 0, local 1`: secret-independent, #183 is public
- #312 `if` with condition `i32.ne(local 4, 1)`: secret-independent, only parameters, constants and globals
- #508 `br_if 0` with condition `i32.ne(i32.add(local 1, 4), 64)`: secret-independent, only parameters, constants and globals
- #516 `br_if 0` with condition `i32.ne(i32.add(local 16, 1), local 4)`: secret-independent, only parameters, constants and globals
- #524 `select` with condition `i32.ge_u(local 6, 64)`: secret-independent, only parameters, constants and globals
- #526 `if` with condition `select(64, local 6, i32.ge_u(local 6, 64))`: secret-independent, only parameters, constants and globals
- #546 `br_if 0` with condition `i32.sub(local 6, local 1)`: secret-independent, only parameters, constants and globals
- #588 `br_if 0` with condition `i32.sub(local 0, 8)`: secret-independent, only parameters, constants and globals
- #635 `br_if 0` with condition `i32.sub(local 0, 10)`: secret-independent, only parameters, constants and globals
- #1037 `if` with condition `i32.or(i32.gt_u(i32.add(local 7, 672), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #183 `i64.load offset=208` at `local 7`: public, `mac.inner.size`, the number of bytes the inner hash has taken, a public length

## `derive_hmac_key`, function 93

`derive_hmac_key` of the core's `evolu_page.c`, which masks the salt and derives the HMAC key with two iterations of PBKDF2.

Code sha256 `267cd8850fe9cd6825a65dbf8d3ea921c66b6753f67ab0608bfb86ac9f9bc4fe`, 147 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 48), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals
- #142 `if` with condition `i32.or(i32.gt_u(i32.add(local 3, 48), global 3), i32.lt_u(l…`: secret-independent, only parameters, constants and globals

## `evolu_constant_time_equal`, function 68

The tag comparison, the core's `evolu_constant_time_equal`: it ORs the XOR of each pair of bytes into a volatile byte on the stack and returns `(difference - 1) >> 31`, without a branch.

Code sha256 `75117cb62715f11eaffd11e2a314f10aad3aaa9ff56eb01eb2f04cac0f2d1165`, 100 instructions.

- #10 `br_if 0` with condition `i32.eqz(local 2)`: secret-independent, only parameters, constants and globals
- #14 `if` with condition `i32.ne(local 2, 1)`: secret-independent, only parameters, constants and globals
- #72 `br_if 0` with condition `i32.ne(i32.add(local 2, 2), local 8)`: secret-independent, only parameters, constants and globals
- #76 `br_if 1` with condition `i32.eqz(local 7)`: secret-independent, only parameters, constants and globals

## `is_page1_authentic`, function 100

`is_page1_authentic` of `evolu_page.c`, with `compute_hmac` inlined.

Code sha256 `6fd1c8004c8f06099a4e705825eedf008036417e9fa45296afcf0ad3f7d5ccee`, 92 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 480), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #22 `if` with condition `i32.eq(local 1, 1)`: secret-independent, only parameters, constants and globals
- #28 `br_if 1` with condition `i32.ne(#25, 80)`: secret-independent, #25 is public
- #48 `select` with condition `i32.eq(local 1, 2)`: secret-independent, only parameters, constants and globals
- #53 `select` with condition `local 1`: secret-independent, only parameters, constants and globals
- #86 `if` with condition `i32.or(i32.gt_u(i32.add(local 4, 480), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #25 `i32.load8_u offset=20` at `local 2`: public, byte 20 of page 1 as stored, which the default layout keeps in the clear

## `authenticate`, function 94

`authenticate` of `evolu_page.c`, with `compute_hmac` inlined, and `is_page1_authentic` inlined where it tries the default layout.

Code sha256 `2f306890e2f0051335e96721822f5878817e749fba3b182f41eeba95f83400d7`, 182 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 480), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #27 `if` with condition `i32.ne(local 2, 1)`: secret-independent, only parameters, constants and globals
- #63 `if` with condition `local 9`: secret-independent, #20 is public
- #68 `call 100` with argument 1 `local 9`: secret-independent, #20 is public
- #81 `if` with condition `i32.eq(#78, 80)`: secret-independent, #78 is public
- #116 `br_if 1` with condition `#115`: secret-independent, #115 is public
- #126 `br_if 0` with condition `i32.eqz(i32.and(#121, 1))`: secret-independent, #121 is public
- #176 `if` with condition `i32.or(i32.gt_u(i32.add(local 6, 480), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #20 `i32.load offset=556` at `local 0`: public, `codec->layout`, page 1's layout, which the file shows: the default layout stores bytes 16 to 23 in the clear
- #78 `i32.load8_u offset=20` at `local 3`: public, byte 20 of page 1 as stored, which the default layout keeps in the clear
- #115 `call 68` of `local 6, i32.add(i32.add(local 3, local 4), -64), 64`: public, `evolu_constant_time_equal`'s result, whether the tag matches, which the read's failure reveals
- #121 `i32.load8_u offset=552` at `local 0`: public, `codec->flags`, set when the codec is created

## `evolu_page_decrypt`, function 92

The core's `evolu_page_decrypt`, with `decrypt_page` and `evolu_page_is_size` inlined.

Code sha256 `f84688fc881ee81a5490e90de08e1c32d0a87494fe21dcb2a23f04e3c220cfdc`, 181 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 144), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #32 `br_if 0` with condition `i32.or(i32.lt_u(i32.sub(local 3, 65537), -65025), i32.gt_u(…`: secret-independent, only parameters, constants and globals
- #47 `if` with condition `i32.eq(local 1, 1)`: secret-independent, only parameters, constants and globals
- #50 `br_if 1` with condition `i32.eqz(local 5)`: secret-independent, #39 is public
- #64 `br_if 1` with condition `i32.eqz(i64.eqz(i64.or(i64.xor(#52, #54), i64.xor(#57, #59)…`: secret-independent, #52, #54, #57 and #59 are public
- #68 `br_if 1` with condition `local 5`: secret-independent, #39 is public
- #89 `if` with condition `i32.eqz(#87)`: secret-independent, #87 is public
- #122 `call 95` with argument 1 `#117`: secret-independent, #117 is public
- #136 `br_if 1` with condition `i32.eqz(#134)`: secret-independent, #134 is public
- #145 `call 95` with argument 1 `#140`: secret-independent, #140 is public
- #151 `br_if 1` with condition `i32.ne(local 1, 1)`: secret-independent, only parameters, constants and globals
- #164 `call 79` with argument 0 `local 9`: secret-independent, #18 is public
- #175 `if` with condition `i32.or(i32.gt_u(i32.add(local 4, 144), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #18 `call 78`: public, `evolu_dit_begin`'s result, always 0 on wasm, which has no DIT
- #39 `i32.load offset=560` at `local 0`: public, `codec->has_salt`, whether the codec has a salt yet
- #52 `i64.load offset=564 align=1` at `local 0`: public, half of `codec->salt`, which page 1 stores in the clear
- #54 `i64.load align=1` at `local 2`: public, half of the page's first 16 bytes, page 1's salt as stored in the clear
- #57 `i64.load offset=572 align=1` at `local 0`: public, half of `codec->salt`, which page 1 stores in the clear
- #59 `i64.load offset=8 align=1` at `local 2`: public, half of the page's first 16 bytes, page 1's salt as stored in the clear
- #87 `call 94` of `local 0, local 10, 1, local 2, local 3, i32.add(local 4, 12)`: public, `authenticate`'s result, whether the page's HMAC matches, which the read's failure reveals
- #117 `i32.load offset=12` at `local 4`: public, the layout `authenticate` found, which the file shows
- #134 `call 94` of `local 0, local 6, local 1, local 2, local 3, i32.add(local 4, 12)`: public, `authenticate`'s result, whether the page's HMAC matches, which the read's failure reveals
- #140 `i32.load offset=12` at `local 4`: public, the layout `authenticate` found, which the file shows

## `evolu_page_decrypt_with_salt`, function 96

The core's `evolu_page_decrypt_with_salt`, with `decrypt_page_with_salt` and `evolu_page_is_size` inlined.

Code sha256 `42b46d5e98374862bbec6d456d6d0e9c7732093f9efaa2e33fd781d947d1452f`, 99 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 144), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #31 `br_if 0` with condition `i32.or(i32.lt_u(i32.sub(local 4, 65537), -65025), i32.gt_u(…`: secret-independent, only parameters, constants and globals
- #35 `if` with condition `i32.eq(local 2, 1)`: secret-independent, only parameters, constants and globals
- #49 `br_if 1` with condition `i64.ne(i64.or(i64.xor(#37, #39), i64.xor(#42, #44)), 0)`: secret-independent, #37, #39, #42 and #44 are public
- #72 `br_if 0` with condition `i32.eqz(local 7)`: secret-independent, #66 is public
- #79 `call 95` with argument 1 `#75`: secret-independent, #75 is public
- #82 `call 79` with argument 0 `local 9`: secret-independent, #18 is public
- #93 `if` with condition `i32.or(i32.gt_u(i32.add(local 5, 144), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #18 `call 78`: public, `evolu_dit_begin`'s result, always 0 on wasm, which has no DIT
- #37 `i64.load align=1` at `local 3`: public, half of the page's first 16 bytes, page 1's salt as stored in the clear
- #39 `i64.load align=1` at `local 1`: public, half of the salt to try, read from a database or journal that stores it in the clear
- #42 `i64.load offset=8 align=1` at `local 3`: public, half of the page's first 16 bytes, page 1's salt as stored in the clear
- #44 `i64.load offset=8 align=1` at `local 1`: public, half of the salt to try, read from a database or journal that stores it in the clear
- #66 `call 94` of `local 0, local 10, local 2, local 3, local 4, i32.add(local 5, 12)`: public, `authenticate`'s result, whether the page's HMAC matches, which the read's failure reveals
- #75 `i32.load offset=12` at `local 5`: public, the layout `authenticate` found, which the file shows

## `decrypt_authentic`, function 95

`decrypt_authentic` of `evolu_page.c`, with `decrypt_cbc_cs3` and `encrypted_start` inlined.

Code sha256 `a35f3930108e8a5925855bd693f5d39479e65770d3c539ce4ca5a22fd4a709ed`, 254 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.add(global 0, -64), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #38 `select` with condition `i32.eq(local 1, 2)`: secret-independent, only parameters, constants and globals
- #43 `select` with condition `i32.eq(local 2, 1)`: secret-independent, only parameters, constants and globals
- #62 `if` with condition `i32.and(local 1, 15)`: secret-independent, only parameters, constants and globals
- #92 `if` with condition `local 0`: secret-independent, only parameters, constants and globals
- #104 `if` with condition `i32.sub(16, local 0)`: secret-independent, only parameters, constants and globals
- #124 `if` with condition `i32.ne(local 0, 1)`: secret-independent, only parameters, constants and globals
- #180 `br_if 0` with condition `i32.ne(i32.add(local 4, 2), local 8)`: secret-independent, only parameters, constants and globals
- #184 `br_if 1` with condition `i32.eqz(local 14)`: secret-independent, only parameters, constants and globals
- #229 `if` with condition `i32.eq(local 2, 1)`: secret-independent, only parameters, constants and globals
- #249 `if` with condition `i32.or(i32.gt_u(i32.sub(local 5, -64), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

## `evolu_page_encrypt`, function 91

The core's `evolu_page_encrypt`, with `encrypt_page`, `derive_hmac_key`, `adopt_salt`, `encrypt_cbc_cs3` and `compute_hmac` inlined.

Code sha256 `d51b1fc10e1e070da0652a7e29930ff6d4eeaa265d9fff497618b362f7c95fd0`, 478 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 464), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #33 `br_if 0` with condition `i32.or(i32.lt_u(i32.sub(local 3, 65537), -65025), i32.gt_u(…`: secret-independent, only parameters, constants and globals
- #38 `if` with condition `i32.eq(local 1, 1)`: secret-independent, only parameters, constants and globals
- #44 `br_if 1` with condition `i32.ne(#41, 80)`: secret-independent, #41 is public
- #59 `select` with condition `i32.eq(local 7, 1)`: secret-independent, #49 and #51 are public
- #62 `br_if 1` with condition `i32.ne(select(65536, i32.or(#49, i32.shl(#51, 8)), i32.eq(l…`: secret-independent, #49 and #51 are public
- #69 `if` with condition `i32.eqz(#67)`: secret-independent, #67 is public
- #73 `br_if 1` with condition `#72`: secret-independent, #72 is public
- #221 `br_if 1` with condition `#220`: secret-independent, #220 is public
- #231 `if` with condition `i32.eqz(i32.or(#224, i32.ne(local 1, 1)))`: secret-independent, #224 is public
- #259 `select` with condition `i32.eq(local 6, 2)`: secret-independent, #224 is public
- #265 `select` with condition `i32.eq(local 1, 1)`: secret-independent, only parameters, constants and globals
- #273 `if` with condition `i32.sub(local 7, local 8)`: secret-independent, #224 is public
- #279 `memory.copy` with destination, source and size `local 6, i32.add(local 2, local 8), local 7`: secret-independent, #224 is public
- #301 `if` with condition `i32.eqz(i32.eqz(i32.and(local 7, 15)))`: secret-independent, #224 is public
- #307 `memory.copy` with destination, source and size `i32.sub(local 5, -64), local 8, local 7`: secret-independent, #224 is public
- #318 `call 75` with argument 2 `local 6`: secret-independent, #224 is public
- #318 `call 75` with argument 3 `local 9`: secret-independent, #224 is public
- #321 `if` with condition `local 7`: secret-independent, #224 is public
- #328 `if` with condition `i32.eqz(local 16)`: secret-independent, #224 is public
- #332 `memory.copy` with destination, source and size `local 8, local 9, local 7`: secret-independent, #224 is public
- #347 `i64.store offset=8 align=1` with address `local 9`: secret-independent, #224 is public
- #351 `i64.store align=1` with address `local 9`: secret-independent, #224 is public
- #362 `if` with condition `i32.eq(local 1, 1)`: secret-independent, only parameters, constants and globals
- #366 `select` with condition `local 14`: secret-independent, #224 is public
- #380 `if` with condition `i32.sub(local 15, 16)`: secret-independent, #224 is public
- #388 `memory.copy` with destination, source and size `i32.add(local 4, 16), i32.add(local 2, 16), local 7`: secret-independent, #224 is public
- #408 `call 85` with argument 1 `local 6`: secret-independent, #224 is public
- #408 `call 85` with argument 2 `i32.add(i32.add(local 1, local 3), -64)`: secret-independent, #224 is public
- #441 `call 85` with argument 1 `local 6`: secret-independent, #224 is public
- #461 `call 79` with argument 0 `local 13`: secret-independent, #18 is public
- #472 `if` with condition `i32.or(i32.gt_u(i32.add(local 5, 464), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #18 `call 78`: public, `evolu_dit_begin`'s result, always 0 on wasm, which has no DIT
- #41 `i32.load8_u offset=20` at `local 2`: public, byte 20 of the page 1 SQLite writes, its reserved bytes per page, which must be 80
- #49 `i32.load8_u offset=17` at `local 2`: public, byte 17 of the page 1 SQLite writes, the low byte of its page size, which must equal the size written
- #51 `i32.load8_u offset=16` at `local 2`: public, byte 16 of the page 1 SQLite writes, the high byte of its page size
- #67 `i32.load offset=560` at `local 0`: public, `codec->has_salt`, whether the codec has a salt yet
- #72 `call 69` of `local 5, 16`: public, `evolu_random_bytes`'s status for the salt, which fails only when the platform's generator does
- #220 `call 69` of `i32.add(local 5, 16), 16`: public, `evolu_random_bytes`'s status for the IV
- #224 `i32.load offset=556` at `local 0`: public, `codec->layout`, page 1's layout, which the file shows: the default layout stores bytes 16 to 23 in the clear

## `evolu_page_codec_create`, function 89

The core's `evolu_page_codec_create`, with `create_codec` inlined: it copies the key and expands it.

Code sha256 `2cf62baa12abcba4cf8a2266bd142af3f01877c853fb8e00fc678ce3102b89df`, 35 instructions.

- #7 `if` with condition `#5`: secret-independent, #5 is public
- #10 `i32.store offset=552` with address `local 2`: secret-independent, #5 is public
- #14 `i64.store` with address `local 2`: secret-independent, #5 is public
- #18 `i64.store offset=8` with address `local 2`: secret-independent, #5 is public
- #22 `i64.store offset=16` with address `local 2`: secret-independent, #5 is public
- #26 `i64.store offset=24` with address `local 2`: secret-independent, #5 is public
- #31 `call 74` with argument 0 `i32.add(local 2, 32)`: secret-independent, #5 is public
- #31 `call 74` with argument 1 `local 2`: secret-independent, #5 is public
- #34 `call 79` with argument 0 `local 3`: secret-independent, #1 is public

Loaded values and call results:

- #1 `call 78`: public, `evolu_dit_begin`'s result, always 0 on wasm, which has no DIT
- #5 `call 73` of `1, 720`: public, `evolu_calloc`'s result, the codec's address or NULL

## `evolu_page_use_salt`, function 97

The core's `evolu_page_use_salt`, with `adopt_salt` inlined.

Code sha256 `0e2d57fea294c4ffd072c1f235aa34cc7048dbd6153e8b80c31c2133718d69d7`, 79 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 128), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
- #21 `if` with condition `#20`: secret-independent, #20 is public
- #34 `br_if 1` with condition `i64.eqz(i64.or(i64.xor(#23, #25), i64.xor(#28, #30)))`: secret-independent, #23, #25, #28 and #30 are public
- #62 `call 79` with argument 0 `local 5`: secret-independent, #36 is public
- #74 `if` with condition `i32.or(i32.gt_u(i32.add(local 2, 128), global 3), i32.lt_u(…`: secret-independent, only parameters, constants and globals

Loaded values and call results:

- #20 `i32.load offset=560` at `local 0`: public, `codec->has_salt`, whether the codec has a salt yet
- #23 `i64.load offset=564 align=1` at `local 0`: public, half of `codec->salt`, which page 1 stores in the clear
- #25 `i64.load align=1` at `local 1`: public, half of the salt to use, read from a database or journal that stores it in the clear
- #28 `i64.load offset=572 align=1` at `local 0`: public, half of `codec->salt`, which page 1 stores in the clear
- #30 `i64.load offset=8 align=1` at `local 1`: public, half of the salt to use, read from a database or journal that stores it in the clear
- #36 `call 78`: public, `evolu_dit_begin`'s result, always 0 on wasm, which has no DIT

## `evolu_wipe`, function 66

The core's `evolu_wipe`, which zeroes keys and states through a volatile pointer.

Code sha256 `1f5643b6b0f72aafe8f12b8db90450f0073f6e6c2ef46dc857963f69c32bf35d`, 78 instructions.

- #4 `br_if 0` with condition `i32.eqz(local 1)`: secret-independent, only parameters, constants and globals
- #11 `if` with condition `i32.eqz(i32.and(local 1, 7))`: secret-independent, only parameters, constants and globals
- #36 `br_if 0` with condition `i32.ne(i32.add(local 3, 1), local 4)`: secret-independent, only parameters, constants and globals
- #42 `br_if 0` with condition `i32.lt_u(local 1, 8)`: secret-independent, only parameters, constants and globals
- #76 `br_if 0` with condition `i32.sub(local 2, 8)`: secret-independent, only parameters, constants and globals

## `evolu_wipe_stack`, function 67

The core's `evolu_wipe_stack`, which zeroes 4 KiB of the stack below its caller.

Code sha256 `ca8d85593b29dcad7f0e32f592d7ed8c407d219bffc1aef7a55275f19ddab213`, 72 instructions.

- #12 `if` with condition `i32.or(i32.gt_u(i32.sub(global 0, 4096), global 3), i32.lt_…`: secret-independent, only parameters, constants and globals
- #55 `br_if 0` with condition `i32.sub(local 4, 8)`: secret-independent, only parameters, constants and globals
- #67 `if` with condition `i32.or(i32.gt_u(i32.add(local 3, 4096), global 3), i32.lt_u…`: secret-independent, only parameters, constants and globals
