---
"@evolu/common": minor
---

Added `assertEqual`, `assertSame`, `assertTrue`, and `assertFalse`

`assertEqual` compares platform-independent Data with `eqData` and reports an
assertion failure when the values differ. `assertSame` compares any JavaScript
values with SameValue semantics through `eqStrict`, including object reference
identity. `assertTrue` and `assertFalse` require exact boolean values instead of
truthiness or falsiness. These assertions are useful in portable examples where
an invariant-specific assertion message would add noise.

```ts
import {
  assertEqual,
  assertFalse,
  assertSame,
  assertTrue,
} from "@evolu/common";

assertEqual(
  new Map([["roles", new Set(["admin", "author"])]]),
  new Map([["roles", new Set(["author", "admin"])]]),
);

const scores = [100, 80];
const leaderboard = scores;
assertSame(leaderboard, scores);

assertTrue(scores.length === 2);
assertFalse(scores.length === 0);
```
