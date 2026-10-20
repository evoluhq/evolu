/*
 * The core's XChaCha20-Poly1305 computes the standard construction, writes
 * exactly the bytes that Evolu's TypeScript writes and reads, and rejects
 * every forgery without releasing plaintext.
 *
 * The vectors in xchacha_vectors.h come from xchacha-vectors.test.mts, which
 * encrypts with Evolu's TypeScript (noble); generate them again with it rather
 * than editing them.
 */
#include "test.h"

#include "evolu_crypto.h"
#include "evolu_xchacha.h"
#include "monocypher.h"

#include <sanitizer/asan_interface.h>
#include <stdint.h>
#include <string.h>

/*
 * AEAD_XChaCha20_Poly1305 of draft-irtf-cfrg-xchacha-03, appendix A.3.1
 * (https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha-03).
 * The vector has associated data, which Evolu doesn't use and
 * evolu_xchacha.h doesn't take, so it checks the Monocypher functions
 * evolu_xchacha.c calls, with that data added.
 */
static void xchacha_matches_the_draft_vector(void) {
  static const uint8_t plaintext[114] = {
      0x4c, 0x61, 0x64, 0x69, 0x65, 0x73, 0x20, 0x61, 0x6e, 0x64, 0x20, 0x47,
      0x65, 0x6e, 0x74, 0x6c, 0x65, 0x6d, 0x65, 0x6e, 0x20, 0x6f, 0x66, 0x20,
      0x74, 0x68, 0x65, 0x20, 0x63, 0x6c, 0x61, 0x73, 0x73, 0x20, 0x6f, 0x66,
      0x20, 0x27, 0x39, 0x39, 0x3a, 0x20, 0x49, 0x66, 0x20, 0x49, 0x20, 0x63,
      0x6f, 0x75, 0x6c, 0x64, 0x20, 0x6f, 0x66, 0x66, 0x65, 0x72, 0x20, 0x79,
      0x6f, 0x75, 0x20, 0x6f, 0x6e, 0x6c, 0x79, 0x20, 0x6f, 0x6e, 0x65, 0x20,
      0x74, 0x69, 0x70, 0x20, 0x66, 0x6f, 0x72, 0x20, 0x74, 0x68, 0x65, 0x20,
      0x66, 0x75, 0x74, 0x75, 0x72, 0x65, 0x2c, 0x20, 0x73, 0x75, 0x6e, 0x73,
      0x63, 0x72, 0x65, 0x65, 0x6e, 0x20, 0x77, 0x6f, 0x75, 0x6c, 0x64, 0x20,
      0x62, 0x65, 0x20, 0x69, 0x74, 0x2e,
  };
  static const uint8_t ad[12] = {
      0x50, 0x51, 0x52, 0x53, 0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  };
  static const uint8_t key[EVOLU_XCHACHA_KEY_SIZE] = {
      0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b,
      0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97,
      0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f,
  };
  static const uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE] = {
      0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b,
      0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57,
  };
  static const uint8_t ciphertext[114] = {
      0xbd, 0x6d, 0x17, 0x9d, 0x3e, 0x83, 0xd4, 0x3b, 0x95, 0x76, 0x57, 0x94,
      0x93, 0xc0, 0xe9, 0x39, 0x57, 0x2a, 0x17, 0x00, 0x25, 0x2b, 0xfa, 0xcc,
      0xbe, 0xd2, 0x90, 0x2c, 0x21, 0x39, 0x6c, 0xbb, 0x73, 0x1c, 0x7f, 0x1b,
      0x0b, 0x4a, 0xa6, 0x44, 0x0b, 0xf3, 0xa8, 0x2f, 0x4e, 0xda, 0x7e, 0x39,
      0xae, 0x64, 0xc6, 0x70, 0x8c, 0x54, 0xc2, 0x16, 0xcb, 0x96, 0xb7, 0x2e,
      0x12, 0x13, 0xb4, 0x52, 0x2f, 0x8c, 0x9b, 0xa4, 0x0d, 0xb5, 0xd9, 0x45,
      0xb1, 0x1b, 0x69, 0xb9, 0x82, 0xc1, 0xbb, 0x9e, 0x3f, 0x3f, 0xac, 0x2b,
      0xc3, 0x69, 0x48, 0x8f, 0x76, 0xb2, 0x38, 0x35, 0x65, 0xd3, 0xff, 0xf9,
      0x21, 0xf9, 0x66, 0x4c, 0x97, 0x63, 0x7d, 0xa9, 0x76, 0x88, 0x12, 0xf6,
      0x15, 0xc6, 0x8b, 0x13, 0xb5, 0x2e,
  };
  static const uint8_t tag[EVOLU_XCHACHA_TAG_SIZE] = {
      0xc0, 0x87, 0x59, 0x24, 0xc1, 0xc7, 0x98, 0x79,
      0x47, 0xde, 0xaf, 0xd8, 0x78, 0x0a, 0xcf, 0x49,
  };
  uint8_t output[sizeof ciphertext];
  uint8_t mac[EVOLU_XCHACHA_TAG_SIZE];
  uint8_t decrypted[sizeof plaintext];

  crypto_aead_lock(output, mac, key, nonce, ad, sizeof ad, plaintext,
                   sizeof plaintext);
  CHECK_EQ_BYTES(output, ciphertext, sizeof ciphertext);
  CHECK_EQ_BYTES(mac, tag, sizeof tag);

  CHECK_EQ_INT(crypto_aead_unlock(decrypted, tag, key, nonce, ad, sizeof ad,
                                  ciphertext, sizeof ciphertext),
               0);
  CHECK_EQ_BYTES(decrypted, plaintext, sizeof plaintext);
}

/*
 * A vector of xchacha-vectors.test.mts. The plaintext is
 * vector_plaintext_byte's first length bytes, and the ciphertext is
 * represented by its checksum.
 */
struct noble_vector {
  size_t length;
  uint8_t key[EVOLU_XCHACHA_KEY_SIZE];
  uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE];
  uint8_t tag[EVOLU_XCHACHA_TAG_SIZE];
  uint64_t ciphertext_checksum;
};

#include "xchacha_vectors.h"

#define NOBLE_VECTOR_COUNT (sizeof noble_vectors / sizeof noble_vectors[0])
#define MAX_PLAINTEXT_SIZE 65536

// The plaintext formula of xchacha-vectors.test.mts.
static uint8_t vector_plaintext_byte(size_t i) {
  return (uint8_t)((i * 31 + 7) & 0xff);
}

// 64-bit FNV-1a, as xchacha-vectors.test.mts computes it.
static uint64_t fnv1a64(const uint8_t *bytes, size_t length) {
  uint64_t hash = UINT64_C(0xcbf29ce484222325);
  for (size_t i = 0; i < length; i++) {
    hash ^= bytes[i];
    hash *= UINT64_C(0x100000001b3);
  }
  return hash;
}

// Static, because the longest vector doesn't belong on the stack.
static uint8_t plaintext[MAX_PLAINTEXT_SIZE];
static uint8_t output[MAX_PLAINTEXT_SIZE + EVOLU_XCHACHA_TAG_SIZE];
static uint8_t decrypted[MAX_PLAINTEXT_SIZE];

/*
 * Encrypting writes the bytes Evolu's TypeScript writes, and decrypting them
 * returns the plaintext.
 */
static void xchacha_matches_evolus_typescript(void) {
  for (size_t v = 0; v < NOBLE_VECTOR_COUNT; v++) {
    const struct noble_vector *vector = &noble_vectors[v];
    CHECK(vector->length <= MAX_PLAINTEXT_SIZE);
    for (size_t i = 0; i < vector->length; i++)
      plaintext[i] = vector_plaintext_byte(i);

    evolu_xchacha_encrypt(output, vector->key, vector->nonce, plaintext,
                          vector->length);

    CHECK_EQ_BYTES(output + vector->length, vector->tag,
                   EVOLU_XCHACHA_TAG_SIZE);
    CHECK(fnv1a64(output, vector->length) == vector->ciphertext_checksum);

    memset(decrypted, 0xa5, vector->length);
    CHECK_EQ_INT(evolu_xchacha_decrypt(decrypted, vector->key, vector->nonce,
                                       output,
                                       vector->length + EVOLU_XCHACHA_TAG_SIZE),
                 EVOLU_XCHACHA_OK);
    CHECK_EQ_BYTES(decrypted, plaintext, vector->length);
  }
}

static const uint8_t test_key[EVOLU_XCHACHA_KEY_SIZE] = {
    0x1f, 0xa9, 0x3c, 0x55, 0x08, 0xe2, 0x71, 0x9d, 0x46, 0xbb, 0x02,
    0xc7, 0x6e, 0x13, 0xf8, 0x84, 0x2a, 0x59, 0xd0, 0x37, 0x95, 0x6c,
    0xe1, 0x0b, 0x7a, 0x4f, 0xb6, 0x28, 0xcd, 0x93, 0x10, 0x5e,
};
static const uint8_t test_nonce[EVOLU_XCHACHA_NONCE_SIZE] = {
    0x64, 0x0e, 0xd7, 0x31, 0x9a, 0x45, 0xfc, 0x22, 0x8b, 0x70, 0x19, 0xe6,
    0x53, 0xae, 0x07, 0xc4, 0x3d, 0x91, 0x6a, 0xf2, 0x28, 0xb5, 0x4c, 0x80,
};

/*
 * Bindings pass NULL for empty buffers. The tag of an empty plaintext still
 * authenticates the empty ciphertext.
 */
static void xchacha_round_trips_an_empty_plaintext(void) {
  uint8_t tag[EVOLU_XCHACHA_TAG_SIZE];

  evolu_xchacha_encrypt(tag, test_key, test_nonce, NULL, 0);
  CHECK_EQ_INT(evolu_xchacha_decrypt(NULL, test_key, test_nonce, tag,
                                     sizeof tag),
               EVOLU_XCHACHA_OK);

  tag[0] ^= 1;
  CHECK_EQ_INT(evolu_xchacha_decrypt(NULL, test_key, test_nonce, tag,
                                     sizeof tag),
               EVOLU_XCHACHA_NOT_AUTHENTIC);
}

// Longer than a ChaCha20 block and not a whole number of Poly1305 blocks.
#define FORGERY_PLAINTEXT_SIZE 70
#define FORGERY_INPUT_SIZE (FORGERY_PLAINTEXT_SIZE + EVOLU_XCHACHA_TAG_SIZE)

static int is_zero(const uint8_t *bytes, size_t length) {
  uint8_t bits = 0;
  for (size_t i = 0; i < length; i++)
    bits |= bytes[i];
  return bits == 0;
}

// Encrypts FORGERY_PLAINTEXT_SIZE bytes under test_key and test_nonce.
static void encrypt_forgery_input(uint8_t input[FORGERY_INPUT_SIZE]) {
  uint8_t bytes[FORGERY_PLAINTEXT_SIZE];
  for (size_t i = 0; i < sizeof bytes; i++)
    bytes[i] = vector_plaintext_byte(i);
  evolu_xchacha_encrypt(input, test_key, test_nonce, bytes, sizeof bytes);
}

/*
 * Decrypts with a forged key, nonce or input into an output filled with a
 * pattern, and returns whether it failed and zeroed the output.
 */
static int is_rejected_and_wiped(const uint8_t key[EVOLU_XCHACHA_KEY_SIZE],
                                 const uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE],
                                 const uint8_t *input, size_t input_size) {
  uint8_t forged[FORGERY_PLAINTEXT_SIZE];
  size_t size = input_size - EVOLU_XCHACHA_TAG_SIZE;
  memset(forged, 0xa5, sizeof forged);
  return evolu_xchacha_decrypt(forged, key, nonce, input, input_size) ==
             EVOLU_XCHACHA_NOT_AUTHENTIC &&
         is_zero(forged, size);
}

static void xchacha_rejects_every_flipped_bit(void) {
  uint8_t input[FORGERY_INPUT_SIZE];
  encrypt_forgery_input(input);

  for (size_t bit = 0; bit < FORGERY_INPUT_SIZE * 8; bit++) {
    input[bit / 8] ^= (uint8_t)(1u << (bit % 8));
    CHECK(is_rejected_and_wiped(test_key, test_nonce, input, sizeof input));
    input[bit / 8] ^= (uint8_t)(1u << (bit % 8));
  }
}

static void xchacha_rejects_a_wrong_key(void) {
  uint8_t input[FORGERY_INPUT_SIZE];
  uint8_t key[EVOLU_XCHACHA_KEY_SIZE];
  encrypt_forgery_input(input);
  memcpy(key, test_key, sizeof key);

  for (size_t bit = 0; bit < sizeof key * 8; bit++) {
    key[bit / 8] ^= (uint8_t)(1u << (bit % 8));
    CHECK(is_rejected_and_wiped(key, test_nonce, input, sizeof input));
    key[bit / 8] ^= (uint8_t)(1u << (bit % 8));
  }
}

// Every nonce byte matters: the first 16 derive the subkey, the last 8 are
// ChaCha20's nonce.
static void xchacha_rejects_a_wrong_nonce(void) {
  uint8_t input[FORGERY_INPUT_SIZE];
  uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE];
  encrypt_forgery_input(input);
  memcpy(nonce, test_nonce, sizeof nonce);

  for (size_t bit = 0; bit < sizeof nonce * 8; bit++) {
    nonce[bit / 8] ^= (uint8_t)(1u << (bit % 8));
    CHECK(is_rejected_and_wiped(test_key, nonce, input, sizeof input));
    nonce[bit / 8] ^= (uint8_t)(1u << (bit % 8));
  }
}

/*
 * Every truncation fails: one that keeps a tag's worth of bytes doesn't
 * authenticate, and a shorter one can't hold a tag, so nothing is written.
 */
static void xchacha_rejects_every_truncation(void) {
  uint8_t input[FORGERY_INPUT_SIZE];
  uint8_t untouched[FORGERY_PLAINTEXT_SIZE];
  encrypt_forgery_input(input);

  for (size_t size = EVOLU_XCHACHA_TAG_SIZE; size < sizeof input; size++)
    CHECK(is_rejected_and_wiped(test_key, test_nonce, input, size));

  for (size_t size = 0; size < EVOLU_XCHACHA_TAG_SIZE; size++) {
    memset(untouched, 0xa5, sizeof untouched);
    CHECK_EQ_INT(
        evolu_xchacha_decrypt(untouched, test_key, test_nonce, input, size),
        EVOLU_XCHACHA_TOO_SHORT);
    for (size_t i = 0; i < sizeof untouched; i++)
      CHECK_EQ_INT(untouched[i], 0xa5);
  }
}

/*
 * Encrypting and decrypting run Monocypher with DIT on, which the runner's
 * build probes, and leave DIT as the caller had it.
 */
static void xchacha_restores_the_callers_dit(void) {
  uint8_t input[FORGERY_INPUT_SIZE];
  uint8_t output[FORGERY_PLAINTEXT_SIZE];
  for (int caller = 0; caller < 2; caller++) {
    // DIT as the caller set it, on or off, whatever an earlier call left.
    evolu_dit_end((unsigned)caller);
    int expected =
        caller && (evolu_crypto_hardware() & EVOLU_CRYPTO_DIT) != 0;
    evolu_test_dit_missed = 0;
    encrypt_forgery_input(input);
    int after_encrypt = evolu_dit_is_set();
    evolu_xchacha_result result = evolu_xchacha_decrypt(
        output, test_key, test_nonce, input, sizeof input);
    int after_decrypt = evolu_dit_is_set();
    evolu_dit_end(0);
    CHECK_EQ_INT(result, EVOLU_XCHACHA_OK);
    CHECK_EQ_INT(after_encrypt, expected);
    CHECK_EQ_INT(after_decrypt, expected);
    CHECK(!evolu_test_dit_missed);
  }
}

// Not instrumented, so their arrays lie on the thread's stack, where
// Monocypher's frames and evolu_wipe_stack's do.
#define STACK_PROBE __attribute__((noinline, no_sanitize("address")))

#define STACK_PATTERN 0xa5

// Fills 2 KiB below its caller with STACK_PATTERN.
STACK_PROBE static void fill_stack(void) {
  volatile uint8_t scratch[2048];
  for (size_t i = 0; i < sizeof scratch; i++) scratch[i] = STACK_PATTERN;
}

// Counts the bytes in 2 KiB below its caller that a call since fill_stack
// wrote and didn't zero.
STACK_PROBE static size_t count_stack_left(void) {
  volatile uint8_t scratch[2048];
  size_t count = 0;
  for (size_t i = 0; i < sizeof scratch; i++)
    count += scratch[i] != 0 && scratch[i] != STACK_PATTERN;
  return count;
}

/*
 * Encrypting and decrypting zero what Monocypher leaves on the stack below
 * them; only their own frames stay. AddressSanitizer's fake stacks, on by
 * default on Linux, move instrumented frames off the thread's stack, so the
 * check runs only without them, as on macOS.
 */
static void xchacha_wipes_the_stack_below_it(void) {
  if (__asan_get_current_fake_stack() != NULL) return;
  fill_stack();
  CHECK_EQ_INT(count_stack_left(), 0);
  fill_stack();
  evolu_xchacha_encrypt(output, test_key, test_nonce, plaintext, 200);
  size_t left_by_encrypt = count_stack_left();
  fill_stack();
  evolu_xchacha_decrypt(decrypted, test_key, test_nonce, output,
                        200 + EVOLU_XCHACHA_TAG_SIZE);
  size_t left_by_decrypt = count_stack_left();
  // About 80 bytes with the wipe; about 400 without it or with it before
  // Monocypher runs.
  CHECK(left_by_encrypt < 256);
  CHECK(left_by_decrypt < 256);
}

void xchacha_suite(void) {
  RUN(xchacha_matches_the_draft_vector);
  RUN(xchacha_matches_evolus_typescript);
  RUN(xchacha_round_trips_an_empty_plaintext);
  RUN(xchacha_rejects_every_flipped_bit);
  RUN(xchacha_rejects_a_wrong_key);
  RUN(xchacha_rejects_a_wrong_nonce);
  RUN(xchacha_rejects_every_truncation);
  RUN(xchacha_restores_the_callers_dit);
  RUN(xchacha_wipes_the_stack_below_it);
}
