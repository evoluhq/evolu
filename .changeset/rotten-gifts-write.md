---
"@evolu/common": minor
---

Add external ID support with `createIdFromString` function

- Add `createIdFromString` function that converts external string identifiers to valid Evolu IDs using SHA-256
- Add optional branding support to both `createId` and `createIdFromString` functions
- Update FAQ documentation with external ID integration examples
