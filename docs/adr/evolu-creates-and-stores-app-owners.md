# Evolu creates and stores AppOwners in a device database

- Date: 2026-11-07
- Status: Accepted

## Context

An Evolu instance needs its AppOwner before its database opens, because the
database name and its SQLCipher key derive from it (see `EvoluConfig.appOwner`).
Unlike Evolu 7, Evolu 8 requires the owner up front, so every app creates,
stores, and reopens it on its own. The examples used the public `testAppOwner`.
Apps want what Evolu 7 gave them: open the app and an owner exists.

Creating that owner is the hard part. Two tabs that open the app at once must
end up with one owner, but both can find none before either writes. App code
can't make the read, the decision, and the write one transaction, because
queries and mutations reach the DbWorker as separate requests. Making them one
would take an exclusive scope over the database, which is complex and slow, and
creating one owner doesn't need it. A DbWorker's startup is the needed
transaction: a lock lets only one DbWorker open a database, and its
startup is one SQLite transaction that commits before it serves any request. On
React Native and Node.js the lock is in-process, so this holds within one
process, not across processes such as an iOS app and its extension.

The app database must stay encrypted with its AppOwner, not with a key from the
app's local authentication, or moving to another authentication, such as a
passkey, would re-encrypt all data.

## Decision

An app whose AppOwners Evolu keeps uses a device instance and one app instance
for each AppOwner it opens. The device instance is a local-only Evolu instance
for data that belongs to this device, such as settings. It keeps the AppOwners
the app can open on this device in a local-only table, so the app reopens the
app database without asking for the AppOwner secret and can list several
AppOwners. The app instance is encrypted with the AppOwner the app picked.

- **The device instance's own owner, the device owner, comes in one of two
  modes.** It only opens the device database; in both modes the app database is
  encrypted with its AppOwner.
  - _Instant start_ uses a fixed device owner that Evolu provides, so the app
    starts without a prompt, but its secret is public, so anything that can
    read the app's storage can read the device database. It is recommended on
    the web unless the app holds sensitive data or significant money, which
    calls for encrypted local data despite its prompt, and on Node.js, where
    Evolu offers no secure place for the key yet.
  - _Encrypted local data_ derives the device owner from a key only the user or
    the platform can unlock: the iOS Keychain or the Android Keystore through
    `@evolu/react-native`'s own native code, which needs no prompt and is
    recommended on mobile, Electron's `safeStorage` where its platform protects
    the key, or a passkey with the WebAuthn PRF extension on the web. On the web
    it costs a prompt on every start once the passkey exists, and PRF is missing
    in places: Windows Hello has had it only since February 2026 and keeps it
    on one device, and password managers such as Bitwarden lack it. On React
    Native, a stored key the platform can't read stays, and the app can start
    over once the user confirms it, as on the web, though the iOS Keychain
    itself replaces an item it can't decrypt.

  The device owner replaces `DeviceAppOwner`, which promises secure storage that
  an instant-start device owner doesn't have.
  No AppOwner, whose secret others may hold, names or opens the device database.

- **On the web, a passkey unlocks a wrapped key.** The device's key is stored
  wrapped with a key from the passkey's PRF output, in a database of its own
  whose key is public, because it must open before the device's key exists;
  it holds nothing secret. Unlocking is a step before the device instance,
  which the app runs in a user gesture, as some browsers require. On the first
  use it creates the passkey and the key, and a second tab unlocks what the
  first one created. Later it only unlocks, and an error never starts another
  setup, which would orphan the device database. The app can
  start over explicitly once the user confirms it, which orphans the device
  database, and its AppOwners return from their backups. Where the
  browser keeps no storage, it creates no passkey, because every start would
  create another one.

- **The device instance never syncs its owner.** It has explicit
  `transports: []`, and no instance can sync instant start's public device
  owner, which `useOwner` rejects. The device instance can still sync other
  owners, such as a backup owner.
- **The mode is fixed per app, like `appName`, and an AppOwner never moves
  between modes.** Its secret was readable under instant start, and a copy keeps
  opening the owner's data on relays, so moving it would only look like
  protection. An app that needs encrypted local data uses it from the start; one
  that adopts it later gives each user a new AppOwner and copies the data into
  it.
- **Each app has its own device instance**, opened with the app's `appName`, so
  apps served on one origin during development don't share owners.
- **`createEvoluApp` creates the device instance and opens the AppOwners.** It
  fixes what options could combine wrongly: the device owner of the app's mode,
  `transports: []`, Evolu's AppOwner table merged with the app's own device
  tables, and the creation step below. It lists the AppOwners, opens each one's
  instance, and removes them.
- **The device instance can create the first AppOwner.** With an option of the
  factory, its DbWorker creates an AppOwner and inserts it only when it creates
  the device database, in that startup transaction. No other instance can
  request it. An existing Evolu 7 owner is stored as the first AppOwner instead;
  that migration is separate work.
- **`createEvolu` keeps requiring a plain `appOwner`,** for apps that bring
  their own AppOwners, such as ones derived from a hardware wallet.
  `createEvoluApp` reads the AppOwners from the device instance before it opens
  one, the one opened most recently or the one `startAppOwnerId` names, if
  any; creating an instance is already async, so that read is the only added
  delay.
- **Removing an AppOwner deletes this device's copy: its database first, then
  its row.** No tab reopens the database meanwhile, and a database that doesn't
  open, such as a corrupt one, is deleted too, but one another context keeps
  open stays, with its row, and the removal fails. When the last tab closes
  between the two, the row stays, its database opens again empty and syncs, and
  the removal can run again; deleting the row first would leave a database that
  nothing lists or deletes. A database kept in memory ends with its instance,
  so only its row is deleted. An AppOwner's database keeps its name, so a
  restore opens it under the same name.
- **A database kept in memory belongs to one instance.** With `memoryOnly`, or
  where the browser refuses storage, as Safari's Private Browsing and Firefox's
  private windows do, each instance gets a database of its own, so closing
  another tab never empties it. A device instance kept in memory thus creates
  one AppOwner that lasts as long as the instance.

## Rejected alternatives

- Store the owner in the app database, as Evolu 7 did: that database is keyed
  with the owner, so its key would have to be public or come from local
  authentication, whose change would re-encrypt all data.
- Store the AppOwners in platform storage, such as `localStorage` or the iOS
  Keychain: no schema or reactivity, and behavior differs per platform. Secure
  storage keeps only the device's key.
- Store the passkey's wrapped key in IndexedDB or `localStorage`: a second
  storage mechanism, only on the web, that the device database's storage can
  outlive or lose apart from it. `localStorage` also confirms no write to disk
  and doesn't say when another tab sees it.
- Create the owner when the table is empty: a DbWorker starts again whenever
  another tab's takes over or the database reopens, so removing every AppOwner
  would make a new one appear, possibly mid-session.
- Create the owner when the AppOwner table is created: `ensureSqliteSchema` also
  adds tables to an existing database, so an owner would appear in a device
  instance already in use.
- Create the owner in app code, such as a row with a fixed id: local-only writes
  are upserts, so the second tab overwrites the first tab's owner while that tab
  keeps using its own.
- Keep an in-memory draft owner and store it on the first write:
  `evolu.appOwner` exposes an owner that isn't stored, and another tab can store
  a different one.
- An exclusive scope that lets app code read and write as one transaction
  across tabs, as the earlier `evolu.exclusive` proposal did: its reads must
  bypass the query cache, nested calls and failed or abandoned scopes need
  rules, and all other database work waits while app code awaits. One creation
  step needs none of it.
- Create the first AppOwner in app code under a lock, with `acquireLeaderLock`,
  an uncached `loadQuery`, and `onError`: locks taken in callbacks nest and can
  deadlock, and every check costs round trips to the DbWorker.
- Functions registered in a custom DbWorker, or a `getOrInsert` method: each is
  more API than one creation step needs.
- Create the device instance inside `createEvolu` when `appOwner` is omitted: it
  hides a second database and a wait, and the device instance must stay
  configurable.
- Switch modes by moving AppOwner rows into the other mode's device database:
  see "The mode is fixed per app" above.
- Share one memory database by all instances of an app and owner: one elected
  tab runs all of an app's DbWorkers, so closing it empties the other tabs'
  databases mid-session. Their data disappears and comes back only if it synced
  and the device is online, and a device instance kept in memory creates a
  second AppOwner while other tabs still use the first.

## Consequences

The AppOwner secret is as safe as the device owner's key. With instant start,
anything that can read the app's storage, such as malware, gets the AppOwner
secret, which also opens the owner's data on relays. A deleted row leaves no
copy in the database, but device backups and freed storage can keep one. Evolu
doesn't demand a passkey from apps without sensitive data or significant money;
the developer decides, and the examples show both modes. The privacy and
local-first pages describe both modes, and the FAQ says that the device
database stores the AppOwners' secrets, instead of saying that Evolu doesn't
store the secret.

Removing every AppOwner leaves the table empty, and the app offers to create or
restore one. A release that changes the mode or `appName` opens a new device
database with a new AppOwner, and the old AppOwners stay in the old one, which
the app opens only to copy their data. The old owner's synced data stays
readable to whoever copied its secret, until relays can delete an owner.

Losing the app's storage loses the owner, and so does losing the key of
encrypted local data. Browsers delete storage for several reasons, such as
Safari after seven days of use without interaction with the site (see the
[FAQ](https://www.evolu.dev/docs/faq#will-my-data-stay-on-the-device)).
Synced data is then reachable only through an AppOwner secret backup or a
backup owner, so apps should prompt for a backup once the user has created data.
Creating an owner writes nothing to a relay, so this doesn't bring back the
abuse that the FAQ gives as the reason automatic seeding was removed.

Apps can start with `transports: []` and sync once the user creates an account,
such as for a paid service. A hardware wallet can be added later without
migrating data: an owner derived deterministically from a Trezor seed, by a
mechanism still to be settled, stores the AppOwner's secret in a synced table.

The first render waits for the device instance. With a passkey on the web, the
app first unlocks the device's key, which needs the user: on the first use the
app offers to create or restore an AppOwner and creates the passkey then, and
every later start waits for the passkey's prompt. If the device database is
refused, its cached reads stay pending, so apps must render `evoluError`
outside their Suspense boundary, while the operations an app awaits, such as
creating the app, adding an AppOwner, or unlocking the device's key, fail with
the refusal. Two waits remain: a tab of a build waiting for the running build
to end, and a DbWorker the platform ends without a refusal.

Where the browser refuses storage, each tab has its own AppOwner and data, and
closing a tab loses only its own. Chrome's incognito stores databases for the
session, so its tabs share one AppOwner until the session ends.

Revisit if apps on one origin need to share an AppOwner, or if browsers offer a
safe place for a key that needs no passkey prompt.
