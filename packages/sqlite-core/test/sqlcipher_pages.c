#include "sqlcipher_pages.h"

#include "evolu_crypto.h"

#include <string.h>

void build_sqlcipher_page(const uint8_t key[32], const uint8_t salt[16],
                          const uint8_t iv[16], uint32_t page_number,
                          const uint8_t *page, size_t size, uint8_t *output) {
  size_t start = page_number == 1 ? 16 : 0;
  size_t end = size - 80;
  memcpy(output, page, size);
  if (page_number == 1) memcpy(output, salt, 16);
  evolu_aes256 aes;
  evolu_aes256_init(&aes, key);
  uint8_t chain[16];
  memcpy(chain, iv, sizeof chain);
  evolu_aes256_cbc_encrypt(&aes, chain, output + start, end - start);
  evolu_aes256_wipe(&aes);
  memcpy(output + end, iv, 16);
  uint8_t masked[16];
  for (size_t i = 0; i < sizeof masked; i++) masked[i] = salt[i] ^ 0x3a;
  uint8_t raw_hmac_key[32];
  evolu_pbkdf2_sha512(key, 32, masked, sizeof masked, 2, raw_hmac_key,
                      sizeof raw_hmac_key);
  evolu_hmac_sha512_key hmac_key;
  evolu_hmac_sha512_key_init(&hmac_key, raw_hmac_key, sizeof raw_hmac_key);
  evolu_hmac_sha512 mac;
  evolu_hmac_sha512_init(&mac, &hmac_key);
  evolu_hmac_sha512_update(&mac, output + start, end + 16 - start);
  uint8_t page_number_le[4] = {(uint8_t)page_number,
                               (uint8_t)(page_number >> 8),
                               (uint8_t)(page_number >> 16),
                               (uint8_t)(page_number >> 24)};
  evolu_hmac_sha512_update(&mac, page_number_le, sizeof page_number_le);
  evolu_hmac_sha512_final(&mac, output + end + 16);
}
