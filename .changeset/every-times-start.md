---
"@evolu/common": minor
---

Added reversible object key codecs

`objectKeys(keyType)(objectType)` gives a strict object's fields external
names using the key Type's canonical encoding. Field Types, optionality, and
semantic Output are preserved. Decoding accepts exact canonical names and
reports errors at those names. Invalid schema keys and conflicting encodings
fail during construction.

Typed property errors include missing required properties and unexpected input
keys.

`CamelCaseIdentifierFromConstantCaseIdentifier` converts between the two
identifier conventions without losing word boundaries. Compose it with
`prefixed` to adapt namespaced keys.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  CamelCaseIdentifierFromConstantCaseIdentifier,
  object,
  objectKeys,
  PortFromString,
  prefixed,
} from "@evolu/common";

const Key = prefixed("APP_")(CamelCaseIdentifierFromConstantCaseIdentifier);
const Settings = objectKeys(Key)(object({ http2Port: PortFromString }));
const result = Settings.fromUnknown({ APP_HTTP2_PORT: "04000" });
assertOk(result, { http2Port: 4000 });
assertEqual(Settings.to(result.value), { APP_HTTP2_PORT: "4000" });
assertErr(Settings.fromUnknown({ APP_HTTP_2_PORT: "4000" }));
```
