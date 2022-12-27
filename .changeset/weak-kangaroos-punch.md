---
"evolu": minor
---

Replace rfc6902 and immutable-json-patch with custom and much faster algorithm.

For now, we detect only a change in the whole result and in-place edits. In the future, we will add more heuristics. We will probably not implement the Myers diff algorithm because it's faster to rerender all than to compute many detailed patches. We will only implement a logic a developer would implement manually, if necessary.
