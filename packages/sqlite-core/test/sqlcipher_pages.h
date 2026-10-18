/*
 * Builds pages as SQLCipher 4 encrypts them with its defaults, as expo-sqlite
 * did, from the format rather than through the codec: page 1 encrypted and
 * authenticated from byte 16, in whole blocks, every other page from byte 0,
 * HMAC-SHA512 over the encrypted bytes, the IV and the little-endian page
 * number, keyed by PBKDF2-HMAC-SHA512 of the key and the salt XOR 0x3a.
 */
#ifndef EVOLU_TEST_SQLCIPHER_PAGES_H
#define EVOLU_TEST_SQLCIPHER_PAGES_H

#include <stddef.h>
#include <stdint.h>

/*
 * Encrypts a page of size bytes, whose last 80 bytes SQLite leaves unused,
 * with the salt and IV into output.
 */
void build_sqlcipher_page(const uint8_t key[32], const uint8_t salt[16],
                          const uint8_t iv[16], uint32_t page_number,
                          const uint8_t *page, size_t size, uint8_t *output);

#endif
