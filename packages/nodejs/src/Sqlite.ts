import {
  disposable,
  ok,
  type CreateSqliteDriver,
  type SqliteDriverStatement,
  type SqliteExecResult,
  type SqliteQueryParameters,
  type SqliteRow,
} from "@evolu/common";
import BetterSQLite, { type Statement } from "better-sqlite3";
import { rmSync } from "fs";

/**
 * A {@link CreateSqliteDriver} on better-sqlite3, which the Evolu Relay uses. It
 * stores a database in the file `<name>.db`, relative to the working directory,
 * and doesn't encrypt it: in the `encrypted` mode, it ignores the key and
 * stores the same plain file. In the `memory` mode, it stores no file.
 */
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

    const selectChanges = db.prepare("select changes()").pluck();

    const execStatement = (
      statement: Statement,
      parameters: SqliteQueryParameters,
    ): SqliteExecResult => {
      if (statement.reader) {
        const rows = statement.all(parameters) as Array<SqliteRow>;
        // A write with a returning clause returns rows too. A read keeps the
        // count of the previous write, so it reports zero instead.
        const changes = statement.readonly
          ? 0
          : (selectChanges.get() as number);
        return { rows, changes };
      }

      const changes = statement.run(parameters).changes;
      return { rows: [], changes };
    };

    const disposables = disposer.move();

    return ok({
      exec: (query) => execStatement(db.prepare(query.sql), query.parameters),

      prepare: (sql) => {
        // better-sqlite3 has no finalize: it finalizes a statement once it's
        // garbage-collected, so disposing drops the reference, which a held
        // disposed statement would otherwise keep.
        // https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#class-statement
        let statement: Statement | null = db.prepare(sql);
        using statementDisposer = new DisposableStack();
        statementDisposer.defer(() => {
          statement = null;
        });
        return disposable<SqliteDriverStatement>(
          {
            // A disposed statement throws before it runs.
            exec: (parameters) =>
              execStatement(statement as Statement, parameters),
          },
          statementDisposer,
        );
      },

      iterate: (query, onRow) => {
        // A statement of its own, because onRow can run other statements, the
        // prepared ones among them. Leaving the loop, also by a throw, resets
        // it.
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
