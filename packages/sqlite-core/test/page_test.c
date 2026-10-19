/*
 * The page codec's contract: round trips at every page size, authentication
 * before decryption, page 1's checks, salts and fresh IVs. The format itself
 * is checked against node:crypto and @evolu/sqlite-wasm 2.2.4 in
 * test/codec.test.mts, because a round trip can't tell a format error that
 * encryption and decryption share. Test names start with page_, so the suite
 * runs alone with `node packages/sqlite-core/scripts/test.mts page_`.
 */
#include "test.h"

#include "evolu_crypto.h"
#include "evolu_page.h"
#include "sqlcipher_pages.h"

#include <stdlib.h>
#include <string.h>

static const uint8_t test_key[EVOLU_PAGE_KEY_SIZE] = {
    1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32};

static const uint8_t other_key[EVOLU_PAGE_KEY_SIZE] = {
    32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
    16, 15, 14, 13, 12, 11, 10, 9,  8,  7,  6,  5,  4,  3,  2,  1};

static const char header_string[] = "SQLite format 3";

#define MAX_PAGE_SIZE 65536

/*
 * Fills a page as SQLite has it: page 1 starts with SQLite's header string,
 * the page size (1 for 65536), the file format versions of a rollback journal,
 * 1 and 1, and 80 reserved bytes in byte 20; the rest follows a formula that
 * differs by page number, with the last 80 bytes zero.
 */
static void fill_page(uint8_t *page, size_t size, uint32_t page_number) {
  for (size_t i = 0; i < size; i++)
    page[i] = (uint8_t)(i * 7 + page_number * 13 + 1);
  memset(page + size - EVOLU_PAGE_RESERVED_SIZE, 0, EVOLU_PAGE_RESERVED_SIZE);
  if (page_number != 1) return;
  memcpy(page, header_string, sizeof header_string);
  page[16] = (uint8_t)(size == 65536 ? 0 : size >> 8);
  page[17] = (uint8_t)(size == 65536 ? 1 : 0);
  page[18] = 1;
  page[19] = 1;
  page[20] = EVOLU_PAGE_RESERVED_SIZE;
}

static uint8_t plaintext[MAX_PAGE_SIZE];
static uint8_t ciphertext[MAX_PAGE_SIZE];
static uint8_t decrypted[MAX_PAGE_SIZE];

static void page_round_trips_pages_of_every_size(void) {
  static const size_t sizes[] = {512,  1024,  2048, 4096,
                                 8192, 16384, 32768, 65536};
  static const uint32_t page_numbers[] = {1, 2, 3, 1000, 0xffffffff};
  for (size_t s = 0; s < sizeof sizes / sizeof sizes[0]; s++) {
    size_t size = sizes[s];
    evolu_page_codec *writer = evolu_page_codec_create(test_key, 0);
    evolu_page_codec *reader = evolu_page_codec_create(test_key, 0);
    CHECK(writer != NULL && reader != NULL);
    for (size_t p = 0; p < sizeof page_numbers / sizeof page_numbers[0]; p++) {
      uint32_t page_number = page_numbers[p];
      size_t start = page_number == 1 ? 24 : 0;
      size_t end = size - EVOLU_PAGE_RESERVED_SIZE;
      fill_page(plaintext, size, page_number);

      CHECK_EQ_INT(evolu_page_encrypt(writer, page_number, plaintext, size,
                                      ciphertext),
                   EVOLU_PAGE_OK);
      // No 16 bytes of the encrypted range are left as they were.
      for (size_t i = start; i + 16 <= end; i += 16)
        CHECK(memcmp(ciphertext + i, plaintext + i, 16) != 0);
      if (page_number == 1) {
        CHECK(memcmp(ciphertext, header_string, 16) != 0);
        CHECK_EQ_BYTES(ciphertext + 16, plaintext + 16, 8);
      }

      memcpy(decrypted, ciphertext, size);
      // The reader learns the salt from page 1, which SQLite reads first.
      CHECK(evolu_page_decrypt(reader, page_number, decrypted, size));
      CHECK_EQ_BYTES(decrypted, plaintext, end);
    }
    evolu_page_codec_destroy(writer);
    evolu_page_codec_destroy(reader);
  }
}

/*
 * Encrypts page 1 and page 2 of the given size with a new codec of test_key,
 * into page1 and page2.
 */
static int encrypt_two_pages(size_t size, uint8_t *page1, uint8_t *page2) {
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  if (codec == NULL) return 0;
  fill_page(plaintext, size, 1);
  int ok = evolu_page_encrypt(codec, 1, plaintext, size, page1) ==
           EVOLU_PAGE_OK;
  fill_page(plaintext, size, 2);
  ok = ok && evolu_page_encrypt(codec, 2, plaintext, size, page2) ==
                 EVOLU_PAGE_OK;
  evolu_page_codec_destroy(codec);
  return ok;
}

static uint8_t page1[MAX_PAGE_SIZE];
static uint8_t page2[MAX_PAGE_SIZE];
static uint8_t altered[MAX_PAGE_SIZE];

static void page_rejects_every_altered_byte_and_leaves_the_page_as_it_was(
    void) {
  size_t size = 1024;
  CHECK(encrypt_two_pages(size, page1, page2));
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);
  memcpy(decrypted, page1, size);
  CHECK(evolu_page_decrypt(codec, 1, decrypted, size));

  // Every authenticated byte of page 2: encrypted bytes, IV and HMAC.
  for (size_t i = 0; i < size; i++) {
    memcpy(altered, page2, size);
    altered[i] ^= 0x01;
    CHECK(!evolu_page_decrypt(codec, 2, altered, size));
    altered[i] ^= 0x01;
    CHECK_EQ_BYTES(altered, page2, size);
  }
  // Page 1's authenticated bytes, from byte 24. Bytes 0-15, the salt, give
  // another HMAC key, and 16-23 aren't authenticated (byte 20 is checked).
  for (size_t i = 24; i < size; i++) {
    memcpy(altered, page1, size);
    altered[i] ^= 0x80;
    CHECK(!evolu_page_decrypt(codec, 1, altered, size));
    altered[i] ^= 0x80;
    CHECK_EQ_BYTES(altered, page1, size);
  }
  // A page authenticates only as the page it is.
  memcpy(altered, page2, size);
  CHECK(!evolu_page_decrypt(codec, 3, altered, size));
  CHECK_EQ_BYTES(altered, page2, size);
  evolu_page_codec_destroy(codec);
}

static void page_with_another_key_fails_and_proves_nothing(void) {
  size_t size = 4096;
  CHECK(encrypt_two_pages(size, page1, page2));
  evolu_page_codec *codec = evolu_page_codec_create(other_key, 0);
  CHECK(codec != NULL);

  memcpy(altered, page1, size);
  CHECK(!evolu_page_decrypt(codec, 1, altered, size));
  CHECK_EQ_BYTES(altered, page1, size);
  CHECK(!evolu_page_is_key_proven(codec));
  // Without a page 1 that authenticated, the codec has no salt.
  memcpy(altered, page2, size);
  CHECK(!evolu_page_decrypt(codec, 2, altered, size));
  evolu_page_codec_destroy(codec);
}

static void page_1_reserving_other_than_80_bytes_fails_both_ways(void) {
  size_t size = 4096;
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);
  fill_page(plaintext, size, 1);
  plaintext[20] = 81;
  CHECK_EQ_INT(evolu_page_encrypt(codec, 1, plaintext, size, ciphertext),
               EVOLU_PAGE_UNSUPPORTED);
  plaintext[20] = 0;
  CHECK_EQ_INT(evolu_page_encrypt(codec, 1, plaintext, size, ciphertext),
               EVOLU_PAGE_UNSUPPORTED);
  // Byte 20 isn't authenticated, so the codec checks it on reads too.
  CHECK(encrypt_two_pages(size, page1, page2));
  memcpy(altered, page1, size);
  altered[20] = 79;
  CHECK(!evolu_page_decrypt(codec, 1, altered, size));
  CHECK(!evolu_page_is_key_proven(codec));
  evolu_page_codec_destroy(codec);
}

static void page_1_storing_another_page_size_than_its_length_fails(void) {
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);
  // A VACUUM after PRAGMA page_size writes the new size in a page of the old.
  fill_page(plaintext, 8192, 1);
  CHECK_EQ_INT(evolu_page_encrypt(codec, 1, plaintext, 4096, ciphertext),
               EVOLU_PAGE_UNSUPPORTED);
  // A page 2 has no header, so any content goes.
  CHECK_EQ_INT(evolu_page_encrypt(codec, 2, plaintext, 4096, ciphertext),
               EVOLU_PAGE_OK);
  evolu_page_codec_destroy(codec);
}

static void page_new_codecs_get_random_salts_and_every_page_a_fresh_iv(void) {
  size_t size = 1024;
  uint8_t first[1024];
  uint8_t second[1024];
  CHECK(encrypt_two_pages(size, first, page2));
  CHECK(encrypt_two_pages(size, second, page2));
  static const uint8_t zeros[16];
  CHECK(memcmp(first, second, 16) != 0);
  CHECK(memcmp(first, zeros, 16) != 0);

  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);
  fill_page(plaintext, size, 2);
  CHECK_EQ_INT(evolu_page_encrypt(codec, 2, plaintext, size, first),
               EVOLU_PAGE_OK);
  CHECK_EQ_INT(evolu_page_encrypt(codec, 2, plaintext, size, second),
               EVOLU_PAGE_OK);
  // The IV is the 16 bytes before the HMAC.
  CHECK(memcmp(first + size - 80, second + size - 80, 16) != 0);
  evolu_page_codec_destroy(codec);
}

static void page_salt_comes_only_from_a_page_1_that_authenticates(void) {
  size_t size = 1024;
  CHECK(encrypt_two_pages(size, page1, page2));
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);

  // A page 1 that fails to authenticate, such as a torn one, gives no salt.
  memcpy(altered, page1, size);
  altered[100] ^= 1;
  CHECK(!evolu_page_decrypt(codec, 1, altered, size));
  memcpy(altered, page2, size);
  CHECK(!evolu_page_decrypt(codec, 2, altered, size));

  // A salt taken as stored decrypts page 2 but proves nothing.
  evolu_page_use_salt(codec, page1);
  memcpy(altered, page2, size);
  CHECK(evolu_page_decrypt(codec, 2, altered, size));
  CHECK(!evolu_page_is_key_proven(codec));

  memcpy(altered, page1, size);
  CHECK(evolu_page_decrypt(codec, 1, altered, size));
  CHECK(evolu_page_is_key_proven(codec));
  CHECK_EQ_BYTES(altered, header_string, sizeof header_string);

  // Pages it encrypts now carry page 1's salt, so another codec of the key
  // that read that page 1 decrypts them.
  fill_page(plaintext, size, 5);
  CHECK_EQ_INT(evolu_page_encrypt(codec, 5, plaintext, size, ciphertext),
               EVOLU_PAGE_OK);
  evolu_page_codec *reader = evolu_page_codec_create(test_key, 0);
  CHECK(reader != NULL);
  memcpy(altered, page1, size);
  CHECK(evolu_page_decrypt(reader, 1, altered, size));
  CHECK(evolu_page_decrypt(reader, 5, ciphertext, size));
  CHECK_EQ_BYTES(ciphertext, plaintext, size - 80);
  evolu_page_codec_destroy(reader);
  evolu_page_codec_destroy(codec);
}

static void page_1_with_another_salt_replaces_the_salt(void) {
  size_t size = 1024;
  uint8_t old_page2[1024];
  CHECK(encrypt_two_pages(size, page1, old_page2));
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);
  memcpy(altered, page1, size);
  CHECK(evolu_page_decrypt(codec, 1, altered, size));

  // Another connection created the database again with another salt.
  CHECK(encrypt_two_pages(size, page1, page2));
  memcpy(altered, page1, size);
  CHECK(evolu_page_decrypt(codec, 1, altered, size));
  memcpy(altered, page2, size);
  CHECK(evolu_page_decrypt(codec, 2, altered, size));
  memcpy(altered, old_page2, size);
  CHECK(!evolu_page_decrypt(codec, 2, altered, size));
  evolu_page_codec_destroy(codec);
}

static void page_decrypt_with_a_salt_leaves_the_codec_as_it_was(void) {
  size_t size = 1024;
  uint8_t old_page1[1024];
  uint8_t old_page2[1024];
  CHECK(encrypt_two_pages(size, old_page1, old_page2));
  CHECK(encrypt_two_pages(size, page1, page2));
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);

  // Page 1's own salt decrypts it and page 2, without giving a salt or
  // proving the key.
  memcpy(altered, page1, size);
  CHECK(evolu_page_decrypt_with_salt(codec, page1, 1, altered, size));
  CHECK_EQ_BYTES(altered, header_string, sizeof header_string);
  memcpy(altered, page2, size);
  CHECK(evolu_page_decrypt_with_salt(codec, page1, 2, altered, size));
  fill_page(plaintext, size, 2);
  CHECK_EQ_BYTES(altered, plaintext, size - 80);
  CHECK(!evolu_page_is_key_proven(codec));
  CHECK(!evolu_page_has_salt(codec, page1));
  CHECK_EQ_INT(evolu_page_layout_of(codec), EVOLU_PAGE_LAYOUT_UNKNOWN);

  // Another database's salt fails, and so does a page 1 that doesn't store
  // the salt, leaving the page as it was.
  memcpy(altered, page2, size);
  CHECK(!evolu_page_decrypt_with_salt(codec, old_page1, 2, altered, size));
  CHECK_EQ_BYTES(altered, page2, size);
  memcpy(altered, old_page1, size);
  CHECK(!evolu_page_decrypt_with_salt(codec, page1, 1, altered, size));
  CHECK_EQ_BYTES(altered, old_page1, size);

  // A codec with a salt and a proven key keeps them.
  memcpy(altered, old_page1, size);
  CHECK(evolu_page_decrypt(codec, 1, altered, size));
  memcpy(altered, page2, size);
  CHECK(evolu_page_decrypt_with_salt(codec, page1, 2, altered, size));
  CHECK(evolu_page_has_salt(codec, old_page1));
  memcpy(altered, old_page2, size);
  CHECK(evolu_page_decrypt(codec, 2, altered, size));
  evolu_page_codec_destroy(codec);

  // Another key fails.
  codec = evolu_page_codec_create(other_key, 0);
  CHECK(codec != NULL);
  memcpy(altered, page2, size);
  CHECK(!evolu_page_decrypt_with_salt(codec, page1, 2, altered, size));
  evolu_page_codec_destroy(codec);
}

static void page_refuses_sizes_that_are_no_page_size(void) {
  static const size_t sizes[] = {0, 16, 104, 256, 1000, 4097, 131072};
  evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
  CHECK(codec != NULL);
  fill_page(plaintext, 1024, 2);
  memcpy(decrypted, plaintext, 1024);
  for (size_t s = 0; s < sizeof sizes / sizeof sizes[0]; s++) {
    CHECK_EQ_INT(evolu_page_encrypt(codec, 2, plaintext, sizes[s], ciphertext),
                 EVOLU_PAGE_UNSUPPORTED);
    CHECK(!evolu_page_decrypt(codec, 2, decrypted, sizes[s]));
    CHECK_EQ_BYTES(decrypted, plaintext, 1024);
  }
  CHECK(evolu_page_is_size(512) && evolu_page_is_size(65536));
  CHECK(!evolu_page_is_size(256) && !evolu_page_is_size(131072));
  evolu_page_codec_destroy(codec);
}

static const uint8_t sqlcipher_salt[EVOLU_PAGE_SALT_SIZE] = {
    0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7,
    0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe, 0xff};
static const uint8_t sqlcipher_iv[16] = {9, 8, 7, 6, 5, 4, 3, 2,
                                         1, 0, 1, 2, 3, 4, 5, 6};

static void page_sqlcipher_layout_decrypts_only_when_allowed(void) {
  size_t size = 4096;
  uint8_t page1_plaintext[4096];
  fill_page(page1_plaintext, size, 1);
  build_sqlcipher_page(test_key, sqlcipher_salt, sqlcipher_iv, 1,
                       page1_plaintext, size, page1);
  fill_page(plaintext, size, 2);
  build_sqlcipher_page(test_key, sqlcipher_salt, sqlcipher_iv, 2, plaintext,
                       size, page2);

  evolu_page_codec *default_only = evolu_page_codec_create(test_key, 0);
  CHECK(default_only != NULL);
  memcpy(altered, page1, size);
  CHECK(!evolu_page_decrypt(default_only, 1, altered, size));
  CHECK_EQ_BYTES(altered, page1, size);
  CHECK_EQ_INT(evolu_page_layout_of(default_only), EVOLU_PAGE_LAYOUT_UNKNOWN);
  evolu_page_codec_destroy(default_only);

  evolu_page_codec *codec =
      evolu_page_codec_create(test_key, EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT);
  CHECK(codec != NULL);
  memcpy(decrypted, page1, size);
  CHECK(evolu_page_decrypt(codec, 1, decrypted, size));
  CHECK_EQ_BYTES(decrypted, page1_plaintext, size - EVOLU_PAGE_RESERVED_SIZE);
  CHECK(evolu_page_is_key_proven(codec));
  CHECK_EQ_INT(evolu_page_layout_of(codec), EVOLU_PAGE_LAYOUT_SQLCIPHER);
  // Pages other than 1 are the same in both layouts.
  memcpy(decrypted, page2, size);
  CHECK(evolu_page_decrypt(codec, 2, decrypted, size));
  CHECK_EQ_BYTES(decrypted, plaintext, size - EVOLU_PAGE_RESERVED_SIZE);
  // A page 1 altered in its bytes 16 to 23, which this layout authenticates.
  memcpy(altered, page1, size);
  altered[20] ^= 1;
  CHECK(!evolu_page_decrypt(codec, 1, altered, size));
  evolu_page_codec_destroy(codec);
}

static void page_codec_writes_and_keeps_the_layout_it_learned(void) {
  size_t size = 4096;
  uint8_t page1_plaintext[4096];
  fill_page(page1_plaintext, size, 1);
  build_sqlcipher_page(test_key, sqlcipher_salt, sqlcipher_iv, 1,
                       page1_plaintext, size, page1);
  evolu_page_codec *codec =
      evolu_page_codec_create(test_key, EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT);
  CHECK(codec != NULL);
  memcpy(decrypted, page1, size);
  CHECK(evolu_page_decrypt(codec, 1, decrypted, size));

  // Page 1 written again keeps the layout, so SQLCipher still reads it.
  CHECK_EQ_INT(evolu_page_encrypt(codec, 1, page1_plaintext, size, ciphertext),
               EVOLU_PAGE_OK);
  CHECK_EQ_BYTES(ciphertext, sqlcipher_salt, EVOLU_PAGE_SALT_SIZE);
  CHECK(memcmp(ciphertext + 16, page1_plaintext + 16, 8) != 0);
  evolu_page_codec *reader =
      evolu_page_codec_create(test_key, EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT);
  CHECK(reader != NULL);
  memcpy(decrypted, ciphertext, size);
  CHECK(evolu_page_decrypt(reader, 1, decrypted, size));
  CHECK_EQ_INT(evolu_page_layout_of(reader), EVOLU_PAGE_LAYOUT_SQLCIPHER);
  evolu_page_codec_destroy(reader);

  // A codec that learned the default layout takes no page 1 of the other.
  CHECK(encrypt_two_pages(size, altered, page2));
  evolu_page_codec *default_learned =
      evolu_page_codec_create(test_key, EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT);
  CHECK(default_learned != NULL);
  CHECK(evolu_page_decrypt(default_learned, 1, altered, size));
  CHECK_EQ_INT(evolu_page_layout_of(default_learned),
               EVOLU_PAGE_LAYOUT_MULTIPLE_CIPHERS);
  memcpy(decrypted, page1, size);
  CHECK(!evolu_page_decrypt(default_learned, 1, decrypted, size));
  evolu_page_codec_destroy(default_learned);
  evolu_page_codec_destroy(codec);
}

static void page_new_database_gets_the_default_layout(void) {
  size_t size = 4096;
  evolu_page_codec *codec =
      evolu_page_codec_create(test_key, EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT);
  CHECK(codec != NULL);
  fill_page(plaintext, size, 1);
  CHECK_EQ_INT(evolu_page_encrypt(codec, 1, plaintext, size, ciphertext),
               EVOLU_PAGE_OK);
  CHECK_EQ_INT(evolu_page_layout_of(codec), EVOLU_PAGE_LAYOUT_MULTIPLE_CIPHERS);
  CHECK_EQ_BYTES(ciphertext + 16, plaintext + 16, 8);
  evolu_page_codec *reader = evolu_page_codec_create(test_key, 0);
  CHECK(reader != NULL);
  CHECK(evolu_page_decrypt(reader, 1, ciphertext, size));
  evolu_page_codec_destroy(reader);
  evolu_page_codec_destroy(codec);
}

/*
 * Each function turns DIT on around the primitives that handle its key and
 * pages, which the runner's build probes, and leaves DIT as the caller had it.
 */
static void page_calls_run_with_dit_and_restore_the_callers(void) {
  static const uint8_t salt[16] = {7};
  for (int caller = 0; caller < 2; caller++) {
    // DIT as the caller set it, on or off, whatever an earlier call left.
    evolu_dit_end((unsigned)caller);
    int expected = caller && evolu_crypto_has_dit();
    int restored = 1;
    evolu_test_dit_missed = 0;
    evolu_page_codec *codec = evolu_page_codec_create(test_key, 0);
    restored &= evolu_dit_is_set() == expected;
    fill_page(plaintext, 4096, 2);
    int ok = codec != NULL && evolu_page_encrypt(codec, 2, plaintext, 4096,
                                                 ciphertext) == EVOLU_PAGE_OK;
    restored &= evolu_dit_is_set() == expected;
    memcpy(decrypted, ciphertext, 4096);
    ok = ok && evolu_page_decrypt(codec, 2, decrypted, 4096);
    restored &= evolu_dit_is_set() == expected;
    memcpy(decrypted, ciphertext, 4096);
    if (codec != NULL)
      (void)evolu_page_decrypt_with_salt(codec, salt, 2, decrypted, 4096);
    restored &= evolu_dit_is_set() == expected;
    if (codec != NULL) evolu_page_use_salt(codec, salt);
    restored &= evolu_dit_is_set() == expected;
    evolu_page_codec_destroy(codec);
    evolu_dit_end(0);
    CHECK(ok);
    CHECK(restored);
    CHECK(!evolu_test_dit_missed);
  }
}

void page_suite(void) {
  RUN(page_refuses_sizes_that_are_no_page_size);
  RUN(page_round_trips_pages_of_every_size);
  RUN(page_rejects_every_altered_byte_and_leaves_the_page_as_it_was);
  RUN(page_with_another_key_fails_and_proves_nothing);
  RUN(page_1_reserving_other_than_80_bytes_fails_both_ways);
  RUN(page_1_storing_another_page_size_than_its_length_fails);
  RUN(page_new_codecs_get_random_salts_and_every_page_a_fresh_iv);
  RUN(page_salt_comes_only_from_a_page_1_that_authenticates);
  RUN(page_1_with_another_salt_replaces_the_salt);
  RUN(page_decrypt_with_a_salt_leaves_the_codec_as_it_was);
  RUN(page_sqlcipher_layout_decrypts_only_when_allowed);
  RUN(page_codec_writes_and_keeps_the_layout_it_learned);
  RUN(page_new_database_gets_the_default_layout);
  RUN(page_calls_run_with_dit_and_restore_the_callers);
}
