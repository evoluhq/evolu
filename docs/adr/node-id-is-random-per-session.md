# The NodeId is random per session, not stored with the database

- Date: 2026-10-14
- Status: Accepted

## Context

Every timestamp is millis, a counter, and a 64-bit random NodeId, and the
timestamp alone identifies a message in sync. Today the NodeId is generated
when the database is created and stored in its clock. The Timestamp module's
Duplicate node IDs section describes what goes wrong when a database is copied,
as when a backup is restored to a new phone while the old one stays in use:
both copies stamp from the same NodeId and clock, so two changes can get one
timestamp. Relays keep the first, the copies diverge, and nothing reports it.
Range fingerprints hash only timestamps, so sync never heals it. The likely
case is both copies stamping from a clock ahead of their system
time, as after adopting the same received timestamp, and producing identical
counters.

It is rare: it needs a copy, both copies writing for the same owner, and both
stamping from the same clock state. But every platform copies databases. iOS
and Android backups and device transfers include expo-sqlite's files. WebKit
on iOS stops excluding a site's storage, OPFS included, from backups once it is
a day old
([NetworkStorageManager.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp)).
macOS Migration Assistant copies browser profiles and app data and leaves the
old Mac working. Systems with a stored replica ID share the flaw:
[cr-sqlite#145](https://github.com/vlcn-io/cr-sqlite/issues/145) is open, Actual
renews its node only for copies it makes itself, and Riak lost data silently
when a replica reused its own counters after losing state
([riak_kv#679](https://github.com/basho/riak_kv/issues/679)).

A stable NodeId also lets a write-key holder who knows it store changes under
timestamps the device has not used yet, which relays then keep instead of the
device's (see `Fingerprint` in the Storage module).

Nothing needs the NodeId to be stable. Only mutations stamp timestamps, from the
clock the SharedWorker passes with each request; retries after a leader change
reuse the clock captured at the first attempt; the protocol only run-length
encodes NodeIds. Evolu keeps no per-NodeId state, unlike the state vectors of
Yjs or the actor tables of Automerge.

## Decision

Each SharedWorker tenant, created per database name while Evolu instances use
it, generates a random NodeId. When it adopts a clock from a DbWorker, it
compares only millis and counter and replaces the NodeId with its own, so
stamped timestamps never carry a NodeId read from storage. The stored clock
keeps millis and counter monotonic; the NodeId saved with it is not read. On
the web, a session lasts from the first tab that opens the database until
shortly after the last one closes; on React Native, where the SharedWorker
runs in the app's JavaScript runtime, it is about one app run. A clock reset,
which the Timestamp module's recovery design needs, also gets a new NodeId.

A copy can't share a NodeId with the original, because it gets a new one when
it starts, before it writes. This is what
[Yjs](https://docs.yjs.dev/api/faq) and
[automerge-repo](https://github.com/automerge/automerge-repo/blob/main/packages/automerge-repo/src/Repo.ts)
do, with a new ID per loaded document. The deferred detection design in the
Timestamp module is dropped, and this replaces the proposal in
[#745](https://github.com/evoluhq/evolu/issues/745) to rotate at every DbWorker
start.

## Rejected alternatives

- Keep a NodeId per database: it leaves a silent loss that can't be detected
  or healed, when the fix is small.
- Detect a copy when a message new to the owner carries our NodeId, then rotate,
  as Yjs does: it reacts only after the other copy's change arrives, so earlier
  collisions are already lost, and it needs a rotation request, a report, and
  an exception for `memoryOnly` databases. Yjs needs it for its 32-bit client
  IDs, which collide at random. With per-session 64-bit NodeIds, it would fire
  only for a copy of a running process, such as a restored virtual machine
  snapshot.
- Detect a copy at startup with a marker kept where backups don't go, such as a
  this-device-only keychain item, Android's no-backup directory, or a device
  identifier such as `identifierForVendor`: it needs code per platform and
  still misses copies. iOS Quick Start reportedly copies even this-device-only
  keychain items
  ([Apple forums](https://developer.apple.com/forums/thread/802526)) and
  `identifierForVendor`, the web and macOS have no place that migration skips,
  and manual copies skip nothing. It buys only a stable NodeId that nothing
  needs.
- Rotate at every DbWorker start (#745): it changes the DbWorker's startup
  write, rotates at every leader change on the web, which adds NodeId runs
  without ending a session, and the SharedWorker, which owns the session's
  clock, can keep the old NodeId from a replayed write's response.
- Exclude the database from backups: Evolu can't set it for an Android app, and
  a restored phone would lose unsynced changes and local-only tables, or all
  data in apps without a relay.
- Include a content hash in message identity, as CouchDB and Automerge do: it
  would keep both changes of any collision and stop a write-key holder from
  taking a device's timestamps, but it changes fingerprints, so it needs a new
  protocol version.
- Use the NodeId as a device identity for future features, such as MLS group
  membership: relays see it in every timestamp and it is no key. MLS identifies
  a device by its keys, and a device that loses state rejoins as a new member
  ([RFC 9750, section 6.6](https://www.rfc-editor.org/rfc/rfc9750#section-6.6)).

## Consequences

Copies of a database that this release opens can't collide; only a copy of a
running session, such as a restored virtual machine snapshot, or two random
64-bit NodeIds can, which is negligible. Neither can two React Native processes
that open one database, such as an app and its extension, which in-process
locks don't exclude. Collisions that existing copies already made stay.

A write-key holder can no longer target a device's future sessions, only NodeIds
it has seen on a relay, which still covers changes an earlier session made but
hasn't uploaded yet. Sync frames grow by about 9 bytes per session boundary in
each list of timestamps they carry; stored data doesn't, because every stored
timestamp already holds its NodeId. Relays see a new NodeId per session instead
of one per database, a small privacy gain: a session spans reconnects and
network changes and can last days, and changes made offline upload in the next
session, which links consecutive NodeIds.

The NodeId no longer identifies a device or a database, so nothing may use it
as one. Earlier releases read the stored NodeId, the last session's, which can
still be in use where a copy came from. An earlier release that opens a copy,
or runs beside this release in another React Native process, can still
collide; on the web, the origin lock keeps releases apart.

The database is meant to be copied. In a local-first app, it holds the user's
data, which must outlive the device, so backups and device transfers have to
carry it, also in apps that sync through no relay. Messaging can treat local
state as expendable: Signal's server deletes each message once a device
acknowledges it, history on a new phone is optional, and Signal's backups
leave out session state
([FullBackupExporter.java](https://github.com/signalapp/Signal-Android/blob/main/app/src/main/java/org/thoughtcrime/securesms/backup/FullBackupExporter.java)),
so a restored phone registers again. Whatever Evolu's database stores must
therefore stay safe to copy, and state that copies must not share, such as
future MLS or BeeKEM leaf keys and ratchet state, can't live in it alone.
Signal keeps such state where backups don't go, sealed by
[Android Keystore](https://github.com/signalapp/Signal-Android/blob/main/app/src/main/java/org/thoughtcrime/securesms/crypto/DatabaseSecretProvider.java)
or a
[this-device-only keychain item](https://github.com/signalapp/Signal-iOS/blob/main/SignalServiceKit/Storage/SSKKeychainStorage.swift),
detects no copies, and relies on its server to revoke a device whose copies
diverge, which Evolu's relays can't do.

Revisit if a feature needs a stable identifier in timestamps, or when a new
protocol version can make message identity content-addressed.
