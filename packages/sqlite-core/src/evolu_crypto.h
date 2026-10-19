/*
 * The core's crypto layer: the primitives of the codec (AES-256-CBC,
 * HMAC-SHA512 and PBKDF2-HMAC-SHA512), the skiplist hashes (SHA-256), a
 * constant-time comparison, a wipe the compiler can't remove, and the
 * platform's CSPRNG. Callers use only the functions below; the BearSSL types
 * inside the contexts are there so callers can embed contexts without
 * allocation, never to be touched.
 *
 * Software path (the only path on wasm, the fallback on native targets): the
 * vendored BearSSL's constant-time AES, aes_ct64, or aes_ct on 32-bit native
 * targets, and its SHA-256 and SHA-512. HMAC-SHA512 and PBKDF2 are Evolu's
 * own, over a precomputed key state.
 *
 * Hardware paths (evolu_crypto_hw.c), detected once at the first use: AES on
 * ARMv8's AES instructions or x86's AES-NI, and SHA-512 on ARMv8.2's SHA-512
 * instructions, constant-time by design. An AES context records the
 * implementation that expanded its key, since each one has its own key
 * schedule; evolu_aes256_init picks the CPU's when it has one. SHA-512 runs
 * every block through one compression function, the CPU's when it has one.
 * evolu_crypto_set_hardware turns both off, for tests and the CI run on the
 * software path.
 *
 * DIT: on arm64 CPUs with data independent timing (FEAT_DIT), the codec and
 * XChaCha20-Poly1305 turn it on around their work with evolu_dit_begin and
 * evolu_dit_end, so instructions take the same time whatever their data.
 *
 * Key hygiene: evolu_aes256_wipe and evolu_hmac_sha512_key_wipe zero key
 * states, every final function zeroes its context, and functions handling
 * keys overwrite the stack BearSSL used below them, best-effort, since C
 * can't promise that a stack is cleared.
 *
 * Global state: the detected CPU features, written once, and the hardware
 * switch. Contexts belong to their caller and can be used from any thread,
 * one thread at a time. A pointer may be NULL when its size is 0.
 */
#ifndef EVOLU_CRYPTO_H
#define EVOLU_CRYPTO_H

#include <stddef.h>
#include <stdint.h>

#include "bearssl_block.h"
#include "bearssl_hash.h"

#ifdef __cplusplus
extern "C" {
#endif

#define EVOLU_AES256_KEY_SIZE 32
#define EVOLU_AES_BLOCK_SIZE 16
#define EVOLU_SHA256_SIZE 32
#define EVOLU_SHA512_SIZE 64
#define EVOLU_SHA512_BLOCK_SIZE 128

typedef enum {
  EVOLU_CRYPTO_OK = 0,
  /* An argument breaks the function's documented precondition. */
  EVOLU_CRYPTO_MISUSE,
  /* The platform's random source failed. */
  EVOLU_CRYPTO_RANDOM_FAILED,
} evolu_crypto_result;

/*
 * Zeroes size bytes at p in a way the compiler can't remove as a dead store.
 */
void evolu_wipe(void *p, size_t size);

/*
 * Zeroes 4 KiB of the stack below its caller, where the functions the caller
 * just returned from left scratch and spilled registers. Best-effort, since C
 * promises nothing about stack layout.
 */
void evolu_wipe_stack(void);

/*
 * Returns 1 when the size bytes at a and b are equal, otherwise 0, in time
 * that depends only on size.
 */
int evolu_constant_time_equal(const void *a, const void *b, size_t size);

/*
 * Fills output with size bytes from the platform's CSPRNG. Returns
 * EVOLU_CRYPTO_RANDOM_FAILED, with output in an unspecified state, when the
 * source fails.
 */
evolu_crypto_result evolu_random_bytes(uint8_t *output, size_t size);

/* An AES-256 implementation: its key schedule and CBC functions. */
typedef struct evolu_aes256_impl evolu_aes256_impl;

/* BearSSL's aes_ct64, the default where 64-bit arithmetic is native. */
extern const evolu_aes256_impl evolu_aes256_ct64;

/* BearSSL's aes_ct, the default on 32-bit native targets. */
extern const evolu_aes256_impl evolu_aes256_ct;

/* An expanded AES-256 key for CBC encryption and decryption. */
typedef struct {
  const evolu_aes256_impl *impl;
  union {
    struct {
      br_aes_ct64_cbcenc_keys encrypt;
      br_aes_ct64_cbcdec_keys decrypt;
    } ct64;
    struct {
      br_aes_ct_cbcenc_keys encrypt;
      br_aes_ct_cbcdec_keys decrypt;
    } ct;
    /* The round keys of encryption and of the equivalent inverse cipher. */
    struct {
      uint8_t encrypt[15][16];
      uint8_t decrypt[15][16];
    } hardware;
  } keys;
} evolu_aes256;

/*
 * The CPU's AES-256, ARMv8's AES instructions or x86's AES-NI, or NULL when it
 * has neither.
 */
const evolu_aes256_impl *evolu_aes256_hardware(void);

/*
 * Expands key with the CPU's implementation, or the software default for this
 * target when it has none or the hardware switch is off.
 */
void evolu_aes256_init(evolu_aes256 *aes,
                       const uint8_t key[EVOLU_AES256_KEY_SIZE]);

/* Expands key with the given implementation, for tests and benchmarks. */
void evolu_aes256_init_with(evolu_aes256 *aes, const evolu_aes256_impl *impl,
                            const uint8_t key[EVOLU_AES256_KEY_SIZE]);

/*
 * Encrypts size bytes of data in place with AES-256-CBC. On return, iv holds
 * the last ciphertext block, so a following call continues the chain. Size
 * must be a multiple of EVOLU_AES_BLOCK_SIZE; otherwise nothing is touched
 * and EVOLU_CRYPTO_MISUSE is returned. Ciphertext stealing is the caller's.
 */
evolu_crypto_result evolu_aes256_cbc_encrypt(const evolu_aes256 *aes,
                                             uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                             uint8_t *data, size_t size);

/* Decrypts like evolu_aes256_cbc_encrypt encrypts, chaining the same way. */
evolu_crypto_result evolu_aes256_cbc_decrypt(const evolu_aes256 *aes,
                                             uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                             uint8_t *data, size_t size);

/* Zeroes the expanded key; the context needs init before its next use. */
void evolu_aes256_wipe(evolu_aes256 *aes);

/* An incremental SHA-256 hash. */
typedef struct {
  br_sha256_context bearssl;
} evolu_sha256;

void evolu_sha256_init(evolu_sha256 *sha);
void evolu_sha256_update(evolu_sha256 *sha, const uint8_t *data, size_t size);

/* Writes the digest and zeroes the context. */
void evolu_sha256_final(evolu_sha256 *sha, uint8_t digest[EVOLU_SHA256_SIZE]);

void evolu_sha256_digest(const uint8_t *data, size_t size,
                         uint8_t digest[EVOLU_SHA256_SIZE]);

/* An incremental SHA-512 hash. */
typedef struct {
  uint64_t state[8];
  /* The number of bytes hashed so far. */
  uint64_t size;
  uint8_t buffer[EVOLU_SHA512_BLOCK_SIZE];
} evolu_sha512;

void evolu_sha512_init(evolu_sha512 *sha);
void evolu_sha512_update(evolu_sha512 *sha, const uint8_t *data, size_t size);

/* Writes the digest and zeroes the context. */
void evolu_sha512_final(evolu_sha512 *sha, uint8_t digest[EVOLU_SHA512_SIZE]);

void evolu_sha512_digest(const uint8_t *data, size_t size,
                         uint8_t digest[EVOLU_SHA512_SIZE]);

/*
 * An HMAC-SHA512 key, kept as the SHA-512 states after the key's inner and
 * outer padded blocks, so each MAC starts without hashing the key again.
 */
typedef struct {
  uint64_t inner[8];
  uint64_t outer[8];
} evolu_hmac_sha512_key;

/* An incremental HMAC-SHA512. */
typedef struct {
  evolu_sha512 inner;
  evolu_sha512 outer;
} evolu_hmac_sha512;

/*
 * Precomputes the key state for size bytes of key; a key longer than a
 * SHA-512 block is hashed first, as RFC 2104 says.
 */
void evolu_hmac_sha512_key_init(evolu_hmac_sha512_key *key,
                                const uint8_t *raw, size_t size);

/* Zeroes the key state. */
void evolu_hmac_sha512_key_wipe(evolu_hmac_sha512_key *key);

void evolu_hmac_sha512_init(evolu_hmac_sha512 *mac,
                            const evolu_hmac_sha512_key *key);
void evolu_hmac_sha512_update(evolu_hmac_sha512 *mac, const uint8_t *data,
                              size_t size);

/*
 * Writes the full 64-byte tag and zeroes the context. Compare tags with
 * evolu_constant_time_equal.
 */
void evolu_hmac_sha512_final(evolu_hmac_sha512 *mac,
                             uint8_t tag[EVOLU_SHA512_SIZE]);

/* Whether the CPU has SHA-512 instructions, ARMv8.2's. */
int evolu_crypto_has_sha512_hardware(void);

/* Whether SHA-512 runs on the CPU's instructions now. */
int evolu_sha512_uses_hardware(void);

/*
 * Sets whether the crypto layer uses the CPU's AES and SHA-512 instructions
 * where it has them, 1 by default: for tests and the CI run on the software
 * path, set while no crypto call runs. An AES context keeps the
 * implementation it was expanded with.
 */
void evolu_crypto_set_hardware(int enabled);

/* Whether the hardware switch is on. */
int evolu_crypto_is_hardware_enabled(void);

/* Whether the CPU has data independent timing, arm64's FEAT_DIT. */
int evolu_crypto_has_dit(void);

/*
 * Turns DIT on where the CPU has it and returns what to pass to
 * evolu_dit_end, which restores the previous state, so calls nest. A no-op
 * returning 0 elsewhere.
 */
unsigned evolu_dit_begin(void);
void evolu_dit_end(unsigned previous);

/* Whether DIT is on, for tests. */
int evolu_dit_is_set(void);

#ifdef EVOLU_TEST_HOOKS
/*
 * The C test runner's hooks. EVOLU_PROBE_DIT sets evolu_test_dit_missed when
 * it runs without DIT on a CPU that has it, which AES, HMAC-SHA512, PBKDF2 and
 * the XChaCha20-Poly1305 wrappers call, so the tests check that the page codec
 * and XChaCha20-Poly1305 turn DIT on around them. While
 * evolu_test_random_fails is set, evolu_random_bytes fails.
 *
 * evolu_test_allocations_left counts the core's own allocations from the C
 * library, the page codec, the codec VFS and a database's scratch buffer,
 * which SQLite's heap limit can't fail. At -1, the default, none fails. From
 * 0 up, each takes one, and the one that finds 0 fails and leaves it at -2,
 * where every later one fails too. evolu_test_allocation_fails takes one.
 */
extern int evolu_test_dit_missed;
extern int evolu_test_random_fails;
extern int evolu_test_allocations_left;
int evolu_test_allocation_fails(void);
#define EVOLU_PROBE_DIT()                                                      \
  do {                                                                         \
    if (evolu_crypto_has_dit() && !evolu_dit_is_set())                         \
      evolu_test_dit_missed = 1;                                               \
  } while (0)
#else
#define EVOLU_PROBE_DIT() ((void)0)
#endif

/*
 * Derives output_size bytes from password and salt with PBKDF2-HMAC-SHA512
 * (RFC 8018). Returns EVOLU_CRYPTO_MISUSE without touching output when
 * iterations is 0 or output_size exceeds PBKDF2's (2^32 - 1) * 64 bytes.
 */
evolu_crypto_result evolu_pbkdf2_sha512(const uint8_t *password,
                                        size_t password_size,
                                        const uint8_t *salt, size_t salt_size,
                                        uint32_t iterations, uint8_t *output,
                                        size_t output_size);

#ifdef __cplusplus
}
#endif

#endif
