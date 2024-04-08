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
  lockName,
  maybeLogSqliteQueryExecutionTime,
  valuesToSqliteValues,
} from "@evolu/common";
import sqlite3InitModule, {
  SAHPoolUtil,
  Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import { absurd, constVoid } from "effect/Function";
import * as Layer from "effect/Layer";
import * as ReadonlyArray from "effect/ReadonlyArray";
import { ensureTransferableError } from "./ensureTransferableError.js";

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

// https://github.com/sqlite/sqlite-wasm/issues/62
// @ts-expect-error Missing types.
globalThis.sqlite3ApiConfig = {
  warn: constVoid,
};

export const SqliteFactoryLive = Layer.effect(
  SqliteFactory,
  Effect.gen(function* (_) {
    const nanoIdGenerator = yield* _(NanoIdGenerator);
    const sqlite3Promise = sqlite3InitModule();

    return SqliteFactory.of({
      createSqlite: Effect.gen(function* (_) {
        const channel = yield* _(
          lockName("SqliteBroadcastChannel"),
          Effect.flatMap(createSqliteBroadcastChannel),
        );

        /** Handle incoming messages for a tab without initialized Sqlite. */
        channel.onMessage = (message) => {
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

        /**
         * We don't know which tab will be elected leader, and messages are
         * dispatched before initialization, so we must store them.
         */
        let execsBeforeSqliteInit: ReadonlyArray<Exec> = [];

        const maybeCallCallback = (message: ExecSuccess | ExecError) => {
          const callback = callbacks.get(message.id);
          if (callback) {
            callback(message);
            callbacks.delete(message.id);
          }
        };

        const callbacks = new Map<
          NanoId,
          (message: ExecSuccess | ExecError) => void
        >();

        // TODO: Finalize SQLite
        // yield* _(Effect.addFinalizer(() => ...));

        const config = yield* _(Config);
        const runtime = createEvoluRuntime(config);

        Effect.logTrace("SqliteWeb connection lock request")
          .pipe(
            Effect.andThen(lockName("SqliteConnection")),
            Effect.flatMap((lockName) =>
              Effect.async<Sqlite3Static>((resume) => {
                navigator.locks.request(
                  lockName,
                  () =>
                    /**
                     * This promise prevents other tabs from acquiring the lock
                     * because it's never resolved or rejected. The next SQLite
                     * instance is created when the previous lock is released (a
                     * tab is reloaded or closed).
                     */
                    new Promise(() => {
                      resume(Effect.promise(() => sqlite3Promise));
                    }),
                );
              }),
            ),
            Effect.tap(Effect.logTrace("SqliteWeb connection lock granted")),
            Effect.flatMap((sqlite3) =>
              Effect.promise(() =>
                sqlite3.installOpfsSAHPoolVfs({ name: config.name }),
              ),
            ),
            Effect.map(
              (poolUtil: SAHPoolUtil) =>
                new poolUtil.OpfsSAHPoolDb("/evolu1.db"),
            ),
            Effect.tap((sqlite) => {
              const exec = (query: SqliteQuery, id: NanoId) =>
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

              channel.onMessage = (message) => {
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
            }),
            // TODO: Use channel to send errors to Evolu.
            // Effect.catchAllDefect(defect => {
            //   //
            // })
          )
          .pipe(Effect.provideService(Config, config), runtime.runPromise);

        const transactionName = yield* _(lockName("SqliteTransaction"));

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
          transaction: (effect) =>
            Effect.acquireUseRelease(
              Effect.async<() => void>((resume) => {
                navigator.locks.request(
                  transactionName,
                  () =>
                    new Promise<void>((resolve) => {
                      resume(Effect.succeed(resolve));
                    }),
                );
              }),
              () => effect,
              (resolve) => Effect.sync(resolve),
            ),
        });
      }),
    });
  }),
);

/** A typed wrapper. Every SqliteChannelMessage is sent to all tabs. */
interface SqliteBroadcastChannel {
  readonly postMessage: (message: SqliteBroadcastChannelMessage) => void;
  onMessage: (message: SqliteBroadcastChannelMessage) => void;
}

type SqliteBroadcastChannelMessage = Exec | ExecSuccess | ExecError;

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

const createSqliteBroadcastChannel = (name: string) =>
  Effect.sync(() => {
    const channel = new BroadcastChannel(name);
    const sqliteChannel: SqliteBroadcastChannel = {
      postMessage: (message) => {
        channel.postMessage(message);
        // Send to itself as well.
        sqliteChannel.onMessage(message);
      },
      onMessage: constVoid,
    };
    channel.onmessage = (e: MessageEvent<SqliteBroadcastChannelMessage>) => {
      sqliteChannel.onMessage(e.data);
    };
    return sqliteChannel;
  });
