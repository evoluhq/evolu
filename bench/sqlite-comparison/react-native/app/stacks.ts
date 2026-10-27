/**
 * The React Native stacks, in one app: expo-sqlite without SQLCipher, op-sqlite
 * with its defaults, and `@evolu/react-native` without and with a key. Their
 * SQLites don't clash: expo-sqlite renames its symbols to `exsqlite3_`, Evolu's
 * to `evolu_`, and op-sqlite keeps SQLite's own.
 *
 * Every stack keeps its databases in a directory of its own under the app's
 * documents, and expo-file-system reads and deletes their files.
 *
 * @module
 */
import { open } from "@op-engineering/op-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { openDatabaseSync } from "expo-sqlite";
import { loadNativeSqlite } from "../../../../packages/react-native/src/sqlite/Loader.ts";
import { createEvoluApi, createEvoluBenchKey } from "../../evolu.mts";
import type { BenchStack, BenchSyncApi, BenchValue } from "../../run.mts";
import type { ReactNativeStackId } from "../protocol.mts";

export const createReactNativeStack = (id: ReactNativeStackId): BenchStack => {
  const directory = new Directory(Paths.document, "sqlite-comparison", id);
  // A session cut short leaves its databases.
  if (directory.exists) directory.delete();
  directory.create({ intermediates: true });
  // The libraries take paths, not file URLs.
  const directoryPath = decodeURIComponent(
    directory.uri.replace(/^file:\/\//u, ""),
  ).replace(/\/$/u, "");
  const pathOf = (name: string) => `${directoryPath}/${name}`;
  const files = {
    readFile: (name: string) =>
      Promise.resolve(new File(directory, name).bytesSync()),
    deleteDatabase: (name: string) => {
      for (const suffix of ["", "-journal", "-wal", "-shm"]) {
        const file = new File(directory, `${name}${suffix}`);
        if (file.exists) file.delete();
      }
      return Promise.resolve();
    },
    dispose: () => {
      directory.delete();
      return Promise.resolve();
    },
  };

  switch (id) {
    case "evolu":
    case "evoluEncrypted": {
      const binding = loadNativeSqlite();
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
    case "expoSqlite":
      return {
        ...files,
        openDatabase: (name) => {
          const database = openDatabaseSync(name, {}, directoryPath);
          const api: BenchSyncApi = {
            type: "Sync",
            runOnce: (sql) => {
              database.execSync(sql);
            },
            selectValue: (sql) => {
              const row = database.getFirstSync<Record<string, unknown>>(sql);
              return row == null ? null : (Object.values(row)[0] ?? null);
            },
            prepare: (sql) => {
              const statement = database.prepareSync(sql);
              // It only reads the array.
              const execute = (parameters: ReadonlyArray<BenchValue>) =>
                statement.executeSync<unknown>(parameters as Array<BenchValue>);
              return {
                run: (parameters) => {
                  execute(parameters);
                },
                get: (parameters) =>
                  execute(parameters).getFirstSync() ?? undefined,
                all: (parameters) => execute(parameters).getAllSync(),
                finalize: () => {
                  statement.finalizeSync();
                },
              };
            },
          };
          return Promise.resolve({
            api,
            close: () => {
              database.closeSync();
              return Promise.resolve();
            },
          });
        },
      };
    case "opSqlite":
      return {
        ...files,
        openDatabase: (name) => {
          const database = open({ name, location: directoryPath });
          const api: BenchSyncApi = {
            type: "Sync",
            runOnce: (sql) => {
              database.executeSync(sql);
            },
            selectValue: (sql) => {
              const [row] = database.executeSync(sql).rows;
              return row == null ? null : (Object.values(row)[0] ?? null);
            },
            prepare: (sql) => {
              const statement = database.prepareStatement(sql);
              // It only reads the array.
              const execute = (parameters: ReadonlyArray<BenchValue>) => {
                statement.bindSync(parameters as Array<BenchValue>);
                return statement.executeSync();
              };
              return {
                run: (parameters) => {
                  execute(parameters);
                },
                get: (parameters) => execute(parameters).rows[0],
                all: (parameters) => execute(parameters).rows,
                // op-sqlite finalizes a statement once it's garbage collected
                // or its database closes.
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
};
