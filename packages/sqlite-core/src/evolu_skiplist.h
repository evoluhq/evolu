/*
 * Evolu's timestamp storage primitives as SQL functions over the
 * evolu_timestamp table that Storage.ts in @evolu/common creates: the same
 * skiplist, read and written in C instead of recursive common table
 * expressions.
 *
 * Every timestamp of an owner is a node of a random level from 1 to 10. A node
 * holds the XOR of the fingerprints and the count of the owner's timestamps
 * after the previous node of the same or a higher level, up to and including
 * itself. A fingerprint is the first 12 bytes of a timestamp's SHA-256, kept
 * as two 48-bit big-endian integers, h1 and h2. Queries walk from the highest
 * level down, through the index on (ownerId, l, t, h1, h2, c), adding up whole
 * nodes.
 *
 * - evolu_skiplist_insert(owner, timestamp, level) inserts a 16-byte timestamp
 *   at a level from 1 to 10 and updates the nodes whose range it falls in.
 *   Returns 1, or 0 for an existing timestamp, which changes nothing. Outside
 *   a transaction it fails with SQLITE_MISUSE. A call that fails can leave
 *   part of its changes in the transaction, which the caller then rolls back.
 * - evolu_skiplist_size(owner) returns the number of the owner's timestamps.
 * - evolu_skiplist_fingerprints(owner, buckets) takes buckets as big-endian
 *   8-byte counts, at least one, increasing or equal, at most the size, and
 *   returns for each a 28-byte record: the fingerprint of the timestamps at
 *   [previous bucket, bucket), from 0 for the first, and the timestamp at the
 *   bucket, the range's upper bound, or 16 zero bytes at the size. Records
 *   longer than SQLITE_LIMIT_LENGTH fail with SQLITE_TOOBIG.
 * - evolu_skiplist_lower_bound(owner, timestamp) returns the index of the first
 *   timestamp at or after a 16-byte timestamp, or NULL when there's none.
 * - evolu_skiplist_timestamp_at(owner, index) returns the timestamp at an
 *   index, or NULL past the last.
 * - evolu_core_version() returns EVOLU_CORE_VERSION.
 *
 * An owner is a 16-byte blob. A malformed argument fails the statement with an
 * error saying so, and a node whose metadata breaks the invariant, as a level
 * outside 1 to 10 does, with SQLITE_CORRUPT. SQLite then refuses the rest of
 * the transaction's writes and its COMMIT, which rolls it back, so an owner
 * whose metadata is corrupt is repaired in a new transaction, and an insert
 * that fails on corrupt metadata is never committed half-applied; after any
 * other failure, the caller rolls back. The skiplist functions are
 * SQLITE_DIRECTONLY, so the schema, such as a view or a trigger, can't call
 * them, and run their own statements on the caller's connection, in its
 * transaction. Outside one, a read function keeps its first statement open
 * until it returns, so its statements read one snapshot. evolu_core_version is
 * innocuous.
 *
 * A published function never changes meaning: a change gets a new name, such
 * as a _v2 suffix, and a new EVOLU_CORE_VERSION, which a caller checks.
 */
#ifndef EVOLU_SKIPLIST_H
#define EVOLU_SKIPLIST_H

#include "sqlite3.h"

#ifdef __cplusplus
extern "C" {
#endif

/* The version of the functions this core registers. */
#define EVOLU_CORE_VERSION 1

/* Registers the functions on a connection. */
int evolu_skiplist_register(sqlite3 *db);

#ifdef __cplusplus
}
#endif

#endif
