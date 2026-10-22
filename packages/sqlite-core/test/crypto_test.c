/*
 * The crypto layer against published vectors, never against its own output:
 * NIST SP 800-38A for AES-256-CBC (both BearSSL implementations, selected
 * with evolu_aes256_init_with, so the 32-bit one runs on 64-bit hosts too),
 * FIPS 180-2 and NIST CAVP for SHA-256 and SHA-512, RFC 4231 for HMAC-SHA512.
 * PBKDF2-HMAC-SHA512 has no published vectors, so it's checked against
 * node:crypto, and Evolu's own SHA-512 framing also against BearSSL's at every
 * padding boundary. Test names start with crypto_, so the suite runs alone
 * with `node packages/sqlite-core/scripts/test.mts crypto`.
 */
#include "test.h"

#include "evolu_crypto.h"

#include <stdlib.h>
#include <string.h>

#if defined(__linux__) && !defined(__ANDROID__)
#include <errno.h>
#include <sys/types.h>
#endif

/*
 * Decodes a lowercase hex string into out, which must hold half its length,
 * and returns the number of bytes written.
 */
static size_t from_hex(uint8_t *out, const char *hex) {
  size_t size = strlen(hex) / 2;
  for (size_t i = 0; i < size; i++) {
    char high = hex[2 * i];
    char low = hex[2 * i + 1];
    out[i] = (uint8_t)((high <= '9' ? high - '0' : high - 'a' + 10) << 4 |
                       (low <= '9' ? low - '0' : low - 'a' + 10));
  }
  return size;
}

/* FIPS 180-2's two-block examples, of 448 and 896 bits. */
static const char sha256_two_block[] =
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
static const char sha512_two_block[] =
    "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmn"
    "hijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";

static void crypto_wipe_zeroes_only_the_given_bytes(void) {
  uint8_t buffer[16];
  uint8_t expected[16];
  memset(buffer, 0xaa, sizeof buffer);
  memset(expected, 0xaa, sizeof expected);
  memset(expected, 0, 10);

  evolu_wipe(buffer, 10);
  CHECK_EQ_BYTES(buffer, expected, sizeof buffer);

  evolu_wipe(buffer + 10, 0);
  evolu_wipe(NULL, 0);
  CHECK_EQ_BYTES(buffer, expected, sizeof buffer);
}

static void crypto_constant_time_equal_compares_every_byte(void) {
  uint8_t a[64];
  uint8_t b[64];
  for (size_t i = 0; i < sizeof a; i++) a[i] = b[i] = (uint8_t)i;

  CHECK_EQ_INT(evolu_constant_time_equal(a, b, sizeof a), 1);
  CHECK_EQ_INT(evolu_constant_time_equal(a, b, 0), 1);
  CHECK_EQ_INT(evolu_constant_time_equal(NULL, NULL, 0), 1);

  // Every difference in a byte, at the start and at the end.
  for (int difference = 1; difference < 256; difference++) {
    b[0] ^= (uint8_t)difference;
    CHECK_EQ_INT(evolu_constant_time_equal(a, b, sizeof a), 0);
    b[0] ^= (uint8_t)difference;
    b[63] ^= (uint8_t)difference;
    CHECK_EQ_INT(evolu_constant_time_equal(a, b, sizeof a), 0);
    CHECK_EQ_INT(evolu_constant_time_equal(a, b, sizeof a - 1), 1);
    b[63] ^= (uint8_t)difference;
  }
}

/* Returns whether all size bytes at p equal the first. */
static int is_constant(const uint8_t *p, size_t size) {
  for (size_t i = 1; i < size; i++)
    if (p[i] != p[0]) return 0;
  return 1;
}

static void crypto_random_bytes_differ_between_calls(void) {
  uint8_t a[32];
  uint8_t b[32];
  memset(a, 0, sizeof a);
  memset(b, 0, sizeof b);

  CHECK_EQ_INT(evolu_random_bytes(a, sizeof a), EVOLU_CRYPTO_OK);
  CHECK_EQ_INT(evolu_random_bytes(b, sizeof b), EVOLU_CRYPTO_OK);
  CHECK_EQ_INT(evolu_random_bytes(NULL, 0), EVOLU_CRYPTO_OK);

  // Each fails with probability 2^-248 or less for a working source.
  CHECK(!is_constant(a, sizeof a));
  CHECK(!is_constant(b, sizeof b));
  CHECK(memcmp(a, b, sizeof a) != 0);
}

static void crypto_sha256_matches_fips_180_examples(void) {
  uint8_t digest[EVOLU_SHA256_SIZE];
  uint8_t expected[EVOLU_SHA256_SIZE];

  // FIPS 180-2 appendix B.1, "abc".
  evolu_sha256_digest((const uint8_t *)"abc", 3, digest);
  from_hex(expected, "ba7816bf8f01cfea414140de5dae2223"
                     "b00361a396177a9cb410ff61f20015ad");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // FIPS 180-2 appendix B.2, the two-block message.
  evolu_sha256_digest((const uint8_t *)sha256_two_block,
                      strlen(sha256_two_block), digest);
  from_hex(expected, "248d6a61d20638b8e5c026930c3e6039"
                     "a33ce45964ff2167f6ecedd419db06c1");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // FIPS 180-2 appendix B.3, one million 'a', fed in 1,000-byte updates.
  uint8_t thousand[1000];
  memset(thousand, 'a', sizeof thousand);
  evolu_sha256 sha;
  evolu_sha256_init(&sha);
  for (int i = 0; i < 1000; i++)
    evolu_sha256_update(&sha, thousand, sizeof thousand);
  evolu_sha256_final(&sha, digest);
  from_hex(expected, "cdc76e5c9914fb9281a1c7e284d73e67"
                     "f1809a48a497200e046d39ccc7112cd0");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // NIST CAVP SHA256ShortMsg, Len = 0.
  evolu_sha256_digest(NULL, 0, digest);
  from_hex(expected, "e3b0c44298fc1c149afbf4c8996fb924"
                     "27ae41e4649b934ca495991b7852b855");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);
}

static void crypto_sha256_incremental_equals_one_shot(void) {
  const uint8_t *message = (const uint8_t *)sha256_two_block;
  size_t size = strlen(sha256_two_block);
  uint8_t expected[EVOLU_SHA256_SIZE];
  uint8_t digest[EVOLU_SHA256_SIZE];
  evolu_sha256_digest(message, size, expected);

  // Every split into two updates, including empty ones.
  for (size_t split = 0; split <= size; split++) {
    evolu_sha256 sha;
    evolu_sha256_init(&sha);
    evolu_sha256_update(&sha, message, split);
    evolu_sha256_update(&sha, message + split, size - split);
    evolu_sha256_final(&sha, digest);
    CHECK_EQ_BYTES(digest, expected, sizeof digest);
  }

  // Byte by byte.
  evolu_sha256 sha;
  evolu_sha256_init(&sha);
  for (size_t i = 0; i < size; i++) evolu_sha256_update(&sha, message + i, 1);
  evolu_sha256_final(&sha, digest);
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // The final function zeroes the context.
  evolu_sha256 zero;
  memset(&zero, 0, sizeof zero);
  CHECK_EQ_BYTES(&sha, &zero, sizeof sha);
}

static void crypto_sha512_matches_fips_180_examples(void) {
  uint8_t digest[EVOLU_SHA512_SIZE];
  uint8_t expected[EVOLU_SHA512_SIZE];

  // FIPS 180-2 appendix C.1, "abc".
  evolu_sha512_digest((const uint8_t *)"abc", 3, digest);
  from_hex(expected, "ddaf35a193617abacc417349ae204131"
                     "12e6fa4e89a97ea20a9eeee64b55d39a"
                     "2192992a274fc1a836ba3c23a3feebbd"
                     "454d4423643ce80e2a9ac94fa54ca49f");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // FIPS 180-2 appendix C.2, the two-block message.
  evolu_sha512_digest((const uint8_t *)sha512_two_block,
                      strlen(sha512_two_block), digest);
  from_hex(expected, "8e959b75dae313da8cf4f72814fc143f"
                     "8f7779c6eb9f7fa17299aeadb6889018"
                     "501d289e4900f7e4331b99dec4b5433a"
                     "c7d329eeb6dd26545e96e55b874be909");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // FIPS 180-2 appendix C.3, one million 'a', fed in 1,000-byte updates.
  uint8_t thousand[1000];
  memset(thousand, 'a', sizeof thousand);
  evolu_sha512 sha;
  evolu_sha512_init(&sha);
  for (int i = 0; i < 1000; i++)
    evolu_sha512_update(&sha, thousand, sizeof thousand);
  evolu_sha512_final(&sha, digest);
  from_hex(expected, "e718483d0ce769644e2e42c7bc15b463"
                     "8e1f98b13b2044285632a803afa973eb"
                     "de0ff244877ea60a4cb0432ce577c31b"
                     "eb009c5c2c49aa2e4eadb217ad8cc09b");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // NIST CAVP SHA512ShortMsg, Len = 0.
  evolu_sha512_digest(NULL, 0, digest);
  from_hex(expected, "cf83e1357eefb8bdf1542850d66d8007"
                     "d620e4050b5715dc83f4a921d36ce9ce"
                     "47d0d13c5d85f2b0ff8318d2877eec2f"
                     "63b931bd47417a81a538327af927da3e");
  CHECK_EQ_BYTES(digest, expected, sizeof digest);
}

static void crypto_sha512_incremental_equals_one_shot(void) {
  const uint8_t *message = (const uint8_t *)sha512_two_block;
  size_t size = strlen(sha512_two_block);
  uint8_t expected[EVOLU_SHA512_SIZE];
  uint8_t digest[EVOLU_SHA512_SIZE];
  evolu_sha512_digest(message, size, expected);

  // Every split into two updates, including empty ones.
  for (size_t split = 0; split <= size; split++) {
    evolu_sha512 sha;
    evolu_sha512_init(&sha);
    evolu_sha512_update(&sha, message, split);
    evolu_sha512_update(&sha, message + split, size - split);
    evolu_sha512_final(&sha, digest);
    CHECK_EQ_BYTES(digest, expected, sizeof digest);
  }

  // Byte by byte.
  evolu_sha512 sha;
  evolu_sha512_init(&sha);
  for (size_t i = 0; i < size; i++) evolu_sha512_update(&sha, message + i, 1);
  evolu_sha512_final(&sha, digest);
  CHECK_EQ_BYTES(digest, expected, sizeof digest);

  // The final function zeroes the context.
  evolu_sha512 zero;
  memset(&zero, 0, sizeof zero);
  CHECK_EQ_BYTES(&sha, &zero, sizeof sha);
}

/*
 * The SHA-512 buffering and padding are Evolu's own, so they're checked
 * against BearSSL's at every size up to three blocks, which crosses each
 * padding boundary (111, 112, 127 and 128 bytes into a block), in updates of
 * sizes that never align with a block.
 */
static void crypto_sha512_matches_bearssl_at_every_size(void) {
  uint8_t message[3 * EVOLU_SHA512_BLOCK_SIZE + 1];
  for (size_t i = 0; i < sizeof message; i++) message[i] = (uint8_t)(i * 7);
  static const size_t updates[] = {1, 127, 129, 3, 200};

  for (size_t size = 0; size <= sizeof message; size++) {
    uint8_t expected[EVOLU_SHA512_SIZE];
    br_sha512_context bearssl;
    br_sha512_init(&bearssl);
    br_sha512_update(&bearssl, message, size);
    br_sha512_out(&bearssl, expected);

    uint8_t digest[EVOLU_SHA512_SIZE];
    evolu_sha512 sha;
    evolu_sha512_init(&sha);
    size_t done = 0;
    for (size_t i = 0; done < size; i = (i + 1) % 5) {
      size_t next = size - done < updates[i] ? size - done : updates[i];
      evolu_sha512_update(&sha, message + done, next);
      done += next;
    }
    evolu_sha512_final(&sha, digest);
    CHECK_EQ_BYTES(digest, expected, sizeof digest);
  }
}

/* RFC 4231 section 4: the HMAC-SHA-512 test cases. */
static const struct {
  const char *key;
  const char *data;
  /* Test case 5 truncates its output to 128 bits. */
  const char *tag;
} rfc_4231[] = {
    {"0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", "4869205468657265",
     "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde"
     "daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854"},
    {"4a656665",
     "7768617420646f2079612077616e7420666f72206e6f7468696e673f",
     "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea250554"
     "9758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737"},
    {"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
     "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
     "dddddddddddddddddddddddddddddddddddd",
     "fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39"
     "bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb"},
    {"0102030405060708090a0b0c0d0e0f10111213141516171819",
     "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"
     "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
     "b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3db"
     "a91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd"},
    {"0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c",
     "546573742057697468205472756e636174696f6e",
     "415fad6271580a531d4179bc891d87a6"},
    {"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaa",
     "54657374205573696e67204c6172676572205468616e20426c6f636b2d53697a"
     "65204b6579202d2048617368204b6579204669727374",
     "80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f352"
     "6b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598"},
    {"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
     "aaaaaa",
     "5468697320697320612074657374207573696e672061206c6172676572207468"
     "616e20626c6f636b2d73697a65206b657920616e642061206c61726765722074"
     "68616e20626c6f636b2d73697a6520646174612e20546865206b6579206e6565"
     "647320746f20626520686173686564206265666f7265206265696e6720757365"
     "642062792074686520484d414320616c676f726974686d2e",
     "e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944"
     "b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58"},
};

static void crypto_hmac_sha512_matches_rfc_4231(void) {
  for (size_t i = 0; i < sizeof rfc_4231 / sizeof rfc_4231[0]; i++) {
    uint8_t raw[131];
    uint8_t data[152];
    uint8_t expected[EVOLU_SHA512_SIZE];
    size_t raw_size = from_hex(raw, rfc_4231[i].key);
    size_t data_size = from_hex(data, rfc_4231[i].data);
    size_t tag_size = from_hex(expected, rfc_4231[i].tag);

    evolu_hmac_sha512_key key;
    evolu_hmac_sha512 mac;
    uint8_t tag[EVOLU_SHA512_SIZE];
    evolu_hmac_sha512_key_init(&key, raw, raw_size);
    evolu_hmac_sha512_init(&mac, &key);
    evolu_hmac_sha512_update(&mac, data, data_size);
    evolu_hmac_sha512_final(&mac, tag);
    CHECK_EQ_BYTES(tag, expected, tag_size);
  }
}

static void crypto_hmac_sha512_key_state_is_reusable(void) {
  // Test cases 6 and 7 share their 131-byte key, so one key state serves
  // both, and test case 7's data is fed in updates of odd sizes.
  uint8_t raw[131];
  uint8_t data6[54];
  uint8_t data7[152];
  uint8_t expected6[EVOLU_SHA512_SIZE];
  uint8_t expected7[EVOLU_SHA512_SIZE];
  size_t raw_size = from_hex(raw, rfc_4231[5].key);
  size_t data6_size = from_hex(data6, rfc_4231[5].data);
  size_t data7_size = from_hex(data7, rfc_4231[6].data);
  from_hex(expected6, rfc_4231[5].tag);
  from_hex(expected7, rfc_4231[6].tag);

  evolu_hmac_sha512_key key;
  evolu_hmac_sha512_key_init(&key, raw, raw_size);
  evolu_hmac_sha512 mac;
  uint8_t tag[EVOLU_SHA512_SIZE];

  evolu_hmac_sha512_init(&mac, &key);
  evolu_hmac_sha512_update(&mac, data6, data6_size);
  evolu_hmac_sha512_final(&mac, tag);
  CHECK_EQ_BYTES(tag, expected6, sizeof tag);

  evolu_hmac_sha512_init(&mac, &key);
  static const size_t updates[] = {0, 1, 3, 127, 129};
  size_t done = 0;
  for (size_t i = 0; done < data7_size; i = (i + 1) % 5) {
    size_t next = data7_size - done < updates[i] ? data7_size - done
                                                  : updates[i];
    evolu_hmac_sha512_update(&mac, data7 + done, next);
    done += next;
  }
  evolu_hmac_sha512_final(&mac, tag);
  CHECK_EQ_BYTES(tag, expected7, sizeof tag);

  evolu_hmac_sha512_init(&mac, &key);
  evolu_hmac_sha512_update(&mac, data6, data6_size);
  evolu_hmac_sha512_final(&mac, tag);
  CHECK_EQ_BYTES(tag, expected6, sizeof tag);
}

static void crypto_hmac_sha512_wipes_its_states(void) {
  uint8_t raw[20];
  from_hex(raw, rfc_4231[0].key);
  evolu_hmac_sha512_key key;
  evolu_hmac_sha512 mac;
  uint8_t tag[EVOLU_SHA512_SIZE];
  evolu_hmac_sha512_key_init(&key, raw, sizeof raw);
  evolu_hmac_sha512_init(&mac, &key);
  evolu_hmac_sha512_update(&mac, (const uint8_t *)"Hi There", 8);

  evolu_hmac_sha512_final(&mac, tag);
  evolu_hmac_sha512 zero_mac;
  memset(&zero_mac, 0, sizeof zero_mac);
  CHECK_EQ_BYTES(&mac, &zero_mac, sizeof mac);

  evolu_hmac_sha512_key_wipe(&key);
  evolu_hmac_sha512_key zero_key;
  memset(&zero_key, 0, sizeof zero_key);
  CHECK_EQ_BYTES(&key, &zero_key, sizeof key);
}

/*
 * No standard publishes PBKDF2-HMAC-SHA512 vectors, so the expected values
 * were computed with Node.js 24's node:crypto pbkdf2Sync (OpenSSL), a
 * cross-implementation check. Passwords and salts are hex.
 */
static const struct {
  const char *password;
  const char *salt;
  uint32_t iterations;
  const char *output;
} pbkdf2_vectors[] = {
    // "password", "salt"
    {"70617373776f7264", "73616c74", 1,
     "867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252"
     "c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce"},
    {"70617373776f7264", "73616c74", 2,
     "e1d9c16aa681708a45f5c7c4e215ceb66e011a2e9f0040713f18aefdb866d53c"
     "f76cab2868a39b9f7840edce4fef5a82be67335c77a6068e04112754f27ccf4e"},
    {"70617373776f7264", "73616c74", 4096,
     "d197b1b33db0143e018b12f3d1d1479e6cdebdcc97c5c0f87f6902e072f457b5"
     "143f30602641b3d55cd335988cb36b84376060ecd532e039b742a239434af2d5"},
    // 130 bytes: three blocks, the last one partial.
    {"70617373776f7264", "73616c74", 2,
     "e1d9c16aa681708a45f5c7c4e215ceb66e011a2e9f0040713f18aefdb866d53c"
     "f76cab2868a39b9f7840edce4fef5a82be67335c77a6068e04112754f27ccf4e"
     "473e311ad827b68945f4e2dddb204c78e40e2495141e411cd272d020640d673c"
     "d34aa29f1e03c579d247bf63f041156031e0bf2e841c553c530933b48c40c865"
     "a45f"},
    // "passwordPASSWORDpassword", "saltSALTsaltSALTsaltSALTsaltSALTsalt",
    // 100 bytes.
    {"70617373776f726450415353574f524470617373776f7264",
     "73616c7453414c5473616c7453414c5473616c7453414c5473616c7453414c54"
     "73616c74",
     4096,
     "8c0511f4c6e597c6ac6315d8f0362e225f3c501495ba23b868c005174dc4ee71"
     "115b59f9e60cd9532fa33e0f75aefe30225c583a186cd82bd4daea9724a3d3b8"
     "04f75bdd41494fa324cab24bcc680fb3b96a30cf5d21fac3c2875913919f3399"
     "b1d9ce7e"},
    // "pass\0word", "sa\0lt", 16 bytes.
    {"7061737300776f7264", "7361006c74", 4096,
     "9d9e9c4cd21fe4be24d5b8244c759665"},
    // 129 bytes of 'p', longer than a SHA-512 block, so HMAC hashes it.
    {"7070707070707070707070707070707070707070707070707070707070707070"
     "7070707070707070707070707070707070707070707070707070707070707070"
     "7070707070707070707070707070707070707070707070707070707070707070"
     "7070707070707070707070707070707070707070707070707070707070707070"
     "70",
     "73616c74", 2,
     "af154c6c757ca8ca613aefd7502485fd3b79eb3be382697b12308b7a6b79a08d"},
    // 128 bytes of 'p', a whole SHA-512 block, so HMAC uses it unhashed.
    {"7070707070707070707070707070707070707070707070707070707070707070"
     "7070707070707070707070707070707070707070707070707070707070707070"
     "7070707070707070707070707070707070707070707070707070707070707070"
     "7070707070707070707070707070707070707070707070707070707070707070",
     "73616c74", 2,
     "f6da08f6effa8c302853204f3914ae44b314d5be7646aacaf03cdb3e7299bc6d"},
    // The legacy key's shape: 67 bytes, x' followed by a 32-byte key in hex
    // and ', longer than a SHA-512 digest and shorter than a block.
    {"7827303030313032303330343035303630373038303930613062306330643065"
     "3066313031313132313331343135313631373138313931613162316331643165"
     "316627",
     "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff", 2,
     "9d4e2fb12edaa0f2228d5b31a5a76112414e8eb982d1e2c50be6fb8b446452eb"},
    // The codec's shape: a 32-byte key, a 16-byte salt XORed with 0x3a, two
    // iterations, 32 bytes.
    {"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
     "cacbc8c9cecfcccdc2c3c0c1c6c7c4c5", 2,
     "38e65a05b8d5f4bcd53d0fecc1235d2b26a0e891933bd1a5c019c5d7ec41d103"},
};

static void crypto_pbkdf2_sha512_matches_node_crypto(void) {
  for (size_t i = 0; i < sizeof pbkdf2_vectors / sizeof pbkdf2_vectors[0];
       i++) {
    uint8_t password[129];
    uint8_t salt[36];
    uint8_t expected[130];
    uint8_t output[130];
    size_t password_size = from_hex(password, pbkdf2_vectors[i].password);
    size_t salt_size = from_hex(salt, pbkdf2_vectors[i].salt);
    size_t output_size = from_hex(expected, pbkdf2_vectors[i].output);

    CHECK_EQ_INT(evolu_pbkdf2_sha512(password, password_size, salt,
                                     salt_size, pbkdf2_vectors[i].iterations,
                                     output, output_size),
                 EVOLU_CRYPTO_OK);
    CHECK_EQ_BYTES(output, expected, output_size);
  }
}

static void crypto_pbkdf2_sha512_rejects_invalid_parameters(void) {
  uint8_t output[64];
  uint8_t untouched[64];
  memset(output, 0xaa, sizeof output);
  memset(untouched, 0xaa, sizeof untouched);

  CHECK_EQ_INT(evolu_pbkdf2_sha512((const uint8_t *)"password", 8,
                                   (const uint8_t *)"salt", 4, 0, output,
                                   sizeof output),
               EVOLU_CRYPTO_MISUSE);
  CHECK_EQ_BYTES(output, untouched, sizeof output);

#if SIZE_MAX > UINT32_MAX
  // One byte more than (2^32 - 1) blocks of 64 bytes.
  size_t too_long = (size_t)UINT32_MAX * EVOLU_SHA512_SIZE + 1;
  CHECK_EQ_INT(evolu_pbkdf2_sha512((const uint8_t *)"password", 8,
                                   (const uint8_t *)"salt", 4, 1, output,
                                   too_long),
               EVOLU_CRYPTO_MISUSE);
  CHECK_EQ_BYTES(output, untouched, sizeof output);
#endif

  CHECK_EQ_INT(evolu_pbkdf2_sha512(NULL, 0, NULL, 0, 1, NULL, 0),
               EVOLU_CRYPTO_OK);
}

/* NIST SP 800-38A appendix F.2.5 and F.2.6, CBC-AES256. */
static const char sp800_38a_key[] =
    "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4";
static const char sp800_38a_iv[] = "000102030405060708090a0b0c0d0e0f";
static const char sp800_38a_plaintext[] = "6bc1bee22e409f96e93d7e117393172a"
                                          "ae2d8a571e03ac9c9eb76fac45af8e51"
                                          "30c81c46a35ce411e5fbc1191a0a52ef"
                                          "f69f2445df4f9b17ad2b417be66c3710";
static const char sp800_38a_ciphertext[] = "f58c4c04d6e5f1ba779eabfb5f7bfbd6"
                                           "9cfc4e967edb808d679f777bc6702c7d"
                                           "39f23369a9d9bacfa530e26304231461"
                                           "b2eb05e2c39be9fcda6c19078c6a9d1b";

static void check_sp800_38a(const evolu_aes256_impl *impl) {
  uint8_t key[EVOLU_AES256_KEY_SIZE];
  uint8_t iv[EVOLU_AES_BLOCK_SIZE];
  uint8_t plaintext[64];
  uint8_t ciphertext[64];
  uint8_t data[64];
  from_hex(key, sp800_38a_key);
  from_hex(plaintext, sp800_38a_plaintext);
  from_hex(ciphertext, sp800_38a_ciphertext);
  evolu_aes256 aes;
  evolu_aes256_init_with(&aes, impl, key);
  CHECK(aes.impl == impl);

  // F.2.5; afterwards the IV is the last ciphertext block.
  from_hex(iv, sp800_38a_iv);
  memcpy(data, plaintext, sizeof data);
  CHECK_EQ_INT(evolu_aes256_cbc_encrypt(&aes, iv, data, sizeof data),
               EVOLU_CRYPTO_OK);
  CHECK_EQ_BYTES(data, ciphertext, sizeof data);
  CHECK_EQ_BYTES(iv, ciphertext + 48, sizeof iv);

  // F.2.6, likewise.
  from_hex(iv, sp800_38a_iv);
  CHECK_EQ_INT(evolu_aes256_cbc_decrypt(&aes, iv, data, sizeof data),
               EVOLU_CRYPTO_OK);
  CHECK_EQ_BYTES(data, plaintext, sizeof data);
  CHECK_EQ_BYTES(iv, ciphertext + 48, sizeof iv);
}

static void crypto_aes256_ct64_matches_sp800_38a(void) {
  check_sp800_38a(&evolu_aes256_ct64);
}

static void crypto_aes256_ct_matches_sp800_38a(void) {
  check_sp800_38a(&evolu_aes256_ct);
}

/*
 * Splits the SP 800-38A message into calls of the given numbers of blocks,
 * which also covers the remainders of aes_ct's two-block and aes_ct64's
 * four-block decryption.
 */
static void check_cbc_chaining(const evolu_aes256_impl *impl) {
  static const size_t splits[][4] = {
      {1, 3, 0, 0}, {3, 1, 0, 0}, {2, 2, 0, 0}, {1, 1, 1, 1}};
  uint8_t key[EVOLU_AES256_KEY_SIZE];
  uint8_t plaintext[64];
  uint8_t ciphertext[64];
  from_hex(key, sp800_38a_key);
  from_hex(plaintext, sp800_38a_plaintext);
  from_hex(ciphertext, sp800_38a_ciphertext);
  evolu_aes256 aes;
  evolu_aes256_init_with(&aes, impl, key);

  for (size_t i = 0; i < sizeof splits / sizeof splits[0]; i++) {
    uint8_t iv[EVOLU_AES_BLOCK_SIZE];
    uint8_t data[64];
    size_t offset = 0;

    from_hex(iv, sp800_38a_iv);
    memcpy(data, plaintext, sizeof data);
    for (size_t j = 0; j < 4 && splits[i][j] > 0; j++) {
      size_t size = splits[i][j] * EVOLU_AES_BLOCK_SIZE;
      CHECK_EQ_INT(evolu_aes256_cbc_encrypt(&aes, iv, data + offset, size),
                   EVOLU_CRYPTO_OK);
      offset += size;
    }
    CHECK_EQ_BYTES(data, ciphertext, sizeof data);

    from_hex(iv, sp800_38a_iv);
    offset = 0;
    for (size_t j = 0; j < 4 && splits[i][j] > 0; j++) {
      size_t size = splits[i][j] * EVOLU_AES_BLOCK_SIZE;
      CHECK_EQ_INT(evolu_aes256_cbc_decrypt(&aes, iv, data + offset, size),
                   EVOLU_CRYPTO_OK);
      offset += size;
    }
    CHECK_EQ_BYTES(data, plaintext, sizeof data);
  }
}

static void crypto_aes256_ct64_chains_across_calls(void) {
  check_cbc_chaining(&evolu_aes256_ct64);
}

/*
 * The test runner routes only the ct64 CBC files' ortho calls through this
 * probe. Their otherwise-uninitialized automatic arrays have a compiler
 * pattern, so removing either explicit initializer reliably fails the test.
 * The real transform always runs, also after the probe detects a failure.
 */
void br_aes_ct64_ortho(uint64_t q[8]);
static int lane_probe_active;
static int lane_probe_encrypt;
static int lane_probe_nonzero;
static size_t lane_probe_remaining;
static size_t lane_probe_calls;

void evolu_test_aes_ct64_ortho(uint64_t q[8]) {
  if (lane_probe_active) {
    if (lane_probe_calls % 2 == 0) {
      size_t blocks = lane_probe_encrypt ? 1 : lane_probe_remaining / 16;
      if (blocks > 4) blocks = 4;
      for (size_t i = blocks; i < 4; i++)
        lane_probe_nonzero |= q[i] != 0 || q[i + 4] != 0;
    } else {
      size_t batch = lane_probe_encrypt ? 16 : 64;
      if (batch > lane_probe_remaining) batch = lane_probe_remaining;
      lane_probe_remaining -= batch;
    }
    lane_probe_calls++;
  }
  br_aes_ct64_ortho(q);
}

static void crypto_aes256_ct64_initializes_inactive_lanes(void) {
  uint8_t key[EVOLU_AES256_KEY_SIZE];
  uint8_t plaintext[80] = {0};
  uint8_t ciphertext[80];
  from_hex(key, sp800_38a_key);
  from_hex(plaintext, sp800_38a_plaintext);
  // SP 800-38A's four blocks followed by a zero block, computed independently
  // with node:crypto createCipheriv("aes-256-cbc") with padding disabled.
  from_hex(ciphertext,
           "f58c4c04d6e5f1ba779eabfb5f7bfbd6"
           "9cfc4e967edb808d679f777bc6702c7d"
           "39f23369a9d9bacfa530e26304231461"
           "b2eb05e2c39be9fcda6c19078c6a9d1b"
           "f9c5310dd415884b28613592b74eeb22");
  evolu_aes256 aes;
  evolu_aes256_init_with(&aes, &evolu_aes256_ct64, key);

  for (size_t size = 0; size <= sizeof plaintext; size += 16) {
    for (int encrypt = 0; encrypt <= 1; encrypt++) {
      uint8_t iv[EVOLU_AES_BLOCK_SIZE];
      uint8_t data[80];
      from_hex(iv, sp800_38a_iv);
      memcpy(data, encrypt ? plaintext : ciphertext, sizeof data);
      lane_probe_encrypt = encrypt;
      lane_probe_nonzero = 0;
      lane_probe_remaining = size;
      lane_probe_calls = 0;
      lane_probe_active = 1;
      evolu_crypto_result result =
          encrypt ? evolu_aes256_cbc_encrypt(&aes, iv, data, size)
                  : evolu_aes256_cbc_decrypt(&aes, iv, data, size);
      lane_probe_active = 0;
      CHECK_EQ_INT(result, EVOLU_CRYPTO_OK);
      CHECK_EQ_INT(lane_probe_nonzero, 0);
      CHECK_EQ_INT(lane_probe_remaining, 0);
      CHECK_EQ_INT(lane_probe_calls,
                   encrypt ? size / 16 * 2 : (size + 63) / 64 * 2);
      CHECK_EQ_BYTES(data, encrypt ? ciphertext : plaintext, size);
      if (size > 0) CHECK_EQ_BYTES(iv, ciphertext + size - 16, sizeof iv);
    }
  }
  evolu_aes256_wipe(&aes);
}

static void crypto_aes256_ct_chains_across_calls(void) {
  check_cbc_chaining(&evolu_aes256_ct);
}

static void check_partial_blocks(const evolu_aes256_impl *impl) {
  static const size_t sizes[] = {1, 15, 17, 63};
  uint8_t key[EVOLU_AES256_KEY_SIZE];
  uint8_t iv[EVOLU_AES_BLOCK_SIZE];
  uint8_t data[64];
  uint8_t untouched_iv[EVOLU_AES_BLOCK_SIZE];
  uint8_t untouched[64];
  from_hex(key, sp800_38a_key);
  from_hex(untouched_iv, sp800_38a_iv);
  from_hex(untouched, sp800_38a_plaintext);
  evolu_aes256 aes;
  evolu_aes256_init_with(&aes, impl, key);
  memcpy(iv, untouched_iv, sizeof iv);
  memcpy(data, untouched, sizeof data);

  for (size_t i = 0; i < sizeof sizes / sizeof sizes[0]; i++) {
    CHECK_EQ_INT(evolu_aes256_cbc_encrypt(&aes, iv, data, sizes[i]),
                 EVOLU_CRYPTO_MISUSE);
    CHECK_EQ_INT(evolu_aes256_cbc_decrypt(&aes, iv, data, sizes[i]),
                 EVOLU_CRYPTO_MISUSE);
  }
  CHECK_EQ_INT(evolu_aes256_cbc_encrypt(&aes, iv, data, 0), EVOLU_CRYPTO_OK);
  CHECK_EQ_INT(evolu_aes256_cbc_decrypt(&aes, iv, data, 0), EVOLU_CRYPTO_OK);
  CHECK_EQ_BYTES(iv, untouched_iv, sizeof iv);
  CHECK_EQ_BYTES(data, untouched, sizeof data);
}

static void crypto_aes256_rejects_partial_blocks(void) {
  check_partial_blocks(&evolu_aes256_ct64);
  check_partial_blocks(&evolu_aes256_ct);
}

/* The CPU's features, whatever evolu_crypto_set_hardware left on. */
static int cpu_features(void) {
  int previous = evolu_crypto_set_hardware(EVOLU_CRYPTO_ALL);
  int features = evolu_crypto_hardware();
  evolu_crypto_set_hardware(previous);
  return features;
}

/*
 * With any subset of the CPU's features left on, the crypto layer runs as on
 * a CPU that has only those, such as ARMv8.0's AES without SHA-512 or DIT:
 * AES and SHA-512 on the instructions of those left on, otherwise on the
 * target's software default, DIT only when it's left on, and every
 * combination matches the published vectors.
 */
static void crypto_runs_as_on_a_cpu_with_each_subset_of_its_features(void) {
  uint8_t key[EVOLU_AES256_KEY_SIZE];
  uint8_t iv[EVOLU_AES_BLOCK_SIZE];
  uint8_t plaintext[64];
  uint8_t ciphertext[64];
  uint8_t data[64];
  uint8_t digest[EVOLU_SHA512_SIZE];
  uint8_t abc_digest[EVOLU_SHA512_SIZE];
  from_hex(key, sp800_38a_key);
  from_hex(plaintext, sp800_38a_plaintext);
  from_hex(ciphertext, sp800_38a_ciphertext);
  from_hex(abc_digest, "ddaf35a193617abacc417349ae204131"
                       "12e6fa4e89a97ea20a9eeee64b55d39a"
                       "2192992a274fc1a836ba3c23a3feebbd"
                       "454d4423643ce80e2a9ac94fa54ca49f");
#if UINTPTR_MAX > UINT32_MAX || defined(__wasm__)
  const evolu_aes256_impl *software = &evolu_aes256_ct64;
#else
  const evolu_aes256_impl *software = &evolu_aes256_ct;
#endif
  int cpu = cpu_features();
  int previous = evolu_crypto_set_hardware(EVOLU_CRYPTO_ALL);
  int mismatches = 0;
  for (int features = 0; features <= EVOLU_CRYPTO_ALL; features++) {
    evolu_crypto_set_hardware(features);
    int used = cpu & features;
    mismatches += evolu_crypto_hardware() != used;

    evolu_aes256 aes;
    evolu_aes256_init(&aes, key);
    const evolu_aes256_impl *hardware = evolu_aes256_hardware();
    mismatches += (hardware != NULL) != ((used & EVOLU_CRYPTO_AES) != 0);
    mismatches += aes.impl != (hardware != NULL ? hardware : software);
    from_hex(iv, sp800_38a_iv);
    memcpy(data, plaintext, sizeof data);
    evolu_aes256_cbc_encrypt(&aes, iv, data, sizeof data);
    mismatches += memcmp(data, ciphertext, sizeof data) != 0;
    evolu_aes256_wipe(&aes);

    evolu_test_sha512_hardware_blocks = 0;
    evolu_sha512_digest((const uint8_t *)"abc", 3, digest);
    mismatches += memcmp(digest, abc_digest, sizeof digest) != 0;
    mismatches += (evolu_test_sha512_hardware_blocks != 0) !=
                  ((used & EVOLU_CRYPTO_SHA512) != 0);

    unsigned dit = evolu_dit_begin();
    mismatches += evolu_dit_is_set() != ((used & EVOLU_CRYPTO_DIT) != 0);
    evolu_dit_end(dit);
    mismatches += evolu_dit_is_set();
  }
  evolu_crypto_set_hardware(previous);
  CHECK_EQ_INT(mismatches, 0);
}

/*
 * The hardware paths run where they must be tested. Each CI runner declares
 * the features its CPU reports in EVOLU_TEST_EXPECTED_CPU, a mask of
 * EVOLU_CRYPTO_*, so a runner that loses one fails rather than leaving its
 * paths untested. GitHub's arm64 Linux runners, for example, report no DIT.
 * Apple silicon, whose M1 and later have AES and SHA-512 instructions and
 * DIT, has them all, which macOS's runner declares. Other 64-bit CPUs may
 * lack some, such as a Raspberry Pi 4's, which has no AES, or a Pi 5's, which
 * has no SHA-512 or DIT, and take the software paths.
 */
static void crypto_hardware_is_what_ci_declares_and_all_on_apple_silicon(
    void) {
  // GitHub Actions sets CI.
  if (getenv("CI") != NULL) {
    const char *expected = getenv("EVOLU_TEST_EXPECTED_CPU");
    CHECK(expected != NULL);
    CHECK_EQ_INT(cpu_features(), atoi(expected));
    return;
  }
#if defined(__aarch64__) && defined(__APPLE__)
  CHECK_EQ_INT(cpu_features(), EVOLU_CRYPTO_ALL);
#endif
}

static void crypto_aes256_hardware_matches_sp800_38a(void) {
  const evolu_aes256_impl *hardware = evolu_aes256_hardware();
  if (hardware != NULL) check_sp800_38a(hardware);
}

static void crypto_aes256_hardware_chains_across_calls(void) {
  const evolu_aes256_impl *hardware = evolu_aes256_hardware();
  if (hardware != NULL) check_cbc_chaining(hardware);
}

static void crypto_aes256_hardware_rejects_partial_blocks(void) {
  const evolu_aes256_impl *hardware = evolu_aes256_hardware();
  if (hardware != NULL) check_partial_blocks(hardware);
}

/* xorshift64, for repeatable random inputs. */
static uint64_t next_random(uint64_t *state) {
  *state ^= *state << 13;
  *state ^= *state >> 7;
  *state ^= *state << 17;
  return *state;
}

static void crypto_aes256_hardware_matches_ct64_at_random(void) {
  const evolu_aes256_impl *hardware = evolu_aes256_hardware();
  if (hardware == NULL) return;
  uint64_t state = 0x1234567890abcdef;
  for (int round = 0; round < 200; round++) {
    uint8_t key[EVOLU_AES256_KEY_SIZE];
    uint8_t iv[EVOLU_AES_BLOCK_SIZE];
    uint8_t software[64 * EVOLU_AES_BLOCK_SIZE];
    uint8_t hardware_data[sizeof software];
    for (size_t i = 0; i < sizeof key; i++) key[i] = (uint8_t)next_random(&state);
    for (size_t i = 0; i < sizeof iv; i++) iv[i] = (uint8_t)next_random(&state);
    size_t size = (next_random(&state) % 65) * EVOLU_AES_BLOCK_SIZE;
    for (size_t i = 0; i < size; i++)
      software[i] = hardware_data[i] = (uint8_t)next_random(&state);
    evolu_aes256 ct64;
    evolu_aes256 cpu;
    evolu_aes256_init_with(&ct64, &evolu_aes256_ct64, key);
    evolu_aes256_init_with(&cpu, hardware, key);
    uint8_t software_iv[EVOLU_AES_BLOCK_SIZE];
    uint8_t hardware_iv[EVOLU_AES_BLOCK_SIZE];
    memcpy(software_iv, iv, sizeof iv);
    memcpy(hardware_iv, iv, sizeof iv);
    CHECK_EQ_INT(evolu_aes256_cbc_encrypt(&ct64, software_iv, software, size),
                 EVOLU_CRYPTO_OK);
    CHECK_EQ_INT(
        evolu_aes256_cbc_encrypt(&cpu, hardware_iv, hardware_data, size),
        EVOLU_CRYPTO_OK);
    CHECK_EQ_BYTES(hardware_data, software, size);
    CHECK_EQ_BYTES(hardware_iv, software_iv, sizeof iv);
    // Each decrypts what the other encrypted.
    memcpy(software_iv, iv, sizeof iv);
    memcpy(hardware_iv, iv, sizeof iv);
    CHECK_EQ_INT(evolu_aes256_cbc_decrypt(&cpu, hardware_iv, software, size),
                 EVOLU_CRYPTO_OK);
    CHECK_EQ_INT(
        evolu_aes256_cbc_decrypt(&ct64, software_iv, hardware_data, size),
        EVOLU_CRYPTO_OK);
    CHECK_EQ_BYTES(software, hardware_data, size);
    CHECK_EQ_BYTES(hardware_iv, software_iv, sizeof iv);
    evolu_aes256_wipe(&ct64);
    evolu_aes256_wipe(&cpu);
  }
}

static void crypto_sha512_hardware_matches_software_at_every_size(void) {
  uint8_t data[1000];
  uint64_t state = 0xfedcba0987654321;
  for (size_t i = 0; i < sizeof data; i++) data[i] = (uint8_t)next_random(&state);
  int previous = evolu_crypto_set_hardware(0);
  int differs = 0;
  for (size_t size = 0; size <= sizeof data && !differs; size++) {
    uint8_t software[EVOLU_SHA512_SIZE];
    uint8_t hardware[EVOLU_SHA512_SIZE];
    evolu_crypto_set_hardware(0);
    evolu_sha512_digest(data, size, software);
    evolu_crypto_set_hardware(EVOLU_CRYPTO_ALL);
    evolu_sha512_digest(data, size, hardware);
    differs = memcmp(hardware, software, sizeof software) != 0;
  }
  evolu_crypto_set_hardware(previous);
  CHECK(!differs);
}

static void crypto_dit_is_set_between_begin_and_end(void) {
  // Without DIT among the features, it stays off.
  int previous =
      evolu_crypto_set_hardware(EVOLU_CRYPTO_ALL & ~EVOLU_CRYPTO_DIT);
  unsigned off = evolu_dit_begin();
  int is_set = evolu_dit_is_set();
  evolu_dit_end(off);
  evolu_crypto_set_hardware(previous);
  CHECK_EQ_INT(off, 0);
  CHECK(!is_set);
  if ((evolu_crypto_hardware() & EVOLU_CRYPTO_DIT) == 0) return;
  CHECK(!evolu_dit_is_set());
  unsigned outer = evolu_dit_begin();
  CHECK(evolu_dit_is_set());
  unsigned inner = evolu_dit_begin();
  evolu_dit_end(inner);
  // The inner end restores what the outer begin set.
  CHECK(evolu_dit_is_set());
  evolu_dit_end(outer);
  CHECK(!evolu_dit_is_set());
}

/*
 * The probe the DIT tests of the page codec and XChaCha20-Poly1305 rely on
 * fires in each primitive that runs without DIT on a CPU that has it, and
 * stays quiet between evolu_dit_begin and evolu_dit_end.
 */
static void crypto_probe_flags_each_primitive_run_without_dit(void) {
  static const uint8_t key[EVOLU_AES256_KEY_SIZE] = {1};
  uint8_t iv[EVOLU_AES_BLOCK_SIZE] = {0};
  uint8_t data[EVOLU_AES_BLOCK_SIZE] = {0};
  uint8_t tag[EVOLU_SHA512_SIZE];
  for (int with_dit = 0; with_dit < 2; with_dit++) {
    unsigned previous = with_dit ? evolu_dit_begin() : 0;
    int fired[6];
    evolu_aes256 aes;
    evolu_hmac_sha512_key mac_key;
    evolu_hmac_sha512 mac;
    evolu_test_dit_missed = 0;
    evolu_aes256_init(&aes, key);
    fired[0] = evolu_test_dit_missed;
    evolu_test_dit_missed = 0;
    evolu_aes256_cbc_encrypt(&aes, iv, data, sizeof data);
    fired[1] = evolu_test_dit_missed;
    evolu_test_dit_missed = 0;
    evolu_aes256_cbc_decrypt(&aes, iv, data, sizeof data);
    fired[2] = evolu_test_dit_missed;
    evolu_test_dit_missed = 0;
    evolu_hmac_sha512_key_init(&mac_key, key, sizeof key);
    fired[3] = evolu_test_dit_missed;
    evolu_hmac_sha512_init(&mac, &mac_key);
    evolu_test_dit_missed = 0;
    evolu_hmac_sha512_update(&mac, data, sizeof data);
    fired[4] = evolu_test_dit_missed;
    evolu_test_dit_missed = 0;
    evolu_hmac_sha512_final(&mac, tag);
    fired[5] = evolu_test_dit_missed;
    evolu_test_dit_missed = 0;
    evolu_aes256_wipe(&aes);
    evolu_hmac_sha512_key_wipe(&mac_key);
    if (with_dit) evolu_dit_end(previous);
    for (size_t i = 0; i < sizeof fired / sizeof fired[0]; i++)
      CHECK_EQ_INT(fired[i], !with_dit && (evolu_crypto_hardware() &
                                           EVOLU_CRYPTO_DIT) != 0);
  }
}

static void crypto_aes256_wipe_zeroes_the_key_schedule(void) {
  uint8_t key[EVOLU_AES256_KEY_SIZE];
  from_hex(key, sp800_38a_key);
  evolu_aes256 zero;
  memset(&zero, 0, sizeof zero);

  evolu_aes256 aes;
  evolu_aes256_init_with(&aes, &evolu_aes256_ct64, key);
  evolu_aes256_wipe(&aes);
  CHECK_EQ_BYTES(&aes, &zero, sizeof aes);

  evolu_aes256_init_with(&aes, &evolu_aes256_ct, key);
  evolu_aes256_wipe(&aes);
  CHECK_EQ_BYTES(&aes, &zero, sizeof aes);
}

#if defined(__linux__) && !defined(__ANDROID__)
static int getrandom_calls;

/* Interrupted before any byte, then one byte, then every byte asked. */
static ssize_t interrupted_getrandom(void *buffer, size_t size,
                                     unsigned flags) {
  (void)flags;
  getrandom_calls++;
  if (getrandom_calls == 1) {
    errno = EINTR;
    return -1;
  }
  if (getrandom_calls == 2) {
    memset(buffer, 0xab, 1);
    return 1;
  }
  memset(buffer, 0xcd, size);
  return (ssize_t)size;
}

static ssize_t failing_getrandom(void *buffer, size_t size, unsigned flags) {
  (void)buffer;
  (void)size;
  (void)flags;
  errno = ENOSYS;
  return -1;
}

/*
 * On Linux, evolu_random_bytes calls getrandom again after a signal
 * interrupted it and after it returned fewer bytes than asked, and fails when
 * it fails otherwise.
 */
static void crypto_random_bytes_retries_and_fails_as_getrandom_does(void) {
  ssize_t (*real)(void *, size_t, unsigned) = evolu_test_getrandom;
  uint8_t output[16];
  getrandom_calls = 0;
  evolu_test_getrandom = interrupted_getrandom;
  evolu_crypto_result interrupted = evolu_random_bytes(output, sizeof output);
  evolu_test_getrandom = failing_getrandom;
  evolu_crypto_result failed = evolu_random_bytes(output, sizeof output);
  evolu_test_getrandom = real;
  CHECK_EQ_INT(interrupted, EVOLU_CRYPTO_OK);
  CHECK_EQ_INT(getrandom_calls, 3);
  CHECK_EQ_INT(output[0], 0xab);
  for (size_t i = 1; i < sizeof output; i++) CHECK_EQ_INT(output[i], 0xcd);
  CHECK_EQ_INT(failed, EVOLU_CRYPTO_RANDOM_FAILED);
}
#endif

void crypto_suite(void) {
  RUN(crypto_wipe_zeroes_only_the_given_bytes);
  RUN(crypto_constant_time_equal_compares_every_byte);
  RUN(crypto_random_bytes_differ_between_calls);
#if defined(__linux__) && !defined(__ANDROID__)
  RUN(crypto_random_bytes_retries_and_fails_as_getrandom_does);
#endif
  RUN(crypto_sha256_matches_fips_180_examples);
  RUN(crypto_sha256_incremental_equals_one_shot);
  RUN(crypto_sha512_matches_fips_180_examples);
  RUN(crypto_sha512_incremental_equals_one_shot);
  RUN(crypto_sha512_matches_bearssl_at_every_size);
  RUN(crypto_hmac_sha512_matches_rfc_4231);
  RUN(crypto_hmac_sha512_key_state_is_reusable);
  RUN(crypto_hmac_sha512_wipes_its_states);
  RUN(crypto_pbkdf2_sha512_matches_node_crypto);
  RUN(crypto_pbkdf2_sha512_rejects_invalid_parameters);
  RUN(crypto_aes256_ct64_matches_sp800_38a);
  RUN(crypto_aes256_ct_matches_sp800_38a);
  RUN(crypto_aes256_ct64_chains_across_calls);
  RUN(crypto_aes256_ct64_initializes_inactive_lanes);
  RUN(crypto_aes256_ct_chains_across_calls);
  RUN(crypto_aes256_rejects_partial_blocks);
  RUN(crypto_runs_as_on_a_cpu_with_each_subset_of_its_features);
  RUN(crypto_hardware_is_what_ci_declares_and_all_on_apple_silicon);
  RUN(crypto_aes256_hardware_matches_sp800_38a);
  RUN(crypto_aes256_hardware_chains_across_calls);
  RUN(crypto_aes256_hardware_rejects_partial_blocks);
  RUN(crypto_aes256_hardware_matches_ct64_at_random);
  RUN(crypto_sha512_hardware_matches_software_at_every_size);
  RUN(crypto_dit_is_set_between_begin_and_end);
  RUN(crypto_probe_flags_each_primitive_run_without_dit);
  RUN(crypto_aes256_wipe_zeroes_the_key_schedule);
}
