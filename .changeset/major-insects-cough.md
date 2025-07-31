---
"@evolu/common": patch
---

Replace initialData with onInit callback

- Remove `initialData` function from Config interface
- Add `onInit` callback with `isFirst` parameter for one-time initialization
- Simplify database initialization by removing pre-init data handling
- Provide better control over initialization lifecycle
