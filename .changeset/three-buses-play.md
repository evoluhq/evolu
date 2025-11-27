---
"@evolu/common": patch
---

Fix forward compatibility by quarantining messages with unknown schema

Messages with unknown tables or columns are now stored in `evolu_message_quarantine` table instead of being discarded. This fixes an issue where apps had to be updated to receive messages from newer versions. The quarantine table is queryable via `createQuery` and quarantined messages are automatically applied when the schema is updated.
