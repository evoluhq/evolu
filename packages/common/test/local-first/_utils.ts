import { DbSchema, getDbSchema } from "../../src/local-first/Schema.js";
import type { CrdtMessage } from "../../src/local-first/Storage.js";
import { DbChange } from "../../src/local-first/Storage.js";
import { createTimestamp } from "../../src/local-first/Timestamp.js";
import type { SqliteDep } from "../../src/Sqlite.js";
import { sql } from "../../src/Sqlite.js";
import { Millis } from "../../src/Time.js";
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

  const tables = [];

  for (const tableName in schema.tables) {
    const result = deps.sqlite.exec(sql`
      select * from ${sql.identifier(tableName)};
    `);

    tables.push({
      name: tableName,
      rows: result.rows,
    });
  }

  return { schema, tables };
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
  change: DbChange.orThrow({
    table: "testTable",
    id,
    values: { name },
    isInsert: true,
    isDelete: false,
  }),
});
