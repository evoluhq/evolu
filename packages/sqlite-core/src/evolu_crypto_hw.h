/*
 * The crypto layer's hardware paths, internal to evolu_crypto.c, which calls
 * a function only after evolu_hw_features reports the instructions it uses.
 * On a target without any, every feature is absent and the functions are
 * never called.
 */
#ifndef EVOLU_CRYPTO_HW_H
#define EVOLU_CRYPTO_HW_H

#include <stddef.h>
#include <stdint.h>

/* AES instructions: ARMv8's or x86's AES-NI. */
#define EVOLU_HW_AES 1
/* ARMv8.2's SHA-512 instructions. */
#define EVOLU_HW_SHA512 2
/* arm64's data independent timing, FEAT_DIT. */
#define EVOLU_HW_DIT 4

/* The CPU's features, detected at the first call. */
int evolu_hw_features(void);

/*
 * Expands an AES-256 key into the round keys of encryption and those of the
 * equivalent inverse cipher (FIPS 197 section 5.3.5) for decryption.
 */
void evolu_hw_aes256_expand(const uint8_t key[32], uint8_t encrypt[15][16],
                            uint8_t decrypt[15][16]);

/* CBC over whole blocks, chaining through iv as evolu_crypto.h describes. */
void evolu_hw_aes256_cbc_encrypt(const uint8_t keys[15][16], uint8_t iv[16],
                                 uint8_t *data, size_t size);
void evolu_hw_aes256_cbc_decrypt(const uint8_t keys[15][16], uint8_t iv[16],
                                 uint8_t *data, size_t size);

/* SHA-512's compression function over count consecutive blocks. */
void evolu_hw_sha512_blocks(uint64_t state[8], const uint8_t *blocks,
                            size_t count);

/*
 * Reads and writes arm64's DIT register, whose bit 24 is PSTATE.DIT. A write
 * that turns DIT on ends with a speculation barrier.
 */
uint64_t evolu_hw_dit_read(void);
void evolu_hw_dit_write(uint64_t value);

#endif
