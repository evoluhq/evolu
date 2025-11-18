---
"@evolu/common": patch
---

Refined system (formerly "default") createdAt column handling

### Summary

- `createdAt` is now derived exclusively from the CRDT `Timestamp`. It is injected automatically only on first insert. You can no longer provide `createdAt` in `upsert` mutation – doing so was an anti‑pattern and is now validated against.
- Introduced `isInsert` flag to `DbChange` to distinguish initial row creation from subsequent updates; this drives automatic `createdAt` population.
- Added `ValidDbChangeValues` type to reject system columns (`createdAt`, `updatedAt`, `id`) while allowing `isDeleted`.
- Clock storage changed from sortable string (`TimestampString`) to compact binary (`blob`) representation for space efficiency and fewer conversions.
- Removed `timestampToTimestampString` / `timestampStringToTimestamp`; added `timestampToDateIso` for converting CRDT timestamps to ISO dates.
- Schema validation wording updated: "default column" -> "system column" for clarity.
- Internal protocol encoding updated (tests reflect new binary clock and flag ordering); snapshots adjusted accordingly.

### Notes

- This change reduces payload size (e.g. from 113 to 97).
