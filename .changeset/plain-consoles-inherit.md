---
"@evolu/common": patch
---

Fixed child consoles ignoring their parent's level

A child console copied the level its parent was created with, so `setLevel` on
a parent reached none of its children. A child without its own level now
follows its parent's current level, including later changes. A level set on the
child itself still takes precedence, and `setLevel(null)` makes the child follow
its parent again.
