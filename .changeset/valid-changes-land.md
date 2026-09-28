---
"@evolu/common": patch
---

Fixed one unreadable change stopping sync through a relay

When a relay sent a change the client could not decrypt, verify, or decode, the
client stored none of the batch that held it and ended the sync round. The relay
offered the same change in every round, so reconciliation through that relay
stopped: some changes made offline or before connecting never reached the
relay, and a download split into several replies stalled.

The client now stores every change it can decrypt, verify, and decode, skips the
others, and continues the round, so everything else still syncs through that
relay. A change is skipped when:

- It was not created with the owner's encryption key, or was altered
  afterwards. A faulty or malicious relay, anyone who can write to a relay for
  the owner, or a client with a wrong key can send such a change.
- An authentic change was replayed under another timestamp.
- It is malformed, or it decrypts but this app version cannot decode it.

A skipped change leaves nothing behind, not even its timestamp, because a stored
timestamp would stop the client from ever fetching the real change with that
timestamp from another relay. It is not quarantined either, because quarantine
is synced to other relays. Skipping loses nothing: the relay keeps the change
and offers it again on each sync, so once the receiving client is fixed, for
example by updating the app or correcting its keys, the next sync stores it. A
change that a client encrypted with a wrong key stays unreadable, because a
relay never replaces a change it already holds for that timestamp. Once the
client stores a valid change with that timestamp, for example from another
relay, the relay no longer offers its copy, and the route completes with a later
sync through that relay during which no changes arrive from other relays.

Evolu cannot tell who is at fault, so it neither stops syncing the owner, which
would let one bad actor stop sync through every relay, nor drops the valid
changes, which no relay can forge. Sync state shows the skip on that relay's
route, which stays incomplete. Every round through that relay downloads its
skipped changes again, so changes the client receives from other relays start
no round through it; they reach it with its next sync, such as after a
reconnect or `evolu.requestSync`. Use the route's error to tell the user, or
stop syncing the owner through that relay. If every route of the owner shows
`DecryptWithXChaCha20Poly1305Error` and your code creates or shares the owner,
check the owner's keys.

A skipped change is no longer reported through `evoluError`, because the relay
offers it again in every round, so `DecryptWithXChaCha20Poly1305Error` is no
longer an `EvoluError`. Watch sync state instead: the relay's route `error` is
the `DecryptWithXChaCha20Poly1305Error`, `ProtocolTimestampMismatchError`, or
`ProtocolInvalidDataError` of the first change skipped in a reply, unless a
failure since the route last settled is shown instead.

A route's `error` is now the error itself with `at`, so it carries the details
of every route failure, not only its `type`, which works as before. A
`ProtocolInvalidDataError` leaves out its data, which can be a whole frame. Code
that creates a `SyncRouteError`, such as a test fixture, must include the
error's own fields, for example the `ownerId` of a `ProtocolQuotaError`, and an
interface can no longer extend it.

`StorageWriteMessagesError` now holds only `StorageQuotaError`. A custom client
`Storage` skips a message it cannot decrypt, verify, or decode instead of
rejecting its batch, as the built-in client storage does.
