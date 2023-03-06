import * as S from "@effect/schema";
import { Schema } from "@effect/schema";
import { readonlyArray, readonlyRecord } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { commonColumns, DbSchema, TableDefinition } from "./types.js";

export const dbSchemaToTableDefinitions = <T extends DbSchema>(
  dbSchema: Schema<T>
): readonly TableDefinition[] =>
  pipe(
    S.getPropertySignatures(dbSchema),
    readonlyRecord.toEntries,
    readonlyArray.map(
      ([name, schema]): TableDefinition => ({
        name,
        columns: Object.keys(S.getPropertySignatures(schema)).concat(
          commonColumns
        ),
      })
    )
  );
