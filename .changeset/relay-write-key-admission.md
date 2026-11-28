---
"@evolu/common": minor
"@evolu/nodejs": minor
---

Add an optional `isOwnerAllowedToWrite` callback to `StorageConfig` and
`createRelay`. It runs before an owner's first write with the presented write
key and the total bytes that would be stored. Returning `false` refuses the
write and stores neither the write key nor the messages, so a relay can verify
the key against a durable registration record before creating any owner state.
Existing relays are unchanged when the callback is omitted.
