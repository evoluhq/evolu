---
"@evolu/common": patch
---

Fix handling of empty-update mutations and readDbChange

This patch fixes a bug where a mutation that contains only an `id` (no values) could result in an empty set of `evolu_history` rows for the corresponding timestamp. That caused `readDbChange` to fail when trying to build a CRDT change for syncing. The fix ensures `evolu_history` includes system columns so the storage and sync code always have at least one column to work with.

Manually tested and snapshots updated.

Manual verification steps: call `update("todo", { id })` and then invoke
`readDbChange` via the sync with an empty relay.Ø
