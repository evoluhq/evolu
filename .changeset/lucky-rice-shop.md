---
"@evolu/common": patch
---

Remove dead code comments and improve tests

- Simplify JSDoc for `loadQuery` to focus on current behavior (caching for Suspense)
- Add note about SSR behavior to `appOwner`
- Improve `createEvolu` JSDoc with clearer description and instance caching behavior
- Improve tests to use proper async/await patterns and avoid mock libraries
- Add comprehensive test coverage for query loading, subscriptions, and cache behavior
