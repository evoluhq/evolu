import { bytesToHex, utf8ToBytes } from "@noble/ciphers/utils.js";
import { assert, expect, test } from "vitest";
import {
  createPadmePaddedLength,
  createPadmePadding,
  createRandomBytes,
  createSlip21,
  decryptWithXChaCha20Poly1305,
  encryptWithXChaCha20Poly1305,
  XChaCha20Poly1305Ciphertext,
} from "../src/Crypto.js";
import { mnemonicToOwnerSecret } from "../src/index.js";
import { ok } from "../src/Result.js";
import { createTestDeps } from "../src/Test.js";
import { Mnemonic, NonNegativeInt } from "../src/Type.js";
import { testOwner } from "./local-first/_fixtures.js";

test("encryptWithXChaCha20Poly1305 / decryptWithXChaCha20Poly1305", () => {
  const deps = createTestDeps();
  const plaintext = utf8ToBytes("Hello, world!");
  const encryptionKey = testOwner.encryptionKey;

  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305(deps)(
    plaintext,
    encryptionKey,
  );

  expect(
    decryptWithXChaCha20Poly1305(ciphertext, nonce, encryptionKey),
  ).toEqual(ok(plaintext));

  const result = decryptWithXChaCha20Poly1305(
    XChaCha20Poly1305Ciphertext.orThrow(new Uint8Array([1, 2, 3])),
    nonce,
    encryptionKey,
  );
  assert(!result.ok);
  expect(result.error.type).toBe("DecryptWithXChaCha20Poly1305Error");
});

test("createPadmePaddedLength", () => {
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [8, 8],
    [9, 10],
    [15, 16],
    [16, 16],
    [17, 18],
    [31, 32],
    [32, 32],
    [33, 36],
    [64, 64],
    [65, 72],
    [100, 104],
    [128, 128],
    [129, 144],
    [200, 208],
    [256, 256],
    [300, 304],
    [512, 512],
    [1000, 1024],
    [1024, 1024],
    [2048, 2048],
    [4096, 4096],
    [10000, 10240],
    [65536, 65536],
    [100000, 100352],
    [1048576, 1048576],
  ].forEach(([input, expected]) => {
    expect(createPadmePaddedLength(input as NonNegativeInt)).toBe(expected);
    expect(createPadmePadding(input as NonNegativeInt).length).toBe(
      expected - input,
    );
  });
});

test("createSlip21", () => {
  const mnemonic = Mnemonic.orThrow(
    "all all all all all all all all all all all all",
  );
  const ownerSecret = mnemonicToOwnerSecret(mnemonic);

  const ownerId = createSlip21(ownerSecret, ["Evolu", "Owner Id"]);
  expect(bytesToHex(ownerId)).toMatchInlineSnapshot(
    `"bce9b26dad1a3364c105eb65e7aef032fdffd53816819ac4664442c4a915327f"`,
  );

  const encryptionKey = createSlip21(ownerSecret, ["Evolu", "Encryption Key"]);
  expect(bytesToHex(encryptionKey)).toMatchInlineSnapshot(
    `"abf2095887bc74adda889a572e29a407a457a39bfdd4202d34ee6eac5c28effc"`,
  );
});

/**
 * This test demonstrates createRandomBytes performance, which is used for
 * createId and is fast enough: ~0.0014ms per call on Apple M1.
 */
test.skip("createRandomBytes generates unique values", () => {
  const randomBytes = createRandomBytes();
  const values = new Set<string>();
  const iterations = 10_000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    values.add(bytesToHex(randomBytes.create(16)));
  }
  const end = performance.now();

  // ~14ms on Apple M1
  // eslint-disable-next-line no-console
  console.log(
    `createRandomBytes: ${iterations} in ${(end - start).toFixed(2)}ms`,
  );

  expect(values.size).toBe(iterations);
});
