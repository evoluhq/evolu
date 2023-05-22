---
"evolu": major
---

React Suspense

[It's about time](https://twitter.com/acdlite/status/1654171173582692353). React Suspense is an excellent React feature that massively improves both UX and DX. It's a breaking change because I decided to remove the `isLoading` and `isLoaded` states entirely. It's not necessary anymore. Use React Suspense.

This release also includes SQLite 3.42.0. There is no breaking change in data persistence.

Implementing and testing React Suspense also led to internal optimizations for faster and more reliable syncing and better unit tests.
