---
"@evolu/react-native": minor
"@evolu/common": minor
---

Added Web Locks helpers in `@evolu/common`: `LockManagerDep`,
`testCreateLockManager`, and `acquireLeaderLock`.

`testCreateLockManager` is a native-backed test helper because native `LockManager` cannot be instantiated per test. It isolates lock usage per instance with internal namespacing while preserving visible lock names and native Web Locks behavior in tests.

`acquireLeaderLock` acquires an exclusive leader-election lease for a name and returns an async-disposable handle that holds leadership until disposed.

Added a React Native `lockManager` ponyfill in `@evolu/react-native` because React Native does not support [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) yet.
