import {
  bytesToHex,
  createPreparedStatementsCache,
  ok,
  type CreateSqliteDriver,
  type SqliteRow,
} from "@evolu/common";
import { openDatabaseSync, SQLiteStatement } from "expo-sqlite";

export const createExpoSqliteDriver: CreateSqliteDriver =
  (name, options) => () => {
    const db = openDatabaseSync(
      options?.mode === "memory" ? ":memory:" : `evolu1-${name}.db`,
    );
    if (options?.mode === "encrypted") {
      db.execSync(`PRAGMA key = '${bytesToHex(options.encryptionKey)}'`);
    }
    let isDisposed = false;

    const cache = createPreparedStatementsCache<SQLiteStatement>(
      (sql) => db.prepareSync(sql),
      (statement) => {
        statement.finalizeSync();
      },
    );

    return ok({
      exec: (query) => {
        const prepared = cache.get(query);

        if (prepared) {
          const result = prepared.executeSync(query.parameters);
          const rows = result.getAllSync();
          const changes = result.changes;
          result.resetSync();
          return { rows: rows as Array<SqliteRow>, changes };
        }

        const result = db.runSync(query.sql, query.parameters);
        const rows = db.getAllSync(query.sql, query.parameters);
        return { rows: rows as Array<SqliteRow>, changes: result.changes };
      },

      export: () => {
        const file = db.serializeSync();
        const { buffer } = file;

        if (buffer instanceof ArrayBuffer) {
          return new Uint8Array(buffer, file.byteOffset, file.byteLength);
        }

        // Ensure export uses transferable ArrayBuffer backing.
        return new Uint8Array(file);
      },

      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        cache[Symbol.dispose]();
        db.closeSync();
      },
    });
  };
