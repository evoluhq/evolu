import {
  bytesToHex,
  createPreparedStatementsCache,
  type CreateSqliteDriver,
  lazyVoid,
  ok,
  type SqliteRow,
} from "@evolu/common";
import { open, type PreparedStatement } from "@op-engineering/op-sqlite";

export const createOpSqliteDriver: CreateSqliteDriver =
  (name, options) => () => {
    // https://op-engineering.github.io/op-sqlite/docs/configuration#in-memory
    using stack = new DisposableStack();
    const db = stack.adopt(
      open(
        options?.mode === "memory"
          ? { name: `inMemoryDb`, location: ":memory:" }
          : {
              name: `evolu1-${name}.db`,
              ...(options?.mode === "encrypted" && {
                encryptionKey: `x'${bytesToHex(options.encryptionKey)}'`,
              }),
            },
      ),
      (db) => {
        db.close();
      },
    );

    const cache = stack.use(
      createPreparedStatementsCache<PreparedStatement>(
        (sql) => db.prepareStatement(sql),
        // op-sqlite doesn't have API for that
        lazyVoid,
      ),
    );

    const moved = stack.move();

    return ok({
      exec: (query) => {
        const prepared = cache.get(query);

        if (prepared) {
          prepared.bindSync(query.parameters);
        }

        const { rows, rowsAffected } = db.executeSync(
          query.sql,
          query.parameters,
        );
        return { rows: rows as Array<SqliteRow>, changes: rowsAffected };
      },

      // FIXME: op-sqlite does not expose binary, but a path to the database file
      // another react native dependency would be needed to implement this
      export: () => {
        throw new Error("TODO: Not implemented yet");
      },

      [Symbol.dispose]: () => {
        moved.dispose();
      },
    });
  };
