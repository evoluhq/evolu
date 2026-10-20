/*
 * The crypto layer's hardware paths, internal to evolu_crypto.c, which calls
 * a function only after evolu_hw_features reports the instructions it uses.
 * Each function exists only on the CPU family whose instructions it uses:
 * AES on arm64 and x86-64, which EVOLU_HW_AES_PATH marks, SHA-512 and DIT on
 * arm64, which EVOLU_HW_ARM64_PATHS marks.
 */
#ifndef EVOLU_CRYPTO_HW_H
#define EVOLU_CRYPTO_HW_H

#include <stddef.h>
#include <stdint.h>

#if defined(__aarch64__) || defined(__x86_64__) || defined(_M_X64)
#define EVOLU_HW_AES_PATH 1
#endif
#if defined(__aarch64__)
#define EVOLU_HW_ARM64_PATHS 1
#endif

/*
 * The CPU's features, EVOLU_CRYPTO_AES, EVOLU_CRYPTO_SHA512 and
 * EVOLU_CRYPTO_DIT, detected at the first call.
 */
int evolu_hw_features(void);

#ifdef EVOLU_HW_AES_PATH
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
#endif

#ifdef EVOLU_HW_ARM64_PATHS
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

#endif
