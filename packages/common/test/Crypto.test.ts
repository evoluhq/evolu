import { bytesToHex } from "@noble/ciphers/utils.js";
import { assert, expect, test } from "vitest";
import {
  createSlip21,
  createSymmetricCrypto,
  padmePaddedLength,
} from "../src/Crypto.js";
import { mnemonicToOwnerSecret } from "../src/index.js";
import { getOrThrow, ok } from "../src/Result.js";
import { Mnemonic, NonNegativeInt } from "../src/Type.js";
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

test("createSlip21", () => {
  const mnemonic = getOrThrow(
    Mnemonic.from("all all all all all all all all all all all all"),
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
