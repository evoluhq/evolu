---
"@evolu/common": minor
---

Add optional `createIdAsUuidv7` helper for timestamp‑embedded IDs (UUID v7 layout) while keeping `createId` as the privacy‑preserving default.

Simplified Id documentation to clearly present the three creation paths:

- `createId` (random, recommended)
- `createIdFromString` (deterministic mapping via SHA‑256 first 16 bytes)
- `createIdAsUuidv7` (timestamp bits for index locality; leaks creation time)
