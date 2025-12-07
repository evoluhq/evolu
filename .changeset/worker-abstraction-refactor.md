---
"@evolu/common": major
"@evolu/web": major
---

**🚧 Work in Progress - Not Yet Functional**

Replaced Worker with SharedWorker architecture:

- Changed `onMessage` from a method to a property for consistency with Web APIs
- Introduced `MessagePort<Input, Output>` as the base interface for bidirectional communication
- Added `SharedWorker<Input, Output>` interface for cross-tab worker sharing
- Removed dedicated Worker implementation in favor of SharedWorker
- Tests temporarily disabled during refactoring

This changeset represents ongoing work. The implementation is incomplete and non-functional.
