---
"@evolu/common": patch
---

Moved Evolu's timestamp storage into Evolu's SQLite core

Sync reconciles an owner's timestamps through a skiplist in the
`evolu_timestamp` table, which `Storage.ts` read and wrote with recursive
common table expressions. It now calls the SQL functions of Evolu's SQLite core,
such as `evolu_skiplist_insert`, the same skiplist in C, which `@evolu/web`,
`@evolu/react-native` and `@evolu/nodejs` register on every connection. They
write the same rows, so existing databases need no migration.

Sync reads and writes timestamps faster. Measured in Node.js on one owner's
50,000 timestamps, with the same SQLite driver before and after, the table shows
the median of 7 rounds of each operation's mean time per call:

| Operation                  | Before (CTEs) | After (C) | Faster |
| -------------------------- | ------------: | --------: | -----: |
| Fingerprints of 16 ranges  |       1.12 ms |  0.091 ms |  12.3× |
| Timestamp at an index      |       35.8 µs |    6.1 µs |   5.9× |
| Append a timestamp         |        7.1 µs |    4.0 µs |   1.8× |
| Prepend a timestamp        |       23.6 µs |   11.8 µs |   2.0× |
| Insert in shuffled order   |       35.5 µs |   14.0 µs |   2.5× |
| Owner's size               |        9.7 µs |    6.0 µs |   1.6× |
| Lower bound of a timestamp |       14.9 µs |    6.9 µs |   2.2× |

The web's database worker is about 26 KB smaller minified, 4 KB with Brotli.

A custom `SqliteDriver` whose SQLite lacks these functions no longer works:
syncing fails with "no such function: evolu_skiplist_size", and every local
write with "no such function: evolu_skiplist_insert". Evolu's SQLite core
isn't published as a loadable extension. A custom driver can build on
`@evolu/sqlite-wasm` 3.54.1-build1 or later, where every connection has these
functions, or wrap the driver of `@evolu/web`, `@evolu/react-native` or
`@evolu/nodejs`. A relay needs these functions too, so it can't run on a
platform's own SQLite, such as that of Cloudflare Durable Objects.

`BaseSqliteStorage.insertTimestamp` no longer takes an insertion strategy and
must run in a transaction, which its caller rolls back when it throws.
`getTimestampInsertStrategy` and `StorageInsertTimestampStrategy` are removed,
and the new `extendTimestampBounds` returns the first and last timestamps that
`getTimestampInsertStrategy` returned. `Storage.fingerprintRanges` takes at
least one bucket, and `OwnerUsage` no longer has `firstTimestamp` or
`lastTimestamp`.

```ts
import { assertEqual, assertType, Millis, NonNegativeInt } from "@evolu/common";
import {
  type BaseSqliteStorage,
  createTimestamp,
  extendTimestampBounds,
  type FingerprintRange,
  type OwnerIdBytes,
  type OwnerUsage,
  type Storage,
  type TimestampBytes,
  timestampToTimestampBytes,
} from "@evolu/common/local-first";
// @ts-expect-error getTimestampInsertStrategy is removed.
import type { getTimestampInsertStrategy as _getTimestampInsertStrategy } from "@evolu/common/local-first";
// @ts-expect-error StorageInsertTimestampStrategy is removed.
import type { StorageInsertTimestampStrategy as _StorageInsertTimestampStrategy } from "@evolu/common/local-first";

const _insertTimestamp = (
  storage: BaseSqliteStorage,
  ownerId: OwnerIdBytes,
  timestamp: TimestampBytes,
): boolean => {
  // @ts-expect-error insertTimestamp no longer takes an insertion strategy.
  storage.insertTimestamp(ownerId, timestamp, "append");
  return storage.insertTimestamp(ownerId, timestamp);
};

const _fingerprintRanges = (
  storage: Storage,
  ownerId: OwnerIdBytes,
): ReadonlyArray<FingerprintRange> => {
  // @ts-expect-error fingerprintRanges takes at least one bucket.
  storage.fingerprintRanges(ownerId, []);
  return storage.fingerprintRanges(ownerId, [NonNegativeInt.orThrow(0)]);
};

const [first, middle, last] = [1, 2, 3].map((millis) =>
  timestampToTimestampBytes(
    createTimestamp({ millis: Millis.orThrow(millis) }),
  ),
);
assertEqual(extendTimestampBounds(last, first, middle), [first, last]);
assertEqual(extendTimestampBounds(middle, first, last), [first, last]);

assertType<keyof OwnerUsage, "ownerId" | "storedBytes">();
```
