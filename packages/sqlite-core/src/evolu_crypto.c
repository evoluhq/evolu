/*
 * The crypto layer's software path; evolu_crypto.h describes the API.
 *
 * AES-256-CBC is BearSSL's aes_ct64 or aes_ct, bitsliced and constant-time, or
 * the CPU's instructions. An evolu_aes256_impl table holds each
 * implementation's key schedule and CBC functions, and a context records the
 * table that expanded its key.
 *
 * Hardware paths live in evolu_crypto_hw.c: AES chosen at evolu_aes256_init,
 * SHA-512 per call, from the detected features and the hardware switch.
 *
 * SHA-256 is BearSSL's sha2small as is. SHA-512's buffering and padding are
 * Evolu's own, around one compression function, sha512_blocks, because that's
 * where hardware SHA-512 slots in and BearSSL keeps its compression function
 * private; the software one reaches BearSSL's sha2big through its public
 * state functions. Owning the framing also makes the HMAC key state plain:
 * the two SHA-512 states after the key's padded blocks.
 *
 * HMAC-SHA512 (RFC 2104) and PBKDF2-HMAC-SHA512 (RFC 8018) are Evolu's own.
 * Every keyed computation is constant-time: no branch or memory index depends
 * on a key, a message or a tag, only on sizes.
 *
 * Wiping: contexts are zeroed by their final and wipe functions, and every
 * temporary copy of a key, state or block by the function that made it.
 * BearSSL leaves its own scratch on the stack, such as aes_ct64's expanded
 * key schedule, so the functions that run on keys end with evolu_wipe_stack.
 */

// memset_s is declared only on request (C11 Annex K), and glibc declares
// explicit_bzero only outside strict ISO C. Both must precede every include.
#define __STDC_WANT_LIB_EXT1__ 1
#define _DEFAULT_SOURCE 1

#include "evolu_crypto.h"

#include "evolu_crypto_hw.h"

#include <stdatomic.h>
#include <string.h>

#if defined(__APPLE__) || defined(__ANDROID__) || defined(__FreeBSD__) ||      \
    defined(__OpenBSD__) || defined(__NetBSD__)
#include <stdlib.h>
#elif defined(__linux__)
#include <errno.h>
#include <sys/random.h>
#include <sys/types.h>
#elif defined(__wasm__)
#error "evolu_random_bytes on wasm (crypto.getRandomValues) comes in Phase 1"
#elif defined(_WIN32)
#error "evolu_random_bytes on Windows (BCryptGenRandom) comes in Phase 2"
#else
#error "evolu_random_bytes has no CSPRNG for this platform"
#endif

void evolu_wipe(void *p, size_t size) {
  if (size == 0) return;
#if defined(__APPLE__)
  memset_s(p, size, 0, size);
#elif defined(__GLIBC__) || defined(__FreeBSD__) || defined(__OpenBSD__)
  explicit_bzero(p, size);
#else
  // Stores through a volatile pointer are observable behavior, so the
  // compiler keeps them.
  volatile uint8_t *bytes = p;
  while (size-- > 0) *bytes++ = 0;
#endif
}

#if defined(__GNUC__) || defined(__clang__)
#define EVOLU_NOINLINE __attribute__((noinline))
#elif defined(_MSC_VER)
#define EVOLU_NOINLINE __declspec(noinline)
#else
#define EVOLU_NOINLINE
#endif

/*
 * BearSSL's functions leave their scratch there: aes_ct64 expands the key
 * schedule into a 960-byte local, and SHA-512 keeps a 640-byte message
 * schedule. Not inlined, so its array lies where their frames were; 4 KiB
 * covers BearSSL's deepest frames here several times over.
 */
EVOLU_NOINLINE void evolu_wipe_stack(void) {
  uint8_t scratch[4096];
  evolu_wipe(scratch, sizeof scratch);
}

int evolu_constant_time_equal(const void *a, const void *b, size_t size) {
  const uint8_t *x = a;
  const uint8_t *y = b;
  // Accumulating into a volatile keeps the compiler from ending the loop at
  // the first difference.
  volatile uint8_t difference = 0;
  for (size_t i = 0; i < size; i++) difference |= x[i] ^ y[i];
  // 1 when difference is 0, without a branch: only 0 wraps around when 1 is
  // subtracted, setting bit 8.
  return (int)((((uint32_t)difference - 1) >> 8) & 1);
}

evolu_crypto_result evolu_random_bytes(uint8_t *output, size_t size) {
  if (size == 0) return EVOLU_CRYPTO_OK;
#ifdef EVOLU_TEST_HOOKS
  if (evolu_test_random_fails) return EVOLU_CRYPTO_RANDOM_FAILED;
#endif
#if defined(__APPLE__) || defined(__ANDROID__) || defined(__FreeBSD__) ||      \
    defined(__OpenBSD__) || defined(__NetBSD__)
  // The kernel-seeded generator never fails and needs no file descriptor.
  arc4random_buf(output, size);
#else
  while (size > 0) {
    // getrandom blocks until the kernel's pool is seeded, then returns at
    // most size bytes; a signal can interrupt it before it returns any.
    ssize_t read = getrandom(output, size, 0);
    if (read < 0) {
      if (errno == EINTR) continue;
      return EVOLU_CRYPTO_RANDOM_FAILED;
    }
    output += read;
    size -= (size_t)read;
  }
#endif
  return EVOLU_CRYPTO_OK;
}

/*
 * CBC runs over whole blocks; each implementation keeps its own key schedule
 * in evolu_aes256's keys union.
 */
typedef void aes256_cbc_function(const evolu_aes256 *aes,
                                 uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                 uint8_t *data, size_t size);

struct evolu_aes256_impl {
  void (*init)(evolu_aes256 *aes, const uint8_t key[EVOLU_AES256_KEY_SIZE]);
  aes256_cbc_function *cbc_encrypt;
  aes256_cbc_function *cbc_decrypt;
};

// BearSSL keeps separate contexts for CBC encryption and decryption, each
// with the same key schedule.
static void aes256_ct64_init(evolu_aes256 *aes,
                             const uint8_t key[EVOLU_AES256_KEY_SIZE]) {
  br_aes_ct64_cbcenc_init(&aes->keys.ct64.encrypt, key, EVOLU_AES256_KEY_SIZE);
  br_aes_ct64_cbcdec_init(&aes->keys.ct64.decrypt, key, EVOLU_AES256_KEY_SIZE);
}

static void aes256_ct64_cbc_encrypt(const evolu_aes256 *aes,
                                    uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                    uint8_t *data, size_t size) {
  br_aes_ct64_cbcenc_run(&aes->keys.ct64.encrypt, iv, data, size);
}

static void aes256_ct64_cbc_decrypt(const evolu_aes256 *aes,
                                    uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                    uint8_t *data, size_t size) {
  br_aes_ct64_cbcdec_run(&aes->keys.ct64.decrypt, iv, data, size);
}

const evolu_aes256_impl evolu_aes256_ct64 = {
    aes256_ct64_init, aes256_ct64_cbc_encrypt, aes256_ct64_cbc_decrypt};

static void aes256_ct_init(evolu_aes256 *aes,
                           const uint8_t key[EVOLU_AES256_KEY_SIZE]) {
  br_aes_ct_cbcenc_init(&aes->keys.ct.encrypt, key, EVOLU_AES256_KEY_SIZE);
  br_aes_ct_cbcdec_init(&aes->keys.ct.decrypt, key, EVOLU_AES256_KEY_SIZE);
}

static void aes256_ct_cbc_encrypt(const evolu_aes256 *aes,
                                  uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                  uint8_t *data, size_t size) {
  br_aes_ct_cbcenc_run(&aes->keys.ct.encrypt, iv, data, size);
}

static void aes256_ct_cbc_decrypt(const evolu_aes256 *aes,
                                  uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                  uint8_t *data, size_t size) {
  br_aes_ct_cbcdec_run(&aes->keys.ct.decrypt, iv, data, size);
}

const evolu_aes256_impl evolu_aes256_ct = {
    aes256_ct_init, aes256_ct_cbc_encrypt, aes256_ct_cbc_decrypt};

static void aes256_hardware_init(evolu_aes256 *aes,
                                 const uint8_t key[EVOLU_AES256_KEY_SIZE]) {
  evolu_hw_aes256_expand(key, aes->keys.hardware.encrypt,
                         aes->keys.hardware.decrypt);
}

static void aes256_hardware_cbc_encrypt(const evolu_aes256 *aes,
                                        uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                        uint8_t *data, size_t size) {
  evolu_hw_aes256_cbc_encrypt(aes->keys.hardware.encrypt, iv, data, size);
}

static void aes256_hardware_cbc_decrypt(const evolu_aes256 *aes,
                                        uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                        uint8_t *data, size_t size) {
  evolu_hw_aes256_cbc_decrypt(aes->keys.hardware.decrypt, iv, data, size);
}

static const evolu_aes256_impl aes256_hardware = {
    aes256_hardware_init, aes256_hardware_cbc_encrypt,
    aes256_hardware_cbc_decrypt};

/* Whether to use the CPU's instructions; see evolu_crypto_set_hardware. */
static atomic_int is_hardware_enabled = 1;

void evolu_crypto_set_hardware(int enabled) {
  atomic_store_explicit(&is_hardware_enabled, enabled != 0,
                        memory_order_relaxed);
}

int evolu_crypto_is_hardware_enabled(void) {
  return atomic_load_explicit(&is_hardware_enabled, memory_order_relaxed);
}

/* Whether the CPU has a feature and the hardware switch is on. */
static int uses_hardware(int feature) {
  return atomic_load_explicit(&is_hardware_enabled, memory_order_relaxed) &&
         (evolu_hw_features() & feature) != 0;
}

const evolu_aes256_impl *evolu_aes256_hardware(void) {
  return (evolu_hw_features() & EVOLU_HW_AES) ? &aes256_hardware : NULL;
}

#ifdef EVOLU_TEST_HOOKS
int evolu_test_dit_missed;
int evolu_test_random_fails;
#endif

void evolu_aes256_init(evolu_aes256 *aes,
                       const uint8_t key[EVOLU_AES256_KEY_SIZE]) {
  if (uses_hardware(EVOLU_HW_AES)) {
    evolu_aes256_init_with(aes, &aes256_hardware, key);
    return;
  }
  // BearSSL advises aes_ct64 wherever 64-bit arithmetic is native, which
  // includes wasm32, and aes_ct on 32-bit CPUs.
#if UINTPTR_MAX > UINT32_MAX || defined(__wasm__)
  evolu_aes256_init_with(aes, &evolu_aes256_ct64, key);
#else
  evolu_aes256_init_with(aes, &evolu_aes256_ct, key);
#endif
}

void evolu_aes256_init_with(evolu_aes256 *aes, const evolu_aes256_impl *impl,
                            const uint8_t key[EVOLU_AES256_KEY_SIZE]) {
  EVOLU_PROBE_DIT();
  aes->impl = impl;
  impl->init(aes, key);
  evolu_wipe_stack();
}

evolu_crypto_result evolu_aes256_cbc_encrypt(const evolu_aes256 *aes,
                                             uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                             uint8_t *data, size_t size) {
  // BearSSL loops until the size reaches 0, so a partial block would run
  // past the data.
  if (size % EVOLU_AES_BLOCK_SIZE != 0) return EVOLU_CRYPTO_MISUSE;
  EVOLU_PROBE_DIT();
  aes->impl->cbc_encrypt(aes, iv, data, size);
  evolu_wipe_stack();
  return EVOLU_CRYPTO_OK;
}

evolu_crypto_result evolu_aes256_cbc_decrypt(const evolu_aes256 *aes,
                                             uint8_t iv[EVOLU_AES_BLOCK_SIZE],
                                             uint8_t *data, size_t size) {
  if (size % EVOLU_AES_BLOCK_SIZE != 0) return EVOLU_CRYPTO_MISUSE;
  EVOLU_PROBE_DIT();
  aes->impl->cbc_decrypt(aes, iv, data, size);
  evolu_wipe_stack();
  return EVOLU_CRYPTO_OK;
}

void evolu_aes256_wipe(evolu_aes256 *aes) { evolu_wipe(aes, sizeof *aes); }

void evolu_sha256_init(evolu_sha256 *sha) { br_sha256_init(&sha->bearssl); }

void evolu_sha256_update(evolu_sha256 *sha, const uint8_t *data, size_t size) {
  br_sha256_update(&sha->bearssl, data, size);
}

void evolu_sha256_final(evolu_sha256 *sha, uint8_t digest[EVOLU_SHA256_SIZE]) {
  br_sha256_out(&sha->bearssl, digest);
  evolu_wipe(sha, sizeof *sha);
}

void evolu_sha256_digest(const uint8_t *data, size_t size,
                         uint8_t digest[EVOLU_SHA256_SIZE]) {
  evolu_sha256 sha;
  evolu_sha256_init(&sha);
  evolu_sha256_update(&sha, data, size);
  evolu_sha256_final(&sha, digest);
}

static uint64_t load64_be(const uint8_t *p) {
  uint64_t value = 0;
  for (int i = 0; i < 8; i++) value = value << 8 | p[i];
  return value;
}

static void store64_be(uint8_t *p, uint64_t value) {
  for (int i = 0; i < 8; i++) p[i] = (uint8_t)(value >> (56 - 8 * i));
}

/* FIPS 180-4 section 5.3.5: SHA-512's initial hash value. */
static const uint64_t sha512_initial_state[8] = {
    0x6a09e667f3bcc908, 0xbb67ae8584caa73b, 0x3c6ef372fe94f82b,
    0xa54ff53a5f1d36f1, 0x510e527fade682d1, 0x9b05688c2b3e6c1f,
    0x1f83d9abfb41bd6b, 0x5be0cd19137e2179};

/*
 * BearSSL keeps its compression function private, so this feeds the blocks
 * through its public API from a restored running state: with a byte count of
 * 0 its buffer is empty, so it compresses each block as it arrives.
 */
static void sha512_blocks_bearssl(uint64_t state[8], const uint8_t *blocks,
                                  size_t count) {
  br_sha512_context bearssl;
  uint8_t bytes[64];
  for (int i = 0; i < 8; i++) store64_be(bytes + 8 * i, state[i]);
  br_sha512_set_state(&bearssl, bytes, 0);
  br_sha512_update(&bearssl, blocks, count * EVOLU_SHA512_BLOCK_SIZE);
  br_sha512_state(&bearssl, bytes);
  for (int i = 0; i < 8; i++) state[i] = load64_be(bytes + 8 * i);
  // BearSSL's buffer still holds the last block.
  evolu_wipe(&bearssl, sizeof bearssl);
  evolu_wipe(bytes, sizeof bytes);
}

int evolu_crypto_has_sha512_hardware(void) {
  return (evolu_hw_features() & EVOLU_HW_SHA512) != 0;
}

int evolu_sha512_uses_hardware(void) { return uses_hardware(EVOLU_HW_SHA512); }

/* The dispatch point every SHA-512 block goes through. */
static void sha512_blocks(uint64_t state[8], const uint8_t *blocks,
                          size_t count) {
  if (uses_hardware(EVOLU_HW_SHA512))
    evolu_hw_sha512_blocks(state, blocks, count);
  else
    sha512_blocks_bearssl(state, blocks, count);
}

int evolu_crypto_has_dit(void) {
  return (evolu_hw_features() & EVOLU_HW_DIT) != 0;
}

/* PSTATE.DIT in arm64's DIT register. */
#define DIT_BIT ((uint64_t)1 << 24)

unsigned evolu_dit_begin(void) {
  if (!evolu_crypto_has_dit()) return 0;
  uint64_t previous = evolu_hw_dit_read();
  evolu_hw_dit_write(DIT_BIT);
  return (previous & DIT_BIT) != 0;
}

void evolu_dit_end(unsigned previous) {
  if (evolu_crypto_has_dit()) evolu_hw_dit_write(previous ? DIT_BIT : 0);
}

int evolu_dit_is_set(void) {
  return evolu_crypto_has_dit() && (evolu_hw_dit_read() & DIT_BIT) != 0;
}

void evolu_sha512_init(evolu_sha512 *sha) {
  memcpy(sha->state, sha512_initial_state, sizeof sha->state);
  sha->size = 0;
}

void evolu_sha512_update(evolu_sha512 *sha, const uint8_t *data, size_t size) {
  if (size == 0) return;
  size_t buffered = (size_t)(sha->size % EVOLU_SHA512_BLOCK_SIZE);
  sha->size += size;
  if (buffered > 0) {
    size_t take = EVOLU_SHA512_BLOCK_SIZE - buffered;
    if (take > size) take = size;
    memcpy(sha->buffer + buffered, data, take);
    data += take;
    size -= take;
    if (buffered + take < EVOLU_SHA512_BLOCK_SIZE) return;
    sha512_blocks(sha->state, sha->buffer, 1);
  }
  size_t blocks = size / EVOLU_SHA512_BLOCK_SIZE;
  if (blocks > 0) {
    sha512_blocks(sha->state, data, blocks);
    data += blocks * EVOLU_SHA512_BLOCK_SIZE;
    size -= blocks * EVOLU_SHA512_BLOCK_SIZE;
  }
  if (size > 0) memcpy(sha->buffer, data, size);
}

/*
 * Pads the message, compresses the last block or two and writes the digest,
 * leaving the context for the caller to wipe.
 */
static void sha512_finish(evolu_sha512 *sha,
                          uint8_t digest[EVOLU_SHA512_SIZE]) {
  // FIPS 180-4 section 5.1.2: a 1 bit, zeros, and the message length in bits
  // as a 128-bit big-endian number in the last 16 bytes of a block.
  size_t buffered = (size_t)(sha->size % EVOLU_SHA512_BLOCK_SIZE);
  sha->buffer[buffered++] = 0x80;
  if (buffered > EVOLU_SHA512_BLOCK_SIZE - 16) {
    memset(sha->buffer + buffered, 0, EVOLU_SHA512_BLOCK_SIZE - buffered);
    sha512_blocks(sha->state, sha->buffer, 1);
    buffered = 0;
  }
  memset(sha->buffer + buffered, 0, EVOLU_SHA512_BLOCK_SIZE - 16 - buffered);
  store64_be(sha->buffer + EVOLU_SHA512_BLOCK_SIZE - 16, sha->size >> 61);
  store64_be(sha->buffer + EVOLU_SHA512_BLOCK_SIZE - 8, sha->size << 3);
  sha512_blocks(sha->state, sha->buffer, 1);
  for (int i = 0; i < 8; i++) store64_be(digest + 8 * i, sha->state[i]);
}

void evolu_sha512_final(evolu_sha512 *sha, uint8_t digest[EVOLU_SHA512_SIZE]) {
  sha512_finish(sha, digest);
  evolu_wipe(sha, sizeof *sha);
}

void evolu_sha512_digest(const uint8_t *data, size_t size,
                         uint8_t digest[EVOLU_SHA512_SIZE]) {
  evolu_sha512 sha;
  evolu_sha512_init(&sha);
  evolu_sha512_update(&sha, data, size);
  evolu_sha512_final(&sha, digest);
}

void evolu_hmac_sha512_key_init(evolu_hmac_sha512_key *key,
                                const uint8_t *raw, size_t size) {
  EVOLU_PROBE_DIT();
  // RFC 2104: the key, hashed first when longer than a block, padded with
  // zeros to a block and XORed with ipad for the inner hash, opad for the
  // outer one.
  uint8_t block[EVOLU_SHA512_BLOCK_SIZE] = {0};
  if (size > EVOLU_SHA512_BLOCK_SIZE)
    evolu_sha512_digest(raw, size, block);
  else if (size > 0)
    memcpy(block, raw, size);
  for (size_t i = 0; i < sizeof block; i++) block[i] ^= 0x36;
  memcpy(key->inner, sha512_initial_state, sizeof key->inner);
  sha512_blocks(key->inner, block, 1);
  for (size_t i = 0; i < sizeof block; i++) block[i] ^= 0x36 ^ 0x5c;
  memcpy(key->outer, sha512_initial_state, sizeof key->outer);
  sha512_blocks(key->outer, block, 1);
  evolu_wipe(block, sizeof block);
  evolu_wipe_stack();
}

void evolu_hmac_sha512_key_wipe(evolu_hmac_sha512_key *key) {
  evolu_wipe(key, sizeof *key);
}

void evolu_hmac_sha512_init(evolu_hmac_sha512 *mac,
                            const evolu_hmac_sha512_key *key) {
  // Both hashes continue after their key block.
  memcpy(mac->inner.state, key->inner, sizeof mac->inner.state);
  mac->inner.size = EVOLU_SHA512_BLOCK_SIZE;
  memcpy(mac->outer.state, key->outer, sizeof mac->outer.state);
  mac->outer.size = EVOLU_SHA512_BLOCK_SIZE;
}

void evolu_hmac_sha512_update(evolu_hmac_sha512 *mac, const uint8_t *data,
                              size_t size) {
  EVOLU_PROBE_DIT();
  evolu_sha512_update(&mac->inner, data, size);
}

/* Writes the tag, leaving the context for the caller to wipe. */
static void hmac_sha512_finish(evolu_hmac_sha512 *mac,
                               uint8_t tag[EVOLU_SHA512_SIZE]) {
  // The inner digest goes straight into the outer hash's empty buffer.
  sha512_finish(&mac->inner, mac->outer.buffer);
  mac->outer.size += EVOLU_SHA512_SIZE;
  sha512_finish(&mac->outer, tag);
}

void evolu_hmac_sha512_final(evolu_hmac_sha512 *mac,
                             uint8_t tag[EVOLU_SHA512_SIZE]) {
  EVOLU_PROBE_DIT();
  hmac_sha512_finish(mac, tag);
  evolu_wipe(mac, sizeof *mac);
  evolu_wipe_stack();
}

evolu_crypto_result evolu_pbkdf2_sha512(const uint8_t *password,
                                        size_t password_size,
                                        const uint8_t *salt, size_t salt_size,
                                        uint32_t iterations, uint8_t *output,
                                        size_t output_size) {
  // RFC 8018 section 5.2: output block i (counted from 1 in 32 bits) is
  // U_1 ^ ... ^ U_c, where U_1 = HMAC(P, S || INT(i)), U_j = HMAC(P, U_j-1).
  if (iterations == 0 ||
      (uint64_t)output_size > (uint64_t)UINT32_MAX * EVOLU_SHA512_SIZE)
    return EVOLU_CRYPTO_MISUSE;

  evolu_hmac_sha512_key key;
  evolu_hmac_sha512 mac;
  uint8_t u[EVOLU_SHA512_SIZE];
  uint8_t t[EVOLU_SHA512_SIZE];
  evolu_hmac_sha512_key_init(&key, password, password_size);
  for (uint32_t block = 1; output_size > 0; block++) {
    const uint8_t counter[4] = {(uint8_t)(block >> 24), (uint8_t)(block >> 16),
                                (uint8_t)(block >> 8), (uint8_t)block};
    evolu_hmac_sha512_init(&mac, &key);
    evolu_hmac_sha512_update(&mac, salt, salt_size);
    evolu_hmac_sha512_update(&mac, counter, sizeof counter);
    hmac_sha512_finish(&mac, u);
    memcpy(t, u, sizeof t);
    for (uint32_t i = 1; i < iterations; i++) {
      evolu_hmac_sha512_init(&mac, &key);
      evolu_hmac_sha512_update(&mac, u, sizeof u);
      hmac_sha512_finish(&mac, u);
      for (size_t j = 0; j < sizeof t; j++) t[j] ^= u[j];
    }
    size_t take = output_size < sizeof t ? output_size : sizeof t;
    memcpy(output, t, take);
    output += take;
    output_size -= take;
  }
  evolu_hmac_sha512_key_wipe(&key);
  evolu_wipe(&mac, sizeof mac);
  evolu_wipe(u, sizeof u);
  evolu_wipe(t, sizeof t);
  evolu_wipe_stack();
  return EVOLU_CRYPTO_OK;
}
