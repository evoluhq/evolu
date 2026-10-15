# AppOwners live in a device instance that can create the first one

- Date: 2026-10-15
- Status: Proposed

## Context

An Evolu instance needs its AppOwner before its database opens, because the
database name and its SQLCipher key derive from it (see `EvoluConfig.appOwner`
and `EvoluConfig.appName`). Evolu 7's DbWorker created and stored the owner when
it created the database, unless the app passed `externalAppOwner`. Evolu 8
requires the owner up front. The database's identity derives from the app and
the owner, so each account gets its own database (see the
[Evolu 8 release post](https://www.evolu.dev/blog/evolu-8-is-released)), and the
owner can come from outside, such as from a hardware wallet like Trezor. Every
app now has to create, store, and reopen its owner on its own. The examples use
the public `testAppOwner`. Apps such as
[Payky](https://github.com/finitoapp/payky/blob/d9cb05b21aeb2f5a088b428efdedb6278bdadd5b/src/core/evolu/device-client.ts)
built their own device instance with a hardcoded owner and `transports: []`.
Apps want what Evolu 7 gave them: open the app and an owner exists.

Creating that owner is the hard part. Two tabs that open the app at the same
time must end up with one owner, but both can find no owner before either
writes, and each creates its own. Preventing that needs a transaction across
the read, the decision, and the write, or a write that the database applies
only if no owner exists. App code has neither. Each query and mutation is its
own request, and nothing lets app code run a read and a later write as one
transaction across tabs. Wrapping them in the public `acquireLeaderLock` isn't
enough, because `loadQuery` can return a cached result and a mutation's commit
can't be awaited. Local-only writes are upserts (`ON CONFLICT … DO UPDATE`), and
unique indexes are rejected. A DbWorker's startup is such a transaction: only
one DbWorker opens a database (it holds the database's leader lock), and
startup is one SQLite transaction that ends before `LeaderAcquired`, so no
request runs before it commits. On React Native the lock is in-process, so this
holds within one process, not for an app and its extension.

The data must stay encrypted whatever protects the owner. If the app database
were encrypted with something else, changing the app's local authentication,
such as moving to a passkey, would re-encrypt all of it.

## Decision

Every app uses two Evolu instances: a device instance and the app instance.

The device instance is a local-only Evolu instance for data that belongs to this
device rather than to an AppOwner. It keeps the AppOwners the app can open on
this device in a local-only table. The app can then reopen the app database,
whose name and key come from the AppOwner, without asking for the mnemonic each
time. It can also list several AppOwners and remember the last used one, and
Evolu can create the first AppOwner when the app runs for the first time. The
app instance is encrypted with the AppOwner the app picked from the device
instance. The data is thus encrypted with its AppOwner, not with whatever
protects that owner, so changing the app's local authentication never
re-encrypts the data. The device instance can also hold other device data, such
as settings.

- **The device instance's owner is fixed and never syncs.** It is the
  `testAppOwner` of `@evolu/common` before 8.3.3 (OwnerId
  `StbvdTPxk80z0cNVwDJg6g`), which Payky hardcodes for its device instance, so
  such apps need no complex migration. Its secret is public. The device
  instance has explicit `transports: []`, and `useOwner` asserts in every
  instance that it isn't given this owner. `createEvolu` calls `useOwner` for
  its AppOwner unless `transports` is `[]`, so it can't sync this owner either.
  The device instance can sync other owners with explicit transports, such as a
  shared read-only configuration owner or a backup owner.
- **Each app has its own device instance**, so several apps served on one origin
  during local development, such as `localhost:3000`, don't share owners. The
  device instance opens with the app's `appName` and its fixed owner, so its
  database name differs from the app database's. Its `appName` defaults to the
  app's and can be overridden, for example in tests.
- **The device instance can create the first AppOwner.** An option makes its
  DbWorker create an AppOwner and insert it **only when the device instance's
  database is created**: startup finds no `evolu_version`, then inserts the row
  after `ensureSqliteSchema`, in the same transaction. A device instance
  without the option creates none, and no other instance may use it. A row
  stores the AppOwner's OwnerId as `id`, its `secret`, and `lastUsedAt` for UX.
  The system `createdAt` column sorts AppOwners in the UI, and the system
  `ownerId` column holds the device instance's owner.
- **`createEvolu` keeps requiring a plain `appOwner`, not a promise.** The app
  reads the device instance, then creates its instance. The wait is acceptable
  because `createEvolu` is already async and only reading the device instance
  adds delay. Evolu provides the device instance's schema and owner, and the
  app picks which stored AppOwner to open.
- **Reset deletes data for real.** Reset deletes the whole app database, which
  needs `Evolu.deleteDatabase` to be implemented, and removes the AppOwner's
  row. Restore inserts a row. Neither creates an AppOwner by itself, and the
  old `resetAppOwner` and `restoreAppOwner` semantics are not kept.

This supports apps that start syncing later, such as a paid service: the app is
usable at once with `transports: []`, and when the user creates an account, it
calls `useOwner` with a relay set up just for that user. It also supports adding
a hardware wallet later without migrating data. The automatic AppOwner stays,
and an owner derived from a Trezor seed with SLIP-21, which is stable, stores
that AppOwner's secret for the app in a synced table, so a new device restores
the same AppOwner from it.

Migrating from Evolu 7 happens in the DbWorker before anything else. If an
unencrypted Evolu 7 database exists, the DbWorker creates the new encrypted
database and deletes the old one only if that succeeded, and the device
instance reads the Evolu 7 owner if one exists. The details are separate work.

## Rejected alternatives

- Store the owner in the app database, as Evolu 7 did: Evolu 8 keys that
  database with the owner. Its key would then have to be fixed and public,
  which leaves the data effectively unencrypted, or come from local
  authentication, so changing that would re-encrypt all data.
- Store the owner in platform storage, such as `localStorage` with Web Locks or
  Expo SecureStore: no schema or reactivity, and behavior differs per
  platform. The `DeviceAppOwner` docs already prefer a local-only instance.
- Create the owner when the table is empty instead of when the database is
  created: a DbWorker starts again whenever another tab's DbWorker takes over
  the database or the database reopens, so deleting every AppOwner would make a
  new one appear, possibly mid-session.
- Create the owner when the AppOwner table is created: `ensureSqliteSchema` also
  creates a table that a schema adds to an existing database, so an owner would
  appear in a device instance already in use.
- Create the owner in app code, such as a row with a fixed id: the second tab's
  upsert overwrites the first tab's owner while that tab keeps using its own.
- Keep an in-memory draft owner and persist it on the first write:
  `evolu.appOwner` exposes the owner before it is stored, another tab can
  persist a different one, and an in-memory database can't become a file.
- A general cross-tab lock for database work, functions registered in a custom
  DbWorker, a `getOrInsert` method, or SQL writes to local-only tables: each is
  more machinery or API than one creation step needs.
- Create the device instance inside `createEvolu` when `appOwner` is omitted: it
  hides a second database and a wait inside `createEvolu`, and the device
  instance must stay configurable.

## Consequences

Because Evolu creates an AppOwner only when the device instance's database is
created, deleting every AppOwner leaves the table empty, and the app offers to
create or restore one.

The device instance's key is public, so the owner is only as safe as the app's
storage: anyone who can read it gets the AppOwner secret, which also grants read
and write access to the owner's data on relays. Apps that need more can encrypt
the stored secret, for example with a key derived from a passkey, without
changing the device instance or the app database. Backups and device transfers
copy the device instance's database with the secret, which also means a
restored device keeps its owner. Evolu now stores the AppOwner secret itself,
so its documentation, such as the privacy page, can no longer say that only the
app keeps it.

Losing the app's storage loses the owner. That happens when site data is
cleared, or when Safari deletes it after seven days without a visit (see the
[FAQ](https://www.evolu.dev/docs/faq)). Synced data is then reachable only
through the mnemonic or a backup owner, so apps should prompt for a backup.
Creating an owner writes nothing to a relay, so this doesn't bring back the
traffic and abuse that the FAQ gives as the reason automatic seeding of default
data was removed. The `useOwner` assertion breaks apps that still sync the old
`testAppOwner`, whose secret is public anyway.

The first render waits for the device instance. On the web, its DbWorker and
the app's start one after the other. If its database is refused, reading it
never resolves, so apps must render `evoluError` outside their Suspense
boundary. Changing `appName` opens a new device instance and creates a new
owner, so `appName` must stay stable.

What the device instance does when it is kept in memory is undecided. That
happens with `memoryOnly`, or where the browser refuses persistent storage, as
in Safari's Private Browsing and Firefox's private windows. With the creation
step as described, every DbWorker would start with an empty database, so when
the tab running it closed, a new owner could appear and open tabs could
disagree.

Every app now keeps two databases open, so the SharedWorker encrypts each synced
write a second time for local broadcast, as it already does whenever more than
one database is open. It should broadcast only when another database has a
writable registration for the owner.

Revisit if the device instance's owner must stop being public, or if apps on one
origin need to share an AppOwner.
