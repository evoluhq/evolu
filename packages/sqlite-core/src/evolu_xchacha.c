/*
 * XChaCha20-Poly1305 over Monocypher's crypto_aead_lock and
 * crypto_aead_unlock, which are its XChaCha20 variant of RFC 8439's AEAD.
 * Evolu passes no associated data; the tag goes right after the ciphertext,
 * where noble puts it.
 *
 * crypto_aead_unlock compares tags with crypto_verify16, in constant time, and
 * decrypts only when they match, so it writes nothing for a forged input.
 * Decrypting still zeroes the output then, so a caller that ignores the result
 * reads zeros, never stale bytes it might take for plaintext.
 *
 * Monocypher wipes everything secret it derives (the HChaCha20 subkey, the
 * Poly1305 key and state, keystream blocks) with crypto_wipe, whose volatile
 * writes the compiler can't drop, before returning. Its ChaCha20 rounds still
 * spill state words to the stack where registers are few, as on x86_64, so
 * both functions end with evolu_wipe_stack, best-effort. The key belongs to
 * the caller, who wipes it.
 *
 * Both run with DIT on where the CPU has it (evolu_crypto.h).
 */
#include "evolu_xchacha.h"

#include "evolu_crypto.h"
#include "monocypher.h"

void evolu_xchacha_encrypt(uint8_t *output,
                           const uint8_t key[EVOLU_XCHACHA_KEY_SIZE],
                           const uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE],
                           const uint8_t *plaintext, size_t plaintext_size) {
  unsigned dit = evolu_dit_begin();
  EVOLU_PROBE_DIT();
  crypto_aead_lock(output, output + plaintext_size, key, nonce, NULL, 0,
                   plaintext, plaintext_size);
  evolu_wipe_stack();
  evolu_dit_end(dit);
}

evolu_xchacha_result
evolu_xchacha_decrypt(uint8_t *output,
                      const uint8_t key[EVOLU_XCHACHA_KEY_SIZE],
                      const uint8_t nonce[EVOLU_XCHACHA_NONCE_SIZE],
                      const uint8_t *input, size_t input_size) {
  if (input_size < EVOLU_XCHACHA_TAG_SIZE) return EVOLU_XCHACHA_TOO_SHORT;
  size_t size = input_size - EVOLU_XCHACHA_TAG_SIZE;

  unsigned dit = evolu_dit_begin();
  EVOLU_PROBE_DIT();
  int failed =
      crypto_aead_unlock(output, input + size, key, nonce, NULL, 0, input,
                         size) != 0;
  if (failed) crypto_wipe(output, size);
  evolu_wipe_stack();
  evolu_dit_end(dit);
  return failed ? EVOLU_XCHACHA_NOT_AUTHENTIC : EVOLU_XCHACHA_OK;
}
