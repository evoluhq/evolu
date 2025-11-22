---
"@evolu/common": patch
---

Improve Owner API documentation and consistency

- Add `ReadonlyOwner` interface for owners without write keys
- Export `UnuseOwner` type for better API clarity
- Improve JSDoc comments across Owner types and related interfaces
- Rename `BaseOwnerError` to `OwnerError` for consistency
- Remove `createOwner` from public exports (use specific owner creation functions)
- Remove transport properties from owner types (now passed via `useOwner`)
- Add documentation for `OwnerWriteKey` rotation
- Improve `useOwner` documentation in React and Vue hooks
