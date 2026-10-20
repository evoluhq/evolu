/*
 * Evolu's page encryption: SQLCipher 4's page format as SQLite3 Multiple
 * Ciphers' sqlcipher scheme writes it with its default parameters and
 * legacy=0, which @evolu/sqlite-wasm 2.2.4 wrote, as its builds that
 * encrypted in TypeScript did, so the files of every Evolu platform share one
 * format.
 *
 * - Every page ends with 80 reserved bytes: a random 16-byte IV, then a 64-byte
 *   HMAC. The bytes before them, from byte 24 of page 1 and from byte 0 of any
 *   other page, are encrypted with AES-256-CBC, the key and the IV.
 * - Page 1's encrypted bytes aren't a whole number of 16-byte blocks; their
 *   last partial block is encrypted with ciphertext stealing, CBC-CS3: the last
 *   whole block of ciphertext C becomes the encryption of the partial block,
 *   padded with zeros, chained after C, followed by the first bytes of C, as
 *   many as the partial block has.
 * - Bytes 0 to 15 of page 1 hold the salt in place of SQLite's header string,
 *   which decryption restores. Bytes 16 to 23, the page size, the file format
 *   versions, the reserved bytes and the payload fractions, stay unencrypted
 *   and unauthenticated, so SQLite learns the page size and the reserved bytes
 *   before anything is decrypted. Encryption refuses a page 1 whose reserved
 *   bytes aren't 80, because SQLite would read every page at another usable
 *   size, and so does decryption of the default layout, where byte 20 is
 *   unauthenticated; SQLCipher's layout authenticates it.
 * - The HMAC is HMAC-SHA512 of the encrypted bytes, the IV and the page number
 *   as a little-endian u32, keyed by PBKDF2-HMAC-SHA512 of the key, salted with
 *   the salt XOR 0x3a, with 2 iterations and 32 bytes. A page is authenticated,
 *   comparing the full tag in constant time, before it's decrypted
 *   (encrypt-then-MAC).
 * - The salt is what page 1 stores. A codec learns it from a page 1 that
 *   authenticates, which also proves its key, or takes it as stored through
 *   evolu_page_use_salt. A page 1 that fails to authenticate, such as a torn
 *   one, gives no salt, or every page written later would get its salt. A new
 *   database gets 16 random bytes when its first page is encrypted. The HMAC
 *   key is derived again, and the previous one wiped, whenever the salt
 *   changes.
 * - SQLCipher 4 writes page 1 in a layout of its own, which expo-sqlite's
 *   databases have: encrypted and authenticated from byte 16, so bytes 16 to
 *   23 too, in whole blocks, without ciphertext stealing. Every other page is
 *   the same in both layouts. A codec created with
 *   EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT takes a page 1 of either layout, trying
 *   the default first, and a file keeps the layout its first page 1 that
 *   authenticates has; a new database gets the default.
 *
 * Key hygiene: a codec holds the raw key, the expanded AES key and the HMAC key
 * state in one allocation from the C library's malloc, never from SQLite's
 * heap, and wipes them when it's destroyed. Temporaries holding plaintext, key
 * material or MAC state are wiped before a function returns.
 *
 * evolu_page_codec_create, evolu_page_encrypt, evolu_page_decrypt,
 * evolu_page_decrypt_with_salt and evolu_page_use_salt run with DIT on where
 * the CPU has it (evolu_crypto.h).
 *
 * A codec belongs to one database file and is used from one thread at a time.
 */
#ifndef EVOLU_PAGE_H
#define EVOLU_PAGE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EVOLU_PAGE_KEY_SIZE 32
#define EVOLU_PAGE_SALT_SIZE 16
/* The IV and the HMAC at the end of every page. */
#define EVOLU_PAGE_RESERVED_SIZE 80

typedef struct evolu_page_codec evolu_page_codec;

/* Lets a codec take page 1 in SQLCipher's layout too. */
#define EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT 1

typedef enum {
  /* No page 1 has authenticated or been encrypted yet. */
  EVOLU_PAGE_LAYOUT_UNKNOWN = 0,
  /* SQLite3 Multiple Ciphers': page 1 encrypted from byte 24. */
  EVOLU_PAGE_LAYOUT_MULTIPLE_CIPHERS,
  /* SQLCipher 4's own: page 1 encrypted from byte 16. */
  EVOLU_PAGE_LAYOUT_SQLCIPHER,
} evolu_page_layout;

typedef enum {
  EVOLU_PAGE_OK = 0,
  /*
   * Page 1 reserves other than EVOLU_PAGE_RESERVED_SIZE bytes or stores
   * another page size than its length, so it can't be kept encrypted.
   */
  EVOLU_PAGE_UNSUPPORTED,
  /* The platform's random source failed; nothing was written. */
  EVOLU_PAGE_RANDOM_FAILED,
} evolu_page_result;

/*
 * Creates a codec over a copy of the key with flags, 0 or
 * EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT, or returns NULL when memory runs out. The
 * caller's key is never modified.
 */
evolu_page_codec *evolu_page_codec_create(
    const uint8_t key[EVOLU_PAGE_KEY_SIZE], int flags);

/* Wipes and frees the codec. NULL is a no-op. */
void evolu_page_codec_destroy(evolu_page_codec *codec);

/*
 * Encrypts a whole page into output, which must not overlap it. Returns
 * EVOLU_PAGE_UNSUPPORTED, with output untouched, when size isn't a page size
 * (see evolu_page_is_size) or page 1 doesn't reserve EVOLU_PAGE_RESERVED_SIZE
 * bytes in byte 20 or store its length as its page size.
 */
evolu_page_result evolu_page_encrypt(evolu_page_codec *codec,
                                     uint32_t page_number,
                                     const uint8_t *page, size_t size,
                                     uint8_t *output);

/*
 * Authenticates a whole page and decrypts it in place, returning 1. Returns 0
 * and leaves the page as it was when size isn't a page size, its HMAC differs,
 * the codec has no salt for a page other than 1, or a page 1 of the default
 * layout doesn't reserve EVOLU_PAGE_RESERVED_SIZE bytes. A page 1 that
 * authenticates gives the codec its salt and proves the key.
 */
int evolu_page_decrypt(evolu_page_codec *codec, uint32_t page_number,
                       uint8_t *page, size_t size);

/*
 * Authenticates a whole page with the HMAC key of the first
 * EVOLU_PAGE_SALT_SIZE bytes of salt and decrypts it in place, returning 1, as
 * evolu_page_decrypt does with the codec's salt, but without changing the
 * codec: a page 1 gives no salt, records no layout and proves no key. Returns
 * 0, leaving the page as it was, also for a page 1 that doesn't store salt.
 * It checks a salt before a codec takes it.
 */
int evolu_page_decrypt_with_salt(const evolu_page_codec *codec,
                                 const uint8_t *salt, uint32_t page_number,
                                 uint8_t *page, size_t size);

/*
 * Takes the first EVOLU_PAGE_SALT_SIZE bytes of salt as the salt, as a
 * database's page 1 stores it, until a page 1 that authenticates stores
 * another. It proves nothing.
 */
void evolu_page_use_salt(evolu_page_codec *codec, const uint8_t *salt);

/*
 * Whether a page 1 has authenticated or been encrypted, which proves the key
 * right for the database the codec read or wrote. Once true, it stays true,
 * because the key is fixed, although the file can later hold another
 * database.
 */
int evolu_page_is_key_proven(const evolu_page_codec *codec);

/*
 * Whether page 1, as stored, starts with the codec's salt, as every page 1 of
 * the database it learned the salt from does.
 */
int evolu_page_has_salt(const evolu_page_codec *codec, const uint8_t *page1);

/* The layout of the file's page 1. */
evolu_page_layout evolu_page_layout_of(const evolu_page_codec *codec);

/* Whether size is a page size: a power of two from 512 to 65536. */
int evolu_page_is_size(size_t size);

#ifdef __cplusplus
}
#endif

#endif
