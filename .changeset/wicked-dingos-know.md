---
"evolu": patch
---

Remove murmurhash dependency, update deps

NPM murmurhash has a hard-coded dependency on TextEncoder that we don't use and is missing in React Native.
