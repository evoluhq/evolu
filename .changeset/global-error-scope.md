---
"@evolu/common": minor
"@evolu/web": minor
"@evolu/nodejs": minor
---

Added `GlobalErrorScope` interface for platform-agnostic global error handling

- Added `GlobalErrorScope` interface representing execution contexts that capture uncaught errors and unhandled promise rejections
- Added `handleGlobalError` helper to forward errors to scope callbacks
- Added `createGlobalErrorScope` for browser windows in `@evolu/web`
- Added `createGlobalErrorScope` for Node.js processes in `@evolu/nodejs`
