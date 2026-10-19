#include "evolu_page.h"

#include "evolu_crypto.h"

#include <stdlib.h>
#include <string.h>

#define IV_SIZE 16
#define HMAC_SIZE 64
#define HMAC_KEY_SIZE 32
#define HMAC_SALT_MASK 0x3a
#define HMAC_KDF_ITERATIONS 2

static const uint8_t sqlite_header_string[EVOLU_PAGE_SALT_SIZE] =
    "SQLite format 3";

struct evolu_page_codec {
  uint8_t key[EVOLU_PAGE_KEY_SIZE];
  evolu_aes256 aes;
  int flags;
  /* Page 1's layout, once a page 1 authenticated or was encrypted. */
  evolu_page_layout layout;
  /* The salt and the HMAC key derived from it, valid when has_salt. */
  int has_salt;
  uint8_t salt[EVOLU_PAGE_SALT_SIZE];
  evolu_hmac_sha512_key hmac_key;
  int is_key_proven;
};

/* Where the encrypted bytes of a page start in a layout. */
static size_t encrypted_start(evolu_page_layout layout, uint32_t page_number) {
  if (page_number != 1) return 0;
  return layout == EVOLU_PAGE_LAYOUT_SQLCIPHER ? EVOLU_PAGE_SALT_SIZE : 24;
}

/* The page size page 1 stores in bytes 16 and 17, big-endian, 1 for 65536. */
static size_t stored_page_size(const uint8_t *page1) {
  size_t size = (size_t)page1[16] << 8 | page1[17];
  return size == 1 ? 65536 : size;
}

int evolu_page_is_size(size_t size) {
  return size >= 512 && size <= 65536 && (size & (size - 1)) == 0;
}

static void derive_hmac_key(const uint8_t key[EVOLU_PAGE_KEY_SIZE],
                            const uint8_t *salt, evolu_hmac_sha512_key *out) {
  uint8_t masked[EVOLU_PAGE_SALT_SIZE];
  uint8_t raw[HMAC_KEY_SIZE];
  for (size_t i = 0; i < sizeof masked; i++)
    masked[i] = salt[i] ^ HMAC_SALT_MASK;
  // Can't fail: the iterations and the output size are within its limits.
  (void)evolu_pbkdf2_sha512(key, EVOLU_PAGE_KEY_SIZE, masked, sizeof masked,
                            HMAC_KDF_ITERATIONS, raw, sizeof raw);
  evolu_hmac_sha512_key_init(out, raw, sizeof raw);
  evolu_wipe(raw, sizeof raw);
}

/* Makes salt the codec's, with its HMAC key, wiping the previous key. */
static void adopt_salt(evolu_page_codec *codec, const uint8_t *salt,
                       const evolu_hmac_sha512_key *hmac_key) {
  memcpy(codec->salt, salt, EVOLU_PAGE_SALT_SIZE);
  codec->hmac_key = *hmac_key;
  codec->has_salt = 1;
}

/*
 * HMAC-SHA512 of the encrypted bytes, from start, the IV and the page number.
 */
static void compute_hmac(const evolu_hmac_sha512_key *key, uint32_t page_number,
                         size_t start, const uint8_t *page, size_t size,
                         uint8_t tag[HMAC_SIZE]) {
  uint8_t page_number_le[4] = {
      (uint8_t)page_number, (uint8_t)(page_number >> 8),
      (uint8_t)(page_number >> 16), (uint8_t)(page_number >> 24)};
  evolu_hmac_sha512 mac;
  evolu_hmac_sha512_init(&mac, key);
  evolu_hmac_sha512_update(&mac, page + start, size - HMAC_SIZE - start);
  evolu_hmac_sha512_update(&mac, page_number_le, sizeof page_number_le);
  evolu_hmac_sha512_final(&mac, tag);
}

/*
 * Encrypts size bytes in place with AES-256-CBC, stealing ciphertext for a last
 * partial block as CBC-CS3 does. Size is at least one whole block.
 */
static void encrypt_cbc_cs3(const evolu_aes256 *aes, uint8_t iv[IV_SIZE],
                            uint8_t *data, size_t size) {
  size_t tail = size % EVOLU_AES_BLOCK_SIZE;
  size_t whole = size - tail;
  uint8_t last[EVOLU_AES_BLOCK_SIZE] = {0};
  memcpy(last, data + whole, tail);
  // Leaves the last whole block of ciphertext C in iv, so the padded partial
  // block is chained after it.
  (void)evolu_aes256_cbc_encrypt(aes, iv, data, whole);
  if (tail != 0) {
    memcpy(data + whole, data + whole - EVOLU_AES_BLOCK_SIZE, tail);
    (void)evolu_aes256_cbc_encrypt(aes, iv, last, sizeof last);
    memcpy(data + whole - EVOLU_AES_BLOCK_SIZE, last, sizeof last);
  }
  evolu_wipe(last, sizeof last);
}

/* Decrypts in place what encrypt_cbc_cs3 encrypted. */
static void decrypt_cbc_cs3(const evolu_aes256 *aes,
                            const uint8_t stored_iv[IV_SIZE], uint8_t *data,
                            size_t size) {
  size_t tail = size % EVOLU_AES_BLOCK_SIZE;
  size_t whole = size - tail;
  uint8_t iv[IV_SIZE];
  memcpy(iv, stored_iv, sizeof iv);
  if (tail != 0) {
    uint8_t *stolen = data + whole - EVOLU_AES_BLOCK_SIZE;
    // The stolen block decrypts to C XOR the padded partial block, so C is the
    // stored first bytes of C followed by the rest of that.
    uint8_t mixed[EVOLU_AES_BLOCK_SIZE];
    uint8_t chained[EVOLU_AES_BLOCK_SIZE];
    uint8_t zero_iv[IV_SIZE] = {0};
    memcpy(mixed, stolen, sizeof mixed);
    (void)evolu_aes256_cbc_decrypt(aes, zero_iv, mixed, sizeof mixed);
    memcpy(chained, data + whole, tail);
    memcpy(chained + tail, mixed + tail, sizeof chained - tail);
    for (size_t i = 0; i < tail; i++) data[whole + i] = mixed[i] ^ chained[i];
    memcpy(stolen, chained, sizeof chained);
    evolu_wipe(mixed, sizeof mixed);
  }
  (void)evolu_aes256_cbc_decrypt(aes, iv, data, whole);
}

static evolu_page_codec *create_codec(const uint8_t key[EVOLU_PAGE_KEY_SIZE],
                                      int flags) {
  // Outside SQLite's heap, which holds pages and statements.
  evolu_page_codec *codec = calloc(1, sizeof *codec);
  if (codec == NULL) return NULL;
  codec->flags = flags;
  memcpy(codec->key, key, EVOLU_PAGE_KEY_SIZE);
  evolu_aes256_init(&codec->aes, codec->key);
  return codec;
}

evolu_page_codec *evolu_page_codec_create(
    const uint8_t key[EVOLU_PAGE_KEY_SIZE], int flags) {
  unsigned dit = evolu_dit_begin();
  evolu_page_codec *codec = create_codec(key, flags);
  evolu_dit_end(dit);
  return codec;
}

void evolu_page_codec_destroy(evolu_page_codec *codec) {
  if (codec == NULL) return;
  evolu_wipe(codec, sizeof *codec);
  free(codec);
}

static evolu_page_result encrypt_page(evolu_page_codec *codec,
                                      uint32_t page_number,
                                      const uint8_t *page, size_t size,
                                      uint8_t *output) {
  if (!evolu_page_is_size(size)) return EVOLU_PAGE_UNSUPPORTED;
  // Byte 20 is the reserved bytes. A VACUUM that changes the page size writes
  // page 1 with the new size in pages of the old one.
  if (page_number == 1 && (page[20] != EVOLU_PAGE_RESERVED_SIZE ||
                           stored_page_size(page) != size))
    return EVOLU_PAGE_UNSUPPORTED;
  if (!codec->has_salt) {
    uint8_t salt[EVOLU_PAGE_SALT_SIZE];
    evolu_hmac_sha512_key hmac_key;
    if (evolu_random_bytes(salt, sizeof salt) != EVOLU_CRYPTO_OK)
      return EVOLU_PAGE_RANDOM_FAILED;
    derive_hmac_key(codec->key, salt, &hmac_key);
    adopt_salt(codec, salt, &hmac_key);
    evolu_hmac_sha512_key_wipe(&hmac_key);
  }
  uint8_t iv[IV_SIZE];
  if (evolu_random_bytes(iv, sizeof iv) != EVOLU_CRYPTO_OK)
    return EVOLU_PAGE_RANDOM_FAILED;

  // A new database gets the default layout.
  if (page_number == 1 && codec->layout == EVOLU_PAGE_LAYOUT_UNKNOWN)
    codec->layout = EVOLU_PAGE_LAYOUT_MULTIPLE_CIPHERS;
  size_t start = encrypted_start(codec->layout, page_number);
  size_t end = size - EVOLU_PAGE_RESERVED_SIZE;
  memcpy(output + end, iv, sizeof iv);
  memcpy(output + start, page + start, end - start);
  encrypt_cbc_cs3(&codec->aes, iv, output + start, end - start);
  if (page_number == 1) {
    memcpy(output, codec->salt, EVOLU_PAGE_SALT_SIZE);
    memcpy(output + EVOLU_PAGE_SALT_SIZE, page + EVOLU_PAGE_SALT_SIZE,
           start - EVOLU_PAGE_SALT_SIZE);
  }
  compute_hmac(&codec->hmac_key, page_number, start, output, size,
               output + end + IV_SIZE);
  // The page 1 written authenticates with this key, as one read would prove,
  // so the connection that creates a database has its key proven too.
  if (page_number == 1) codec->is_key_proven = 1;
  return EVOLU_PAGE_OK;
}

/*
 * Whether a page 1 authenticates in a layout. In the default layout, the HMAC
 * doesn't cover byte 20, the reserved bytes, with which SQLite would read
 * every page at another usable size, so that is checked too.
 */
static int is_page1_authentic(const evolu_hmac_sha512_key *hmac_key,
                              evolu_page_layout layout, const uint8_t *page,
                              size_t size) {
  if (layout == EVOLU_PAGE_LAYOUT_MULTIPLE_CIPHERS &&
      page[20] != EVOLU_PAGE_RESERVED_SIZE)
    return 0;
  uint8_t tag[HMAC_SIZE];
  compute_hmac(hmac_key, 1, encrypted_start(layout, 1), page, size, tag);
  return evolu_constant_time_equal(
      tag, page + size - EVOLU_PAGE_RESERVED_SIZE + IV_SIZE, sizeof tag);
}

evolu_page_result evolu_page_encrypt(evolu_page_codec *codec,
                                     uint32_t page_number,
                                     const uint8_t *page, size_t size,
                                     uint8_t *output) {
  unsigned dit = evolu_dit_begin();
  evolu_page_result result =
      encrypt_page(codec, page_number, page, size, output);
  evolu_dit_end(dit);
  return result;
}

/*
 * Whether a page authenticates with hmac_key, setting *layout to the layout it
 * authenticated in: the codec's, or, for a page 1 of a codec that has none,
 * the first that authenticates.
 */
static int authenticate(const evolu_page_codec *codec,
                        const evolu_hmac_sha512_key *hmac_key,
                        uint32_t page_number, const uint8_t *page, size_t size,
                        evolu_page_layout *layout) {
  *layout = codec->layout;
  if (page_number != 1) {
    uint8_t tag[HMAC_SIZE];
    compute_hmac(hmac_key, page_number, 0, page, size, tag);
    return evolu_constant_time_equal(
        tag, page + size - EVOLU_PAGE_RESERVED_SIZE + IV_SIZE, sizeof tag);
  }
  // A file keeps its layout.
  if (*layout != EVOLU_PAGE_LAYOUT_UNKNOWN)
    return is_page1_authentic(hmac_key, *layout, page, size);
  *layout = EVOLU_PAGE_LAYOUT_MULTIPLE_CIPHERS;
  if (is_page1_authentic(hmac_key, *layout, page, size)) return 1;
  if (!(codec->flags & EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT)) return 0;
  *layout = EVOLU_PAGE_LAYOUT_SQLCIPHER;
  return is_page1_authentic(hmac_key, *layout, page, size);
}

/* Decrypts in place a page that authenticated in layout. */
static void decrypt_authentic(const evolu_page_codec *codec,
                              evolu_page_layout layout, uint32_t page_number,
                              uint8_t *page, size_t size) {
  size_t end = size - EVOLU_PAGE_RESERVED_SIZE;
  size_t start = encrypted_start(layout, page_number);
  decrypt_cbc_cs3(&codec->aes, page + end, page + start, end - start);
  if (page_number == 1)
    memcpy(page, sqlite_header_string, sizeof sqlite_header_string);
}

static int decrypt_page(evolu_page_codec *codec, uint32_t page_number,
                        uint8_t *page, size_t size) {
  if (!evolu_page_is_size(size)) return 0;
  evolu_hmac_sha512_key candidate;
  const evolu_hmac_sha512_key *hmac_key = &codec->hmac_key;
  int is_other_salt =
      page_number == 1 &&
      !(codec->has_salt &&
        memcmp(codec->salt, page, EVOLU_PAGE_SALT_SIZE) == 0);
  if (is_other_salt) {
    derive_hmac_key(codec->key, page, &candidate);
    hmac_key = &candidate;
  } else if (!codec->has_salt) {
    return 0;
  }

  evolu_page_layout layout;
  int is_authentic =
      authenticate(codec, hmac_key, page_number, page, size, &layout);
  if (is_other_salt) {
    // A page 1 that fails to authenticate, such as a stale page in a journal
    // or one a power loss tore, would give its salt to every page written
    // later.
    if (is_authentic) adopt_salt(codec, page, &candidate);
    evolu_hmac_sha512_key_wipe(&candidate);
  }
  if (!is_authentic) return 0;

  decrypt_authentic(codec, layout, page_number, page, size);
  if (page_number == 1) {
    codec->is_key_proven = 1;
    codec->layout = layout;
  }
  return 1;
}

static int decrypt_page_with_salt(const evolu_page_codec *codec,
                                  const uint8_t *salt, uint32_t page_number,
                                  uint8_t *page, size_t size) {
  if (!evolu_page_is_size(size)) return 0;
  // A page 1 stores its own salt, so it takes no other.
  if (page_number == 1 && memcmp(page, salt, EVOLU_PAGE_SALT_SIZE) != 0)
    return 0;
  evolu_hmac_sha512_key hmac_key;
  derive_hmac_key(codec->key, salt, &hmac_key);
  evolu_page_layout layout;
  int is_authentic =
      authenticate(codec, &hmac_key, page_number, page, size, &layout);
  evolu_hmac_sha512_key_wipe(&hmac_key);
  if (is_authentic) decrypt_authentic(codec, layout, page_number, page, size);
  return is_authentic;
}

int evolu_page_decrypt(evolu_page_codec *codec, uint32_t page_number,
                       uint8_t *page, size_t size) {
  unsigned dit = evolu_dit_begin();
  int decrypted = decrypt_page(codec, page_number, page, size);
  evolu_dit_end(dit);
  return decrypted;
}

int evolu_page_decrypt_with_salt(const evolu_page_codec *codec,
                                 const uint8_t *salt, uint32_t page_number,
                                 uint8_t *page, size_t size) {
  unsigned dit = evolu_dit_begin();
  int decrypted = decrypt_page_with_salt(codec, salt, page_number, page, size);
  evolu_dit_end(dit);
  return decrypted;
}

void evolu_page_use_salt(evolu_page_codec *codec, const uint8_t *salt) {
  if (codec->has_salt &&
      memcmp(codec->salt, salt, EVOLU_PAGE_SALT_SIZE) == 0)
    return;
  unsigned dit = evolu_dit_begin();
  evolu_hmac_sha512_key hmac_key;
  derive_hmac_key(codec->key, salt, &hmac_key);
  adopt_salt(codec, salt, &hmac_key);
  evolu_hmac_sha512_key_wipe(&hmac_key);
  evolu_dit_end(dit);
}

int evolu_page_is_key_proven(const evolu_page_codec *codec) {
  return codec->is_key_proven;
}

int evolu_page_has_salt(const evolu_page_codec *codec, const uint8_t *page1) {
  // The salt is stored in the clear, so comparing it reveals nothing.
  return codec->has_salt &&
         memcmp(page1, codec->salt, EVOLU_PAGE_SALT_SIZE) == 0;
}

evolu_page_layout evolu_page_layout_of(const evolu_page_codec *codec) {
  return codec->layout;
}
