import { assert } from "../../src/Assert.js";
import { DbSchema, getDbSchema } from "../../src/Evolu/Schema.js";
import { sql, SqliteDep, SqliteRow } from "../../src/Sqlite.js";

export interface DbSnapshot {
  readonly schema: DbSchema;
  readonly tables: Array<{
    name: string;
    rows: ReadonlyArray<SqliteRow>;
  }>;
}

export const getDbSnapshot = (deps: SqliteDep): DbSnapshot => {
  const schema = getDbSchema(deps)({ allIndexes: true });
  assert(schema.ok, "bug");

  const tables = [];

  for (const table of schema.value.tables) {
    const result = deps.sqlite.exec(sql`
      select * from ${sql.identifier(table.name)};
    `);
    assert(result.ok, "bug");

    tables.push({
      name: table.name,
      rows: result.value.rows,
    });
  }

  return { schema: schema.value, tables };
};
