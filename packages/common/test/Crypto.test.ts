import { assert, expect, test } from "vitest";
import { createSymmetricCrypto, padmePaddedLength } from "../src/Crypto.js";
import { ok } from "../src/Result.js";
import { NonNegativeInt } from "../src/Type.js";
import { testCreateRandomBytesDep, testOwner } from "./_deps.js";

test("SymmetricCrypto", () => {
  const symmetricCrypto = createSymmetricCrypto(testCreateRandomBytesDep);

  const plaintext = new TextEncoder().encode("Hello, world!");
  const encryptionKey = testOwner.encryptionKey;

  const { nonce, ciphertext } = symmetricCrypto.encrypt(
    plaintext,
    encryptionKey,
  );

  expect(symmetricCrypto.decrypt(ciphertext, encryptionKey, nonce)).toEqual(
    ok(plaintext),
  );

  const result = symmetricCrypto.decrypt(
    new Uint8Array([1, 2, 3]),
    encryptionKey,
    nonce,
  );
  assert(!result.ok);
  expect(result.error.type).toBe("SymmetricCryptoDecryptError");
});

test("padmePaddedLength", () => {
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
    expect(padmePaddedLength(input as NonNegativeInt)).toBe(expected);
  });
});
