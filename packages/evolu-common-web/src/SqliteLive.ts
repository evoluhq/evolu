import {
  Config,
  NanoId,
  NanoIdGenerator,
  Sqlite,
  SqliteExecResult,
  SqliteFactory,
  SqliteQuery,
  SqliteRow,
  createEvoluRuntime,
  maybeLogSqliteQueryExecutionTime,
  valuesToSqliteValues,
} from "@evolu/common";
import sqlite3InitModule, { SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import { absurd, constVoid } from "effect/Function";
import * as Layer from "effect/Layer";
import * as ReadonlyArray from "effect/ReadonlyArray";
import { ensureTransferableError } from "./ensureTransferableError.js";
import { multitenantLockName } from "./multitenantLockName.js";

/**
 * "opfs-sahpool" does not support multiple simultaneous connections, and it can
 * be instantiated only within a web worker and only within one tab of the same
 * origin. We use Web Locks and BroadcastChannel to enable multiple tabs
 * functionality.
 *
 * - https://sqlite.org/wasm/doc/trunk/persistence.md
 *
 * There is a sophisticated workaround by the great rhashimoto:
 * https://github.com/rhashimoto/wa-sqlite/discussions/81
 *
 * I decided not to use it because we can't use SharedWorker in Chrome Android,
 * and I don't want to use ServiceWorker because it's slower and tricky.
 *
 * This implementation doesn't need SharedWorker or ServiceWorker and does not
 * use dedicated broadcast channels to keep code as simple as possible. Browsers
 * are updating OPFS rapidly, so we may not need this workaround at all in the
 * near future.
 */

/** A typed wrapper. Every SqliteChannelMessage is sent to all tabs. */
interface SqliteChannel {
  readonly postMessage: (message: SqliteChannelMessage) => void;
  onMessage: (message: SqliteChannelMessage) => void;
}

type SqliteChannelMessage = Exec | ExecSuccess | ExecError;

type Exec = {
  readonly _tag: "Exec";
  readonly id: NanoId;
  readonly query: SqliteQuery;
};

type ExecSuccess = {
  readonly _tag: "ExecSuccess";
  readonly id: NanoId;
  readonly result: SqliteExecResult;
};

type ExecError = {
  readonly _tag: "ExecError";
  readonly id: NanoId;
  readonly error: unknown;
};

const createSqliteChannel = (): SqliteChannel => {
  const channel = new BroadcastChannel("sqlite");
  const sqliteChannel: SqliteChannel = {
    postMessage: (message) => {
      channel.postMessage(message);
      // Send to itself as well.
      sqliteChannel.onMessage(message);
    },
    onMessage: constVoid,
  };
  channel.onmessage = (e: MessageEvent<SqliteChannelMessage>): void => {
    sqliteChannel.onMessage(e.data);
  };
  return sqliteChannel;
};

// https://github.com/sqlite/sqlite-wasm/issues/62
// @ts-expect-error Missing types.
globalThis.sqlite3ApiConfig = {
  warn: constVoid,
};

export const SqliteFactoryWeb = Layer.effect(
  SqliteFactory,
  Effect.gen(function* (_) {
    const nanoIdGenerator = yield* _(NanoIdGenerator);

    return SqliteFactory.of({
      createSqlite: Effect.gen(function* (_) {
        const channel = createSqliteChannel();

        // TODO: Finalize SQLite
        // yield* _(Effect.addFinalizer(() => Effect.unit));

        /**
         * We don't know which tab will be elected leader, and messages are
         * dispatched before initialization, so we must store them.
         */
        let execsBeforeSqliteInit: ReadonlyArray<Exec> = [];

        const callbacks = new Map<
          NanoId,
          (message: ExecSuccess | ExecError) => void
        >();

        const maybeCallCallback = (message: ExecSuccess | ExecError): void => {
          const callback = callbacks.get(message.id);
          if (callback) {
            callback(message);
            callbacks.delete(message.id);
          }
        };

        /** Handle incoming messages for a tab without initialized Sqlite. */
        channel.onMessage = (message): void => {
          switch (message._tag) {
            case "Exec": {
              execsBeforeSqliteInit = [...execsBeforeSqliteInit, message];
              break;
            }
            case "ExecError":
            case "ExecSuccess": {
              /**
               * Remove already handled exec so the other tabs will not process
               * it.
               */
              execsBeforeSqliteInit = ReadonlyArray.filter(
                execsBeforeSqliteInit,
                (m) => m.id !== message.id,
              );
              maybeCallCallback(message);
              break;
            }
            default:
              absurd(message);
          }
        };

        const config = yield* _(Config);

        const initSqlite = (poolUtil: SAHPoolUtil): void => {
          const runtime = createEvoluRuntime(config);
          const sqlite = new poolUtil.OpfsSAHPoolDb("/evolu1.db");

          const exec = (query: SqliteQuery, id: NanoId): void =>
            Effect.try({
              try: () =>
                sqlite.exec(query.sql, {
                  returnValue: "resultRows",
                  rowMode: "object",
                  bind: valuesToSqliteValues(query.parameters || []),
                }) as SqliteRow[],
              catch: ensureTransferableError,
            }).pipe(
              maybeLogSqliteQueryExecutionTime(query),
              Effect.match({
                onSuccess: (rows) => {
                  channel.postMessage({
                    _tag: "ExecSuccess",
                    id,
                    result: { rows, changes: sqlite.changes() },
                  });
                },
                onFailure: (error) => {
                  channel.postMessage({ _tag: "ExecError", id, error });
                },
              }),
              runtime.runSync,
            );

          channel.onMessage = (message): void => {
            switch (message._tag) {
              /** A tab was elected so it can start processing. */
              case "Exec":
                exec(message.query, message.id);
                break;
              case "ExecSuccess":
              case "ExecError":
                maybeCallCallback(message);
                break;
              default:
                absurd(message);
            }
          };

          /** Handle execs arrived before Sqlite was initialized. */
          execsBeforeSqliteInit.forEach((message) => {
            exec(message.query, message.id);
          });
          execsBeforeSqliteInit = [];
        };

        const lockName = yield* _(multitenantLockName("Sqlite"));

        yield* _(Effect.logTrace("Sqlite lock request"));

        navigator.locks.request(
          lockName,
          () =>
            /**
             * This promise prevents other tabs from acquiring the lock because
             * it's never resolved or rejected. The next SQLite instance is
             * created when the previous lock is released (a tab is reloaded or
             * closed).
             */
            new Promise((): void => {
              sqlite3InitModule().then((sqlite3) =>
                sqlite3
                  .installOpfsSAHPoolVfs({ name: config.name })
                  .then(initSqlite),
              );
            }),
        );

        return Sqlite.of({
          exec: (query) =>
            Effect.flatMap(nanoIdGenerator.nanoid, (id) =>
              Effect.async((resume) => {
                callbacks.set(id, (message) => {
                  switch (message._tag) {
                    case "ExecSuccess":
                      resume(Effect.succeed(message.result));
                      break;
                    case "ExecError":
                      resume(Effect.die(message.error));
                      break;
                  }
                });
                channel.postMessage({ _tag: "Exec", id, query });
              }),
            ),
        });
      }),
    });
  }),
);
