import {
  constVoid,
  createPreparedStatementsCache,
  ok,
  type CreateSqliteDriver,
  type SqliteRow,
} from "@evolu/common";
import BetterSQLite, { type Statement } from "better-sqlite3";
import { rmSync } from "fs";

export const createBetterSqliteDriver: CreateSqliteDriver =
  (name, options) => () => {
    const filename = options?.mode === "memory" ? ":memory:" : `${name}.db`;
    const filenamesToDelete =
      options?.mode === "memory"
        ? []
        : [
            filename,
            `${filename}-shm`,
            `${filename}-wal`,
            `${filename}-journal`,
          ];
    using disposer = new DisposableStack();
    const db = disposer.adopt(new BetterSQLite(filename), (db) => {
      db.close();
    });

    const cache = disposer.use(
      createPreparedStatementsCache<Statement>(
        (sql) => db.prepare(sql),
        // Not needed.
        // https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#class-statement
        constVoid,
      ),
    );

    const selectChanges = db.prepare("select changes()").pluck();

    const disposables = disposer.move();

    return ok({
      exec: (query) => {
        // Always prepare is recommended for better-sqlite3
        const prepared = cache.get(query, true);

        if (prepared.reader) {
          const rows = prepared.all(query.parameters) as Array<SqliteRow>;
          // A write with a returning clause returns rows too. A read keeps the
          // count of the previous write, so it reports zero instead.
          const changes = prepared.readonly
            ? 0
            : (selectChanges.get() as number);
          return { rows, changes };
        }

        const changes = prepared.run(query.parameters).changes;
        return { rows: [], changes };
      },

      iterate: (query, onRow) => {
        // A statement of its own, because onRow can run queries, which could
        // otherwise reuse the cached one while it is busy. Leaving the loop,
        // also by a throw, resets it.
        for (const row of db.prepare(query.sql).iterate(query.parameters)) {
          if (!onRow(row as SqliteRow)) break;
        }
      },

      export: () => {
        const file = db.serialize();
        const { buffer } = file;

        if (buffer instanceof ArrayBuffer) {
          return new Uint8Array(buffer, file.byteOffset, file.byteLength);
        }

        // Ensure export uses transferable ArrayBuffer backing.
        return new Uint8Array(file);
      },

      deleteDatabase: () => {
        using deleteDisposer = new DisposableStack();
        for (const filename of filenamesToDelete) {
          deleteDisposer.defer(() => {
            rmSync(filename, { force: true });
          });
        }
        deleteDisposer.use(disposables);
      },

      [Symbol.dispose]: () => {
        disposables.dispose();
      },
    });
  };
