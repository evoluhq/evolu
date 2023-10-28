---
"@evolu/common-react": minor
---

Allow to disable React Suspense per useQuery

React Suspense is enabled by default but can be optionally disabled
per useQuery hook. When disabled, useQuery will not stop rendering
and will return empty rows instead.

That can be helpful to avoid waterfall when using more than one
useQuery within one React Component. In such a situation, disable
Suspense for all useQuery hooks except the last one.

Because Evolu queues queries within a microtask sequentially, all
queries will be batched within one roundtrip.

Another use case is to optimistically prefetch data that might be
needed in a future render without blocking the current render.
