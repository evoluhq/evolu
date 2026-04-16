import {
  createPreparedStatementsCache,
  lazyVoid,
  ok,
  type CreateSqliteDriver,
  type SqliteRow,
} from "@evolu/common";
import BetterSQLite, { type Statement } from "better-sqlite3";

export const createBetterSqliteDriver: CreateSqliteDriver =
  (name, options) => () => {
    const filename = options?.mode === "memory" ? ":memory:" : `${name}.db`;
    using disposer = new DisposableStack();
    const db = disposer.adopt(new BetterSQLite(filename), (db) => {
      db.close();
    });

    const cache = disposer.use(
      createPreparedStatementsCache<Statement>(
        (sql) => db.prepare(sql),
        // Not needed.
        // https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#class-statement
        lazyVoid,
      ),
    );

    const disposables = disposer.move();

    return ok({
      exec: (query) => {
        // Always prepare is recommended for better-sqlite3
        const prepared = cache.get(query, true);

        if (prepared.reader) {
          const rows = prepared.all(query.parameters) as Array<SqliteRow>;
          return { rows, changes: 0 };
        }

        const changes = prepared.run(query.parameters).changes;
        return { rows: [], changes };
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

      [Symbol.dispose]: () => {
        disposables.dispose();
      },
    });
  };
