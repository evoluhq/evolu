import { assert, expect, test } from "vitest";
import { createSymmetricCrypto } from "../src/Crypto.js";
import { ok } from "../src/Result.js";
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
