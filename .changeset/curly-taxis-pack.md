---
"@evolu/common": minor
---

Added `encodeJsonValue` and `decodeJsonValue` for binary serialization

The codec is inspired by msgpackr and reuses its test cases and benchmark workloads. It supports only `JsonValue`, because Evolu Protocol is Evolu's own binary serialization format and needs MessagePack only to avoid reinventing binary JSON serialization. This narrower scope allowed us to make the codec faster and smaller. We also fixed three bugs.

- Small mixed object: Evolu is 15% faster at encoding and 28% faster at decoding
  than msgpackr 2.0.5.
- Large nested object: Evolu is 4% slower at encoding and 8% faster at decoding
  than msgpackr 2.0.5.
- Minified browser bundle: Evolu is 76% smaller than msgpackr 2.0.5 (2.6 kB
  versus 10.5 kB gzip).

The three fixes prevent round-trip failures and losses: encoding and decoding now enforce the same nesting limit, negative zero no longer becomes `0`, and an own `__proto__` JSON object key no longer becomes `__proto_`.

The Evolu Protocol now uses these functions for JSON values and finite numbers
instead of msgpackr, removing the msgpackr runtime dependency while preserving MessagePack compatibility.

The codec supports up to 1,000 nested arrays or objects. Encoding and decoding
enforce the same limit so every successfully encoded value can be decoded.

```ts
import {
  assertEqual,
  createBuffer,
  decodeJsonValue,
  encodeJsonValue,
  getOrThrow,
  JsonValue,
} from "@evolu/common";

const buffer = createBuffer();
const value = getOrThrow(
  JsonValue.fromUnknown({ name: "Ada", scores: [10, 20] }),
);

encodeJsonValue(buffer, value);

assertEqual(decodeJsonValue(buffer), value);
```
