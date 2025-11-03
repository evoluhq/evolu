import { assert } from "../../src/Assert.js";
import { DbSchema, getDbSchema } from "../../src/Evolu/Schema.js";
import { CrdtMessage, DbChange } from "../../src/Evolu/Storage.js";
import { createTimestamp, Millis } from "../../src/Evolu/Timestamp.js";
import { sql, SqliteDep } from "../../src/Sqlite.js";
import { Id } from "../../src/Type.js";

export interface DbSnapshot {
  readonly schema: DbSchema;
  readonly tables: Array<{
    name: string;
    rows: ReadonlyArray<Record<string, string | number | Uint8Array | null>>;
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

export const createTestCrdtMessage = (
  id: Id,
  millis: number,
  name: string,
): CrdtMessage => ({
  timestamp: createTimestamp({
    millis: Millis.orThrow(millis),
    counter: 0 as never,
  }),
  change: DbChange.orThrow({ table: "testTable", id, values: { name } }),
});
