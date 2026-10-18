/*
 * XChaCha20-Poly1305 for Evolu's sync messages, in the byte layout of
 * @evolu/common's encryptWithXChaCha20Poly1305 and
 * decryptWithXChaCha20Poly1305: noble's xchacha20poly1305(key, nonce) with no
 * associated data, whose output is the ciphertext followed by the 16-byte
 * Poly1305 tag. The 24-byte nonce isn't part of that output; Protocol.ts
 * stores it in front of the ciphertext's length.
 *
 * The construction is AEAD_XChaCha20_Poly1305 of draft-irtf-cfrg-xchacha-03
 * (RFC 8439's ChaCha20-Poly1305 with an HChaCha20 subkey and the nonce's last
 * 8 bytes), computed in constant time by the vendored Monocypher.
 *
 * The caller provides the nonce, so these functions stay deterministic and
 * need no random source; a nonce must never repeat under the same key.
 * Input and output buffers must not overlap. A pointer may be NULL when its
 * size is 0.
 */
#ifndef EVOLU_XCHACHA_H
#define EVOLU_XCHACHA_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EVOLU_XCHACHA_KEY_SIZE 32
#define EVOLU_XCHACHA_NONCE_SIZE 24
#define EVOLU_XCHACHA_TAG_SIZE 16

typedef enum {
  EVOLU_XCHACHA_OK = 0,
  /* The input is shorter than a tag, so it can't be a ciphertext. */
  EVOLU_XCHACHA_TOO_SHORT,
  /* The tag doesn't authenticate the ciphertext under the key and nonce. */
  EVOLU_XCHACHA_NOT_AUTHENTIC,
} evolu_xchacha_result;

/*
 * Encrypts plaintext_size bytes of plaintext into output, which receives
 * plaintext_size + EVOLU_XCHACHA_TAG_SIZE bytes: the ciphertext followed by
 * the tag.
 */
void evolu_xchacha_encrypt(uint8_t *output,
                           const uint8_t key[EVOLU_XCHACHA_KEY_SIZE],
                           const uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE],
                           const uint8_t *plaintext, size_t plaintext_size);

/*
 * Decrypts input, a ciphertext followed by its tag, into output, which
 * receives input_size - EVOLU_XCHACHA_TAG_SIZE bytes of plaintext. The tag is
 * verified, in constant time, before anything is decrypted, so the plaintext
 * of a forged input never exists. When the tag doesn't verify, output is
 * zeroed and EVOLU_XCHACHA_NOT_AUTHENTIC returned; an input shorter than a tag
 * returns EVOLU_XCHACHA_TOO_SHORT without touching output.
 */
evolu_xchacha_result
evolu_xchacha_decrypt(uint8_t *output,
                      const uint8_t key[EVOLU_XCHACHA_KEY_SIZE],
                      const uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE],
                      const uint8_t *input, size_t input_size);

#ifdef __cplusplus
}
#endif

#endif
