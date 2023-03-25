import * as S from "@effect/schema/Schema";
import { readonlyArray, readonlyRecord } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { commonColumns, TableDefinition } from "./types.js";

export const dbSchemaToTableDefinitions = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbSchema: S.Schema<any, any>
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
