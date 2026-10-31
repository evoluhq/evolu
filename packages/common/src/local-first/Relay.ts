/**
 * Relay server for data synchronization.
 *
 * @module
 */

import {
  dedupeArray,
  filterArray,
  firstInArray,
  isNonEmptyArray,
  mapArray,
  type NonEmptyReadonlyArray,
} from "../Array.ts";
import { assert } from "../Assert.ts";
import type { TimingSafeEqualDep } from "../Crypto.ts";
import { createUnknownError, type UnknownError } from "../Error.ts";
import { err, ok, trySync } from "../Result.ts";
import type { SqliteDep } from "../Sqlite.ts";
import { sql } from "../Sqlite.ts";
import { createMutexByKey, type Task } from "../Task.ts";
import {
  uint8ArrayToBase64Url,
  type Name,
  type NonNegativeInt,
  type Typed,
} from "../Type.ts";
import { isPromiseLike, type Awaitable } from "../Types.ts";
import {
  OwnerId,
  ownerIdBytesToOwnerId,
  type OwnerError,
  type OwnerIdBytes,
  // OwnerTransport,
  OwnerWriteKey,
} from "./Owner.ts";
import type { ProtocolWriteError, ProtocolWriteKeyError } from "./Protocol.ts";
import type {
  EncryptedCrdtMessage,
  EncryptedDbChange,
  SqliteStorageDeps,
  Storage,
  StorageConfig,
  StorageWriteMessagesError,
} from "./Storage.ts";
import {
  createBaseSqliteStorage,
  extendTimestampBounds,
  readOwnerUsageOrDefault,
  updateOwnerUsage,
} from "./Storage.ts";
import { timestampToTimestampBytes } from "./Timestamp.ts";

export interface RelayConfig extends StorageConfig {
  /**
   * The relay name.
   *
   * Implementations can use this for identification purposes (e.g., database
   * file name, logging).
   */
  readonly name?: Name;

  /**
   * Optional callback to check if an {@link OwnerId} is allowed to access the
   * relay. If this callback is not provided, all owners are allowed.
   *
   * The callback receives the {@link OwnerId} and an options object with an
   * abort `AbortSignal`, and returns a {@link Awaitable} boolean: `true` to
   * allow access, or `false` to deny.
   *
   * The callback can be synchronous (for SQLite or in-memory checks) or
   * asynchronous (for calling remote APIs).
   *
   * The callback returns a boolean rather than an error type because error
   * handling and logging are the responsibility of the callback
   * implementation.
   *
   * OwnerId is used rather than short-lived tokens because this only controls
   * relay access, not write permissions. Changes are encrypted end-to-end, so
   * OwnerId exposure reveals no change contents. But anyone who knows an
   * OwnerId can download the owner's encrypted changes and their timestamps
   * from a relay and subscribe to new ones, as
   * [Privacy](https://www.evolu.dev/docs/privacy#relay-blindness-by-design)
   * describes.
   *
   * OwnerId exposure also allows write-key squatting. The relay stores the
   * write key of the first write it accepts for an owner, so anyone who learns
   * an OwnerId can claim it by writing there before the owner's devices do,
   * unless {@link StorageConfig.isOwnerWithinQuota} refuses that write. The
   * owner then gets {@link ProtocolWriteKeyError} on this relay until the
   * operator deletes everything the relay stores for that OwnerId with
   * {@link Relay.deleteOwner}, which removes the squatter's key and the data
   * stored with it. This callback does not prevent that: it receives only the
   * OwnerId of a connection, which a squatter can name as well, and every
   * message on the connection can name another owner.
   *
   * Owners specify which relays to connect to via `OwnerTransport`. In
   * WebSocket-based implementations, this check occurs before accepting the
   * connection, with the OwnerId typically extracted from the URL query string
   * (e.g., `ws://localhost:4000/?ownerId=...`). The relay requires the URL to
   * be in the correct format for OwnerId extraction.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   AppName,
   *   assertEqual,
   *   assertTrue,
   *   assertType,
   *   createAppOwner,
   *   createEvolu,
   *   createOwnerWebSocketTransport,
   *   createOwnerSecret,
   *   createRandomBytes,
   *   id,
   *   RelayUrl,
   *   type AnyTask,
   * } from "@evolu/common";
   * import type { RelayConfig } from "@evolu/common/local-first";
   *
   * // Create once, persist the mnemonic securely, and restore it on later runs.
   * const appOwner = createAppOwner(
   *   createOwnerSecret({ randomBytes: createRandomBytes() }),
   * );
   * // Client: include the OwnerId so the relay can admit the connection.
   * const transport = createOwnerWebSocketTransport({
   *   url: RelayUrl.orThrow("wss://relay.evolu.dev/"),
   *   ownerId: appOwner.id,
   * });
   *
   * const createTodoEvolu = createEvolu(
   *   { todo: { id: id("Todo") } },
   *   {
   *     appName: AppName.orThrow("AuthenticatedRelayExample"),
   *     appOwner,
   *     transports: [transport],
   *   },
   * );
   * assertType<
   *   typeof createTodoEvolu extends AnyTask ? true : false,
   *   true
   * >();
   *
   * // Relay: accept owners allowed by the app's access policy.
   * type IsOwnerAllowed = NonNullable<RelayConfig["isOwnerAllowed"]>;
   * const allowedOwnerIds = new Set([appOwner.id]);
   * const isOwnerAllowed: IsOwnerAllowed = (ownerId, { signal }) =>
   *   !signal.aborted && allowedOwnerIds.has(ownerId);
   *
   * assertEqual(
   *   await isOwnerAllowed(appOwner.id, {
   *     signal: new AbortController().signal,
   *   }),
   *   true,
   * );
   * assertTrue(transport.url.includes(`ownerId=${appOwner.id}`));
   * ```
   */
  readonly isOwnerAllowed?: (
    ownerId: OwnerId,
    options: {
      /** Aborted when the relay stops waiting for the access check. */
      readonly signal: AbortSignal;
    },
  ) => Awaitable<boolean>;
}

/**
 * Sync and backup relay for Evolu clients.
 *
 * A relay syncs and backs up encrypted data for Evolu apps. Evolu apps can use
 * multiple relays at the same time, combining self-hosted and cloud relays for
 * resilience. Relays are blind by design: they transmit and store encrypted
 * data without understanding its shape or meaning.
 */
export interface Relay extends AsyncDisposable {
  /** The TCP port actually bound by the relay. */
  readonly port: number;

  /**
   * Deletes everything the relay stores for an owner, its messages, timestamps,
   * usage, and write key, after the owner's write in progress, and closes the
   * connections subscribed to it.
   *
   * To keep the owner's data off the relay, refuse its writes first with
   * {@link StorageConfig.isOwnerWithinQuota}, which the relay asks before every
   * write that adds data, including writes that wait for the deletion.
   * Otherwise its devices upload their data again on their next sync. A refused
   * write stores no write key either. {@link RelayConfig.isOwnerAllowed} is not
   * enough: it checks only the OwnerId a connection names when it connects, and
   * an admitted connection can sync any owner, such as one an app shares among
   * its owners.
   *
   * It deletes in one SQLite transaction, during which the relay serves no
   * connection, and which needs free disk space for a journal of about the
   * owner's data. Deleting an owner with a million changes takes seconds.
   * SQLite leaves the deleted rows' bytes in the database file's free space
   * until it overwrites them.
   */
  readonly deleteOwner: (ownerId: OwnerId) => Task<void, UnknownError>;
}

/**
 * The storage a relay syncs with. Unlike a client's {@link Storage}, it checks
 * the {@link OwnerWriteKey} of every write.
 */
export interface RelayStorage extends Omit<Storage, "writeMessages"> {
  /**
   * Returns whether `writeKey` is the owner's write key or the owner has none,
   * without storing it. A relay calls it only for a request without messages,
   * logs a throw, and answers the request with {@link ProtocolWriteError}.
   */
  readonly validateWriteKey: (
    ownerId: OwnerIdBytes,
    writeKey: OwnerWriteKey,
  ) => boolean;

  /**
   * Writes the messages of a writer with `writeKey`, like
   * {@link Storage.writeMessages}. A relay doesn't call
   * {@link RelayStorage.validateWriteKey} before it, so it checks the key
   * itself, under the owner's lock.
   *
   * Returns {@link StorageWriteKeyError} when the owner has another write key.
   * An owner without one stores `writeKey` in the transaction of its first
   * write that passes the quota check, so a request without messages or a
   * refused write stores none.
   */
  readonly writeMessages: (
    ownerIdBytes: OwnerIdBytes,
    writeKey: OwnerWriteKey,
    messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
  ) => Task<void, RelayStorageWriteMessagesError>;
}

export interface RelayStorageDep {
  readonly storage: RelayStorage;
}

/** Error when a write presents another write key than the owner's. */
export interface StorageWriteKeyError
  extends OwnerError, Typed<"StorageWriteKeyError"> {}

/**
 * Reasons why {@link RelayStorage.writeMessages} stored none of a batch.
 *
 * The built-in relay storage stores opaque encrypted messages. It rejects a
 * batch over quota or with another write key than the owner's, and returns
 * {@link UnknownError} when SQLite fails the write, for example on a full disk,
 * after rolling it back.
 */
export type RelayStorageWriteMessagesError =
  StorageWriteMessagesError | StorageWriteKeyError;

/** A {@link RelayStorage} on SQLite. */
export interface RelaySqliteStorage extends RelayStorage {
  /**
   * Deletes all data of an owner after the owner's write in progress, holding
   * the lock that {@link RelayStorage.writeMessages} holds.
   */
  readonly deleteOwner: (ownerId: OwnerIdBytes) => Task<void, UnknownError>;
}

export const createRelaySqliteStorage =
  (deps: SqliteStorageDeps & TimingSafeEqualDep) =>
  (config: StorageConfig): RelaySqliteStorage => {
    const sqliteStorageBase = createBaseSqliteStorage(deps);

    /** Mutex keyed by OwnerId to prevent concurrent writes and deletions. */
    const mutexByOwnerId = createMutexByKey<OwnerId>();

    const selectWriteKey = (ownerId: OwnerIdBytes): OwnerWriteKey | null =>
      deps.sqlite.prepared<{ writeKey: OwnerWriteKey }>`
        select writeKey
        from evolu_writeKey
        where ownerId = ${ownerId};
      `.rows.at(0)?.writeKey ?? null;

    return {
      ...sqliteStorageBase,

      validateWriteKey: (ownerId, writeKey) => {
        const storedWriteKey = selectWriteKey(ownerId);
        return (
          storedWriteKey === null ||
          deps.timingSafeEqual(storedWriteKey, writeKey)
        );
      },

      writeMessages: (ownerIdBytes, writeKey, messages) => async (run) => {
        const ownerId = ownerIdBytesToOwnerId(ownerIdBytes);
        const uniqueMessagesWithTimestampBytes = dedupeArray(
          mapArray(messages, (m) => ({
            timestamp: timestampToTimestampBytes(m.timestamp),
            change: m.change,
          })),
          (message) => uint8ArrayToBase64Url(message.timestamp),
        );

        return run(
          mutexByOwnerId.withLock(ownerId, async () => {
            // SQLite can fail these reads, for example on a corrupt page, and
            // a throw would panic the relay's shared Run.
            const storedWriteKey = trySync(
              () => selectWriteKey(ownerIdBytes),
              createUnknownError,
            );
            if (!storedWriteKey.ok) return storedWriteKey;
            if (
              storedWriteKey.value !== null &&
              !deps.timingSafeEqual(storedWriteKey.value, writeKey)
            )
              return err<RelayStorageWriteMessagesError>({
                type: "StorageWriteKeyError",
                ownerId,
              });

            const readResult = trySync(() => {
              const existingTimestampsResult =
                sqliteStorageBase.getExistingTimestamps(
                  ownerIdBytes,
                  mapArray(
                    uniqueMessagesWithTimestampBytes,
                    (m) => m.timestamp,
                  ),
                );

              const existingTimestampKeys = new Set(
                mapArray(existingTimestampsResult, uint8ArrayToBase64Url),
              );
              const newMessages = filterArray(
                uniqueMessagesWithTimestampBytes,
                (message) =>
                  !existingTimestampKeys.has(
                    uint8ArrayToBase64Url(message.timestamp),
                  ),
              );

              // Nothing to write
              if (!isNonEmptyArray(newMessages)) return null;

              const usage = readOwnerUsageOrDefault(deps)(
                ownerIdBytes,
                firstInArray(newMessages).timestamp,
              );

              return { newMessages, usage };
            }, createUnknownError);
            if (!readResult.ok) return readResult;
            if (readResult.value === null) return ok();
            const { newMessages, usage } = readResult.value;

            const incomingBytes = newMessages.reduce(
              (sum, m) => sum + m.change.length,
              0,
            );
            // SQLite's database size limit keeps the stored bytes of an owner
            // far below Number.MAX_SAFE_INTEGER.
            const newStoredBytes = ((usage.storedBytes ?? 0) +
              incomingBytes) as NonNegativeInt;

            const quotaResult = config.isOwnerWithinQuota(
              ownerId,
              newStoredBytes,
            );
            const isWithinQuota = isPromiseLike(quotaResult)
              ? await quotaResult
              : quotaResult;
            if (!isWithinQuota) {
              return err<RelayStorageWriteMessagesError>({
                type: "StorageQuotaError",
                ownerId,
              });
            }

            // Earlier releases choose how to insert a timestamp from these
            // bounds, so they stay true until the next schema migration drops
            // them.
            let { firstTimestamp, lastTimestamp } = usage;

            // SQLite can fail the write, for example on a full disk. The
            // transaction has rolled back, and a throw would panic the relay's
            // shared Run.
            return trySync(() => {
              deps.sqlite.transaction(() => {
                // An owner's first write that passes the quota check stores
                // its write key, so a refused write stores none.
                if (storedWriteKey.value === null)
                  deps.sqlite.prepared`
                    insert into evolu_writeKey (ownerId, writeKey)
                    values (${ownerIdBytes}, ${writeKey});
                  `;

                for (const { timestamp, change } of newMessages) {
                  [firstTimestamp, lastTimestamp] = extendTimestampBounds(
                    timestamp,
                    firstTimestamp,
                    lastTimestamp,
                  );

                  sqliteStorageBase.insertTimestamp(ownerIdBytes, timestamp);

                  deps.sqlite.prepared`
                    insert into evolu_message
                      ("ownerId", "timestamp", "change")
                    values (${ownerIdBytes}, ${timestamp}, ${change})
                    on conflict do nothing;
                  `;
                }

                updateOwnerUsage(deps)(
                  ownerIdBytes,
                  newStoredBytes,
                  firstTimestamp,
                  lastTimestamp,
                );
              });
            }, createUnknownError);
          }),
        );
      },

      readDbChange: (ownerId, timestamp) => {
        const result = deps.sqlite.prepared<{
          change: EncryptedDbChange;
        }>`
          select "change"
          from evolu_message
          where "ownerId" = ${ownerId} and "timestamp" = ${timestamp};
        `;

        const row = result.rows.at(0);
        assert(row, "Every timestamp must have a change");
        return row.change;
      },

      deleteOwner: (ownerIdBytes) =>
        // A write reads the owner's usage before it waits for its quota check,
        // so deleting meanwhile would let it store that usage afterward.
        mutexByOwnerId.withLock(ownerIdBytesToOwnerId(ownerIdBytes), () =>
          // SQLite can fail the delete, for example on a full disk. The
          // transaction has rolled back.
          trySync(() => {
            deps.sqlite.transaction(() => {
              deps.sqlite.exec(sql`
                delete from evolu_writeKey where ownerId = ${ownerIdBytes};
              `);

              deps.sqlite.exec(sql`
                delete from evolu_message where ownerId = ${ownerIdBytes};
              `);

              sqliteStorageBase.deleteOwner(ownerIdBytes);
            });
          }, createUnknownError),
        ),
    };
  };

export const createRelayStorageTables = (deps: SqliteDep): void => {
  for (const query of [
    sql`
      create table evolu_writeKey (
        "ownerId" blob not null,
        "writeKey" blob not null,
        primary key ("ownerId")
      )
      strict;
    `,

    sql`
      create table evolu_message (
        "ownerId" blob not null,
        "timestamp" blob not null,
        "change" blob not null,
        primary key ("ownerId", "timestamp")
      )
      strict;
    `,
  ]) {
    deps.sqlite.exec(query);
  }
};
