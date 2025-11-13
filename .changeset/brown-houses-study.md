---
"@evolu/common": patch
---

Multiton → Instances

Multiton has been renamed to Instances with improved API and documentation.

- `createMultiton` → `createInstances`
- `disposeInstance` → `delete`
- Enhanced error handling with AggregateError for multiple disposal failures
- Clearer documentation focusing on practical use cases (mutexes, hot reloading)
