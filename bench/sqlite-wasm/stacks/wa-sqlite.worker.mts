/**
 * Wa-sqlite's synchronous build with one of its example OPFS VFSes, from the
 * clone the runner serves.
 *
 * Options:
 *
 * - `vfs`: `AccessHandlePoolVFS`, a pool of sync access handles in one directory,
 *   the design of opfs-sahpool, or `OPFSCoopSyncVFS`, one OPFS file per SQLite
 *   file with access handles passed between connections.
 *
 * Only `OPFSCoopSyncVFS` files can be read, from OPFS after closing.
 *
 * @module
 */

import { serveBenchStack } from "../worker.mts";

/** The part of wa-sqlite's `sqlite-api.js` API the benchmark uses. */
interface WaSqliteApi {
  readonly vfs_register: (vfs: WaSqliteVfs, makeDefault: boolean) => number;
  readonly open_v2: (filename: string) => Promise<number>;
  readonly exec: (
    db: number,
    sql: string,
    callback?: (row: ReadonlyArray<unknown>) => void,
  ) => Promise<number>;
  readonly close: (db: number) => Promise<number>;
}

/** A wa-sqlite VFS, which also has the `j` methods of its `FacadeVFS`. */
interface WaSqliteVfs {
  readonly close: () => void | Promise<void>;
  readonly jDelete: (filename: string, syncDir: number) => number;
}

interface WaSqliteVfsClass {
  readonly create: (name: string, module: unknown) => Promise<WaSqliteVfs>;
}

/**
 * Imports a module of the clone. The specifier is computed, so the runner's
 * Vite server serves the file as it is.
 */
const importWaSqlite = <T,>(url: string, path: string): Promise<T> =>
  import(
    /* @vite-ignore */
    `${url}${path}`
  ) as Promise<T>;

serveBenchStack(
  async ({ directory, options: { vfs: vfsName }, waSqliteUrl }) => {
    if (vfsName !== "AccessHandlePoolVFS" && vfsName !== "OPFSCoopSyncVFS")
      throw new Error(`Unknown wa-sqlite VFS: ${vfsName}`);

    const [{ default: createModule }, { Factory }, vfsModule] =
      await Promise.all([
        importWaSqlite<{ readonly default: () => Promise<unknown> }>(
          waSqliteUrl,
          "dist/wa-sqlite.mjs",
        ),
        importWaSqlite<{
          readonly Factory: (module: unknown) => WaSqliteApi;
        }>(waSqliteUrl, "src/sqlite-api.js"),
        importWaSqlite<Readonly<Record<string, WaSqliteVfsClass | undefined>>>(
          waSqliteUrl,
          `src/examples/${vfsName}.js`,
        ),
      ]);
    const module = await createModule();
    const sqlite3 = Factory(module);
    const vfsClass = vfsModule[vfsName];
    if (vfsClass == null) throw new Error(`wa-sqlite has no ${vfsName}.`);
    // AccessHandlePoolVFS keeps its pool in the directory named after the VFS.
    // OPFSCoopSyncVFS keeps each file at its path, so databases are opened in
    // the directory.
    const vfs = await vfsClass.create(
      vfsName === "AccessHandlePoolVFS" ? directory : `bench-${directory}`,
      module,
    );
    sqlite3.vfs_register(vfs, true);
    const pathOf = (name: string) =>
      vfsName === "AccessHandlePoolVFS" ? `/${name}` : `/${directory}/${name}`;

    const getDirectoryHandle = async () => {
      let directoryHandle = await navigator.storage.getDirectory();
      for (const part of directory.split("/"))
        directoryHandle = await directoryHandle.getDirectoryHandle(part);
      return directoryHandle;
    };

    return {
      openDatabase: async (name) => {
        const db = await sqlite3.open_v2(pathOf(name));
        return {
          exec: async (sql) => {
            await sqlite3.exec(db, sql);
          },
          selectValue: async (sql) => {
            let value: unknown = null;
            let isFirstRow = true;
            await sqlite3.exec(db, sql, (row) => {
              if (isFirstRow) value = row[0];
              isFirstRow = false;
            });
            return value;
          },
          close: async () => {
            await sqlite3.close(db);
          },
        };
      },
      // Closing the database releases its access handles.
      readFile: async (name) => {
        if (vfsName === "AccessHandlePoolVFS") return null;
        const fileHandle = await (
          await getDirectoryHandle()
        ).getFileHandle(name);
        return new Uint8Array(await (await fileHandle.getFile()).arrayBuffer());
      },
      deleteDatabase: async (name) => {
        if (vfsName === "AccessHandlePoolVFS") {
          vfs.jDelete(pathOf(name), 0);
          return;
        }
        const directoryHandle = await getDirectoryHandle();
        for (const suffix of ["", "-journal", "-wal"])
          await directoryHandle
            .removeEntry(`${name}${suffix}`)
            .catch((error: unknown) => {
              if (!(
                error instanceof DOMException && error.name === "NotFoundError"
              ))
                throw error;
            });
      },
      dispose: async () => {
        await vfs.close();
      },
    };
  },
);
