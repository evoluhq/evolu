import { readonlyArray, readonlyRecord } from "fp-ts";
import { flow } from "fp-ts/lib/function.js";
import { commonColumns, DbSchema, TableDefinition } from "./types.js";

// Zod is not transferable. new fp-ts/schema will be
export const dbSchemaToTableDefinitions: (
  dbSchema: DbSchema
) => readonly TableDefinition[] = flow(
  readonlyRecord.toEntries,
  readonlyArray.map(
    ([name, columns]): TableDefinition => ({
      name,
      columns: Object.keys(columns)
        .filter((c) => c !== "id")
        .concat(commonColumns),
    })
  )
);
