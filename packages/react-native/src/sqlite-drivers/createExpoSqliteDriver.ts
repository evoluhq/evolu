import {
  bytesToHex,
  createPreparedStatementsCache,
  CreateSqliteDriver,
  SqliteDriver,
  SqliteRow,
} from "@evolu/common";
import { openDatabaseSync, SQLiteStatement } from "expo-sqlite";

export const createExpoSqliteDriver: CreateSqliteDriver = (name, options) => {
  const db = openDatabaseSync(
    options?.memory ? ":memory:" : `evolu1-${name}.db`,
  );
  if (options?.encryptionKey) {
    db.execSync(`
      PRAGMA cipher = 'sqlcipher';
      PRAGMA legacy = 4;
      PRAGMA key = "x'${bytesToHex(options.encryptionKey)}'";
    `);
  }
  let isDisposed = false;

  const cache = createPreparedStatementsCache<SQLiteStatement>(
    (sql) => db.prepareSync(sql),
    (statement) => {
      statement.finalizeSync();
    },
  );

  const driver: SqliteDriver = {
    exec: (query, isMutation) => {
      const prepared = cache.get(query);

      if (prepared) {
        if (isMutation) {
          const { changes } = prepared.executeSync(query.parameters);
          return { rows: [], changes };
        }

        const result = prepared.executeSync(query.parameters);
        const rows = result.getAllSync();
        result.resetSync();
        return { rows: rows as Array<SqliteRow>, changes: 0 };
      }

      if (isMutation) {
        const { changes } = db.runSync(query.sql, query.parameters);
        return { rows: [], changes };
      }

      const rows = db.getAllSync(query.sql, query.parameters);
      return { rows: rows as Array<SqliteRow>, changes: 0 };
    },

    export: () => db.serializeSync(),

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      cache[Symbol.dispose]();
      db.closeSync();
    },
  };

  return Promise.resolve(driver);
};
