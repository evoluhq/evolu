import {
  bytesToHex,
  createPreparedStatementsCache,
  ok,
  type CreateSqliteDriver,
  type SqliteRow,
} from "@evolu/common";
import {
  deleteDatabaseSync,
  openDatabaseSync,
  type SQLiteBindValue,
  type SQLiteStatement,
} from "expo-sqlite";

export const createExpoSqliteDriver: CreateSqliteDriver =
  (name, options) => () => {
    const databaseName = `evolu1-${name}.db`;
    using disposer = new DisposableStack();
    // expo-sqlite reuses an open connection with the same path and options,
    // and every memory database has the path ":memory:", so without a new
    // connection, memory databases would share one database.
    const db = disposer.adopt(
      options?.mode === "memory"
        ? openDatabaseSync(":memory:", { useNewConnection: true })
        : openDatabaseSync(databaseName),
      (db) => {
        db.closeSync();
      },
    );
    if (options?.mode === "encrypted") {
      // Plain SQLite ignores PRAGMA key and would store the database
      // unencrypted, and it returns no row for this SQLCipher pragma.
      if (db.getFirstSync("PRAGMA cipher_version") == null) {
        throw new Error(
          `Evolu can't encrypt the database because expo-sqlite was built without SQLCipher. Add ["expo-sqlite", { "useSQLCipher": true }] to the plugins in your app config and run npx expo prebuild --clean, or, in an app that doesn't run Expo's prebuild, set expo.sqlite.useSQLCipher=true in android/gradle.properties and "expo.sqlite.useSQLCipher": "true" in ios/Podfile.properties.json and run pod install in the ios directory, then rebuild the native app.`,
        );
      }
      db.execSync(`PRAGMA key = "x'${bytesToHex(options.encryptionKey)}'"`);
    }

    const cache = disposer.use(
      createPreparedStatementsCache<SQLiteStatement>(
        (sql) => db.prepareSync(sql),
        (statement) => {
          statement.finalizeSync();
        },
      ),
    );

    const disposables = disposer.move();

    return ok({
      exec: (query) => {
        const execStatement = (statement: SQLiteStatement) => {
          // Expo only reads the array, but its parameter type is mutable.
          const result = statement.executeSync(
            query.parameters as Array<SQLiteBindValue>,
          );
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

      iterate: (query, onRow) => {
        // A statement of its own, because onRow can run queries, which could
        // otherwise reuse the cached one while it is stepped.
        const statement = db.prepareSync(query.sql);
        try {
          // expo-sqlite's executeSync result steps once more after the last row
          // when a query returns none, and SQLite then runs the statement again,
          // so a statement without result columns, as a write is, would run
          // twice, and an empty SELECT scans twice.
          // https://github.com/expo/expo/pull/51425
          if (statement.getColumnNamesSync().length === 0)
            throw new Error(
              "SqliteDriver.iterate needs a query that returns rows.",
            );
          // Expo only reads the array, but its parameter type is mutable.
          const rows = statement.executeSync<SqliteRow>(
            query.parameters as Array<SQLiteBindValue>,
          );
          for (const row of rows) if (!onRow(row)) break;
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

      deleteDatabase: () => {
        using deleteDisposer = new DisposableStack();
        if (options?.mode !== "memory") {
          deleteDisposer.defer(() => {
            deleteDatabaseSync(databaseName);
          });
        }
        deleteDisposer.use(disposables);
      },

      [Symbol.dispose]: () => {
        disposables.dispose();
      },
    });
  };
