import {
  createPreparedStatementsCache,
  lazyVoid,
  ok,
  type CreateSqliteDriver,
  type SqliteDriver,
  type SqliteRow,
} from "@evolu/common";
import BetterSQLite, { type Statement } from "better-sqlite3";

export const createBetterSqliteDriver: CreateSqliteDriver =
  (name, options) => () => {
    const filename = options?.mode === "memory" ? ":memory:" : `${name}.db`;
    const db = new BetterSQLite(filename);
    let isDisposed = false;

    const cache = createPreparedStatementsCache<Statement>(
      (sql) => db.prepare(sql),
      // Not needed.
      // https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#class-statement
      lazyVoid,
    );

    const driver: SqliteDriver = {
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

      export: () => db.serialize(),

      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        cache[Symbol.dispose]();
        db.close();
      },
    };

    return ok(driver);
  };
