---
"@evolu/web": minor
---

Added Apple platform detection

Use `isApplePlatform` to detect macOS, iOS, iPadOS, and iPod platforms in the
browser.

```ts
import { isApplePlatform } from "@evolu/web";

expectTypeOf(isApplePlatform()).toEqualTypeOf<boolean>();
```
