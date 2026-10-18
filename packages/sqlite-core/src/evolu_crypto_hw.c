/*
 * The hardware paths of evolu_crypto_hw.h, written from the instructions'
 * definitions in the Arm Architecture Reference Manual and Intel's manual.
 *
 * Each function is compiled for the instructions it uses with a target
 * attribute, so the rest of the core builds for the baseline CPU and runs
 * where they're missing.
 *
 * AES-256 expands its key the same way on both CPU families, from FIPS 197,
 * with SubWord taken from the AES instruction itself, so no table indexed by
 * key bytes is read: ARMv8's AESE of a vector whose four words equal the word
 * applies SubBytes, and its ShiftRows only moves equal bytes between columns;
 * x86's AESKEYGENASSIST returns SubWord of its second word. Encryption runs
 * the rounds of FIPS 197, decryption those of the equivalent inverse cipher,
 * whose round keys are the encryption keys reversed, InvMixColumns applied
 * to the middle ones. CBC decryption, unlike encryption, decrypts four blocks
 * at a time, since each depends only on its ciphertext.
 *
 * SHA-512 on ARMv8.2 takes two rounds per step: the state lives in pairs
 * (a, b), (c, d), (e, f), (g, h), with the lower lane holding the first.
 * SHA512H computes the two rounds' T1 from (d, e), (f, g) and (g, h) plus the
 * round constants and message words, SHA512H2 the two new values of a from
 * (a, b), c and those T1, and (c, d) plus the T1 pair gives the new (e, f).
 * SHA512SU0 and SHA512SU1 extend the message schedule two words at a time.
 */
#include "evolu_crypto_hw.h"

#include <stdatomic.h>
#include <string.h>

#if defined(__aarch64__)
#include <arm_neon.h>
#if defined(__APPLE__)
#include <sys/sysctl.h>
#elif defined(__linux__)
#include <sys/auxv.h>
#endif
#define AES_TARGET __attribute__((target("aes")))
// LLVM and GCC name the SHA-512 instructions' feature sha3.
#define SHA512_TARGET __attribute__((target("sha3")))
#elif defined(__x86_64__) || defined(_M_X64)
#include <emmintrin.h>
#include <wmmintrin.h>
#define AES_TARGET __attribute__((target("aes,sse2")))
#endif

#if defined(__aarch64__) && defined(__APPLE__)
static int sysctl_flag(const char *name) {
  int value = 0;
  size_t size = sizeof value;
  return sysctlbyname(name, &value, &size, NULL, 0) == 0 && value != 0;
}
#endif

static int detect_features(void) {
  int features = 0;
#if defined(__aarch64__) && defined(__APPLE__)
  // Every Apple arm64 CPU has AES, which older macOS doesn't report.
  features |= EVOLU_HW_AES;
  if (sysctl_flag("hw.optional.arm.FEAT_SHA512") ||
      sysctl_flag("hw.optional.armv8_2_sha512"))
    features |= EVOLU_HW_SHA512;
  if (sysctl_flag("hw.optional.arm.FEAT_DIT")) features |= EVOLU_HW_DIT;
#elif defined(__aarch64__) && defined(__linux__)
  // arm64's HWCAP bits, from the kernel's asm/hwcap.h.
  unsigned long hwcap = getauxval(AT_HWCAP);
  if (hwcap & (1UL << 3)) features |= EVOLU_HW_AES;
  if (hwcap & (1UL << 21)) features |= EVOLU_HW_SHA512;
  if (hwcap & (1UL << 24)) features |= EVOLU_HW_DIT;
#elif defined(__x86_64__) || defined(_M_X64)
  __builtin_cpu_init();
  if (__builtin_cpu_supports("aes")) features |= EVOLU_HW_AES;
#endif
  return features;
}

/* -1 until detected. Threads that race compute the same value. */
static atomic_int detected_features = -1;

int evolu_hw_features(void) {
  int features = atomic_load_explicit(&detected_features, memory_order_relaxed);
  if (features < 0) {
    features = detect_features();
    atomic_store_explicit(&detected_features, features, memory_order_relaxed);
  }
  return features;
}

#if defined(__aarch64__) || defined(__x86_64__) || defined(_M_X64)

/* Applies the AES S-box to each of a word's 4 bytes. */
AES_TARGET static void sub_word(uint8_t word[4]) {
  uint32_t value;
  memcpy(&value, word, sizeof value);
#if defined(__aarch64__)
  uint8x16_t vector = vreinterpretq_u8_u32(vdupq_n_u32(value));
  vector = vaeseq_u8(vector, vdupq_n_u8(0));
  value = vgetq_lane_u32(vreinterpretq_u32_u8(vector), 0);
#else
  __m128i vector =
      _mm_aeskeygenassist_si128(_mm_set1_epi32((int)value), 0);
  value = (uint32_t)_mm_cvtsi128_si32(vector);
#endif
  memcpy(word, &value, sizeof value);
}

AES_TARGET static void inv_mix_columns(const uint8_t in[16], uint8_t out[16]) {
#if defined(__aarch64__)
  vst1q_u8(out, vaesimcq_u8(vld1q_u8(in)));
#else
  _mm_storeu_si128((__m128i *)out,
                   _mm_aesimc_si128(_mm_loadu_si128((const __m128i *)in)));
#endif
}

AES_TARGET void evolu_hw_aes256_expand(const uint8_t key[32],
                                       uint8_t encrypt[15][16],
                                       uint8_t decrypt[15][16]) {
  // FIPS 197 section 5.2 with Nk = 8: 60 words, 4 bytes each.
  uint8_t *words = &encrypt[0][0];
  memcpy(words, key, 32);
  uint8_t rcon = 1;
  for (int i = 8; i < 60; i++) {
    uint8_t temp[4];
    memcpy(temp, words + 4 * (i - 1), sizeof temp);
    if (i % 8 == 0) {
      uint8_t first = temp[0];
      temp[0] = temp[1];
      temp[1] = temp[2];
      temp[2] = temp[3];
      temp[3] = first;
      sub_word(temp);
      temp[0] ^= rcon;
      rcon = (uint8_t)(rcon << 1);
    } else if (i % 8 == 4) {
      sub_word(temp);
    }
    for (int b = 0; b < 4; b++)
      words[4 * i + b] = words[4 * (i - 8) + b] ^ temp[b];
  }
  memcpy(decrypt[0], encrypt[14], 16);
  for (int i = 1; i < 14; i++) inv_mix_columns(encrypt[14 - i], decrypt[i]);
  memcpy(decrypt[14], encrypt[0], 16);
}

#if defined(__aarch64__)

AES_TARGET void evolu_hw_aes256_cbc_encrypt(const uint8_t keys[15][16],
                                            uint8_t iv[16], uint8_t *data,
                                            size_t size) {
  uint8x16_t k[15];
  for (int i = 0; i < 15; i++) k[i] = vld1q_u8(keys[i]);
  uint8x16_t chain = vld1q_u8(iv);
  for (size_t at = 0; at < size; at += 16) {
    uint8x16_t state = veorq_u8(vld1q_u8(data + at), chain);
    for (int r = 0; r < 13; r++) state = vaesmcq_u8(vaeseq_u8(state, k[r]));
    state = veorq_u8(vaeseq_u8(state, k[13]), k[14]);
    vst1q_u8(data + at, state);
    chain = state;
  }
  vst1q_u8(iv, chain);
}

/* Decrypts one block with the equivalent inverse cipher's round keys. */
AES_TARGET static inline uint8x16_t decrypt_block(const uint8x16_t k[15],
                                                  uint8x16_t state) {
  for (int r = 0; r < 13; r++) state = vaesimcq_u8(vaesdq_u8(state, k[r]));
  return veorq_u8(vaesdq_u8(state, k[13]), k[14]);
}

AES_TARGET void evolu_hw_aes256_cbc_decrypt(const uint8_t keys[15][16],
                                            uint8_t iv[16], uint8_t *data,
                                            size_t size) {
  uint8x16_t k[15];
  for (int i = 0; i < 15; i++) k[i] = vld1q_u8(keys[i]);
  uint8x16_t previous = vld1q_u8(iv);
  size_t at = 0;
  for (; at + 64 <= size; at += 64) {
    uint8x16_t c0 = vld1q_u8(data + at);
    uint8x16_t c1 = vld1q_u8(data + at + 16);
    uint8x16_t c2 = vld1q_u8(data + at + 32);
    uint8x16_t c3 = vld1q_u8(data + at + 48);
    uint8x16_t p0 = c0, p1 = c1, p2 = c2, p3 = c3;
    for (int r = 0; r < 13; r++) {
      p0 = vaesimcq_u8(vaesdq_u8(p0, k[r]));
      p1 = vaesimcq_u8(vaesdq_u8(p1, k[r]));
      p2 = vaesimcq_u8(vaesdq_u8(p2, k[r]));
      p3 = vaesimcq_u8(vaesdq_u8(p3, k[r]));
    }
    p0 = veorq_u8(veorq_u8(vaesdq_u8(p0, k[13]), k[14]), previous);
    p1 = veorq_u8(veorq_u8(vaesdq_u8(p1, k[13]), k[14]), c0);
    p2 = veorq_u8(veorq_u8(vaesdq_u8(p2, k[13]), k[14]), c1);
    p3 = veorq_u8(veorq_u8(vaesdq_u8(p3, k[13]), k[14]), c2);
    vst1q_u8(data + at, p0);
    vst1q_u8(data + at + 16, p1);
    vst1q_u8(data + at + 32, p2);
    vst1q_u8(data + at + 48, p3);
    previous = c3;
  }
  for (; at < size; at += 16) {
    uint8x16_t ciphertext = vld1q_u8(data + at);
    vst1q_u8(data + at, veorq_u8(decrypt_block(k, ciphertext), previous));
    previous = ciphertext;
  }
  vst1q_u8(iv, previous);
}

#else

AES_TARGET void evolu_hw_aes256_cbc_encrypt(const uint8_t keys[15][16],
                                            uint8_t iv[16], uint8_t *data,
                                            size_t size) {
  __m128i k[15];
  for (int i = 0; i < 15; i++) k[i] = _mm_loadu_si128((const __m128i *)keys[i]);
  __m128i chain = _mm_loadu_si128((const __m128i *)iv);
  for (size_t at = 0; at < size; at += 16) {
    __m128i state = _mm_xor_si128(
        _mm_xor_si128(_mm_loadu_si128((const __m128i *)(data + at)), chain),
        k[0]);
    for (int r = 1; r < 14; r++) state = _mm_aesenc_si128(state, k[r]);
    state = _mm_aesenclast_si128(state, k[14]);
    _mm_storeu_si128((__m128i *)(data + at), state);
    chain = state;
  }
  _mm_storeu_si128((__m128i *)iv, chain);
}

AES_TARGET static inline __m128i decrypt_block(const __m128i k[15],
                                               __m128i state) {
  state = _mm_xor_si128(state, k[0]);
  for (int r = 1; r < 14; r++) state = _mm_aesdec_si128(state, k[r]);
  return _mm_aesdeclast_si128(state, k[14]);
}

AES_TARGET void evolu_hw_aes256_cbc_decrypt(const uint8_t keys[15][16],
                                            uint8_t iv[16], uint8_t *data,
                                            size_t size) {
  __m128i k[15];
  for (int i = 0; i < 15; i++) k[i] = _mm_loadu_si128((const __m128i *)keys[i]);
  __m128i previous = _mm_loadu_si128((const __m128i *)iv);
  size_t at = 0;
  for (; at + 64 <= size; at += 64) {
    __m128i c0 = _mm_loadu_si128((const __m128i *)(data + at));
    __m128i c1 = _mm_loadu_si128((const __m128i *)(data + at + 16));
    __m128i c2 = _mm_loadu_si128((const __m128i *)(data + at + 32));
    __m128i c3 = _mm_loadu_si128((const __m128i *)(data + at + 48));
    __m128i p0 = _mm_xor_si128(c0, k[0]);
    __m128i p1 = _mm_xor_si128(c1, k[0]);
    __m128i p2 = _mm_xor_si128(c2, k[0]);
    __m128i p3 = _mm_xor_si128(c3, k[0]);
    for (int r = 1; r < 14; r++) {
      p0 = _mm_aesdec_si128(p0, k[r]);
      p1 = _mm_aesdec_si128(p1, k[r]);
      p2 = _mm_aesdec_si128(p2, k[r]);
      p3 = _mm_aesdec_si128(p3, k[r]);
    }
    p0 = _mm_xor_si128(_mm_aesdeclast_si128(p0, k[14]), previous);
    p1 = _mm_xor_si128(_mm_aesdeclast_si128(p1, k[14]), c0);
    p2 = _mm_xor_si128(_mm_aesdeclast_si128(p2, k[14]), c1);
    p3 = _mm_xor_si128(_mm_aesdeclast_si128(p3, k[14]), c2);
    _mm_storeu_si128((__m128i *)(data + at), p0);
    _mm_storeu_si128((__m128i *)(data + at + 16), p1);
    _mm_storeu_si128((__m128i *)(data + at + 32), p2);
    _mm_storeu_si128((__m128i *)(data + at + 48), p3);
    previous = c3;
  }
  for (; at < size; at += 16) {
    __m128i ciphertext = _mm_loadu_si128((const __m128i *)(data + at));
    _mm_storeu_si128((__m128i *)(data + at),
                     _mm_xor_si128(decrypt_block(k, ciphertext), previous));
    previous = ciphertext;
  }
  _mm_storeu_si128((__m128i *)iv, previous);
}

#endif

#else

void evolu_hw_aes256_expand(const uint8_t key[32], uint8_t encrypt[15][16],
                            uint8_t decrypt[15][16]) {
  (void)key;
  (void)encrypt;
  (void)decrypt;
}

void evolu_hw_aes256_cbc_encrypt(const uint8_t keys[15][16], uint8_t iv[16],
                                 uint8_t *data, size_t size) {
  (void)keys;
  (void)iv;
  (void)data;
  (void)size;
}

void evolu_hw_aes256_cbc_decrypt(const uint8_t keys[15][16], uint8_t iv[16],
                                 uint8_t *data, size_t size) {
  (void)keys;
  (void)iv;
  (void)data;
  (void)size;
}

#endif

#if defined(__aarch64__)

/* FIPS 180-4 section 4.2.3: SHA-512's round constants. */
static const uint64_t sha512_k[80] = {
    0x428a2f98d728ae22, 0x7137449123ef65cd, 0xb5c0fbcfec4d3b2f,
    0xe9b5dba58189dbbc, 0x3956c25bf348b538, 0x59f111f1b605d019,
    0x923f82a4af194f9b, 0xab1c5ed5da6d8118, 0xd807aa98a3030242,
    0x12835b0145706fbe, 0x243185be4ee4b28c, 0x550c7dc3d5ffb4e2,
    0x72be5d74f27b896f, 0x80deb1fe3b1696b1, 0x9bdc06a725c71235,
    0xc19bf174cf692694, 0xe49b69c19ef14ad2, 0xefbe4786384f25e3,
    0x0fc19dc68b8cd5b5, 0x240ca1cc77ac9c65, 0x2de92c6f592b0275,
    0x4a7484aa6ea6e483, 0x5cb0a9dcbd41fbd4, 0x76f988da831153b5,
    0x983e5152ee66dfab, 0xa831c66d2db43210, 0xb00327c898fb213f,
    0xbf597fc7beef0ee4, 0xc6e00bf33da88fc2, 0xd5a79147930aa725,
    0x06ca6351e003826f, 0x142929670a0e6e70, 0x27b70a8546d22ffc,
    0x2e1b21385c26c926, 0x4d2c6dfc5ac42aed, 0x53380d139d95b3df,
    0x650a73548baf63de, 0x766a0abb3c77b2a8, 0x81c2c92e47edaee6,
    0x92722c851482353b, 0xa2bfe8a14cf10364, 0xa81a664bbc423001,
    0xc24b8b70d0f89791, 0xc76c51a30654be30, 0xd192e819d6ef5218,
    0xd69906245565a910, 0xf40e35855771202a, 0x106aa07032bbd1b8,
    0x19a4c116b8d2d0c8, 0x1e376c085141ab53, 0x2748774cdf8eeb99,
    0x34b0bcb5e19b48a8, 0x391c0cb3c5c95a63, 0x4ed8aa4ae3418acb,
    0x5b9cca4f7763e373, 0x682e6ff3d6b2b8a3, 0x748f82ee5defb2fc,
    0x78a5636f43172f60, 0x84c87814a1f0ab72, 0x8cc702081a6439ec,
    0x90befffa23631e28, 0xa4506cebde82bde9, 0xbef9a3f7b2c67915,
    0xc67178f2e372532b, 0xca273eceea26619c, 0xd186b8c721c0c207,
    0xeada7dd6cde0eb1e, 0xf57d4f7fee6ed178, 0x06f067aa72176fba,
    0x0a637dc5a2c898a6, 0x113f9804bef90dae, 0x1b710b35131c471b,
    0x28db77f523047d84, 0x32caab7b40c72493, 0x3c9ebe0a15c9bebc,
    0x431d67c49c100d4c, 0x4cc5d4becb3e42b6, 0x597f299cfc657e2a,
    0x5fcb6fab3ad6faec, 0x6c44198c4a475817};

SHA512_TARGET void evolu_hw_sha512_blocks(uint64_t state[8],
                                          const uint8_t *blocks,
                                          size_t count) {
  uint64x2_t ab = vld1q_u64(state);
  uint64x2_t cd = vld1q_u64(state + 2);
  uint64x2_t ef = vld1q_u64(state + 4);
  uint64x2_t gh = vld1q_u64(state + 6);
  for (; count > 0; count--, blocks += 128) {
    uint64x2_t saved_ab = ab, saved_cd = cd, saved_ef = ef, saved_gh = gh;
    // Each vector holds two big-endian message words.
    uint64x2_t m[8];
    for (int i = 0; i < 8; i++)
      m[i] = vreinterpretq_u64_u8(vrev64q_u8(vld1q_u8(blocks + 16 * i)));
    for (int i = 0; i < 40; i++) {
      uint64x2_t words = vaddq_u64(m[i % 8], vld1q_u64(sha512_k + 2 * i));
      uint64x2_t fg = vextq_u64(ef, gh, 1);
      uint64x2_t de = vextq_u64(cd, ef, 1);
      // (g, h) plus the swapped words: g + K[t+1] + W[t+1], h + K[t] + W[t].
      uint64x2_t t1 = vaddq_u64(gh, vextq_u64(words, words, 1));
      t1 = vsha512hq_u64(t1, fg, de);
      uint64x2_t next_ef = vaddq_u64(cd, t1);
      uint64x2_t next_ab = vsha512h2q_u64(t1, cd, ab);
      gh = ef;
      ef = next_ef;
      cd = ab;
      ab = next_ab;
      // W[t+16] and W[t+17], after this pair used W[t] and W[t+1].
      if (i < 32)
        m[i % 8] = vsha512su1q_u64(
            vsha512su0q_u64(m[i % 8], m[(i + 1) % 8]), m[(i + 7) % 8],
            vextq_u64(m[(i + 4) % 8], m[(i + 5) % 8], 1));
    }
    ab = vaddq_u64(ab, saved_ab);
    cd = vaddq_u64(cd, saved_cd);
    ef = vaddq_u64(ef, saved_ef);
    gh = vaddq_u64(gh, saved_gh);
  }
  vst1q_u64(state, ab);
  vst1q_u64(state + 2, cd);
  vst1q_u64(state + 4, ef);
  vst1q_u64(state + 6, gh);
}

uint64_t evolu_hw_dit_read(void) {
  uint64_t value;
  // DIT by its encoding, which every assembler accepts.
  __asm__ volatile("mrs %0, s3_3_c4_c2_5" : "=r"(value));
  return value;
}

void evolu_hw_dit_write(uint64_t value) {
  __asm__ volatile("msr s3_3_c4_c2_5, %0" ::"r"(value) : "memory");
  // After turning DIT on, a speculation barrier, so later instructions don't
  // run without it. Apple documents SB, or DSB and ISB, which every ARMv8 CPU
  // has, where FEAT_SB is missing.
  // https://developer.apple.com/documentation/xcode/writing-arm64-code-for-apple-platforms
  if (value != 0) __asm__ volatile("dsb nsh\n\tisb sy" ::: "memory");
}

#else

void evolu_hw_sha512_blocks(uint64_t state[8], const uint8_t *blocks,
                            size_t count) {
  (void)state;
  (void)blocks;
  (void)count;
}

uint64_t evolu_hw_dit_read(void) { return 0; }

void evolu_hw_dit_write(uint64_t value) { (void)value; }

#endif
