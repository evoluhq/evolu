import { ok, Result } from "../Result.js";
import {
  SafeSql,
  sql,
  SqliteDep,
  SqliteError,
  SqliteQuery,
} from "../Sqlite.js";
import { array, object, String } from "../Type.js";
import { Base64Url256 } from "./Protocol.js";

export const DbTable = object({
  name: Base64Url256,
  columns: array(Base64Url256),
});
export type DbTable = typeof DbTable.Type;

export const DbIndex = object({ name: String, sql: String });
export type DbIndex = typeof DbIndex.Type;

export const DbSchema = object({
  tables: array(DbTable),
  indexes: array(DbIndex),
});
export type DbSchema = typeof DbSchema.Type;

/** Get the current database schema by reading SQLite metadata. */
export const getDbSchema =
  (deps: SqliteDep) =>
  ({ allIndexes = false }: { allIndexes?: boolean } = {}): Result<
    DbSchema,
    SqliteError
  > => {
    const map = new Map<Base64Url256, Array<Base64Url256>>();

    const tableAndColumnInfoRows = deps.sqlite.exec(sql`
      select
        sqlite_master.name as tableName,
        table_info.name as columnName
      from
        sqlite_master
        join pragma_table_info(sqlite_master.name) as table_info;
    `);

    if (!tableAndColumnInfoRows.ok) return tableAndColumnInfoRows;

    tableAndColumnInfoRows.value.rows.forEach((row) => {
      const { tableName, columnName } = row as unknown as {
        tableName: Base64Url256;
        columnName: Base64Url256;
      };
      if (!map.has(tableName)) map.set(tableName, []);
      map.get(tableName)?.push(columnName);
    });

    const tables = Array.from(map, ([name, columns]) => ({ name, columns }));

    const indexesRows = deps.sqlite.exec(
      allIndexes
        ? sql`
            select name, sql
            from sqlite_master
            where type = 'index' and name not like 'sqlite_%';
          `
        : sql`
            select name, sql
            from sqlite_master
            where
              type = 'index'
              and name not like 'sqlite_%'
              and name not like 'evolu_%';
          `,
    );

    if (!indexesRows.ok) return indexesRows;

    const indexes = indexesRows.value.rows.map(
      (row): DbIndex => ({
        name: row.name as string,
        /**
         * SQLite returns "CREATE INDEX" for "create index" for some reason.
         * Other keywords remain unchanged. We have to normalize the casing for
         * {@link indexesAreEqual} manually.
         */
        sql: (row.sql as string)
          .replace("CREATE INDEX", "create index")
          .replace("CREATE UNIQUE INDEX", "create unique index"),
      }),
    );

    return ok({ tables, indexes });
  };

const indexesAreEqual = (self: DbIndex, that: DbIndex): boolean =>
  self.name === that.name && self.sql === that.sql;

export const ensureDbSchema =
  (deps: SqliteDep) =>
  (
    newSchema: DbSchema,
    currentSchema: DbSchema,
    options?: { ignoreIndexes: boolean },
  ): Result<void, SqliteError> => {
    const queries: Array<SqliteQuery> = [];

    newSchema.tables.forEach((newTable) => {
      const currentTable = currentSchema.tables.find(
        (t) => t.name === newTable.name,
      );
      if (!currentTable) {
        queries.push({
          sql: createTableWithDefaultColumns(newTable.name, newTable.columns),
          parameters: [],
        });
      } else {
        newTable.columns
          .filter((newColumn) => !currentTable.columns.includes(newColumn))
          .forEach((newColumn) => {
            queries.push(sql`
              alter table ${sql.identifier(newTable.name)}
              add column ${sql.identifier(newColumn)} blob;
            `);
          });
      }
    });

    if (options?.ignoreIndexes !== true) {
      // Remove current indexes that are not in the newSchema.
      currentSchema.indexes
        .filter(
          (currentIndex) =>
            !newSchema.indexes.some((newIndex) =>
              indexesAreEqual(newIndex, currentIndex),
            ),
        )
        .forEach((index) => {
          queries.push(sql`drop index ${sql.identifier(index.name)};`);
        });

      // Add new indexes that are not in the currentSchema.
      newSchema.indexes
        .filter(
          (newIndex) =>
            !currentSchema.indexes.some((currentIndex) =>
              indexesAreEqual(newIndex, currentIndex),
            ),
        )
        .forEach((newIndex) => {
          queries.push({ sql: `${newIndex.sql};` as SafeSql, parameters: [] });
        });
    }

    for (const query of queries) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }
    return ok();
  };

const createTableWithDefaultColumns = (
  tableName: string,
  columns: ReadonlyArray<string>,
): SafeSql =>
  `
    create table ${sql.identifier(tableName).sql} (
      "id" text primary key,
      ${columns
        // Add default columns.
        .concat(["createdAt", "updatedAt", "isDeleted"])
        .filter((c) => c !== "id")
        // "A column with affinity BLOB does not prefer one storage class over another
        // and no attempt is made to coerce data from one storage class into another."
        // https://www.sqlite.org/datatype3.html
        .map((name) => `${sql.identifier(name).sql} blob`)
        .join(", ")}
    );
  ` as SafeSql;
