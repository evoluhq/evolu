---
"@evolu/common": patch
---

Add external ID support with `createIdFromString` function

- Add `createIdFromString` function that converts external string identifiers to valid Evolu IDs using SHA-256
- Add optional branding support to both `createId` and `createIdFromString` functions
- Update FAQ documentation with external ID integration examples
- Add tests for new functionality

This enables deterministic ID generation from external systems while maintaining Evolu's 21-character NanoID format requirement and ensuring consistent conflict resolution across distributed clients.
