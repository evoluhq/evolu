---
"@evolu/typescript-config": patch
---

Stopped including separate library test directories

The library configuration now includes only `src`. Projects with tests or a Vitest configuration outside `src` must add those paths to their own TypeScript configuration.
