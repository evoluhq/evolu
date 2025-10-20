---
"@evolu/react-native": patch
"@evolu/common": patch
"@evolu/svelte": patch
"@evolu/web": patch
---

Fix and improve relay broadcasting

- Enable relay broadcasting for all messages, not just non-sync messages. The previous logic was only working due to a bug and we've normalized this behavior.
- Remove TimestampDuplicateNodeError and related NodeId collision checks from receiveTimestamp function.
- Add comprehensive documentation explaining relay broadcasting behavior during migration scenarios and why duplicate messages are safe due to applyMessages idempotency.
- Update NodeId documentation.
