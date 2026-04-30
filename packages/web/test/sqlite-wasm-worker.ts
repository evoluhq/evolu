import { createUnknownError } from "@evolu/common";
import sqlite3InitModule from "@evolu/sqlite-wasm";

const workerScope = globalThis as never as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};

workerScope.onmessage = (e: MessageEvent) => {
  void (async () => {
    const cmd = e.data as
      | {
          readonly type: "deleteSahPoolFile";
          readonly filename: string;
          readonly vfsName: string;
        }
      | {
          readonly type: "deleteSahPoolUriFile";
          readonly databaseFilename: string;
          readonly sahPoolFilename: string;
          readonly vfsName: string;
        };

    try {
      const sqlite3 = await sqlite3InitModule();
      const pool = await sqlite3.installOpfsSAHPoolVfs({
        name: cmd.vfsName,
      });

      if (cmd.type === "deleteSahPoolUriFile") {
        const db = new pool.OpfsSAHPoolDb(cmd.databaseFilename);
        db.exec(`
          CREATE TABLE t (data TEXT);
          INSERT INTO t (data) VALUES ('delete-me');
        `);
        db.close();

        const beforeDeleteFileNames = pool.getFileNames();
        const deletedWithDatabaseFilename = pool.unlink(cmd.databaseFilename);
        const afterDatabaseFilenameDeleteFileNames = pool.getFileNames();
        const deletedWithSahPoolFilename = pool.unlink(cmd.sahPoolFilename);
        const afterDeleteFileNames = pool.getFileNames();

        const reopenedDb = new pool.OpfsSAHPoolDb(cmd.databaseFilename);
        let selectAfterDeleteSucceeded = false;
        try {
          reopenedDb.exec("SELECT data FROM t");
          selectAfterDeleteSucceeded = true;
        } catch {
          selectAfterDeleteSucceeded = false;
        } finally {
          reopenedDb.close();
          pool.unlink(cmd.sahPoolFilename);
        }

        workerScope.postMessage({
          ok: true,
          data: {
            afterDatabaseFilenameDeleteFileNames,
            afterDeleteFileNames,
            beforeDeleteFileNames,
            deletedWithDatabaseFilename,
            deletedWithSahPoolFilename,
            selectAfterDeleteSucceeded,
          },
        });
        return;
      }

      const db = new pool.OpfsSAHPoolDb(cmd.filename);
      db.exec(`
        CREATE TABLE t (data TEXT);
        INSERT INTO t (data) VALUES ('delete-me');
      `);
      db.close();

      const beforeDeleteFileNames = pool.getFileNames();
      const deleted = pool.unlink(cmd.filename);
      const afterDeleteFileNames = pool.getFileNames();

      const reopenedDb = new pool.OpfsSAHPoolDb(cmd.filename);
      let selectAfterDeleteSucceeded = false;
      try {
        reopenedDb.exec("SELECT data FROM t");
        selectAfterDeleteSucceeded = true;
      } catch {
        selectAfterDeleteSucceeded = false;
      } finally {
        reopenedDb.close();
        pool.unlink(cmd.filename);
      }

      workerScope.postMessage({
        ok: true,
        data: {
          afterDeleteFileNames,
          beforeDeleteFileNames,
          deleted,
          selectAfterDeleteSucceeded,
        },
      });
    } catch (err) {
      workerScope.postMessage({
        ok: false,
        error: createUnknownError(err),
      });
    }
  })();
};
