---
"@evolu/common": major
"@evolu/web": major
---

Replaced interface-based symmetric encryption with direct function-based API

### Breaking Changes

**Removed:**

- `SymmetricCrypto` interface
- `SymmetricCryptoDep` interface
- `createSymmetricCrypto()` factory function
- `SymmetricCryptoDecryptError` error type

**Added:**

- `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
- `decryptWithXChaCha20Poly1305()` - Direct decryption function
- `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
- `Entropy24` - Branded type for 24-byte nonces
- `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
- `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

### Migration Guide

**Before:**

```ts
const symmetricCrypto = createSymmetricCrypto({ randomBytes });
const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
```

**After:**

```ts
const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
  plaintext,
  key,
);
const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
```

**Error handling:**

```ts
// Before
if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

// After
if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
```

**Dependency injection:**

```ts
// Before
interface Deps extends SymmetricCryptoDep { ... }

// After - only encrypt needs RandomBytesDep
interface Deps extends RandomBytesDep { ... }
```

### Rationale

This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.
