---
"@evolu/common": patch
---

Fixed loadQuery right after a mutation returning rows from before it

A query loaded earlier and loaded again in the same synchronous code as a mutation, such as `evolu.insert(...)` followed by `await evolu.loadQuery(query)`, returned its earlier rows, without the change. Only the next load read it. A mutation now drops those rows when it is made. Subscribed queries, such as those of a mounted `useQuery`, keep their rows until their refresh, as before.
