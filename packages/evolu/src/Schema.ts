import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import { ReadonlyArray, ReadonlyRecord, pipe } from "effect";
import { Id, SqliteBoolean, SqliteDate } from "./Branded.js";
import { Row, Table } from "./Db.js";
import { Owner } from "./Owner.js";

/**
 * Schema defines database schema.
 */
export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;

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

// https://github.com/Effect-TS/schema/releases/tag/v0.18.0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getPropertySignatures = <I extends { [K in keyof A]: any }, A>(
  schema: S.Schema<I, A>
): { [K in keyof A]: S.Schema<I[K], A[K]> } => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<PropertyKey, S.Schema<any>> = {};
  const propertySignatures = AST.getPropertySignatures(schema.ast);
  for (let i = 0; i < propertySignatures.length; i++) {
    const propertySignature = propertySignatures[i];
    out[propertySignature.name] = make(propertySignature.type);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  return out as any;
};

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
