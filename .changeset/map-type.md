---
"@evolu/common": minor
---

Added the `map` Type Factory

`map(Key, Value)` validates JavaScript Maps and their entries while
preserving the original Map when decoding does not change any key or value.
Own properties are rejected. If distinct input keys decode to the same output
key, validation returns a collision error instead of discarding an associated
value.

Every locale exported by `@evolu/common/intl` provides `formatMapError` for
localized structural Map errors. Key and value errors use their respective Type
formatters.

```ts
import { PositiveInt, String, assert, assertOk, map } from "@evolu/common";

const Scores = map(String, PositiveInt);
const scores = new Map([
  ["Ada", 10],
  ["Grace", 20],
]);

const result = Scores.fromUnknown(scores);

assertOk(result);
assert(
  globalThis.Object.is(result.value, scores),
  "Expected the original Map.",
);
```
