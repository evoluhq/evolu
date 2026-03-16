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
    const stack = new globalThis.DisposableStack();
    const db = stack.adopt(
      openDatabaseSync(
        options?.mode === "memory" ? ":memory:" : `evolu1-${name}.db`,
      ),
      (db) => {
        db.closeSync();
      },
    );
    if (options?.mode === "encrypted") {
      db.execSync(`PRAGMA key = "x'${bytesToHex(options.encryptionKey)}'"`);
    }

    const cache = stack.use(
      createPreparedStatementsCache<SQLiteStatement>(
        (sql) => db.prepareSync(sql),
        (statement) => {
          statement.finalizeSync();
        },
      ),
    );

    return ok({
      exec: (query) => {
        const execStatement = (statement: SQLiteStatement) => {
          const result = statement.executeSync(query.parameters);
          try {
            const rows = result.getAllSync();
            const changes = result.changes;
            return { rows: rows as Array<SqliteRow>, changes };
          } finally {
            result.resetSync();
          }
        };

        const prepared = cache.get(query);
        if (prepared) return execStatement(prepared);

        const statement = db.prepareSync(query.sql);
        try {
          return execStatement(statement);
        } finally {
          statement.finalizeSync();
        }
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
        stack.dispose();
      },
    });
  };
