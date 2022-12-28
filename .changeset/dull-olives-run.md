---
"evolu": minor
---

Purge cache on a mutation

Before this change, Evolu cached all queries forever. Caching forever is not a real issue because, sooner or later, users will reload the tab or browser itself. But UX could have been better. Imagine a situation when a user goes from page A to page B and then back. Without a mutation, everything is OK, and the user will see the valid data from the cache. But when a mutation is made, obsolete data will flash for milliseconds. While this is OK for server-loaded data (better stale than dead), there is absolutely no reason to favor stale over actual data for local-first apps because fetching is super fast and will never fail.
