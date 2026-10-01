---
"@evolu/common": patch
---

Removed createEqRedacted

`createEqRedacted` accepted any equality function, and its documentation
compared secrets with `eqString`, which returns at the first different
character. Comparing a secret with untrusted input that way can leak it through
timing, and a timing-safe comparison exists only for bytes, so no generic
version could be safe. The function also revealed values implicitly, while
`Redacted` asks for every reveal to be explicit.

This removal ships as a patch because the function was unsafe to use as
documented. To compare two trusted values, reveal both explicitly. To check a
secret against untrusted input, compare bytes with a constant-time
`TimingSafeEqual` implementation.

```ts
import {
  assertFalse,
  assertTrue,
  createRedacted,
  eqString,
  revealRedacted,
  type Brand,
} from "@evolu/common";
// @ts-expect-error createEqRedacted is no longer exported.
import type { createEqRedacted as _createEqRedacted } from "@evolu/common";

type ApiKey = string & Brand<"ApiKey">;

using a = createRedacted("x" as ApiKey);
using b = createRedacted("x" as ApiKey);
using c = createRedacted("y" as ApiKey);

assertTrue(eqString(revealRedacted(a), revealRedacted(b)));
assertFalse(eqString(revealRedacted(a), revealRedacted(c)));
```
