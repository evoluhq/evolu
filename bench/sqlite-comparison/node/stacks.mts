/**
 * The Node.js stacks. Each runs in a child process of its own, which creates it
 * with {@link createNodeStack}; the runner reads only
 * {@link createNodeStackDefinitions}, so it loads none of the libraries.
 *
 * Every plain stack opens files on SQLite's default unix VFS, Evolu's too, as
 * its binding opens a file without a key. Evolu's encrypted stack opens them
 * through Evolu's codec. Evolu's stacks load `@evolu/nodejs`'s addon through
 * its loader, which also sets the `cache_size` of every file connection.
 *
 * @module
 */
import { emptyPrototype } from "@evolu/common";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { loadNativeSqlite } from "../../../packages/nodejs/src/NativeSqlite.ts";
import { createEvoluApi, createEvoluBenchKey } from "../evolu.mts";
import type { BenchStack, BenchSyncApi, BenchValue } from "../run.mts";
import type { StackInfo } from "../rounds.mts";

export type NodeStackId =
  "evolu" | "evoluEncrypted" | "betterSqlite3" | "nodeSqlite";

export interface NodeStackDefinition extends StackInfo {
  readonly id: NodeStackId;
}

const require = createRequire(import.meta.url);

const readPackageVersion = (name: string): string =>
  (
    JSON.parse(
      readFileSync(require.resolve(`${name}/package.json`), "utf8"),
    ) as { readonly version: string }
  ).version;

/** The stacks, in the order of the summary's columns, with `evolu` first. */
export const createNodeStackDefinitions =
  (): ReadonlyArray<NodeStackDefinition> => [
    {
      id: "evolu",
      label: "Evolu",
      library: "Evolu's SQLite",
      binding: "Node-API (@evolu/nodejs), unix VFS",
      encrypted: false,
    },
    {
      id: "evoluEncrypted",
      label: "Evolu, encrypted",
      library: "Evolu's SQLite",
      binding: "Node-API (@evolu/nodejs), Evolu's codec",
      encrypted: true,
    },
    {
      id: "betterSqlite3",
      label: "better-sqlite3",
      library: `better-sqlite3 ${readPackageVersion("better-sqlite3")}`,
      binding: "Node-API (node-addon-api), unix VFS",
      encrypted: false,
    },
    {
      id: "nodeSqlite",
      label: "node:sqlite",
      library: `node:sqlite, Node.js ${process.versions.node}`,
      binding: "built into Node.js, unix VFS",
      encrypted: false,
    },
  ];

/** The stack the verdict compares Evolu's with: what the relay used before. */
export const nodeReferenceStackId: NodeStackId = "betterSqlite3";

/** Creates a stack that keeps its databases in the directory. */
export const createNodeStack = async (
  id: NodeStackId,
  directory: string,
): Promise<BenchStack> => {
  mkdirSync(directory, { recursive: true });
  const pathOf = (name: string) => join(directory, name);
  const files = {
    readFile: (name: string) =>
      Promise.resolve(new Uint8Array(readFileSync(pathOf(name)))),
    deleteDatabase: (name: string) => {
      for (const suffix of ["", "-journal", "-wal", "-shm"])
        rmSync(`${pathOf(name)}${suffix}`, { force: true });
      return Promise.resolve();
    },
    dispose: () => Promise.resolve(),
  };

  switch (id) {
    case "evolu":
    case "evoluEncrypted": {
      // As @evolu/nodejs's driver loads it.
      const binding = loadNativeSqlite({ rowPrototype: emptyPrototype });
      const key = createEvoluBenchKey();
      return {
        ...files,
        openDatabase: (name) => {
          const database =
            id === "evolu"
              ? binding.openFile(pathOf(name))
              : binding.openEncryptedFile(pathOf(name), key);
          return Promise.resolve({
            api: createEvoluApi(database),
            close: () => {
              database.close();
              return Promise.resolve();
            },
          });
        },
      };
    }
    case "betterSqlite3": {
      const { default: Database } = await import("better-sqlite3");
      return {
        ...files,
        openDatabase: (name) => {
          const database = new Database(pathOf(name));
          const api: BenchSyncApi = {
            type: "Sync",
            runOnce: (sql) => {
              database.exec(sql);
            },
            selectValue: (sql) => database.prepare(sql).pluck().get() ?? null,
            prepare: (sql) => {
              const statement = database.prepare<Array<BenchValue>>(sql);
              return {
                run: (parameters) => {
                  statement.run(...parameters);
                },
                get: (parameters) => statement.get(...parameters),
                all: (parameters) => statement.all(...parameters),
                // better-sqlite3 finalizes a statement once it's garbage
                // collected.
                finalize: () => undefined,
              };
            },
          };
          return Promise.resolve({
            api,
            close: () => {
              database.close();
              return Promise.resolve();
            },
          });
        },
      };
    }
    case "nodeSqlite": {
      const { DatabaseSync } = await import("node:sqlite");
      return {
        ...files,
        openDatabase: (name) => {
          const database = new DatabaseSync(pathOf(name));
          const api: BenchSyncApi = {
            type: "Sync",
            runOnce: (sql) => {
              database.exec(sql);
            },
            selectValue: (sql) => {
              const statement = database.prepare(sql);
              statement.setReturnArrays(true);
              const row = statement.get() as ReadonlyArray<unknown> | undefined;
              return row?.[0] ?? null;
            },
            prepare: (sql) => {
              const statement = database.prepare(sql);
              return {
                run: (parameters) => {
                  statement.run(...parameters);
                },
                get: (parameters) => statement.get(...parameters),
                all: (parameters) => statement.all(...parameters),
                // node:sqlite finalizes a statement once it's garbage
                // collected or its database closes.
                finalize: () => undefined,
              };
            },
          };
          return Promise.resolve({
            api,
            close: () => {
              database.close();
              return Promise.resolve();
            },
          });
        },
      };
    }
  }
};
