---
"@evolu/common": patch
---

Fixed isRedacted accepting a disposed Redacted

`isRedacted` returned true for a wrapper disposed with `using` or
`[Symbol.dispose]()`, although `revealRedacted` throws for it. It now returns
true only for a wrapper whose value can still be revealed.
