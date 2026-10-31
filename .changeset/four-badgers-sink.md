---
"@evolu/common": patch
---

Made useOwner throw for equal transports instead of stopping the shared worker

Two equal transports in one array, such as the same relay passed twice to `useOwner`, were a defect the shared worker found only when it claimed them. It stopped, so every open tab got the defect as its `evoluError` and stopped working until reloaded. `useOwner` now throws for them, so the mistake fails only in the tab that made it. `createEvolu` passes the `transports` of its config to `useOwner`, so equal ones make it fail with that defect, which panics the Run it runs on. Two spellings that `RelayUrlFromString` converts to one URL make equal transports too.
