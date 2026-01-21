import {
  bytesToHex,
  createPreparedStatementsCache,
  type CreateSqliteDriver,
  isSqlMutation,
  lazyVoid,
  type SqliteDriver,
  type SqliteRow,
} from "@evolu/common";
import { open, type PreparedStatement } from "@op-engineering/op-sqlite";

export const createOpSqliteDriver: CreateSqliteDriver = (name, options) => {
  // https://op-engineering.github.io/op-sqlite/docs/configuration#in-memory
  const db = open(
    options?.memory
      ? { name: `inMemoryDb`, location: ":memory:" }
      : {
          name: `evolu1-${name}.db`,
          ...(options?.encryptionKey && {
            encryptionKey: `x'${bytesToHex(options.encryptionKey)}'`,
          }),
        },
  );
  let isDisposed = false;

  const cache = createPreparedStatementsCache<PreparedStatement>(
    (sql) => db.prepareStatement(sql),
    // op-sqlite doesn't have API for that
    lazyVoid,
  );

  const driver: SqliteDriver = {
    exec: (query, isMutation) => {
      const prepared = cache.get(query);

      if (prepared) {
        prepared.bindSync(query.parameters);
        if (isSqlMutation(query.sql)) {
          let changes = 0;
          const { rowsAffected } = db.executeSync(query.sql, query.parameters);
          changes += rowsAffected;
          return { rows: [], changes };
        }
        const { rows } = db.executeSync(query.sql, query.parameters);
        return { rows: rows as Array<SqliteRow>, changes: 0 };
      }

      if (isMutation) {
        let changes = 0;
        const { rowsAffected } = db.executeSync(query.sql, query.parameters);
        changes += rowsAffected;
        return { rows: [], changes };
      }

      const { rows } = db.executeSync(query.sql, query.parameters);
      return { rows: rows as Array<SqliteRow>, changes: 0 };
    },

    // FIXME: op-sqlite does not expose binary, but a path to the database file
    // another react native dependency would be needed to implement this
    export: () => {
      throw new Error("TODO: Not implemented yet");
    },

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      cache[Symbol.dispose]();
      db.close();
    },
  };

  return Promise.resolve(driver);
};
