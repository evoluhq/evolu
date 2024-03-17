import {
  Config,
  NanoId,
  NanoIdGenerator,
  Sqlite,
  SqliteExecResult,
  SqliteQuery,
  SqliteRow,
  UnexpectedError,
  makeUnexpectedError,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import sqlite3InitModule, { SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Layer from "effect/Layer";
import * as ReadonlyArray from "effect/ReadonlyArray";
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

type SqliteChannelMessage = MessageExec | MessageExecSuccess | MessageExecError;

type MessageExec = {
  readonly _tag: "Exec";
  readonly id: NanoId;
  readonly query: SqliteQuery;
};

type MessageExecSuccess = {
  readonly _tag: "ExecSuccess";
  readonly id: NanoId;
  readonly result: SqliteExecResult;
};

type MessageExecError = {
  readonly _tag: "ExecError";
  readonly id: NanoId;
  readonly error: UnexpectedError;
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

// https://github.com/sqlite/sqlite-wasm/issues/62
// @ts-expect-error Missing types.
globalThis.sqlite3ApiConfig = {
  warn: Function.constVoid,
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
    let execsBeforeSqliteInit: ReadonlyArray<MessageExec> = [];

    const promiseResolves = new Map<
      NanoId,
      (message: MessageExecSuccess | MessageExecError) => void
    >();

    const maybeResolvePromise = (
      message: MessageExecSuccess | MessageExecError,
    ): void => {
      const resolve = promiseResolves.get(message.id);
      if (resolve == null) return;
      promiseResolves.delete(message.id);
      resolve(message);
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
          /** Remove already handled exec so the other tabs will not process it. */
          execsBeforeSqliteInit = ReadonlyArray.filter(
            execsBeforeSqliteInit,
            (m) => m.id !== message.id,
          );
          maybeResolvePromise(message);
          break;
        }
        default:
          Function.absurd(message);
      }
    };

    const initSqlite = (poolUtil: SAHPoolUtil): void => {
      const sqlite = new poolUtil.OpfsSAHPoolDb("/evolu1.db");

      const exec = (sqliteQuery: SqliteQuery, id: NanoId): void => {
        // TODO: Add debugSql config option.
        // console.log(sqliteQuery.sql);
        try {
          const rows = sqlite.exec(sqliteQuery.sql, {
            returnValue: "resultRows",
            rowMode: "object",
            bind: valuesToSqliteValues(sqliteQuery.parameters || []),
          }) as SqliteRow[];
          maybeParseJson(rows);
          const result = { rows, changes: sqlite.changes() };
          channel.postMessage({ _tag: "ExecSuccess", id, result });
        } catch (error) {
          // console.log(sqliteQuery);
          channel.postMessage({
            _tag: "ExecError",
            id,
            error: makeUnexpectedError(error).pipe(Effect.runSync),
          });
        }
      };

      channel.onMessage = (message): void => {
        switch (message._tag) {
          /** A tab was elected so it can start processing. */
          case "Exec":
            exec(message.query, message.id);
            break;
          case "ExecSuccess":
          case "ExecError":
            maybeResolvePromise(message);
            break;
          default:
            Function.absurd(message);
        }
      };

      /** Handle execs arrived before Sqlite was initialized. */
      execsBeforeSqliteInit.forEach((message) => {
        exec(message.query, message.id);
      });
      execsBeforeSqliteInit = [];
    };

    const lockName = yield* _(multitenantLockName("Sqlite"));
    const { name } = yield* _(Config);

    navigator.locks.request(
      lockName,
      () =>
        /**
         * This promise prevents other tabs from acquiring the lock because it's
         * never resolved or rejected. The next SQLite instance is created when
         * the previous lock is released (a tab is reloaded or closed).
         */
        new Promise((): void => {
          sqlite3InitModule().then((sqlite3) =>
            sqlite3.installOpfsSAHPoolVfs({ name }).then(initSqlite),
          );
        }),
    );

    return Sqlite.of({
      exec: (query) =>
        Effect.gen(function* (_) {
          const id = yield* _(nanoIdGenerator.nanoid);
          const promise = new Promise<MessageExecSuccess | MessageExecError>(
            (resolve) => {
              promiseResolves.set(id, resolve);
            },
          );

          channel.postMessage({ _tag: "Exec", id, query });

          return yield* _(
            Effect.promise(() => promise),
            Effect.map((message) => {
              if (message._tag === "ExecSuccess") return message.result;
              // This throw will be caught as UnexpectedError.
              throw new Error(message.error.error.message);
            }),
          );
        }),
    });
  }),
);
