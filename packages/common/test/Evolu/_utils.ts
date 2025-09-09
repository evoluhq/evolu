import { assert } from "../../src/Assert.js";
import { DbSchema, getDbSchema } from "../../src/Evolu/Schema.js";
import { sql, SqliteDep } from "../../src/Sqlite.js";

export interface DbSnapshot {
  readonly schema: DbSchema;
  readonly tables: Array<{
    name: string;
    rows: ReadonlyArray<Record<string, string | number | null>>;
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

    // Process rows to make snapshots more readable
    const processedRows = result.value.rows.map((row) => {
      const processedRow: Record<string, string | number | null> = {};
      for (const [key, value] of Object.entries(row)) {
        if (value == null) {
          processedRow[key] = null;
        } else if (value instanceof Uint8Array) {
          // Prefix Uint8Array with type info
          processedRow[key] = `uint8:[${Array.from(value).join()}]`;
        } else if (Array.isArray(value)) {
          // Prefix regular arrays with type info
          processedRow[key] = `array:[${value.join()}]`;
        } else {
          processedRow[key] = value;
        }
      }
      return processedRow;
    });

    tables.push({
      name: table.name,
      rows: processedRows,
    });
  }

  return { schema: schema.value, tables };
};
