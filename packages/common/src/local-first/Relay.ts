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
} from "../Array.ts";
import { assert } from "../Assert.ts";
import type { TimingSafeEqualDep } from "../Crypto.ts";
import { createUnknownError } from "../Error.ts";
import { err, ok, trySync } from "../Result.ts";
import type { SqliteDep } from "../Sqlite.ts";
import { sql } from "../Sqlite.ts";
import { createMutexByKey } from "../Task.ts";
import { Name, NonNegativeInt, uint8ArrayToBase64Url } from "../Type.ts";
import { isPromiseLike, type Awaitable } from "../Types.ts";
import {
  OwnerId,
  ownerIdBytesToOwnerId,
  // OwnerTransport,
  OwnerWriteKey,
} from "./Owner.ts";
import type { ProtocolWriteKeyError } from "./Protocol.ts";
import type {
  EncryptedDbChange,
  SqliteStorageDeps,
  Storage,
  StorageConfig,
  StorageWriteMessagesError,
} from "./Storage.ts";
import {
  createBaseSqliteStorage,
  getTimestampInsertStrategy,
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
   * relay access, not write permissions. Since all data is encrypted on the
   * relay, OwnerId exposure reveals no data.
   *
   * It does allow write-key squatting. The relay stores the first write key
   * presented for an owner, so anyone who learns an OwnerId before the owner's
   * own write key reaches the relay can claim it. The owner then gets
   * {@link ProtocolWriteKeyError} on this relay until the operator deletes the
   * owner's row in `evolu_writeKey`. This callback does not prevent that: it
   * receives only the OwnerId of a connection, which a squatter can name as
   * well, and every message on the connection can name another owner.
   *
   * Owners specify which relays to connect to via `OwnerTransport`. In
   * WebSocket-based implementations, this check occurs before accepting the
   * connection, with the OwnerId typically extracted from the URL query string
   * (e.g., `ws://localhost:4000?ownerId=...`). The relay requires the URL to be
   * in the correct format for OwnerId extraction.
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
   *   type AnyTask,
   * } from "@evolu/common";
   * import type { RelayConfig } from "@evolu/common/local-first";
   *
   * // Create once, persist the mnemonic securely, and restore it on later runs.
   * const appOwner = createAppOwner(
   *   createOwnerSecret({ randomBytes: createRandomBytes() }),
   * );
   * // Client: include the OwnerId so the relay can authenticate the connection.
   * const transport = createOwnerWebSocketTransport({
   *   url: "wss://relay.evolu.dev",
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
}

export const createRelaySqliteStorage =
  (deps: SqliteStorageDeps & TimingSafeEqualDep) =>
  (config: StorageConfig): Storage => {
    const sqliteStorageBase = createBaseSqliteStorage(deps);

    /** Mutex keyed by OwnerId to prevent concurrent writes. */
    const mutexByOwnerId = createMutexByKey<OwnerId>();

    return {
      ...sqliteStorageBase,

      /**
       * Lazily authorizes the initiator's {@link OwnerWriteKey} for the given
       * {@link OwnerId}.
       *
       * - If the {@link OwnerId} does not exist, it is created and associated with
       *   the provided write key.
       * - If the {@link OwnerId} exists, the provided write key is compared to the
       *   stored key.
       */
      validateWriteKey: (ownerId, writeKey) => {
        const selectWriteKey = deps.sqlite.exec<{ writeKey: OwnerWriteKey }>(
          sql`
            select writeKey
            from evolu_writeKey
            where ownerId = ${ownerId};
          `,
        );
        const { rows } = selectWriteKey;

        if (isNonEmptyArray(rows)) {
          return deps.timingSafeEqual(rows[0].writeKey, writeKey);
        }

        // When SQLite fails this insert, for example on a full disk, the throw
        // reaches the protocol, which logs it and answers with WriteError,
        // because a boolean has no room for the error.
        deps.sqlite.exec(sql`
          insert into evolu_writeKey (ownerId, writeKey)
          values (${ownerId}, ${writeKey});
        `);

        return true;
      },

      writeMessages: (ownerIdBytes, messages) => async (run) => {
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
            // A sum of lengths can be zero. Throwing here would panic the
            // relay's shared Run.
            const newStoredBytes = NonNegativeInt.orThrow(
              (usage.storedBytes ?? 0) + incomingBytes,
            );

            const quotaResult = config.isOwnerWithinQuota(
              ownerId,
              newStoredBytes,
            );
            const isWithinQuota = isPromiseLike(quotaResult)
              ? await quotaResult
              : quotaResult;
            if (!isWithinQuota) {
              return err<StorageWriteMessagesError>({
                type: "StorageQuotaError",
                ownerId,
              });
            }

            let { firstTimestamp, lastTimestamp } = usage;

            // SQLite can fail the write, for example on a full disk. The
            // transaction has rolled back, and a throw would panic the relay's
            // shared Run.
            return trySync(() => {
              deps.sqlite.transaction(() => {
                for (const { timestamp, change } of newMessages) {
                  let strategy;
                  [strategy, firstTimestamp, lastTimestamp] =
                    getTimestampInsertStrategy(
                      timestamp,
                      firstTimestamp,
                      lastTimestamp,
                    );

                  sqliteStorageBase.insertTimestamp(
                    ownerIdBytes,
                    timestamp,
                    strategy,
                  );

                  deps.sqlite.exec(sql`
                    insert into evolu_message
                      ("ownerId", "timestamp", "change")
                    values (${ownerIdBytes}, ${timestamp}, ${change})
                    on conflict do nothing;
                  `);
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
        const result = deps.sqlite.exec<{
          change: EncryptedDbChange;
        }>(sql`
          select "change"
          from evolu_message
          where "ownerId" = ${ownerId} and "timestamp" = ${timestamp};
        `);

        const row = result.rows.at(0);
        assert(row, "Every timestamp must have a change");
        return row.change;
      },

      deleteOwner: (ownerId) => {
        deps.sqlite.transaction(() => {
          deps.sqlite.exec(sql`
            delete from evolu_writeKey where ownerId = ${ownerId};
          `);

          deps.sqlite.exec(sql`
            delete from evolu_message where ownerId = ${ownerId};
          `);

          sqliteStorageBase.deleteOwner(ownerId);
        });
      },
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
