import * as S from "@effect/schema/Schema";
import { ReadonlyArray, ReadonlyRecord, pipe } from "effect";
import { Id, SqliteBoolean, SqliteDate } from "./Branded.js";
import { Row } from "./Db.js";
import { Owner } from "./Owner.js";
import { getPropertySignatures } from "./utils.js";

/**
 * Schema defines database schema.
 */
export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;

interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: Owner["id"];
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

// TODO: Enforce via CommonColumns.
export const commonColumns = [
  "createdAt",
  "createdBy",
  "updatedAt",
  "isDeleted",
];

export const schemaToTables = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: S.Schema<any, any>
): ReadonlyArray<Table> =>
  pipe(
    getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)).concat(
          commonColumns
        ),
      })
    )
  );
