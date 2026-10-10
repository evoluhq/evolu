---
"@evolu/common": minor
---

Added redacted for validating secrets into Redacted values

`redacted(Inner)` validates a secret string with an inner Type and wraps the
inner Output in `Redacted`, so a decoded password, mnemonic, or API key does not
leak through logging or serialization. The inner Type's errors are returned
unchanged, so it must refine `String` and its errors must not contain the
value, as with `SimplePassword` and `Mnemonic`; both rules are checked at
compile time. A non-string fails with a value-free `RedactedError`, which every
locale of `@evolu/common/intl` translates. Encoding with `to` or `json`
reveals the secret.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  object,
  redacted,
  revealRedacted,
  SimplePassword,
  String,
} from "@evolu/common";

const SignIn = object({ email: String, password: redacted(SimplePassword) });

const signIn = SignIn.fromUnknown({
  email: "ada@example.com",
  password: "correct horse",
});
assertOk(signIn);
assertEqual(revealRedacted(signIn.value.password), "correct horse");
assertEqual(
  JSON.stringify(signIn.value),
  '{"email":"ada@example.com","password":"<redacted>"}',
);
assertErr(SignIn.fromUnknown({ email: "ada@example.com", password: 42 }));
```
