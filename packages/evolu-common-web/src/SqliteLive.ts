import {
  NanoId,
  NanoIdGenerator,
  Sqlite,
  SqliteExecResult,
  SqliteQuery,
  SqliteRow,
  ensureSqliteQuery,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Layer from "effect/Layer";
import * as ReadonlyArray from "effect/ReadonlyArray";

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
 * and I don't want to use ServiceWorker because it's slower and harder to
 * grasp.
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

type SqliteChannelMessage =
  | SqliteChannelMessageExec
  | SqliteChannelMessageResult;

type SqliteChannelMessageExec = {
  readonly _tag: "exec";
  readonly id: NanoId;
  readonly query: SqliteQuery;
};

type SqliteChannelMessageResult = {
  readonly _tag: "execResult";
  readonly id: NanoId;
  readonly result: SqliteExecResult;
};

const createSqliteChannel = (): SqliteChannel => {
  const channel = new BroadcastChannel("sqlite");
  const sqliteChannel: SqliteChannel = {
    postMessage: (message): void => {
      channel.postMessage(message);
      // Send to itself as well.
      sqliteChannel.onMessage(message);
    },
    onMessage: Function.constVoid,
  };
  channel.onmessage = (e: MessageEvent<SqliteChannelMessage>): void => {
    sqliteChannel.onMessage(e.data);
  };
  return sqliteChannel;
};

export const SqliteLive = Layer.effect(
  Sqlite,
  Effect.gen(function* (_) {
    const nanoIdGenerator = yield* _(NanoIdGenerator);
    const channel = createSqliteChannel();

    /**
     * We don't know which tab will be elected leader, and messages are
     * dispatched before initialization, so we must store them.
     */
    let execsBeforeDbInit: ReadonlyArray<SqliteChannelMessageExec> = [];

    type ResolvePromise = (result: SqliteExecResult) => void;
    const resolvePromises = new Map<NanoId, ResolvePromise>();

    const maybeResolveExecResult = (
      result: SqliteChannelMessageResult,
    ): void => {
      const resolvePromise = resolvePromises.get(result.id);
      if (resolvePromise == null) return;
      resolvePromises.delete(result.id);
      resolvePromise(result.result);
    };

    /** Handle incoming messages for a tab without initialized DB. */
    channel.onMessage = (message): void => {
      switch (message._tag) {
        case "exec": {
          execsBeforeDbInit = [...execsBeforeDbInit, message];
          break;
        }
        case "execResult": {
          /** Remove already handled exec so the other tabs will not process it. */
          execsBeforeDbInit = ReadonlyArray.filter(
            execsBeforeDbInit,
            (m) => m.id !== message.id,
          );
          maybeResolveExecResult(message);
          break;
        }
        default:
          Function.absurd(message);
      }
    };

    const initDb = (): void => {
      sqlite3InitModule().then((sqlite3) =>
        sqlite3
          .installOpfsSAHPoolVfs({
            // TODO: Use name to allow Evolu apps co-exist in the same HTTP origin.
          })
          .then((poolUtil) => {
            const sqlite = new poolUtil.OpfsSAHPoolDb("/evolu1");

            const exec = (sqliteQuery: SqliteQuery, id: NanoId): void => {
              // console.log(sqliteQuery);
              // TODO: Try
              const rows = sqlite.exec(sqliteQuery.sql, {
                returnValue: "resultRows",
                rowMode: "object",
                bind: valuesToSqliteValues(sqliteQuery.parameters),
              }) as SqliteRow[];
              maybeParseJson(rows);
              const result = { rows, changes: sqlite.changes() };
              // For the race conditions testing
              // setTimeout(() => {
              channel.postMessage({ _tag: "execResult", id, result });
              // }, 100);
            };

            channel.onMessage = (message): void => {
              switch (message._tag) {
                /** A tab was elected so it can start processing. */
                case "exec":
                  exec(message.query, message.id);
                  break;
                case "execResult":
                  maybeResolveExecResult(message);
                  break;
                default:
                  Function.absurd(message);
              }
            };

            /** Handle execs arrived before Db was initialized. */
            execsBeforeDbInit.forEach((message) => {
              exec(message.query, message.id);
            });
            execsBeforeDbInit = [];
          }),
      );
    };

    navigator.locks.request(
      "sqliteFilename", // TODO: filename
      () =>
        /**
         * This promise prevents other tabs from acquiring the lock because it's
         * never resolved or rejected. The next SQLite instance is created when
         * the previous lock is released (a tab is reloaded or closed).
         */
        new Promise(initDb),
    );

    return Sqlite.of({
      exec: (arg) =>
        Effect.gen(function* (_) {
          const id = yield* _(nanoIdGenerator.nanoid);
          const promise = new Promise<SqliteExecResult>((resolve) => {
            resolvePromises.set(id, resolve);
          });
          const query = ensureSqliteQuery(arg);
          channel.postMessage({ _tag: "exec", id, query });
          return yield* _(Effect.promise(() => promise));
        }),
    });
  }),
);
